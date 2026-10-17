import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { SessionDetailDto, SessionSetDto } from '@/api/active-session';
import type { SessionSummaryDto, SessionSummaryLoader } from '@/api/session-summary';
import { OwnlevelThemeProvider } from '@/design-system';
import { PostWorkoutScreen } from './post-workout-screen';
import { postWorkoutModel } from './post-workout-model';
import type { FinishWeek } from './finish-week';
import { EXERCISE_ID, SECOND_ID, SESSION_ID, testDetail, testFinished } from './active-session-test-fixtures';
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));

const THIRD = '44444444-4444-4444-8444-444444444444', PREV = '77777777-7777-4777-8777-777777777777';
const meta = { durationMs: 1, httpStatus: 200, outcome: 'ok' as const };
const set = (n: number, weight: number | null, reps: number | null): SessionSetDto =>
  ({ setNumber: n, targetReps: null, targetWeightKg: null, targetRir: null, actualReps: reps, actualWeightKg: weight, isCompleted: true, notes: null });
const previous = { sessionId: PREV, endedAt: '2026-09-26T13:00:00Z', sets: [] };
function finished() {
  const value = testFinished({ energyLevel: 4, performanceLevel: null, painLevel: 0, notes: 'Bien' });
  return { ...value, routineId: '55555555-5555-4555-8555-555555555555', name: 'PUSH', completedSetCount: 24 };
}
function detail(): SessionDetailDto {
  const value = testDetail();
  value.exercises[0] = { ...value.exercises[0], nameSnapshot: 'PRESS INCLINADO', payload: { ...value.exercises[0].payload, sets: [set(1, 20, 7), set(2, 17.5, 8)] } };
  value.exercises[1] = { ...value.exercises[1], nameSnapshot: 'PECHO DECLIVE', payload: { ...value.exercises[1].payload, sets: [set(1, 90, 10), set(2, 90, 9)] } };
  value.exercises.push({ ...value.exercises[1], id: THIRD, exerciseId: THIRD, nameSnapshot: 'FONDOS', weightModeSnapshot: 'Peso corporal',
    payload: { ...value.exercises[1].payload, sets: [set(1, null, 12)] } });
  return value;
}
const record = { kind: 'record' as const, exerciseId: EXERCISE_ID, name: 'PRESS INCLINADO', weightMode: 'Por mancuerna', mark: { weightKg: 20, reps: 7 }, previous: { weightKg: 17.5, reps: 8 } };
function summary(records = true): SessionSummaryDto {
  return { sessionId: SESSION_ID, volumeKg: 9887, highlights: records ? [record] : [], exercises: [
    { sessionExerciseId: EXERCISE_ID, exerciseId: EXERCISE_ID, status: records ? 'improved' : 'same', change: records ? { kind: 'weight', amount: 2.5 } : null, previous },
    { sessionExerciseId: SECOND_ID, exerciseId: SECOND_ID, status: 'improved', change: { kind: 'reps', amount: 1 }, previous },
    { sessionExerciseId: THIRD, exerciseId: THIRD, status: 'improved', change: { kind: 'volume', amount: 2 }, previous },
  ] };
}

describe('SF2/SF3 · just finished', () => {
  it('a record leads, improvements follow, the line carries the server volume', () => {
    const model = postWorkoutModel(finished(), summary(), detail());
    expect(model.title).toBe('PUSH guardado');
    expect(model.line).toBe('Mié 30 sept · 1 h 04 min · 24 series · 9.887 kg');
    expect(model.hero).toEqual({ kind: 'record', title: '¡Récord hoy!', name: 'PRESS INCLINADO', mark: '20 kg × 7', before: 'Antes: 17,5 kg × 8.', more: null });
    expect(model.rows.map(row => [row.title, row.detail])).toEqual([
      ['PECHO DECLIVE', '90 kg × 10 · 1 rep más que la última vez'], ['FONDOS', '12 reps · 2 reps más en total']]);
    expect(model.feelings.map(feeling => feeling.key)).toEqual(['energyLevel', 'painLevel']);
  });
  it('without a record: better than the last time, only when something improved', () => {
    const model = postWorkoutModel(finished(), summary(false), detail());
    expect(model.hero).toEqual({ kind: 'improved', title: 'Mejor que la última PUSH', count: '2 ejercicios subieron', names: 'PECHO DECLIVE y FONDOS',
      rest: 'Los demás quedaron igual que la última vez.' });
    const flat = summary(false); flat.exercises = flat.exercises.map(row => ({ ...row, status: 'same', change: null }));
    expect(postWorkoutModel(finished(), flat, detail())).toMatchObject({ hero: null, rows: [] });
    expect(postWorkoutModel(finished())).toMatchObject({ hero: null, rows: [], line: 'Mié 30 sept · 1 h 04 min · 24 series' });
  });
  it('more records are named after the first; additions to the routine count as rows', () => {
    const data = summary(); data.highlights.push({ ...record, exerciseId: SECOND_ID, name: 'PECHO DECLIVE', weightMode: 'Peso total', mark: { weightKg: 90, reps: 10 } });
    const receipt = finished(); receipt.routineAdditions = [{ sessionExerciseId: 'a', exerciseId: THIRD, name: 'FONDOS', outcome: 'added' }];
    const model = postWorkoutModel(receipt, data, detail());
    expect(model.hero).toMatchObject({ title: '¡2 récords hoy!', more: 'Y PECHO DECLIVE 90 kg × 10.' });
    expect(model.rows.map(row => row.kind)).toEqual(['improvement', 'added']);
  });
});

