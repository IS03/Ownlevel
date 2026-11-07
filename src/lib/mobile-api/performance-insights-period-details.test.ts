import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "../../app/api/mobile/v1/progress/performance-insights/route";
import { clearInsightsSnapshots } from "./performance-insights-server";
import { parsePerformanceInsights } from "./performance-insights-contract";
import { periodDetailsFixture } from "../progress/insights-engine/period-details-fixture";
const mocks = vi.hoisted(() => ({ auth: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("./supabase", () => ({ authenticateMobileAccessToken: mocks.auth }));
const USER = "93670000-0000-4000-8000-000000000001";
type Call = { table: string; select: string; filters: [string, string, unknown][]; from: number; to: number; head: boolean };
function database(revision: (n: number) => number = () => 1, fail?: string) {
  const source = periodDetailsFixture(), sessions = source.sessions.map(s => ({ id: s.id, user_id: USER, status: s.status, routine_id: s.routineId, routine_name_snapshot: s.routineName,
    session_name: s.name, started_at: s.startedAt, ended_at: s.endedAt, energy_level: s.legacyEnergyLevel, pain_level: null, performance_level: null, day: { log_date: s.date } }));
  const byId = new Map(sessions.map(s => [s.id, s])), exerciseById = new Map(source.exercises.map(e => [e.id, e]));
  const sets = source.sets.map(s => ({ id: s.id, user_id: USER, workout_session_exercise_id: s.sessionExerciseId, is_completed: s.isCompleted, actual_reps: s.actualReps, actual_weight_kg: s.actualLoad, completed_at: s.completedAt,
    exercise: { workout_session_id: exerciseById.get(s.sessionExerciseId)!.sessionId, session: byId.get(exerciseById.get(s.sessionExerciseId)!.sessionId) } }));
  const tables: Record<string, Record<string, unknown>[]> = {
    workout_sessions: sessions, workout_sets: sets,
    workout_session_exercises: source.exercises.map(e => ({ id: e.id, user_id: USER, workout_session_id: e.sessionId, exercise_id: e.exerciseId, nombre_snapshot: e.name,
      implement_snapshot: e.implement, weight_mode_snapshot: e.weightMode, is_completed: e.isCompleted, configuration: null, sets: sets.filter(s => s.workout_session_exercise_id === e.id) })),
    workout_session_feelings: source.feelings.map(f => ({ session_id: f.sessionId, revision: f.revision, facts: f.facts, session: byId.get(f.sessionId) })),
    meal_entries: source.meals.map(m => ({ id: m.id, user_id: USER, deleted_at: null, entry_kind: m.entryKind, consumed_at: m.consumedAt, consumed_at_source: m.consumedAtSource, raw_input: m.rawInput, source_type: m.sourceType, import_run_id: m.importRunId,
      final_calories: m.calories, final_protein_g: m.proteinG, final_carbs_g: m.carbsG, final_fat_g: m.fatG, day_logs: { log_date: m.date } })),
  };
  const calls: Call[] = []; let revisions = 0;
  const nested = (row: Record<string, unknown>, key: string) => key.split('.').reduce<unknown>((v, k) => v && typeof v === 'object' ? (v as Record<string, unknown>)[k] : undefined, row);
  const client = { from(table: string) {
    const call: Call = { table, select: '', filters: [], from: 0, to: 999, head: false };
    const b = { select(s: string, o?: { head?: boolean }) { call.select = s; call.head = !!o?.head; return b; },
      eq(k: string, v: unknown) { call.filters.push(['eq', k, v]); return b; }, is(k: string, v: unknown) { call.filters.push(['eq', k, v]); return b; },
      not(k: string, _op: string, v: unknown) { call.filters.push(['not', k, v]); return b; }, in(k: string, v: unknown) { call.filters.push(['in', k, v]); return b; },
      gte(k: string, v: unknown) { call.filters.push(['gte', k, v]); return b; }, lte(k: string, v: unknown) { call.filters.push(['lte', k, v]); return b; },
      order() { return b; }, range(a: number, z: number) { call.from = a; call.to = z; return b; }, returns() { return b; }, maybeSingle() { return b; },
      then(resolve: (r: unknown) => void) {
        calls.push(call); if (table === fail) { resolve({ data: null, error: { message: 'synthetic failure' } }); return; }
        if (table === 'insights_source_revisions') { resolve({ data: { revision: revision(++revisions) }, error: null }); return; }
        const rows = (tables[table] ?? []).filter(r => call.filters.every(([op, k, v]) => {
          const a = nested(r, k); if (k === 'sets.user_id') return true;
          return op === 'eq' ? a === v : op === 'not' ? a !== v : op === 'in' ? (v as unknown[]).includes(a) : op === 'gte' ? String(a) >= String(v) : String(a) <= String(v);
        }));
        resolve({ data: call.head ? null : JSON.parse(JSON.stringify(rows.slice(call.from, call.to + 1))), error: null, count: rows.length });
      } };
    return b;
  } };
  return { client, calls, tables };
}
// A literal dummy header reaches the mocked authenticator; no credential is requested or read.
const request = (query: string) => new NextRequest(`http://localhost/api/mobile/v1/progress/performance-insights?method=2&${query}`, { headers: { authorization: "Bearer synthetic" } });
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2027-01-02T15:00:00Z')); clearInsightsSnapshots(); });
afterEach(() => vi.useRealTimers());
describe('bounded period details route', () => {
  it('publishes one revision for weeks, all calendar days and body/nutrition sources, preserving the anchor across New Year',async()=>{
    const db=database();mocks.auth.mockResolvedValue({supabase:db.client,userId:USER});
    const res=await GET(request('view=period-explore&asOf=2026-11-07')),body=await res.json();
    expect(res.status).toBe(200);expect(parsePerformanceInsights(body)?.view).toBe('period-explore');expect(body.weeks.flatMap((w:{days:unknown[]})=>w.days)).toHaveLength(92);
    expect(db.calls).toHaveLength(10);console.log('period-explore route fixture bytes:',Buffer.byteLength(JSON.stringify(body)));
    mocks.auth.mockResolvedValue({supabase:db.client,userId:USER.replace(/1$/,'2')});const other=await(await GET(request('view=period-explore&asOf=2026-11-07'))).json();expect(other.weeks.every((w:{days:{training:unknown,nutrition:unknown}[]})=>w.days.every(d=>d.training===null&&d.nutrition===null))).toBe(true);
    const moving=database(n=>n);mocks.auth.mockResolvedValue({supabase:moving.client,userId:USER});expect((await GET(request('view=period-explore&asOf=2026-11-07'))).status).toBe(503);
    const once=database(n=>n===1?1:2);mocks.auth.mockResolvedValue({supabase:once.client,userId:USER});expect((await GET(request('view=period-explore&asOf=2026-11-07'))).status).toBe(200);expect(once.calls).toHaveLength(20);
  });
  it('reads temporal context through the canonical grouped source under one revision; old views and parameters stay separate', async () => {
    const db=database(); mocks.auth.mockResolvedValue({supabase:db.client,userId:USER});
    const response=await GET(request('view=session-temporal&date=2026-08-03')), body=await response.json();
    expect(response.status).toBe(200); expect(parsePerformanceInsights(body)?.view).toBe('session-temporal'); expect(body.sessions).toHaveLength(1);
    expect(db.calls).toHaveLength(9); console.log('session-temporal fixture bytes:', Buffer.byteLength(JSON.stringify(body)));
    mocks.auth.mockResolvedValue({supabase:db.client,userId:USER.replace(/1$/,'2')});
    expect((await (await GET(request('view=session-temporal&date=2026-08-03'))).json()).sessions).toEqual([]);
    for(const q of ['view=session-temporal&date=2026-02-30','view=session-temporal&date=2028-01-01','view=session-temporal&date=2026-08-03&asOf=2026-11-07','view=summary&date=2026-08-03']) expect((await GET(request(q))).status).toBe(400);
    const moving=database(n=>n); mocks.auth.mockResolvedValue({supabase:moving.client,userId:USER}); expect((await GET(request('view=session-temporal&date=2026-08-03'))).status).toBe(503);
    const broken=database(()=>1,'meal_entries'); mocks.auth.mockResolvedValue({supabase:broken.client,userId:USER}); expect((await GET(request('view=session-temporal&date=2026-08-03'))).status).toBe(503);
  });
  it('reads three period streams under one counter, preserves before-first-set timing, and isolates accounts', async () => {
    const db = database(); mocks.auth.mockResolvedValue({ supabase: db.client, userId: USER });
    const response = await GET(request('view=period-feelings&asOf=2026-11-07')), body = await response.json();
    expect(response.status).toBe(200); expect(parsePerformanceInsights(body)?.view).toBe('period-feelings');
    expect(body.outcomes[0].sessions.completed).toBe(8); expect(body.outcomes[0].byPrior[2].posts[3]).toBe(1);
    expect(db.calls).toHaveLength(5); expect(db.calls.map(c => c.table).filter(t => t === 'insights_source_revisions')).toHaveLength(2);
    for (const c of db.calls.filter(c => c.table !== 'insights_source_revisions')) {
      expect(c.filters.some(([, k, v]) => k.endsWith('user_id') && v === USER)).toBe(true);
      expect(c.filters.some(([op, , v]) => op === 'gte' && v === '2026-08-01')).toBe(true);
      expect(c.filters.some(([op, , v]) => op === 'lte' && v === '2026-10-31')).toBe(true);
    }
    console.log('period-feelings fixture bytes:', Buffer.byteLength(JSON.stringify(body)));
    mocks.auth.mockResolvedValue({ supabase: db.client, userId: USER.replace(/1$/, '2') });
    const other = await (await GET(request('view=period-feelings&asOf=2026-11-07'))).json();
    expect(other.outcomes[0].sessions.completed).toBe(0); expect(other.sourceRevision).not.toBe(body.sourceRevision);
  });
  it('retries one whole revision, refuses continued movement and source errors', async () => {
    const once = database(n => n === 1 ? 1 : 2); mocks.auth.mockResolvedValue({ supabase: once.client, userId: USER });
    expect((await GET(request('view=period-feelings&asOf=2026-11-07'))).status).toBe(200); expect(once.calls).toHaveLength(10);
    const moving = database(n => n); mocks.auth.mockResolvedValue({ supabase: moving.client, userId: USER });
    const unavailable = await GET(request('view=period-feelings&asOf=2026-11-07')); expect(unavailable.status).toBe(503);
    expect((await unavailable.json()).data).toBeUndefined();
    const broken = database(() => 1, 'workout_session_feelings'); mocks.auth.mockResolvedValue({ supabase: broken.client, userId: USER });
    expect((await GET(request('view=period-feelings&asOf=2026-11-07'))).status).toBe(503);
  });
  it('pins the summary across New Year without altering legacy period responses or allowing arbitrary detail filters', async () => {
    const db = database(); mocks.auth.mockResolvedValue({ supabase: db.client, userId: USER });
    const pinned = await (await GET(request('view=period-at&asOf=2026-11-07'))).json();
    expect(pinned.period).toMatchObject({ start: '2026-08-01', end: '2026-10-31' }); expect(pinned.today).toBe('2027-01-02'); expect(parsePerformanceInsights(pinned)).toBeTruthy();
    const old = await (await GET(request('view=period'))).json(); expect(old.view).toBe('period'); expect(old).not.toHaveProperty('asOf'); expect(old.period.start).toBe('2026-10-01');
    for (const q of ['view=period&asOf=2026-11-07', 'view=period-feelings&asOf=2026-02-30', 'view=period-feelings&asOf=2028-01-01', 'view=period-feelings&before=2026-10-01', 'view=period-feelings&association=x', 'view=period-feelings&asOf=2026-11-07&asOf=2026-12-01']) expect((await GET(request(q))).status).toBe(400);
  });
  it('reads all nutrition days without training in one bounded stream and isolates the account', async () => {
    const db = database(); mocks.auth.mockResolvedValue({ supabase: db.client, userId: USER });
    const response = await GET(request('view=period-nutrition&asOf=2026-11-07')), body = await response.json();
    expect(response.status).toBe(200); expect(parsePerformanceInsights(body)?.view).toBe('period-nutrition');
    expect(body.days).toHaveLength(4); expect(body.daysWithoutMeals).toBe(88); expect(body.days.at(-1).date).toBe('2026-08-11');
    expect(db.calls.map(c => c.table)).toEqual(['insights_source_revisions', 'meal_entries', 'insights_source_revisions']);
    expect(db.calls[1]!.filters).toEqual(expect.arrayContaining([['eq', 'user_id', USER], ['eq', 'deleted_at', null], ['gte', 'day_logs.log_date', '2026-08-01'], ['lte', 'day_logs.log_date', '2026-10-31']]));
    console.log('period-nutrition fixture bytes:', Buffer.byteLength(JSON.stringify(body)));
    mocks.auth.mockResolvedValue({ supabase: db.client, userId: USER.replace(/1$/, '2') });
    const other = await (await GET(request('view=period-nutrition&asOf=2026-11-07'))).json(); expect(other.days).toHaveLength(0); expect(other.sourceRevision).not.toBe(body.sourceRevision);
  });
  it('restarts the entire nutrition read on revision change, and pages sources rather than days', async () => {
    const db = database(n => { if (n === 2) { db.tables.meal_entries![0]!.final_calories = 999; db.tables.meal_entries![3]!.final_calories = 42; } return n === 1 ? 1 : 2; });
    mocks.auth.mockResolvedValue({ supabase: db.client, userId: USER });
    const body = await (await GET(request('view=period-nutrition&asOf=2026-11-07'))).json();
    expect(db.calls).toHaveLength(6); expect(body.days.find((d: { date: string }) => d.date === '2026-08-11').calories.recorded).toBe(1099);
    expect(body.days.find((d: { date: string }) => d.date === '2026-08-13').calories.recorded).toBe(42);
    const paged = database(), row = paged.tables.meal_entries![0]!;
    paged.tables.meal_entries = Array.from({ length: 1001 }, (_, i) => ({ ...row, id: `synthetic-${i}` }));
    mocks.auth.mockResolvedValue({ supabase: paged.client, userId: USER });
    const page = await (await GET(request('view=period-nutrition&asOf=2026-11-07'))).json();
    expect(page.days).toHaveLength(1); expect(page.days[0].activeMeals).toBe(1001); expect(paged.calls).toHaveLength(4);
    for (const scenario of [database(n => n), database(() => 1, 'meal_entries')]) {
      mocks.auth.mockResolvedValue({ supabase: scenario.client, userId: USER });
      expect((await GET(request('view=period-nutrition&asOf=2026-11-07'))).status).toBe(503);
    }
  });
});
