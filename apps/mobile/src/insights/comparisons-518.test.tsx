import { act, fireEvent, render, within } from '@testing-library/react-native';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { OwnlevelThemeProvider } from '@/design-system';
import type { MobileApiClient } from '@/api/client';
import { READ_REUSE_MS, clearConfirmedReads } from '@/api/confirmed-read-cache';
import type { MobileApiReadResult } from '@/api/results';
import type { DayFact } from '@/api/performance-insights';
import { createInsightsSnapshot, insightsDaysPage, insightsRelations, insightsSummary } from '../../../../src/lib/progress/insights-engine/read-model';
import { insightsExerciseEvidence } from '../../../../src/lib/progress/insights-engine/evidence';
import type { InsightsSource } from '../../../../src/lib/progress/insights-engine/types';
import { InsightsScreen } from './insights-screen';
import { EvidenceScreen } from './evidence-screen';
import { comparisonsFromTrainingHref, insightsReturnHref, insightsSessionHref } from './navigation';
import { contextRows, outsideText, preStartNote, preStartRows } from './insights-model';

/**
 * #518 · Comparaciones: the same screen from Entrenar, Progreso → Entrenamiento and a finished session, down to a reference's
 * sets and back. Fictitious data only. Counts every read on the way: showing a door and unfolding local context ask for nothing.
 */
jest.mock('@react-native-async-storage/async-storage', () => jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
const mockPush = jest.fn(), mockSetParams = jest.fn(), mockBack = jest.fn(), mockReplace = jest.fn(), mockNavigate = jest.fn();
let mockParams: Record<string, string> = {};
/** The focus callbacks mounted now: calling them is the screen coming back into view. */
const mockFocus = new Set<() => unknown>();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, setParams: mockSetParams, back: mockBack, replace: mockReplace, navigate: mockNavigate, canGoBack: () => true }),
  useFocusEffect: (callback: () => unknown) => {
    jest.requireActual<typeof import('react')>('react').useEffect(() => { mockFocus.add(callback); return () => { mockFocus.delete(callback); }; }, [callback]);
  },
  useLocalSearchParams: () => mockParams,
}));
jest.mock('@/platform/haptics', () => ({ haptics: { selection: jest.fn() }, triggerHaptic: jest.fn() }));
type ReadOptions = Parameters<MobileApiClient['read']>[0];
const mockRead = jest.fn<(options: ReadOptions) => Promise<MobileApiReadResult<unknown>>>();
const mockClient = { read: mockRead, request: jest.fn() } as unknown as MobileApiClient;
jest.mock('@/api', () => ({ useMobileApi: () => ({ client: mockClient }) }));

