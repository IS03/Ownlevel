import { act, fireEvent, render, within } from '@testing-library/react-native';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { OwnlevelThemeProvider } from '@/design-system';
import type { MobileApiClient } from '@/api/client';
import { clearConfirmedReads } from '@/api/confirmed-read-cache';
import type { DayFact } from '@/api/performance-insights';
import { createInsightsSnapshot, insightsDaysPage, insightsSummary } from '../../../../src/lib/progress/insights-engine/read-model';
import type { InsightsSource } from '../../../../src/lib/progress/insights-engine/types';
import { InsightsScreen } from './insights-screen';
import { dayLanes, exerciseSentence, joinDays, readingRows, referenceText, sessionLanes } from './insights-model';
import { feelingTransition } from '@/training/feeling-transition';

jest.mock('@react-native-async-storage/async-storage', () => jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
const mockPush = jest.fn(), mockSetParams = jest.fn();
let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, setParams: mockSetParams, back: jest.fn() }), useFocusEffect: () => undefined, useLocalSearchParams: () => mockParams }));
jest.mock('@/platform/haptics', () => ({ haptics: { selection: jest.fn() }, triggerHaptic: jest.fn() }));
type ReadOptions = Parameters<MobileApiClient['read']>[0];
const mockRead = jest.fn<(options: ReadOptions) => Promise<unknown>>();
const mockClient = { read: mockRead, request: jest.fn() } as unknown as MobileApiClient;
jest.mock('@/api', () => ({ useMobileApi: () => ({ client: mockClient }) }));

const KNOWN = '93670000-0000-4000-8000-0000000000c1', UNKNOWN = '93670000-0000-4000-8000-0000000000c2';
const session = (n: number) => `93670000-0000-4000-8000-000000000${String(100 + n)}`;
const dateAt = (n: number) => new Date(Date.UTC(2026, 2, 2 + n)).toISOString().slice(0, 10);
/**
 * Three sessions, each with one exercise of known configuration (the strict method) and one of unknown configuration (the
 * partial one). The last session is the one just finished: it has feelings before and after, one of them answered late.
 */
function source(): InsightsSource {
  const reps = [[8, 10], [9, 10], [10, 9]];
  const sessions = reps.map((_, n) => ({ id: session(n), date: dateAt(n), routineId: 'r', routineName: 'Empuje', name: null, status: 'completed' as const,
    startedAt: `${dateAt(n)}T18:00:00.000Z`, endedAt: `${dateAt(n)}T19:00:00.000Z`, performanceLevel: null, painLevel: null, legacyEnergyLevel: null }));
  const exercises = reps.flatMap((_, n) => [
    { id: `k${n}`, sessionId: session(n), exerciseId: KNOWN, name: 'Press banca', implement: 'barra', weightMode: 'Peso total', isCompleted: true, configuration: 'none' },
    { id: `u${n}`, sessionId: session(n), exerciseId: UNKNOWN, name: 'Remo', implement: 'barra', weightMode: 'Peso total', isCompleted: true, configuration: null }]);
  const sets = reps.flatMap(([known, unknown], n) => [
    { id: `sk${n}`, sessionExerciseId: `k${n}`, actualReps: known!, actualLoad: 100, isCompleted: true, completedAt: `${dateAt(n)}T18:10:00.000Z` },
    { id: `su${n}`, sessionExerciseId: `u${n}`, actualReps: unknown!, actualLoad: 60, isCompleted: true, completedAt: `${dateAt(n)}T18:20:00.000Z` }]);
  return { sessions, exercises, sets, metricDefinitions: [], metricValues: [], meals: [],
    feelings: [{ sessionId: session(2), revision: 1, facts: {
      energyPre: { value: 2, capturedAt: `${dateAt(2)}T18:30:00.000Z`, declaredMoment: 'pre' },
      fatiguePre: { value: 3, capturedAt: `${dateAt(2)}T17:55:00.000Z`, declaredMoment: 'pre' },
      energyPost: { value: 4, capturedAt: `${dateAt(2)}T19:01:00.000Z`, declaredMoment: 'post' } } }] };
}
/**
 * Sessions built from a spec: each exercise with its configuration (known: 'none'; unknown: null) and its sets as load × reps.
 * Two sessions on two days, the second one is the one looked at.
 */
