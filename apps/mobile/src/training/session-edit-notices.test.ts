import { describe, expect, it } from '@jest/globals';
import { swipeSettlesOpen } from './session-native-interactions';
import { draftIncomplete, type SessionExerciseDraft } from './active-session-model';

describe('Series swipe settles by the direction of the gesture', () => {
  const width = 152;
  it('an open row closes after a short move or a flick to the right', () => {
    expect(swipeSettlesOpen(-width, -width + 30, 0)).toBe(false);
    expect(swipeSettlesOpen(-width, -width + 10, 400)).toBe(false);
    expect(swipeSettlesOpen(-width, -width + 10, 0)).toBe(true);
    expect(swipeSettlesOpen(-width, -width, -200)).toBe(true);
  });
  it('a closed row opens past 42 pt or with a firm flick left, and a tiny drift stays closed', () => {
    expect(swipeSettlesOpen(0, -50, 0)).toBe(true);
    expect(swipeSettlesOpen(0, -20, -700)).toBe(true);
    expect(swipeSettlesOpen(0, -5, -700)).toBe(false);
    expect(swipeSettlesOpen(0, -30, 0)).toBe(false);
  });
});

describe('A value half typed is not an error yet', () => {
  const set = (patch: Partial<SessionExerciseDraft['sets'][number]>) => ({ localId: 'a', setNumber: 1, targetReps: 10, targetWeightKg: 60, targetRir: 2,
    actualReps: '10', actualWeightKg: '60', isCompleted: true, notes: null, ...patch });
  const draft = (sets: SessionExerciseDraft['sets']) => ({ sets, notes: '', decision: 'keep', decisionNote: '', applyToRoutine: false } as unknown as SessionExerciseDraft);
  it('a ticked set with its reps cleared is incomplete; a full one is not', () => {
    expect(draftIncomplete(draft([set({ actualReps: '' })]))).toBe(true);
    expect(draftIncomplete(draft([set({})]))).toBe(false);
    expect(draftIncomplete(draft([set({ actualReps: '', isCompleted: false })]))).toBe(false);
  });
});
