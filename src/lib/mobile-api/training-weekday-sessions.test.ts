import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { MobileApiValidationError } from "./auth";
import type { MobileSupabaseAuthenticatedContext } from "./supabase";

const mocks = vi.hoisted(() => ({ readAuth: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("./supabase", () => ({ authenticateMobileAccessToken: mocks.readAuth, authenticateMobileMutationAccessToken: vi.fn() }));
import { readMobileTrainingDay, readMobileTrainingWeekdaySessions } from "./training-session-server";
import { GET as weekdaysGET } from "../../app/api/mobile/v1/training/history/weekdays/route";

const OWNER = "owner", TODAY = "2026-10-29"; // Thursday
type Row = Record<string, unknown> & { id: string; user_id: string };
const uuid = (prefix: number, n: number) => `${String(prefix).padStart(8, "0")}-0000-4000-8000-${String(n).padStart(12, "0")}`;
const shift = (date: string, days: number) => { const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };

/** Every day of 20 weeks, some with two sessions (same start: the id breaks the tie), plus what must never count. */
function tables() {
  const t: Record<string, Row[]> = { day_logs: [], workout_sessions: [], workout_session_exercises: [], workout_sets: [], routines: [] };
  let n = 0;
  const day = (date: string, user = OWNER) => {
    const found = t.day_logs.find(d => d.log_date === date && d.user_id === user);
    if (found) return found;
    const row = { id: uuid(1, n++), user_id: user, log_date: date }; t.day_logs.push(row); return row;
  };
  const session = (date: string, routine: string | null, status = "completed", { user = OWNER, hour = 10, ended = true } = {}) => {
    const s = { id: uuid(2, n++), user_id: user, day_log_id: day(date, user).id, status, routine_id: routine, routine_name_snapshot: routine ?? null,
      session_name: routine ? null : "Libre", started_at: `${date}T${String(hour).padStart(2, "0")}:00:00.000Z`,
      ended_at: status === "completed" && ended ? `${date}T${String(hour + 1).padStart(2, "0")}:00:00.000Z` : null, routine: null };
    t.workout_sessions.push(s);
    const ex = { id: uuid(3, n++), user_id: user, workout_session_id: s.id, is_completed: true, muscle_group_label_snapshot: null, grupo_muscular_snapshot: "pecho" };
    t.workout_session_exercises.push(ex);
    t.workout_sets.push({ id: uuid(4, n++), user_id: user, workout_session_exercise_id: ex.id, is_completed: true, actual_reps: 8, actual_weight_kg: 50 });
  };
  const routines = [uuid(9, 1), uuid(9, 2), uuid(9, 3)];
  for (let i = 0; i < 140; i += 1) {
    const date = shift(TODAY, -i);
    if (i % 3 !== 1) session(date, routines[i % 3], "completed", { hour: 8 });
    if (i % 7 === 0) { session(date, routines[(i / 7) % 3], "completed", { hour: 18 }); session(date, null, "completed", { hour: 18 }); }
    if (i % 5 === 0) session(date, routines[0], "discarded");
  }
  session(TODAY, routines[1], "in_progress");
  session(shift(TODAY, -14), routines[2], "completed", { ended: false });
  for (let i = 0; i < 100; i += 7) session(shift(TODAY, -i), routines[2], "completed", { user: "stranger", hour: 12 });
  return t;
}

/** PostgREST emulation for these reads: eq / in / not-null filters, order, limit, range, exact count; every query is logged. */
function fake(t: Record<string, Row[]>, maxRows = Infinity) {
  const queries: string[] = [];
  const client = {
    from(table: string) {
      const filters: ((row: Row) => boolean)[] = [];
      let orders: { column: string; ascending: boolean }[] = [], counted = false, limit = Infinity;
      const run = (from = 0, to = Infinity) => {
        queries.push(table);
        const rows = t[table].filter(row => filters.every(f => f(row))).sort((a, b) => {
          for (const o of orders) { const x = String(a[o.column] ?? ""), y = String(b[o.column] ?? ""); if (x !== y) return (x < y ? -1 : 1) * (o.ascending ? 1 : -1); }
          return 0;
        });
        const data = rows.slice(from, Math.min(to + 1, limit, from + maxRows));
        return Promise.resolve({ data, error: null, ...(counted ? { count: rows.length } : {}) });
      };
      const builder = {
        select(_columns: string, options?: { count?: string }) { counted = options?.count === "exact"; return builder; },
        eq(column: string, value: unknown) { filters.push(row => row[column] === value); return builder; },
        in(column: string, values: unknown[]) { filters.push(row => values.includes(row[column])); return builder; },
        not(column: string) { filters.push(row => row[column] !== null); return builder; },
        order(column: string, options: { ascending: boolean }) { orders = [...orders, { column, ...options }]; return builder; },
        limit(n: number) { limit = n; return builder; },
        range: (from: number, to: number) => run(from, to),
        then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => run().then(resolve, reject),
      };
      return builder;
    },
  };
  return { queries, context: { supabase: client, userId: OWNER } as unknown as MobileSupabaseAuthenticatedContext };
}
const params = (date: string, weeks: string) => new URLSearchParams({ date, weeks });
const perf = {} as Parameters<typeof readMobileTrainingDay>[2];

describe("Recommendation sessions of the same weekday (one read instead of one per day)", () => {
  it("returns exactly the sessions, in the same order, that one /training/days read per date gave", async () => {
    const data = tables();
    const before = fake(data);
    const dates = Array.from({ length: 13 }, (_, i) => shift(TODAY, -7 * i));
    const perDay = [];
    for (const date of dates) perDay.push(...(await readMobileTrainingDay(date, before.context, perf)).sessions);
    const legacy = [...new Map(perDay.map(s => [s.id, { id: s.id, routineId: s.routineId, logDate: s.logDate }])).values()];

    const after = fake(data);
    const result = await readMobileTrainingWeekdaySessions(params(TODAY, "12"), after.context, perf);
    expect(result).toEqual({ date: TODAY, weeks: 12, sessions: legacy });
    expect(legacy.length).toBeGreaterThan(13); // days with two sessions, free sessions and today
    expect(result.sessions.some(s => s.routineId === null)).toBe(true);
    // Database work: 2 queries, no exercises or sets, against up to 5 per date before.
    expect(after.queries).toEqual(["day_logs", "workout_sessions"]);
    expect(before.queries.length).toBeGreaterThanOrEqual(13 * 4);
  });
  it("a server cap of 4 rows per response: every session arrives once, across pages, ending on the exact count", async () => {
    const data = tables();
    const whole = await readMobileTrainingWeekdaySessions(params(TODAY, "12"), fake(data).context, perf);
    const capped = fake(data, 4);
    const paged = await readMobileTrainingWeekdaySessions(params(TODAY, "12"), capped.context, perf);
    expect(paged).toEqual(whole);
    expect(new Set(paged.sessions.map(s => s.id)).size).toBe(paged.sessions.length);
    expect(capped.queries.filter(q => q === "workout_sessions").length).toBe(Math.ceil(whole.sessions.length / 4));
  });
  it("only the owner's completed, finished sessions of those days", async () => {
    const data = tables();
    const result = await readMobileTrainingWeekdaySessions(params(TODAY, "12"), fake(data).context, perf);
    const byId = new Map(data.workout_sessions.map(s => [s.id, s]));
    for (const s of result.sessions) {
      const row = byId.get(s.id)!;
      expect([row.user_id, row.status, row.ended_at !== null]).toEqual([OWNER, "completed", true]);
      expect(new Date(`${s.logDate}T12:00:00Z`).getUTCDay()).toBe(new Date(`${TODAY}T12:00:00Z`).getUTCDay());
    }
  });
  it("no day log in the window: one query and an empty list", async () => {
    const f = fake(tables());
    expect(await readMobileTrainingWeekdaySessions(params("2020-01-02", "12"), f.context, perf)).toEqual({ date: "2020-01-02", weeks: 12, sessions: [] });
    expect(f.queries).toEqual(["day_logs"]);
  });
  it.each([["2026-02-30", "12"], ["29/10/2026", "12"], [TODAY, "0"], [TODAY, "27"], [TODAY, "1.5"], [TODAY, ""]])(
    "rejects date %s / weeks %s without reading", async (date, weeks) => {
      const f = fake(tables());
      await expect(readMobileTrainingWeekdaySessions(params(date, weeks), f.context, perf)).rejects.toBeInstanceOf(MobileApiValidationError);
      expect(f.queries).toEqual([]);
    });
  it("route: Bearer identity required, 400 on invalid input, 200 with the owner's context", async () => {
    const request = (query: string, auth = "Bearer token") => new NextRequest(`https://ownlevel.test/api/mobile/v1/training/history/weekdays?${query}`,
      { headers: auth ? { authorization: auth } : {} });
    expect((await weekdaysGET(request(`date=${TODAY}&weeks=12`, ""))).status).toBe(401);
    mocks.readAuth.mockResolvedValue(fake(tables()).context);
    expect((await weekdaysGET(request(`date=${TODAY}&weeks=99`))).status).toBe(400);
    const ok = await weekdaysGET(request(`date=${TODAY}&weeks=12`));
    expect(ok.status).toBe(200);
    expect((await ok.json()).sessions.length).toBeGreaterThan(0);
  });
});
