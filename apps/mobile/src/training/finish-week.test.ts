import { beforeEach, expect, it, jest } from '@jest/globals';
import type { MobileApiClient } from '@/api/client';
import { fetchFinishWeek, prefetchFinishWeek } from './finish-week';

const mockMonth = jest.fn<(client: unknown, month: string) => Promise<unknown>>();
jest.mock('@/api/training-history', () => ({ fetchTrainingHistoryMonth: (client: unknown, month: string) => mockMonth(client, month) }));
const meta = { durationMs: 1, httpStatus: 200, outcome: 'ok' };
const day = (date: string, sessions: number) => ({ date, sessions, completedSets: 10, level: 2 });
const client = {} as MobileApiClient;
beforeEach(() => { mockMonth.mockReset(); });

it('reads both months of a week that crosses them; the saved session fills its own day', async () => {
  mockMonth.mockImplementation(async (_client, month) => ({ status: 'ok', meta,
    data: { month, days: month === '2026-09' ? [day('2026-09-29', 1), day('2026-09-30', 2)] : [day('2026-10-02', 1)] } }));
  const week = await fetchFinishWeek(client, '2026-09-30');
  expect(mockMonth.mock.calls.map(([, month]) => month)).toEqual(['2026-09', '2026-10']);
  expect(week).toEqual({ sessions: 4, days: [
    { date: '2026-09-28', today: false, sessionsBefore: 0 }, { date: '2026-09-29', today: false, sessionsBefore: 1 },
    { date: '2026-09-30', today: true, sessionsBefore: 1 }, { date: '2026-10-01', today: false, sessionsBefore: 0 },
    { date: '2026-10-02', today: false, sessionsBefore: 1 }, { date: '2026-10-03', today: false, sessionsBefore: 0 },
    { date: '2026-10-04', today: false, sessionsBefore: 0 }] });
});
it('an unavailable month, or a calendar without the saved session, gives no week instead of a fake one', async () => {
  mockMonth.mockResolvedValueOnce({ status: 'unavailable', reason: 'network', meta });
  expect(await fetchFinishWeek(client, '2026-10-14')).toBeNull();
  mockMonth.mockResolvedValueOnce({ status: 'ok', meta, data: { month: '2026-10', days: [day('2026-10-13', 1)] } });
  expect(await fetchFinishWeek(client, '2026-10-14')).toBeNull();
});
it('the receipt reuses the read started at the confirmation; another saved session reads again', async () => {
  mockMonth.mockImplementation(async (_client, month) => ({ status: 'ok', meta, data: { month, days: [day('2026-10-14', 1)] } }));
  const first = prefetchFinishWeek(client, 'a', '2026-10-14');
  expect(prefetchFinishWeek(client, 'a', '2026-10-14')).toBe(first);
  await first;
  void prefetchFinishWeek(client, 'b', '2026-10-14');
  await Promise.resolve(); await Promise.resolve();
  expect(mockMonth).toHaveBeenCalledTimes(2);
});