const ID = (n: number) => `93670000-0000-4000-8518-${String(n).padStart(12, '0')}`;
const ROW = ID(1), CURL = ID(2), GOBLET = ID(3);
const EARLIER = ID(11), PULL = ID(12), MOBILITY = ID(13);
const D0 = '2026-03-02', D1 = '2026-03-09';
const meta = { durationMs: 1, httpStatus: 200, outcome: 'ok' as const };
type Session_ = { id: string; date: string; start: string; end: string; name: string; exercises: { id: string; name: string; sets: [number, number][] }[] };
function sourceOf(sessions: Session_[]): InsightsSource {
  const out = { sessions: [] as InsightsSource['sessions'][number][], exercises: [] as InsightsSource['exercises'][number][], sets: [] as InsightsSource['sets'][number][] };
  sessions.forEach((session, s) => {
    out.sessions.push({ id: session.id, date: session.date, routineId: null, routineName: session.name, name: null, status: 'completed', startedAt: `${session.date}T${session.start}:00.000Z`, endedAt: `${session.date}T${session.end}:00.000Z`, performanceLevel: null, painLevel: null, legacyEnergyLevel: null });
    session.exercises.forEach((exercise, e) => {
      const row = ID(100 + s * 10 + e);
      out.exercises.push({ id: row, sessionId: session.id, exerciseId: exercise.id, name: exercise.name, implement: 'barra', weightMode: 'Peso total', isCompleted: true, configuration: null });
      exercise.sets.forEach(([load, reps], n) => out.sets.push({ id: ID(1000 + s * 100 + e * 10 + n), sessionExerciseId: row, actualReps: reps, actualLoad: load, isCompleted: true, completedAt: `${session.date}T${session.start}:1${n}:00.000Z` }));
    });
  });
  return { ...out, feelings: [], metricDefinitions: [], metricValues: [], meals: [] };
}
/** Remo and Curl a week apart; the second Monday also has a mobility session with a first-time exercise. */
const week = (pullRow: [number, number][] = [[60, 11], [60, 10]]) => sourceOf([
  { id: EARLIER, date: D0, start: '21:00', end: '22:00', name: 'Tirón', exercises: [{ id: ROW, name: 'Remo con barra', sets: [[60, 10], [60, 9]] }, { id: CURL, name: 'Curl con barra', sets: [[20, 10]] }] },
  { id: MOBILITY, date: D1, start: '12:00', end: '12:30', name: 'Movilidad', exercises: [{ id: GOBLET, name: 'Sentadilla goblet', sets: [[16, 12]] }] },
  { id: PULL, date: D1, start: '21:00', end: '22:10', name: 'Tirón', exercises: [{ id: ROW, name: 'Remo con barra', sets: pullRow }, { id: CURL, name: 'Curl con barra', sets: [[20, 10]] }] },
]);
/** Answers every view as the route does, through the real contract. */
const serve = (source: InsightsSource, revision = 'r1') => {
  const snapshot = createInsightsSnapshot(source, { today: '2026-04-01', permutations: 19, revision });
  return async (options: ReadOptions) => {
    const query = new URL(`http://x${options.path}`).searchParams, view = query.get('view');
    const body = view === 'evidence' ? insightsExerciseEvidence(source, { sessionId: query.get('session')!, exerciseId: query.get('exercise')!, lane: query.get('lane') as 'strict' | 'partial' }, { today: '2026-04-01', revision, method: 2 })
      : view === 'relations' ? insightsRelations(snapshot) : view === 'days' ? insightsDaysPage(snapshot, { before: query.get('before') ?? undefined }) : insightsSummary(snapshot);
    const parsed = options.parse(JSON.parse(JSON.stringify(body)));
    if (parsed === undefined) throw Error(`Contract rejected ${options.path}`);
    return { status: 'ok' as const, data: parsed, meta };
  };
};
const reads = () => mockRead.mock.calls.map(call => String(call[0].path).replace('/api/mobile/v1/progress/performance-insights?method=2', '') || 'summary');
const screen = (ui: React.ReactElement) => render(<SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}><OwnlevelThemeProvider initialMode="light">{ui}</OwnlevelThemeProvider></SafeAreaProvider>);
const flush = () => act(async () => { for (let i = 0; i < 4; i++) await new Promise(resolve => setTimeout(resolve, 0)); });
const open = async (ui: React.ReactElement) => { const view = screen(ui); await flush(); return view; };
/** The screen comes back into view (Back from evidence, Nutrition, a session). */
const focus = async () => { await act(async () => { for (const callback of [...mockFocus]) callback(); }); await flush(); };
type Href = { pathname: string; params: Record<string, string> };
const lastPush = () => mockPush.mock.calls.at(-1)![0] as Href;
let now = Date.parse('2026-04-01T15:00:00Z');

beforeEach(() => {
  mockParams = {}; mockFocus.clear();
  for (const fn of [mockPush, mockSetParams, mockBack, mockReplace, mockNavigate]) fn.mockClear();
  mockRead.mockReset(); clearConfirmedReads(mockClient);
  now = Date.parse('2026-04-01T15:00:00Z'); jest.spyOn(Date, 'now').mockImplementation(() => now);
});
afterEach(() => { jest.restoreAllMocks(); });

