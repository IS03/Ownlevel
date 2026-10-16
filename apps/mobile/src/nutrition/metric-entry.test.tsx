import { act, fireEvent, render, renderHook } from '@testing-library/react-native';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { useSyncExternalStore } from 'react';
import { StyleSheet } from 'react-native';
import { withTiming } from 'react-native-reanimated';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { MobileNutritionDayResponse, NutritionDayMetric } from '@/api/nutrition-day';
import { AppSheet, AppText, OwnlevelThemeProvider } from '@/design-system';
import type { NutritionStoragePort } from './intent-repository';
import { DayWriteController, type DayWriteApi } from './day-write-controller';
import { DayWriteRepository } from './day-write-storage';
import { DayWriteEditor } from './day-write-editor';
import { nutritionFixture } from './day-fixture.test-helper';
import { NutritionDayPanel } from './day-panel';
import { MetricEntrySheet } from './metric-entry-sheet';
import { MetricSavedNotice } from './metric-notice';
import { useMetricEntry } from './use-metric-entry';
import { confirmedMetricUndo, metricEntryCandidate, metricRaw, quickMetricValue, sameMetricTimestamp } from './metric-entry-model';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('@/design-system/app-sheet',()=>{
 const React=jest.requireActual<typeof import('react')>('react');
 const {View}=jest.requireActual<typeof import('react-native')>('react-native');
 const Context=React.createContext<()=>void>(()=>{});
 return {AppSheet:({children,onClose,testID}:{children:React.ReactNode;onClose:()=>void;testID?:string})=><Context.Provider value={onClose}><View testID={testID}>{children}</View></Context.Provider>,useAppSheetDismiss:()=>{const close=React.useContext(Context);return(after?:()=>void)=>{close();after?.();};}};
});
jest.mock('@/training/exercise-segmented', () => ({
  ExerciseSegmented: (props: import('@/training/exercise-segmented').ExerciseSegmentedProps<string>) => {
    const { SegmentedControl } = jest.requireActual<typeof import('@/design-system')>('@/design-system');
    return <SegmentedControl {...props} />;
  },
}));
jest.mock('./metric-duration', () => jest.requireActual('./metric-duration.tsx'));
const date = '2026-10-02', meta = { durationMs: 1, httpStatus: 200, outcome: 'ok' as const };
const failure = { status: 'unavailable' as const, reason: 'network' as const, meta: { ...meta, outcome: 'unavailable' as const } };
const conflict = { status: 'conflict' as const, code: 'METRICS_CHANGED' as const, message: 'El valor cambió en otro dispositivo.', meta: { ...meta, httpStatus: 409, outcome: 'conflict' as const } };
const metricId = '41100000-0000-4000-8000-000000000003';
function setup(value: number | null = 0.5, type: NutritionDayMetric['valueType'] = 'decimal', target: number | null = 2) {
  let current = nutritionFixture(), revision = 0;
  if (current.activity.status === 'ok') {
    current.activity.data.metrics[0] = { ...current.activity.data.metrics[0], value, valueType: type, target,
      label: type === 'duration' ? 'Sueño' : type === 'integer' ? 'Pasos' : 'Agua', unit: type === 'integer' ? 'pasos' : type === 'duration' ? 'min' : 'L', systemKey: type === 'integer' ? 'steps' : type === 'duration' ? 'sleep' : 'water', updatedAt: value === null ? null : `${date}T12:00:00.000001Z` };
    current.activity.data.metrics.push({ ...current.activity.data.metrics[0], id: '41100000-0000-4000-8000-000000000004', label: 'Otra métrica', value: 100, updatedAt: `${date}T12:00:00.000001Z`, unit: '', valueType: 'integer', systemKey: null });
  }
  const map = new Map<string, string>();
  const port: NutritionStoragePort = { getItem: async key => map.get(key) ?? null, setItem: async (key, value) => { map.set(key, value); }, removeItem: async key => { map.delete(key); } };
  const apply = (value: number | null) => {
    current = JSON.parse(JSON.stringify(current));
    if (current.activity.status === 'ok') { current.activity.data.metrics[0].value = value; current.activity.data.metrics[0].updatedAt = value === null ? null : `${date}T13:00:00.${String(++revision).padStart(6, '0')}Z`; }
  };
  const read = jest.fn<DayWriteApi['read']>().mockImplementation(async () => ({ status: 'ok', data: JSON.parse(JSON.stringify(current)), meta }));
  const mutate = jest.fn<DayWriteApi['mutate']>().mockImplementation(async intent => {
    expect(intent.operation).toBe('metrics');
    if (intent.operation !== 'metrics' || current.activity.status !== 'ok') throw new Error('Unexpected operation');
    expect(intent.changes).toHaveLength(1); expect(intent.changes[0].metricId).toBe(metricId);
    if (intent.changes[0].expectedUpdatedAt !== current.activity.data.metrics[0].updatedAt) return conflict;
    apply(intent.changes[0].value);
    return { status: 'ok', data: { status: 'saved', operation: 'metrics', date }, meta };
  });
  let key = 0;
  const repository = new DayWriteRepository(port, 'owner');
  const controller = new DayWriteController({ mutate, read }, repository, jest.fn(), () => `metric:${++key}`);
  return { controller, repository, mutate, read, apply, data: () => current };
}
function Harness({ f }: { f: ReturnType<typeof setup> }) {
  const state = useSyncExternalStore(f.controller.subscribe, f.controller.getSnapshot);
  const entry = useMetricEntry(f.controller, date);
  return <>
    <NutritionDayPanel data={f.data()} onDetail={() => f.controller.open('metrics', f.data())} onMetric={entry.open} />
    {entry.entry && state.draft ? <MetricEntrySheet id={entry.entry.id} controller={f.controller} state={state} onClose={entry.close} /> : null}
    {!entry.entry && !(entry.undoing && state.phase === 'pending') ? <DayWriteEditor controller={f.controller} state={state} /> : null}
    {state.message && !state.draft && !entry.feedbackHandled ? <AppText>{state.message}</AppText> : null}
    {entry.notice ? <MetricSavedNotice notice={entry.notice} disabled={state.phase !== 'idle'} onUndo={entry.undoNotice} onClose={entry.dismissNotice} /> : null}
  </>;
}
async function open(f = setup()) {
  await f.controller.initialize();
  const view = render(<SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, bottom: 34, left: 0, right: 0 } }}><OwnlevelThemeProvider initialMode="light"><Harness f={f} /></OwnlevelThemeProvider></SafeAreaProvider>);
  await act(async () => { fireEvent.press(view.getByTestId(`nutrition-metric-${metricId}`)); });
  return { f, view };
}
const save = async (view: Awaited<ReturnType<typeof open>>['view'], label = 'Agua') => { await act(async () => { fireEvent.press(view.getByLabelText(`Guardar ${label}`)); }); };
beforeEach(() => { jest.clearAllMocks(); });
it('opts the shared Home/Nutrition metric sheet into closing its keyboard at the start of the exit', async () => {
  const { view } = await open();
  expect(view.UNSAFE_getByType(AppSheet).props.dismissKeyboardOnClose).toBe(true);
  expect(view.UNSAFE_getByType(AppSheet).props.keyboardHeight).toBeDefined();
  expect(view.UNSAFE_getByType(AppSheet).props.onShow).toEqual(expect.any(Function));
  expect(view.getByLabelText('Valor de Agua').props.autoFocus).toBe(false);
});
it('gives Nutrition panel presses a wider, subtler fading highlight without moving the content', async () => {
  const { view } = await open();
  const cell = view.getByTestId(`nutrition-metric-${metricId}`);
  const highlight = view.getByTestId(`nutrition-panel-highlight-${metricId}`, { includeHiddenElements: true });
  expect(StyleSheet.flatten(highlight.props.style)).toMatchObject({ top: -8, bottom: -8, left: -8, right: -8, opacity: 0 });
  expect(highlight.props.pointerEvents).toBe('none');
  expect(highlight.props.accessibilityElementsHidden).toBe(true);
  expect(StyleSheet.flatten(cell.props.style).backgroundColor).toBeUndefined();
  jest.mocked(withTiming).mockClear();
  fireEvent(cell, 'pressIn');
  expect(withTiming).toHaveBeenCalledWith(0.3, { duration: 200, reduceMotion: expect.anything() });
  fireEvent(cell, 'pressOut');
  expect(withTiming).toHaveBeenCalledWith(0, { duration: 200, reduceMotion: expect.anything() });
});
describe('quick entry uses the same durable day writer and exact undo',()=>{
 const first=(f:ReturnType<typeof setup>)=>{const d=f.data();if(d.activity.status!=='ok')throw new Error('Missing fixture');return d.activity.data.metrics[0];};
 it.each([null,0,1.5])('creates or adds to the displayed value %s, and undo restores missing rather than zero',async(value)=>{
  const f=setup(value);await f.controller.initialize();
  const hook=renderHook(()=>useMetricEntry(f.controller,date));
  await act(async()=>{await hook.result.current.quick(f.data(),first(f),0.25);});
  expect(f.mutate).toHaveBeenCalledTimes(1);expect(first(f).value).toBe((value??0)+0.25);
  expect(hook.result.current.notice?.undo?.before.value).toBe(value);
  await act(async()=>{hook.result.current.undoNotice();});
  expect(first(f).value).toBe(value);
  expect(f.mutate.mock.calls[1][0]).toMatchObject({operation:'metrics',changes:[{metricId,value}]});
 });
 it('blocks consecutive taps before persistence/network finishes, without losing or doubling an accepted sum',async()=>{
  const f=setup(1);await f.controller.initialize();
  const hook=renderHook(()=>useMetricEntry(f.controller,date));
  const original=f.mutate.getMockImplementation()!;
  let release!:()=>void;
  f.mutate.mockImplementationOnce(async i=>{await new Promise<void>(r=>{release=r;});return original(i);});
  let pending!:Promise<boolean>;
  await act(async()=>{pending=hook.result.current.quick(f.data(),first(f),0.25);});
  await act(async()=>{expect(await hook.result.current.quick(f.data(),first(f),0.25)).toBe(false);});
  expect(f.mutate).toHaveBeenCalledTimes(1);
  await act(async()=>{release();await pending;});expect(first(f).value).toBe(1.25);
 });
 it('a competing update conflicts, reads truth and never retries the addition automatically',async()=>{
  const f=setup(1),old=f.data();await f.controller.initialize();
  const hook=renderHook(()=>useMetricEntry(f.controller,date));
  f.apply(2);
  await act(async()=>{await hook.result.current.quick(old,old.activity.status==='ok'?old.activity.data.metrics[0]:first(f),0.25);});
  expect(f.controller.getSnapshot().phase).toBe('conflict');expect(first(f).value).toBe(2);
  expect(f.mutate).toHaveBeenCalledTimes(1);expect(hook.result.current.notice).toBeNull();
 });
 it('an uncertain quick entry preserves the same idempotency key and recovery uses the same body',async()=>{
  const f=setup(1);await f.controller.initialize();const hook=renderHook(()=>useMetricEntry(f.controller,date));
  f.mutate.mockResolvedValueOnce(failure);
  await act(async()=>{await hook.result.current.quick(f.data(),first(f),0.25);});
  const stored=await f.repository.read();expect(stored).not.toBeNull();
  await act(async()=>{await f.controller.recover();});
  expect(f.mutate.mock.calls[1][0]).toEqual(stored!.intent);expect(first(f).value).toBe(1.25);
 });
 it('decimal arithmetic is exact, duration portions integral, timestamp comparison retains microseconds',()=>{
  const m=first(setup(0.1));expect(quickMetricValue(m,0.2)).toBe(0.3);
  expect(quickMetricValue({...m,valueType:'duration'},0.5)).toBeUndefined();
  expect(quickMetricValue(m,0)).toBeUndefined();
  expect(sameMetricTimestamp('2026-10-02T12:00:00.000001Z','2026-10-02T09:00:00.000001-03:00')).toBe(true);
  expect(sameMetricTimestamp('2026-10-02T12:00:00.000001Z','2026-10-02T12:00:00.000002Z')).toBe(false);
 });
});

