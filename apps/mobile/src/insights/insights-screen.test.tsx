import { act, fireEvent, render, within } from '@testing-library/react-native';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { OwnlevelThemeProvider } from '@/design-system';
import type { MobileApiClient } from '@/api/client';
import { clearConfirmedReads } from '@/api/confirmed-read-cache';
import type { MobileApiReadResult } from '@/api/results';
import { parseCompleteInsights, type InsightsReadModel } from '@/api/performance-insights';
import { buildInsightsReadModel, createInsightsSnapshot, insightsDaysPage, insightsRelation, insightsRelations, insightsSummary } from '../../../../src/lib/progress/insights-engine/read-model';
import type { InsightsSource } from '../../../../src/lib/progress/insights-engine/types';
import { InsightsScreen } from './insights-screen';
import { RelationDetailScreen } from './relation-detail-screen';
import { insightsReturnHref, metricTrendHref } from './navigation';
import { exerciseSentence, heroOf, joinDays, relationGroups, relationSentence, relationState, stripMarks } from './insights-model';

jest.mock('@react-native-async-storage/async-storage', () => jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
const mockPush = jest.fn(), mockSetParams = jest.fn();
const requests = () => mockRead.mock.calls.map(call => String(call[0].path));
let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, setParams: mockSetParams, back: jest.fn() }), useFocusEffect: () => undefined, useLocalSearchParams: () => mockParams }));
jest.mock('@/platform/haptics', () => ({ haptics: { selection: jest.fn() }, triggerHaptic: jest.fn() }));
jest.mock('@/training/exercise-segmented', () => {
  const { Pressable, Text, View } = jest.requireActual<typeof import('react-native')>('react-native');
  return { ExerciseSegmented: ({ options, onChange }: { options: readonly { value: string; label: string }[]; onChange: (value: string) => void }) => <View>{options.map(option => <Pressable key={option.value} accessibilityRole="button" onPress={() => onChange(option.value)}><Text>{option.label}</Text></Pressable>)}</View> };
});
type ReadOptions = Parameters<MobileApiClient['read']>[0];
const mockRead = jest.fn<(options: ReadOptions) => Promise<MobileApiReadResult<unknown>>>();
const mockClient = { read: mockRead, request: jest.fn() } as unknown as MobileApiClient;
jest.mock('@/api', () => ({ useMobileApi: () => ({ client: mockClient }) }));

const EX = '93670000-0000-4000-8000-00000000000a', METRIC = '93670000-0000-4000-8000-0000000000aa';
const meta = { durationMs: 1, httpStatus: 200, outcome: 'ok' as const };
const ok = (data: unknown) => ({ status: 'ok' as const, data, meta });
const lost = { status: 'unavailable' as const, reason: 'network' as const, meta: { durationMs: 1, httpStatus: null, outcome: 'unavailable' as const } };
const dateAt = (day: number) => new Date(Date.UTC(2026, 0, 1 + day)).toISOString().slice(0, 10);

function history(reps: readonly (number | null)[], configuration: string | null = null): InsightsSource {
  const sessions: InsightsSource['sessions'][number][] = [], exercises: InsightsSource['exercises'][number][] = [], sets: InsightsSource['sets'][number][] = [];
  reps.forEach((value, day) => {
    if (value === null) return;
    const date = dateAt(day), id = `s${day}`;
    sessions.push({ id, date, routineId: 'r1', routineName: 'Empuje', name: null, status: 'completed', startedAt: `${date}T18:00:00.000Z`, endedAt: `${date}T19:00:00.000Z`, performanceLevel: null, painLevel: null, legacyEnergyLevel: null });
    exercises.push({ id: `e${day}`, sessionId: id, exerciseId: EX, name: 'Press banca', implement: 'barra', weightMode: 'Peso total', isCompleted: true, configuration });
    sets.push({ id: `set${day}`, sessionExerciseId: `e${day}`, actualReps: value, actualLoad: 100, isCompleted: true, completedAt: `${date}T18:10:00.000Z` });
  });
  return { sessions, exercises, sets, feelings: [], metricDefinitions: [], metricValues: [], meals: [] };
}
const withMetric = (source: InsightsSource): InsightsSource => ({ ...source, metricDefinitions: [{ id: METRIC, name: 'Sueño', unit: 'h', valueType: 'decimal', archived: false }],
  metricValues: source.sessions.map((session, day) => ({ metricId: METRIC, date: session.date!, value: (day * 7) % 11 })) });
