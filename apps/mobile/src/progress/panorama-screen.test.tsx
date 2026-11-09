import { act, fireEvent, render, within } from '@testing-library/react-native';
import { beforeEach, it, expect, jest } from '@jest/globals';
import { useEffect } from 'react';
import { RefreshControl } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { OwnlevelThemeProvider } from '@/design-system';
import type { MobileApiClient } from '@/api/client';
import { clearConfirmedReads, invalidateConfirmedReads } from '@/api/confirmed-read-cache';
import { ProgressRangeProvider } from './progress-range-context';
import { ProgressOverviewScreen } from './panorama-screen';
import { ProgressPeriodOverviewScreen } from './overview-screen';
import { panoramaFixture, PANORAMA_TODAY } from './panorama-fixture.test-helper';
import { ReturnToProgress } from '@/insights/return-to-progress';
import { bodyWeightHref, insightsReturnHref, insightsOriginOf, nutritionDayHref, explorationHref, periodSummaryHref, periodDetailHref } from '@/insights/navigation';
jest.mock('@react-native-async-storage/async-storage', () => jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('@/platform/haptics', () => ({ haptics: { selection: jest.fn() }, triggerHaptic: jest.fn() }));
let mockParams: Record<string, string> = {}, mockFocused = true;
const mockLife = new Set<{
    focus: () => void;
    blur: () => void;
}>(), mockPush = jest.fn(), mockNavigate = jest.fn();
jest.mock('expo-router', () => ({ Stack: { Screen: () => null }, useLocalSearchParams: () => mockParams, useRouter: () => ({ push: mockPush, navigate: mockNavigate }), useFocusEffect: (cb: () => void | (() => void)) => { jest.requireActual<{
        useEffect: typeof useEffect;
    }>('react').useEffect(() => { let release: void | (() => void); const life = { focus: () => { release = cb(); }, blur: () => { release?.(); release = undefined; } }; mockLife.add(life); if (mockFocused)
        life.focus(); return () => { life.blur(); mockLife.delete(life); }; }, [cb]); } }));
const meta = { durationMs: 1, httpStatus: 200, outcome: 'ok' as const };
let mockData = panoramaFixture();
const read = jest.fn<MobileApiClient['read']>();
let mockClient = { read } as unknown as MobileApiClient;
jest.mock('@/api', () => ({ useMobileApi: () => ({ client: mockClient }) }));
const wrap = (node = <ProgressOverviewScreen />) => <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 393, height: 852 }, insets: { top: 0, bottom: 0, left: 0, right: 0 } }}><OwnlevelThemeProvider initialMode="dark"><ProgressRangeProvider initialToday={PANORAMA_TODAY} initialState={{ unit: 'custom', anchor: PANORAMA_TODAY, custom: { start: '2026-10-11', end: PANORAMA_TODAY }, compare: { kind: 'none' } }}>{node}</ProgressRangeProvider></OwnlevelThemeProvider></SafeAreaProvider>;
beforeEach(() => { mockParams = {}; mockFocused = true; mockLife.clear(); mockPush.mockReset(); mockNavigate.mockReset(); read.mockReset(); mockData = panoramaFixture(); mockClient = { read } as unknown as MobileApiClient; clearConfirmedReads(mockClient); read.mockImplementation(async (o) => { if (o.path.startsWith('/api/mobile/v1/progress?')) {
    const payload = structuredClone(mockData);
    if (!o.path.includes('panorama=1'))
        delete payload.panorama;
    return { status: 'ok', data: o.parse(payload), meta } as never;
} return { status: 'unavailable', reason: 'network', meta: { ...meta, httpStatus: null, outcome: 'unavailable' } }; }); });
it('opens one bounded request instead of four, with no Insights/hidden detail read, and preserves the configurable surface', async () => {
    const before = render(wrap(<ProgressPeriodOverviewScreen />));
    await before.findByTestId('progress-areas');
    const prior = read.mock.calls.map(([o]) => o.path);
    expect(prior).toHaveLength(4);
    before.unmount();
    clearConfirmedReads(mockClient);
    read.mockClear();
    const after = render(wrap());
    await after.findByTestId('progress-panorama');
    expect(read).toHaveBeenCalledTimes(1);
    expect(read.mock.calls[0]![0].path).toContain('from=2026-10-11&to=2026-11-09');
    expect(after.queryByTestId('progress-period-caption')).toBeNull();
    expect(after.getAllByText(/Actividad: 96 series completadas/)).toHaveLength(1);
    expect(after.getByText(/07\/11\/2026 · 3 registros válidos/)).toBeTruthy();
    expect(after.getByText(/10 días utilizados para calorías; 8 para proteína/)).toBeTruthy();
    fireEvent.press(after.getByRole('button', { name: 'Últimos tres meses' }));
    expect(mockNavigate).toHaveBeenLastCalledWith(periodSummaryHref(PANORAMA_TODAY, { fromProgress: '1' }));
    fireEvent.press(after.getByRole('button', { name: 'Semanas, A/B y coincidencias descriptivas' }));
    expect(mockNavigate).toHaveBeenLastCalledWith(explorationHref(PANORAMA_TODAY, undefined, undefined, { fromProgress: '1' }));
    fireEvent.press(after.getByRole('button', { name: 'Ver contexto y comparación de sesiones' }));
    expect(mockNavigate).toHaveBeenLastCalledWith({ pathname: '/(tabs)/train/insights', params: { fromProgress: '1' } });
    expect(read).toHaveBeenCalledTimes(1);
    console.info('[402 request comparison]', { before: prior, after: read.mock.calls.map(([o]) => o.path) });
});
it('inspects a graph locally and opens the corresponding configured detail only on the explicit action', async () => {
    const view = render(wrap());
    await view.findByTestId('progress-panorama');
    const chart = within(view.getByTestId('panorama-chart-training'));
    const buttons = chart.getAllByRole('button');
    fireEvent.press(buttons[0]!);
    expect(mockPush).not.toHaveBeenCalled();
    expect(read).toHaveBeenCalledTimes(1);
    fireEvent.press(view.getByRole('button', { name: 'Ver actividad y ejercicios' }));
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/(tabs)/progress/trends/training', params: { from: '2026-10-11', to: PANORAMA_TODAY } });
});
it('does not read while hidden, reuses a confirmed read on return, and keeps it during revalidation', async () => {
    mockFocused = false;
    const view = render(wrap());
    await act(async () => { });
    expect(read).not.toHaveBeenCalled();
    await act(async () => { mockFocused = true; [...mockLife].forEach(x => x.focus()); });
    await view.findByTestId('progress-panorama');
    expect(read).toHaveBeenCalledTimes(1);
    await act(async () => { mockFocused = false; [...mockLife].forEach(x => x.blur()); });
    await act(async () => { mockFocused = true; [...mockLife].forEach(x => x.focus()); });
    expect(view.getByTestId('progress-panorama')).toBeTruthy();
    expect(read).toHaveBeenCalledTimes(1);
    let resolve!: (r: unknown) => void;
    read.mockImplementationOnce(() => new Promise(r => { resolve = r as typeof resolve; }));
    const refresh = view.UNSAFE_getByType(RefreshControl);
    await act(async () => { refresh.props.onRefresh(); });
    expect(view.getByTestId('progress-panorama')).toBeTruthy();
    await act(async () => resolve({ status: 'unavailable', reason: 'network', meta: { ...meta, httpStatus: null, outcome: 'unavailable' } }));
    expect(view.getByText('No pudimos actualizar. Conservamos la última lectura confirmada.')).toBeTruthy();
});
it('does not show another account reading and invalidates the overview after a confirmed body/nutrition write', async () => {
    const view = render(wrap());
    await view.findByTestId('progress-panorama');
    await act(async () => { invalidateConfirmedReads(mockClient, '/api/mobile/v1/body/weight'); });
    expect(read.mock.calls.length).toBeGreaterThan(1);
    const nextRead = jest.fn<MobileApiClient['read']>().mockResolvedValue({ status: 'unavailable', reason: 'network', meta: { ...meta, httpStatus: null, outcome: 'unavailable' } });
    mockClient = { read: nextRead } as unknown as MobileApiClient;
    await act(async () => view.rerender(wrap()));
    expect(view.queryByText('79,8 kg')).toBeNull();
    expect(view.getByText('No pudimos leer tu progreso')).toBeTruthy();
});
it('keeps progress origin through weeks, evidence and other tabs, rejects arbitrary origins and preserves Train links', () => {
    const origin = insightsOriginOf({ fromProgress: '1', explore: '1', asOf: PANORAMA_TODAY, week: '2026-08-10', revision: 'r1', coincidence: 'calories', coincidenceGroup: 'lower', coincidencePage: '25', coincidenceView: 'feelings', compare: '1', weekA: '2026-08-03', weekB: '2026-08-10' });
    const nutrition = nutritionDayHref('2026-08-03', origin), back = insightsReturnHref(nutrition.params);
    expect(back).toMatchObject({ params: { fromProgress: '1', coincidencePage: '25', coincidenceView: 'feelings', revision: 'r1', weekA: '2026-08-03' } });
    expect(insightsReturnHref(bodyWeightHref({ from: '2026-08-03', to: '2026-08-10' }, origin).params)).toEqual(back);
    expect(insightsReturnHref({ ...nutrition.params, insightsFromProgress: 'evil' })).toBeNull();
    expect(insightsOriginOf({ fromProgress: ['1'] })).not.toHaveProperty('fromProgress');
    expect(periodDetailHref('nutrition', PANORAMA_TODAY, 'r1', origin).params).toMatchObject({ fromProgress: '1' });
    expect(periodSummaryHref()).toEqual({ pathname: '/(tabs)/train/insights/period', params: {} });
    mockParams = { fromProgress: '1' };
    const view = render(wrap(<ReturnToProgress />));
    fireEvent.press(view.getByRole('button', { name: 'Volver a Progreso' }));
    expect(mockNavigate).toHaveBeenLastCalledWith('/(tabs)/progress');
    mockParams = {};
    view.rerender(wrap(<ReturnToProgress />));
    expect(view.queryByRole('button', { name: 'Volver a Progreso' })).toBeNull();
});
it('labels first record, unavailable fields and explicit nutritional zero without manufacturing a trend', async () => {
    mockData.panorama!.weight = { count: 1, first: { date: '2026-11-07', value: 79.8 }, last: { date: '2026-11-07', value: 79.8 } };
    mockData.inPeriod = { improved: 0, comparable: 0 };
    if (mockData.nutrition.status === 'ok')
        mockData.nutrition.data.averageKcal = 0;
    const view = render(wrap());
    await view.findByTestId('progress-panorama');
    expect(view.getByText('Un solo registro no permite describir una tendencia.')).toBeTruthy();
    expect(view.getByText('Sin ejercicios comparables entre dos sesiones de esta ventana.')).toBeTruthy();
    expect(view.getByText('0 kcal por día utilizado')).toBeTruthy();
    view.unmount();
    clearConfirmedReads(mockClient);
    delete mockData.panorama;
    const old = render(wrap());
    await old.findByTestId('progress-panorama');
    expect(old.getByText(/La fecha exacta y cobertura de peso no están disponibles/)).toBeTruthy();
    expect(old.queryByText('Sin pesajes válidos en esta ventana.')).toBeNull();
});
it('uses a single compatibility fallback on an old-server 400, but never retries auth or masks an error as empty', async () => {
    read.mockResolvedValueOnce({ status: 'unavailable', reason: 'invalid_response', meta: { ...meta, httpStatus: 400, outcome: 'unavailable' } });
    const view = render(wrap());
    await view.findByTestId('progress-panorama');
    expect(read).toHaveBeenCalledTimes(2);
    expect(read.mock.calls[1]![0].path).not.toContain('panorama=1');
    view.unmount();
    clearConfirmedReads(mockClient);
    read.mockClear();
    read.mockResolvedValueOnce({ status: 'unauthorized', meta: { ...meta, httpStatus: 401, outcome: 'unauthorized' } });
    const error = render(wrap());
    await error.findByText('No pudimos leer tu progreso');
    expect(read).toHaveBeenCalledTimes(1);
    expect(error.queryByText('Sin sesiones registradas en estas fechas; no describe otros períodos.')).toBeNull();
});

it('does not turn a failed domain into an empty period, while keeping the available areas and their access', async () => {
    mockData.body = {status: 'unavailable'};
    if (mockData.training.status === 'ok') {
        mockData.training.data.sessions = 0; mockData.training.data.trainingDays = 0;
        mockData.training.data.sets = 0;
    }
    mockData.inPeriod = {improved: 0, comparable: 0};
    mockData.sparks!.training!.current.forEach(point => {point.value = 0;});
    const view = render(wrap()); await view.findByTestId('progress-panorama');
    expect(within(view.getByTestId('panorama-body')).getByText('No pudimos leer Cuerpo.')).toBeTruthy();
    expect(view.queryByText(/Sin pesajes válidos/)).toBeNull();
    expect(view.getByText('Sin sesiones registradas en estas fechas; no describe otros períodos.')).toBeTruthy();
    expect(view.getByRole('button', {name: 'Ver peso y medidas'})).toBeTruthy();
    expect(view.getByText('2.190 kcal por día utilizado')).toBeTruthy();
    expect(read).toHaveBeenCalledTimes(1);
});
