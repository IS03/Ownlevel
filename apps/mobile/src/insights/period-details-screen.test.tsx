import { act, fireEvent, render, within } from '@testing-library/react-native';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { OwnlevelThemeProvider } from '@/design-system';
import type { MobileApiClient } from '@/api/client';
import type { MobileApiReadResult } from '@/api/results';
import { clearConfirmedReads } from '@/api/confirmed-read-cache';
import { periodFeelingDetail, periodNutritionDetail } from '../../../../src/lib/progress/insights-engine/period-details';
import { periodDetailsFixture } from '../../../../src/lib/progress/insights-engine/period-details-fixture';
import { PeriodFeelingsScreen } from './period-feelings-screen';
import { PeriodNutritionScreen } from './period-nutrition-screen';
import { ReturnToInsights } from './return-to-insights';
import { insightsReturnHref, periodDetailHref, periodSummaryHref } from './navigation';

jest.mock('@react-native-async-storage/async-storage', () => jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
const mockPush = jest.fn(), mockNavigate = jest.fn();
let mockParams: Record<string, string> = {};
const mockFocus = new Set<() => void | (() => void)>();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, navigate: mockNavigate }), useLocalSearchParams: () => mockParams,
  useFocusEffect: (callback: () => void | (() => void)) => jest.requireActual<typeof import('react')>('react').useEffect(() => {
    mockFocus.add(callback); const cleanup = callback(); return () => { mockFocus.delete(callback); cleanup?.(); };
  }, [callback]) }));
jest.mock('@/platform/haptics', () => ({ haptics: { selection: jest.fn() }, triggerHaptic: jest.fn() }));
type Options = Parameters<MobileApiClient['read']>[0];
const mockRead = jest.fn<(o: Options) => Promise<MobileApiReadResult<unknown>>>();
let mockClient = { read: mockRead, request: jest.fn() } as unknown as MobileApiClient;
jest.mock('@/api', () => ({ useMobileApi: () => ({ client: mockClient }) }));
const meta = { durationMs: 1, httpStatus: 200, outcome: 'ok' as const };
const lost = { status: 'unavailable' as const, reason: 'network' as const, meta: { durationMs: 1, httpStatus: null, outcome: 'unavailable' as const } };
function details(revision = 'r1', empty = false) {
  const source = periodDetailsFixture(), byId = new Map(source.exercises.map(e => [e.id, e.sessionId]));
  return periodFeelingDetail({ ...source, ...(empty ? { sessions: [], feelings: [] } : {}), firstSetBySession: new Map(source.sets.map(s => [byId.get(s.sessionExerciseId)!, Date.parse(s.completedAt!)])) }, '2027-01-02', '2026-11-07', revision, 2);
}
const serve = (body: ReturnType<typeof details> | ReturnType<typeof nutrition>) => async (o: Options) => {
  const parsed = o.parse(JSON.parse(JSON.stringify(body))); if (parsed === undefined) throw Error('Rejected ' + o.path);
  return { status: 'ok' as const, data: parsed, meta };
};
const wrap = (children: React.ReactNode) => <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}><OwnlevelThemeProvider initialMode="light">{children}</OwnlevelThemeProvider></SafeAreaProvider>;
async function open(children: React.ReactNode = <PeriodFeelingsScreen />) {
  const view = render(wrap(children));
  await act(async () => { await new Promise(r => setTimeout(r, 0)); }); return view;
}
beforeEach(() => { mockParams = { asOf: '2026-11-07', revision: 'r1' }; mockFocus.clear(); mockRead.mockReset(); mockPush.mockReset(); mockNavigate.mockReset(); clearConfirmedReads(mockClient); });