describe('#518 · tres puertas, una pantalla', () => {
  it('Entrenar, Progreso → Entrenamiento and the finished session all open the same route, asking for nothing on the way', () => {
    // Entrenar pushes `/(tabs)/train/${target}` (training-screen.tsx); the other two build their hrefs here.
    expect(comparisonsFromTrainingHref).toEqual({ pathname: '/(tabs)/train/insights', params: { fromProgress: 'training' } });
    expect(insightsSessionHref(PULL, D1)).toEqual({ pathname: '/(tabs)/train/insights', params: { session: PULL, date: D1, fromSession: '1' } });
    expect(mockRead).not.toHaveBeenCalled();
  });

  it('desde Entrenar: one read to open, none to unfold, one for the evidence; the reference sets with their date; back to the same place', async () => {
    mockRead.mockImplementation(serve(week()));
    const view = await open(<InsightsScreen />);
    expect(reads()).toEqual(['summary']);
    // First what and when, the result and the exercises: the latest day with a clear result, both of its sessions.
    const top = within(view.getByTestId('insights-hero'));
    expect(top.getByRole('header', { name: 'Lunes, 9 de marzo' })).toBeTruthy();
    expect(top.getByTestId('insights-day-order').props.children).toBe('2 sesiones, en el orden en que empezaron.');
    expect(top.getByLabelText('2 de 3 ejercicios con resultado claro, con contexto parcial')).toBeTruthy();
    expect(top.getByText(/^1 sin comparar\./)).toBeTruthy();
    expect(top.getAllByTestId('insights-partial-limit')).toHaveLength(1);
    // The context is folded; unfolding it is local.
    expect(view.queryByTestId('insights-context-open')).toBeNull();
    fireEvent.press(view.getByTestId('insights-context-toggle'));
    expect(view.getByTestId('insights-context-open')).toBeTruthy(); expect(reads()).toEqual(['summary']);
    // History, the strip under it, then the rest; relations only on request.
    expect(view.getByText('Historial')).toBeTruthy();
    expect(reads().some(path => path.includes('view=relations'))).toBe(false);
    // An exercise opens its evidence, with the read it came from.
    fireEvent.press(top.getByRole('button', { name: /^Remo con barra, registro superior con contexto parcial/ }));
    const evidence = lastPush();
    expect(evidence).toMatchObject({ pathname: '/(tabs)/train/insights/evidence', params: { session: PULL, exercise: ROW, lane: 'partial', reference: EARLIER, result: 'higher_record', revision: 'r1', insightsReturn: '1', insightsDate: D1 } });
    expect(reads()).toEqual(['summary']);
    view.unmount();
    mockParams = evidence.params;
    const detail = await open(<EvidenceScreen />);
    expect(reads()).toEqual(['summary', `&view=evidence&session=${PULL}&exercise=${ROW}&lane=partial`]);
    // #533: the side-by-side table first; the full sets, each side under its date, one tap away and still in this order.
    expect(detail.getByTestId('evidence-slopes')).toBeTruthy();
    fireEvent.press(detail.getByTestId('evidence-detail-toggle'));
    expect(within(detail.getByTestId('evidence-current')).getByText('Esta sesión · Lunes, 9 de marzo')).toBeTruthy();
    expect(within(detail.getByTestId('evidence-reference')).getByText('Sesión de referencia · Lunes, 2 de marzo')).toBeTruthy();
    const order = detail.UNSAFE_root.findAll(node => ['evidence-current', 'evidence-reference', 'evidence-signals'].includes(node.props.testID), { deep: true }).map(node => node.props.testID);
    expect([...new Set(order)]).toEqual(['evidence-current', 'evidence-reference', 'evidence-signals']);
    // Back is the stack's own; a cross-tab return comes back to the same day of Comparaciones.
    expect(insightsReturnHref(evidence.params)).toEqual({ pathname: '/(tabs)/train/insights', params: { date: D1 } });
    detail.unmount();
  });

  it('desde la sesión terminada: that session, its other session of the day, and back to the session', async () => {
    mockParams = insightsSessionHref(PULL, D1)!.params;
    mockRead.mockImplementation(serve(week()));
    const view = await open(<InsightsScreen />);
    expect(reads()).toEqual(['summary']);
    const focusView = within(view.getByTestId('insights-session'));
    expect(focusView.getByRole('header', { name: 'Tirón' })).toBeTruthy();
    expect(focusView.getByText('Lunes, 9 de marzo de 2026 · 18:00–19:10')).toBeTruthy();
    expect(focusView.getByLabelText('2 de 2 ejercicios con resultado claro, con contexto parcial')).toBeTruthy();
    // Two sessions that day: each its own result; the other one is a tap away, on top of this one.
    fireEvent.press(within(view.getByTestId('insights-day-others')).getByRole('button', { name: /^Ver la otra sesión de ese día: Movilidad/ }));
    expect(lastPush()).toEqual({ pathname: '/(tabs)/train/insights', params: { session: MOBILITY, date: D1 } });
    fireEvent.press(focusView.getByRole('button', { name: /^Remo con barra,/ }));
    expect(lastPush().params).toMatchObject({ session: PULL, revision: 'r1', insightsSession: PULL, insightsFromSession: '1', insightsDate: D1 });
    expect(insightsReturnHref(lastPush().params)).toEqual({ pathname: '/(tabs)/train/insights', params: { session: PULL, date: D1, fromSession: '1', revision: 'r1' } });
    fireEvent.press(view.getByRole('button', { name: 'Volver a la sesión' }));
    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(reads()).toEqual(['summary']);
  });

  it('desde Progreso → Entrenamiento: the same screen, and every step back leads to Entrenamiento (its period stays in Progreso)', async () => {
    mockParams = comparisonsFromTrainingHref.params;
    mockRead.mockImplementation(serve(week()));
    const view = await open(<InsightsScreen />);
    expect(reads()).toEqual(['summary']);
    fireEvent.press(view.getByRole('button', { name: 'Volver a Entrenamiento' }));
    expect(mockNavigate).toHaveBeenLastCalledWith('/(tabs)/progress/trends/training');
    expect(view.queryByRole('button', { name: 'Volver a Progreso' })).toBeNull();
    fireEvent.press(within(view.getByTestId('insights-hero')).getByRole('button', { name: /^Remo con barra,/ }));
    const evidence = lastPush();
    expect(evidence.params).toMatchObject({ insightsFromProgress: 'training' });
    view.unmount();
    mockParams = evidence.params;
    const detail = await open(<EvidenceScreen />);
    fireEvent.press(detail.getByRole('button', { name: 'Volver a Entrenamiento' }));
    expect(mockNavigate).toHaveBeenLastCalledWith('/(tabs)/progress/trends/training');
    expect(insightsReturnHref(evidence.params)).toMatchObject({ pathname: '/(tabs)/train/insights', params: { fromProgress: 'training' } });
  });
});

