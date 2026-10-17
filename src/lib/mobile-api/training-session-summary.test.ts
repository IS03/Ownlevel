import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { WorkoutSet, WorkoutSessionDetail } from '../phase2/types';
import type { RobustExerciseHistoryItem } from '../phase2/training-robust';
import { MobileApiNotFoundError } from './auth';
const mocks = vi.hoisted(() => ({ auth: vi.fn(), detail: vi.fn(), history: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('./supabase', () => ({ authenticateMobileAccessToken: mocks.auth }));
vi.mock('../phase2/training-robust', () => ({ getWorkoutSessionDetail: mocks.detail, listCompleteRobustExerciseHistory: mocks.history }));
import { exerciseComparison, readMobileSessionSummary } from './training-session-highlights-server';
import { parseSessionSummary, type SessionSummaryDto } from './training-session-summary';
import { GET } from '../../app/api/mobile/v1/training/sessions/[sessionId]/summary/route';

const id = '11111111-1111-4111-8111-111111111111', exerciseId = '22222222-2222-4222-8222-222222222222';
const otherExercise = '44444444-4444-4444-8444-444444444444', sessionExerciseId = '55555555-5555-4555-8555-555555555555';
const previousSessionId = '33333333-3333-4333-8333-333333333333';
const context = { userId: 'owner', supabase: {} } as never, performance = { requestId: 'test' } as never;
const set = (weight: number | null, reps: number | null = 10, done = true, n = 1) => ({ actual_weight_kg: weight, actual_reps: reps, is_completed: done, set_number: n }) as WorkoutSet;
const exercise = (mode: string | null = 'Peso total', sets = [set(60)], eid = exerciseId, sid = sessionExerciseId) =>
  ({ id: sid, exercise_id: eid, nombre_snapshot: 'Jalón', weight_mode_snapshot: mode, sets });
const detail = (...exercises: ReturnType<typeof exercise>[]) => ({
  session: { id, status: 'completed', ended_at: '2026-10-14T17:00:00Z' }, exercises: exercises.length ? exercises : [exercise()],
}) as unknown as WorkoutSessionDetail;
const previous = (sets: WorkoutSet[], mode = 'Peso total', date = '2026-10-10T17:00:00Z', sessionId = previousSessionId, status = 'completed') => ({
  session: { id: sessionId, status, ended_at: date }, logDate: date.slice(0, 10), exercise: { weight_mode_snapshot: mode, sets },
}) as unknown as RobustExerciseHistoryItem;
const compare = (now: ReturnType<typeof exercise>, before: RobustExerciseHistoryItem[]) => exerciseComparison(now as never, before);

beforeEach(() => { vi.clearAllMocks(); mocks.auth.mockResolvedValue(context); mocks.detail.mockResolvedValue(detail()); mocks.history.mockResolvedValue([previous([set(50)])]); });

describe('per-exercise comparison against the last time', () => {
  it('compares the best set by load, then by reps, and keeps the previous sets in order for "antes"', () => {
    expect(compare(exercise('Peso total', [set(62.5, 8)]), [previous([set(60, 10, true, 2), set(57.5, 10, true, 1)])]))
      .toMatchObject({ status: 'improved', change: { kind: 'weight', amount: 2.5 },
        previous: { sessionId: previousSessionId, sets: [{ weightKg: 57.5, reps: 10 }, { weightKg: 60, reps: 10 }] } });
    expect(compare(exercise('Peso total', [set(60, 11)]), [previous([set(60, 10)])])).toMatchObject({ status: 'improved', change: { kind: 'reps', amount: 1 } });
    expect(compare(exercise('Peso total', [set(60, 8)]), [previous([set(60, 10)])])).toMatchObject({ status: 'declined', change: { kind: 'reps', amount: -2 } });
    expect(compare(exercise('Peso total', [set(60, 10)]), [previous([set(60, 10)])])).toMatchObject({ status: 'same', change: null });
  });
  it('a tied best set is decided by the rest of the work: a held top set with fewer reps after it is not "the same"', () => {
    expect(compare(exercise('Peso total', [set(60, 10, true, 1), set(60, 7, true, 2), set(56, 8, true, 3)]), [previous([set(60, 10, true, 1), set(60, 9, true, 2), set(60, 8, true, 3)])]))
      .toMatchObject({ status: 'declined', change: { kind: 'volume', amount: -152 } });
    expect(compare(exercise('Peso corporal', [set(null, 12, true, 1), set(null, 10, true, 2)]), [previous([set(null, 12, true, 1), set(null, 8, true, 2)], 'Peso corporal')]))
      .toMatchObject({ status: 'improved', change: { kind: 'volume', amount: 2 } });
    expect(compare(exercise('Peso total', [set(60, 10, true, 1), set(50, 10, false, 2)]), [previous([set(60, 10, true, 1)])])).toMatchObject({ status: 'same', change: null });
  });
  it('bodyweight compares reps; the most recent earlier session is the reference', () => {
    expect(compare(exercise('Peso corporal', [set(null, 12)]), [previous([set(null, 10)], 'Peso corporal', '2026-10-12T17:00:00Z', previousSessionId), previous([set(null, 15)], 'Peso corporal', '2026-10-01T17:00:00Z', '66666666-6666-4666-8666-666666666666')]))
      .toMatchObject({ status: 'improved', change: { kind: 'reps', amount: 2 }, previous: { sessionId: previousSessionId } });
  });
  it('first time, another load mode, or nothing completed are never shown as a change', () => {
    expect(compare(exercise(), [])).toEqual({ sessionExerciseId, exerciseId, status: 'first', change: null, previous: null });
    expect(compare(exercise('Peso total'), [previous([set(20)], 'Por mancuerna')])).toMatchObject({ status: 'not_comparable', change: null, previous: null });
    expect(compare(exercise('Peso total', [set(60, 10, false)]), [previous([set(50)])])).toMatchObject({ status: 'not_comparable', change: null });
  });
});

describe('GET /training/sessions/{id}/summary', () => {
  it('one read: highlights and every exercise, from earlier completed sessions only', async () => {
    mocks.detail.mockResolvedValue(detail(exercise('Peso total', [set(60)]), exercise('Peso corporal', [set(null, 12)], otherExercise, '77777777-7777-4777-8777-777777777777')));
    mocks.history.mockImplementation(async (eid: string) => eid === exerciseId
      ? [previous([set(50)]), previous([set(99)], 'Peso total', '2026-10-20T17:00:00Z', '88888888-8888-4888-8888-888888888888'), { ...previous([set(10)]), session: { id, status: 'completed', ended_at: '2026-10-14T17:00:00Z' } }]
      : []);
    const data = await readMobileSessionSummary(id, context, performance);
    expect(mocks.history).toHaveBeenCalledTimes(2);
    expect(data.volumeKg).toBe(600);
    expect(data.highlights).toEqual([expect.objectContaining({ kind: 'record', exerciseId, mark: { weightKg: 60, reps: 10 }, previous: { weightKg: 50, reps: 10 } })]);
    expect(data.exercises.map(e => [e.exerciseId, e.status])).toEqual([[exerciseId, 'improved'], [otherExercise, 'first']]);
    expect(parseSessionSummary(data)).toBeDefined();
  });
  it('an active or missing session is not found; extra params are rejected', async () => {
    mocks.detail.mockResolvedValue({ ...detail(), session: { id, status: 'active', ended_at: null } });
    await expect(readMobileSessionSummary(id, context, performance)).rejects.toBeInstanceOf(MobileApiNotFoundError);
    const response = await GET(new NextRequest(`https://www.ownlevel.fit/api/mobile/v1/training/sessions/${id}/summary?x=1`, { headers: { authorization: 'Bearer t' } }), { params: Promise.resolve({ sessionId: id }) });
    expect(response.status).toBe(400);
  });
});

describe('summary parser', () => {
  const ok = (): SessionSummaryDto => ({ sessionId: id, volumeKg: 600, highlights: [], exercises: [{ sessionExerciseId, exerciseId, status: 'improved',
    change: { kind: 'weight', amount: 2.5 }, previous: { sessionId: previousSessionId, endedAt: '2026-10-10T17:00:00Z', sets: [{ weightKg: 60, reps: 10 }] } }] });
  it('accepts a valid summary and rejects inconsistent rows', () => {
    expect(parseSessionSummary(ok())).toBeDefined();
    { const d = ok(); d.exercises[0].change = { kind: 'volume', amount: 12.5 }; expect(parseSessionSummary(d)).toBeDefined(); }
    const bad: ((d: SessionSummaryDto) => void)[] = [
      d => { d.exercises[0].change = { kind: 'weight', amount: -2.5 }; },
      d => { d.exercises[0].change = null; },
      d => { d.exercises[0].status = 'same'; },
      d => { d.exercises[0].status = 'first'; d.exercises[0].change = null; },
      d => { d.exercises[0].change = { kind: 'reps', amount: 1.5 }; },
      d => { d.exercises[0].change = { kind: 'volume', amount: -5 }; },
      d => { d.exercises.push({ ...d.exercises[0] }); },
      d => { d.exercises[0].previous!.sets[0].reps = -1; },
      d => { (d as Record<string, unknown>).extra = 1; },
    ];
    for (const mutate of bad) { const d = ok(); mutate(d); expect(parseSessionSummary(d)).toBeUndefined(); }
  });
});