const read = (source: InsightsSource, association?: string): InsightsReadModel => parseCompleteInsights(JSON.parse(JSON.stringify(buildInsightsReadModel(source, { today: '2027-01-01', permutations: 19, association }))))!;
/** Answers as the route does, each view through its real parser: what the screens get is what the contract lets through. */
const serve = (source: InsightsSource, revision = 'r1') => {
  const snapshot = createInsightsSnapshot(source, { today: '2027-01-01', permutations: 19, revision });
  return async (options: ReadOptions) => {
    const query = new URL(`http://x${options.path}`).searchParams, association = query.get('association'), before = query.get('before') ?? undefined;
    const body = association ? insightsRelation(snapshot, association, { pairs: query.get('pairs') === 'all' ? 'all' : 'recent' }) : query.get('view') === 'relations' ? insightsRelations(snapshot) : query.get('view') === 'days' ? insightsDaysPage(snapshot, { before }) : insightsSummary(snapshot);
    const parsed = options.parse(JSON.parse(JSON.stringify(body)));
    if (parsed === undefined) throw Error(`Contract rejected ${options.path}`);
    return ok(parsed);
  };
};
const screen = (ui: React.ReactElement) => render(<SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}><OwnlevelThemeProvider initialMode="light">{ui}</OwnlevelThemeProvider></SafeAreaProvider>);
const flush = () => act(async () => { for (let i = 0; i < 3; i++) await new Promise(resolve => setTimeout(resolve, 0)); });
const open = async (ui: React.ReactElement) => { const view = screen(ui); await flush(); return view; };
const oscillating = Array.from({ length: 40 }, (_, day) => 8 + (day % 2 ? 1 : -1) * (day % 5 + 1));

beforeEach(() => { mockParams = {}; mockPush.mockClear(); mockSetParams.mockClear(); mockRead.mockReset(); clearConfirmedReads(mockClient); });

describe('modelo de presentación', () => {
  it('leads with the strict method only when it compared something, and never adds the two', () => {
    const partial = read(history([8, 10, 9]));
    const days = joinDays(partial.facts.days, partial.partial.days);
    expect(heroOf(days)).toMatchObject({ lane: 'partial', counts: { comparable: 1, total: 1 } });
    const strict = read(history([8, 10, 9], 'none'));
    expect(heroOf(joinDays(strict.facts.days, strict.partial.days))).toMatchObject({ lane: 'strict', counts: { comparable: 1, total: 1 } });
  });
  it('keeps a zero as a mark and a day without comparison as a gap', () => {
    const model = read(history([8, 8, 9, 7]));
    const marks = stripMarks(joinDays(model.facts.days, model.partial.days), 'partial');
    expect(marks.map(mark => mark.kind)).toEqual(['gap', 'zero', 'zero', 'value']);
  });
  it('speaks of records in the partial lane, without a word about capacity', () => {
    const text = exerciseSentence('partial', 'Press banca', 'lower_record', 'direct_evidence', 3);
    expect(text).toBe('Press banca, registro inferior con contexto parcial, hace 3 días');
    expect(text).not.toMatch(/mejor|baj[oó]|fuerza|capacidad/i);
  });
  it('never names a cause, and keeps every relation reachable', () => {
    const model = read(withMetric(history(oscillating)));
    const item = model.partial.associations.items.find(row => row.definition.subject === METRIC && row.definition.window === 'same_day')!;
    const coincidence = { ...item, state: 'coincidence_context_unknown' as const, rho: -0.4, pairs: 34, outcomeDays: 120 };
    const sentence = relationSentence('partial', coincidence, model.metrics);
    expect(sentence).toBe('Los días con más sueño coincidieron con menos ejercicios con registro inferior, en 34 de 120 días. No sabemos si esos días cambiaste de variante, así que esto no dice que tenga que ver.');
    expect(sentence).not.toMatch(/porque|causa|deber|consistente|patr[oó]n|mejor/i);
    expect(relationState(coincidence)).toBe('Coincidieron');
    const strictItem = { ...model.associations.items.find(row => row.definition.subject === METRIC)!, state: 'exploratory' as const, rho: 0.4, pairs: 34, outcomeDays: 120 };
    expect(relationSentence('strict', strictItem, model.metrics)).toBe('Los días con más sueño, más ejercicios quedaron por debajo de la última vez. Lo vimos en 34 de 120 días. Todavía no alcanza para decir que se repite.');
    const groups = relationGroups(model.partial.associations.items, 'all');
    expect(groups.readable.length + groups.waiting.length).toBe(model.partial.associations.candidatesEvaluated);
  });
});

