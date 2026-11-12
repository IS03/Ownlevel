import { useSyncExternalStore } from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { Alert, Dimensions, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { BODY_MEASUREMENT_FIELDS, type BodyMeasurement, type BodyMeasurementField, type BodyMeasurementReceipt } from '@/api/body';
import { OwnlevelThemeProvider } from '@/design-system';
import { BodyController } from './body-controller';
import { MeasurementEditorSheet } from './body-editor';
import type { MeasurementDraft } from './body-model';
import { GUIDE_COMMON } from './body-measure-guides';
import { MID, TODAY, conflict, fakeApi, lost, measurement, memoryStorage, ok, overview, repository } from './body-fixture.test-helper';

let mockReduced = false;
jest.mock('@/design-system/motion', () => ({ ...jest.requireActual<object>('@/design-system/motion'), useReduceMotion: () => mockReduced }));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('@/platform/haptics', () => ({ haptics: { selection: jest.fn(), success: jest.fn(), warning: jest.fn() }, triggerHaptic: jest.fn() }));
const initialWindow = Dimensions.get('window');
afterEach(() => { mockReduced = false; jest.restoreAllMocks(); Dimensions.set({ window: initialWindow, screen: Dimensions.get('screen') }); });

// Fictitious values only. Rows are newest-first, like the controller's read.
let counter = 0;
const row = (measuredOn: string, values: Partial<Record<BodyMeasurementField, number>> = {}, patch: Partial<BodyMeasurement> = {}) => {
  const blank = Object.fromEntries(BODY_MEASUREMENT_FIELDS.map(f => [f, null])) as Record<BodyMeasurementField, null>;
  return measurement({ ...blank, ...values, id: `51000000-0000-4000-8000-${String(++counter).padStart(12, '0')}`, measuredOn, ...patch });
};
const flush = () => act(async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); });
const noValues = Object.fromEntries(BODY_MEASUREMENT_FIELDS.map(f => [f, null]));

function Harness({ controller }: { controller: BodyController }) {
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  return state.editor?.kind === 'measurement' ? <MeasurementEditorSheet editor={state.editor} state={state} controller={controller} /> : null;
}
async function mount(history: BodyMeasurement[], open: (controller: BodyController) => void = c => c.openMeasurement()) {
  const api = fakeApi();
  api.overview.mockResolvedValue(ok(overview({ measurements: { items: history, nextBefore: null } })));
  const controller = new BodyController(api, repository(memoryStorage().port), () => 'body:1');
  const view = render(<SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }}>
    <OwnlevelThemeProvider initialMode="light"><Harness controller={controller} /></OwnlevelThemeProvider></SafeAreaProvider>);
  await act(async () => { await controller.initialize(); });
  act(() => open(controller));
  return { view, controller, api };
}
const region = (view: ReturnType<typeof render>, name: string) => view.getByRole('button', { name: new RegExp(`^${name},`) });
const draftOf = (controller: BodyController) => controller.getSnapshot().editor!.draft as MeasurementDraft;
const created = (fields: Partial<Record<BodyMeasurementField, number>>): BodyMeasurementReceipt =>
  ({ status: 'confirmed', operation: 'create', measurementId: MID, measurement: measurement({ ...noValues, ...fields } as Partial<BodyMeasurement>) });

describe('first measurement (empty history)', () => {
  it('shows the three regions with Tronco open, no habits and no references', async () => {
    const { view } = await mount([]);
    expect(view.queryByText('Tus medidas habituales')).toBeNull();
    expect(region(view, 'Tronco').props.accessibilityState.expanded).toBe(true);
    expect(region(view, 'Brazos').props.accessibilityState.expanded).toBe(false);
    expect(region(view, 'Piernas').props.accessibilityState.expanded).toBe(false);
    for (const label of ['Cintura', 'Abdomen', 'Pecho', 'Cadera']) expect(view.getByLabelText(label)).toBeTruthy();
    expect(view.queryByLabelText('Brazo derecho')).toBeNull();
    expect(view.queryByText(/Anterior:/)).toBeNull();
    expect(view.getByLabelText('Cintura').props.value).toBe(''); // never pre-filled
    expect(view.getByLabelText('Cintura').props.autoFocus).toBeFalsy();
  });
  it('counts what was filled and keeps it when the region is collapsed', async () => {
    const { view, controller } = await mount([]);
    expect(region(view, 'Tronco').props.accessibilityLabel).toBe('Tronco, 4 medidas, ninguna con valor');
    fireEvent.changeText(view.getByLabelText('Cintura'), '81,5');
    expect(region(view, 'Tronco').props.accessibilityLabel).toBe('Tronco, 4 medidas, 1 con valor');
    expect(view.getByText('1 de 4')).toBeTruthy();
    fireEvent.press(region(view, 'Tronco'));
    expect(view.queryByLabelText('Cintura')).toBeNull();
    expect(draftOf(controller).waistCm).toBe('81,5');
    expect(view.getByText('1 de 4')).toBeTruthy();
    fireEvent.press(region(view, 'Tronco'));
    expect(view.getByLabelText('Cintura').props.value).toBe('81,5');
  });
});

