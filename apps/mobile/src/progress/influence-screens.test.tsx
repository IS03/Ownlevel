import { act, fireEvent, render } from '@testing-library/react-native';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { OwnlevelThemeProvider } from '@/design-system';
import { parseProgressInfluence, type InfluenceDefinition, type InfluenceReading, type ProgressInfluence, type ProgressInfluenceSuggested } from '@/api/progress-influence';
import type { MobileApiClient } from '@/api/client';
import { InfluenceScreen } from './influence-screen';
import { InfluenceAnswerScreen } from './influence-answer-screen';
import { InfluenceBuildScreen } from './influence-build-screen';
import { ProgressRangeProvider } from './progress-range-context';
import type { ProgressRangeState } from './progress-range';
import { QUESTIONS } from './influence-model';

const mockPush = jest.fn();
let mockParams: Record<string, string> = {};
const mockRead = jest.fn<(...args: unknown[]) => Promise<unknown>>(), mockSuggested = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockCreate = jest.fn<(...args: unknown[]) => Promise<unknown>>();
let mockIntent = 0;
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }), useFocusEffect: () => undefined, useLocalSearchParams: () => mockParams, Stack: { Screen: () => null } }));
jest.mock('@/platform/haptics', () => ({ triggerHaptic: jest.fn(), haptics: { selection: jest.fn() } }));
const mockClient = {};
jest.mock('@/api', () => ({ useMobileApi: () => ({ client: mockClient }) }));
jest.mock('@/api/progress-influence', () => ({ ...jest.requireActual<object>('@/api/progress-influence'),
  fetchProgressInfluence: (...args: unknown[]) => mockRead(...args), fetchProgressInfluenceSuggested: (...args: unknown[]) => mockSuggested(...args) }));
jest.mock('@/api/progress-views', () => ({ ...jest.requireActual<object>('@/api/progress-views'),
  createProgressView: (...args: unknown[]) => mockCreate(...args), viewIntentKey: () => `influence-key-${++mockIntent}` }));
jest.mock('@/api/progress', () => ({ ...jest.requireActual<object>('@/api/progress'),
  fetchProgressMetrics: async () => ({ status: 'ok', meta: { durationMs: 1, httpStatus: 200, outcome: 'ok' }, data: { definitions: [] } }) }));

const TODAY = '2026-10-15';
const period = { preset: 'custom' as const, start: '2026-10-01', end: TODAY, days: 15, previousStart: '2026-09-01', previousEnd: '2026-09-15', bucket: 'day' as const, includesToday: true };
const definition: InfluenceDefinition = { split: 'nutrition.carbs', cut: 'median', lag: 0, outcome: 'training.sets' };
const ds = (month: string, start: number) => Array.from({ length: 7 }, (_, i) => `2026-${month}-${String(start + i).padStart(2, '0')}`);
const reading = (): InfluenceReading => ({ definition, measure: { split: { key: definition.split, label: 'Carbohidratos', unit: 'g', valueType: 'decimal' }, outcome: { key: definition.outcome, label: 'Series', unit: 'series', valueType: 'integer' } },
  current: { status: 'ok', pairs: 14, cut: 300, high: { days: ds('10', 8), average: 26 }, low: { days: ds('10', 1), average: 21 }, difference: 5, differencePercent: 5 / 21 * 100, evidence: 'moderate' }, reference: null });
const insufficient = (): InfluenceReading => ({ ...reading(), current: { status: 'insufficient', pairs: 6, needed: 14, perGroupNeeded: 5, missing: 'outcome', cut: 300, low: { days: ds('10', 1).slice(0, 3) }, high: { days: ds('10', 8).slice(0, 3) } } });
const meta = { durationMs: 1, httpStatus: 200, outcome: 'ok' as const }, ok = (data: unknown) => ({ status: 'ok', data, meta });
const flush = () => act(async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); });
const wrap = (Screen: typeof InfluenceScreen, state?: ProgressRangeState) => render(<SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }}>
  <OwnlevelThemeProvider initialMode="light"><ProgressRangeProvider initialToday={TODAY} initialState={state}><Screen /></ProgressRangeProvider></OwnlevelThemeProvider></SafeAreaProvider>);
beforeEach(() => {
  jest.clearAllMocks(); mockIntent = 0; mockParams = { ...definition, lag: '0' };
  mockRead.mockResolvedValue(ok({ today: TODAY, period, ...reading() }));
  mockSuggested.mockResolvedValue(ok({ today: TODAY, period, questions: [{ key: 'carbs_sets', ...reading() }, { key: 'steps_sleep', ...insufficient() }] }));
});