type Spec = { id: string; name: string; configuration: string | null; sets: [number, number][][] };
function sourceOf(specs: Spec[]): InsightsSource {
  const days = specs[0]!.sets.length;
  const sessions = Array.from({ length: days }, (_, n) => ({ id: session(10 + n), date: dateAt(n), routineId: 'r', routineName: 'Empuje', name: null, status: 'completed' as const,
    startedAt: `${dateAt(n)}T18:00:00.000Z`, endedAt: `${dateAt(n)}T19:00:00.000Z`, performanceLevel: null, painLevel: null, legacyEnergyLevel: null }));
  const exercises: InsightsSource['exercises'][number][] = [], sets: InsightsSource['sets'][number][] = [];
  for (const spec of specs) spec.sets.forEach((done, n) => {
    if (!done.length) return;
    const id = `${spec.name}${n}`;
    exercises.push({ id, sessionId: session(10 + n), exerciseId: spec.id, name: spec.name, implement: 'barra', weightMode: 'Peso total', isCompleted: true, configuration: spec.configuration });
    done.forEach(([load, reps], k) => sets.push({ id: `${id}-${k}`, sessionExerciseId: id, actualReps: reps, actualLoad: load, isCompleted: true, completedAt: `${dateAt(n)}T18:${String(10 + k).padStart(2, '0')}:00.000Z` }));
  });
  return { sessions, exercises, sets, feelings: [], metricDefinitions: [], metricValues: [], meals: [] };
}
const CROSSED: Spec = { id: KNOWN, name: 'Press banca', configuration: 'none', sets: [[[100, 8], [90, 10]], [[100, 9], [90, 9]]] };
const serve = (input: InsightsSource) => {
  const snapshot = createInsightsSnapshot(input, { today: '2027-01-01', permutations: 19, revision: 'r', method: 2 });
  return async (options: ReadOptions) => {
    const query = new URL(`http://x${options.path}`).searchParams;
    const body = query.get('view') === 'days' ? insightsDaysPage(snapshot, { before: query.get('before') ?? undefined }) : insightsSummary(snapshot);
    const parsed = options.parse(JSON.parse(JSON.stringify(body)));
    if (parsed === undefined) throw Error(`Contract rejected ${options.path}`);
    return { status: 'ok' as const, data: parsed, meta: { durationMs: 1, httpStatus: 200, outcome: 'ok' as const } };
  };
};
const flush = () => act(async () => { for (let i = 0; i < 3; i++) await new Promise(resolve => setTimeout(resolve, 0)); });
beforeEach(() => { mockParams = {}; mockPush.mockClear(); mockRead.mockReset(); clearConfirmedReads(mockClient); });

describe('#367 hechos de una sesión: modelo', () => {
  it('counts mixed evidence and no comparison apart, in each method with its own words', () => {
    const counts = { up: 1, same: 2, down: 0, ambiguous: 3, insufficient: 4, comparable: 3, total: 10 };
    expect(readingRows('strict', counts).map(row => [row.label, row.value])).toEqual([['Mejoraron', 1], ['Igual', 2], ['Por debajo', 0], ['Mezclado', 3], ['Sin comparar', 4]]);
    expect(readingRows('partial', counts).map(row => row.label)).toEqual(['Registro superior', 'Registro igual', 'Registro inferior', 'Mezclado', 'Sin comparar']);
    expect(readingRows('partial', counts)[3]!.spoken).toBe('Mezclado con contexto parcial: 3');
  });
  it('names the compatible reference by its date, and only by its age when an older server did not send it', () => {
    // The weekday's comma depends on the platform's date data; the date itself does not.
    expect(referenceText(7, '2026-03-02')).toMatch(/^Frente al lunes,? 2 de marzo$/);
    expect(referenceText(1, undefined)).toBe('Frente a una sesión de hace 1 día');
    expect(referenceText(null, null)).toBeNull();
    expect(exerciseSentence('strict', 'Press banca', 'improved', 'direct_evidence', 7, '2026-03-02')).toMatch(/^Press banca, mejoró, hace 7 días, frente a la sesión del lunes,? 2 de marzo$/);
    // Without a comparison there is no reference to name: the reason is said instead.
    expect(exerciseSentence('strict', 'Press banca', 'insufficient_comparison', 'no_compatible_reference', null, null)).toBe('Press banca, sin comparar, todavía sin una sesión anterior para comparar');
  });
  it('feelings are ordinal answers, before → after, never numbers', () => {
    expect(feelingTransition('energy', { value: 2 }, { value: 4 })).toEqual({ label: 'Energía', value: 'baja → alta', spoken: 'Energía: baja antes de entrenar, alta al terminar' });
    expect(feelingTransition('fatigue', 'unreadable', 'missing').value).toBe('no se pudo leer → sin registrar');
  });
  it('shows each method a session has, the strict one first when it compared something', () => {
    const snapshot = createInsightsSnapshot(source(), { today: '2027-01-01', permutations: 19, method: 2 });
    const last = (insightsSummary(snapshot).facts.days as DayFact[])[0]!.sessions[0]!;
    const partial = insightsSummary(snapshot).partial.days[0]!.sessions[0]!;
    expect(sessionLanes(last, partial).map(row => [row.lane, row.counts.comparable, row.counts.total])).toEqual([['strict', 1, 2], ['partial', 1, 1]]);
    expect(last.exercises.find(row => row.exerciseId === KNOWN)).toMatchObject({ status: 'improved', referenceSessionId: session(1), referenceDate: dateAt(1), referenceAgeDays: 0 });
    expect(partial.exercises[0]).toMatchObject({ reading: 'lower_record', referenceSessionId: session(1), referenceDate: dateAt(1) });
  });
});