describe('the receipt screen', () => {
  afterEach(() => { jest.useRealTimers(); });
  const wrap = (props: Partial<Parameters<typeof PostWorkoutScreen>[0]> = {}) => render(<SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }}>
    <OwnlevelThemeProvider initialMode="light"><PostWorkoutScreen finished={finished()} detail={detail()} onHome={() => undefined} onViewSession={() => undefined} {...props} /></OwnlevelThemeProvider></SafeAreaProvider>);
  it('shows the saved session at once and adds the record block when the summary confirms it', async () => {
    let resolve!: (value: Awaited<ReturnType<SessionSummaryLoader>>) => void;
    const view = wrap({ readSummary: () => new Promise(done => { resolve = done; }) });
    expect(view.getByText('PUSH guardado')).toBeTruthy(); expect(view.queryByTestId('post-workout-hero-record')).toBeNull();
    expect(view.getByLabelText('Dolor: 0 de 10')).toBeTruthy(); expect(view.queryByLabelText(/Rendimiento/)).toBeNull();
    await act(async () => {});
    await act(async () => { resolve({ status: 'ok', data: summary(), meta }); });
    expect(view.getByTestId('post-workout-hero-record')).toBeTruthy(); expect(view.getByText('20 kg × 7')).toBeTruthy();
  });
  it.each(['unavailable', 'throw'] as const)('keeps the receipt useful when the summary is %s, with no false block or zero volume', async state => {
    const view = wrap({ readSummary: async () => { if (state === 'throw') throw new Error('offline'); return { status: 'unavailable', reason: 'network', meta: { durationMs: 1, httpStatus: null, outcome: 'unavailable' } }; } });
    await act(async () => {});
    expect(view.getByText('PUSH guardado')).toBeTruthy(); expect(view.queryByTestId(/post-workout-hero/)).toBeNull();
    expect(view.getByTestId('post-workout-line').props.children).toBe('Mié 30 sept · 1 h 04 min · 24 series');
  });
  it('plays the week first, then leaves it out of the page; a tap skips it', async () => {
    const week: FinishWeek = { sessions: 4, days: ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04']
      .map((date, index) => ({ date, today: index === 2, sessionsBefore: index < 2 ? 1 : 0 })) };
    jest.useFakeTimers();
    const view = wrap({ readWeek: async () => week });
    expect(view.getByTestId('finish-week-waiting')).toBeTruthy();
    await act(async () => {});
    expect(view.getByTestId('finish-week-intro')).toBeTruthy();
    act(() => { jest.advanceTimersByTime(600); });
    expect(view.getByTestId('finish-week-count').props.children).toBe('4 entrenos esta semana');
    fireEvent.press(view.getByRole('button', { name: '4 entrenos esta semana' }));
    expect(view.queryByTestId('finish-week-intro')).toBeNull(); expect(view.getByText('PUSH guardado')).toBeTruthy();
  });
  it('without the week the page comes straight in', async () => {
    jest.useFakeTimers();
    const view = wrap({ readWeek: async () => null });
    await act(async () => {});
    expect(view.queryByTestId('finish-week-waiting')).toBeNull(); expect(view.queryByTestId('finish-week-intro')).toBeNull();
    const slow = wrap({ readWeek: () => new Promise<null>(() => undefined) });
    act(() => { jest.advanceTimersByTime(1000); });
    expect(slow.queryByTestId('finish-week-waiting')).toBeNull();
  });
});
