import { fireEvent, render, within } from '@testing-library/react-native';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { OwnlevelThemeProvider } from '@/design-system';
import type { MobileApiClient } from '@/api/client';
import { clearConfirmedReads } from '@/api/confirmed-read-cache';
import type { MobileApiReadResult } from '@/api/results';
import type { DayFact, PerformanceChange, RelationFactor, SessionFact } from '@/api/performance-insights';
import { createInsightsSnapshot, insightsRoutineRelation, insightsSummary } from '../../../../src/lib/progress/insights-engine/read-model';
import type { InsightsSource } from '../../../../src/lib/progress/insights-engine/types';
import { FactorScreen } from './factor-screen';
import { arrivalFacts, exerciseChangeValue, factorSentence, factorValue, formatPct, joinedChange, sessionHero, shownText } from './comparison-change';
import { InsightsScreen, exerciseList } from './insights-screen';

/** #533 · Comparaciones with the measured change and Relación. Fictitious data only, built by the real engine. */
jest.mock('@react-native-async-storage/async-storage', () => jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
const mockPush = jest.fn(), mockSetParams = jest.fn();
let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, setParams: mockSetParams, back: jest.fn(), replace: jest.fn(), navigate: jest.fn(), canGoBack: () => true }),
  useFocusEffect: () => undefined,
  useLocalSearchParams: () => mockParams,
}));
jest.mock('@/platform/haptics', () => ({ haptics: { selection: jest.fn() }, triggerHaptic: jest.fn() }));
type ReadOptions = Parameters<MobileApiClient['read']>[0];
const mockRead = jest.fn<(options: ReadOptions) => Promise<MobileApiReadResult<unknown>>>();
const mockClient = { read: mockRead, request: jest.fn() } as unknown as MobileApiClient;
jest.mock('@/api', () => ({ useMobileApi: () => ({ client: mockClient }) }));

const id = (n: number) => `53300000-0000-4000-8533-${String(n).padStart(12, '0')}`;
const ROUTINE = id(900), PRESS = id(800);
const meta = { durationMs: 1, httpStatus: 200, outcome: 'ok' as const };
/** A routine with eight sessions of one exercise at 20 kg: reps 10, 11, 12, 12, 11, 12, 11, 13. */
let mockReps = [10, 11, 12, 12, 11, 12, 11, 13];
function source(): InsightsSource {
  const reps = mockReps;
  const sessions: InsightsSource['sessions'][number][] = [], exercises: InsightsSource['exercises'][number][] = [], sets: InsightsSource['sets'][number][] = [], meals: InsightsSource['meals'][number][] = [];
  reps.forEach((value, index) => {
    const date = `2026-10-${String(1 + index * 4).padStart(2, '0')}`, sessionId = id(index + 1), block = id(index + 100);
    sessions.push({ id: sessionId, date, routineId: ROUTINE, routineName: 'PULL', name: null, status: 'completed', startedAt: `${date}T21:00:00.000Z`, endedAt: `${date}T22:00:00.000Z`, performanceLevel: null, painLevel: null, legacyEnergyLevel: null, dayWeightKg: null });
    exercises.push({ id: block, sessionId, exerciseId: PRESS, name: 'Remo', implement: 'maquina', weightMode: 'Peso total', isCompleted: true, configuration: null });
    sets.push({ id: id(index + 200), sessionExerciseId: block, actualReps: value, actualLoad: 20, isCompleted: true, completedAt: `${date}T21:10:00.000Z` });
    meals.push({ id: `m${index}`, date, consumedAt: `${date}T20:00:00.000Z`, rawInput: null, entryKind: 'meal', sourceType: 'manual', consumedAtSource: 'user_declared', importRunId: null, calories: 500, proteinG: 30, carbsG: 20 + index * 10, fatG: 10 });
  });
  return { sessions, exercises, sets, meals, feelings: [], metricDefinitions: [], metricValues: [] };
}
const snapshot = () => createInsightsSnapshot(source(), { today: '2026-11-17', method: 2, revision: 'r1' });
function answer(options: ReadOptions): Promise<MobileApiReadResult<unknown>> {
  const query = new URLSearchParams(options.path.split('?')[1]);
  const body = query.get('view') === 'routine-relation' ? insightsRoutineRelation(snapshot(), query.get('routine')!) : insightsSummary(snapshot());
  const data = options.parse ? options.parse(JSON.parse(JSON.stringify(body))) : body;
  return Promise.resolve(data ? { status: 'ok', data, meta } as MobileApiReadResult<unknown> : { status: 'error', kind: 'contract', meta } as unknown as MobileApiReadResult<unknown>);
}
const screen = (node: React.ReactElement) => render(<SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}><OwnlevelThemeProvider>{node}</OwnlevelThemeProvider></SafeAreaProvider>);