describe('quick load with habits', () => {
  const history = [row('2026-10-03', { waistCm: 80, abdomenCm: 90 }), row('2026-10-02', { waistCm: 81, abdomenCm: 91 }), row('2026-10-01', { waistCm: 82, abdomenCm: 92, chestCm: 100 })];
  it('shows the habitual fields first, collapses the regions and never repeats a field', async () => {
    const { view } = await mount(history);
    expect(view.getByText('Tus medidas habituales')).toBeTruthy();
    expect(view.getAllByLabelText('Cintura')).toHaveLength(1); expect(view.getAllByLabelText('Abdomen')).toHaveLength(1);
    for (const name of ['Tronco', 'Brazos', 'Piernas']) expect(region(view, name).props.accessibilityState.expanded).toBe(false);
    expect(region(view, 'Tronco').props.accessibilityLabel).toBe('Tronco, 2 medidas, ninguna con valor'); // pecho + cadera only
    fireEvent.press(region(view, 'Tronco'));
    expect(view.getAllByLabelText('Cintura')).toHaveLength(1);
    expect(view.getByLabelText('Pecho')).toBeTruthy(); expect(view.getByLabelText('Cadera')).toBeTruthy();
  });
  it('saves exactly the two typed habitual fields through the existing path, everything else null', async () => {
    const { view, api } = await mount(history);
    api.measurement.mockResolvedValue(ok(created({ waistCm: 81, abdomenCm: 91 })));
    fireEvent.changeText(view.getByLabelText('Cintura'), '81'); fireEvent.changeText(view.getByLabelText('Abdomen'), '91');
    await act(async () => { fireEvent.press(view.getByRole('button', { name: 'Guardar' })); });
    await flush();
    expect(api.measurement).toHaveBeenCalledTimes(1);
    expect(api.measurement).toHaveBeenCalledWith({ operation: 'create', measurementId: null, expectedUpdatedAt: null, idempotencyKey: 'body:1',
      fields: { ...noValues, measuredOn: TODAY, waistCm: 81, abdomenCm: 91, condition: null, notes: null } });
  });
});

describe('historical edit', () => {
  const baseline = row('2026-10-01', { waistCm: 80, armRightCm: 31 });
  const older = row('2026-09-20', { waistCm: 82, armRightCm: 30, armLeftCm: 29 });
  it('opens the regions that hold a value, keeps the values, excludes itself from references and keeps delete', async () => {
    const { view } = await mount([baseline, older], c => c.openMeasurement(baseline));
    expect(region(view, 'Tronco').props.accessibilityState.expanded).toBe(true);
    expect(region(view, 'Brazos').props.accessibilityState.expanded).toBe(true);
    expect(region(view, 'Piernas').props.accessibilityState.expanded).toBe(false);
    expect(view.getByLabelText('Cintura').props.value).toBe('80');
    expect(view.getByLabelText('Brazo derecho').props.value).toBe('31');
    expect(view.getByLabelText('Brazo izquierdo').props.value).toBe('');
    expect(view.queryByText('Tus medidas habituales')).toBeNull();
    // Its own 80 is not "Anterior": only the older row (20 sep) is.
    expect(view.getByText('Anterior: 82 cm · 20 sep 2026')).toBeTruthy();
    expect(view.queryByText(/Anterior: 80 cm/)).toBeNull();
    expect(view.getByLabelText('Brazo izquierdo').props.accessibilityHint).toBe('Anterior: 29 cm · 20 sep 2026');
    expect(view.getByRole('button', { name: 'Eliminar medición' })).toBeTruthy();
    // Edit placeholder keeps the saved value as a grey hint.
    expect(view.getByLabelText('Brazo derecho').props.placeholder).toBe('31');
  });
  it('a region cleared by the user stays open (no collapse under the finger)', async () => {
    const { view } = await mount([baseline, older], c => c.openMeasurement(baseline));
    fireEvent.changeText(view.getByLabelText('Brazo derecho'), '');
    expect(region(view, 'Brazos').props.accessibilityState.expanded).toBe(true);
  });
});