describe('pantalla', () => {
  it('shows the partial lane with its limit when the configuration is unknown, one hero and no strict words', async () => {
    mockRead.mockImplementation(serve(history([8, 10, 9])));
    const view = await open(<InsightsScreen />);
    expect(view.getByTestId('insights-hero')).toBeTruthy();
    expect(view.getAllByText('1 de 1').length).toBeGreaterThan(0);
    expect(view.getByText('ejercicios comparables con contexto parcial')).toBeTruthy();
    expect(view.getByText(/^↓ Registro inferior$/)).toBeTruthy();
    expect(view.getByTestId('insights-partial-limit')).toBeTruthy();
    expect(view.queryByText(/Mejoraron/)).toBeNull(); expect(view.queryByText(/^↓ Por debajo$/)).toBeNull();
  });
  it('shows the strict lane without the limit once the configuration is known', async () => {
    mockRead.mockImplementation(serve(history([8, 10, 9], 'none')));
    const view = await open(<InsightsScreen />);
    expect(view.getByText(/^↓ Por debajo$/)).toBeTruthy();
    expect(view.queryByTestId('insights-partial-limit')).toBeNull();
  });
  it('tells empty, nothing comparable, failed and contradictory apart', async () => {
    mockRead.mockImplementationOnce(serve(history([])));
    let view = await open(<InsightsScreen />);
    expect(view.getByTestId('insights-empty')).toBeTruthy(); expect(view.getByText('EJEMPLO')).toBeTruthy();
    view.unmount(); clearConfirmedReads(mockClient);
    mockRead.mockImplementationOnce(serve(history([8])));
    view = await open(<InsightsScreen />);
    expect(view.getByTestId('insights-nothing')).toBeTruthy(); expect(view.getByText('Todavía no hay una sesión anterior para comparar.')).toBeTruthy();
    view.unmount(); clearConfirmedReads(mockClient);
    mockRead.mockResolvedValueOnce(lost);
    view = await open(<InsightsScreen />);
    expect(view.getByText('Uy, no pudimos leer tus datos')).toBeTruthy(); expect(view.queryByTestId('insights-empty')).toBeNull();
    view.unmount(); clearConfirmedReads(mockClient);
    const source = history([8, 9]);
    mockRead.mockImplementationOnce(serve({ ...source, sessions: [...source.sessions, { ...source.sessions[0]!, endedAt: `${dateAt(0)}T20:00:00.000Z` }] }));
    view = await open(<InsightsScreen />);
    expect(view.getByText('Uy, no pudimos leer tus datos')).toBeTruthy(); expect(view.queryByTestId('insights-empty')).toBeNull();
  });
  it('keeps the loaded days when another page fails', async () => {
    const source = history(Array.from({ length: 20 }, (_, day) => 8 + day % 3));
    const model = read(source);
    expect(model.facts.page.nextBefore).not.toBeNull();
    mockRead.mockImplementationOnce(serve(source)).mockResolvedValueOnce(lost);
    const view = await open(<InsightsScreen />);
    const before = view.getAllByRole('button').length;
    fireEvent.press(view.getByText("Ver más días")); await flush();
    expect(view.getByText('No pudimos traer más días.')).toBeTruthy();
    expect(view.getAllByRole('button').length).toBeGreaterThanOrEqual(before);
    expect(mockRead).toHaveBeenCalledTimes(2);
    expect(String(mockRead.mock.calls[1]![0].path)).toContain(`view=days&before=${model.facts.page.nextBefore}`);
  });
  it('joins a page of the same read, and never one of a read that changed', async () => {
    const source = history(Array.from({ length: 20 }, (_, day) => 8 + day % 3));
    mockRead.mockImplementation(serve(source));
    const view = await open(<InsightsScreen />);
    const rows = () => view.getAllByRole('button', { name: /comparables con contexto parcial/ }).length;
    expect(rows()).toBe(14);
    fireEvent.press(view.getByText('Ver más días')); await flush();
    expect(rows()).toBe(19);
    view.unmount(); clearConfirmedReads(mockClient); mockRead.mockReset();
    mockRead.mockImplementationOnce(serve(source, 'r1')).mockImplementation(serve(source, 'r2'));
    const changed = await open(<InsightsScreen />);
    fireEvent.press(changed.getByText('Ver más días')); await flush();
    expect(changed.getByTestId('insights-changed')).toBeTruthy();
    expect(changed.getAllByRole('button', { name: /comparables con contexto parcial/ }).length).toBe(14);
  });
  it('makes one read when it opens and pages only on a tap', async () => {
    mockRead.mockImplementation(serve(history(Array.from({ length: 20 }, (_, day) => 8 + day % 3))));
    await open(<InsightsScreen />);
    expect(mockRead).toHaveBeenCalledTimes(1);
    expect(String(mockRead.mock.calls[0]![0].path)).not.toContain('view=');
  });
  it('opens the exact session and the exercise from the evidence, and keeps the view in the route', async () => {
    mockRead.mockImplementation(serve(history([8, 10, 9])));
    const view = await open(<InsightsScreen />);
    fireEvent.press(view.getAllByRole('button', { name: /comparables con contexto parcial/ })[0]!);
    // The hero's day and the open day are the same: both name the session with its time.
    fireEvent.press(view.getAllByRole('button', { name: 'Abrir sesión Empuje, 15:00–16:00' })[0]!);
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/(tabs)/train/history/[id]', params: { id: 's2' } });
    fireEvent.press(view.getByRole('button', { name: /^Press banca, registro inferior con contexto parcial/ }));
    // The row opens the evidence of that comparison, with the reference and result shown here and the read they came from.
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/(tabs)/train/insights/evidence', params: expect.objectContaining({ session: 's2', exercise: EX, lane: 'partial', reference: 's1', result: 'lower_record', revision: 'r1', insightsReturn: '1' }) });
    // Nothing is read for it here: the detail reads when it opens.
    expect(requests().some(path => path.includes('view=evidence'))).toBe(false);
    fireEvent.press(view.getByText('Ejercicios'));
    expect(mockSetParams).toHaveBeenCalledWith({ view: 'exercises' });
  });
  it('lists exercises by lane and labels the partial one', async () => {
    mockParams = { view: 'exercises' };
    mockRead.mockImplementation(serve(history([8, 10, 9])));
    const view = await open(<InsightsScreen />);
    expect(view.getByText('Con contexto parcial')).toBeTruthy(); expect(view.queryByText('Comparación completa')).toBeNull();
    fireEvent.press(view.getByRole('button', { name: /Press banca: 1 registro superior, 0 registro igual, 1 registro inferior, de 3 veces/ }));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/(tabs)/train/history/exercise/[id]', params: { id: EX } });
  });
  it('reads relations only when asked for, and shows no strict list while it has no days', async () => {
    mockRead.mockImplementation(serve(withMetric(history(oscillating))));
    const closed = await open(<InsightsScreen />);
    expect(closed.getByText('Para mirar con calma')).toBeTruthy();
    expect(mockRead).toHaveBeenCalledTimes(1);
    fireEvent.press(closed.getByRole('button', { name: /^Para mirar con calma/ }));
    expect(mockSetParams).toHaveBeenCalledWith({ relations: '1' });
    closed.unmount();
    mockParams = { relations: '1' };
    const view = await open(<InsightsScreen />);
    expect(String(mockRead.mock.calls.at(-1)![0].path)).toContain('view=relations');
    expect(view.getAllByText('Con contexto parcial').length).toBeGreaterThan(0);
    expect(view.queryByText('Comparación completa')).toBeNull();
    fireEvent.press(view.getByText('Métricas'));
    expect(mockSetParams).toHaveBeenCalledWith({ family: 'metric' });
    fireEvent.press(view.getByRole('button', { name: /Sueño, ese día/ }));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/(tabs)/train/insights/[relation]', params: { relation: `partial:metric:${METRIC}:same_day` } });
  });
});

