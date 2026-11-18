import { describe, expect, it } from '@jest/globals';
import { parseTrainingExerciseHistory } from '@/api/training-history';
import { repsOverWeights, setChips } from '@/training/history-model';
import { groupsOf, lastText, lastValue, manyUncompared, timesOf, type ListEntry } from './exercise-list';

/** Ejercicios más claros: the marks, words and groups the list and one exercise draw. Fictitious values only. */
const recent = (...pcts: number[]) => ({ basis: 'reps_at_load' as const, items: pcts.map(pct => ({ date: '2026-11-17', pct })) });
const entry = (exposures: number, times: string | undefined, pcts: number[] = []) => ({ lane: 'strict', row: { exerciseId: `e${exposures}${times}`, name: 'Remo', exposures, times, recent: recent(...pcts) } }) as unknown as ListEntry;

describe('las últimas veces de un ejercicio', () => {
  it('reads one mark per time, the gaps kept; an older server falls back to its measured results only', () => {
    expect(timesOf({ times: 'usdUSDn', recent: undefined })).toEqual(['up', 'same', 'down', 'up', 'same', 'down', 'none']);
    expect(timesOf({ times: undefined, recent: recent(5, 0, -3) })).toEqual(['up', 'same', 'down']);
    expect(manyUncompared(['none', 'none', 'up', 'same'])).toBe(true);
    expect(manyUncompared(['none', 'up', 'same', 'same'])).toBe(false);
  });
  it('says the last time: its percentage, a load step in words, «=» or «—», never a 0 for a gap', () => {
    expect(lastValue({ times: 'su', recent: recent(4, 11.1) }).value).toBe('+11 %');
    expect(lastValue({ times: 'ud', recent: recent(4, -33.3) }).value).toBe('−33 %');
    expect(lastValue({ times: 'sD', recent: recent(0) })).toMatchObject({ value: '↓ peso', mark: 'down' });
    expect(lastValue({ times: 'us', recent: recent(4, 0) }).value).toBe('=');
    expect(lastValue({ times: 'un', recent: recent(4) })).toMatchObject({ value: '—', mark: 'none' });
  });
  it('writes what the last time was as recorded, plates by name, the same value once', () => {
    expect(lastText({ times: 'u', recent: recent(11), lastShown: { anchor: 7.5, from: 18, to: 20 } })).toBe('7,5 kg · 18 → 20 reps');
    expect(lastText({ times: 's', recent: recent(0), lastShown: { anchor: 20, from: 12, to: 12 } })).toBe('20 kg · 12 reps');
    expect(lastText({ times: 'D', recent: undefined, lastShown: { anchor: 15, from: 50, to: 35 } })).toBe('50 → 35 kg · 15 reps');
    expect(lastText({ times: 'U', recent: undefined, lastShown: { anchor: 20, from: 9, to: 10, plates: true } })).toBe('9 → 10 lingotes · 20 reps');
    expect(lastText({ times: 'n', recent: undefined, lastShown: null })).toBeNull();
  });
  it('groups by how the last time ended; the ones done once go apart', () => {
    const groups = groupsOf([entry(5, 'uu', [1, 2]), entry(4, 'us', [1, 0]), entry(3, 'un', [1]), entry(1, 'n')]);
    expect([groups.changed.length, groups.same.length, groups.none.length, groups.single.length]).toEqual([1, 1, 1, 1]);
  });
});

describe('un ejercicio', () => {
  const session = (id: string, date: string, weightKg: number | null, reps: number | null) => ({ sessionId: id, logDate: date, mark: { weightKg, reps } });
  it('draws reps over a band per weight, oldest first, with a missing value as a gap', () => {
    const { points, bands } = repsOverWeights([session('c', '2026-11-17', 20, 12), session('b', '2026-11-14', 20, null), session('a', '2026-11-10', 17.5, 12)]);
    expect(points.map(point => point.reps)).toEqual([12, null, 12]);
    expect(bands).toEqual([{ weight: 17.5, start: 0, end: 0 }, { weight: 20, start: 1, end: 2 }]);
  });
  it('marks the set that is the session\'s mark, and says when all sets share a weight', () => {
    expect(setChips([{ weightKg: 20, reps: 11 }, { weightKg: 20, reps: 12 }, { weightKg: 20, reps: 12 }], { weightKg: 20, reps: 12 }))
      .toEqual({ chips: [{ reps: 11, weight: 20, best: false }, { reps: 12, weight: 20, best: true }, { reps: 12, weight: 20, best: false }], oneWeight: true });
    expect(setChips(undefined, null)).toBeNull();
  });
  it('accepts the optional sets and rejects a malformed one, never reading it as no sets', () => {
    const base = { exercise: { id: '34300000-0000-4000-8000-000000000003', name: 'REMO', muscleGroup: null, muscleLabel: null, implement: null, weightMode: null }, best: null, hasMore: false, latest: null };
    const row = { sessionId: '34300000-0000-4000-8000-000000000001', logDate: '2026-11-17', routineName: 'PULL', mark: { weightKg: 20, reps: 12 }, completedSets: 1, rirValues: [] };
    expect(parseTrainingExerciseHistory({ ...base, sessions: [{ ...row, sets: [{ weightKg: 20, reps: 12 }] }] })?.sessions[0]?.sets).toEqual([{ weightKg: 20, reps: 12 }]);
    expect(parseTrainingExerciseHistory({ ...base, sessions: [row] })?.sessions[0]).not.toHaveProperty('sets');
    expect(parseTrainingExerciseHistory({ ...base, sessions: [{ ...row, sets: [{ weightKg: -1, reps: 12 }] }] })).toBeUndefined();
    expect(parseTrainingExerciseHistory({ ...base, sessions: [{ ...row, sets: 'x' }] })).toBeUndefined();
  });
});