describe('#367 hechos de una sesión: pantalla abierta desde el post-entreno', () => {
  it('keeps the two methods apart with their denominators, names each reference and reads feelings as ordinal answers', async () => {
    mockParams = { session: session(2), date: dateAt(2) };
    mockRead.mockImplementation(serve(source()));
    const view = render(<SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}><OwnlevelThemeProvider initialMode="light"><InsightsScreen /></OwnlevelThemeProvider></SafeAreaProvider>);
    await flush();
    const focus = within(view.getByTestId('insights-session'));
    const strict = within(view.getByTestId('insights-session-lane-strict')), partial = within(view.getByTestId('insights-session-lane-partial'));
    expect(strict.getByText('Comparación completa')).toBeTruthy();
    expect(strict.getByRole('button', { name: /^Press banca, mejoró, el mismo día, frente a la sesión del martes,? 3 de marzo\. Ver evidencia y series$/ })).toBeTruthy();
    // The partial method brings its own count and limit; it is never added to the strict one.
    expect(partial.getByText('Con contexto parcial')).toBeTruthy();
    expect(partial.getByText('1 de 1 ejercicios comparables con contexto parcial')).toBeTruthy();
    expect(partial.getByRole('button', { name: /^Remo, registro inferior con contexto parcial, el mismo día, frente a la sesión del martes,? 3 de marzo\. Ver evidencia y series$/ })).toBeTruthy();
    expect(partial.getByText(/No sabemos si cambiaste agarre/)).toBeTruthy();
    // The strict method counts every exercise: one of unknown configuration is in its denominator, not compared, and says why.
    expect(strict.getByRole('button', { name: /^Remo, sin comparar, todavía no sabemos si se hizo igual/ })).toBeTruthy();
    expect(partial.queryByText('Press banca')).toBeNull();
    // Feelings: ordinal, before → after, and an answer given late says so.
    expect(focus.getByText('baja → alta')).toBeTruthy();
    expect(focus.getByText('moderada → sin registrar')).toBeTruthy();
    expect(focus.getByText('Antes: respondida después de empezar')).toBeTruthy();
    expect(focus.queryByText(/de 5/)).toBeNull(); expect(focus.queryByText(/%/)).toBeNull();
    expect(focus.queryByText(/porque|causa|recomend/i)).toBeNull();
  });
});

