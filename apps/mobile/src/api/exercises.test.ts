import { describe, expect, it, jest } from '@jest/globals';

import type { MobileApiClient } from './client';
import {
  createMobileTrainingExercise,
  fetchMobileTrainingExercises,
  parseMobileTrainingExercisesResponse,
  setMobileTrainingExerciseStatus,
  updateMobileTrainingExercise,
  updateMobileTrainingExerciseIdentity,
} from './exercises';

const routineId = '11111111-1111-4111-8111-111111111111';
const exerciseId = '22222222-2222-4222-8222-222222222222';
const exercise = {
  id: exerciseId,
  name: 'Press inclinado',
  muscleGroup: 'pecho',
  muscleGroupLabel: 'Pectoral mayor',
  implement: 'Mancuernas',
  weightMode: 'Por mancuerna',
  suggestedSets: 3,
  suggestedReps: 10,
  suggestedWeight: 22.5,
  suggestedRir: 2,
  suggestedRestMinSeconds: 90,
  suggestedRestMaxSeconds: 120,
  notes: null,
  isActive: true,
  routineIds: [routineId],
  updatedAt: '2026-09-28T12:00:00.000Z',
};

const routine = { id: routineId, name: 'PUSH', color: 'violet' };

function mockClient() {
  return {
    read: jest.fn(async () => ({ status: 'ok' })),
    request: jest.fn(async () => ({ status: 'ok' })),
  } as unknown as MobileApiClient;
}

describe('Mobile Training exercises API', () => {
  it('parses the atomic catalog with routines and memberships', () => {
    expect(parseMobileTrainingExercisesResponse({
      catalog: { status: 'ok', data: { exercises: [exercise], routines: [routine] } },
    })).toEqual({
      catalog: { status: 'ok', data: { exercises: [exercise], routines: [routine] } },
    });
  });

  it('keeps unavailable distinct and rejects invalid membership data', () => {
    expect(parseMobileTrainingExercisesResponse({
      catalog: { status: 'unavailable' },
    })).toEqual({ catalog: { status: 'unavailable' } });
    expect(parseMobileTrainingExercisesResponse({
      catalog: {
        status: 'ok',
        data: { exercises: [{ ...exercise, routineIds: undefined }], routines: [routine] },
      },
    })).toBeUndefined();
    expect(parseMobileTrainingExercisesResponse({
      catalog: {
        status: 'ok',
        data: { exercises: [{ ...exercise, suggestedRir: 11 }], routines: [routine] },
      },
    })).toBeUndefined();
  });

  it('calls create, atomic update and desired-state status exactly once', async () => {
    const client = mockClient();
    const mutation = {
      name: exercise.name,
      muscleGroup: exercise.muscleGroup as 'pecho',
      muscleGroupLabel: exercise.muscleGroupLabel,
      implement: exercise.implement,
      weightMode: exercise.weightMode,
      suggestedSets: exercise.suggestedSets,
      suggestedReps: exercise.suggestedReps,
      suggestedWeight: exercise.suggestedWeight,
      suggestedRir: exercise.suggestedRir,
      suggestedRestMinSeconds: exercise.suggestedRestMinSeconds,
      suggestedRestMaxSeconds: exercise.suggestedRestMaxSeconds,
      notes: exercise.notes,
    };

    await fetchMobileTrainingExercises(client);
    await createMobileTrainingExercise(client, {
      exercise: mutation,
      routineIds: [routineId],
      idempotencyKey: 'stable-key',
    });
    await updateMobileTrainingExercise(client, exerciseId, mutation, [routineId]);
    await setMobileTrainingExerciseStatus(client, exerciseId, false);

    expect(client.read).toHaveBeenCalledWith(expect.objectContaining({
      path: '/api/mobile/v1/training/exercises',
    }));
    expect(client.request).toHaveBeenNthCalledWith(1, expect.objectContaining({
      method: 'POST',
      body: { exercise: mutation, routineIds: [routineId], idempotencyKey: 'stable-key' },
    }));
    expect(client.request).toHaveBeenNthCalledWith(2, expect.objectContaining({
      method: 'PATCH',
      body: { operation: 'update', exercise: mutation, routineIds: [routineId] },
    }));
    expect(client.request).toHaveBeenNthCalledWith(3, expect.objectContaining({
      method: 'PATCH',
      body: { operation: 'set_status', isActive: false },
    }));
    expect(client.request).toHaveBeenCalledTimes(3);
  });

  it('accepts a durable partial-membership warning response', () => {
    const parser = jest.fn();
    const client = {
      request: jest.fn((options: { parse: (value: unknown) => unknown }) => {
        parser.mockImplementation(options.parse);
        return Promise.resolve({ status: 'ok' });
      }),
    } as unknown as MobileApiClient;
    void createMobileTrainingExercise(client, {
      exercise: {
        name: exercise.name,
        muscleGroup: 'pecho',
        muscleGroupLabel: null,
        implement: null,
        weightMode: null,
        suggestedSets: null,
        suggestedReps: null,
        suggestedWeight: null,
        suggestedRir: null,
        suggestedRestMinSeconds: null,
        suggestedRestMaxSeconds: null,
        notes: null,
      },
      routineIds: [],
      idempotencyKey: 'key',
    });
    expect(parser({ exercise, warning: 'No pudo agregarse a la rutina.' })).toEqual({
      exercise,
      warning: 'No pudo agregarse a la rutina.',
    });
  });
});

it.each(['sand', 'stone', 'slate', 'graphite', 'future-color'])('keeps exercise memberships with new or unknown routine color %s', color => {
  const parsed = parseMobileTrainingExercisesResponse({ catalog: { status: 'ok', data: { exercises: [exercise], routines: [{ ...routine, color }] } } });
  expect(parsed?.catalog).toEqual({ status: 'ok', data: { exercises: [exercise], routines: [{ ...routine, color: color === 'future-color' ? null : color }] } });
});

it('projects identity only and passes its exact server version', async () => {
  const client = mockClient();
  await updateMobileTrainingExerciseIdentity(client, exerciseId, { ...exercise, muscleGroup: 'pecho' }, exercise.updatedAt);
  expect(client.request).toHaveBeenCalledWith(expect.objectContaining({ method: 'PATCH',
    body: { operation: 'update_identity', expectedUpdatedAt: exercise.updatedAt, exercise: {
      name: exercise.name, muscleGroup: 'pecho', muscleGroupLabel: exercise.muscleGroupLabel, implement: exercise.implement, weightMode: exercise.weightMode, notes: null,
    } } }));
});
