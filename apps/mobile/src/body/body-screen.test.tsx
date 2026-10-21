import { useSyncExternalStore } from 'react';
import { act, fireEvent, render, within } from '@testing-library/react-native';
import { describe, expect, it, jest } from '@jest/globals';
import { Alert, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { OwnlevelThemeProvider } from '@/design-system';
import { createMobileApiClient } from '@/api/client';
import { mutateBodyMeasurement, mutateBodyWeight } from '@/api/body';
import { BodyController } from './body-controller';
import { BodyEditors, BodyStatus, MeasurementRecords, WeightRecords, openTodayWeight, useWeightEntry } from './body-screen';
import { BodyAddMenu } from './body-add-menu';
import type { BodyState } from './body-controller';
import { ProgressHub } from './progress-hub';
import { MID, TODAY, conflict, fakeApi, measurement, memoryStorage, ok, overview, repository } from './body-fixture.test-helper';

const mockPush = jest.fn();
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('@react-native-async-storage/async-storage', () => ({ __esModule: true, default: {} }));
const mockSetParams = jest.fn();
jest.mock('expo-router', () => ({ useLocalSearchParams: () => ({}), useRouter: () => ({ push: mockPush, setParams: mockSetParams }), useFocusEffect: () => undefined }));
jest.mock('@/platform/haptics', () => ({ haptics: { selection: jest.fn(), success: jest.fn(), warning: jest.fn() }, triggerHaptic: jest.fn() }));

const flush = () => act(async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); });
function wrap(element: React.ReactElement) {
  return render(<SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }}>
    <OwnlevelThemeProvider initialMode="light">{element}</OwnlevelThemeProvider></SafeAreaProvider>);
}
/** What Progreso › Cuerpo shows of Body: status, the weight and measurement records, the "+" and the sheets. */
function Body({ state, controller }: { state: BodyState; controller: BodyController }) {
  if (!state.read.overview) return <View testID={state.read.status === 'loading' ? 'body-loading' : 'body-unavailable'} />;
  const editable = state.phase === 'idle' && !state.intent && !state.editor;
  return <>
    <BodyStatus state={state} controller={controller} />
    <View testID="body-weight-section"><WeightRecords state={state} controller={controller} editable={editable} /></View>
    <View testID="body-measurement-section"><MeasurementRecords state={state} controller={controller} editable={editable} /></View>
    <BodyAddMenu disabled={!editable} actions={[
      { key: 'weight', label: 'Registrar peso', icon: 'scale', onPress: () => openTodayWeight(state, controller) },
      { key: 'measurement', label: 'Registrar medidas', icon: 'ruler', onPress: () => controller.openMeasurement() },
    ]} />
    <BodyEditors state={state} controller={controller} />
  </>;
}
function Harness({ controller }: { controller: BodyController }) {
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  return <Body state={state} controller={controller} />;
}
async function mount(api = fakeApi()) {
  const controller = new BodyController(api, repository(memoryStorage().port), () => 'body:1');
  const view = wrap(<Harness controller={controller} />);
  await act(async () => { await controller.initialize(); });
  return { view, controller, api };
}

function EntryHarness({ controller }: { controller: BodyController }) {
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  useWeightEntry(true, { state, controller });
  return <Body state={state} controller={controller} />;
}

describe('Home → Registrar → Peso', () => {
  it('opens today\'s weight once (edit mode when today already has one) and never reopens after closing', async () => {
    const controller = new BodyController(fakeApi(), repository(memoryStorage().port), () => 'body:1');
    wrap(<EntryHarness controller={controller} />);
    await act(async () => { await controller.initialize(); });
    expect(controller.getSnapshot().editor).toMatchObject({ kind: 'weight', mode: 'edit', baseline: 80.5 });
    expect(mockSetParams).toHaveBeenCalledWith({ registrar: undefined });
    act(() => controller.close());
    await act(async () => { await Promise.resolve(); });
    expect(controller.getSnapshot().editor).toBeNull();
  });
  it('without a weight today it opens a new entry for today', async () => {
    const controller = new BodyController(fakeApi(overview({}, [{ date: '2026-10-02', weightKg: 81 }])), repository(memoryStorage().port), () => 'body:1');
    wrap(<EntryHarness controller={controller} />);
    await act(async () => { await controller.initialize(); });
    expect(controller.getSnapshot().editor).toMatchObject({ kind: 'weight', mode: 'create', baseline: null });
  });
});