describe('entrada desde el final de una sesión', () => {
  const SESSION = '93670000-0000-4000-8000-000000000a01';
  /** Sessions with real ids, so the route's session parameter can name one. */
  const sessionsWithIds = (length: number) => { const source = history(Array.from({ length }, (_, day) => 8 + day % 3)); return { ...source, sessions: source.sessions.map(row => row.id === 's1' ? { ...row, id: SESSION } : row), exercises: source.exercises.map(row => row.sessionId === 's1' ? { ...row, sessionId: SESSION } : row) }; };
  it('opens the facts of that session with one read and runs no relation', async () => {
    mockParams = { session: SESSION, date: dateAt(1) };
    mockRead.mockImplementation(serve(sessionsWithIds(3)));
    const view = await open(<InsightsScreen />);
    expect(view.getByTestId('insights-session')).toBeTruthy();
    expect(view.queryByTestId('insights-hero')).toBeNull();
    const facts = within(view.getByTestId('insights-session'));
    expect(facts.getByText('1 de 1')).toBeTruthy();
    expect(facts.getAllByText(/^↑ Registro superior$/).length).toBeGreaterThan(0);
    expect(requests()).toEqual(['/api/mobile/v1/progress/performance-insights?method=2']);
    expect(view.getByTestId('insights-partial-limit')).toBeTruthy();
    expect(view.queryByText(/Exploratorio|Coincidieron/)).toBeNull();
  });
  it('asks for only its day when it is older than the first page, and never joins it to the list', async () => {
    mockParams = { session: SESSION, date: dateAt(1) };
    mockRead.mockImplementation(serve(sessionsWithIds(20)));
    const view = await open(<InsightsScreen />);
    expect(requests()).toEqual(['/api/mobile/v1/progress/performance-insights?method=2', `/api/mobile/v1/progress/performance-insights?method=2&view=days&before=${dateAt(2)}&limit=1`]);
    expect(view.getByTestId('insights-session')).toBeTruthy();
    expect(view.getAllByRole('button', { name: /comparables con contexto parcial/ })).toHaveLength(14);
  });
  it('tells loading, failure and absence apart', async () => {
    mockParams = { session: SESSION, date: dateAt(1) };
    const source = sessionsWithIds(20), answer = serve(source);
    mockRead.mockImplementationOnce(answer).mockResolvedValueOnce(lost).mockImplementation(answer);
    const failed = await open(<InsightsScreen />);
    expect(failed.getByText('No pudimos traer los hechos de esta sesión.')).toBeTruthy();
    expect(failed.queryByTestId('insights-session-absent')).toBeNull();
    fireEvent.press(failed.getByText('Reintentar')); await flush();
    expect(failed.getByTestId('insights-session')).toBeTruthy();
    failed.unmount(); clearConfirmedReads(mockClient); mockRead.mockReset();
    mockParams = { session: '93670000-0000-4000-8000-000000000a99', date: dateAt(19) };
    mockRead.mockImplementation(serve(source));
    const absent = await open(<InsightsScreen />);
    expect(absent.getByTestId('insights-session-absent')).toBeTruthy();
    expect(absent.queryByTestId('insights-empty')).toBeNull();
    expect(requests()).toHaveLength(1);
  });
  it('does not show a day from another read: it reads the list again', async () => {
    mockParams = { session: SESSION, date: dateAt(1) };
    const source = sessionsWithIds(20);
    mockRead.mockImplementationOnce(serve(source, 'r1')).mockImplementationOnce(serve(source, 'r2')).mockImplementation(serve(source, 'r2'));
    const view = await open(<InsightsScreen />); await flush();
    // Every view asks for method 2 (#367); the summary carries no view.
    expect(requests().filter(path => path.endsWith('performance-insights?method=2')).length).toBeGreaterThanOrEqual(2);
    expect(view.getByTestId('insights-session')).toBeTruthy();
  });
  it('ignores a session parameter that is not one', async () => {
    mockParams = { session: 'x y', date: 'nope' };
    mockRead.mockImplementation(serve(history([8, 10, 9])));
    const view = await open(<InsightsScreen />);
    expect(view.getByTestId('insights-hero')).toBeTruthy();
  });
});

