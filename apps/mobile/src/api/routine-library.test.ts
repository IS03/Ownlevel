import { describe, expect, it, jest } from '@jest/globals';
import type { MobileApiClient } from './client';
import { duplicateMobileTrainingRoutine, reorderMobileTrainingRoutines, parseMobileTrainingRoutinesResponse } from './routines';

const id = '11111111-1111-4111-8111-111111111111';
const second = '22222222-2222-4222-8222-222222222222';
const routine = { id: second, name: 'PUSH copia', color: 'graphite', order: 2, isActive: true, exerciseCount: 8, setCount: 24 };
function api() {
  const request = jest.fn<MobileApiClient['request']>().mockResolvedValue({ status: 'unavailable', reason: 'network', meta: { durationMs: 0, httpStatus: null, outcome: 'unavailable' } });
  return { client: { request } as unknown as MobileApiClient, request };
}
describe('routine library adoption', () => {
  it('keeps missing, unavailable and zero list version distinct', () => {
    const data = { routines: { status: 'ok', data: [routine] }, initialPlan: { status: 'unavailable' } };
    expect(parseMobileTrainingRoutinesResponse(data)?.listVersion).toBeUndefined();
    expect(parseMobileTrainingRoutinesResponse({ ...data, listVersion: { status: 'ok', data: 0 } })?.listVersion).toEqual({ status: 'ok', data: 0 });
    expect(parseMobileTrainingRoutinesResponse({ ...data, listVersion: { status: 'unavailable' } })?.listVersion).toEqual({ status: 'unavailable' });
    for (const version of [null, '1', -1, Number.MAX_SAFE_INTEGER + 1]) {
      expect(parseMobileTrainingRoutinesResponse({ ...data, listVersion: { status: 'ok', data: version } })).toBeUndefined();
    }
  });
  it('sends duplicate source CAS and intent once, with no client identity', async () => {
    const { client, request } = api();
    const input = { name: 'PUSH copia', color: null, idempotencyKey: 'copy-1', expectedUpdatedAt: '2026-10-12T12:00:00Z', expectedTemplateVersion: 3 };
    await duplicateMobileTrainingRoutine(client, id, input);
    expect(request).toHaveBeenCalledTimes(1);
    const options = request.mock.calls[0]?.[0];
    expect(options).toMatchObject({ method: 'POST', path: `/api/mobile/v1/training/routines/${id}/duplicate`, body: input });
    expect(options?.parse({ routine })).toEqual({ routine });
    expect(options?.parse({ routine: { ...routine, isActive: false } })).toBeUndefined();
    expect(options?.parse({ routine: { ...routine, setCount: undefined } })).toBeUndefined();
  });
  it('sends exact requested order and rejects mismatched or stale acknowledgements', async () => {
    const { client, request } = api();
    const input = { routineIds: [second, id], expectedListVersion: 7, idempotencyKey: 'order-1' };
    await reorderMobileTrainingRoutines(client, input);
    expect(request).toHaveBeenCalledTimes(1);
    const options = request.mock.calls[0]?.[0];
    expect(options).toMatchObject({ method: 'PUT', path: '/api/mobile/v1/training/routines/order', body: input });
    expect(options?.parse({ routineIds: [second, id], listVersion: 9 })).toEqual({ routineIds: [second, id], listVersion: 9 });
    for (const body of [{ routineIds: [id, second], listVersion: 9 }, { routineIds: [second], listVersion: 9 },
      { routineIds: [second, id], listVersion: 6 }, { routineIds: [second, id], listVersion: Number.MAX_SAFE_INTEGER + 1 }]) {
      expect(options?.parse(body)).toBeUndefined();
    }
  });
});
