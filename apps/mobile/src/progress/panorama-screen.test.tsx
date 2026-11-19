import { act, fireEvent, render, within } from '@testing-library/react-native';
import { beforeEach, it, expect, jest } from '@jest/globals';
import { useEffect } from 'react';
import * as Native from 'react-native';
import { Modal, RefreshControl } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { OwnlevelThemeProvider } from '@/design-system';
import type { MobileApiClient } from '@/api/client';
import { clearConfirmedReads, invalidateConfirmedReads } from '@/api/confirmed-read-cache';
import { ExerciseTrendsScreen } from './exercise-trends-screen';
import { useProgressRange, ProgressRangeProvider } from './progress-range-context';
import { ProgressOverviewScreen, portadaValue } from './panorama-screen';
import { ProgressPeriodOverviewScreen } from './overview-screen';
import { panoramaFixture, editorialFixture, PANORAMA_TODAY } from './panorama-fixture.test-helper';
import { atlasHistory, atlasReport } from './panorama-daily.test-helper';
import { fetchProgressPanorama } from '@/api/progress';
import { ReturnToProgress } from '@/insights/return-to-progress';
import { bodyWeightHref, insightsReturnHref, insightsOriginOf, nutritionDayHref, periodSummaryHref, periodDetailHref } from '@/insights/navigation';
jest.mock('@react-native-async-storage/async-storage', () => jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('@/platform/haptics', () => ({ haptics: { selection: jest.fn() }, triggerHaptic: jest.fn() }));
let mockParams: Record<string, string> = {}, mockFocused = true;
const mockLife = new Set<{
    focus: () => void;
    blur: () => void;
}>(), mockPush = jest.fn(), mockNavigate = jest.fn(), mockBack = jest.fn(), mockSetParams = jest.fn();
jest.mock('expo-router', () => ({ Stack: { Screen: () => null }, useLocalSearchParams: () => mockParams, useRouter: () => ({ push: mockPush, navigate: mockNavigate, back: mockBack, setParams: mockSetParams }), useFocusEffect: (cb: () => void | (() => void)) => { jest.requireActual<{
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
    if (!o.path.includes('findings=1')) delete payload.findings;
    return { status: 'ok', data: o.parse(payload), meta } as never;
} if (o.path.startsWith('/api/mobile/v1/history/calendar')) return { status: 'ok', data: o.parse(atlasHistory(mockData)), meta } as never;
if (o.path.startsWith('/api/mobile/v1/nutrition/reports')) return { status: 'ok', data: o.parse(atlasReport(mockData)), meta } as never;
return { status: 'unavailable', reason: 'network', meta: { ...meta, httpStatus: null, outcome: 'unavailable' } }; }); });
it('opens three bounded sources, with no Insights or hidden destination read, and preserves the configurable surface', async () => {
    const before = render(wrap(<ProgressPeriodOverviewScreen />));
    await before.findByTestId('progress-areas');
    const prior = read.mock.calls.map(([o]) => o.path);
    expect(prior).toHaveLength(4);
    before.unmount();
    clearConfirmedReads(mockClient);
    read.mockClear();
    const after = render(wrap());
    await after.findByTestId('progress-panorama');
    expect(read).toHaveBeenCalledTimes(3);
    expect(read.mock.calls[0]![0].path).toContain('from=2026-10-11&to=2026-11-09');
    expect(after.queryByTestId('progress-period-caption')).toBeNull();
    expect(after.getByText('7 días entrenados · 96 series')).toBeTruthy();
    expect(after.getAllByTestId(/^panorama-day-/)).toHaveLength(30);
    expect(after.getByText(/7 nov · 3 pesajes/)).toBeTruthy();
    expect(after.getByText('Promedio de 10 días (proteína: 8)')).toBeTruthy();
    expect(after.getByText('Proteína 127 g/día')).toBeTruthy();
    fireEvent.press(after.getByRole('button', { name: 'Últimos tres meses: tres meses enteros, semana por semana' }));
    expect(mockNavigate).toHaveBeenLastCalledWith({ ...periodSummaryHref(PANORAMA_TODAY, { fromProgress: '1' }), pathname: '/(tabs)/progress/insights/period' });
    fireEvent.press(after.getByRole('button', { name: 'Comparaciones: Cada sesión con lo tuyo y con la anterior' }));
    expect(mockNavigate).toHaveBeenLastCalledWith({ pathname: '/(tabs)/progress/insights', params: { fromProgress: '1' } });
    expect(read).toHaveBeenCalledTimes(3);
    console.info('[402 request comparison]', { before: prior, after: read.mock.calls.map(([o]) => o.path) });
});
it('inspects a graph locally and opens the corresponding configured detail only on the explicit action', async () => {
    const view = render(wrap());
    await view.findByTestId('progress-panorama');
    fireEvent.press(view.getByRole('button', {name: 'Ver puntos del resumen'}));
    const chart = within(view.getByTestId('panorama-chart-training'));
    const buttons = chart.getAllByRole('button');
    fireEvent.press(buttons[0]!);
    expect(mockPush).not.toHaveBeenCalled();
    expect(read).toHaveBeenCalledTimes(3);
    fireEvent.press(view.getByRole('button', { name: 'Ver actividad y ejercicios' }));
    // The inspected point travels with the window; the detail decides whether it holds the same datum.
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/(tabs)/progress/trends/training', params: expect.objectContaining({ from: '2026-10-11', to: PANORAMA_TODAY, point: '2026-10-11~2026-10-11' }) });
});
it('does not read while hidden, reuses a confirmed read on return, and keeps it during revalidation', async () => {
    mockFocused = false;
    const view = render(wrap());
    await act(async () => { });
    expect(read).not.toHaveBeenCalled();
    await act(async () => { mockFocused = true; [...mockLife].forEach(x => x.focus()); });
    await view.findByTestId('progress-panorama');
    expect(read).toHaveBeenCalledTimes(3);
    await act(async () => { mockFocused = false; [...mockLife].forEach(x => x.blur()); });
    await act(async () => { mockFocused = true; [...mockLife].forEach(x => x.focus()); });
    expect(view.getByTestId('progress-panorama')).toBeTruthy();
    expect(read).toHaveBeenCalledTimes(3);
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
    expect(view.getByText('0')).toBeTruthy();
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
    expect(read).toHaveBeenCalledTimes(4);
    expect(read.mock.calls[1]![0].path).not.toContain('findings=1');
    expect(read.mock.calls[1]![0].path).toContain('panorama=1');
    view.unmount();
    clearConfirmedReads(mockClient);
    read.mockClear();
    read.mockResolvedValueOnce({ status: 'unauthorized', meta: { ...meta, httpStatus: 401, outcome: 'unauthorized' } });
    const error = render(wrap());
    await error.findByText('No pudimos leer tu progreso');
    expect(read).toHaveBeenCalledTimes(1);
    expect(error.queryByText('Sin sesiones registradas en esta ventana.')).toBeNull();
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
    expect(view.getByText('Sin sesiones registradas en esta ventana.')).toBeTruthy();
    expect(view.getByRole('button', {name: 'Ver peso y medidas'})).toBeTruthy();
    expect(view.getByText('2.190')).toBeTruthy();
    expect(read).toHaveBeenCalledTimes(3);
});

it('opens one disclosure without reads, retains it on return, then opens the exercise with its actual window before its first read', async () => {
    mockData.findings = editorialFixture();
    let range: ReturnType<typeof useProgressRange> | undefined;
    function InspectRange() {range = useProgressRange(); return null;}
    const node = <><ProgressOverviewScreen/><InspectRange/></>;
    const view = render(wrap(node)); await view.findByTestId('progress-panorama');
    // Deliberately leave an unrelated A/B question in the shared configuration.
    await act(async () => range!.setState({unit: 'week', anchor: '2026-10-01', custom: null, compare: {kind: 'last_year'}}));
    fireEvent.press(view.getByRole('button', {name: /Ver referencia de Press banca.*Nuevo récord/}));
    expect(read).toHaveBeenCalledTimes(3);
    await act(async () => {mockFocused = false; [...mockLife].forEach(x => x.blur());});
    await act(async () => {mockFocused = true; [...mockLife].forEach(x => x.focus());});
    expect(view.getByRole('button', {name: 'Ver registros de Press banca'})).toBeTruthy();
    expect(read).toHaveBeenCalledTimes(3);
    fireEvent.press(view.getByRole('button', {name: 'Ver registros de Press banca'}));
    expect(range!.query).toEqual({period: 'custom', from: '2026-10-11', to: PANORAMA_TODAY});
    expect(range!.compare).toBeNull();
    const href = mockPush.mock.calls.at(-1)![0] as {params: Record<string,string>}; mockParams = href.params;
    view.rerender(wrap(<ExerciseTrendsScreen/>));
    await view.findByText('No pudimos cargar el ejercicio');
    expect(read.mock.calls.at(-1)![0].path).toContain(`from=2026-10-11&to=${PANORAMA_TODAY}`);
    fireEvent.press(view.getByTestId('progress-back')); expect(mockBack).toHaveBeenCalledTimes(1);
});
it('opens the canonical nutrition reference instead of an inherited A/B and never fetches on disclosure', async () => {
    mockData.findings = editorialFixture();
    let range: ReturnType<typeof useProgressRange> | undefined;
    function InspectRange() {range = useProgressRange(); return null;}
    const view = render(wrap(<><ProgressOverviewScreen/><InspectRange/></>)); await view.findByTestId('progress-panorama');
    await act(async () => range!.setState({...range!.state, compare: {kind: 'last_year'}}));
    fireEvent.press(view.getByRole('button', {name: /Ver referencia de Calorías registradas/}));
    expect(view.getByText('Actual: 10 de 29 días. Referencia: 15 de 30 días.')).toBeTruthy();
    expect(read).toHaveBeenCalledTimes(3);
    fireEvent.press(view.getByRole('button', {name: 'Ver registros de Calorías registradas'}));
    expect(range!.compare).toEqual({start: '2026-09-11', end: '2026-10-10'});
    expect(mockPush).toHaveBeenLastCalledWith({pathname: '/(tabs)/progress/trends/nutrition', params: {from: '2026-10-11', to: PANORAMA_TODAY}});
});
it('replaces confirmed findings after invalidation, keeps them during refresh and removes them on account change', async () => {
    mockData.findings = editorialFixture(); const view = render(wrap()); await view.findByTestId('progress-panorama');
    let finish!: (value: unknown) => void;
    read.mockImplementationOnce(() => new Promise(resolve => {finish = resolve as typeof finish;}));
    await act(async () => {invalidateConfirmedReads(mockClient, '/api/mobile/v1/body/weight');});
    expect(view.getByText('Récord · Press banca')).toBeTruthy();
    const fresh = {...mockData, findings: []};
    await act(async () => finish({status: 'ok', data: fresh, meta}));
    expect(view.queryByText('Récord · Press banca')).toBeNull();
    expect(view.getByText('No hay hallazgos para destacar en esta ventana.')).toBeTruthy();
    mockClient = {read: jest.fn<MobileApiClient['read']>().mockResolvedValue({status: 'auth_required', meta: {...meta, httpStatus: null, outcome: 'auth_required'}})} as unknown as MobileApiClient;
    view.rerender(wrap()); await view.findByText('No pudimos leer tu progreso');
    expect(view.queryByTestId('progress-findings')).toBeNull();
});

it('adds the summaries to the same one-request opening, and supports older servers without retrying auth', async () => {
    mockData.findings = editorialFixture();
    await fetchProgressPanorama(mockClient, {period: 'custom', from: '2026-10-11', to: PANORAMA_TODAY});
    expect(read).toHaveBeenCalledTimes(1); const before = read.mock.calls[0]![0].path;
    read.mockClear(); const view = render(wrap()); await view.findByTestId('progress-panorama');
    expect(read).toHaveBeenCalledTimes(3); const after = read.mock.calls[0]![0].path;
    expect(after).toBe(`${before}&findings=1`);
    console.info('[402 findings request comparison]', {GETBefore: 1, GETAfter: 1, before, after});
    view.unmount(); clearConfirmedReads(mockClient); read.mockClear();
    const old400 = {status: 'unavailable' as const, reason: 'invalid_response' as const, meta: {...meta, httpStatus: 400, outcome: 'unavailable' as const}};
    read.mockResolvedValueOnce(old400).mockResolvedValueOnce(old400);
    const old = render(wrap()); await old.findByTestId('progress-panorama');
    expect(read).toHaveBeenCalledTimes(5);
    expect(read.mock.calls[1]![0].path).toContain('panorama=1'); expect(read.mock.calls[1]![0].path).not.toContain('findings=1');
    expect(read.mock.calls[2]![0].path).not.toContain('panorama=1');
    expect(old.getByText('Los hallazgos no están disponibles en esta lectura.')).toBeTruthy();
    expect(old.queryByText('No hay hallazgos para destacar en esta ventana.')).toBeNull();
});

it.each([0, 1, 3])('keeps the same three-area reading order before %i findings and preserves the original actions', async count => {
    mockData.findings = editorialFixture().slice(0, count);
    const view = render(wrap()); await view.findByTestId('progress-panorama');
    expect(view.getAllByTestId(/^(progress-panorama|progress-findings)$/).map(n => n.props.testID)).toEqual(['progress-panorama', 'progress-findings']);
    const headings = within(view.getByTestId('progress-panorama')).getAllByRole('header').map(n => n.props.children);
    expect(headings).toEqual(['Entrenamiento', 'Cuerpo', 'Nutrición']);
    expect(view.queryAllByTestId(/^progress-finding-/)).toHaveLength(count);
    if (!count) expect(view.queryByRole('header', {name: 'Para mirar de cerca'})).toBeNull();
    expect(read).toHaveBeenCalledTimes(3);
    fireEvent.press(view.getByRole('button', {name: 'Ver peso y medidas'}));
    expect(mockPush).toHaveBeenCalledWith({pathname:'/(tabs)/progress/trends/body',params:{from:'2026-10-11',to:PANORAMA_TODAY}});
});
it('keeps a comparable zero result, unavailable comparison and activity distinct', async () => {
    mockData.inPeriod = {improved:0,comparable:5};
    const view = render(wrap()); await view.findByTestId('progress-panorama');
    const training = within(view.getByTestId('panorama-training'));
    expect(training.getByText('0 de 5 ejercicios subieron · primera frente a última sesión')).toBeTruthy();
    delete mockData.inPeriod;
    invalidateConfirmedReads(mockClient,'/api/mobile/v1/training/sessions/fixture/finish'); await act(async()=>{});
    expect(training.getByText('Comparación no disponible en esta lectura.')).toBeTruthy();
    expect(training.queryByText(/Sin ejercicios comparables/)).toBeNull();
});
it.each([{width:320,fontScale:1},{width:430,fontScale:1},{width:320,fontScale:2}])('keeps accessible headers and targets at $width pt / scale $fontScale', async ({width,fontScale}) => {
    const dimensions = jest.spyOn(Native,'useWindowDimensions').mockReturnValue({width,height:844,scale:3,fontScale});
    try {
        const view = render(wrap()); await view.findByTestId('progress-panorama');
        const action=view.getByRole('button',{name:'Ver actividad y ejercicios'});
        expect(Native.StyleSheet.flatten(action.props.style).minHeight).toBeGreaterThanOrEqual(44);
        expect(action.props.accessibilityHint).toContain('3 de 5');
        expect(view.getByRole('button', {name:'Ver peso y medidas'}).props.accessibilityHint).toContain('3 registros válidos');
        expect(view.getByRole('button', {name:'Ver alimentación y objetivos'}).props.accessibilityHint).toContain('8 días utilizados');
        if(fontScale>1.3) expect(action.findAll(n=>n.props.style&&Native.StyleSheet.flatten(n.props.style)?.flexDirection==='column').length).toBeGreaterThan(0);
        for(const text of view.getAllByRole('header')) expect(text.props.allowFontScaling).not.toBe(false);
    } finally {dimensions.mockRestore();}
});
it('read budget: keeps one grouped opening and no reads for point/finding/context disclosure', async () => {
    mockData.findings=editorialFixture();
    const view=render(wrap());await view.findByTestId('progress-panorama');
    const initial=read.mock.calls.length;expect(initial).toBe(3);
    fireEvent.press(view.getByRole('button',{name:'Ver puntos del resumen'}));
    fireEvent.press(within(view.getByTestId('panorama-chart-training')).getAllByRole('button')[0]!);
    expect(read).toHaveBeenCalledTimes(initial);
    fireEvent.press(view.getByRole('button',{name:/Ver referencia de Press banca.*Nuevo récord/}));
    expect(read).toHaveBeenCalledTimes(initial);
    const context=view.queryByRole('button',{name:'Ver todas las herramientas'});
    if(context) {fireEvent.press(context);fireEvent.press(context);}
    expect(read).toHaveBeenCalledTimes(initial);
    console.info('P0B_READ_BUDGET',JSON.stringify({initial,afterLocalInteractions:read.mock.calls.length,path:read.mock.calls[0]![0].path,fixtureBytes:Buffer.byteLength(JSON.stringify(mockData),'utf8')}));
});
it('shows every thematic destination without loading it, and distinguishes recent History from the calendar', async () => {
    const view=render(wrap());await view.findByTestId('progress-panorama');
    expect(within(view.getByTestId('panorama-explore')).getAllByRole('button')).toHaveLength(12);
    fireEvent.press(view.getByTestId('panorama-tool-period'));expect(mockNavigate).toHaveBeenLastCalledWith('/(tabs)/progress/period');
    fireEvent.press(view.getByTestId('panorama-tool-calendar'));expect(mockNavigate).toHaveBeenLastCalledWith('/history/calendar');
    fireEvent.press(view.getByTestId('panorama-tool-views'));expect(mockNavigate).toHaveBeenLastCalledWith('/(tabs)/progress/saved-views');
    fireEvent.press(view.getByTestId('panorama-tool-stages'));expect(mockNavigate).toHaveBeenLastCalledWith('/(tabs)/progress/stages');
    expect(read).toHaveBeenCalledTimes(3);
});
it('keeps descriptive questions available without another read; connections live inside Explorar período', async () => {
    const view=render(wrap());await view.findByTestId('progress-panorama');
    expect(view.queryByTestId('panorama-tool-connections')).toBeNull();
    fireEvent.press(view.getByTestId('panorama-tool-influence'));
    expect(mockNavigate).toHaveBeenLastCalledWith('/(tabs)/progress/influence');
    expect(read).toHaveBeenCalledTimes(3);
});
it('retains point disclosure on return and retires it on account change while tools stay visible', async () => {
    const view=render(wrap());await view.findByTestId('progress-panorama');
    fireEvent.press(view.getByRole('button',{name:'Ver puntos del resumen'}));
    await act(async()=>{mockFocused=false;[...mockLife].forEach(x=>x.blur());});
    await act(async()=>{mockFocused=true;[...mockLife].forEach(x=>x.focus());});
    expect(view.getByTestId('panorama-points')).toBeTruthy();expect(read).toHaveBeenCalledTimes(3);
    mockClient={read} as unknown as MobileApiClient;view.rerender(wrap());await view.findByTestId('progress-panorama');
    expect(view.queryByTestId('panorama-points')).toBeNull();
    expect(view.getByTestId('panorama-tool-quarter')).toBeTruthy();
});
it('P1-C1: the inspected spark point survives the trip to the detail and back, travels with the area and leaves with the account', async () => {
    const view = render(wrap());
    await view.findByTestId('progress-panorama');
    fireEvent.press(view.getByRole('button', {name: 'Ver puntos del resumen'}));
    const point = () => within(view.getByTestId('panorama-chart-weight')).getAllByRole('button').find(b => b.props.accessibilityState?.selected);
    const weightButtons = within(view.getByTestId('panorama-chart-weight')).getAllByRole('button');
    const target = weightButtons.find(b => !/sin dato/.test(b.props.accessibilityLabel))!;
    fireEvent.press(target); const label = point()!.props.accessibilityLabel;
    fireEvent.press(view.getByRole('button', { name: 'Ver peso y medidas' }));
    const params = (mockPush.mock.calls.at(-1)![0] as { params: Record<string, string> }).params;
    expect(params).toEqual(expect.objectContaining({ from: '2026-10-11', to: PANORAMA_TODAY }));
    expect(params.point).toMatch(/^\d{4}-\d{2}-\d{2}~\d{4}-\d{2}-\d{2}$/); expect(label).toContain(params.pointText.split(':')[0]!.split(',')[0]!);
    // Away (hidden) and back: the same point is still inspected, with no other read.
    await act(async () => { mockFocused = false; [...mockLife].forEach(x => x.blur()); });
    await act(async () => { mockFocused = true; [...mockLife].forEach(x => x.focus()); });
    await view.findByTestId('progress-panorama');
    expect(point()!.props.accessibilityLabel).toBe(label); expect(read).toHaveBeenCalledTimes(3);
    // Another account: no inspected point and no point carried to the detail.
    mockClient = { read } as unknown as MobileApiClient; view.rerender(wrap()); await view.findByTestId('progress-panorama');
    expect(view.queryByTestId('panorama-points')).toBeNull();
    fireEvent.press(view.getByRole('button', { name: 'Ver peso y medidas' }));
    expect((mockPush.mock.calls.at(-1)![0] as { params: Record<string, string> }).params.point).toBeUndefined();
});

it('opens weight and measures on the portada window without inheriting an unrelated A/B', async () => {
    let range: ReturnType<typeof useProgressRange> | undefined;
    function InspectRange() {range=useProgressRange();return null;}
    const view=render(wrap(<><ProgressOverviewScreen/><InspectRange/></>));await view.findByTestId('progress-panorama');
    await act(async()=>range!.setState({...range!.state,compare:{kind:'last_year'}}));
    fireEvent.press(view.getByTestId('panorama-tool-measures'));
    expect(mockPush).toHaveBeenLastCalledWith({pathname:'/(tabs)/progress/trends/body',params:{from:'2026-10-11',to:PANORAMA_TODAY,section:'measures'}});
    expect(range!.compare).toBeNull();
    fireEvent.press(view.getByTestId('panorama-tool-weight'));
    expect(mockPush).toHaveBeenLastCalledWith({pathname:'/(tabs)/progress/trends/body',params:{from:'2026-10-11',to:PANORAMA_TODAY,metric:'body.weight'}});
    expect(read).toHaveBeenCalledTimes(3);
});
it('#519 · «Comparar períodos» proposes the portada window; «Cuándo comés» opens on it; Comparaciones and Métricas only navigate', async () => {
    // The shared period, as the destinations read it.
    let range: ReturnType<typeof useProgressRange> | undefined;
    function InspectRange() { range = useProgressRange(); return null; }
    const view = render(wrap(<><ProgressOverviewScreen /><InspectRange /></>)); await view.findByTestId('progress-panorama');
    const before = range!.state;
    fireEvent.press(view.getByRole('button', { name: /^Comparar períodos/ }));
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(view.getByTestId('compare-ab')).toBeTruthy();
    expect(view.queryByTestId('progress-range-calendar')).toBeNull();
    expect(read).toHaveBeenCalledTimes(3);
    fireEvent.press(view.getByRole('button', {name: 'Cerrar sin cambiar'}));
    fireEvent(view.UNSAFE_getByType(Modal), 'dismiss');
    // Only a proposal: nothing is applied until «Listo» in the sheet.
    expect(range!.state).toBe(before);
    fireEvent.press(view.getByRole('button', { name: /^Cuándo comés/ }));
    expect(mockPush).toHaveBeenLastCalledWith('/(tabs)/progress/trends/meal-times');
    expect([range!.query.from, range!.query.to, range!.compare]).toEqual(['2026-10-11', '2026-11-09', null]);
    fireEvent.press(view.getByRole('button', { name: /^Comparaciones: / }));
    expect(mockNavigate).toHaveBeenLastCalledWith({ pathname: '/(tabs)/progress/insights', params: { fromProgress: '1' } });
    fireEvent.press(view.getByRole('button', { name: /^Métricas personales/ }));
    expect(mockPush).toHaveBeenLastCalledWith('/(tabs)/progress/trends/metrics');
    expect(read).toHaveBeenCalledTimes(3);
});
it('#519 · Explorar período opens the existing A/B sheet once when the portada asks, then forgets the request', async () => {
    mockParams = { sheet: 'compare' };
    const view = render(wrap(<ProgressPeriodOverviewScreen />)); await view.findByTestId('progress-areas');
    expect(view.getByTestId('compare-ab')).toBeTruthy();
    expect(mockSetParams).toHaveBeenCalledTimes(1); expect(mockSetParams).toHaveBeenCalledWith({ sheet: undefined });
    view.unmount(); mockSetParams.mockClear(); mockParams = {};
    const plain = render(wrap(<ProgressPeriodOverviewScreen />)); await plain.findByTestId('progress-areas');
    expect(plain.queryByTestId('compare-ab')).toBeNull(); expect(mockSetParams).not.toHaveBeenCalled();
});
it('#519 · the portada shows kcal and protein per day in whole numbers and weight with one decimal at most', () => {
    expect(portadaValue(3004.17, 'kcal')).toBe('3.004 kcal');
    expect(portadaValue(166.19, 'g')).toBe('166 g');
    expect(portadaValue(78.46, 'kg')).toBe('78,5 kg');
    expect(portadaValue(78, 'kg')).toBe('78 kg');
    expect(portadaValue(0, 'kcal')).toBe('0 kcal');
});

it('#519 · the A/B sheet shows the portada\'s 30 days with the active custom B: closing changes nothing, «Listo» applies both', async () => {
    const active = { unit: 'month' as const, anchor: PANORAMA_TODAY, custom: null, compare: { kind: 'custom' as const, range: { start: '2026-08-01', end: '2026-08-20' } } };
    let range: ReturnType<typeof useProgressRange> | undefined;
    function InspectRange() { range = useProgressRange(); return null; }
    const tree = () => <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 393, height: 852 }, insets: { top: 0, bottom: 0, left: 0, right: 0 } }}><OwnlevelThemeProvider initialMode="dark">
      <ProgressRangeProvider initialToday={PANORAMA_TODAY} initialState={active}><ProgressPeriodOverviewScreen /><InspectRange /></ProgressRangeProvider></OwnlevelThemeProvider></SafeAreaProvider>;
    mockParams = { sheet: 'compare', proposalFrom: '2026-10-11', proposalTo: PANORAMA_TODAY };
    const cancel = render(tree()); await cancel.findByTestId('compare-ab');
    expect(cancel.getByTestId('compare-cell-a').props.accessibilityLabel).toMatch(/30 días$/);
    expect(cancel.getByTestId('compare-cell-b').props.accessibilityLabel).toMatch(/20 días$/);
    const opened = range!.state;
    expect([range!.query.from, range!.query.to, range!.compare]).toEqual(['2026-11-01', PANORAMA_TODAY, { start: '2026-08-01', end: '2026-08-20' }]);
    fireEvent.press(cancel.getByRole('button', { name: 'Cerrar sin cambiar' }));
    fireEvent(cancel.UNSAFE_getByType(Modal), 'dismiss');
    expect(cancel.queryByTestId('compare-ab')).toBeNull();
    // Closed without changes: the range and B that were active stay, exactly.
    expect(range!.state).toBe(opened);
    expect([range!.query.from, range!.query.to, range!.compare]).toEqual(['2026-11-01', PANORAMA_TODAY, { start: '2026-08-01', end: '2026-08-20' }]);
    cancel.unmount();
    const apply = render(tree()); await apply.findByTestId('compare-ab');
    fireEvent.press(apply.getByRole('button', { name: 'Ver comparación' }));
    fireEvent(apply.UNSAFE_getByType(Modal), 'dismiss');
    // «Listo»: the proposed 30 days as A, the custom B kept with its own dates.
    expect([range!.query.from, range!.query.to, range!.compare]).toEqual(['2026-10-11', PANORAMA_TODAY, { start: '2026-08-01', end: '2026-08-20' }]);
    expect(range!.state.compare).toEqual({ kind: 'custom', range: { start: '2026-08-01', end: '2026-08-20' } });
    apply.unmount();
    // «Sin comparar» from the portada's proposal: B goes off over the active A (this month), never over the proposed 30 days.
    const off = render(tree()); await off.findByTestId('compare-ab');
    expect(off.getByTestId('compare-cell-a').props.accessibilityLabel).toMatch(/30 días$/);
    expect([range!.query.from, range!.query.to]).toEqual(['2026-11-01', PANORAMA_TODAY]);
    fireEvent.press(off.getByRole('button', { name: 'Sin comparar' }));
    fireEvent(off.UNSAFE_getByType(Modal), 'dismiss');
    expect(off.queryByTestId('compare-ab')).toBeNull();
    expect([range!.query.from, range!.query.to, range!.compare]).toEqual(['2026-11-01', PANORAMA_TODAY, null]);
    expect(range!.state).toEqual({ ...active, compare: { kind: 'none' } });
});

it('opens the focused comparison only after confirming the direct home sheet, with no hidden destination reads', async () => {
    let range: ReturnType<typeof useProgressRange> | undefined;
    function Inspect() {const value = useProgressRange(); useEffect(() => {range = value;}, [value]); return null;}
    const view = render(wrap(<><ProgressOverviewScreen /><Inspect /></>)); await view.findByTestId('progress-panorama');
    fireEvent.press(view.getByRole('button', {name: /^Comparar períodos/}));
    expect(mockPush).not.toHaveBeenCalled(); expect(read).toHaveBeenCalledTimes(3);
    fireEvent.press(view.getByTestId('compare-apply'));
    expect(mockPush).not.toHaveBeenCalled(); expect(range!.compare).toBeNull();
    fireEvent(view.UNSAFE_getByType(Modal), 'dismiss');
    expect(mockPush).toHaveBeenLastCalledWith('/(tabs)/progress/compare');
    expect(range!.compare).toEqual({start: '2026-09-11', end: '2026-10-10'});
    expect([range!.query.from, range!.query.to]).toEqual(['2026-10-11', PANORAMA_TODAY]);
    expect(read).toHaveBeenCalledTimes(3);
});
