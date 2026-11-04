import { describe, expect, it, vi } from 'vitest';
import { webTrainingFeelingsApi } from './training-feelings-web';
const sid = '93670000-0000-4000-8000-000000000010';
const state = { contractVersion: 'training-feelings/1', sessionId: sid, sessionStatus: 'in_progress', sessionUpdatedAt: '2026-11-04T10:00:00.123456Z', endedAt: null, revision: 0, values: {} };
describe('Web feelings uses published routes with current identity', () => {
  it('negotiates the richer response without modifying the frozen body or retrying another finish', async () => {
    const feelings = { ...state, sessionStatus: 'completed', endedAt: state.sessionUpdatedAt };
    const finished = { status: 'finished', sessionId: sid, sessionStatus: 'completed', name: 'ORIGINAL', routineId: null, logDate: '2026-11-04', startedAt: state.sessionUpdatedAt,
      endedAt: state.sessionUpdatedAt, sessionUpdatedAt: state.sessionUpdatedAt, metadata: { energyLevel: 2, performanceLevel: null, painLevel: 0, notes: null }, exerciseCount: 1, completedExerciseCount: 1, completedSetCount: 1, routineAdditions: [] };
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(JSON.stringify({ contractVersion: 'training-feelings-finish/2', feelings, finished }))).mockResolvedValueOnce(new Response(JSON.stringify(feelings)));
    const port = webTrainingFeelingsApi('owner', sid, async () => ({ userId: 'owner', accessToken: 'synthetic' }), fetcher);
    const wire = { contractVersion: 'training-feelings/1' as const, operation: 'finish' as const, expectedRevision: 0, patch: {}, idempotencyKey: 'v2:1', metadata: {}, expectedSessionUpdatedAt: state.sessionUpdatedAt };
    const input = { ...wire, receiptVersion: 'training-feelings-finish/2' as const };
    expect(await port.write(input)).toMatchObject({ status: 'ok', data: feelings, finished });
    expect(fetcher.mock.calls[0][0]).toBe(`/api/mobile/v1/training/sessions/${sid}/finish-with-feelings?routineAdditions=1`); expect(fetcher.mock.calls[0][1]?.body).toBe(JSON.stringify(wire));
    expect((await port.write(input)).status).toBe('unavailable'); expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('sends the exact frozen body/route and never trusts the journal owner as authentication', async () => {
    let userId = 'owner';
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(state)));
    const port = webTrainingFeelingsApi('owner', sid, async () => ({ userId, accessToken: 'synthetic-token' }), fetcher);
    const input = { contractVersion: 'training-feelings/1' as const, operation: 'save' as const, expectedRevision: 0, patch: {}, idempotencyKey: 'exact:1' };
    expect((await port.write(input)).status).toBe('ok');
    expect(fetcher).toHaveBeenCalledWith(`/api/mobile/v1/training/sessions/${sid}/feelings`, expect.objectContaining({ method: 'PATCH', body: JSON.stringify(input), headers: expect.objectContaining({ Authorization: 'Bearer synthetic-token' }) }));
    userId = 'other'; expect((await port.write(input)).status).toBe('auth_required'); expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('uses atomic finish and reports network/read errors without empty confirmed values', async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValueOnce(Error('offline')).mockResolvedValueOnce(new Response('{}', { status: 503 })).mockResolvedValueOnce(new Response('{}', { status: 409 }));
    const port = webTrainingFeelingsApi('owner', sid, async () => ({ userId: 'owner', accessToken: 'synthetic' }), fetcher);
    expect((await port.read()).status).toBe('unavailable'); expect((await port.read()).status).toBe('unavailable');
    expect((await port.write({ contractVersion: 'training-feelings/1', operation: 'finish', expectedRevision: 1, patch: {}, idempotencyKey: 'finish:1', expectedSessionUpdatedAt: state.sessionUpdatedAt, metadata: {} })).status).toBe('conflict');
    expect(fetcher.mock.calls[2][0]).toBe(`/api/mobile/v1/training/sessions/${sid}/finish-with-feelings`); expect(fetcher.mock.calls[2][1]?.method).toBe('POST');
  });
  it('rejects a response for another session and malformed successful reads', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(JSON.stringify({ ...state, sessionId: '93670000-0000-4000-8000-000000000011' }))).mockResolvedValueOnce(new Response('{}'));
    const port = webTrainingFeelingsApi('owner', sid, async () => ({ userId: 'owner', accessToken: 'synthetic' }), fetcher);
    expect((await port.read()).status).toBe('unavailable'); expect((await port.read()).status).toBe('unavailable');
  });
});
