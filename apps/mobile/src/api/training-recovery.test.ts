import { expect, it, jest } from '@jest/globals';
import { fetchTrainingRecovery, recoveryReadKey } from './training-recovery';
import type { MobileApiClient } from './client';
import { recoveryFixture } from '@/progress/training-recovery.test-helper';
const query = { period: 'custom' as const, from: '2026-08-01', to: '2026-08-31' }, selection = { scope: 'all' as const, routine: null, bin: null, offset: 0 };
it('binds responses to scope, period and selection and forwards cancellation', async () => {
  const read = jest.fn<MobileApiClient['read']>().mockResolvedValue({ status: 'ok' } as never), signal = new AbortController().signal;
  await fetchTrainingRecovery({ read } as unknown as MobileApiClient, query, selection, signal);
  const request = read.mock.calls[0]![0], data = recoveryFixture(); expect(request.signal).toBe(signal); expect(request.parse(data)).toEqual(data);
  expect(request.parse({ ...data, selection: { ...selection, scope: 'routine' } })).toBeUndefined();
  expect(request.parse({ ...data, period: { ...data.period, end: '2026-08-30', days: 30 } })).toBeUndefined();
  expect(recoveryReadKey(query, selection)).not.toBe(recoveryReadKey(query, { ...selection, scope: 'routine' }));
});
