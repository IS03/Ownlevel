import { describe, expect, it, jest } from '@jest/globals';

import type { MobileApiClient } from './client';
import {
  fetchMobileTraining,
  parseMobileTrainingResponse,
  type MobileTrainingResponse,
} from './training';

const response: MobileTrainingResponse = {
  activeSession: { status: 'ok', data: null },
  calendar: {
    status: 'ok',
    data: {
      month: '2026-09',
      days: [
        { date: '2026-09-03', colors: ['violet', 'blue'] },
        { date: '2026-09-21', colors: ['rose'] },
      ],
    },
  },
};

describe('Mobile Training API contract', () => {
  it('preserves an absent active session, empty calendar and partial unavailable resources', () => {
    expect(parseMobileTrainingResponse(response)).toEqual(response);
    expect(
      parseMobileTrainingResponse({
        activeSession: { status: 'unavailable' },
        calendar: { status: 'ok', data: { month: '2026-09', days: [] } },
      }),
    ).toEqual({
      activeSession: { status: 'unavailable' },
      calendar: { status: 'ok', data: { month: '2026-09', days: [] } },
    });
    expect(
      parseMobileTrainingResponse({
        activeSession: { status: 'ok', data: null },
        calendar: { status: 'unavailable' },
      }),
    ).toEqual({
      activeSession: { status: 'ok', data: null },
      calendar: { status: 'unavailable' },
    });
  });

  it('accepts a real active session and multiple valid routine colors', () => {
    const populated = {
      ...response,
      activeSession: {
        status: 'ok',
        data: {
          id: '11111111-1111-4111-8111-111111111111',
          name: 'Upper A',
          logDate: '2026-09-21',
        },
      },
    };
    expect(parseMobileTrainingResponse(populated)).toEqual(populated);
  });

  it('rejects malformed values instead of inventing empty data', () => {
    expect(
      parseMobileTrainingResponse({
        ...response,
        calendar: {
          status: 'ok',
          data: {
            month: '2026-09',
            days: [{ date: '2026-09-03', colors: [42] }],
          },
        },
      }),
    ).toBeUndefined();
    expect(
      parseMobileTrainingResponse({
        ...response,
        activeSession: { status: 'ok' },
      }),
    ).toBeUndefined();
  });

  it('reads only the requested month through the existing Mobile API client', async () => {
    const read = jest.fn<MobileApiClient['read']>().mockResolvedValue({
      status: 'ok',
      data: response,
      meta: { durationMs: 12, httpStatus: 200, outcome: 'ok' },
    });
    const client = { read, request: jest.fn() } as MobileApiClient;
    const signal = new AbortController().signal;

    await fetchMobileTraining(client, '2026-09', signal);

    expect(read).toHaveBeenCalledWith({
      parse: parseMobileTrainingResponse,
      path: '/api/mobile/v1/training?month=2026-09',
      signal,
    });
  });
});


it('keeps trained days when their colors are unknown', () => {
  const parsed = parseMobileTrainingResponse({ ...response, calendar: { status: 'ok', data: { month: '2026-09', days: [{ date: '2026-09-03', colors: ['sand', 'future-color', 'blue'] }] } } });
  expect(parsed?.calendar).toEqual({ status: 'ok', data: { month: '2026-09', days: [{ date: '2026-09-03', colors: ['sand', null, 'blue'] }] } });
});
