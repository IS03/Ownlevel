import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "../../app/api/mobile/v1/progress/performance-insights/route";
import { parsePerformanceInsights } from "./performance-insights-contract";

const mocks = vi.hoisted(() => ({ auth: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("./supabase", () => ({ authenticateMobileAccessToken: mocks.auth }));

const USER = "93670000-0000-4000-8000-0000000000a1", EXERCISE = "93670000-0000-4000-8000-00000000000a", METRIC = "93670000-0000-4000-8000-0000000000aa";
const dateAt = (day: number) => new Date(Date.UTC(2026, 0, 1 + day)).toISOString().slice(0, 10);

type Call = { table: string; selected: string; filters: [string, ...unknown[]][]; range: [number, number] | null; limit: number | null };
/** Answers from in-memory tables and records each query: the assertions are about what is read, and how many times. */
function fakeSupabase(tables: Record<string, Record<string, unknown>[]>, revisionOf: (table: string, call: number) => string = () => "2026-01-01T00:00:00Z") {
  const calls: Call[] = [];
  const revisionCalls: Record<string, number> = {};
  const from = (table: string) => {
    const call: Call = { table, selected: "", filters: [], range: null, limit: null };
    const builder: Record<string, unknown> = {
      select(columns: string) { call.selected = columns; return builder; },
      eq(...args: unknown[]) { call.filters.push(["eq", ...args]); return builder; },
      is(...args: unknown[]) { call.filters.push(["is", ...args]); return builder; },
      in(...args: unknown[]) { call.filters.push(["in", ...args]); return builder; },
      order() { return builder; }, returns() { return builder; },
      range(start: number, end: number) { call.range = [start, end]; return builder; },
      limit(value: number) { call.limit = value; return builder; },
      then(resolve: (value: unknown) => void) {
        calls.push(call);
        const rows = tables[table] ?? [];
        if (call.limit !== null) {
          revisionCalls[table] = (revisionCalls[table] ?? 0) + 1;
          resolve({ data: [{ updated_at: revisionOf(table, revisionCalls[table]!) }], error: null, count: rows.length });
        } else resolve({ data: rows.slice(call.range![0], call.range![1] + 1), error: null, count: call.range![0] === 0 ? rows.length : null });
      },
    };
    return builder;
  };
  return { client: { from }, calls };
}
function tablesFor(days: number) {
  const reps = Array.from({ length: days }, (_, day) => 8 + (day % 2 ? 1 : -1) * (day % 5 + 1));
  return {
    workout_sessions: reps.map((_, day) => ({ id: `s${day}`, routine_id: "r", routine_name_snapshot: "Rutina", session_name: null, status: "completed", started_at: `${dateAt(day)}T18:00:00.000Z`, ended_at: `${dateAt(day)}T19:00:00.000Z`,
      energy_level: 3, performance_level: null, pain_level: null, day: { log_date: dateAt(day) } })),
    workout_session_exercises: reps.map((_, day) => ({ id: `e${day}`, workout_session_id: `s${day}`, exercise_id: EXERCISE, nombre_snapshot: "Press", implement_snapshot: "barra", weight_mode_snapshot: "Peso total", is_completed: true })),
    workout_sets: reps.map((value, day) => ({ id: `set${day}`, workout_session_exercise_id: `e${day}`, actual_reps: value, actual_weight_kg: "100.00", is_completed: true, completed_at: `${dateAt(day)}T18:10:00.000Z` })),
    workout_session_feelings: [],
    user_metrics: [{ id: METRIC, name: "Métrica", unit: null, value_type: "decimal", is_active: false, archived_at: "2026-02-01T00:00:00Z" }],
    daily_metric_values: reps.map((_, day) => ({ id: `v${day}`, metric_id: METRIC, metric_date: dateAt(day), value: String(day % 4) })),
    meal_entries: [{ id: "m", consumed_at: `${dateAt(0)}T16:00:00.000Z`, consumed_at_source: null, raw_input: null, entry_kind: "meal", source_type: "manual", import_run_id: null, final_calories: 500, final_protein_g: "30", final_carbs_g: null, final_fat_g: 5, day_logs: { log_date: dateAt(0) } }],
  };
}
const request = (query = "") => new NextRequest(`http://127.0.0.1/api/mobile/v1/progress/performance-insights${query}`, { headers: { authorization: "Bearer synthetic" } });

beforeEach(() => { mocks.auth.mockReset(); });
afterEach(() => { vi.useRealTimers(); });

describe("GET performance-insights", () => {
  it("reads the whole history through grouped streams, derives identity from the token and validates its own contract", async () => {
    const { client, calls } = fakeSupabase(tablesFor(30));
    mocks.auth.mockResolvedValue({ userId: USER, supabase: client });
    const response = await GET(request());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(parsePerformanceInsights(body)).toBeTruthy();
    expect(body.history.sessions).toBe(30); expect(body.metrics[0].archived).toBe(true);
    expect(body.view).toBe("summary"); expect(body.relations.strict.candidatesEvaluated).toBe(2 + 8 + 2 + 2);
    expect(body).not.toHaveProperty("associations");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    // 7 streams of one page each + 2 revision checks of 7 queries. Nothing per session, exercise or candidate.
    expect(calls).toHaveLength(7 + 14);
    expect(calls.some(call => call.filters.some(filter => filter[0] === "in"))).toBe(false);
    for (const call of calls.filter(row => row.table !== "workout_session_feelings")) expect(call.filters).toContainEqual(["eq", "user_id", USER]);
    expect(calls.filter(row => row.table === "workout_session_feelings").every(row => row.filters.some(filter => filter[1] === "session.user_id" && filter[2] === USER))).toBe(true);
    expect(calls.find(row => row.table === "meal_entries" && row.range)!.filters).toContainEqual(["is", "deleted_at", null]);
    expect(calls.find(row => row.table === "workout_sessions" && row.range)!.filters).toContainEqual(["eq", "status", "completed"]);
  });
  it("keeps the unknown configuration unknown: nothing is compared and nothing reaches the associations", async () => {
    mocks.auth.mockResolvedValue({ userId: USER, supabase: fakeSupabase(tablesFor(30)).client });
    const body = await (await GET(request())).json();
    expect(body.facts.totals).toMatchObject({ comparable: 0, insufficient: 30, total: 30, coverage: 0 });
    expect(body.exclusions.performance.missing_context).toBe(30);
    expect(body.history).toMatchObject({ sessions: 30, outcomeDays: 0 });
    expect(body.limits.configurationSnapshots).toEqual({ known: 0, total: 30 });
    expect(body.relations.strict).toEqual({ candidatesEvaluated: 14, outcomeDays: 0 });
    const relations = await (await GET(request("?view=relations"))).json();
    // A method without outcome days has no list to send, and says why instead of looking empty.
    expect(relations.strict).toMatchObject({ items: [], candidatesEvaluated: 14, outcomeDays: 0 });
  });
  describe("total query cost, retries included", () => {
    // Each stream of tablesFor(5) takes one page: P = 7, and a revision round is 7. A clean attempt is 7 + 7 + 7.
    const attempt = 14 + 7;
    const midnightAfter = (client: { from: (table: string) => unknown }, after: number) => {
      let started = 0;
      return { from(table: string) {
        if (++started >= after) vi.setSystemTime(new Date("2026-06-02T12:00:00Z"));
        return client.from(table);
      } };
    };
    it.each([
      ["steady sources", () => "same", null, 200, attempt],
      ["a source changes once: one retry", (table: string, call: number) => table === "workout_sets" && call > 1 ? "b" : "a", null, 200, 2 * attempt],
      ["sources keep changing: refused", (table: string, call: number) => table === "workout_sets" ? String(call) : "same", null, 503, 2 * attempt],
      ["Córdoba midnight during the read", () => "same", attempt - 1, 200, 2 * attempt],
      ["both retries: the worst case that still answers", (table: string, call: number) => table !== "workout_sets" || call === 1 ? "a" : call < 6 ? "b" : "c", 2 * attempt - 1, 200, 4 * attempt],
    ] as const)("%s", async (_name, revision, midnight, status, expected) => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
      vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-06-01T12:00:00Z") });
      const fake = fakeSupabase(tablesFor(5), revision);
      mocks.auth.mockResolvedValue({ userId: USER, supabase: midnight === null ? fake.client : midnightAfter(fake.client, midnight) });
      expect((await GET(request())).status).toBe(status);
      expect(fake.calls).toHaveLength(expected);
      warn.mockRestore();
    });
  });
  it("adds pages by rows and not by exercises, sessions or candidates", async () => {
    const small = fakeSupabase(tablesFor(1500));
    mocks.auth.mockResolvedValue({ userId: USER, supabase: small.client });
    expect((await GET(request("?limit=5"))).status).toBe(200);
    // Each of the four 1500-row streams takes 2 pages; the other three take one.
    expect(small.calls.filter(call => call.range)).toHaveLength(4 * 2 + 3);
  }, 60_000);
  it("retries once when a source changes during the read and then refuses to publish", async () => {
    const steady = (table: string, call: number) => table === "workout_sets" ? (call <= 1 ? "a" : "b") : "same";
    const once = fakeSupabase(tablesFor(5), steady);
    mocks.auth.mockResolvedValue({ userId: USER, supabase: once.client });
    expect((await GET(request())).status).toBe(200);
    expect(once.calls.filter(call => call.table === "workout_sets" && call.range)).toHaveLength(2);

    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const moving = fakeSupabase(tablesFor(5), (table, call) => table === "workout_sets" ? String(call) : "same");
    mocks.auth.mockResolvedValue({ userId: USER, supabase: moving.client });
    const response = await GET(request());
    expect(response.status).toBe(503); expect(await response.json()).toEqual({ error: "DATA_UNAVAILABLE" });
    expect(JSON.stringify(warn.mock.calls)).not.toContain("Press");
    warn.mockRestore();
  });
  it("fails as unavailable, not as an empty history, when a stream errors or holds an unreadable number", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const tables = tablesFor(3);
    const broken = fakeSupabase({ ...tables, workout_sets: tables.workout_sets.map(row => ({ ...row, actual_weight_kg: "not-a-number" })) });
    mocks.auth.mockResolvedValue({ userId: USER, supabase: broken.client });
    expect((await GET(request())).status).toBe(503);
    warn.mockRestore();
  });
  it("returns the pairs of one relation on request and validates its parameters", async () => {
    mocks.auth.mockResolvedValue({ userId: USER, supabase: fakeSupabase(tablesFor(25)).client });
    const id = `metric:${METRIC}:same_day`;
    const body = await (await GET(request(`?association=${encodeURIComponent(id)}`))).json();
    // Under the strict method the configuration is unknown, so it has a relation with no pairs.
    expect(body).toMatchObject({ view: "relation", lane: "strict", id, pairs: [] }); expect(body.item.state).toBe("insufficient_data");
    const partial = await (await GET(request(`?association=${encodeURIComponent(`partial:${id}`)}`))).json();
    expect(partial).toMatchObject({ view: "relation", lane: "partial" }); expect(partial.pairs.length).toBeGreaterThan(0);
    expect(await (await GET(request("?association=partial:metric:none:same_day"))).json()).toMatchObject({ item: null, pairs: null });
    for (const query of ["?limit=0", "?limit=121", "?before=2026-02-31", "?other=1", "?limit=1&limit=2", "?association=%3Cx%3E", "?view=all", "?view=complete", "?pairs=all", "?association=metric:x:same_day&pairs=some"]) {
      expect((await GET(request(query))).status, query).toBe(400);
    }
  }, 30_000);
  describe("identidad de cada lectura", () => {
    const parsed = async (query: string) => {
      const response = await GET(request(query));
      expect(response.status, query).toBe(200);
      const body = await response.json();
      expect(parsePerformanceInsights(body), query).toBeTruthy();
      return body;
    };
    it("reads the whole history for every view, because nothing can vouch for an earlier result", async () => {
      const fake = fakeSupabase(tablesFor(40));
      mocks.auth.mockResolvedValue({ userId: USER, supabase: fake.client });
      const first = await parsed("?limit=5");
      expect(fake.calls).toHaveLength(7 + 14);
      for (const query of ["?view=days&before=" + first.facts.page.nextBefore + "&limit=5", "?view=relations", `?association=${encodeURIComponent(`partial:metric:${METRIC}:same_day`)}`]) {
        const before = fake.calls.length;
        const body = await parsed(query);
        expect(fake.calls.length - before, query).toBe(7 + 14);
        expect(body.sourceRevision, query).toBe(first.sourceRevision);
      }
    }, 60_000);
    it("shows a change that leaves count and maximum exactly as they were, and gives it another identity", async () => {
      const tables = tablesFor(10);
      const fake = fakeSupabase(tables, () => "same");
      mocks.auth.mockResolvedValue({ userId: USER, supabase: fake.client });
      const first = await parsed("?limit=120");
      expect(first.facts.days.find((day: { date: string }) => day.date === dateAt(3)).context.metrics[0].value).toBe(3);
      tables.daily_metric_values[3]!.value = "2";
      const second = await parsed("?limit=120");
      expect(second.facts.days.find((day: { date: string }) => day.date === dateAt(3)).context.metrics[0].value).toBe(2);
      expect(second.sourceRevision).not.toBe(first.sourceRevision);
    });
    it("keeps every account apart", async () => {
      const mine = fakeSupabase(tablesFor(6));
      mocks.auth.mockResolvedValue({ userId: USER, supabase: mine.client });
      await parsed("");
      const other = fakeSupabase(tablesFor(2));
      mocks.auth.mockResolvedValue({ userId: "93670000-0000-4000-8000-0000000000b2", supabase: other.client });
      expect((await parsed("")).history.sessions).toBe(2);
    });
  });
  it("requires a token", async () => {
    const { MobileApiUnauthorizedError } = await import("./auth");
    mocks.auth.mockRejectedValue(new MobileApiUnauthorizedError());
    expect((await GET(request())).status).toBe(401);
  });
});