function nutrition(revision = 'r1', empty = false) {
  return periodNutritionDetail(empty ? [] : periodDetailsFixture().meals, '2027-01-02', '2026-11-07', revision, 2);
}
describe('period feelings journey', () => {
  it('reads only the selected period, keeps ordinal states and separate coverage, and returns to that summary across New Year', async () => {
    mockRead.mockImplementation(serve(details())); const view = await open();
    expect(mockRead).toHaveBeenCalledTimes(1); expect(mockRead.mock.calls[0]![0].path).toContain('view=period-feelings&asOf=2026-11-07');
    expect(view.getByTestId('period-detail-range')).toHaveTextContent('01/08/2026 – 31/10/2026');
    expect(view.getByText('2 de 8 sesiones con respuesta al terminar')).toBeTruthy(); expect(view.getByText('1 de 8 sesiones con respuesta al terminar')).toBeTruthy();
    const energy = within(view.getByTestId('period-detail-energy'));
    for (const label of ['Respondidas más tarde', 'Sin hora de respuesta', 'Con una hora anterior al inicio', 'No se pudieron leer', 'Con otra escala', 'Sin respuesta al terminar']) expect(energy.getByText(label)).toBeTruthy();
    expect(view.queryByText(/promedio|puntaje|score/i)).toBeNull();
    fireEvent.press(view.getByRole('button', { name: 'Volver al resumen' })); expect(mockNavigate).toHaveBeenLastCalledWith(periodSummaryHref('2026-11-07'));
    fireEvent.press(view.getByRole('button', { name: 'Cómo terminaste, en todo tu historial' })); expect(mockPush).toHaveBeenLastCalledWith('/(tabs)/train/insights/feelings');
    expect(periodDetailHref('feelings', '2026-11-07', 'r1')).toMatchObject({ params: mockParams });
  });
  it('shows a revision change for a whole new reading, and an unavailable read never becomes empty', async () => {
    mockRead.mockResolvedValueOnce(lost).mockImplementation(serve(details('r2'))); const view = await open();
    expect(view.getByText('No pudimos leer las sensaciones')).toBeTruthy(); expect(view.queryByTestId('period-detail-energy')).toBeNull();
    await act(async () => { fireEvent.press(view.getByRole('button', { name: 'Reintentar' })); });
    expect(view.getByTestId('period-detail-revised')).toBeTruthy(); expect(mockRead).toHaveBeenCalledTimes(2);
  });
  it('an empty period has zero coverage without invented answers; an invalid scope does not read', async () => {
    mockRead.mockImplementation(serve(details('r1', true))); const view = await open();
    expect(view.getAllByText('0 de 0 sesiones con respuesta al terminar')).toHaveLength(2);
    view.unmount(); mockRead.mockClear(); mockParams = { asOf: '2026-02-30' };
    const invalid = await open(); expect(invalid.getByText('No pudimos identificar el período')).toBeTruthy(); expect(mockRead).not.toHaveBeenCalled();
  });
});

