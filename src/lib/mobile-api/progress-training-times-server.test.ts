import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('./supabase', () => ({ authenticateMobileAccessToken: vi.fn() }));
vi.mock('./performance-insights-server', () => ({ readInsightsRevision: vi.fn() }));
vi.mock('../phase2/training-robust', () => ({ loadCompletedTrainingData: vi.fn(), readAllTrainingRows: vi.fn() }));
import { authenticateMobileAccessToken } from './supabase';
import { readInsightsRevision } from './performance-insights-server';
import { loadCompletedTrainingData, readAllTrainingRows } from '../phase2/training-robust';
import { clearTrainingTimesSources, progressTrainingTimesResponse } from './progress-training-times-server';
import { descriptiveFixture } from '../progress/insights-engine/descriptive-fixture.test-helper';
import { parseProgressTrainingTimes } from './progress-training-times-contract';
import { progressTrainingRecoveryResponse } from './progress-training-recovery-server';
import { parseProgressTrainingRecovery } from './progress-training-recovery-contract';

const query: Record<string, ReturnType<typeof vi.fn>> = {};
for (const method of ['select', 'eq', 'gte', 'lte', 'order', 'range']) query[method] = vi.fn();
const supabase = { from: vi.fn(() => query) };
const fixture = () => {
  const s = descriptiveFixture();
  return { source: {
    sessions: s.sessions.map(row => ({ id: row.id, day_log_id: row.date, routine_id: row.routineId, routine_name_snapshot: row.routineName, session_name: row.name, status: row.status, started_at: row.startedAt, ended_at: row.endedAt })),
    sessionExercises: s.exercises.map(e => ({ id: e.id, workout_session_id: e.sessionId, exercise_id: e.exerciseId, nombre_snapshot: e.name, implement_snapshot: e.implement, weight_mode_snapshot: e.weightMode, is_completed: e.isCompleted })),
    sets: s.sets.map(set => ({ id: set.id, workout_session_exercise_id: set.sessionExerciseId, actual_reps: set.actualReps, actual_weight_kg: set.actualLoad, is_completed: set.isCompleted, completed_at: set.completedAt })),
    dateByDayLog: new Map(s.sessions.map(row => [row.date, row.date])), configurations: new Map(s.exercises.map(e => [e.id, e.configuration])),
  }, feelings: s.feelings.map(f => ({ session_id: f.sessionId, revision: f.revision, facts: f.facts })) };
};
const request = (extra = '', token = 'Bearer test') => new Request(`https://ownlevel.invalid/api/mobile/v1/progress/training/times?period=custom&from=2026-08-01&to=2026-08-31${extra}`, { headers: { authorization: token } });
beforeEach(() => {
  vi.clearAllMocks(); clearTrainingTimesSources();
  vi.mocked(authenticateMobileAccessToken).mockResolvedValue({ userId: 'owner-a', supabase } as never);
  vi.mocked(readInsightsRevision).mockResolvedValue('1');
  vi.mocked(loadCompletedTrainingData).mockResolvedValue(fixture().source as never);
  for (const fn of Object.values(query)) fn.mockReturnValue(query);
  query.range!.mockResolvedValue({ data: fixture().feelings, error: null });
  vi.mocked(readAllTrainingRows).mockImplementation(async (_name, builder) => {
    const { data, error } = await builder(0, 999);
    if (error) throw new Error('Source unavailable');
    return data ?? [];
  });
});