describe('Body records and sheets', () => {
  it('lists every weight with its change and each measurement with its quality/import state', async () => {
    const suspect = measurement({ imported: true, importSource: 'sheet', qualityStatus: 'suspect', qualityNote: 'Revisar', armCm: 33 });
    const { view } = await mount(fakeApi(overview({ measurements: { items: [suspect], nextBefore: null } })));
    const weight = within(view.getByTestId('body-weight-section'));
    expect(weight.getByLabelText('Peso del 4 oct 2026: 80,5 kg')).toBeTruthy(); expect(weight.getByText('↘ 0,5 kg')).toBeTruthy();
    expect(weight.getByLabelText('Peso del 2 oct 2026: 81 kg')).toBeTruthy();
    // The import source is an internal id: only "Importada" is shown.
    const measures = within(view.getByTestId('body-measurement-section'));
    expect(measures.getByText('2 medidas · Sospechosa · Importada')).toBeTruthy(); expect(measures.queryByText(/sheet/)).toBeNull();
  });
  it('empty body data is an explicit absence, not zero', async () => {
    const { view } = await mount(fakeApi(overview({ current: null, profileWeightKg: null, measurements: { items: [], nextBefore: null } }, [])));
    expect(view.getByText('Todavía no registraste peso.')).toBeTruthy(); expect(view.getByText('Todavía no registraste medidas.')).toBeTruthy();
    expect(view.queryByText('0 kg')).toBeNull();
  });
  it('an unavailable first read is not shown as empty', async () => {
    const api = fakeApi(); api.overview.mockResolvedValue({ status: 'unavailable', reason: 'network', meta: { durationMs: 0, httpStatus: null, outcome: 'unavailable' } });
    const { view } = await mount(api);
    expect(view.getByTestId('body-unavailable')).toBeTruthy(); expect(view.queryByText('Todavía no registraste peso.')).toBeNull();
  });
  it('registers a weight from the "+" and shows the confirmed result', async () => {
    const { view, api } = await mount(fakeApi(overview({}, [{ date: '2026-10-01', weightKg: 81 }])));
    api.weight.mockResolvedValue(ok({ status: 'confirmed', operation: 'set', date: TODAY, weightKg: 79.5, current: { date: TODAY, weightKg: 79.5 }, profileWeightKg: 79.5, currentWeightChanged: true }));
    fireEvent.press(view.getByTestId('body-add-menu'));
    fireEvent.press(view.getByTestId('body-add-weight'));
    fireEvent.changeText(view.getByLabelText('Peso'), '79,5');
    await act(async () => { fireEvent.press(view.getByRole('button', { name: 'Guardar' })); });
    await flush();
    expect(api.weight).toHaveBeenCalledWith(expect.objectContaining({ operation: 'set', date: TODAY, weightKg: 79.5, expectedWeightKg: null }));
    expect(view.queryByTestId('body-editor')).toBeNull(); expect(view.getByText('Peso guardado. Tu peso actual ahora es 79,5 kg.')).toBeTruthy();
  });
  it('a conflict keeps the open draft and offers an explicit review', async () => {
    const { view, api } = await mount();
    api.weight.mockResolvedValue(conflict('WEIGHT_CHANGED', 'El peso de esa fecha cambió desde que lo abriste.'));
    fireEvent.press(view.getByLabelText('Peso del 4 oct 2026: 80,5 kg'));
    // Editing a weight never changes its date: the sheet has no date field at all.
    expect(view.queryByLabelText('Fecha')).toBeNull();
    fireEvent.changeText(view.getByLabelText('Peso'), '79');
    await act(async () => { fireEvent.press(view.getByRole('button', { name: 'Guardar' })); });
    await flush();
    expect(view.getByText('El peso de esa fecha cambió desde que lo abriste.')).toBeTruthy();
    expect(view.getByLabelText('Peso').props.value).toBe('79');
    fireEvent.press(view.getByRole('button', { name: 'Revisar valores actuales' }));
    expect(view.getByRole('button', { name: 'Guardar' })).toBeTruthy();
  });
  it('deleting asks for confirmation; closing with changes asks before discarding', async () => {
    const { view, api } = await mount();
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    fireEvent.press(view.getByLabelText('Peso del 4 oct 2026: 80,5 kg'));
    fireEvent.press(view.getByRole('button', { name: 'Eliminar peso' }));
    expect(alert).toHaveBeenCalledWith('¿Eliminar el peso de esta fecha? El resto del día se conserva.', undefined, expect.any(Array));
    expect(api.weight).not.toHaveBeenCalled();
    fireEvent.changeText(view.getByLabelText('Peso'), '70');
    fireEvent.press(view.getByRole('button', { name: 'Cerrar' }));
    expect(alert).toHaveBeenLastCalledWith('¿Descartar cambios?', 'Todavía no guardaste este registro.', expect.any(Array));
    expect(view.getByTestId('body-editor')).toBeTruthy();
    alert.mockRestore();
  });
  it('a suspect measurement editor explains verification and keeps legacy values visible', async () => {
    const suspect = measurement({ qualityStatus: 'suspect', qualityNote: 'Revisar', armCm: 33 });
    const { view } = await mount(fakeApi(overview({ measurements: { items: [suspect], nextBefore: null } })));
    fireEvent.press(view.getByLabelText('Medición del 1 oct 2026'));
    expect(view.getByText(/se marca como verificada/)).toBeTruthy(); expect(view.getByText(/Brazo \(histórico\): 33 cm/)).toBeTruthy();
    expect(view.getByRole('button', { name: 'Guardar y verificar' })).toBeTruthy();
  });
});

