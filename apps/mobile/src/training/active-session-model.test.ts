import { describe, expect, it } from '@jest/globals';
import type { SessionSetDto } from '@/api/active-session';
import { appendSessionSet, compactHistoryDate, exerciseDraft, exercisePayload, historyLoadLabel, historySetLabel, moveSessionSet, quickHistoryFold, quickHistoryRows, quickHistoryTargetRir, parseStoredExerciseDraft, removeSessionSet, resetSessionSet, restoreRestDeadline, restRemaining, restSeconds, shouldSignalRestEnd, sameExercisePayload, setProgress } from './active-session-model';
import { EXERCISE_ID, SESSION_ID, VERSION, testExercise, testPayload } from './active-session-test-fixtures';

describe('native active-session product model', () => {
  it('keeps comma editing, zero and missing distinct and RIR as immutable target', () => {
    const draft = exerciseDraft(testPayload());
    draft.sets[0].actualWeightKg = '0'; draft.sets[0].actualReps = '';
    expect(exercisePayload(draft).sets[0]).toMatchObject({ actualWeightKg: 0, actualReps: null, targetRir: 2 });
    draft.sets[0].actualWeightKg = '40,5'; expect(exercisePayload(draft).sets[0].actualWeightKg).toBe(40.5);
    draft.sets[0].actualWeightKg = '40,'; expect(exercisePayload(draft).sets[0].actualWeightKg).toBe(40);
    draft.sets[0].actualWeightKg = '.'; expect(() => exercisePayload(draft)).toThrow();
  });
  it('requires reps for completed sets and keeps any-set flag separate from full progress', () => {
    const draft = appendSessionSet(exerciseDraft(testPayload()));
    draft.sets[0].isCompleted = true;
    expect(exercisePayload(draft).isCompleted).toBe(true);
    expect(setProgress(draft)).toEqual({ completed: 1, total: 2, complete: false });
    draft.sets[0].actualReps = ''; expect(() => exercisePayload(draft)).toThrow('Completá');
  });
  it('copies last values for pending new sets, renumbers removals and enforces 1..50', () => {
    let draft = appendSessionSet(exerciseDraft(testPayload()));
    expect(draft.sets[1]).toMatchObject({ setNumber: 2, actualReps: '8', actualWeightKg: '40', targetRir: 2, isCompleted: false });
    draft = removeSessionSet(draft, 0); expect(draft.sets[0].setNumber).toBe(1);
    expect(removeSessionSet(draft, 0)).toBe(draft);
    for (let i = 1; i < 50; i++) draft = appendSessionSet(draft);
    expect(appendSessionSet(draft)).toBe(draft);
  });
  it('moves complete series records, renumbers consecutively and leaves the original immutable', () => {
    const draft = appendSessionSet(appendSessionSet(exerciseDraft(testPayload())));
    draft.sets[0] = { ...draft.sets[0], actualWeightKg: '17,5', actualReps: '10', isCompleted: true, notes: 'first' };
    draft.sets[1] = { ...draft.sets[1], targetWeightKg: 20, targetReps: 12, targetRir: 1, actualWeightKg: '19', actualReps: '11', notes: 'second' };
    const moved = moveSessionSet(draft, 1, 0);
    expect(moved.sets.map(set => set.setNumber)).toEqual([1, 2, 3]);
    expect(moved.sets[0]).toEqual({ ...draft.sets[1], setNumber: 1 });
    expect(moved.sets[1]).toEqual({ ...draft.sets[0], setNumber: 2 });
    expect(draft.sets[0].notes).toBe('first');
    expect(moveSessionSet(draft, -1, 0)).toBe(draft);
    expect(moveSessionSet(draft, 0, 3)).toBe(draft);
    expect(moveSessionSet(draft, 1, 1)).toBe(draft);
    expect(removeSessionSet(moved, 1).sets.map(set => set.setNumber)).toEqual([1, 2]);
  });
  it('resets only actuals/completion/editable series notes and keeps targets and other series', () => {
    const draft = appendSessionSet(exerciseDraft(testPayload('exercise note')));
    draft.sets[0] = { ...draft.sets[0], isCompleted: true, notes: 'set note' };
    const reset = resetSessionSet(draft, 0);
    expect(reset.sets[0]).toEqual({ ...draft.sets[0], actualReps: '', actualWeightKg: '', isCompleted: false, notes: null });
    expect(reset.sets[1]).toBe(draft.sets[1]); expect(reset.notes).toBe('exercise note');
    expect(exercisePayload(reset).sets[0]).toMatchObject({ actualReps: null, actualWeightKg: null, targetReps: 8, targetWeightKg: 40, targetRir: 2 });
    expect(exercisePayload(reset).isCompleted).toBe(false);
    expect(resetSessionSet(draft, 2)).toBe(draft);
    expect(removeSessionSet(exerciseDraft(testPayload()), 0).sets).toHaveLength(1);
  });
  it('persists invalid numeric text but rejects invalid draft identity/shape', () => {
    const draft = exerciseDraft(testPayload()); draft.sets[0].actualReps = '1,,2';
    const stored = { version: 1, sessionId: SESSION_ID, sessionExerciseId: EXERCISE_ID, serverUpdatedAt: VERSION, basePayload: testPayload(), draft, writeId: 'edit:1' };
    expect(parseStoredExerciseDraft(stored, SESSION_ID, EXERCISE_ID)?.draft.sets[0].actualReps).toBe('1,,2');
    expect(parseStoredExerciseDraft(stored, 'other-session', EXERCISE_ID)).toBeNull();
    expect(parseStoredExerciseDraft({ ...stored, draft: { ...draft, sets: [] } }, SESSION_ID, EXERCISE_ID)).toBeNull();
  });
  it('compares canonical payloads independent of property order', () => {
    const a = testPayload(); const set = a.sets[0];
    const b = { ...a, sets: [{ notes: set.notes, actualReps: set.actualReps, targetRir: set.targetRir, targetReps: set.targetReps,
      actualWeightKg: set.actualWeightKg, isCompleted: set.isCompleted, targetWeightKg: set.targetWeightKg, setNumber: set.setNumber }] };
    expect(sameExercisePayload(a, b)).toBe(true);
  });
  it('restores a deadline by timestamp, validates membership and uses max then min', () => {
    const timer = { exerciseId: EXERCISE_ID, exerciseName: 'PRESS', endAt: 10000 };
    expect(restoreRestDeadline(timer, new Set([EXERCISE_ID]), 6000)).toEqual(timer);
    expect(restRemaining(timer, 7001)).toBe(3);
    expect(restRemaining(timer, 11000)).toBe(0);
    expect(restoreRestDeadline(timer, new Set(), 6000)).toBeNull();
    expect(restoreRestDeadline(timer, new Set([EXERCISE_ID]), 71000)).toBeNull();
    expect(restSeconds({ ...testExercise(), restMaxSecondsSnapshot: 0 })).toBe(90);
    expect(restSeconds({ ...testExercise(), restMinSecondsSnapshot: null, restMaxSecondsSnapshot: null })).toBeNull();
  });
  it('never fills historical actuals from targets or turns missing into zero', () => {
    expect(historySetLabel({ ...testPayload().sets[0], actualReps: null, actualWeightKg: null, targetRir: null })).toBe('Sin carga ni reps registradas');
    expect(historySetLabel({ ...testPayload().sets[0], actualWeightKg: 0 })).toContain('0 kg');
  });
  it('keeps compact history actuals truthful and retains the full date year', () => {
    const set = testPayload().sets[0];
    expect(historyLoadLabel({ ...set, actualWeightKg: 17.5, actualReps: 10 })).toBe('17,5 kg × 10');
    expect(historyLoadLabel({ ...set, actualWeightKg: 0, actualReps: 0 })).toBe('0 kg × 0');
    expect(historyLoadLabel({ ...set, actualWeightKg: null, actualReps: 10 })).toBe('10 reps');
    expect(historyLoadLabel({ ...set, actualWeightKg: 17.5, actualReps: null })).toBe('17,5 kg');
    expect(historyLoadLabel({ ...set, actualWeightKg: null, actualReps: null })).toBe('Sin carga ni reps registradas');
    expect(compactHistoryDate('2026-09-28')).toBe('28 SEP 2026');
  });
  it('groups only consecutive identical completed sets in the quick history (#513)', () => {
    const base: SessionSetDto = { ...testPayload().sets[0], actualWeightKg: 80, actualReps: 8, targetRir: 2, isCompleted: true, notes: null };
    const sets = (specs: Partial<typeof base>[]) => specs.map((spec, index) => ({ ...base, setNumber: index + 1, ...spec }));
    const pick = (rows: ReturnType<typeof quickHistoryRows>) => rows.map(row => [row.from, row.to, row.count]);
    expect(pick(quickHistoryRows(sets([{}])))).toEqual([[1, 1, 1]]);
    expect(pick(quickHistoryRows(sets([{}, {}, {}])))).toEqual([[1, 3, 3]]);
    // Different actual kg, actual reps or target RIR start a new row; null is not 0.
    expect(pick(quickHistoryRows(sets([{}, { actualWeightKg: 77.5 }, { actualReps: 7 }, { targetRir: 1 }, { targetRir: null }, { actualWeightKg: null }, { actualWeightKg: 0 }]))))
      .toEqual([[1, 1, 1], [2, 2, 1], [3, 3, 1], [4, 4, 1], [5, 5, 1], [6, 6, 1], [7, 7, 1]]);
    // A note keeps its set alone; blank notes are not notes.
    const noted = quickHistoryRows(sets([{}, { notes: ' Pausa de 2 s ' }, {}, { notes: '  ' }]));
    expect(pick(noted)).toEqual([[1, 1, 1], [2, 2, 1], [3, 4, 2]]); expect(noted[1].note).toBe('Pausa de 2 s'); expect(noted[2].note).toBeNull();
    // Incomplete sets are hidden and their numbering gap is never bridged.
    const gap = sets([{}, {}, { isCompleted: false }, {}, {}]);
    expect(pick(quickHistoryRows(gap))).toEqual([[1, 2, 2], [4, 5, 2]]);
    expect(quickHistoryRows(sets([{ isCompleted: false }]))).toEqual([]);
    const twelve = quickHistoryRows(sets(Array.from({ length: 12 }, (_, i) => ({ actualReps: 8 - (i % 3) }))));
    expect(twelve).toHaveLength(12); expect(twelve.reduce((total, row) => total + row.count, 0)).toBe(12);
  });
  it('shows the target RIR once only when every completed set shares it, and folds long sessions visually', () => {
    const set = { ...testPayload().sets[0], isCompleted: true };
    expect(quickHistoryTargetRir([{ ...set, targetRir: 2 }, { ...set, targetRir: 2 }, { ...set, targetRir: 0, isCompleted: false }])).toBe(2);
    expect(quickHistoryTargetRir([{ ...set, targetRir: 0 }, { ...set, targetRir: 0 }])).toBe(0);
    expect(quickHistoryTargetRir([{ ...set, targetRir: 2 }, { ...set, targetRir: 1 }])).toBe('mixed');
    expect(quickHistoryTargetRir([{ ...set, targetRir: 2 }, { ...set, targetRir: null }])).toBe('mixed');
    expect(quickHistoryTargetRir([{ ...set, targetRir: null }, { ...set, targetRir: null }])).toBeNull();
    expect(quickHistoryTargetRir([])).toBeNull();
    const row = (from: number, count = 1) => ({ from, to: from + count - 1, count, actualWeightKg: 80, actualReps: 8, targetRir: 2, note: null });
    const six = [1, 2, 3, 4, 5, 6].map(n => row(n));
    expect(quickHistoryFold(six, false)).toEqual({ shown: six, hiddenSets: 0 });
    const seven = [row(1), row(2), row(3), row(4), row(5), row(6, 3), row(9)];
    expect(quickHistoryFold(seven, false)).toEqual({ shown: seven.slice(0, 5), hiddenSets: 4 });
    expect(quickHistoryFold(seven, true)).toEqual({ shown: seven, hiddenSets: 0 });
  });
  it('keeps stable logical row identities through reorder/reset/remove and out of the wire payload', () => {
    const draft = appendSessionSet(exerciseDraft(testPayload())); const ids = draft.sets.map(set => set.localId);
    expect(new Set(ids).size).toBe(2);
    expect(moveSessionSet(draft, 0, 1).sets.map(set => set.localId)).toEqual([...ids].reverse());
    expect(resetSessionSet(draft, 0).sets[0].localId).toBe(ids[0]);
    expect(removeSessionSet(draft, 0).sets[0].localId).toBe(ids[1]);
    expect(exercisePayload(draft).sets[0]).not.toHaveProperty('localId');
    const legacy = { version: 1, sessionId: SESSION_ID, sessionExerciseId: EXERCISE_ID, serverUpdatedAt: VERSION,
      basePayload: testPayload(), draft: { ...draft, sets: draft.sets.map(({ localId: _localId, ...set }) => set) }, writeId: 'legacy' };
    const restored = parseStoredExerciseDraft(legacy, SESSION_ID, EXERCISE_ID)!;
    expect(restored.draft.sets.every(set => typeof set.localId === 'string')).toBe(true);
  });
});

describe('rest-end haptic', () => {
  const timer = { exerciseId: 'e', exerciseName: 'Press', endAt: 100_000 };
  it('fires only when the countdown is seen crossing zero live', () => {
    expect(shouldSignalRestEnd(1, 0, timer, 100_400)).toBe(true);
    expect(shouldSignalRestEnd(null, 0, timer, 100_400)).toBe(false); // already done when shown
    expect(shouldSignalRestEnd(0, 0, timer, 100_400)).toBe(false); // no repeat
    expect(shouldSignalRestEnd(5, 4, timer, 96_000)).toBe(false); // still counting
    expect(shouldSignalRestEnd(40, 0, timer, 160_000)).toBe(false); // back from background long after
  });
});
