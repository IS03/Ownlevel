import { act, fireEvent, render, within } from '@testing-library/react-native';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { OwnlevelThemeProvider } from '@/design-system';
import type { MobileApiClient } from '@/api/client';
import { clearConfirmedReads } from '@/api/confirmed-read-cache';
import { parsePerformanceInsights, type DayFact } from '@/api/performance-insights';
import { createInsightsSnapshot, insightsDaysPage, insightsSummary } from '../../../../src/lib/progress/insights-engine/read-model';
import { parseSessionFeelings } from '../../../../src/lib/progress/insights-engine/source-adapter';
import type { InsightsSource } from '../../../../src/lib/progress/insights-engine/types';
import { InsightsScreen } from './insights-screen';
import { daySessions, nutritionRows, sessionRows, sessionTime } from './insights-model';
import { bodyWeightHref, dayWeightHref, insightsReturnHref, insightsSessionHref, nutritionDayHref } from './navigation';

jest.mock('@react-native-async-storage/async-storage', () => jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
const mockPush = jest.fn(), mockSetParams = jest.fn(), mockNavigate = jest.fn();
let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, setParams: mockSetParams, navigate: mockNavigate, back: jest.fn() }), useFocusEffect: () => undefined, useLocalSearchParams: () => mockParams }));
jest.mock('@/platform/haptics', () => ({ haptics: { selection: jest.fn() }, triggerHaptic: jest.fn() }));
type ReadOptions = Parameters<MobileApiClient['read']>[0];
const mockRead = jest.fn<(options: ReadOptions) => Promise<unknown>>();
const mockClient = { read: mockRead, request: jest.fn() } as unknown as MobileApiClient;
jest.mock('@/api', () => ({ useMobileApi: () => ({ client: mockClient }) }));

const EX = '93670000-0000-4000-8000-00000000000a';
const S0 = '93670000-0000-4000-8000-000000000b00', MORNING = '93670000-0000-4000-8000-000000000b01', EVENING = '93670000-0000-4000-8000-000000000b02';
const D0 = '2026-03-02', D1 = '2026-03-03';
type Row = InsightsSource['sessions'][number];
const session = (id: string, date: string, start: string, end: string): Row => ({ id, date, routineId: 'r1', routineName: id === EVENING ? 'Piernas' : 'Empuje', name: null, status: 'completed', startedAt: `${date}T${start}:00.000Z`, endedAt: `${date}T${end}:00.000Z`, performanceLevel: null, painLevel: null, legacyEnergyLevel: null });
const meal = (id: string, macros: Partial<Record<'calories' | 'proteinG' | 'carbsG' | 'fatG', number | null>>) => ({ id, date: D1, consumedAt: null, rawInput: null, entryKind: 'meal', sourceType: 'manual', consumedAtSource: null, importRunId: null, calories: null, proteinG: null, carbsG: null, fatG: null, ...macros });