beforeEach(() => { mockReps = [10, 11, 12, 12, 11, 12, 11, 13]; mockRead.mockReset(); mockRead.mockImplementation(answer); mockPush.mockReset(); mockSetParams.mockReset(); mockParams = {}; clearConfirmedReads(mockClient); });

describe('#533 · cifras de Comparaciones', () => {
  const measured = (pct: number): PerformanceChange => ({ state: 'measured', pct, basis: 'reps_at_load', signals: 1, load: { unit: 'kg', up: 0, same: 1, down: 0 } });
  it('formats the change once, with its sign, and never invents one', () => {
    expect(formatPct(8.3333)).toBe('+8,3 %');
    expect(formatPct(-12.5)).toBe('−13 %');
    expect(formatPct(0)).toBe('0 %');
    expect(exerciseChangeValue(measured(8.3333))).toMatchObject({ value: '↑ 8,3 %' });
    expect(exerciseChangeValue({ state: 'no_amount_signal', pct: null, basis: null, signals: 0, load: { unit: 'kg', up: 1, same: 0, down: 0 } })?.value).toBe('↑ Peso');
    // Plates are a load but never «Peso», and an ambiguous or absent change keeps the reading the row had.
    expect(exerciseChangeValue({ state: 'no_amount_signal', pct: null, basis: null, signals: 0, load: { unit: 'lingote', up: 1, same: 0, down: 0 } })).toBeNull();
    expect(exerciseChangeValue({ state: 'ambiguous', pct: null, basis: null, signals: 0, load: null })).toBeNull();
    expect(exerciseChangeValue(undefined)).toBeNull();
  });
  it('joins the two lanes of a session by the exercises that entered, and says how many', () => {
    const strict = { state: 'measured' as const, pct: 10, eligible: 1, total: 3, directions: { up: 1, same: 0, down: 0 }, load: { up: 0, same: 0, down: 0 } };
    const partial = { state: 'measured' as const, pct: -2, eligible: 2, total: 3, directions: { up: 0, same: 1, down: 1 }, load: { up: 1, same: 0, down: 0 } };
    expect(joinedChange(strict, partial)).toMatchObject({ pct: 2, eligible: 3, total: 3, load: { up: 1 } });
    expect(sessionHero(joinedChange(strict, partial))).toMatchObject({ value: '+2 %', caption: 'reps al mismo peso frente a la vez anterior · 3 de 3 ejercicios' });
    expect(sessionHero({ ...strict, state: 'no_eligible', pct: null, eligible: 0 })).toBeNull();
  });
  it('«Cómo llegaste» says «Sin registrar» for what is missing and never a zero; energy stays a word', () => {
    const day = snapshot().days.find(row => row.date === '2026-10-05')! as DayFact;
    const facts = arrivalFacts(day.sessions[0]! as SessionFact, day, []);
    expect(facts.map(fact => fact.label)).toEqual(['Carbos 3 h antes', 'Última comida', 'Proteína ayer', 'Kcal ayer', 'Sueño', 'Energía']);
    expect(facts.find(fact => fact.key === 'carbs')!.value).toBe('30 g');
    expect(facts.find(fact => fact.key === 'protein-yesterday')!.value).toBeNull();
    expect(facts.find(fact => fact.key === 'sleep')!.spoken).toBe('Sueño: sin registrar');
  });
  it('the sentence needs three in each group, and an energy median is said in words', () => {
    const factor = (up: number | null, down: number | null): RelationFactor => ({ key: 'carbs_pre_3h', unit: 'g', metricId: null, valid: 6, missing: {}, groups: { up: { valid: 3, median: up }, same: { valid: 0, median: null }, down: { valid: down === null ? 2 : 3, median: down } } });
    expect(factorSentence(factor(66, 25), 'Carbos 3 h antes')).toBe('En tus registros, la mediana de «Carbos 3 h antes» fue 66 g en las sesiones que subieron y 25 g en las que bajaron.');
    expect(factorSentence(factor(66, null), 'Carbos 3 h antes')).toBeNull();
    expect(factorValue({ key: 'energy_pre', unit: '1-5' }, 3.5)).toMatch(/^entre \S+ y \S+$/);
    expect(factorValue({ key: 'energy_pre', unit: '1-5' }, 3.5)).not.toMatch(/\d/);
  });
});