describe('legacy record without sides', () => {
  const legacy = row('2026-10-01', {}, { armCm: 33, thighCm: 50, waistCm: 80 });
  it('keeps the (histórico) line, leaves the sided fields empty and never converts them', async () => {
    const only = { ...legacy, waistCm: null };
    const { view, controller } = await mount([only], c => c.openMeasurement(only));
    expect(view.getByText(/Brazo \(histórico\): 33 cm · Muslo \(histórico\): 50 cm · se conserva al guardar/)).toBeTruthy();
    for (const name of ['Tronco', 'Brazos', 'Piernas']) expect(region(view, name).props.accessibilityState.expanded).toBe(false);
    fireEvent.press(region(view, 'Brazos')); fireEvent.press(region(view, 'Piernas'));
    for (const label of ['Brazo derecho', 'Brazo izquierdo', 'Muslo derecho', 'Muslo izquierdo']) expect(view.getByLabelText(label).props.value).toBe('');
    expect(view.queryByText(/Anterior:/)).toBeNull();
    expect(draftOf(controller)).toMatchObject({ armRightCm: '', armLeftCm: '', thighRightCm: '', thighLeftCm: '' });
  });
});

describe('bilateral independence', () => {
  it('typing one side leaves the other empty and saves only that side', async () => {
    const { view, api } = await mount([]);
    api.measurement.mockResolvedValue(ok(created({ armRightCm: 31.5 })));
    fireEvent.press(region(view, 'Brazos'));
    fireEvent.changeText(view.getByLabelText('Brazo derecho'), '31,5');
    expect(view.getByLabelText('Brazo izquierdo').props.value).toBe('');
    await act(async () => { fireEvent.press(view.getByRole('button', { name: 'Guardar' })); });
    await flush();
    expect(api.measurement.mock.calls[0][0].fields).toEqual({ ...noValues, measuredOn: TODAY, armRightCm: 31.5, condition: null, notes: null });
  });
  it('a habitual side and its opposite side stay separate fields (right habitual, left under Brazos)', async () => {
    const history = ['2026-10-03', '2026-10-02', '2026-10-01'].map(d => row(d, { armRightCm: 31 }));
    const { view, controller } = await mount(history);
    expect(view.getAllByLabelText('Brazo derecho')).toHaveLength(1);
    expect(view.queryByLabelText('Brazo izquierdo')).toBeNull();
    fireEvent.press(region(view, 'Brazos'));
    expect(region(view, 'Brazos').props.accessibilityLabel).toBe('Brazos, 1 medida, ninguna con valor');
    expect(view.getByLabelText('Brazo izquierdo').props.value).toBe('');
    fireEvent.changeText(view.getByLabelText('Brazo izquierdo'), '30');
    expect(draftOf(controller)).toMatchObject({ armRightCm: '', armLeftCm: '30' });
  });
});

describe('date changes', () => {
  const history = [row('2026-10-03', { waistCm: 80 }), row('2026-10-01', { waistCm: 82 }), row('2026-09-20', { waistCm: 83 })];
  it('recompute the references (and habits) from the loaded history with no API call', async () => {
    const { view, controller, api } = await mount(history);
    expect(view.getByText('Anterior: 80 cm · 3 oct 2026')).toBeTruthy();
    const calls = () => [api.overview, api.weights, api.measurements, api.weight, api.measurement].map(m => m.mock.calls.length);
    const before = calls();
    act(() => controller.change('date', '02/10/2026'));
    expect(view.getByText('Anterior: 82 cm · 1 oct 2026')).toBeTruthy(); expect(view.queryByText(/3 oct 2026/)).toBeNull();
    act(() => controller.change('date', '01/09/2026')); // before everything the user ever recorded
    expect(view.queryByText(/Anterior:/)).toBeNull();
    expect(view.queryByText('Tus medidas habituales')).toBeNull();
    expect(region(view, 'Tronco').props.accessibilityState.expanded).toBe(true);
    act(() => controller.change('date', '')); // an incomplete date never errors
    expect(view.queryByText(/Anterior:/)).toBeNull();
    expect(calls()).toEqual(before);
  });
});

