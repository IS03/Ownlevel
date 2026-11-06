import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "../../app/api/mobile/v1/progress/performance-insights/route";
import { parsePerformanceInsights, type InsightsExerciseEvidence } from "./performance-insights-contract";
import { clearInsightsSnapshots, parseInsightsParams } from "./performance-insights-server";

const mocks = vi.hoisted(() => ({ auth: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("./supabase", () => ({ authenticateMobileAccessToken: mocks.auth }));

const USER = "93670000-0000-4000-8000-0000000000a1", EXERCISE = "93670000-0000-4000-8000-00000000000a", OTHER = "93670000-0000-4000-8000-00000000000b";
const uuid = (group: number, n: number) => `93670000-0000-4000-8${String(group).padStart(3, "0")}-${String(n).padStart(12, "0")}`;
const dateAt = (day: number) => new Date(Date.UTC(2026, 0, 1 + day)).toISOString().slice(0, 10);
type Row = Record<string, unknown>;
type Call = { table: string; selected: string; filters: unknown[][]; head: boolean };

/**
 * Exercise rows hold their session as PostgREST embeds it. Top-level and `session.*` filters apply, as in the database; each
 * embedded set list is cut at `cap`, and `set_count` counts the whole list.
 */
function fakeSupabase(rows: Row[], sets: Row[], revisionOf: (call: number) => number = () => 1, cap = Infinity) {
  const calls: Call[] = [];
  let revisions = 0;
  const from = (table: string) => {
    const call: Call = { table, selected: "", filters: [], head: false };
    let range: [number, number] = [0, 999];
    const builder: Record<string, unknown> = {
      select(columns: string, options?: { head?: boolean }) { call.selected = columns; call.head = !!options?.head; return builder; },
      eq(...args: unknown[]) { call.filters.push(["eq", ...args]); return builder; },
      in(...args: unknown[]) { call.filters.push(["in", ...args]); return builder; },
      order() { return builder; }, returns() { return builder; }, maybeSingle() { return builder; },
      range(start: number, end: number) { range = [start, end]; return builder; },
      then(resolve: (value: unknown) => void) {
        calls.push(call);
        if (table === "insights_source_revisions") { resolve({ data: { revision: revisionOf(++revisions) }, error: null }); return; }
        const matches = (row: Row) => call.filters.every(([kind, key, value]) => kind === "in" ? (value as unknown[]).includes(row[key as string])
          : String(key).startsWith("session.") ? (row.session as Row)[String(key).slice(8)] === value : String(key).includes(".") || row[key as string] === value);
        const own = (id: unknown) => sets.filter(set => set.workout_session_exercise_id === id);
        const strip = (set: Row) => Object.fromEntries(Object.entries(set).filter(([key]) => key !== "workout_session_exercise_id"));
        const found = (table === "workout_sets" ? sets : rows).filter(matches);
        const page = found.slice(range[0], range[1] + 1);
        resolve({ data: table === "workout_session_exercises" ? page.map(row => ({ ...row, sets: own(row.id).slice(0, cap).map(strip), set_count: [{ count: own(row.id).length }] })) : page,
          error: null, count: range[0] === 0 ? found.length : null });
      },
    };
    return builder;
  };
  return { client: { from }, calls };
}
/** Days of one exercise, plus another exercise and an unfinished session that the read must leave out. */
function exerciseHistory(days: number) {
  const rows: Row[] = [], sets: Row[] = [];
  for (let day = 0; day < days; day++) for (const [index, exercise] of [EXERCISE, OTHER].entries()) {
    const id = uuid(3, day * 2 + index), status = day === days - 1 && index === 1 ? "in_progress" : "completed";
    rows.push({ id, workout_session_id: uuid(2, day), exercise_id: exercise, user_id: USER, nombre_snapshot: "Press banca", implement_snapshot: "barra", weight_mode_snapshot: "Peso total", is_completed: true,
      configuration: { kind: "recorded", label: "Agarre medio" },
      session: { id: uuid(2, day), routine_id: null, status, started_at: `${dateAt(day)}T18:00:00.000Z`, ended_at: `${dateAt(day)}T19:00:00.000Z`, day: { log_date: dateAt(day) } } });
    for (let n = 0; n < 3; n++) sets.push({ id: uuid(4, (day * 2 + index) * 10 + n), workout_session_exercise_id: id, user_id: USER, actual_reps: 8 + (day % 3), actual_weight_kg: "80.00", is_completed: true, completed_at: `${dateAt(day)}T18:1${n}:00.000Z` });
  }
  return { rows, sets };
}
const request = (query: string) => new NextRequest(`http://127.0.0.1/api/mobile/v1/progress/performance-insights${query}`, { headers: { authorization: "Bearer synthetic" } });
const evidenceQuery = (session = uuid(2, 4), exercise = EXERCISE, lane = "strict") => `?method=2&view=evidence&session=${session}&exercise=${exercise}&lane=${lane}`;

beforeEach(() => { mocks.auth.mockReset(); clearInsightsSnapshots(); });

describe("#367 GET evidencia: una lectura acotada a la comparación elegida", () => {
  it("reads only the selected exercise's history, by token, under the counter, and answers in its own contract", async () => {
    const { rows, sets } = exerciseHistory(5);
    const fake = fakeSupabase(rows, sets);
    mocks.auth.mockResolvedValue({ userId: USER, supabase: fake.client });
    const response = await GET(request(evidenceQuery()));
    expect(response.status).toBe(200);
    const body = await response.json() as InsightsExerciseEvidence;
    expect(parsePerformanceInsights(body)?.view).toBe("evidence");
    expect(body.item).toMatchObject({ name: "Press banca", current: { sessionId: uuid(2, 4), date: dateAt(4) }, reference: { sessionId: uuid(2, 3), date: dateAt(3), ageDays: 0 } });
    expect(body.item!.current.sets).toHaveLength(3);
    // The counter, one page of this exercise's rows with their sets and sessions, the counter again. Nothing else of the history.
    expect(fake.calls.map(call => call.table)).toEqual(["insights_source_revisions", "workout_session_exercises", "insights_source_revisions"]);
    const page = fake.calls[1]!;
    expect(page.filters).toEqual(expect.arrayContaining([["eq", "user_id", USER], ["eq", "exercise_id", EXERCISE], ["eq", "session.status", "completed"], ["eq", "sets.user_id", USER], ["eq", "set_count.user_id", USER]]));
    expect(page.selected).toContain("set_count:workout_sets(count)");
    expect(page.selected).toContain("session:workout_sessions!inner(");
  });

  it("reads again, for the cut rows only, a set list PostgREST cut: never fewer sets", async () => {
    const { rows, sets } = exerciseHistory(4);
    const fake = fakeSupabase(rows, sets, () => 1, 2);
    mocks.auth.mockResolvedValue({ userId: USER, supabase: fake.client });
    const body = await (await GET(request(evidenceQuery(uuid(2, 3))))).json() as InsightsExerciseEvidence;
    expect(body.item!.current.sets).toHaveLength(3);
    expect(body.item!.reference!.sets).toHaveLength(3);
    const stream = fake.calls.filter(call => call.table === "workout_sets");
    expect(stream).toHaveLength(1);
    const owners = stream[0]!.filters.find(filter => filter[0] === "in")![2] as string[];
    expect(owners.sort()).toEqual(rows.filter(row => row.exercise_id === EXERCISE).map(row => row.id as string).sort());
  });

  it("retries once if the counter moves, then is unavailable instead of publishing a mixed read", async () => {
    const { rows, sets } = exerciseHistory(3);
    const once = fakeSupabase(rows, sets, call => call === 1 ? 1 : 2);
    mocks.auth.mockResolvedValue({ userId: USER, supabase: once.client });
    expect((await GET(request(evidenceQuery(uuid(2, 2))))).status).toBe(200);
    expect(once.calls.filter(call => call.table === "workout_session_exercises")).toHaveLength(2);
    const moving = fakeSupabase(rows, sets, call => call);
    mocks.auth.mockResolvedValue({ userId: USER, supabase: moving.client });
    const failed = await GET(request(evidenceQuery(uuid(2, 2))));
    expect(failed.status).toBe(503);
    expect(await failed.json()).toEqual({ error: "DATA_UNAVAILABLE" });
  });

  it("says absent, not empty, for a session that does not hold the exercise, and is the same answer for another account's ids", async () => {
    const { rows, sets } = exerciseHistory(3);
    mocks.auth.mockResolvedValue({ userId: USER, supabase: fakeSupabase(rows, sets).client });
    const body = await (await GET(request(evidenceQuery(uuid(2, 77))))).json() as InsightsExerciseEvidence;
    expect(body).toMatchObject({ view: "evidence", item: null });
    // Identity comes from the token: the read filters by its user, so another person's rows never arrive.
    mocks.auth.mockResolvedValue({ userId: "93670000-0000-4000-8000-0000000000b2", supabase: fakeSupabase(rows, sets).client });
    expect(await (await GET(request(evidenceQuery()))).json()).toMatchObject({ item: null });
  });

  it("validates the selection: whole, well formed and alone", () => {
    const params = (query: string) => () => parseInsightsParams(new URLSearchParams(query));
    expect(params(evidenceQuery().slice(1))()).toEqual({ view: "evidence", method: 2, selection: { sessionId: uuid(2, 4), exerciseId: EXERCISE, lane: "strict" } });
    expect(params(`view=evidence&session=${uuid(2, 4).toUpperCase()}&exercise=${EXERCISE}&lane=partial`)()).toMatchObject({ selection: { sessionId: uuid(2, 4), lane: "partial" } });
    for (const bad of [`view=evidence&session=x&exercise=${EXERCISE}&lane=strict`, `view=evidence&session=${uuid(2, 4)}&exercise=${EXERCISE}`, `view=evidence&session=${uuid(2, 4)}&exercise=${EXERCISE}&lane=both`,
      `view=evidence&session=${uuid(2, 4)}&lane=strict`, `session=${uuid(2, 4)}&exercise=${EXERCISE}&lane=strict`, `${evidenceQuery().slice(1)}&before=2026-01-01`, `${evidenceQuery().slice(1)}&lane=partial`])
      expect(params(bad)).toThrow();
  });

  it("requires a token", async () => {
    mocks.auth.mockRejectedValue(Object.assign(new Error("no"), { name: "MobileApiUnauthorizedError" }));
    const response = await GET(new NextRequest(`http://127.0.0.1/api/mobile/v1/progress/performance-insights${evidenceQuery()}`));
    expect(response.status).not.toBe(200);
  });
});