describe('#533 · pulido', () => {
  it('shows a change as it was recorded, in its own unit', () => {
    const base = { pct: 8.3333, signals: 1 };
    expect(shownText({ ...base, state: 'measured', basis: 'reps_at_load', load: { unit: 'kg', up: 0, same: 0, down: 0 }, shown: { anchor: 20, from: 12, to: 13 } })).toBe('20 kg · 12 → 13 reps');
    expect(shownText({ ...base, state: 'measured', basis: 'reps_at_load', load: { unit: 'lingote', up: 0, same: 0, down: 0 }, shown: { anchor: 4, from: 10, to: 11 } })).toBe('4 lingotes · 10 → 11 reps');
    expect(shownText({ ...base, state: 'measured', basis: 'time', load: null, shown: { anchor: null, from: 60, to: 45 } })).toBe('60 → 45 s');
    expect(shownText({ state: 'no_amount_signal', pct: null, basis: null, signals: 0, load: { unit: 'kg', up: 1, same: 0, down: 0 }, shown: { anchor: 10, from: 50, to: 55 } })).toBe('50 → 55 kg · 10 reps');
    expect(shownText({ state: 'ambiguous', pct: null, basis: null, signals: 0, load: null })).toBeNull();
  });
  it('lists each exercise once, filters by routine and orders without another read', () => {
    const summary = insightsSummary(snapshot());
    expect(exerciseList(summary, 'all', 'recent').map(entry => [entry.row.name, entry.lane])).toEqual([['Remo', 'partial']]);
    expect(exerciseList(summary, ROUTINE, 'name')).toHaveLength(1);
    expect(exerciseList(summary, id(999), 'recent')).toEqual([]);
  });
});