/** One day with one session, then a day with two: different answers, one late and one unreadable, and meals with a macro missing. */
function source(): InsightsSource {
  const sessions = [session(S0, D0, '18:00', '19:00'), session(EVENING, D1, '20:00', '21:00'), session(MORNING, D1, '12:00', '13:00')];
  const exercises = sessions.map((row, i) => ({ id: `e${i}`, sessionId: row.id, exerciseId: EX, name: 'Press banca', implement: 'barra', weightMode: 'Peso total', isCompleted: true, configuration: null }));
  const sets = sessions.map((row, i) => ({ id: `set${i}`, sessionExerciseId: `e${i}`, actualReps: [8, 9, 10][i]!, actualLoad: 100, isCompleted: true, completedAt: row.startedAt!.replace(/:00:00/, ':10:00') }));
  return { sessions, exercises, sets, metricDefinitions: [], metricValues: [],
    feelings: [
      { sessionId: MORNING, revision: 1, facts: { energyPre: { value: 4, capturedAt: `${D1}T11:55:00.000Z`, declaredMoment: 'pre' }, fatiguePost: { value: 2, capturedAt: `${D1}T13:01:00.000Z`, declaredMoment: 'post' } } },
      { sessionId: EVENING, revision: 1, facts: { energyPre: { value: 2, capturedAt: `${D1}T20:30:00.000Z`, declaredMoment: 'pre' }, fatiguePre: { value: 9, capturedAt: null, declaredMoment: 'pre' } } },
    ],
    meals: [meal('m1', { calories: 500, proteinG: 30, carbsG: null, fatG: 0 }), meal('m2', { calories: 300, proteinG: 20, carbsG: 40, fatG: 0 })] };
}
const serve = (input: InsightsSource, revision = 'r1') => {
  const snapshot = createInsightsSnapshot(input, { today: '2027-01-01', permutations: 19, revision, method: 2 });
  return async (options: ReadOptions) => {
    const query = new URL(`http://x${options.path}`).searchParams;
    const body = query.get('view') === 'days' ? insightsDaysPage(snapshot, { before: query.get('before') ?? undefined, limit: Number(query.get('limit')) || undefined }) : insightsSummary(snapshot);
    const parsed = options.parse(JSON.parse(JSON.stringify(body)));
    if (parsed === undefined) throw Error(`Contract rejected ${options.path}`);
    return { status: 'ok' as const, data: parsed, meta: { durationMs: 1, httpStatus: 200, outcome: 'ok' as const } };
  };
};
const day = (date: string) => (insightsSummary(createInsightsSnapshot(source(), { today: '2027-01-01', permutations: 19, method: 2 })).facts.days as DayFact[]).find(row => row.date === date)!;
const flush = () => act(async () => { for (let i = 0; i < 3; i++) await new Promise(resolve => setTimeout(resolve, 0)); });
const open = async () => {
  const view = render(<SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}><OwnlevelThemeProvider initialMode="light"><InsightsScreen /></OwnlevelThemeProvider></SafeAreaProvider>);
  await flush(); return view;
};
beforeEach(() => { mockParams = {}; mockPush.mockClear(); mockSetParams.mockClear(); mockRead.mockReset(); clearConfirmedReads(mockClient); });

describe('#367 contexto diario: el motor y el contrato', () => {
  it('says which answers exist but cannot be read, without changing what is excluded', () => {
    const parsed = parseSessionFeelings({ energyPre: { value: 9, capturedAt: null, declaredMoment: 'pre' }, fatiguePost: { value: 3, capturedAt: null, declaredMoment: 'post' } }, { startedAt: null, endedAt: null }, null);
    expect(parsed).toMatchObject({ invalid: 1, unreadable: ['energyPre'] });
    expect(parseSessionFeelings('nope', { startedAt: null, endedAt: null }, null)).toMatchObject({ invalid: 1, unreadable: ['energyPre', 'fatiguePre', 'energyPost', 'fatiguePost'] });
    const snapshot = createInsightsSnapshot(source(), { today: '2027-01-01', permutations: 19, method: 2 });
    const sessions = insightsSummary(snapshot).facts.days.flatMap(row => row.sessions);
    expect(sessions.find(row => row.sessionId === EVENING)!.context.unreadableFeelings).toEqual(['fatiguePre']);
    // Only where there is one: every other session keeps the shape older clients already read.
    expect(sessions.filter(row => row.sessionId !== EVENING).every(row => !('unreadableFeelings' in row.context))).toBe(true);
    expect(insightsSummary(snapshot).exclusions.source.feeling_invalid).toBe(1);
  });
  it('accepts the field or its absence, and rejects a key it does not know', () => {
    const body = JSON.parse(JSON.stringify(insightsSummary(createInsightsSnapshot(source(), { today: '2027-01-01', permutations: 19, method: 2 }))));
    expect(parsePerformanceInsights(body)).toBeDefined();
    const target = body.facts.days.flatMap((row: DayFact) => row.sessions).find((row: DayFact['sessions'][number]) => row.sessionId === EVENING);
    delete target.context.unreadableFeelings;
    expect(parsePerformanceInsights(body)).toBeDefined();
    target.context.unreadableFeelings = ['mood'];
    expect(parsePerformanceInsights(body)).toBeUndefined();
  });
});

