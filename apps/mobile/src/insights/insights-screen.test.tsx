import { act, fireEvent, render } from '@testing-library/react-native';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { OwnlevelThemeProvider } from '@/design-system';
import type { MobileApiClient } from '@/api/client';
import { clearConfirmedReads } from '@/api/confirmed-read-cache';
import type { MobileApiReadResult } from '@/api/results';
import { parsePerformanceInsights, type InsightsReadModel } from '@/api/performance-insights';
import { buildInsightsReadModel } from '../../../../src/lib/progress/insights-engine/read-model';
import type { InsightsSource } from '../../../../src/lib/progress/insights-engine/types';
import { InsightsScreen } from './insights-screen';
import { RelationDetailScreen } from './relation-detail-screen';
import { exerciseSentence, heroOf, joinDays, relationGroups, relationSentence, stripMarks } from './insights-model';

jest.mock('@react-native-async-storage/async-storage', () => jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
const mockPush = jest.fn(), mockSetParams = jest.fn();
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
const read = (source: InsightsSource, association?: string): InsightsReadModel => parsePerformanceInsights(JSON.parse(JSON.stringify(buildInsightsReadModel(source, { today: '2027-01-01', permutations: 19, association }))))!;
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
    const exploratory = { ...item, state: 'exploratory' as const, rho: -0.4, pairs: 34, outcomeDays: 120 };
    const sentence = relationSentence('partial', exploratory, model.metrics);
    expect(sentence).toBe('Los días con más sueño, menos ejercicios quedaron con registro inferior. Lo vimos en 34 de 120 días. Todavía no alcanza para decir que se repite.');
    expect(sentence).not.toMatch(/porque|causa|deber|consistente|patr[oó]n/i);
    const groups = relationGroups(model.partial.associations.items, 'all');
    expect(groups.readable.length + groups.waiting.length).toBe(model.partial.associations.candidatesEvaluated);
  });
});