describe('period nutrition journey', () => {
  it('shows four nutrients on dates without training, distinguishes zero/missing/partial, and returns from the day to the same detail and summary', async () => {
    mockRead.mockImplementation(serve(nutrition())); const view = await open(<PeriodNutritionScreen />);
    expect(mockRead).toHaveBeenCalledTimes(1); expect(mockRead.mock.calls[0]![0].path).toContain('view=period-nutrition&asOf=2026-11-07');
    expect(view.getByTestId('period-nutrition-range')).toHaveTextContent('01/08/2026 – 31/10/2026');
    expect(view.getByText('4 de 92 días con registros; 88 sin comidas registradas.')).toBeTruthy();
    const partial = within(view.getByTestId('period-food-2026-08-11'));
    for (const label of ['Calorías', 'Proteína', 'Carbohidratos', 'Grasas']) expect(partial.getByText(label)).toBeTruthy();
    expect(partial.getAllByText('0 g · parcial')).toHaveLength(2);
    expect(within(view.getByTestId('period-food-2026-08-12')).getAllByText('Sin dato')).toHaveLength(4);
    expect(within(view.getByTestId('period-food-2026-08-13')).getByText('0 kcal')).toBeTruthy();
    expect(view.queryByTestId('period-food-2026-08-14')).toBeNull();
    fireEvent.press(partial.getByRole('button', { name: 'Abrir Nutrición del 11/08/2026' }));
    const day = mockPush.mock.calls.at(-1)![0] as { pathname: string; params: Record<string, string> };
    expect(day).toMatchObject({ pathname: '/(tabs)/nutrition', params: { date: '2026-08-11', insightsReturn: '1', insightsPeriod: 'nutrition', insightsAsOf: '2026-11-07', insightsRevision: 'r1' } });
    // The day screen uses this real shared control. Its origin remains August–October even though today is January.
    mockParams = { ...day.params, asOf: '2026-11-07', revision: 'r1' };
    view.rerender(wrap(<><PeriodNutritionScreen /><ReturnToInsights /></>));
    fireEvent.press(view.getByRole('button', { name: 'Volver a las comidas del período' }));
    const origin = periodDetailHref('nutrition', '2026-11-07', 'r1'); expect(mockNavigate).toHaveBeenLastCalledWith(origin);
    mockParams = origin.params; view.rerender(wrap(<PeriodNutritionScreen />));
    mockRead.mockImplementation(serve(nutrition('r2')));
    await act(async () => { for (const callback of [...mockFocus]) callback(); });
    expect(mockRead).toHaveBeenCalledTimes(2); expect(view.getByTestId('period-nutrition-revised')).toBeTruthy();
    expect(view.getByTestId('period-nutrition-range')).toHaveTextContent('01/08/2026 – 31/10/2026');
    fireEvent.press(view.getByRole('button', { name: 'Volver al resumen' })); expect(mockNavigate).toHaveBeenLastCalledWith(periodSummaryHref('2026-11-07'));
  });

  it('keeps a failed refresh visibly stale and retries a complete reading instead of showing an empty period', async () => {
    mockRead.mockImplementation(serve(nutrition())); const view = await open(<PeriodNutritionScreen />);
    mockRead.mockResolvedValue(lost);
    await act(async () => { for (const callback of [...mockFocus]) callback(); });
    expect(view.getByText('No pudimos actualizar. Mostramos la última lectura completa.')).toBeTruthy();
    expect(view.queryByTestId('period-nutrition-empty')).toBeNull(); expect(view.getByTestId('period-food-2026-08-11')).toBeTruthy();
    mockRead.mockImplementation(serve(nutrition('r2', true)));
    await act(async () => { fireEvent.press(view.getByRole('button', { name: 'Reintentar' })); });
    expect(mockRead).toHaveBeenCalledTimes(3); expect(view.getByTestId('period-nutrition-empty')).toBeTruthy();
    expect(view.getByText('0 de 92 días con registros; 92 sin comidas registradas.')).toBeTruthy(); expect(view.queryByTestId('period-food-2026-08-11')).toBeNull();
  });

  it('never treats another period or account as this reading, and rejects an invalid return scope', async () => {
    const wrong = { ...nutrition(), asOf: '2027-01-02', period: { start: '2026-10-01', end: '2026-12-31', days: 92, months: ['2026-10', '2026-11', '2026-12'] } };
    // The API wrapper must reject a structurally valid response with a different requested anchor.
    mockRead.mockImplementation(async o => {
      const parsed = o.parse(JSON.parse(JSON.stringify({ ...wrong, days: [], daysWithoutMeals: 92 })));
      expect(parsed).toBeUndefined(); return lost;
    });
    const wrongView = await open(<PeriodNutritionScreen />); expect(wrongView.getByText('No pudimos leer las comidas')).toBeTruthy(); wrongView.unmount(); clearConfirmedReads(mockClient);
    mockRead.mockImplementation(serve(nutrition())); const view = await open(<PeriodNutritionScreen />); expect(view.getByTestId('period-food-2026-08-11')).toBeTruthy();
    const ownerA = mockClient;
    mockClient = { read: mockRead, request: jest.fn() } as unknown as MobileApiClient;
    mockRead.mockImplementation(serve(nutrition('owner-b', true)));
    await act(async () => { view.rerender(wrap(<PeriodNutritionScreen />)); });
    expect(view.queryByTestId('period-food-2026-08-11')).toBeNull(); expect(view.getByTestId('period-nutrition-empty')).toBeTruthy();
    clearConfirmedReads(ownerA);
    expect(insightsReturnHref({ insightsReturn: '1', insightsPeriod: 'nutrition', insightsAsOf: '2026-02-30' })).toBeNull();
    view.unmount(); mockRead.mockClear(); mockParams = { asOf: 'not-a-date' }; const invalid = await open(<PeriodNutritionScreen />);
    expect(invalid.getByText('No pudimos identificar el período')).toBeTruthy(); expect(mockRead).not.toHaveBeenCalled();
  });
});
