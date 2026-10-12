import { describe, expect, it, jest } from '@jest/globals';

import type { MobileApiClient } from './client';
import {
  createMobileTrainingRoutine,
  fetchMobileTrainingRoutines,
  importMobileTrainingInitialPlan,
  parseMobileTrainingRoutinesResponse,
  setMobileTrainingRoutineStatus,
} from './routines';

const routine = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'PUSH',
  color: 'violet',
  order: 2,
  isActive: true,
  exerciseCount: 7,
  setCount: 21,
};

function client() {
  return {
    read: jest.fn(async () => ({ status: 'ok' })),
    request: jest.fn(async () => ({ status: 'ok' })),
  } as unknown as MobileApiClient;
}

describe('Mobile Training routines API', () => {
  it('parses routines and keeps initial-plan unavailable independent', () => {
    expect(parseMobileTrainingRoutinesResponse({
      routines: { status: 'ok', data: [routine] },
      initialPlan: { status: 'unavailable' },
    })).toEqual({
      routines: { status: 'ok', data: [routine] },
      initialPlan: { status: 'unavailable' },
    });

    expect(parseMobileTrainingRoutinesResponse({
      routines: { status: 'unavailable' },
      initialPlan: { status: 'ok', data: { imported: false, routinesFound: 0 } },
    })).toEqual({
      routines: { status: 'unavailable' },
      initialPlan: { status: 'ok', data: { imported: false, routinesFound: 0 } },
    });
  });

  it('rejects invalid counts, colors and malformed resources', () => {
    expect(parseMobileTrainingRoutinesResponse({
      routines: { status: 'ok', data: [{ ...routine, exerciseCount: '7' }] },
      initialPlan: { status: 'ok', data: { imported: true, routinesFound: 1 } },
    })).toBeUndefined();
    expect(parseMobileTrainingRoutinesResponse({
      routines: { status: 'ok', data: [{ ...routine, color: 123 }] },
      initialPlan: { status: 'ok', data: { imported: true, routinesFound: 1 } },
    })).toBeUndefined();
  });

  it('uses the canonical read and mutation contracts once per call', async () => {
    const api = client();

    await fetchMobileTrainingRoutines(api);
    await createMobileTrainingRoutine(api, {
      name: 'Push B',
      color: 'blue',
      idempotencyKey: 'stable-key',
    });
    await setMobileTrainingRoutineStatus(api, routine.id, false);
    await importMobileTrainingInitialPlan(api);

    expect(api.read).toHaveBeenCalledWith(expect.objectContaining({
      path: '/api/mobile/v1/training/routines',
    }));
    expect(api.request).toHaveBeenNthCalledWith(1, expect.objectContaining({
      body: { name: 'Push B', color: 'blue', idempotencyKey: 'stable-key' },
      method: 'POST',
      path: '/api/mobile/v1/training/routines',
    }));
    expect(api.request).toHaveBeenNthCalledWith(2, expect.objectContaining({
      body: { isActive: false },
      method: 'PATCH',
      path: `/api/mobile/v1/training/routines/${routine.id}`,
    }));
    expect(api.request).toHaveBeenNthCalledWith(3, expect.objectContaining({
      method: 'POST',
      path: '/api/mobile/v1/training/routines/initial-plan',
    }));
    expect(api.request).toHaveBeenCalledTimes(3);
  });
});

it.each(['sand', 'stone', 'slate', 'graphite', 'future-color'])('keeps routines with new or unknown color %s', color => {
  const parsed = parseMobileTrainingRoutinesResponse({ routines: { status: 'ok', data: [{ ...routine, color }] }, initialPlan: { status: 'unavailable' } });
  expect(parsed?.routines).toEqual({ status: 'ok', data: [{ ...routine, color: color === 'future-color' ? null : color }] });
});
