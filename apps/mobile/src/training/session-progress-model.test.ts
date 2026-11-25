import { describe, expect, it } from '@jest/globals';
import type { SessionSetDto } from '@/api/active-session';
import { exerciseDraft } from './active-session-model';
import { detailProgress, liveProgress } from './session-progress-model';
import { EXERCISE_ID, SECOND_ID, testDetail } from './active-session-test-fixtures';

const set = (patch: Partial<SessionSetDto> = {}): SessionSetDto =>
  ({ setNumber: 1, targetReps: null, targetWeightKg: null, targetRir: null, actualReps: null, actualWeightKg: null, isCompleted: false, notes: null, ...patch });

describe('live progress (#645)', () => {
  it('counts every set like the session screen and names the first pending one with its plan', () => {
    const progress = liveProgress([
      { name: 'PRESS', weightMode: 'Peso total', sets: [set({ isCompleted: true }), set({ isCompleted: true })] },
      { name: 'SENTADILLA', weightMode: 'Peso total', sets: [set({ isCompleted: true }), set({ targetReps: 8, targetWeightKg: 100 }), set()] },
    ]);
    expect(progress).toEqual({ completedSets: 3, totalSets: 5, next: { exerciseName: 'SENTADILLA', set: 'Serie 2 de 3', load: '100 kg × 8' } });
  });
  it('what was typed wins over the plan; nothing known reads without a load, never 0', () => {
    expect(liveProgress([{ name: 'REMO', weightMode: 'Por mancuerna', sets: [set({ targetReps: 10, targetWeightKg: 20, actualWeightKg: 22.5 })] }])?.next)
      .toEqual({ exerciseName: 'REMO', set: 'Serie 1 de 1', load: '22,5 kg × 10' });
    expect(liveProgress([{ name: 'DOMINADAS', weightMode: 'Peso corporal', sets: [set()] }])?.next).toEqual({ exerciseName: 'DOMINADAS', set: 'Serie 1 de 1', load: null });
  });
  it('a warm-up reads as such and the working sets keep their own numbering', () => {
    const sets = [set({ setKind: 'warmup' }), set({ setKind: 'work' }), set({ setKind: 'work' })];
    expect(liveProgress([{ name: 'PESO MUERTO', weightMode: 'Peso total', sets }])?.next?.set).toBe('Calentamiento');
    expect(liveProgress([{ name: 'PESO MUERTO', weightMode: 'Peso total', sets: [{ ...sets[0], isCompleted: true }, sets[1], sets[2]] }])?.next?.set).toBe('Serie 1 de 2');
  });
  it('all done: no next set; no exercises: nothing to show', () => {
    expect(liveProgress([{ name: 'A', weightMode: null, sets: [set({ isCompleted: true })] }])).toEqual({ completedSets: 1, totalSets: 1, next: null });
    expect(liveProgress([])).toBeNull();
  });
  it('from a detail in session order, with this device\'s unsent drafts on top', () => {
    const detail = testDetail();
    detail.exercises[0] = { ...detail.exercises[0], order: 2, nameSnapshot: 'SEGUNDO', payload: { ...detail.exercises[0].payload, sets: [set()] } };
    detail.exercises[1] = { ...detail.exercises[1], order: 1, nameSnapshot: 'PRIMERO' };
    const plain = detailProgress(detail);
    expect(plain?.next?.exerciseName).toBe('PRIMERO');
    const second = detail.exercises.find(exercise => exercise.id === SECOND_ID)!;
    const draft = exerciseDraft(second.payload);
    draft.sets = draft.sets.map(row => ({ ...row, isCompleted: true }));
    const withDraft = detailProgress(detail, new Map([[SECOND_ID, draft]]));
    expect(withDraft?.completedSets).toBe((plain?.completedSets ?? 0) + second.payload.sets.filter(row => !row.isCompleted).length);
    expect(detail.exercises.find(exercise => exercise.id === EXERCISE_ID)?.nameSnapshot).toBe('SEGUNDO');
    expect(withDraft?.next?.exerciseName).toBe('SEGUNDO');
  });
});