describe('pantalla', () => {
  it('shows the partial lane with its limit when the configuration is unknown, one hero and no strict words', async () => {
    mockRead.mockResolvedValue(ok(read(history([8, 10, 9]))));
    const view = await open(<InsightsScreen />);
    expect(view.getByTestId('insights-hero')).toBeTruthy();
    expect(view.getAllByText('1 de 1').length).toBeGreaterThan(0);
    expect(view.getByText('ejercicios comparables con contexto parcial')).toBeTruthy();
    expect(view.getByText(/^↓ Registro inferior$/)).toBeTruthy();
    expect(view.getByTestId('insights-partial-limit')).toBeTruthy();
    expect(view.queryByText(/Mejoraron/)).toBeNull(); expect(view.queryByText(/^↓ Por debajo$/)).toBeNull();
  });
  it('shows the strict lane without the limit once the configuration is known', async () => {
    mockRead.mockResolvedValue(ok(read(history([8, 10, 9], 'none'))));
    const view = await open(<InsightsScreen />);
    expect(view.getByText(/^↓ Por debajo$/)).toBeTruthy();
    expect(view.queryByTestId('insights-partial-limit')).toBeNull();
  });
  it('tells empty, nothing comparable, failed and contradictory apart', async () => {
    mockRead.mockResolvedValueOnce(ok(read(history([]))));
    let view = await open(<InsightsScreen />);
    expect(view.getByTestId('insights-empty')).toBeTruthy(); expect(view.getByText('EJEMPLO')).toBeTruthy();
    view.unmount(); clearConfirmedReads(mockClient);
    mockRead.mockResolvedValueOnce(ok(read(history([8]))));
    view = await open(<InsightsScreen />);
    expect(view.getByTestId('insights-nothing')).toBeTruthy(); expect(view.getByText('Todavía no hay una sesión anterior para comparar.')).toBeTruthy();
    view.unmount(); clearConfirmedReads(mockClient);
    mockRead.mockResolvedValueOnce(lost);
    view = await open(<InsightsScreen />);
    expect(view.getByText('Uy, no pudimos leer tus datos')).toBeTruthy(); expect(view.queryByTestId('insights-empty')).toBeNull();
    view.unmount(); clearConfirmedReads(mockClient);
    const source = history([8, 9]);
    mockRead.mockResolvedValueOnce(ok(read({ ...source, sessions: [...source.sessions, { ...source.sessions[0]!, endedAt: `${dateAt(0)}T20:00:00.000Z` }] })));
    view = await open(<InsightsScreen />);
    expect(view.getByText('Uy, no pudimos leer tus datos')).toBeTruthy(); expect(view.queryByTestId('insights-empty')).toBeNull();
  });
  it('keeps the loaded days when another page fails', async () => {
    const model = read(history(Array.from({ length: 20 }, (_, day) => 8 + day % 3)));
    expect(model.facts.page.nextBefore).not.toBeNull();
    mockRead.mockResolvedValueOnce(ok(model)).mockResolvedValueOnce(lost);
    const view = await open(<InsightsScreen />);
    const before = view.getAllByRole('button').length;
    fireEvent.press(view.getByText("Ver más días")); await flush();
    expect(view.getByText('No pudimos traer más días.')).toBeTruthy();
    expect(view.getAllByRole('button').length).toBeGreaterThanOrEqual(before);
    expect(mockRead).toHaveBeenCalledTimes(2);
    expect(String(mockRead.mock.calls[1]![0].path)).toContain(`before=${model.facts.page.nextBefore}`);
  });
  it('makes one read when it opens and pages only on a tap', async () => {
    mockRead.mockResolvedValue(ok(read(history(Array.from({ length: 20 }, (_, day) => 8 + day % 3)))));
    await open(<InsightsScreen />);
    expect(mockRead).toHaveBeenCalledTimes(1);
  });
  it('opens the exact session and the exercise from the evidence, and keeps the view in the route', async () => {
    mockRead.mockResolvedValue(ok(read(history([8, 10, 9]))));
    const view = await open(<InsightsScreen />);
    fireEvent.press(view.getAllByRole('button', { name: /comparables con contexto parcial/ })[0]!);
    fireEvent.press(view.getByRole('button', { name: 'Abrir sesión Empuje' }));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/(tabs)/train/history/[id]', params: { id: 's2' } });
    fireEvent.press(view.getByRole('button', { name: /^Press banca, registro inferior con contexto parcial/ }));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/(tabs)/train/history/exercise/[id]', params: { id: EX, routineId: 'r1' } });
    fireEvent.press(view.getByText('Ejercicios'));
    expect(mockSetParams).toHaveBeenCalledWith({ view: 'exercises' });
  });
  it('lists exercises by lane and labels the partial one', async () => {
    mockParams = { view: 'exercises' };
    mockRead.mockResolvedValue(ok(read(history([8, 10, 9]))));
    const view = await open(<InsightsScreen />);
    expect(view.getByText('Con contexto parcial')).toBeTruthy(); expect(view.queryByText('Comparación completa')).toBeNull();
    fireEvent.press(view.getByRole('button', { name: /Press banca: 1 registro superior, 0 registro igual, 1 registro inferior, de 3 veces/ }));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/(tabs)/train/history/exercise/[id]', params: { id: EX } });
  });
  it('shows relations only below the facts, with no strict list while it has no days', async () => {
    mockRead.mockResolvedValue(ok(read(withMetric(history(oscillating)))));
    const view = await open(<InsightsScreen />);
    expect(view.getByText('Para mirar con calma')).toBeTruthy();
    expect(view.getByText('Con contexto parcial')).toBeTruthy();
    expect(view.queryByText('Comparación completa')).toBeNull();
    fireEvent.press(view.getByText('Métricas'));
    expect(mockSetParams).toHaveBeenCalledWith({ family: 'metric' });
    fireEvent.press(view.getByRole('button', { name: /Sueño, ese día/ }));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/(tabs)/train/insights/[relation]', params: { relation: `partial:metric:${METRIC}:same_day` } });
  });
});

describe('detalle de una relación', () => {
  const id = `partial:metric:${METRIC}:same_day`;
  it('asks for its pairs, keeps the limit and opens each day from the list', async () => {
    mockParams = { relation: id };
    mockRead.mockResolvedValue(ok(read(withMetric(history(oscillating)), id)));
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
  it('says so when the relation does not exist, instead of drawing an empty chart', async () => {
    mockParams = { relation: 'partial:metric:none:same_day' };
    mockRead.mockResolvedValue(ok(read(history(oscillating))));
    const view = await open(<RelationDetailScreen />);
    expect(view.getByText('No encontramos esta relación')).toBeTruthy();
  });
});
