import { describe, expect, it } from '@jest/globals';

import { parseMobileHomeResponse, type MobileHomeResponse } from './home';

const home: MobileHomeResponse = {
  date: '2026-09-21',
  profile: { status: 'ok', data: { displayName: 'Nacho' } },
  nutrition: {
    status: 'ok',
    data: {
      calories: 0,
      calorieTarget: 2_200,
      proteinG: 0,
      proteinTargetG: 140,
      mealCount: 0,
      waterL: null,
      waterTargetL: 3,
      energyBalanceKcal: 0,
    },
  },
  training: {
    activeSession: { status: 'ok', data: null },
    workoutStartRoutines: {
      status: 'ok',
      data: [
        {
          id: 'routine-push',
          name: 'Push',
          color: 'violet',
          exerciseCount: 6,
          setCount: 18,
        },
      ],
    },
    week: {
      status: 'ok',
      data: {
        summary: {
          weekStart: '2026-09-21',
          weekEnd: '2026-09-27',
          sessions: 0,
          sets: 0,
          minutes: 0,
          routines: {},
          muscleGroups: {},
          trainingDays: [],
        },
        todaySessions: [],
      },
    },
  },
};

describe('Mobile Home runtime parser', () => {
  it('accepts valid empty collections, null absence, and real zeroes', () => {
    expect(parseMobileHomeResponse(home)).toEqual(home);
  });

  it('preserves explicit partial unavailable blocks', () => {
    expect(
      parseMobileHomeResponse({
        ...home,
        nutrition: { status: 'unavailable' },
      }),
    ).toEqual({ ...home, nutrition: { status: 'unavailable' } });
  });

  it('parses weekly routines, muscles, and workout-start routines', () => {
    const expanded = {
      ...home,
      training: {
        ...home.training,
        week: {
          status: 'ok' as const,
          data: {
            ...(home.training.week.status === 'ok'
              ? home.training.week.data
              : { summary: {}, todaySessions: [] }),
            summary: {
              ...(home.training.week.status === 'ok'
                ? home.training.week.data.summary
                : {}),
              routines: { Push: 2, Pull: 1 },
              muscleGroups: { Pecho: 18, Tríceps: 12 },
            },
          },
        },
      },
    };

    expect(parseMobileHomeResponse(expanded)).toEqual(expanded);
  });

  it('preserves workout-start routines unavailable independently', () => {
    expect(
      parseMobileHomeResponse({
        ...home,
        training: {
          ...home.training,
          workoutStartRoutines: { status: 'unavailable' },
        },
      }),
    ).toEqual({
      ...home,
      training: {
        ...home.training,
        workoutStartRoutines: { status: 'unavailable' },
      },
    });
  });

  it('rejects missing or corrupted values rather than inventing zero', () => {
    expect(
      parseMobileHomeResponse({
        ...home,
        nutrition: {
          status: 'ok',
          data: {
            ...(home.nutrition.status === 'ok' ? home.nutrition.data : {}),
            calories: null,
          },
        },
      }),
    ).toBeNull();
    expect(parseMobileHomeResponse({ date: home.date })).toBeNull();
  });
});

it.each(['sand', 'stone', 'slate', 'graphite', 'future-color'])('preserves Home routine with new or unknown color %s', color => {
  const routine = home.training.workoutStartRoutines.status === 'ok' ? home.training.workoutStartRoutines.data[0] : undefined;
  const parsed = parseMobileHomeResponse({ ...home, training: { ...home.training, workoutStartRoutines: { status: 'ok', data: [{ ...routine, color }] } } });
  expect(parsed?.training.workoutStartRoutines).toEqual({ status: 'ok', data: [{ ...routine, color: color === 'future-color' ? null : color }] });
});