describe('#367 resultados sin comparables (#410)', () => {
  const open = async (input: InsightsSource, sessionId: string, date: string) => {
    mockParams = { session: sessionId, date };
    mockRead.mockImplementation(serve(input));
    const view = render(<SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}><OwnlevelThemeProvider initialMode="light"><InsightsScreen /></OwnlevelThemeProvider></SafeAreaProvider>);
    await flush();
    return view;
  };
  const daysOf = (input: InsightsSource) => { const summary = insightsSummary(createInsightsSnapshot(input, { today: '2027-01-01', permutations: 19, method: 2 })); return joinDays(summary.facts.days, summary.partial.days); };

  it('1. keeps a known configuration with crossed signals in the strict lane next to an unknown one in the partial lane', async () => {
    const input = sourceOf([CROSSED, { id: UNKNOWN, name: 'Remo', configuration: null, sets: [[[60, 10]], [[60, 10]]] }]);
    const [day] = daysOf(input), last = day!.strict.sessions[0]!, partial = day!.partial!.sessions[0]!;
    // The strict lane holds mixed evidence of its own: it stays, with its denominator, even with nothing comparable.
    expect(sessionLanes(last, partial).map(row => [row.lane, row.counts.comparable, row.counts.ambiguous, row.counts.insufficient, row.counts.total]))
      .toEqual([['strict', 0, 1, 1, 2], ['partial', 1, 0, 0, 1]]);
    expect(dayLanes(day!)).toEqual(['strict', 'partial']);
    const view = await open(input, session(11), dateAt(1));
    const strict = within(view.getByTestId('insights-session-lane-strict')), partialLane = within(view.getByTestId('insights-session-lane-partial'));
    expect(strict.getByText('0 de 2 ejercicios comparables, contra su última vez')).toBeTruthy();
    expect(strict.getByLabelText('Mezclado: 1')).toBeTruthy(); expect(strict.getByLabelText('Sin comparar: 1')).toBeTruthy();
    expect(strict.getByRole('button', { name: /^Press banca, mezclado, subió por un lado y bajó por otro/ })).toBeTruthy();
    // The unknown configuration is never a strict comparison: there it is "not compared", and its reading lives in the partial lane.
    expect(strict.getByRole('button', { name: /^Remo, sin comparar, todavía no sabemos si se hizo igual/ })).toBeTruthy();
    expect(partialLane.getByRole('button', { name: /^Remo, registro igual con contexto parcial/ })).toBeTruthy();
    expect(partialLane.queryByText('Press banca')).toBeNull();
    // Never added: the header speaks for one method, with its own count.
    expect(within(view.getByTestId('insights-session')).getAllByText(/de \d+ ejercicios comparables/).map(node => node.props.children)).not.toContain('1 de 3 ejercicios comparables, contra su última vez');
  });

  it('2. shows a session without comparisons, with its mixed and not compared results, in the header and the day', async () => {
    const input = sourceOf([CROSSED, { id: UNKNOWN, name: 'Remo', configuration: 'none', sets: [[], [[60, 10]]] }]);
    const [day] = daysOf(input), last = day!.strict.sessions[0]!;
    expect(sessionLanes(last, day!.partial?.sessions[0] ?? null).map(row => row.lane)).toEqual(['strict']);
    expect(dayLanes(day!)).toEqual(['strict']);
    const view = await open(input, session(11), dateAt(1));
    const focus = within(view.getByTestId('insights-session'));
    expect(focus.getByText('Todavía sin comparaciones')).toBeTruthy();
    expect(focus.getByText('0 de 2 ejercicios comparables, contra su última vez')).toBeTruthy();
    expect(focus.getByLabelText('Mezclado: 1')).toBeTruthy(); expect(focus.getByLabelText('Sin comparar: 1')).toBeTruthy();
    expect(focus.getByRole('button', { name: /^Remo, sin comparar, todavía sin una sesión anterior para comparar/ })).toBeTruthy();
    expect(focus.queryByTestId('insights-session-lane-partial')).toBeNull();
  });

  it('3. keeps a mixed session with comparisons as before: strict first, partial apart, each with its own counts', () => {
    const snapshot = createInsightsSnapshot(source(), { today: '2027-01-01', permutations: 19, method: 2 });
    const summary = insightsSummary(snapshot), [day] = joinDays(summary.facts.days, summary.partial.days);
    expect(sessionLanes(day!.strict.sessions[0]!, day!.partial!.sessions[0]!).map(row => [row.lane, row.counts.comparable, row.counts.total])).toEqual([['strict', 1, 2], ['partial', 1, 1]]);
    expect(dayLanes(day!)).toEqual(['strict', 'partial']);
  });

  it('an unknown configuration alone never opens the strict lane', () => {
    const input = sourceOf([{ id: UNKNOWN, name: 'Remo', configuration: null, sets: [[[60, 10]], [[60, 11]]] }]);
    const [day] = daysOf(input);
    expect(sessionLanes(day!.strict.sessions[0]!, day!.partial!.sessions[0]!).map(row => row.lane)).toEqual(['partial']);
    expect(dayLanes(day!)).toEqual(['partial']);
  });
  it('keeps an exercise with no usable sets unclassified as a decline and opens its evidence', async () => {
    const source = sourceOf([{ id: KNOWN, name: 'Press banca', configuration: 'none', sets: [[[60, 10]], []] }]);
    // sourceOf omits an exercise for an empty list; this case needs the exercise, with no sets.
    const input = { ...source, exercises: [...source.exercises, { ...source.exercises[0]!, id: 'no-sets', sessionId: session(11) }] };
    const view = await open(input, session(11), dateAt(1));
    const lane = within(view.getByTestId('insights-session-lane-strict'));
    expect(lane.getByText('0 de 1 ejercicios comparables, contra su última vez')).toBeTruthy();
    fireEvent.press(lane.getByRole('button', { name: /^Press banca, sin comparar, sin series completas/ }));
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/(tabs)/train/insights/evidence', params: expect.objectContaining({ session: session(11), exercise: KNOWN, result: 'insufficient_comparison', reference: session(10) }) });
    expect(lane.queryByLabelText('Por debajo: 1')).toBeNull();
  });
});
