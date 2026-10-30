import { describe, expect, it, jest } from '@jest/globals';

import type { MobileApiClient } from '@/api/client';
import type { TrainingHistorySession } from '@/api/training-history';

import { loadRecommendationData, recommendRoutine, sameWeekdayDates, weekdayName } from './new-session-model';

const mockHistory = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockWeekdays = jest.fn<(client: unknown, date: string, weeks: number) => Promise<unknown>>();
jest.mock('@/api/training-history', () => ({
  fetchTrainingWeekdaySessions: (client: unknown, date: string, weeks: number) => mockWeekdays(client, date, weeks),
  fetchTrainingHistory: (...args: unknown[]) => mockHistory(...args),
}));

const TODAY = '2026-10-09'; // Friday
const session = (routineId: string | null, logDate: string, id = `${routineId}-${logDate}`): TrainingHistorySession => ({
  id, routineId, routineName: routineId ?? 'Libre', routineColor: null, logDate, startedAt: `${logDate}T12:00:00.000Z`, endedAt: `${logDate}T13:00:00.000Z`,
  durationMilliseconds: 3_600_000, exercisesCompleted: 6, completedSets: 20, volumeKg: null,
});
const ACTIVE = ['pull', 'push', 'legs'];

describe('Routine recommendation', () => {
  it('the routine done on most of the same weekdays (distinct days), only past days of the window', () => {
    const sessions = [
      session('pull', '2026-10-02'), session('pull', '2026-09-25'), session('pull', '2026-09-25', 'pull-twice'), // same day counts once
      session('push', '2026-09-18'), session('push', '2026-09-11'), session('push', '2026-09-04'),
      session('legs', '2026-10-08'), session('legs', '2026-10-07'), // not Fridays
    ];
    expect(recommendRoutine(sessions, ACTIVE, TODAY)).toEqual({ routineId: 'push', days: 3, doneToday: false });
  });

  it('ties go to the one done most recently', () => {
    const sessions = [session('push', '2026-09-11'), session('push', '2026-09-04'), session('pull', '2026-10-02'), session('pull', '2026-09-18')];
    expect(recommendRoutine(sessions, ACTIVE, TODAY)).toEqual({ routineId: 'pull', days: 2, doneToday: false });
  });

  it('a routine already done today is still the recommendation, flagged', () => {
    const sessions = [session('pull', '2026-10-02'), session('pull', '2026-09-25'), session('pull', '2026-09-18'),
      session('push', '2026-09-11'), session('push', '2026-09-04'), session('pull', TODAY)];
    expect(recommendRoutine(sessions, ACTIVE, TODAY)).toEqual({ routineId: 'pull', days: 3, doneToday: true });
  });

  it('no recommendation below the minimum, for free sessions, archived routines or outside the 12 weeks', () => {
    expect(recommendRoutine([session('pull', '2026-10-02')], ACTIVE, TODAY)).toBeNull();
    expect(recommendRoutine([session(null, '2026-10-02'), session(null, '2026-09-25')], ACTIVE, TODAY)).toBeNull();
    expect(recommendRoutine([session('old', '2026-10-02'), session('old', '2026-09-25')], ACTIVE, TODAY)).toBeNull();
    expect(recommendRoutine([session('pull', '2026-07-10'), session('pull', '2026-07-03')], ACTIVE, TODAY)).toBeNull();
    expect(recommendRoutine([], ACTIVE, TODAY)).toBeNull();
  });

  it('weekday names for copy', () => {
    expect(weekdayName(TODAY)).toBe('viernes');
    expect(weekdayName('2026-10-10', true)).toBe('sábados');
  });

  it('reads today and the same weekday of the last 12 weeks in one request, plus one history page', async () => {
    const meta = { durationMs: 1, httpStatus: 200, outcome: 'ok' as const };
    expect(sameWeekdayDates(TODAY)).toHaveLength(13);
    expect(sameWeekdayDates(TODAY).slice(0, 3)).toEqual([TODAY, '2026-10-02', '2026-09-25']);
    expect(sameWeekdayDates(TODAY).at(-1)).toBe('2026-07-17');
    mockWeekdays.mockReset(); mockHistory.mockReset();
    const pull = { id: 'pull-2026-10-02', routineId: 'pull', logDate: '2026-10-02' };
    mockWeekdays.mockImplementation(async (_client, date, weeks) => ({ status: 'ok', meta, data: { date, weeks, sessions: [pull] } }));
    mockHistory.mockResolvedValue({ status: 'ok', meta, data: { sessions: [session('push', '2026-10-08')], nextCursor: 'p2' } });
    const data = await loadRecommendationData({} as MobileApiClient, TODAY);
    expect(mockWeekdays).toHaveBeenCalledTimes(1); expect(mockWeekdays.mock.calls[0].slice(1)).toEqual([TODAY, 12]);
    expect(mockHistory).toHaveBeenCalledTimes(1);
    expect(data).toEqual({ today: TODAY, sameWeekday: [pull], recent: [session('push', '2026-10-08')] });
    // The same recommendation as from the full history sessions of those days.
    expect(recommendRoutine(data.sameWeekday!, ACTIVE, TODAY)).toEqual(recommendRoutine([session('pull', '2026-10-02')], ACTIVE, TODAY));
    // A failed read: the recommendation is unknown, never guessed.
    mockWeekdays.mockImplementationOnce(async () => ({ status: 'unavailable', reason: 'network', meta }));
    expect((await loadRecommendationData({} as MobileApiClient, TODAY)).sameWeekday).toBeNull();
  });
});