describe('#518 · casos que cambian la lectura', () => {
  it('a first session without a compatible reference says so in the chosen session', async () => {
    mockParams = insightsSessionHref(MOBILITY, D1)!.params;
    mockRead.mockImplementation(serve(week()));
    const view = await open(<InsightsScreen />);
    const none = within(view.getByTestId('insights-session-none'));
    expect(none.getByText('Todavía sin comparaciones')).toBeTruthy();
    expect(none.getByText(/^Todavía no hay una sesión anterior compatible con estos ejercicios/)).toBeTruthy();
    expect(view.getByRole('button', { name: /^Sentadilla goblet, sin comparar, todavía sin una sesión anterior para comparar/ })).toBeTruthy();
  });

  it('two sessions the same day: before each one apart, the whole day once and said to be shared', async () => {
    mockRead.mockImplementation(serve(week()));
    const view = await open(<InsightsScreen />);
    fireEvent.press(view.getByTestId('insights-context-toggle'));
    const context = within(view.getByTestId('insights-context-open'));
    expect(context.getByTestId(`insights-before-${MOBILITY}`)).toBeTruthy(); expect(context.getByTestId(`insights-before-${PULL}`)).toBeTruthy();
    expect(context.getAllByText('Antes de esta sesión · comidas con hora en las 3 h previas')).toHaveLength(2);
    expect(context.getAllByTestId('insights-day-shared')).toHaveLength(1);
    expect(context.getByTestId('insights-day-shared-note')).toBeTruthy();
    expect(reads()).toEqual(['summary']);
  });

  it('records that changed while the evidence was open: coming back reads again, says so and never mixes the two reads', async () => {
    mockParams = insightsSessionHref(PULL, D1)!.params;
    mockRead.mockImplementation(serve(week(), 'r1'));
    const view = await open(<InsightsScreen />);
    await focus(); // The first focus: nothing read again.
    expect(reads()).toEqual(['summary']);
    expect(view.getByRole('button', { name: /^Remo con barra, registro superior/ })).toBeTruthy();
    // Meanwhile another device corrected Remo; the person comes back from its evidence.
    mockRead.mockImplementation(serve(week([[60, 8], [60, 7]]), 'r2'));
    await focus();
    expect(reads()).toEqual(['summary', 'summary']);
    expect(view.getByTestId('insights-revised-now')).toBeTruthy();
    expect(view.getByRole('button', { name: /^Remo con barra, registro inferior/ })).toBeTruthy();
    expect(view.queryByRole('button', { name: /^Remo con barra, registro superior/ })).toBeNull();
  });
});