describe('enlace a las tendencias de una métrica', () => {
  const metricSource = () => withMetric(history([8, 10, 9]));
  it('opens the right metric on the month of that day, carrying the state of the screen', async () => {
    mockParams = { family: 'metric', relations: '1', view: 'days' };
    mockRead.mockImplementation(serve(metricSource()));
    const view = await open(<InsightsScreen />);
    fireEvent.press(view.getByRole('button', { name: /^Sueño: .*Ver tendencias$/ }));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/(tabs)/progress/trends/metrics', params: { metric: METRIC, from: '2026-01-01', to: '2026-01-31', insightsReturn: '1', insightsFamily: 'metric', insightsRelations: '1', insightsDate: dateAt(2) } });
  });
  it('comes back to that day open, in the same view, filter and relations', () => {
    const href = metricTrendHref(METRIC, dateAt(2), { view: 'exercises', family: 'metric', relations: '1', date: dateAt(2) });
    expect(insightsReturnHref(href.params)).toEqual({ pathname: '/(tabs)/train/insights', params: { view: 'exercises', family: 'metric', relations: '1', date: dateAt(2) } });
  });
  it('comes back to the relation it came from', () => {
    expect(insightsReturnHref(metricTrendHref(METRIC, null, { relation: `partial:metric:${METRIC}:same_day` }).params)).toEqual({ pathname: '/(tabs)/train/insights/[relation]', params: { relation: `partial:metric:${METRIC}:same_day` } });
  });
  it('offers no return when it did not come from Insights, and drops what is not valid', () => {
    expect(insightsReturnHref({ metric: METRIC })).toBeNull();
    expect(insightsReturnHref({ insightsReturn: '1', insightsFamily: 'evil', insightsDate: '2026-02-31', insightsSession: '../x', insightsRelation: '<x>', insightsView: 'other' })).toEqual({ pathname: '/(tabs)/train/insights', params: {} });
  });
  it('keeps the current period when the link has no date', () => {
    expect(metricTrendHref(METRIC, null, {}).params).toEqual({ metric: METRIC, insightsReturn: '1' });
  });
  it('opens the day the route selects, and keeps the selection in the route', async () => {
    mockParams = { date: dateAt(1) };
    mockRead.mockImplementation(serve(metricSource()));
    const view = await open(<InsightsScreen />);
    const selected = view.getByRole('button', { name: new RegExp('comparables con contexto parcial', 'i'), expanded: true });
    expect(selected).toBeTruthy();
    fireEvent.press(selected);
    expect(mockSetParams).toHaveBeenCalledWith({ date: undefined });
  });
  it('opens trends from a metric relation, and no link from another family', async () => {
    const id = `partial:metric:${METRIC}:same_day`;
    mockParams = { relation: id };
    mockRead.mockImplementation(serve(withMetric(history(oscillating))));
    const view = await open(<RelationDetailScreen />);
    fireEvent.press(view.getByRole('button', { name: 'Ver tendencias de Sueño' }));
    const call = mockPush.mock.calls[0]![0] as { pathname: string; params: Record<string, string> };
    expect(call.pathname).toBe('/(tabs)/progress/trends/metrics');
    expect(call.params).toMatchObject({ metric: METRIC, insightsReturn: '1', insightsRelation: id });
    view.unmount(); clearConfirmedReads(mockClient);
    mockParams = { relation: 'partial:meal_window:carbsG:pre_3h' };
    const other = await open(<RelationDetailScreen />);
    expect(other.queryByRole('button', { name: /Ver tendencias/ })).toBeNull();
  });
});