describe('individual metric sheet and existing writer', () => {
  it('opens only that metric, previews comma addition, closes without saving', async () => {
    const { f, view } = await open();
    expect(view.getByTestId('nutrition-metric-sheet')).toBeTruthy();
    expect(view.queryByTestId('nutrition-day-write-editor')).toBeNull();
    fireEvent.changeText(view.getByLabelText('Valor de Agua'), '0,25');
    expect(view.getByText('Quedaría en 0,75 L')).toBeTruthy();
    expect(view.getByLabelText('Guardar Agua').props.accessibilityState.disabled).toBe(false);
    fireEvent.press(view.getByLabelText('Cerrar Agua sin guardar'));
    expect(view.queryByTestId('nutrition-metric-sheet')).toBeNull(); expect(f.mutate).not.toHaveBeenCalled(); expect(await f.repository.read()).toBeNull();
  });
  it('sends a single CAS change, confirms it and undoes with the new version and a new key', async () => {
    const { f, view } = await open();
    fireEvent.changeText(view.getByLabelText('Valor de Agua'), '0,25'); await save(view);
    await view.findByTestId('nutrition-metric-notice');
    const first = f.mutate.mock.calls[0][0];
    expect(first).toMatchObject({ operation: 'metrics', changes: [{ metricId, value: 0.75, expectedUpdatedAt: `${date}T12:00:00.000001Z` }] });
    expect(view.queryByTestId('nutrition-metric-sheet')).toBeNull();
    await act(async () => { fireEvent.press(view.getByLabelText('Deshacer cambio de métrica')); });
    const second = f.mutate.mock.calls[1][0];
    expect(second).toMatchObject({ changes: [{ value: 0.5, expectedUpdatedAt: `${date}T13:00:00.000001Z` }] });
    expect(second.idempotencyKey).not.toBe(first.idempotencyKey); expect(f.data().activity).toMatchObject({ data: { metrics: [{ value: 0.5 }, { value: 100 }] } });
    expect(view.getByText('Agua: 0,5 L · deshecho')).toBeTruthy(); expect(view.queryByText('Deshacer')).toBeNull();
    fireEvent.press(view.getByLabelText('Cerrar aviso de métrica'));
    expect(view.queryByText('Cambios guardados.')).toBeNull();
  });
  it('starts missing values in replace, omits add/target, and can save zero then undo to null', async () => {
    const { f, view } = await open(setup(null, 'decimal', null));
    expect(view.queryByText('Sumar a hoy')).toBeNull(); expect(view.queryByText('Quitar el valor de hoy')).toBeNull();
    expect(view.getByText('Viernes 2 · sin dato hoy')).toBeTruthy();
    expect(view.getByLabelText('Guardar Agua').props.accessibilityState.disabled).toBe(true);
    fireEvent.changeText(view.getByLabelText('Valor de Agua'), '0'); await save(view);
    await view.findByText('Agua: 0 L');
    await act(async () => { fireEvent.press(view.getByLabelText('Deshacer cambio de métrica')); });
    expect(f.mutate.mock.calls[1][0]).toMatchObject({ changes: [{ value: null }] });
    expect(await view.findByText('Agua: Sin dato · deshecho')).toBeTruthy();
  });
  it.each([null, 0, 0.5])('never offers to clear the value %s from the shared metric sheet', async value => {
    const { f, view } = await open(setup(value));
    expect(view.queryByText(/Quitar el valor/)).toBeNull();
    expect(view.queryByRole('button', { name: /Quitar el valor/ })).toBeNull();
    expect(view.getByLabelText('Guardar Agua').props.accessibilityState.disabled).toBe(true);
    expect(f.mutate).not.toHaveBeenCalled();
  });
  it('still allows manual replacement with zero and undo restores the exact previous value', async () => {
    const { f, view } = await open(setup(0.5));
    fireEvent.press(view.getByText('Reemplazar'));
    fireEvent.changeText(view.getByLabelText('Valor de Agua'), '0');
    await save(view);
    expect(f.mutate.mock.calls[0][0]).toMatchObject({ changes: [{ value: 0 }] });
    await view.findByTestId('nutrition-metric-notice');
    await act(async () => { fireEvent.press(view.getByLabelText('Deshacer cambio de métrica')); });
    expect(f.mutate.mock.calls[1][0]).toMatchObject({ changes: [{ value: 0.5, expectedUpdatedAt: `${date}T13:00:00.000001Z` }] });
  });
  it('replacement is absolute; blank, fractional integers and unchanged values cannot save', async () => {
    const { f, view } = await open(setup(100, 'integer'));
    fireEvent.press(view.getByText('Reemplazar'));
    expect(view.getByLabelText('Valor de Pasos').props.keyboardType).toBe('number-pad');
    expect(view.getByLabelText('Guardar Pasos').props.accessibilityState.disabled).toBe(true);
    for (const raw of ['', '2,5', '-2', '2147483648']) {
      fireEvent.changeText(view.getByLabelText('Valor de Pasos'), raw);
      expect(view.getByLabelText('Guardar Pasos').props.accessibilityState.disabled).toBe(true);
    }
    fireEvent.changeText(view.getByLabelText('Valor de Pasos'), '250'); await save(view, 'Pasos');
    expect(f.mutate.mock.calls[0][0]).toMatchObject({ changes: [{ value: 250 }] });
  });
  it('starts empty behind a grey placeholder in both modes, so typing never keeps a leading zero', async () => {
    const { view } = await open(setup(100, 'integer'));
    const input = () => view.getByLabelText('Valor de Pasos');
    expect(input().props.value).toBe(''); expect(input().props.placeholder).toBe('0');
    expect(view.getByText('Escribí cuánto sumar')).toBeTruthy();
    fireEvent.changeText(input(), '500');
    expect(input().props.value).toBe('500'); expect(view.getByText('Quedaría en 600 pasos')).toBeTruthy();
    fireEvent.press(view.getByText('Reemplazar'));
    expect(input().props.value).toBe(''); expect(input().props.placeholder).toBe('100');
    expect(view.getByText('Escribí el nuevo valor')).toBeTruthy();
  });
  it('duration input converts hours/minutes into canonical minutes', async () => {
    const { f, view } = await open(setup(60, 'duration'));
    fireEvent.changeText(view.getByLabelText('Horas'), '0'); fireEvent.changeText(view.getByLabelText('Minutos'), '30');
    expect(view.getByText('Quedaría en 1 h 30 min')).toBeTruthy(); await save(view, 'Sueño');
    expect(f.mutate.mock.calls[0][0]).toMatchObject({ changes: [{ value: 90 }] });
  });
  it('keeps ambiguous writes locked and explicitly recovers the same key and payload', async () => {
    const f = setup(); f.mutate.mockResolvedValueOnce(failure);
    const { view } = await open(f); fireEvent.changeText(view.getByLabelText('Valor de Agua'), '0,25'); await save(view);
    expect(await view.findByText('Comprobar cambio')).toBeTruthy();
    expect(view.getByLabelText('Guardar Agua').props.accessibilityState.disabled).toBe(true);
    expect(view.queryByTestId('nutrition-metric-notice')).toBeNull();
    await act(async () => { fireEvent.press(view.getByText('Comprobar cambio')); });
    expect(f.mutate.mock.calls[1][0]).toEqual(f.mutate.mock.calls[0][0]); await view.findByTestId('nutrition-metric-notice');
  });
  it('confirmed saves with failed rereads offer read recovery, never another write or early undo', async () => {
    const f = setup(); f.read.mockResolvedValueOnce(failure);
    const { view } = await open(f); fireEvent.changeText(view.getByLabelText('Valor de Agua'), '0,25'); await save(view);
    expect(await view.findByText('Actualizar el día')).toBeTruthy(); expect(view.queryByText('Deshacer')).toBeNull();
    await act(async () => { fireEvent.press(view.getByText('Actualizar el día')); });
    expect(f.mutate).toHaveBeenCalledTimes(1); await view.findByText('Deshacer');
  });
  it('recomputes addition only after explicit conflict review and requires another save', async () => {
    const f = setup(); f.mutate.mockImplementationOnce(async () => { f.apply(2); return conflict; });
    const { view } = await open(f); fireEvent.changeText(view.getByLabelText('Valor de Agua'), '0,25'); await save(view);
    expect(await view.findByText('Ahora: 2 L')).toBeTruthy();
    await act(async () => { fireEvent.press(view.getByText('Revisar lo que escribí')); });
    expect(f.mutate).toHaveBeenCalledTimes(1); expect(view.getByText('Quedaría en 2,25 L')).toBeTruthy();
    await save(view); expect(f.mutate.mock.calls[1][0]).toMatchObject({ changes: [{ value: 2.25, expectedUpdatedAt: `${date}T13:00:00.000001Z` }] });
  });
  it('undo conflicts preserve a later server value and expose the existing conflict editor', async () => {
    const { f, view } = await open(); fireEvent.changeText(view.getByLabelText('Valor de Agua'), '0,25'); await save(view);
    await view.findByTestId('nutrition-metric-notice'); f.apply(3);
    await act(async () => { fireEvent.press(view.getByLabelText('Deshacer cambio de métrica')); });
    expect(await view.findByTestId('nutrition-day-write-editor')).toBeTruthy();
    expect(f.controller.getSnapshot().phase).toBe('conflict'); expect(f.data().activity).toMatchObject({ data: { metrics: [{ value: 3 }, { value: 100 }] } });
    expect(f.mutate).toHaveBeenCalledTimes(2);
  });
});

