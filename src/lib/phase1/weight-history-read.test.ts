import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import type { AuthenticatedRequestContext } from "@/lib/supabase/server";
import { buildBodyProgressReport } from "../progress/body";
import { resolveProgressPeriod } from "../progress/analytics";
import type { WeightHistoryPoint } from "../weight-history";
import { WEIGHT_HISTORY_MAX_PAGES, listAllWeightHistory, listWeightHistory } from "./day-log";

type Row = WeightHistoryPoint & { user_id: string };
/**
 * day_logs as PostgREST serves it: filters, order and limit honoured, and a server row cap that may be lower than
 * what is asked for (Supabase's max_rows). Every request is recorded.
 */
function table(rows: readonly Row[], cap = Infinity) {
  const requests: { gt: string | null; ascending: boolean; limit: number }[] = [];
  const supabase = {
    from: () => {
      const state = { user: "", gt: null as string | null, ascending: true, limit: Infinity, nonNull: false };
      const builder = {
        select: () => builder,
        eq: (_column: string, value: string) => { state.user = value; return builder; },
        not: () => { state.nonNull = true; return builder; },
        gt: (_column: string, value: string) => { state.gt = value; return builder; },
        order: (_column: string, options: { ascending: boolean }) => { state.ascending = options.ascending; return builder; },
        limit: (value: number) => { state.limit = value; return builder; },
        then: (resolve: (value: { data: WeightHistoryPoint[]; error: null }) => unknown) => {
          requests.push({ gt: state.gt, ascending: state.ascending, limit: state.limit });
          const data = rows.filter(row => row.user_id === state.user && (!state.nonNull || row.weight_kg !== null) && (state.gt === null || row.log_date > state.gt))
            .sort((a, b) => (state.ascending ? 1 : -1) * a.log_date.localeCompare(b.log_date))
            .slice(0, Math.min(state.limit, cap)).map(row => ({ id: row.id, log_date: row.log_date, weight_kg: row.weight_kg }));
          return Promise.resolve({ data, error: null }).then(resolve);
        },
      };
      return builder;
    },
  };
  return { context: { supabase, userId: "user-1" } as unknown as AuthenticatedRequestContext, requests };
}
const dateAt = (day: number) => new Date(Date.UTC(2022, 0, 1 + day)).toISOString().slice(0, 10);
/** One weight a day, from 2022-01-01 on, plus another user's rows that must never come back. */
const history = (days: number, value = (day: number) => 80 + (day % 7) / 10): Row[] => [
  ...Array.from({ length: days }, (_, day) => ({ id: `d${day}`, user_id: "user-1", log_date: dateAt(day), weight_kg: value(day) })),
  { id: "other", user_id: "user-2", log_date: dateAt(days + 5), weight_kg: 70 },
];

describe("lectura completa del historial de peso (#367)", () => {
  it("returns every weight past 1000, the newest included, oldest first and without repeats", async () => {
    const { context, requests } = table(history(2501));
    const rows = await listAllWeightHistory(context);
    expect(rows).toHaveLength(2501);
    expect(rows[0]!.log_date).toBe(dateAt(0));
    expect(rows.at(-1)!.log_date).toBe(dateAt(2500));
    expect(new Set(rows.map(row => row.id)).size).toBe(2501);
    // Keyset by date: each page starts after the last date of the previous one, and an empty page ends the read.
    expect(requests.map(request => request.gt)).toEqual([null, dateAt(999), dateAt(1999), dateAt(2500)]);
  });
  it("is not ended early by a server cap below the page size", async () => {
    const { context } = table(history(1203), 500);
    const rows = await listAllWeightHistory(context);
    expect(rows).toHaveLength(1203);
    expect(rows.at(-1)!.log_date).toBe(dateAt(1202));
  });
  it("tells an empty history apart from a failure, and fails instead of truncating", async () => {
    await expect(listAllWeightHistory(table([]).context)).resolves.toEqual([]);
    await expect(listAllWeightHistory(table(history(WEIGHT_HISTORY_MAX_PAGES + 1), 1).context)).rejects.toThrow("supera el máximo");
    const failing = { supabase: { from: () => { const b: Record<string, unknown> = {}; for (const m of ["select", "eq", "not", "gt", "order", "limit"]) b[m] = () => b;
      b.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: null, error: { message: "timeout" } }).then(resolve); return b; } }, userId: "user-1" } as unknown as AuthenticatedRequestContext;
    await expect(listAllWeightHistory(failing)).rejects.toThrow("Leer historial de peso: timeout");
  });
  it("a window of the newest weights keeps the newest, oldest first", async () => {
    const rows = await listWeightHistory(3, table(history(1500)).context);
    expect(rows.map(row => row.log_date)).toEqual([dateAt(1497), dateAt(1498), dateAt(1499)]);
  });
  it("the report of the newest period, past 1000 weights, uses its own records and both period limits", async () => {
    // 2022-01-01 + 1460 days = 2025-12-31. The last month and the one before, edges included.
    const rows = await listAllWeightHistory(table(history(1461, day => 70 + day / 100)).context);
    const period = resolveProgressPeriod({ preset: "custom", from: "2025-12-01", to: "2025-12-31" }, "2025-12-31");
    const report = buildBodyProgressReport({ weightHistory: rows, currentWeightKg: null, measurements: [], period: period.current, referencePeriod: period.previous });
    const weight = report.metrics.find(metric => metric.key === "body.weight")!;
    expect(weight.first!.date).toBe("2025-12-01");
    expect(weight.last!.date).toBe("2025-12-31");
    expect(weight.current).toHaveLength(31);
    expect(weight.latest!.date).toBe("2025-12-31");
    expect(weight.change).toBeCloseTo(0.3);
    expect(weight.referenceChange).not.toBeNull();
  });
});
