import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import type { AuthenticatedRequestContext } from "@/lib/supabase/server";
import type { BodyMeasurement } from "./body-measurement-types";
import { BODY_MEASUREMENT_MAX_PAGES, listAllBodyMeasurements, listBodyMeasurements } from "./body-measurements";
import { buildBodyProgressReport } from "./progress/body";
import { resolveProgressPeriod } from "./progress/analytics";

const uuid = (n: number) => `93670000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const dateAt = (day: number) => new Date(Date.UTC(2022, 0, 1 + day)).toISOString().slice(0, 10);
function row(n: number, measuredOn: string, patch: Partial<BodyMeasurement> = {}): BodyMeasurement & { user_id: string } {
  return { id: uuid(n), user_id: "user-1", measured_on: measuredOn, waist_cm: 80 + (n % 10) / 10, abdomen_cm: null, chest_cm: null, arm_cm: null, arm_right_cm: null, arm_left_cm: null,
    thigh_cm: null, thigh_right_cm: null, thigh_left_cm: null, calf_right_cm: null, calf_left_cm: null, hip_cm: null, condition: null, notes: null, legacy_import_source: null,
    legacy_import_id: null, import_run_id: null, quality_status: "verified", quality_note: null, source_payload: null, created_at: "", updated_at: "", ...patch };
}

/**
 * body_measurements as PostgREST serves it: owner filter, the keyset `or` of the loader, two orders, limit, and a server
 * row cap that may be below the page size. It parses the filter it receives, so a malformed cursor would not match.
 */
function table(rows: readonly ReturnType<typeof row>[], cap = Infinity) {
  const requests: { or: string | null; orders: string[]; limit: number }[] = [];
  const supabase = {
    from: () => {
      const state = { user: "", or: null as string | null, orders: [] as { column: string; ascending: boolean }[], limit: Infinity };
      const builder = {
        select: () => builder,
        eq: (_column: string, value: string) => { state.user = value; return builder; },
        or: (filter: string) => { state.or = filter; return builder; },
        order: (column: string, options: { ascending: boolean }) => { state.orders.push({ column, ascending: options.ascending }); return builder; },
        limit: (value: number) => { state.limit = value; return builder; },
        then: (resolve: (value: { data: BodyMeasurement[]; error: null }) => unknown) => {
          requests.push({ or: state.or, orders: state.orders.map(o => `${o.column}:${o.ascending ? "asc" : "desc"}`), limit: state.limit });
          const match = state.or ? /^measured_on\.gt\.(\d{4}-\d{2}-\d{2}),and\(measured_on\.eq\.\1,id\.gt\.([0-9a-f-]{36})\)$/.exec(state.or) : null;
          if (state.or && !match) throw new Error(`unexpected filter ${state.or}`);
          const after = (r: BodyMeasurement) => !match || r.measured_on > match[1]! || (r.measured_on === match[1] && r.id > match[2]!);
          const compare = (a: BodyMeasurement, b: BodyMeasurement) => {
            for (const { column, ascending } of state.orders) {
              const left = String(a[column as keyof BodyMeasurement]), right = String(b[column as keyof BodyMeasurement]);
              if (left !== right) return (ascending ? 1 : -1) * left.localeCompare(right);
            }
            return 0;
          };
          const data = rows.filter(r => r.user_id === state.user && after(r)).sort(compare).slice(0, Math.min(state.limit, cap));
          return Promise.resolve({ data, error: null }).then(resolve);
        },
      };
      return builder;
    },
  };
  return { context: { supabase, userId: "user-1" } as unknown as AuthenticatedRequestContext, requests };
}
const daily = (count: number) => [...Array.from({ length: count }, (_, day) => row(day, dateAt(day))), row(99999, dateAt(3), { user_id: "user-2" })];

describe("lectura completa de medidas corporales (#367)", () => {
  it("returns every measurement past 1000, the newest included, oldest first and without repeats", async () => {
    const { context, requests } = table(daily(2501));
    const rows = await listAllBodyMeasurements(context);
    expect(rows).toHaveLength(2501);
    expect(rows[0]!.measured_on).toBe(dateAt(0));
    expect(rows.at(-1)!.measured_on).toBe(dateAt(2500));
    expect(new Set(rows.map(r => r.id)).size).toBe(2501);
    expect(rows.every(r => r.user_id === "user-1")).toBe(true);
    // Keyset on date and id, both ascending; an empty page ends the read.
    expect(requests).toHaveLength(4);
    expect(requests[0]).toEqual({ or: null, orders: ["measured_on:asc", "id:asc"], limit: 1000 });
    expect(requests[1]!.or).toBe(`measured_on.gt.${dateAt(999)},and(measured_on.eq.${dateAt(999)},id.gt.${uuid(999)})`);
  });
  it("never skips or repeats rows that share a date, even across a page edge", async () => {
    // 1500 rows on 3 dates: every page boundary falls inside a repeated date.
    const rows = Array.from({ length: 1500 }, (_, n) => row(n, dateAt(Math.floor(n / 500))));
    const read = await listAllBodyMeasurements(table(rows, 333).context);
    expect(read).toHaveLength(1500);
    expect(new Set(read.map(r => r.id)).size).toBe(1500);
    expect(read.map(r => r.id)).toEqual([...rows].sort((a, b) => a.measured_on.localeCompare(b.measured_on) || a.id.localeCompare(b.id)).map(r => r.id));
  });
  it("is not ended early by a server cap below the page size", async () => {
    const read = await listAllBodyMeasurements(table(daily(1203), 500).context);
    expect(read).toHaveLength(1203);
    expect(read.at(-1)!.measured_on).toBe(dateAt(1202));
  });
  it("tells an empty history from a failure, and fails instead of truncating", async () => {
    await expect(listAllBodyMeasurements(table([]).context)).resolves.toEqual([]);
    await expect(listAllBodyMeasurements(table(daily(BODY_MEASUREMENT_MAX_PAGES + 1), 1).context)).rejects.toThrow("supera el máximo");
    // A failure on a later page is a failure: never the rows read so far.
    let calls = 0;
    const failing = { supabase: { from: () => { const b: Record<string, unknown> = {}; for (const m of ["select", "eq", "or", "order", "limit"]) b[m] = () => b;
      b.then = (resolve: (v: unknown) => unknown) => Promise.resolve(++calls === 1 ? { data: daily(1000).slice(0, 1000), error: null } : { data: null, error: { message: "timeout" } }).then(resolve); return b; } },
      userId: "user-1" } as unknown as AuthenticatedRequestContext;
    await expect(listAllBodyMeasurements(failing)).rejects.toThrow("Leer medidas corporales: timeout");
    expect(calls).toBe(2);
  });
  it("a window of the newest measurements keeps the newest, oldest first", async () => {
    const read = await listBodyMeasurements(3, table(daily(1500)).context);
    expect(read.map(r => r.measured_on)).toEqual([dateAt(1497), dateAt(1498), dateAt(1499)]);
  });
  it("the report of the newest period, past 1000 records, uses its own records, both limits and the previous period, and still leaves suspect ones out", async () => {
    // 2022-01-01 + 1460 days = 2025-12-31. One suspect row inside December stays out and is counted.
    const rows = [...daily(1461).filter(r => r.user_id === "user-1").map((r, day) => ({ ...r, waist_cm: 90 - day / 100 })),
      row(50000, "2025-12-15", { waist_cm: 10, quality_status: "suspect", quality_note: "Revisar" })]
      .filter(r => !(r.measured_on === "2025-12-15" && r.quality_status === "verified"));
    const measurements = await listAllBodyMeasurements(table(rows).context);
    const period = resolveProgressPeriod({ preset: "custom", from: "2025-12-01", to: "2025-12-31" }, "2025-12-31");
    const report = buildBodyProgressReport({ weightHistory: [], currentWeightKg: null, measurements, period: period.current, referencePeriod: period.previous });
    const waist = report.metrics.find(metric => metric.key === "body.waist")!;
    expect(waist.first!.date).toBe("2025-12-01");
    expect(waist.last!.date).toBe("2025-12-31");
    expect(waist.current).toHaveLength(30);
    expect(waist.current.some(o => o.value === 10)).toBe(false);
    expect(report.excludedSuspectCount).toBe(1);
    expect(waist.change).toBeCloseTo(-0.3);
    expect(waist.reference.length).toBeGreaterThan(0);
    expect(waist.referenceChange).not.toBeNull();
  });
});
