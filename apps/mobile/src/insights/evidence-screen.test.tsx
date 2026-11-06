import { act, fireEvent, render, within } from '@testing-library/react-native';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { OwnlevelThemeProvider } from '@/design-system';
import type { MobileApiClient } from '@/api/client';
import { clearConfirmedReads } from '@/api/confirmed-read-cache';
import type { MobileApiReadResult } from '@/api/results';
import { insightsExerciseEvidence } from '../../../../src/lib/progress/insights-engine/evidence';
import type { InsightsSource } from '../../../../src/lib/progress/insights-engine/types';
import { EvidenceScreen } from './evidence-screen';
import { evidenceSelectionOf } from './evidence-model';
import { insightsEvidenceHref, insightsReturnHref } from './navigation';

jest.mock('@react-native-async-storage/async-storage', () => jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
const mockPush = jest.fn(), mockBack = jest.fn(), mockReplace = jest.fn();
let mockCanGoBack = true;
let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, back: mockBack, replace: mockReplace, canGoBack: () => mockCanGoBack, setParams: jest.fn() }), useFocusEffect: () => undefined, useLocalSearchParams: () => mockParams }));
jest.mock('@/platform/haptics', () => ({ haptics: { selection: jest.fn() }, triggerHaptic: jest.fn() }));
type ReadOptions = Parameters<MobileApiClient['read']>[0];
const mockRead = jest.fn<(options: ReadOptions) => Promise<MobileApiReadResult<unknown>>>();
const mockClient = { read: mockRead, request: jest.fn() } as unknown as MobileApiClient;
jest.mock('@/api', () => ({ useMobileApi: () => ({ client: mockClient }) }));

const id = (group: number, n: number) => `93670000-0000-4000-8${String(group).padStart(3, '0')}-${String(n).padStart(12, '0')}`;
const EX = id(1, 1), REVISION = '0123456789abcdef0123456789abcdef';
const meta = { durationMs: 1, httpStatus: 200, outcome: 'ok' as const };
const lost = { status: 'unavailable' as const, reason: 'network' as const, meta: { durationMs: 1, httpStatus: null, outcome: 'unavailable' as const } };

type Set_ = [reps: number | null, load: number | null];
function history(days: Set_[][], mode = 'Peso total', configuration: string | null = 'recorded:agarre medio'): InsightsSource {
  const sessions: InsightsSource['sessions'][number][] = [], exercises: InsightsSource['exercises'][number][] = [], sets: InsightsSource['sets'][number][] = [];
  days.forEach((rows, day) => {
    const date = `2029-03-0${day + 2}`, session = id(2, day), row = id(3, day);
    sessions.push({ id: session, date, routineId: null, routineName: null, name: null, status: 'completed', startedAt: `${date}T18:00:00.000Z`, endedAt: `${date}T19:00:00.000Z`, performanceLevel: null, painLevel: null, legacyEnergyLevel: null });
    exercises.push({ id: row, sessionId: session, exerciseId: EX, name: 'Press banca', implement: 'barra', weightMode: mode, isCompleted: true, configuration });
    rows.forEach(([reps, load], n) => sets.push({ id: id(4, day * 10 + n), sessionExerciseId: row, actualReps: reps, actualLoad: load, isCompleted: true, completedAt: `${date}T18:1${n}:00.000Z` }));
  });
  return { sessions, exercises, sets, feelings: [], metricDefinitions: [], metricValues: [], meals: [] };
}
/** Answers as the route does: the shared comparator on that exercise's history, through the real contract. */
const serve = (source: InsightsSource, revision = REVISION) => async (options: ReadOptions) => {
  const query = new URL(`http://x${options.path}`).searchParams;
  const body = insightsExerciseEvidence(source, { sessionId: query.get('session')!, exerciseId: query.get('exercise')!, lane: query.get('lane') as 'strict' | 'partial' }, { today: '2030-01-01', revision, method: 2 });
  const parsed = options.parse(JSON.parse(JSON.stringify(body)));
  if (parsed === undefined) throw Error(`Contract rejected ${options.path}`);
  return { status: 'ok' as const, data: parsed, meta };
};
const selection = (over: Partial<Record<string, string>> = {}) => ({ session: id(2, 1), exercise: EX, lane: 'strict', reference: id(2, 0), result: 'improved', revision: REVISION, insightsReturn: '1', insightsDate: '2029-03-03', ...over });
const screen = (ui: React.ReactElement) => render(<SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}><OwnlevelThemeProvider initialMode="light">{ui}</OwnlevelThemeProvider></SafeAreaProvider>);
const open = async () => { const view = screen(<EvidenceScreen />); await act(async () => { for (let i = 0; i < 3; i++) await new Promise(resolve => setTimeout(resolve, 0)); }); return view; };

beforeEach(() => { mockParams = {}; mockCanGoBack = true; mockPush.mockClear(); mockBack.mockClear(); mockReplace.mockClear(); mockRead.mockReset(); clearConfirmedReads(mockClient); });

