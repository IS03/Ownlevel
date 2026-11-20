import { expect, it, jest } from '@jest/globals';
import { fetchTrainingTimes, trainingTimesKey } from './training-times';
import type { MobileApiClient } from './client';
import { timesFixture } from '@/progress/training-times.test-helper';

const query = { period: 'custom' as const, from: '2026-08-01', to: '2026-08-31' };
const selection = { routine: null, execution: null, bin: null, offset: 0 };
it('binds reads to period, execution, routine and bin, with encoded context and cancellation', async () => {
  const read = jest.fn<MobileApiClient['read']>().mockResolvedValue({ status: 'ok' } as never), signal = new AbortController().signal;
  await fetchTrainingTimes({ read } as unknown as MobileApiClient, query, selection, signal);
  const request = read.mock.calls[0]![0]; expect(request.signal).toBe(signal);
  const data = timesFixture(); expect(request.parse(data)).toEqual(data);
  expect(request.parse({ ...data, selection: { ...selection, bin: 1 } })).toBeUndefined();
  expect(request.parse({ ...data, period: { ...data.period, start: '2026-07-01' } })).toBeUndefined();
  expect(request.parse({ ...data, period: { ...data.period, end: '2026-08-30', days: 30, includesToday: false } })).toBeUndefined();
  const selected = { ...selection, execution: data.executions[0]!.key, bin: 8 };
  await fetchTrainingTimes({ read } as unknown as MobileApiClient, query, selected);
  expect(new URL(`https://example.invalid${read.mock.calls[1]![0].path}`).searchParams.get('execution')).toBe(selected.execution);
  expect(trainingTimesKey(query, selection)).not.toBe(trainingTimesKey(query, selected));
});