describe('#518 · sin resultado claro', () => {
  it('the summary never names a cause for ambiguous results; each row says its own (opposite signals only when they are)', async () => {
    expect(outsideText({ ambiguous: 2, insufficient: 0 })).toEqual(['2 sin resultado claro. Cada fila dice por qué.']);
    // Pullover: no load or reps in common with its reference (ambiguous, not opposite signals).
    const source = sourceOf([
      { id: EARLIER, date: D0, start: '21:00', end: '22:00', name: 'Tirón', exercises: [{ id: CURL, name: 'Pullover en polea', sets: [[35, 12], [35, 12]] }] },
      { id: PULL, date: D1, start: '21:00', end: '22:00', name: 'Tirón', exercises: [{ id: CURL, name: 'Pullover en polea', sets: [[40, 8]] }] },
    ]);
    mockParams = insightsSessionHref(PULL, D1)!.params;
    mockRead.mockImplementation(serve(source));
    const view = await open(<InsightsScreen />);
    const focus = within(view.getByTestId('insights-session'));
    expect(focus.getByText('1 sin resultado claro. Cada fila dice por qué.')).toBeTruthy();
    expect(focus.getByRole('button', { name: /^Pullover en polea, mezclado, sin una carga o repeticiones en común/ })).toBeTruthy();
    expect(focus.queryByText(/subió por un lado y bajó por otro/i)).toBeNull();
  });
});

describe('#518 · volver con caché vigente y vencida', () => {
  it('Comparaciones re-reads on every return (it revalidates the whole read); the evidence reuses a read younger than 30 s', async () => {
    mockRead.mockImplementation(serve(week()));
    const view = await open(<InsightsScreen />);
    await focus();
    expect(reads()).toEqual(['summary']);
    now += 5_000; await focus(); // Fresh: still one more read, by design (usePeriodReturn).
    expect(reads()).toEqual(['summary', 'summary']);
    now += READ_REUSE_MS + 1_000; await focus(); // Expired: one read, the reuse window and the return join.
    expect(reads()).toEqual(['summary', 'summary', 'summary']);
    fireEvent.press(within(view.getByTestId('insights-hero')).getByRole('button', { name: /^Remo con barra,/ }));
    view.unmount();
    mockRead.mockClear();
    mockParams = lastPush().params;
    const detail = await open(<EvidenceScreen />);
    expect(reads()).toHaveLength(1);
    now += 5_000; await focus();
    expect(reads()).toHaveLength(1); // Fresh: reused.
    now += READ_REUSE_MS + 1_000; await focus();
    expect(reads()).toHaveLength(2); // Expired: read again.
    detail.unmount();
  });
});