describe('#367 contexto diario: presentación', () => {
  it('orders a day by start only when every start is known and none ties', () => {
    expect(daySessions(day(D1)).sessions.map(row => row.sessionId)).toEqual([MORNING, EVENING]);
    expect(daySessions(day(D1)).orderKnown).toBe(true);
    const unknown = { sessions: [{ ...day(D1).sessions[0]!, startedAt: null }, day(D1).sessions[1]!] } as DayFact;
    expect(daySessions(unknown)).toEqual({ sessions: unknown.sessions, orderKnown: false });
    const tied = { sessions: day(D1).sessions.map(row => ({ ...row, startedAt: `${D1}T12:00:00.000Z` })) } as DayFact;
    expect(daySessions(tied).orderKnown).toBe(false);
    expect(daySessions({ sessions: [unknown.sessions[0]!] } as DayFact).orderKnown).toBe(true);
    expect(sessionTime(unknown.sessions[0]!)).toBe('Sin horario');
    expect(sessionTime({ startedAt: `${D1}T12:00:00.000Z`, endedAt: null })).toBe('Desde 09:00');
    expect(sessionTime(day(D1).sessions.find(row => row.sessionId === MORNING)!)).toBe('09:00–10:00');
  });
  it('keeps not recorded, unreadable and late answers apart, and the legacy energy on its own', () => {
    const [morning, evening] = daySessions(day(D1)).sessions;
    expect(sessionRows(morning!).slice(0, 2)).toEqual([
      // Ordinal answers, before → after: never a number of the scale, an average or a combined score.
      expect.objectContaining({ label: 'Energía', value: 'alta → sin registrar' }),
      expect.objectContaining({ label: 'Fatiga', value: 'sin registrar → poca' }),
    ]);
    expect(sessionRows(morning!)[0]!.detail).toBeUndefined();
    expect(sessionRows(evening!)[0]).toMatchObject({ label: 'Energía', value: 'baja → sin registrar', detail: 'Antes: respondida después de empezar' });
    expect(sessionRows(evening!)[1]).toMatchObject({ label: 'Fatiga', value: 'no se pudo leer → sin registrar' });
    expect(sessionRows(evening!)[1]!.detail).toBeUndefined();
    expect(sessionRows(evening!)[0]!.spoken).toBe('Energía: baja antes de entrenar, sin registrar al terminar. Antes: respondida después de empezar');
    const nothing = day(D0).sessions[0]!;
    expect(sessionRows(nothing)[0]).toEqual({ key: 'feelings', label: 'Sensaciones', value: 'Sin registrar' });
    const legacy = sessionRows({ ...nothing, context: { ...nothing.context, legacy: { energyLevel: 3, performanceLevel: null, painLevel: null } } });
    expect(legacy.find(row => row.key === 'legacy-energy')).toMatchObject({ label: 'Energía, registro anterior', value: '3 de 5' });
    expect(legacy.some(row => /Al terminar/.test(row.label))).toBe(false);
  });
  it('shows the four canonical totals, with a partial one, a known zero and no data apart', () => {
    expect(nutritionRows(day(D1)).map(row => [row.label, row.value, row.detail])).toEqual([
      ['Calorías', '800 kcal', undefined], ['Proteínas', '50 g', undefined], ['Carbohidratos', '40 g, parcial', '1 de 2 comidas sin ese dato'], ['Grasas', '0 g', undefined],
    ]);
    const none = { context: { metrics: [], nutrition: { activeMeals: 2, calories: { recorded: 0, missing: 2 }, proteinG: { recorded: 0, missing: 0 }, carbsG: { recorded: 0, missing: 2 }, fatG: { recorded: 0, missing: 2 } } } } as unknown as DayFact;
    expect(nutritionRows(none).map(row => row.value)).toEqual(['Sin dato', '0 g', 'Sin dato', 'Sin dato']);
    expect(nutritionRows(day(D0))).toEqual([{ key: 'meals', label: 'Comidas', value: 'Sin comidas registradas' }]);
  });
});