describe('#367 evidencia de una comparación', () => {
  it('reads once when it opens, for that comparison only, and shows the reference, signals and sets in their unit', async () => {
    mockParams = selection();
    mockRead.mockImplementation(serve(history([[[8, 80], [6, 90]], [[10, 80], [7, 90]]])));
    const view = await open();
    expect(mockRead).toHaveBeenCalledTimes(1);
    const query = new URL(`http://x${mockRead.mock.calls[0]![0].path}`).searchParams;
    expect(Object.fromEntries(query)).toEqual({ method: '2', view: 'evidence', session: id(2, 1), exercise: EX, lane: 'strict' });
    expect(view.getByTestId('evidence-result')).toHaveTextContent(/↑ Mejoró/);
    expect(view.getByTestId('evidence-against')).toHaveTextContent(/Frente al (jueves|viernes|miércoles)/);
    const signals = within(view.getByTestId('evidence-signals'));
    expect(signals.getByText(/Con 80 kg$/)).toBeTruthy();
    expect(signals.getByText('8 → 10 reps')).toBeTruthy();
    const current = within(view.getByTestId('evidence-current'));
    expect(current.getByText('80 kg × 10')).toBeTruthy(); expect(current.getByText('90 kg × 7')).toBeTruthy();
    expect(current.getAllByText('En la comparación')).toHaveLength(2);
    expect(within(view.getByTestId('evidence-reference')).getByText('80 kg × 8')).toBeTruthy();
    // A new high is said apart from the result: the same 90 kg is no new highest load.
    const records = within(view.getByTestId('evidence-records'));
    expect(records.getByText('Más reps con 80 kg')).toBeTruthy(); expect(records.queryByText(/Carga más alta/)).toBeNull();
    expect(view.queryByTestId('evidence-partial-limit')).toBeNull();
  });

  it('says why more load with fewer reps does not prove an improvement, also next to a signal that went up', async () => {
    for (const [days, lead] of [[[[[8, 80]], [[6, 85]]], /^No hay una carga/], [[[[8, 80], [6, 90]], [[10, 80], [5, 95]]], /^Algunas series no tienen/]] as const) {
      clearConfirmedReads(mockClient);
      mockParams = selection({ result: 'ambiguous_evidence' });
      mockRead.mockImplementation(serve(history(days as unknown as Set_[][])));
      const view = await open();
      expect(view.getByTestId('evidence-result')).toHaveTextContent(/Mezclado/);
      expect(view.getByTestId('evidence-note')).toHaveTextContent(lead);
      expect(view.getByTestId('evidence-note')).toHaveTextContent(/Más carga con menos repeticiones, o al revés, no alcanza para decir que mejoró/);
      expect(view.queryByText(/Mejoró/)).toBeNull();
      // The higher load is still listed, as a record apart from the result.
      if (lead.source.startsWith('^Algunas')) expect(within(view.getByTestId('evidence-records')).getByText('90 → 95 kg')).toBeTruthy();
      view.unmount();
    }
  });

  it('shows both sides of crossed signals with arrows, not colors, and calls it mixed', async () => {
    mockParams = selection({ result: 'ambiguous_evidence' });
    mockRead.mockImplementation(serve(history([[[8, 80], [10, 70]], [[10, 80], [8, 70]]])));
    const view = await open();
    const signals = within(view.getByTestId('evidence-signals'));
    expect(signals.getByText('↑  Con 80 kg')).toBeTruthy(); expect(signals.getByText('↓  Con 70 kg')).toBeTruthy();
    expect(view.getByTestId('evidence-note')).toHaveTextContent(/Subió por un lado y bajó por otro/);
  });

  it('keeps seconds, bodyweight reps and lingotes in their own words', async () => {
    for (const [mode, rows, text] of [['Tiempo (segundos)', [[[30, null]], [[40, null]]], '30 → 40 s'], ['Peso corporal', [[[10, null]], [[12, null]]], '10 → 12 reps'], ['Lingotes (no kg)', [[[8, 3]], [[9, 3]]], '8 → 9 reps']] as const) {
      clearConfirmedReads(mockClient);
      mockParams = selection();
      mockRead.mockImplementation(serve(history(rows as unknown as Set_[][], mode)));
      const view = await open();
      expect(within(view.getByTestId('evidence-signals')).getByText(text)).toBeTruthy();
      if (mode === 'Lingotes (no kg)') expect(within(view.getByTestId('evidence-signals')).getByText(/Con 3 lingotes$/)).toBeTruthy();
      view.unmount();
    }
  });

  it('labels the partial lane and its limit, and its highest value as not a record', async () => {
    mockParams = selection({ lane: 'partial', result: 'higher_record' });
    mockRead.mockImplementation(serve(history([[[8, 80]], [[9, 80]]], 'Peso total', null)));
    const view = await open();
    expect(view.getByTestId('evidence-result')).toHaveTextContent(/Registro superior/);
    expect(view.getByTestId('evidence-partial-limit')).toBeTruthy();
    expect(view.getByText('Lo más alto con contexto parcial')).toBeTruthy();
    expect(view.getByText('Configuración')).toBeTruthy(); expect(view.getByText('Sin registrar')).toBeTruthy();
  });

  it('never shows another reference or result in place of the one tapped, and notices a newer read of the same one', async () => {
    mockParams = selection({ reference: id(2, 9) });
    mockRead.mockImplementation(serve(history([[[8, 80]], [[10, 80]]])));
    const changed = await open();
    expect(changed.getByTestId('evidence-changed')).toBeTruthy();
    expect(changed.queryByTestId('evidence-signals')).toBeNull();
    fireEvent.press(changed.getByRole('button', { name: 'Volver a Insights' }));
    expect(mockBack).toHaveBeenCalled();
    changed.unmount();
    clearConfirmedReads(mockClient);
    mockParams = selection();
    mockRead.mockImplementation(serve(history([[[8, 80]], [[10, 80]]]), 'fedcba9876543210fedcba9876543210'));
    const newer = await open();
    expect(newer.getByTestId('evidence-newer')).toBeTruthy();
    expect(newer.getByTestId('evidence-signals')).toBeTruthy();
  });

  it('checks the route before reading, and goes back to the Insights it came from', async () => {
    for (const bad of [{ session: 'x' }, { lane: 'both' }, { result: 'higher_record' }, { reference: '../x' }, { revision: '' }]) {
      mockParams = selection(bad);
      const view = await open();
      expect(view.getByText('No encontramos esta comparación')).toBeTruthy();
      view.unmount();
    }
    expect(mockRead).not.toHaveBeenCalled();
    mockCanGoBack = false;
    mockParams = selection({ session: 'x' });
    const view = await open();
    fireEvent.press(view.getByRole('button', { name: 'Volver a Insights' }));
    expect(mockReplace).toHaveBeenCalledWith({ pathname: '/(tabs)/train/insights', params: { date: '2029-03-03' } });
  });

  it('is a failed read, not an empty comparison, when the answer does not arrive', async () => {
    mockParams = selection();
    mockRead.mockResolvedValue(lost);
    const view = await open();
    expect(view.getByText('Uy, no pudimos leer tus datos')).toBeTruthy();
    expect(view.queryByTestId('evidence-signals')).toBeNull();
  });

  it('names each set by its block and recorded number, never by its place in the id order (#411)', async () => {
    // One session with two blocks of the exercise; the ids run against the set numbers and one set was left unfinished.
    const source = history([[[8, 80]], []]);
    const session = id(2, 1), [first, second] = [id(3, 91), id(3, 90)];
    const block = (row: string, order: number) => ({ id: row, sessionId: session, exerciseId: EX, name: 'Press banca', implement: 'barra', weightMode: 'Peso total', isCompleted: true, configuration: 'recorded:agarre medio', order });
    const set = (n: number, row: string, setNumber: number, reps: number, isCompleted = true) => ({ id: id(5, n), sessionExerciseId: row, actualReps: reps, actualLoad: 80, isCompleted, completedAt: null, setNumber });
    const twoBlocks: InsightsSource = { ...source, exercises: [...source.exercises.filter(row => row.sessionId !== session), block(first, 2), block(second, 6)],
      sets: [...source.sets, set(1, first, 3, 9, false), set(2, first, 2, 10), set(3, first, 1, 10), set(4, second, 2, 9), set(5, second, 1, 9)] };
    mockParams = selection();
    mockRead.mockImplementation(serve(twoBlocks));
    const view = await open();
    const labels = within(view.getByTestId('evidence-current')).getAllByText(/^Bloque/).map(node => [node.props.children].flat().join(''));
    expect(labels).toEqual(['Bloque 1 · Serie 1', 'Bloque 1 · Serie 2', 'Bloque 1 · Serie 3', 'Bloque 2 · Serie 1', 'Bloque 2 · Serie 2']);
    expect(view.getByLabelText('Bloque 1 · Serie 3: 80 kg × 9. Sin completar, no se cuenta')).toBeTruthy();
    expect(view.getByLabelText('Bloque 1 · Serie 1: 80 kg × 10. En la comparación')).toBeTruthy();
    // One block, with numbers unknown: neutral labels, no invented sequence.
    view.unmount(); clearConfirmedReads(mockClient);
    mockRead.mockImplementation(serve(history([[[8, 80]], [[10, 80], [9, 80]]])));
    const plain = await open();
    expect(within(plain.getByTestId('evidence-current')).getAllByText('Serie sin número')).toHaveLength(2);
    expect(within(plain.getByTestId('evidence-current')).queryByText(/^Bloque/)).toBeNull();
  });

  it('travels from Insights with everything it needs and nothing it does not trust', () => {
    const href = insightsEvidenceHref({ session: id(2, 1), exercise: EX, lane: 'strict', reference: null, result: 'insufficient_comparison', revision: REVISION }, { session: id(2, 1), date: '2029-03-03' });
    expect(href.pathname).toBe('/(tabs)/train/insights/evidence');
    expect(evidenceSelectionOf(href.params)).toEqual({ session: id(2, 1), exercise: EX, lane: 'strict', reference: null, result: 'insufficient_comparison', revision: REVISION });
    expect(insightsReturnHref(href.params)).toEqual({ pathname: '/(tabs)/train/insights', params: { session: id(2, 1), date: '2029-03-03' } });
  });
});