describe('close, errors and write states', () => {
  it('closing with typed values still asks first', async () => {
    const { view } = await mount([]);
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    fireEvent.changeText(view.getByLabelText('Cintura'), '81');
    fireEvent.press(view.getByRole('button', { name: 'Cerrar' }));
    expect(alert).toHaveBeenCalledWith('¿Descartar cambios?', 'Todavía no guardaste este registro.', expect.any(Array));
    expect(view.getByTestId('body-editor')).toBeTruthy();
  });
  it('a validation error inside a collapsed region expands it and shows the message', async () => {
    const { view, api } = await mount([]);
    fireEvent.press(region(view, 'Brazos'));
    fireEvent.changeText(view.getByLabelText('Brazo derecho'), 'abc');
    fireEvent.press(region(view, 'Brazos'));
    expect(view.queryByLabelText('Brazo derecho')).toBeNull();
    await act(async () => { fireEvent.press(view.getByRole('button', { name: 'Guardar' })); });
    expect(region(view, 'Brazos').props.accessibilityState.expanded).toBe(true);
    expect(view.getByText('Brazo derecho no es un número válido.')).toBeTruthy();
    expect(view.getByLabelText('Brazo derecho').props.value).toBe('abc');
    expect(api.measurement).not.toHaveBeenCalled();
  });
  it('an uncertain write keeps its status, the recovery button and the draft', async () => {
    const { view, api, controller } = await mount([]);
    api.measurement.mockResolvedValue(lost);
    fireEvent.changeText(view.getByLabelText('Cintura'), '81');
    await act(async () => { fireEvent.press(view.getByRole('button', { name: 'Guardar' })); });
    await flush();
    expect(view.getByText(/El resultado es incierto/)).toBeTruthy();
    expect(view.getByRole('button', { name: 'Comprobar' })).toBeTruthy();
    expect(view.getByLabelText('Cintura').props.editable).toBe(false);
    expect(draftOf(controller).waistCm).toBe('81');
  });
  it('a conflict keeps the draft, shows the message and offers the explicit review', async () => {
    const baseline = row('2026-10-01', { waistCm: 80 });
    const { view, api } = await mount([baseline], c => c.openMeasurement(baseline));
    api.measurement.mockResolvedValue(conflict('MEASUREMENT_CHANGED', 'La medición cambió desde que la abriste.'));
    fireEvent.changeText(view.getByLabelText('Cintura'), '79');
    await act(async () => { fireEvent.press(view.getByRole('button', { name: 'Guardar' })); });
    await flush();
    expect(view.getByText('La medición cambió desde que la abriste.')).toBeTruthy();
    expect(view.getByRole('button', { name: 'Revisar valores actuales' })).toBeTruthy();
    expect(view.getByLabelText('Cintura').props.value).toBe('79');
  });
});

describe('accessibility', () => {
  it('region and guide toggles are buttons that expose their expanded state', async () => {
    const { view, controller } = await mount([]);
    const brazos = region(view, 'Brazos');
    expect(brazos.props.accessibilityRole).toBe('button'); expect(brazos.props.accessibilityState).toMatchObject({ expanded: false });
    fireEvent.press(brazos);
    expect(region(view, 'Brazos').props.accessibilityState).toMatchObject({ expanded: true });
    const before = JSON.stringify(draftOf(controller));
    const guide = view.getByRole('button', { name: 'Cómo medir cintura' });
    expect(guide.props.accessibilityState).toMatchObject({ expanded: false });
    expect(view.queryByText(GUIDE_COMMON)).toBeNull();
    fireEvent.press(guide);
    expect(view.getByRole('button', { name: 'Cómo medir cintura' }).props.accessibilityState).toMatchObject({ expanded: true });
    expect(view.getByText('Medí al final de una exhalación normal.')).toBeTruthy();
    expect(view.getAllByText(GUIDE_COMMON)).toHaveLength(1);
    expect(JSON.stringify(draftOf(controller))).toBe(before); // the guide never touches the draft
    fireEvent.press(view.getByRole('button', { name: 'Cómo medir brazo' }));
    expect(view.getByText('Medí cada lado por separado.')).toBeTruthy();
  });
  it('a field exposes its label and the reference as hint, also as a visible footnote', async () => {
    const { view } = await mount([row('2026-10-01', { waistCm: 82.5 })]);
    const field = view.getByLabelText('Cintura');
    expect(field.props.accessibilityHint).toBe('Anterior: 82,5 cm · 1 oct 2026');
    expect(view.getByText('Anterior: 82,5 cm · 1 oct 2026')).toBeTruthy();
    expect(view.getByLabelText('Abdomen').props.accessibilityHint).toBeUndefined(); // no value → nothing, not "0"
    expect(field.props.value).toBe('');
  });
  it.each([[1, 'row'], [2, 'column']])('font scale %s lays a bilateral pair out as %s', async (fontScale, direction) => {
    const window = Dimensions.get('window');
    Dimensions.set({ window: { ...window, fontScale }, screen: Dimensions.get('screen') });
    const { view } = await mount([]);
    fireEvent.press(region(view, 'Brazos'));
    expect(StyleSheet.flatten(view.getByTestId('body-pair-arm').props.style).flexDirection).toBe(direction);
    expect(view.getByLabelText('Brazo derecho')).toBeTruthy(); expect(view.getByLabelText('Brazo izquierdo')).toBeTruthy();
  });
  it('works with Reduce Motion on', async () => {
    mockReduced = true;
    const { view } = await mount([]);
    fireEvent.press(region(view, 'Piernas'));
    fireEvent.press(view.getByRole('button', { name: 'Cómo medir muslo' }));
    expect(view.getByLabelText('Muslo derecho')).toBeTruthy(); expect(view.getByText(/justo debajo del pliegue del glúteo/)).toBeTruthy();
  });
});