describe('#533 · pantallas', () => {
  it('Días leads with the measured change and lists each exercise with its percentage', async () => {
    const view = screen(<InsightsScreen />);
    const hero = await view.findByTestId('comparisons-change-hero');
    expect(within(hero).getByText('+18 %')).toBeTruthy();
    expect(view.getByTestId('comparisons-timeline')).toBeTruthy();
    expect(view.getByRole('button', { name: /^Remo, .*subió [\d,]+ por ciento\. Ver evidencia y series$/ })).toBeTruthy();
    // The strip of recent sessions opens one of them.
    fireEvent.press(within(view.getByTestId('comparisons-session-strip')).getByTestId(`comparisons-strip-${id(7)}`));
    expect(mockSetParams).toHaveBeenCalledWith(expect.objectContaining({ session: id(7) }));
  });
  it('Sesiones shows each exercise as recorded and links to how you arrived at its routine', async () => {
    const view = screen(<InsightsScreen />);
    await view.findByTestId('comparisons-change-hero');
    expect(view.getByText('20 kg · 11 → 13 reps')).toBeTruthy();
    expect(view.getByTestId('insights-counts-partial')).toBeTruthy();
    fireEvent.press(view.getByRole('button', { name: 'Ver cómo llegaste a PULL' }));
    expect(mockSetParams).toHaveBeenCalledWith(expect.objectContaining({ view: 'relation', routine: ROUTINE, session: undefined }));
  });
  it('Relación asks for the newest routine once, shows its groups and opens a factor', async () => {
    mockParams = { view: 'relation' };
    const view = screen(<InsightsScreen />);
    expect(await view.findByTestId('relation-view')).toBeTruthy();
    const reads = mockRead.mock.calls.map(([options]) => options.path).filter(path => path.includes('routine-relation'));
    expect(reads).toEqual([expect.stringContaining(`routine=${ROUTINE}`)]);
    expect(view.getByLabelText(/^8 sesiones de PULL: 4 subieron, 1 iguales, 2 bajaron, 1 sin comparar\.$/)).toBeTruthy();
    expect(view.getByTestId('relation-short')).toBeTruthy();
    expect(view.getByTestId('relation-summary-line').props.children).toBe('8 sesiones · 1 oct al 29 oct · reps al mismo peso');
    // The newest session is chosen first; a tapped bar becomes the chosen one and opens its session.
    expect(view.getByTestId('relation-pick').props.accessibilityLabel).toMatch(/^Jueves, 29 de octubre: /);
    fireEvent.press(view.getByTestId('comparisons-bar-0'));
    expect(view.getByTestId('relation-pick').props.accessibilityLabel).toMatch(/^Jueves, 1 de octubre: /);
    fireEvent.press(view.getByTestId('relation-pick'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/(tabs)/train/insights', params: expect.objectContaining({ session: id(1), date: '2026-10-01' }) });
    // Without three in each group no factor is a comparison yet: they wait together, and each opens its detail with the chosen session.
    expect(view.queryByTestId('relation-factors')).toBeNull();
    fireEvent.press(view.getByRole('button', { name: /^\d+ datos todavía sin datos para comparar: Carbos 3 h antes/ }));
    fireEvent.press(within(view.getByTestId('relation-missing-sheet')).getByRole('button', { name: /^Carbos 3 h antes: 8 de 8 sesiones con dato/ }));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/(tabs)/train/insights/factor', params: expect.objectContaining({ routine: ROUTINE, factor: 'carbs_pre_3h', pick: id(1) }) });
    fireEvent.press(view.getByTestId('relation-method-link'));
    expect(view.getByTestId('relation-method-sheet')).toBeTruthy();
    fireEvent.press(view.getByRole('button', { name: 'Ver todas las relaciones' }));
    expect(mockSetParams).toHaveBeenCalledWith({ view: 'days', relations: '1' });
  });
  it('a factor lists every session with its value, and stays quiet without three in each group', async () => {
    mockParams = { routine: ROUTINE, factor: 'carbs_pre_3h' };
    const view = screen(<FactorScreen />);
    expect(await view.findByText('Carbos 3 h antes')).toBeTruthy();
    expect(view.getByTestId('factor-not-ready')).toBeTruthy();
    expect(view.getByLabelText('8 de 8 sesiones con este dato')).toBeTruthy();
    expect(view.getByText('Para comparar hacen falta 3 que suban y 3 que bajen. Con dato hay 4 que subieron y 2 que bajaron.')).toBeTruthy();
    expect(view.queryByTestId('factor-why')).toBeNull();
    expect(view.getAllByRole('button', { name: /Ver la sesión$/ })).toHaveLength(8);
  });
  it('with three in each group a factor is a row with both medians, and its detail shows them with every session', async () => {
    mockReps = [10, 11, 10, 11, 10, 11, 10, 11];
    mockParams = { view: 'relation' };
    const view = screen(<InsightsScreen />);
    const row = await view.findByTestId('relation-factor-carbs_pre_3h');
    expect(row.props.accessibilityLabel).toMatch(/^Carbos 3 h antes, esa vez \d+ g\. Mediana en las que subieron \d+ g y en las que bajaron \d+ g\. 8 de 8 sesiones con dato/);
    fireEvent.press(row);
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/(tabs)/train/insights/factor', params: expect.objectContaining({ factor: 'carbs_pre_3h', pick: id(8) }) });
    view.unmount();
    mockParams = { routine: ROUTINE, factor: 'carbs_pre_3h', pick: id(8) };
    const detail = screen(<FactorScreen />);
    expect(await detail.findByTestId('factor-medians')).toBeTruthy();
    expect(detail.getByText('Mediana de cada grupo · 8 de 8 sesiones con dato')).toBeTruthy();
    expect(detail.getByTestId(`factor-session-${id(8)}`).props.accessibilityState).toEqual({ selected: true });
    expect(detail.queryByTestId('factor-not-ready')).toBeNull();
  });
});
