import { describe, expect, it } from '@jest/globals';
import type { ExerciseEvidence, PerformanceChange } from '@/api/performance-insights';
import { evidenceSentence, loadStep } from './comparison-change';
import { arrivalTimelineOf, rowChangeOf, timelineLabel } from './comparison-arrival';

/** Comparaciones más claras: the words and marks the screens draw. Fictitious values only. */
type Signal = ExerciseEvidence['evidence'][number];
const signal = (kind: Signal['kind'], anchor: number | null, reference: number, current: number): Signal =>
  ({ kind, anchor, reference, current, delta: current - reference, currentSetIds: [], referenceSetIds: [] }) as unknown as Signal;
const pairs = (...changes: (number | null)[]) => changes.map((change, index) => ({ number: index + 1, change }));

describe('frase del ejercicio', () => {
  it('says the best set was equal, and the set that went up, so it never contradicts the «=»', () => {
    expect(evidenceSentence({ evidence: [signal('reps_at_load', 20, 12, 12)] }, 'same_record', pairs(0, 0, 1), 'kg'))
      .toBe('Todo a 20 kg. Tu mejor serie fue igual (12 reps), así que da =. En la serie 3 hiciste una más.');
    expect(evidenceSentence({ evidence: [signal('reps_at_load', 7.5, 18, 20)] }, 'improved', pairs(2), 'kg'))
      .toBe('Todo a 7,5 kg. Tu mejor serie pasó de 18 a 20 reps.');
  });
  it('a load step is said as such, never as a percentage; an unclear result gets no sentence', () => {
    const load = { evidence: [signal('load_at_reps', 10, 27.5, 30)] };
    expect(evidenceSentence(load, 'improved', [], 'kg')).toMatch(/No se compara en %/);
    expect(loadStep(load, 'kg')).toEqual({ up: true, text: '27,5 → 30 kg' });
    expect(loadStep({ evidence: [signal('load_at_reps', 10, 30, 27.5), signal('load_at_reps', 8, 25, 30)] }, 'kg')).toBeNull();
    expect(evidenceSentence({ evidence: [signal('reps_at_load', 20, 12, 13)] }, 'ambiguous_evidence', [], 'kg')).toBeNull();
  });
});

describe('marca de cada ejercicio', () => {
  const measured = (pct: number): PerformanceChange => ({ state: 'measured', pct, basis: 'reps_at_load', signals: 1, load: { unit: 'kg', up: 0, same: 1, down: 0 } });
  it('draws the measured change, a kg load step, «igual», or says why there is none', () => {
    expect(rowChangeOf(measured(11.1), 'strict', 'improved')).toEqual({ kind: 'pct', pct: 11.1 });
    expect(rowChangeOf({ state: 'no_amount_signal', pct: null, basis: null, signals: 0, load: { unit: 'kg', up: 1, same: 0, down: 0 } }, 'strict', 'improved')).toEqual({ kind: 'load', up: true });
    // Plates are never «peso»; an equal reading without a percentage is a hollow mark, not a zero bar.
    expect(rowChangeOf({ state: 'no_amount_signal', pct: null, basis: null, signals: 0, load: { unit: 'lingote', up: 1, same: 0, down: 0 } }, 'partial', 'higher_record').kind).toBe('none');
    expect(rowChangeOf(undefined, 'partial', 'same_record')).toEqual({ kind: 'same' });
    expect(rowChangeOf(undefined, 'strict', 'insufficient_comparison')).toEqual({ kind: 'none', text: 'Sin comparar' });
  });
});

describe('línea de «Cómo llegaste»', () => {
  it('places only meals with a checked time and counts the rest; says what is missing', () => {
    const rows = [
      { at: '2026-11-17T14:00:00.000Z', timeEvidence: 'explicit', calories: 600 },
      { at: '2026-11-17T19:00:00.000Z', timeEvidence: 'unverified', calories: 300 },
      { at: null, timeEvidence: 'unknown', calories: null },
    ];
    const timeline = arrivalTimelineOf({ before: { evidence: { rows } } } as never);
    expect(timeline.meals).toEqual([{ at: Date.parse('2026-11-17T14:00:00.000Z'), calories: 600 }]);
    expect(timeline.uncertain).toBe(2);
    expect(arrivalTimelineOf(undefined)).toEqual({ meals: [], uncertain: 0 });
    expect(timelineLabel(0, 'some', null, null)).toBe('Las 12 horas antes de entrenar: sueño sin registrar, sin comidas con hora, y hay comidas sin hora comprobada');
  });
});