describe('Progress → Cuerpo navigation', () => {
  it('opens the stable Body route', () => {
    const view = wrap(<ProgressHub />);
    fireEvent.press(view.getByRole('button', { name: 'Abrir Cuerpo' }));
    expect(mockPush).toHaveBeenCalledWith('/(tabs)/progress/body');
  });
});

describe('Body HTTP mapping', () => {
  function client(fetchImplementation: typeof fetch) {
    return createMobileApiClient({
      auth: { getAccessToken: async () => ({ status: 'ok', accessToken: 'token' }), revalidateAfterUnauthorized: async () => ({ status: 'invalid' }) },
      config: { appEnv: 'development', baseUrl: 'https://example.test', host: 'example.test', timeoutMs: 1000 },
      fetchImplementation, runtime: { appVersion: '1', build: '1', platform: 'ios' }, telemetry: { record: () => undefined },
    });
  }
  const response = (status: number, body: unknown) => ({ status, ok: status < 300, text: async () => JSON.stringify(body) }) as Response;
  it('uses PUT/DELETE by date and POST/PUT/DELETE by id, never retrying a lost write', async () => {
    const fetch = jest.fn<typeof globalThis.fetch>().mockResolvedValue(response(409, { error: 'WEIGHT_CHANGED', message: 'm' }));
    const intent = { operation: 'delete' as const, date: TODAY, expectedWeightKg: 80, weightKg: null, idempotencyKey: 'k' };
    expect(await mutateBodyWeight(client(fetch), intent)).toMatchObject({ status: 'conflict', code: 'WEIGHT_CHANGED' });
    expect(String(fetch.mock.calls[0][0])).toBe(`https://example.test/api/mobile/v1/body/weights/${TODAY}`); expect(fetch.mock.calls[0][1]?.method).toBe('DELETE');
    const lostFetch = jest.fn<typeof globalThis.fetch>().mockRejectedValue(new TypeError('Network request failed'));
    expect(await mutateBodyMeasurement(client(lostFetch), { operation: 'update', measurementId: MID, expectedUpdatedAt: '2026-10-01T12:00:00Z',
      fields: { measuredOn: TODAY, waistCm: 80, abdomenCm: null, chestCm: null, hipCm: null, armRightCm: null, armLeftCm: null, thighRightCm: null,
        thighLeftCm: null, calfRightCm: null, calfLeftCm: null, condition: null, notes: null }, idempotencyKey: 'k2' })).toMatchObject({ status: 'unavailable' });
    expect(lostFetch).toHaveBeenCalledTimes(1);
    expect(String(lostFetch.mock.calls[0][0])).toBe(`https://example.test/api/mobile/v1/body/measurements/${MID}`); expect(lostFetch.mock.calls[0][1]?.method).toBe('PUT');
  });
});