describe('Qué influye', () => {
  it.each(['ok', 'insufficient'])('pins from T2 (%s) with the compact definition, a suggested name and one idempotency key per intent', async status => {
    mockRead.mockResolvedValue(ok({ today: TODAY, period, ...(status === 'ok' ? reading() : insufficient()) }));
    mockCreate.mockResolvedValueOnce({ status: 'unavailable', reason: 'network', meta: { ...meta, outcome: 'unavailable' } }).mockResolvedValueOnce(ok({}));
    const view = wrap(InfluenceAnswerScreen); await flush();
    fireEvent.press(view.getByTestId('influence-pin')); await flush();
    const name = view.getByTestId('pin-view-name').props.value as string;
    expect(name.length).toBeLessThanOrEqual(60); expect(name).toContain('¿Los días');
    fireEvent.press(view.getByTestId('pin-view-confirm')); await flush();
    const input = mockCreate.mock.calls[0][1];
    expect(input).toEqual({ name, definition: { kind: 'influence', measure: 'training.sets', split: 'nutrition.carbs', cut: 'median', lag: 0 }, idempotencyKey: 'influence-key-1' });
    expect(view.getByText('No pudimos fijarla. Probá de nuevo.')).toBeTruthy();
    fireEvent.press(view.getByTestId('pin-view-confirm')); await flush();
    expect(mockCreate.mock.calls[1][1]).toEqual(input);
    expect(view.getByTestId('influence-pinned')).toBeTruthy(); expect(view.queryByTestId('influence-pin')).toBeNull();
  });
  it('lists only questions received, showing ok and insufficient states, and navigates with the definition', async () => {
    const view = wrap(InfluenceScreen); await flush();
    expect(view.getByText(QUESTIONS.carbs_sets.title)).toBeTruthy();
    expect(view.getByText('300 g o más: 26 series · el resto: 21 series')).toBeTruthy();
    expect(view.getByText('Todavía no alcanza: 6 de 14 días')).toBeTruthy();
    expect(view.queryByText(QUESTIONS.sleep_sets.title)).toBeNull();
    fireEvent.press(view.getByTestId('influence-question-carbs_sets'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/(tabs)/progress/influence/answer', params: { ...definition, lag: '0', key: 'carbs_sets' } });
    fireEvent.press(view.getByTestId('influence-build')); expect(mockPush).toHaveBeenLastCalledWith('/(tabs)/progress/influence/build');
  });
  it('a read error is unavailable, not the empty state', async () => {
    mockSuggested.mockResolvedValue({ status: 'unavailable', reason: 'network', meta: { ...meta, outcome: 'unavailable' } });
    const view = wrap(InfluenceScreen); await flush();
    expect(view.getByText('No pudimos cargar las preguntas')).toBeTruthy(); expect(view.getByText('Reintentar')).toBeTruthy();
    expect(view.queryByText('Todavía no hay preguntas para tus datos. Podés armar la tuya.')).toBeNull();
  });
  it('ok shows the phrase, two scaled bars, training qualifier and evidence without a reference when comparison is off', async () => {
    const view = wrap(InfluenceAnswerScreen); await flush();
    expect(view.getByTestId('influence-answer-text').props.children).toContain('hiciste en promedio 26 series. Los demás días, 21 series.');
    expect(view.getByText('sobre días que entrenaste')).toBeTruthy();
    expect(view.getByTestId('influence-bar-0').props.style.width).toBe('100%');
    expect(view.getByTestId('influence-bar-1').props.style.width).toBe(`${21 / 26 * 100}%`);
    expect([view.getByTestId('influence-evidence').props.children].flat().join('')).toMatch(/^5 series más .*· evidencia moderada, 14 días con los dos datos$/);
    expect(view.queryByTestId('influence-comparison')).toBeNull();
    expect(view.getByText('Es una relación, no una causa: otras cosas pudieron cambiar esos días.')).toBeTruthy();
  });
  it('yes/no uses training language and the reference is present only with Comparar', async () => {
    const data = reading(); data.definition = { split: 'day.training', cut: 'yes', lag: 0, outcome: 'nutrition.kcal' };
    data.measure = { split: { key: 'day.training', label: 'Día de entrenamiento', unit: null, valueType: 'boolean' }, outcome: { key: 'nutrition.kcal', label: 'Calorías', unit: 'kcal', valueType: 'integer' } };
    if (data.current.status === 'ok') { data.current = { ...data.current, cut: null, high: { ...data.current.high, average: 2690 }, low: { ...data.current.low, average: 2410 }, difference: 280, differencePercent: 280 / 2410 * 100 }; }
    data.reference = { ...insufficient().current };
    mockParams = { ...data.definition, lag: '0', key: 'training_kcal' }; mockRead.mockResolvedValue(ok({ today: TODAY, period, ...data }));
    const view = wrap(InfluenceAnswerScreen, { unit: 'month', anchor: TODAY, custom: null, compare: { kind: 'previous' } }); await flush();
    expect(view.getByText('Los días que entrenaste comiste en promedio 2.690 kcal. Los días sin entrenar, 2.410 kcal.')).toBeTruthy();
    expect(view.getByText('Con entrenamiento')).toBeTruthy(); expect(view.getByText('Sin entrenamiento')).toBeTruthy();
    expect(view.getByText('Frente a 1–15 sep: no alcanza')).toBeTruthy();
    expect(view.queryByText('sobre días que entrenaste')).toBeNull();
  });
  it('insufficient hides all averages and answer bars, and widening the period changes the shared query', async () => {
    mockRead.mockResolvedValue(ok({ today: TODAY, period, ...insufficient() }));
    const view = wrap(InfluenceAnswerScreen); await flush();
    expect(view.getByText('Todavía no alcanza')).toBeTruthy(); expect(view.queryByTestId('influence-bars')).toBeNull(); expect(view.queryByTestId('influence-answer-text')).toBeNull();
    expect(view.getByText(/Hay 6 de los 14 días .* Lo que más falta registrar: series\./)).toBeTruthy();
    fireEvent.press(view.getByTestId('influence-longer')); await flush();
    expect(mockRead.mock.calls.at(-1)![1]).toEqual({ period: 'custom', from: '2026-08-01', to: TODAY });
  });
  it('builder starts disabled, filters measures, fixes yes/no, and navigates with correct params', async () => {
    mockParams = {}; const view = wrap(InfluenceBuildScreen); await flush();
    expect(view.getByTestId('influence-see-answer').props.accessibilityState.disabled).toBe(true);
    fireEvent.press(view.getByTestId('influence-split')); await flush();
    expect(view.queryByText('CUERPO')).toBeNull(); expect(view.queryByText('EJERCICIOS DEL PERÍODO')).toBeNull();
    fireEvent.press(view.getByTestId('explore-choice-day.training')); await flush();
    expect(view.getByText('Sí / no')).toBeTruthy(); expect(view.getByTestId('influence-cut').props.accessibilityRole).not.toBe('button');
    fireEvent.press(view.getByTestId('influence-outcome')); await flush();
    expect(view.queryByTestId('explore-choice-day.training')).toBeNull();
    fireEvent.press(view.getByTestId('explore-choice-nutrition.kcal')); await flush();
    fireEvent.press(view.getByTestId('influence-see-answer'));
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/(tabs)/progress/influence/answer', params: { split: 'day.training', cut: 'yes', lag: '0', outcome: 'nutrition.kcal' } });
  });
  it('builder custom cut uses the stepper and lag, preserving a preselected outcome from Explorar', async () => {
    mockParams = { outcome: 'training.sets' }; const view = wrap(InfluenceBuildScreen); await flush();
    fireEvent.press(view.getByTestId('influence-split')); await flush(); fireEvent.press(view.getByTestId('explore-choice-nutrition.carbs')); await flush();
    fireEvent.press(view.getByTestId('influence-cut')); await flush(); fireEvent.press(view.getByTestId('explore-choice-custom')); await flush();
    fireEvent.press(view.getByLabelText('Subir corte')); await flush(); expect(view.getAllByText('310 g o más').length).toBeGreaterThan(0);
    fireEvent.press(view.getAllByLabelText('Cerrar').at(-1)!); await flush(); fireEvent.press(view.getByText('Al otro día')); await flush();
    fireEvent.press(view.getByTestId('influence-see-answer'));
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/(tabs)/progress/influence/answer', params: { split: 'nutrition.carbs', cut: 'gte:310', lag: '1', outcome: 'training.sets' } });
  });
  it('API clients reject another period end, definition, or comparison instead of showing it', async () => {
    const actual = jest.requireActual<typeof import('@/api/progress-influence')>('@/api/progress-influence');
    const body: ProgressInfluence = { today: TODAY, period, ...reading() };
    expect(parseProgressInfluence(body)).toBeDefined();
    let raw: unknown = body;
    const client = { read: ({ parse }: { parse: (value: unknown) => unknown }) => parse(raw) } as unknown as MobileApiClient;
    const query = { period: 'custom' as const, from: period.start, to: period.end };
    expect(await actual.fetchProgressInfluence(client, query, definition)).toBeDefined();
    expect(await actual.fetchProgressInfluence(client, { ...query, to: '2026-10-14' }, definition)).toBeUndefined();
    expect(await actual.fetchProgressInfluence(client, query, { ...definition, cut: 'gte:300' })).toBeUndefined();
    expect(await actual.fetchProgressInfluence(client, query, definition, undefined, { start: '2026-09-01', end: '2026-09-15' })).toBeUndefined();
    const suggested: ProgressInfluenceSuggested = { today: TODAY, period, questions: [{ key: 'carbs_sets', ...reading() }] }; raw = suggested;
    expect(await actual.fetchProgressInfluenceSuggested(client, query)).toBeDefined();
    expect(await actual.fetchProgressInfluenceSuggested(client, { ...query, to: '2026-10-14' })).toBeUndefined();
    expect(await actual.fetchProgressInfluenceSuggested(client, query, undefined, { start: '2026-09-01', end: '2026-09-15' })).toBeUndefined();
  });
});
