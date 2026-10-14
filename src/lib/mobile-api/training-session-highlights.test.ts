import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { WorkoutSet, WorkoutSessionDetail } from '../phase2/types';
import type { RobustExerciseHistoryItem } from '../phase2/training-robust';
import { MobileApiNotFoundError } from './auth';
const mocks = vi.hoisted(() => ({ auth: vi.fn(), detail: vi.fn(), history: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('./supabase', () => ({ authenticateMobileAccessToken: mocks.auth }));
vi.mock('../phase2/training-robust', () => ({ getWorkoutSessionDetail: mocks.detail, listCompleteRobustExerciseHistory: mocks.history }));
import { readMobileSessionHighlights } from './training-session-highlights-server';
import { parseSessionHighlights } from './training-session-highlights';
import { GET } from '../../app/api/mobile/v1/training/sessions/[sessionId]/highlights/route';
const id = '11111111-1111-4111-8111-111111111111', exerciseId = '22222222-2222-4222-8222-222222222222';
const context = { userId: 'owner', supabase: {} } as never, performance = { requestId: 'test' } as never;
const set = (weight: number | null, reps = 10, done = true) => ({ actual_weight_kg: weight, actual_reps: reps, is_completed: done }) as WorkoutSet;
const detail = (mode: string | null = 'Peso total', sets = [set(60)]) => ({
  session: { id, status: 'completed', ended_at: '2026-10-14T17:00:00Z' },
  exercises: [{ exercise_id: exerciseId, nombre_snapshot: 'Jalón', weight_mode_snapshot: mode, sets }],
}) as unknown as WorkoutSessionDetail;
const previous = (weight: number, reps = 10, mode = 'Peso total', status = 'completed', date = '2026-10-10T17:00:00Z') => ({
  session: { id: '33333333-3333-4333-8333-333333333333', status, ended_at: date }, logDate: date.slice(0, 10),
  exercise: { weight_mode_snapshot: mode, sets: [set(weight, reps)] },
}) as unknown as RobustExerciseHistoryItem;
beforeEach(() => { vi.clearAllMocks(); mocks.auth.mockResolvedValue(context); mocks.detail.mockResolvedValue(detail()); mocks.history.mockResolvedValue([previous(50)]); });
const read = () => readMobileSessionHighlights(id, context, performance);

describe('additive session highlights', () => {
  it('uses owner context and completed kg sets; keeps the finish receipt untouched', async () => {
    mocks.detail.mockResolvedValue(detail('Peso total', [set(60), set(999, 10, false), set(null), set(0)]));
    const data = await read();
    expect(data.volumeKg).toBe(600);
    expect(data.highlights).toEqual([{ kind: 'record', exerciseId, name: 'Jalón', mark: { weightKg: 60, reps: 10 }, previous: { weightKg: 50, reps: 10 }, weightMode: 'Peso total' }]);
    expect(mocks.detail).toHaveBeenCalledWith(id, expect.objectContaining({ userId: 'owner' }));
    expect(mocks.history).toHaveBeenCalledWith(exerciseId, expect.objectContaining({ userId: 'owner' }));
    expect(parseSessionHighlights(data)).toEqual(data);
  });
  it('does not turn a first appearance or an equal mark into a record', async () => {
    mocks.history.mockResolvedValue([]); expect((await read()).highlights).toEqual([]);
    mocks.history.mockResolvedValue([previous(60)]); expect((await read()).highlights).toEqual([]);
  });
  it('same load with more reps is a last-session improvement; records are not duplicated', async () => {
    mocks.history.mockResolvedValue([previous(60, 8)]);
    expect((await read()).highlights[0]).toMatchObject({ kind: 'improvement', mark: { weightKg: 60, reps: 10 }, previous: { reps: 8 } });
    mocks.history.mockResolvedValue([previous(55), previous(70, 5, 'Peso total', 'completed', '2026-10-01T17:00:00Z')]);
    expect((await read()).highlights.map(row => row.kind)).toEqual(['improvement']);
    mocks.history.mockResolvedValue([previous(70)]); expect((await read()).highlights).toEqual([]);
  });
  it('does not skip a previous appearance without a comparable mark to invent an improvement', async () => {
    const missing = previous(0);
    mocks.history.mockResolvedValue([missing, previous(50, 8, 'Peso total', 'completed', '2026-10-01T17:00:00Z'), previous(70, 5, 'Peso total', 'completed', '2026-09-01T17:00:00Z')]);
    expect((await read()).highlights).toEqual([]);
  });
  it('ignores discarded, future and other-mode history, and sessions after the current one', async () => {
    mocks.history.mockResolvedValue([previous(999, 10, 'Peso total', 'discarded'), previous(999, 10, 'Por mancuerna'), previous(999, 10, 'Peso total', 'completed', '2026-10-15T17:00:00Z'), previous(50)]);
    expect((await read()).highlights[0].kind).toBe('record');
  });
  it.each(['Peso total', 'Por mancuerna', 'Por brazo', 'Total con barra'])('counts kg volume in %s without a per-side multiplier', async mode => {
    mocks.detail.mockResolvedValue(detail(mode)); mocks.history.mockResolvedValue([previous(50, 10, mode)]);
    expect((await read()).volumeKg).toBe(600);
  });
  it.each(['Peso corporal', 'Tiempo (segundos)', 'Asistido', null])('does not invent volume or comparable load marks for %s', async mode => {
    mocks.detail.mockResolvedValue(detail(mode)); expect(await read()).toMatchObject({ volumeKg: null, highlights: [] });
  });
  it('lingotes retain their own mark mode, never kg volume; explicit kg zero differs from missing', async () => {
    mocks.detail.mockResolvedValue(detail('Lingotes (no kg)')); mocks.history.mockResolvedValue([previous(50, 10, 'Lingotes (no kg)')]);
    expect(await read()).toMatchObject({ volumeKg: null, highlights: [{ weightMode: 'Lingotes (no kg)' }] });
    mocks.detail.mockResolvedValue(detail('Peso total', [set(0)])); expect((await read()).volumeKg).toBe(0);
    mocks.detail.mockResolvedValue(detail('Peso total', [set(null)])); expect((await read()).volumeKg).toBeNull();
  });
  it('a failed historical read is unavailable rather than a fake first-time record', async () => {
    mocks.history.mockRejectedValue(new Error('database unavailable')); await expect(read()).rejects.toThrow();
  });
  it.each([null, { ...detail(), session: { ...detail().session, status: 'in_progress' } }, { ...detail(), session: { ...detail().session, status: 'discarded' } }])('rejects missing, foreign, unfinished or discarded sessions', async value => {
    mocks.detail.mockResolvedValue(value); await expect(read()).rejects.toBeInstanceOf(MobileApiNotFoundError);
  });
  it('wires the read bearer and rejects arbitrary query parameters', async () => {
    const request = (query = '', token = 'Bearer token') => new NextRequest(`https://example.test/api/mobile/v1/training/sessions/${id}/highlights${query}`, { headers: { authorization: token } });
    const params = { params: Promise.resolve({ sessionId: id }) };
    expect((await GET(request('', ''), params)).status).toBe(401);
    expect((await GET(request('?userId=another'), params)).status).toBe(400);
    const result = await GET(request(), params); expect(result.status).toBe(200); expect(parseSessionHighlights(await result.json())).toBeDefined();
    expect(mocks.auth).toHaveBeenCalledWith('token');
  });
});