describe('#518 · cero, ausente e indeterminado', () => {
  type Session = DayFact['sessions'][number];
  const at = (carbs: Session['context']['carbsPre3h'], preStart?: Session['context']['preStart']): Pick<Session, 'context'> => ({
    context: { feelings: {}, legacy: { energyLevel: null, performanceLevel: null, painLevel: null }, carbsPre3h: carbs, ...(preStart ? { preStart } : {}) },
  });
  const carbs = (session: Pick<Session, 'context'>) => preStartRows(session).find(row => row.key === 'carbs')?.value;
  it('keeps a recorded zero, an empty window and an undetermined window apart, and explains the last one once', () => {
    expect(carbs(at({ value: 0, state: 'recorded' }))).toBe('0 g');
    expect(carbs(at({ value: null, state: 'no_registered_meal' }))).toBe('Sin comidas con hora');
    const untimed = at({ value: null, state: 'untimed_meal_in_scope' });
    expect(carbs(untimed)).toBe('Indeterminado');
    expect(preStartNote(untimed)).toBe('Hay comidas sin hora ese día. Pueden haber sido dentro de las 3 h, así que esa ventana queda indeterminada.');
    expect(preStartNote(at({ value: 0, state: 'recorded' }))).toBeNull();
    expect(preStartNote(at({ value: null, state: 'unverified_meal_time_in_scope' }))).toMatch(/no sabemos si es la real/);
  });
  it('the 3 h note comes only from the three 3 h nutrients; the 12 h caveat stays on the last-meal row', () => {
    // Confirmed 3 h values, and an untimed meal found only by the 12 h search for the last meal.
    const session = at({ value: 0, state: 'recorded' }, { proteinG: { value: 20, state: 'recorded' }, calories: { value: 250, state: 'recorded' },
      lastExplicitMeal: { hours: 1.5, state: 'recorded', untimedInScope: true, unverifiedInScope: false } });
    expect(preStartRows(session).map(row => row.value)).toEqual(['0 g', '20 g', '250 kcal', 'Hace 1 h 30 min']);
    expect(preStartNote(session)).toBeNull();
    expect(preStartRows(session).find(row => row.key === 'last-meal')?.detail).toBe('Hay comidas sin hora que podrían ser posteriores');
    const unverified = at({ value: 0, state: 'recorded' }, { proteinG: { value: 20, state: 'recorded' }, calories: { value: 250, state: 'recorded' },
      lastExplicitMeal: { hours: 1.5, state: 'recorded', untimedInScope: false, unverifiedInScope: true } });
    expect(preStartNote(unverified)).toBeNull();
    // One of the three undetermined: then, and only then, the window note.
    expect(preStartNote(at({ value: 0, state: 'recorded' }, { proteinG: { value: null, state: 'untimed_meal_in_scope' }, calories: { value: 250, state: 'recorded' },
      lastExplicitMeal: { hours: null, state: 'no_explicit_meal_in_12h', untimedInScope: true, unverifiedInScope: false } }))).toMatch(/esa ventana queda indeterminada/);
  });
  it('writes sleep in hours and minutes only when the metric declares a duration in minutes', () => {
    const day = (value: number) => ({ context: { metrics: [{ metricId: 'm', value }], bodyWeight: null, nutrition: null } }) as unknown as DayFact;
    expect(contextRows(day(435), [{ id: 'm', name: 'Sueño', unit: 'min', valueType: 'duration', archived: false }])[0]!.value).toBe('7 h 15 min');
    expect(contextRows(day(435), [{ id: 'm', name: 'Sueño', unit: 'min', valueType: 'decimal', archived: false }])[0]!.value).toBe('435 min');
    expect(contextRows(day(7.25), [{ id: 'm', name: 'Sueño', unit: 'h', valueType: 'decimal', archived: false }])[0]!.value).toBe('7,25 h');
    expect(contextRows(day(0), [{ id: 'm', name: 'Sueño', unit: 'min', valueType: 'duration', archived: false }])[0]!.value).toBe('0 h 0 min');
  });
});