describe('#367 contexto diario: pantalla', () => {
  it('shows every session of the day once, in order, and the shared day once', async () => {
    mockRead.mockImplementation(serve(source()));
    const view = await open();
    const hero = within(view.getByTestId('insights-hero-context'));
    expect(hero.getByText('Sesiones de ese día')).toBeTruthy();
    expect(hero.getByTestId('insights-day-order').props.children).toBe('2 sesiones, en el orden en que empezaron.');
    const names = hero.getAllByRole('button', { name: /^Abrir sesión/ }).map(row => row.props.accessibilityLabel);
    expect(names).toEqual(['Abrir sesión Empuje, 09:00–10:00', 'Abrir sesión Piernas, 17:00–18:00']);
    expect(hero.getAllByTestId('insights-day-shared')).toHaveLength(1);
    expect(hero.getAllByText('Calorías')).toHaveLength(1);
    expect(hero.getByText('Antes: respondida después de empezar')).toBeTruthy();
    expect(hero.getByText('El momento de cada respuesta sale del reloj del teléfono.')).toBeTruthy();
    expect(hero.queryByText(/todo lo que comiste/)).toBeTruthy();
    fireEvent.press(hero.getByRole('button', { name: /^Abrir sesión Piernas/ }));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/(tabs)/train/history/[id]', params: { id: EVENING } });
  });
  it('focuses the completed session, keeps the day accessible and returns from Nutrition with its revision', async () => {
    mockParams = insightsSessionHref(EVENING, D1)!.params;
    mockRead.mockImplementation(serve(source()));
    const view = await open();
    const focus = within(view.getByTestId('insights-session'));
    expect(focus.getByRole('header', { name: 'Piernas' })).toBeTruthy();
    expect(focus.getByText(/2026 · 17:00–18:00/)).toBeTruthy();
    expect(focus.getByText('baja → sin registrar')).toBeTruthy();
    expect(focus.queryByText('alta → sin registrar')).toBeNull();
    fireEvent.press(focus.getByRole('button', { name: /^Ver horarios y comidas registradas/ }));
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/(tabs)/train/insights/temporal', params: { session: EVENING, date: D1, fromSession: '1', revision: 'r1' } });
    fireEvent.press(focus.getByRole('button', { name: /^Ver Nutrición/ }));
    const href = mockPush.mock.calls.at(-1)![0] as ReturnType<typeof nutritionDayHref>;
    expect(href).toEqual({ pathname: '/(tabs)/nutrition', params: { date: D1, insightsReturn: '1', insightsDate: D1, insightsSession: EVENING, insightsFromSession: '1', insightsRevision: 'r1' } });
    expect(insightsReturnHref(href.params)).toEqual({ pathname: '/(tabs)/train/insights', params: { date: D1, session: EVENING, fromSession: '1', revision: 'r1' } });
  });
  it('a newer read replaces the day instead of mixing sessions of two reads', async () => {
    mockParams = { session: EVENING, date: D1 };
    let revision = 'r1';
    const changed = source();
    mockRead.mockImplementation(options => serve(revision === 'r1' ? source() : { ...changed, feelings: [] }, revision)(options));
    const view = await open();
    expect(within(view.getByTestId('insights-session')).getByText('Antes: respondida después de empezar')).toBeTruthy();
    revision = 'r2';
    await act(async () => { view.getByTestId('insights-screen').props.refreshControl.props.onRefresh(); }); await flush();
    const focus = within(view.getByTestId('insights-session'));
    expect(focus.queryByText('Antes: respondida después de empezar')).toBeNull();
    expect(focus.getByLabelText('Sensaciones: Sin registrar')).toBeTruthy();
    expect(focus.queryByText('baja → sin registrar')).toBeNull();
    expect(focus.queryByText('no se pudo leer → sin registrar')).toBeNull();
  });
  it('opens a historical day from its week and preserves the period through Nutrition and temporal evidence', async () => {
    mockParams = { date: D1, before: '2026-03-04', explore: '1', asOf: '2026-04-01', week: D0, revision: 'older' };
    mockRead.mockImplementation(serve(source()));
    const view = await open();
    expect(mockRead.mock.calls[0]![0].path).toContain('before=2026-03-04');
    expect(view.getByRole('button', { name: 'Volver a la semana' })).toBeTruthy();
    const focus = within(view.getByTestId('insights-hero-context'));
    fireEvent.press(focus.getByRole('button', { name: /^Ver Nutrición/ }));
    const href = mockPush.mock.calls.at(-1)![0] as ReturnType<typeof nutritionDayHref>;
    expect(insightsReturnHref(href.params)).toMatchObject({ pathname: '/(tabs)/train/insights', params: { date: D1, before: '2026-03-04', explore: '1', asOf: '2026-04-01', week: D0 } });
    fireEvent.press(focus.getByRole('button', { name: /Ver horarios y comidas/ }));
    expect(mockPush.mock.calls.at(-1)![0]).toMatchObject({ pathname: '/(tabs)/train/insights/temporal', params: { date: D1, before: '2026-03-04', explore: '1', asOf: '2026-04-01', week: D0, revision: 'r1' } });
    fireEvent.press(view.getByRole('button', { name: 'Volver a la semana' }));
    expect(mockNavigate).toHaveBeenLastCalledWith({ pathname: '/(tabs)/train/insights/weeks', params: { asOf: '2026-04-01', week: D0, revision: 'older' } });
  });
});

