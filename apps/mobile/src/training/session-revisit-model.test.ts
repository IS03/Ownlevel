import { describe, expect, it } from '@jest/globals';
import type { SessionDetailDto, SessionSetDto } from '@/api/active-session';
import type { SessionSummaryDto } from '@/api/session-summary';
import { revisitModel, setsLine } from './session-revisit-model';
import { SESSION_ID, testDetail, testExercise } from './active-session-test-fixtures';

const A = '44444444-4444-4444-8444-444444444444', B = '55555555-5555-4555-8555-555555555555', C = '66666666-6666-4666-8666-666666666666';
const PREV = '77777777-7777-4777-8777-777777777777';
const set = (n: number, weight: number | null, reps: number | null, done = true): SessionSetDto =>
  ({ setNumber: n, targetReps: null, targetWeightKg: null, targetRir: null, actualReps: reps, actualWeightKg: weight, isCompleted: done, notes: null });
function detail(): SessionDetailDto {
  const value = testDetail();
  value.session = { ...value.session, status: 'completed', endedAt: '2026-09-30T13:34:01.000000+00:00',
    metadata: { ...value.session.metadata, energyLevel: 4, painLevel: 0, notes: ' Buen día ' } };
  const press = { ...testExercise(A, 1), nameSnapshot: 'PRESS INCLINADO', muscleGroupLabelSnapshot: 'Pecho', weightModeSnapshot: 'Por mancuerna' };
  press.payload = { ...press.payload, notes: 'Hombro bien', sets: [set(1, 20, 7), set(2, 17.5, 8), set(3, 17.5, 10)] };
  const dips = { ...testExercise(B, 2), nameSnapshot: 'FONDOS', muscleGroupSnapshot: 'tríceps' as const, weightModeSnapshot: 'Peso corporal' };
  dips.payload = { ...dips.payload, sets: [set(1, null, 12), set(2, null, 10)] };
  const fly = { ...testExercise(C, 3), nameSnapshot: 'APERTURAS', muscleGroupLabelSnapshot: 'Pecho' };
  fly.payload = { ...fly.payload, sets: [set(1, 30, 10, false)] };
  value.exercises = [fly, press, dips];
  return value;
}
const previous = (sets: { weightKg: number | null; reps: number | null }[]) => ({ sessionId: PREV, endedAt: '2026-09-26T13:00:00Z', sets });
function summary(): SessionSummaryDto {
  return { sessionId: SESSION_ID, volumeKg: 455, highlights: [
    { kind: 'record', exerciseId: A, name: 'PRESS INCLINADO', weightMode: 'Por mancuerna', mark: { weightKg: 20, reps: 7 }, previous: { weightKg: 17.5, reps: 9 } }],
  exercises: [
    { sessionExerciseId: A, exerciseId: A, status: 'improved', change: { kind: 'weight', amount: 2.5 }, previous: previous([{ weightKg: 17.5, reps: 8 }, { weightKg: 17.5, reps: 9 }]) },
    { sessionExerciseId: B, exerciseId: B, status: 'improved', change: { kind: 'reps', amount: 1 }, previous: previous([{ weightKg: null, reps: 11 }]) },
    { sessionExerciseId: C, exerciseId: C, status: 'first', change: null, previous: null },
  ] };
}

describe('SF1 · a session seen again', () => {
  it('says what is true: sets and time, then records and improvements only when the summary says so', () => {
    const model = revisitModel(detail(), summary());
    expect(model.sentence).toBe('5 series en 1 h 34 min.');
    expect(model.achievement).toBe('1 récord y 1 ejercicio mejor que la última vez.');
    expect(model.line).toBe('455 kg movidos · 2 de 3 ejercicios');
    expect(model.note).toBe('Buen día');
    const plain = revisitModel(detail());
    expect(plain.achievement).toBeNull();
    expect(plain.exercises.every(exercise => exercise.status === null && exercise.sets.every(row => row.before === null && !row.record))).toBe(true);
    expect(revisitModel(detail(), { ...summary(), sessionId: PREV }).achievement).toBeNull();
  });
  it('feelings only when answered: a recorded 0 pain is shown', () => {
    expect(revisitModel(detail()).feelings).toEqual([
      { key: 'energyLevel', label: 'Energía', value: 4, scale: 5 }, { key: 'painLevel', label: 'Dolor', value: 0, scale: 10 }]);
  });
  it('sets per muscle group from completed sets only, biggest first', () => {
    expect(revisitModel(detail()).muscles).toEqual([{ label: 'Pecho', sets: 3 }, { label: 'Tríceps', sets: 2 }]);
  });
  it('each exercise: its line, its status, "antes" set by set and the record on the set that made it', () => {
    const [press, dips, fly] = revisitModel(detail(), summary()).exercises;
    expect(press).toMatchObject({ name: 'PRESS INCLINADO', line: '20×7 · 17,5×8 · 17,5×10 kg', note: 'Hombro bien', status: { kind: 'record', label: 'récord 20 kg' } });
    expect(press.sets.map(row => [row.label, row.before, row.record])).toEqual([['20 kg × 7', '17,5×8', true], ['17,5 kg × 8', '17,5×9', false], ['17,5 kg × 10', null, false]]);
    expect(dips).toMatchObject({ line: '12 · 10 reps', status: { kind: 'improved', label: '↗ 1 rep' } });
    expect(dips.sets[0].before).toBe('11');
    expect(fly).toMatchObject({ done: false, line: 'no hecha', status: { kind: 'first', label: 'primera vez' } });
  });
  it('labels drops with an arrow and the same as "="; not comparable shows nothing', () => {
    const data = summary();
    data.highlights = [];
    data.exercises[0] = { ...data.exercises[0], status: 'declined', change: { kind: 'weight', amount: -2.5 } };
    data.exercises[1] = { ...data.exercises[1], status: 'same', change: null };
    data.exercises[2] = { ...data.exercises[2], status: 'not_comparable', previous: null };
    const [press, dips, fly] = revisitModel(detail(), data).exercises;
    expect([press.status?.label, dips.status?.label, fly.status]).toEqual(['↘ 2,5 kg', '=', null]);
    expect(revisitModel(detail(), data).achievement).toBeNull();
    data.exercises[0] = { ...data.exercises[0], status: 'declined', change: { kind: 'volume', amount: -152 } };
    data.exercises[1] = { ...data.exercises[1], status: 'improved', change: { kind: 'volume', amount: 2 } };
    expect(revisitModel(detail(), data).exercises.slice(0, 2).map(exercise => exercise.status?.label)).toEqual(['↘ 152 kg en total', '↗ 2 reps en total']);
  });
  it('lines keep missing values out', () => {
    expect(setsLine([set(1, null, null), set(2, 40, null)], 'Peso total')).toBe('40 kg');
    expect(setsLine([set(1, 5, 10)], 'Lingotes (no kg)')).toBe('5×10 placas');
  });
});