describe('training times resource', () => {
  it('recovery is an independent opt-in contract and shares the same revision-checked source without rereading training', async () => {
    await progressTrainingTimesResponse(request()); vi.mocked(readInsightsRevision).mockClear();
    const response = await progressTrainingRecoveryResponse(request('&scope=routine&bin=0'));
    expect(response.status).toBe(200);
    const body = await response.json(); expect(parseProgressTrainingRecovery(body)).toBeDefined(); expect(body.selection.scope).toBe('routine');
    expect(loadCompletedTrainingData).toHaveBeenCalledTimes(1); expect(readAllTrainingRows).toHaveBeenCalledTimes(1); expect(readInsightsRevision).toHaveBeenCalledTimes(1);
  });
  it.each(['&scope=wrong', '&bin=5', '&userId=other', '&scope=all&scope=routine', '&offset=-1'])('recovery rejects invalid filters %s before sources', async extra => {
    expect((await progressTrainingRecoveryResponse(request(extra))).status).toBe(400); expect(loadCompletedTrainingData).not.toHaveBeenCalled();
  });
  it('recovery requires a bearer token and returns source failures as unavailable', async () => {
    expect((await progressTrainingRecoveryResponse(request('', ''))).status).toBe(401);
    query.range!.mockResolvedValue({ data: null, error: { message: 'offline' } });
    expect((await progressTrainingRecoveryResponse(request())).status).toBe(503);
  });
  it('authenticates first and validates the new shared contract', async () => {
    const response = await progressTrainingTimesResponse(request()); expect(response.status).toBe(200);
    expect(parseProgressTrainingTimes(await response.json())).toBeDefined();
    expect(loadCompletedTrainingData).toHaveBeenCalledWith(expect.objectContaining({ userId: 'owner-a', supabase }));
    expect(query.eq).toHaveBeenCalledWith('session.user_id', 'owner-a');
    expect(response.headers.get('cache-control')).toContain('no-store');
  });
  it('only rechecks the account revision when inspecting another bin of the same snapshot', async () => {
    await progressTrainingTimesResponse(request()); vi.mocked(readInsightsRevision).mockClear();
    const next = await progressTrainingTimesResponse(request('&bin=4'));
    expect(next.status).toBe(200); expect(loadCompletedTrainingData).toHaveBeenCalledTimes(1); expect(readAllTrainingRows).toHaveBeenCalledTimes(1);
    expect(readInsightsRevision).toHaveBeenCalledTimes(1);
    const data = await next.json(); expect(data.selection.bin).toBe(4); expect(data.page.rows.every((r: { minute: number }) => r.minute >= 480 && r.minute < 600)).toBe(true);
  });
  it('never reuses another account or a changed source revision', async () => {
    const first = await (await progressTrainingTimesResponse(request())).json();
    vi.mocked(authenticateMobileAccessToken).mockResolvedValue({ userId: 'owner-b', supabase } as never);
    const other = await (await progressTrainingTimesResponse(request())).json();
    expect(other.revision).not.toBe(first.revision); expect(loadCompletedTrainingData).toHaveBeenCalledTimes(2);
    vi.mocked(readInsightsRevision).mockResolvedValue('2');
    await progressTrainingTimesResponse(request()); expect(loadCompletedTrainingData).toHaveBeenCalledTimes(3);
  });
  it('discards a changing read and retries once without publishing partial data', async () => {
    vi.mocked(readInsightsRevision).mockResolvedValueOnce('1').mockResolvedValueOnce('2').mockResolvedValue('2');
    expect((await progressTrainingTimesResponse(request())).status).toBe(200);
    expect(loadCompletedTrainingData).toHaveBeenCalledTimes(2);
    clearTrainingTimesSources();
    let revision = 0; vi.mocked(readInsightsRevision).mockImplementation(async () => String(++revision));
    expect((await progressTrainingTimesResponse(request())).status).toBe(503);
  });
  it.each(['&userId=other', '&bin=12', '&bin=-1', '&offset=1.5', '&offset=-1', '&routine=bad', '&bin=1&bin=2', '&compareFrom=2026-07-01&compareTo=2026-07-31'])('rejects invalid/foreign query %s before reading sources', async extra => {
    expect((await progressTrainingTimesResponse(request(extra))).status).toBe(400); expect(loadCompletedTrainingData).not.toHaveBeenCalled();
  });
  it('returns 401 without a token and 503 when feelings cannot be read', async () => {
    expect((await progressTrainingTimesResponse(request('', ''))).status).toBe(401);
    expect(loadCompletedTrainingData).not.toHaveBeenCalled();
    query.range!.mockResolvedValue({ data: null, error: { message: 'offline' } });
    const response = await progressTrainingTimesResponse(request()); expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'DATA_UNAVAILABLE' });
  });
});
