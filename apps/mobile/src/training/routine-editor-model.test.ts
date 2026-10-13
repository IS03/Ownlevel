import { describe, expect, it } from '@jest/globals';

import type { MobileTrainingExercise } from '@/api/exercises';
import { detailFixture } from '@/api/routine-editor.fixture';

import {
  appendExercises, changeRest, restWheelValues, validateTargetsDraft, addSet, draftFromTargets, isTargetsDirty, pickerExercises, removeSet,
  reorderTemplate, targetsFromCatalog, targetsFromDraft, templatePayload, toggleAdjustment,
} from './routine-editor-model';

const exercise: MobileTrainingExercise = {
  id: '44444444-4444-4444-8444-444444444444', name: 'Dominadas',
  muscleGroup: 'espalda', muscleGroupLabel: null, implement: 'Peso corporal',
  weightMode: 'Peso corporal', suggestedSets: 2, suggestedReps: 8,
  suggestedWeight: 0, suggestedRir: null, suggestedRestMinSeconds: 90,
  suggestedRestMaxSeconds: 120, notes: null, isActive: true, routineIds: [],
  updatedAt: '2026-09-28T12:00:00Z',
};

describe('routine editor model', () => {
  it('round-trips null, zero, custom adjustment and hidden legacy set notes', () => {
    const confirmed = detailFixture.items[0]!.targets;
    const draft = draftFromTargets(confirmed);
    expect(isTargetsDirty(draft, confirmed)).toBe(false);
    expect(targetsFromDraft(draft)).toEqual(confirmed);
    expect(templatePayload(detailFixture).items[0]!.targets.sets[0]!.notes).toBe('Legacy set note');
    expect(toggleAdjustment('custom', 'increase_weight')).toBe('increase_weight');
    expect(toggleAdjustment('increase_weight', 'increase_weight')).toBe('maintain');
  });

  it('adds by duplicating last values, removes and renumbers, enforces limits', () => {
    const draft = draftFromTargets(detailFixture.items[0]!.targets);
    const added = addSet(draft);
    expect(added.sets).toHaveLength(2);
    expect(added.sets[1]).toEqual({ targetReps: '0', targetWeightKg: '', targetRir: '0', notes: null });
    expect(targetsFromDraft(added).sets.map((set) => set.setNumber)).toEqual([1, 2]);
    expect(targetsFromDraft(removeSet(added, 0)).sets[0]!.setNumber).toBe(1);
    expect(() => removeSet(draft, 0)).toThrow();
    expect(() => addSet({ ...draft, sets: Array(50).fill(draft.sets[0]) })).toThrow();
  });

  it('rejects invalid targets without silently replacing null with zero', () => {
    const draft = draftFromTargets(detailFixture.items[0]!.targets);
    expect(() => targetsFromDraft({ ...draft, sets: [{ ...draft.sets[0]!, targetReps: '1.5' }] })).toThrow();
    expect(() => targetsFromDraft({ ...draft, sets: [{ ...draft.sets[0]!, targetWeightKg: '1.999' }] })).toThrow();
    expect(() => targetsFromDraft({ ...draft, restMin: '2:00', restMax: '1:30' })).toThrow();
  });

  it('builds new exercise targets from catalog defaults, not invented values', () => {
    expect(targetsFromCatalog(exercise)).toMatchObject({
      restMinSeconds: 90, restMaxSeconds: 120,
      sets: [{ setNumber: 1, targetWeightKg: 0 }, { setNumber: 2, targetWeightKg: 0 }],
    });
    expect(targetsFromCatalog({ ...exercise, suggestedSets: null }).sets).toHaveLength(1);
    expect(() => targetsFromCatalog({ ...exercise, suggestedSets: 51 })).toThrow();
  });

  it('excludes duplicates/archived, filters local search and moves only array order', () => {
    const archived = { ...exercise, id: '55555555-5555-4555-8555-555555555555', isActive: false };
    expect(pickerExercises([exercise, archived], new Set(), 'DOMINADAS', 'espalda')).toEqual([exercise]);
    expect(pickerExercises([exercise], new Set([exercise.id]), '', null)).toEqual([]);
    const payload = templatePayload({ ...detailFixture, items: [detailFixture.items[0]!, {
      ...detailFixture.items[0]!, routineExerciseId: '66666666-6666-4666-8666-666666666666', exerciseOrder: 2,
      exercise: { ...detailFixture.items[0]!.exercise, id: exercise.id },
    }] });
    expect(reorderTemplate(payload, 1, -1).items.map((item) => item.exerciseId)).toEqual([exercise.id, detailFixture.items[0]!.exercise.id]);
    expect(payload.items[0]!.routineExerciseId).toBe(detailFixture.items[0]!.routineExerciseId);
  });
});


describe('routine editor rest wheels and multiple selection', () => {
  it('keeps empty distinct from zero and includes the exact saved off-grid value', () => {
    expect(restWheelValues('').slice(0, 3)).toEqual([null, 0, 15]);
    expect(restWheelValues('2:20')).toContain(140);
    expect(restWheelValues('2:20')).toHaveLength(243);
    expect(restWheelValues('60:00').at(-1)).toBe(3600);
    const draft = { ...draftFromTargets(detailFixture.items[0]!.targets), restMin: '2:20', restMax: '3:00' };
    expect(targetsFromDraft(draft).restMinSeconds).toBe(140);
    expect(changeRest(draft, 'restMax', 240).restMin).toBe('2:20');
    expect(changeRest(draft, 'restMin', 300)).toMatchObject({ restMin: '3:00', restMax: '3:00' });
    expect(changeRest(draft, 'restMax', 60)).toMatchObject({ restMin: '2:20', restMax: '2:20' });
    expect(targetsFromDraft(changeRest(draft, 'restMin', null))).toMatchObject({ restMinSeconds: null, restMaxSeconds: 180 });
    expect(targetsFromDraft(changeRest(draft, 'restMin', 0))).toMatchObject({ restMinSeconds: 0, restMaxSeconds: 180 });
  });
  it('adds all selections in click order without altering existing targets, rejecting duplicates/archived', () => {
    const second = { ...exercise, id: '77777777-7777-4777-8777-777777777777', name: 'Aperturas' };
    const payload = appendExercises(detailFixture, [exercise, second]);
    expect(payload.expectedTemplateVersion).toBe(3);
    expect(payload.items.map(item => item.exerciseId)).toEqual([detailFixture.items[0]!.exercise.id, exercise.id, second.id]);
    expect(payload.items[0]!.targets).toEqual(detailFixture.items[0]!.targets);
    expect(() => appendExercises(detailFixture, [exercise, exercise])).toThrow();
    expect(() => appendExercises(detailFixture, [{ ...exercise, isActive: false }])).toThrow();
    expect(() => appendExercises(detailFixture, [{ ...exercise, id: detailFixture.items[0]!.exercise.id }])).toThrow();
  });
  it('reports validation against specific cells and the notes field without dropping the draft', () => {
    const draft = draftFromTargets(detailFixture.items[0]!.targets);
    const invalid = { ...draft, notes: 'x'.repeat(1001), sets: [{ ...draft.sets[0]!, targetWeightKg: '1.999', targetReps: '1.2' }] };
    expect(validateTargetsDraft(invalid)).toMatchObject({ 'sets.0.targetWeightKg': expect.any(String), 'sets.0.targetReps': expect.any(String), notes: expect.any(String) });
    expect(validateTargetsDraft({ ...draft, notes: 'x'.repeat(1000) })).toEqual({});
    expect(invalid.sets[0]!.targetWeightKg).toBe('1.999');
  });
});