describe('filtros y revisiones', () => {
  const long = () => history(Array.from({ length: 20 }, (_, day) => 8 + day % 3));
  const rows = (view: ReturnType<typeof screen>) => view.getAllByRole('button', { name: /comparables con contexto parcial/ }).length;
  it('keeps the paged days when the same read comes back, and drops them when another one does', async () => {
    let revision = 'r1';
    const source = long();
    mockRead.mockImplementation(options => serve(source, revision)(options));
    const view = await open(<InsightsScreen />);
    fireEvent.press(view.getByText('Ver más días')); await flush();
    expect(rows(view)).toBe(19);
    await act(async () => { view.getByTestId('insights-screen').props.refreshControl.props.onRefresh(); }); await flush();
    expect(rows(view)).toBe(19);
    expect(view.queryByTestId('insights-changed')).toBeNull();
    revision = 'r2';
    await act(async () => { view.getByTestId('insights-screen').props.refreshControl.props.onRefresh(); }); await flush();
    expect(rows(view)).toBe(14);
    expect(view.getByTestId('insights-changed')).toBeTruthy();
  });
  it('does not show relations next to facts of another read', async () => {
    mockParams = { relations: '1' };
    const source = withMetric(history(oscillating));
    mockRead.mockImplementation(serve(source, 'r1'));
    const first = await open(<InsightsScreen />);
    expect(first.getByText('Con contexto parcial')).toBeTruthy();
    first.unmount(); clearConfirmedReads(mockClient); mockRead.mockReset();
    let call = 0;
    // The facts come from r1, the relations from r2, and from then on everything is r2.
    mockRead.mockImplementation(options => { call++; return serve(source, call === 1 ? 'r1' : 'r2')(options); });
    const view = await open(<InsightsScreen />); await flush();
    expect(requests().filter(path => path.includes('view=relations')).length).toBeGreaterThanOrEqual(2);
    expect(view.queryByTestId('relations-changed')).toBeNull();
    expect(view.getByText('Con contexto parcial')).toBeTruthy();
  });
  it('changes the filter in the route, without asking for anything again', async () => {
    mockParams = { relations: '1', family: 'nutrition' };
    mockRead.mockImplementation(serve(withMetric(history(oscillating))));
    const view = await open(<InsightsScreen />);
    const before = mockRead.mock.calls.length;
    fireEvent.press(view.getByText('Métricas'));
    expect(mockSetParams).toHaveBeenCalledWith({ family: 'metric' });
    expect(mockRead.mock.calls.length).toBe(before);
    expect(view.queryByRole('button', { name: /Sueño, ese día/ })).toBeNull();
  });
});