describe('#367 peso del día hacia Cuerpo', () => {
  it('opens Cuerpo on the month of that day, with the origin to come back', async () => {
    mockParams = { session: EVENING, date: D1 };
    mockRead.mockImplementation(serve(source()));
    const view = await open();
    fireEvent.press(within(view.getByTestId('insights-session')).getByRole('button', { name: /^Peso corporal, ese día: Sin registrar\. Ver en Cuerpo$/ }));
    const href = mockPush.mock.calls.at(-1)![0] as ReturnType<typeof dayWeightHref>;
    expect(href).toEqual({ pathname: '/(tabs)/progress/trends/body', params: { metric: 'body.weight', from: '2026-03-01', to: '2026-03-31', insightsReturn: '1', insightsDate: D1, insightsSession: EVENING } });
    expect(insightsReturnHref(href.params)).toEqual({ pathname: '/(tabs)/train/insights', params: { date: D1, session: EVENING, fromSession: '1', revision: 'r1' } });
  });
  it('a relation opens the span of its days, its newest year at most, and comes back to the relation', () => {
    const relation = 'partial:body:weight_kg:same_day';
    expect(bodyWeightHref({ from: '2026-01-05', to: '2026-03-03' }, { relation }).params).toMatchObject({ from: '2026-01-05', to: '2026-03-03' });
    expect(bodyWeightHref({ from: '2024-01-01', to: '2026-03-03' }, { relation }).params).toMatchObject({ from: '2025-03-03', to: '2026-03-03' });
    const none = bodyWeightHref(null, { relation });
    expect(none.params).toEqual({ metric: 'body.weight', insightsReturn: '1', insightsRelation: relation });
    expect(insightsReturnHref(none.params)).toEqual({ pathname: '/(tabs)/train/insights/[relation]', params: { relation } });
  });
});