describe('metric entry bounds and undo guards', () => {
  it('keeps four-decimal addition exact and rejects overflow', () => {
    const f = setup(0.1), data = f.data();
    expect(metricEntryCandidate(data, metricId, 'add', metricRaw(0.2, false))).toMatchObject({ value: 0.3, valid: true });
    expect(metricEntryCandidate(data, metricId, 'add', metricRaw(9999999999.9999, false))).toMatchObject({ valid: false });
  });
  it('does not offer undo over a newer value or changed metric definition', () => {
    const f = setup(), baseline = f.data();
    const metric = baseline.activity.status === 'ok' ? baseline.activity.data.metrics[0] : null;
    const intent = { operation: 'metrics' as const, date, idempotencyKey: 'save', changes: [{ metricId, definitionUpdatedAt: metric!.definitionUpdatedAt!, expectedUpdatedAt: metric!.updatedAt, value: 0.75 }] };
    f.apply(1); expect(confirmedMetricUndo(intent, baseline, f.data())).toBeNull();
    f.apply(0.75); if (f.data().activity.status === 'ok') (f.data().activity as Extract<MobileNutritionDayResponse['activity'], { status: 'ok' }>).data.metrics[0].unit = 'ml';
    expect(confirmedMetricUndo(intent, baseline, f.data())).toBeNull();
  });
  it('cancelling an undo conflict releases the pending UI before another editor is opened', async () => {
    const f = setup(); await f.controller.initialize();
    const hook = renderHook(() => useMetricEntry(f.controller, date));
    await act(async () => { hook.result.current.open(f.data(), (f.data().activity as Extract<MobileNutritionDayResponse['activity'], { status: 'ok' }>).data.metrics[0]); });
    await act(async () => { f.controller.changeMetric(metricId, 'value', '0,75'); await f.controller.save(); });
    f.apply(3);
    await act(async () => { hook.result.current.undoNotice(); });
    expect(f.controller.getSnapshot().phase).toBe('conflict'); expect(hook.result.current.undoing).toBe(true);
    await act(async () => { f.controller.close(); });
    expect(hook.result.current.undoing).toBe(false);
    await act(async () => { f.controller.open('context', f.data()); });
    expect(hook.result.current.entry).toBeNull(); expect(hook.result.current.undoing).toBe(false);
  });
  it('confirmation observers cannot turn a successful write into a failed write', async () => {
    const f = setup(); await f.controller.initialize(); f.controller.subscribeConfirmed(() => { throw new Error('UI observer'); });
    f.controller.open('metrics', f.data()); f.controller.changeMetric(metricId, 'value', '0,75'); await f.controller.save();
    expect(f.controller.getSnapshot().phase).toBe('idle'); expect(await f.repository.read()).toBeNull();
  });
});