describe('detalle de una relación', () => {
  const id = `partial:metric:${METRIC}:same_day`;
  it('asks for its pairs, keeps the limit and opens each day from the list', async () => {
    mockParams = { relation: id };
    mockRead.mockImplementation(serve(withMetric(history(oscillating))));
    const view = await open(<RelationDetailScreen />);
    expect(String(mockRead.mock.calls[0]![0].path)).toContain(`association=${encodeURIComponent(id)}`);
    expect(view.getByText('Sueño, ese día')).toBeTruthy();
    expect(view.getByTestId('relation-partial-limit')).toBeTruthy();
    expect(view.getByTestId('relation-lane').props.children).toContain('Con contexto parcial');
    fireEvent(view.getByTestId('relation-plot'), 'layout', { nativeEvent: { layout: { width: 300, height: 180 } } });
    expect(view.getAllByTestId('relation-dot').length).toBeGreaterThan(20);
    const row = view.getAllByRole('button', { name: /Abrir sesión$/ })[0]!;
    fireEvent.press(row);
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/(tabs)/train/history/[id]', params: { id: expect.stringMatching(/^s\d+$/) } });
  });
  it('reads the newest days, says how many there are, and brings all of them only when asked', async () => {
    mockParams = { relation: id };
    const long = Array.from({ length: 90 }, (_, day) => 8 + (day % 2 ? 1 : -1) * (day % 5 + 1));
    mockRead.mockImplementation(serve(withMetric(history(long))));
    const view = await open(<RelationDetailScreen />);
    expect(mockRead).toHaveBeenCalledTimes(1);
    expect(String(mockRead.mock.calls[0]![0].path)).not.toContain('pairs=');
    fireEvent(view.getByTestId('relation-plot'), 'layout', { nativeEvent: { layout: { width: 300, height: 180 } } });
    expect(view.getAllByTestId('relation-dot')).toHaveLength(60);
    expect(view.getByText('Los números de esta relación ya cuentan todos los días.')).toBeTruthy();
    expect(view.getAllByRole('button', { name: /Abrir (sesión|día)$/ })).toHaveLength(60);
    const button = view.getByRole('button', { name: /^Ver los \d+ días$/ });
    const total = Number(/\d+/.exec(button.props.accessibilityLabel)?.[0]);
    expect(total).toBeGreaterThan(60);
    expect(view.getByTestId('relation-plot').props.accessibilityLabel).toContain(`Los últimos 60 de ${total} días.`);
    fireEvent.press(button); await flush();
    expect(String(mockRead.mock.calls[1]![0].path)).toContain('pairs=all');
    expect(mockRead).toHaveBeenCalledTimes(2);
    fireEvent(view.getByTestId('relation-plot'), 'layout', { nativeEvent: { layout: { width: 300, height: 180 } } });
    expect(view.getAllByTestId('relation-dot')).toHaveLength(total);
    expect(view.queryByText('Los números de esta relación ya cuentan todos los días.')).toBeNull();
    // The list grows by hand: every day is reachable, none of them drawn before it is asked for.
    fireEvent.press(view.getByRole('button', { name: 'Mostrar más días' }));
    expect(view.getAllByRole('button', { name: /Abrir (sesión|día)$/ })).toHaveLength(Math.min(total, 120));
  });
  it('keeps the recent answer and offers a retry when every day cannot be read', async () => {
    mockParams = { relation: id };
    const long = Array.from({ length: 90 }, (_, day) => 8 + (day % 2 ? 1 : -1) * (day % 5 + 1));
    const answer = serve(withMetric(history(long)));
    mockRead.mockImplementation(async (options: ReadOptions) => String(options.path).includes('pairs=all') ? lost : answer(options));
    const view = await open(<RelationDetailScreen />);
    fireEvent.press(view.getByRole('button', { name: /^Ver los \d+ días$/ })); await flush();
    expect(view.getByText('No pudimos traer todos los días.')).toBeTruthy();
    expect(view.getAllByRole('button', { name: /Abrir (sesión|día)$/ })).toHaveLength(60);
  });
  it('an answer of a newer read replaces the whole relation: its days are never joined to the older ones', async () => {
    mockParams = { relation: id };
    const long = Array.from({ length: 90 }, (_, day) => 8 + (day % 2 ? 1 : -1) * (day % 5 + 1));
    const older = serve(withMetric(history(long)), 'r1'), newer = serve(withMetric(history(long)), 'r2');
    let changed = false;
    mockRead.mockImplementation(async (options: ReadOptions) => { if (String(options.path).includes('pairs=all')) changed = true; return (changed ? newer : older)(options); });
    const view = await open(<RelationDetailScreen />);
    fireEvent.press(view.getByRole('button', { name: /^Ver los \d+ días$/ })); await flush();
    // Read again, because the answer belonged to another read. Once both agree, every day shows, from that read alone.
    expect(mockRead.mock.calls.length).toBeGreaterThanOrEqual(3);
    fireEvent(view.getByTestId('relation-plot'), 'layout', { nativeEvent: { layout: { width: 300, height: 180 } } });
    expect(view.getAllByTestId('relation-dot').length).toBeGreaterThan(60);
    expect(view.queryByRole('button', { name: /^Ver los \d+ días$/ })).toBeNull();
  });
  it('says so when the relation does not exist, instead of drawing an empty chart', async () => {
    mockParams = { relation: 'partial:metric:none:same_day' };
    mockRead.mockImplementation(serve(history(oscillating)));
    const view = await open(<RelationDetailScreen />);
    expect(view.getByText('No encontramos esta relación')).toBeTruthy();
  });
});
