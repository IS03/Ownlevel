import { act, fireEvent, render, waitFor, within } from '@testing-library/react-native';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { AccessibilityInfo, Dimensions, SectionList } from 'react-native';
import { OwnlevelThemeProvider } from '@/design-system';
import type { QuickOption, QuickOptions, QuickPins } from '@/api/nutrition-quick';
import type { MobileApiReadResult } from '@/api/results';
import { QuickEditor } from './quick-editor';
import { QuickController, type QuickApi } from './quick-controller';
import { QuickIntentRepository } from './quick-storage';
import { QuickPinsController, type QuickPinsApi } from './quick-pins-controller';
import { QuickPinsIntentRepository, quickPinsStorageKey } from './quick-pins-storage';
import { quickDate, quickPreview, quickReceipt } from './quick-fixture.test-helper';
import { nutritionFixture } from './day-fixture.test-helper';
import { BASE, ID, meal, meta, names, ok, snap, storage, synthetic } from './quick-library-fixture.test-helper';

jest.mock('./day-resource', () => ({ useNutritionDayResource: () => ({ state: { status: 'loading' } }) }));
jest.mock('@/api', () => ({ useMobileApi: () => ({ client: null }) }));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
// The app sheet's exit animation never completes in jest: its dismiss runs «beforeDismiss» like the real one, then closes.
jest.mock('@/design-system', () => {
  const React = jest.requireActual<typeof import('react')>('react'), { View } = jest.requireActual<typeof import('react-native')>('react-native');
  const Close = React.createContext<(mockAfter?: () => void) => void>(() => {});
  return { ...jest.requireActual<object>('@/design-system'),
    AppSheet: ({ children, onClose, beforeDismiss, locked, testID }: { children: React.ReactNode; onClose: () => void; beforeDismiss?: (mockProceed: () => void) => void; locked?: boolean; testID?: string }) =>
      <Close.Provider value={mockAfter => { if (locked) return; if (mockAfter) { onClose(); mockAfter(); } else (beforeDismiss ?? (mockProceed => mockProceed()))(onClose); }}><View testID={testID}>{children}</View></Close.Provider>,
    useAppSheetDismiss: () => React.useContext(Close) };
});

// #303 · Rápido: a read that starts while confirmed meals are on screen is a quiet refresh, never a blank loader.
// Real QuickController + QuickPinsController over in-memory APIs; the options() promise is controlled by the test.
type Read = MobileApiReadResult<QuickOptions>;
const lost: Read = { status: 'unavailable', reason: 'network', meta: { ...meta, httpStatus: null, outcome: 'unavailable' } };
const LOADER = 'Cargando opciones rápidas', REFRESHING = 'quick-options-refreshing', SLOT = 'quick-options-refresh-slot';
const STALE_ROWS = 'No pudimos actualizar. Mostramos lo último que cargó.';
function deferred() { let resolve!: (value: Read) => void; let reject!: (error: Error) => void; const promise = new Promise<Read>((res, rej) => { resolve = res; reject = rej; }); return { promise, resolve, reject }; }
const original = { window: Dimensions.get('window'), screen: Dimensions.get('screen') };
const atFontScale = (fontScale: number) => Dimensions.set({ window: { ...original.window, fontScale }, screen: original.screen });
const originalFetch = globalThis.fetch;
let fetchSpy: jest.Mock;
// The RN jest environment defaults to fontScale 2: the tests set the size they mean.
beforeEach(() => { atFontScale(1); fetchSpy = jest.fn(); globalThis.fetch = fetchSpy as unknown as typeof fetch; });
afterEach(() => { jest.restoreAllMocks(); Dimensions.set(original); globalThis.fetch = originalFetch; });

type Setup = { meals?: QuickOption[]; pins?: QuickPins; suggested?: QuickOption[]; suggestions?: boolean; intent?: unknown; options?: Partial<QuickOptions>; hold?: boolean };
/** The library over real controllers. `hold`: the very first read of the first open stays pending until `first.resolve(...)`. */
async function harness({ meals = BASE, pins = ok(snap(0, [])) as QuickPins, suggested = [], suggestions = false, intent, options: over = {}, hold = false }: Setup = {}) {
  const shared = storage();
  if (intent) shared.map.set(quickPinsStorageKey('owner'), JSON.stringify(intent));
  const data: QuickOptions = { today: quickDate, saved: { status: 'ok', items: meals }, suggested: { status: 'ok', items: suggested }, pins, ...over };
  const quickApi = { options: jest.fn<QuickApi['options']>().mockResolvedValue({ status: 'ok', data, meta }),
    preview: jest.fn<QuickApi['preview']>().mockImplementation(async s => ({ status: 'ok', data: quickPreview(s), meta })),
    confirm: jest.fn<QuickApi['confirm']>().mockResolvedValue({ status: 'ok', data: quickReceipt, meta }),
    read: jest.fn<QuickApi['read']>().mockImplementation(async d => ({ status: 'ok', data: nutritionFixture(d), meta })) };
  const pinsApi = { write: jest.fn<QuickPinsApi['write']>().mockImplementation(async w => ({ status: 'ok', data: snap(w.expectedRevision + 1, w.savedMealIds), meta })),
    read: jest.fn<QuickPinsApi['read']>().mockResolvedValue({ status: 'ok', data, meta }) };
  const first = deferred();
  if (hold) quickApi.options.mockImplementationOnce(() => first.promise);
  const quick = new QuickController(quickApi, new QuickIntentRepository(shared.port, 'owner'), () => {});
  const pinsController = new QuickPinsController(pinsApi, new QuickPinsIntentRepository(shared.port, 'owner'), () => 'pins-key');
  const ui = () => <OwnlevelThemeProvider initialMode="light"><QuickEditor suggestions={suggestions} controller={quick} state={quick.getSnapshot()} pins={{ controller: pinsController, state: pinsController.getSnapshot() }} /></OwnlevelThemeProvider>;
  const view = render(ui());
  quick.subscribe(() => view.rerender(ui())); pinsController.subscribe(() => view.rerender(ui()));
  await act(async () => { await quick.initialize(); await pinsController.initialize(); quick.open(quickDate); });
  if (!hold) { await waitFor(() => expect(quick.getSnapshot().options).not.toBeNull()); act(() => { pinsController.adopt(quick.getSnapshot().options!.pins); }); }
  /** Starts a read the way the foreground refresh and the retry do (loadOptions on an open sheet); it stays pending. */
  const refresh = () => { const next = deferred(); quickApi.options.mockImplementationOnce(() => next.promise); act(() => { void quick.loadOptions(); }); return next; };
  const settle = async (next: ReturnType<typeof deferred>, result: Read) => { await act(async () => { next.resolve(result); }); };
  const good = (patch: Partial<QuickOptions> = {}): Read => ({ status: 'ok', data: { ...data, ...patch }, meta });
  return { view, quick, quickApi, pins: pinsController, pinsApi, shared, first, refresh, settle, good, data };
}
type H = Awaited<ReturnType<typeof harness>>;
const loader = (h: H) => h.view.queryByLabelText(LOADER);
const refreshing = (h: H) => h.view.queryByTestId(REFRESHING);

describe('#303 · first read with nothing confirmed keeps the loader', () => {
  it('options null + loading: the big loader, no refreshing row and no reserved slot; then the rows replace it', async () => {
    const h = await harness({ hold: true });
    expect(h.quick.getSnapshot()).toMatchObject({ options: null, optionsLoading: true });
    expect(loader(h)).toBeTruthy(); expect(h.view.getByTestId('quick-options-skeleton')).toBeTruthy();
    expect(refreshing(h)).toBeNull(); expect(h.view.queryByTestId(SLOT)).toBeNull(); expect(names(h.view)).toEqual([]);
    await h.settle(h.first, h.good());
    expect(loader(h)).toBeNull(); expect(refreshing(h)).toBeNull();
    expect(names(h.view)).toHaveLength(6);
    // Rows are there, nothing is refreshing: there is no reserved slot.
    expect(h.view.queryByTestId(SLOT)).toBeNull(); expect(h.quickApi.options).toHaveBeenCalledTimes(1);
  });
  it('first read that fails: the old text, no «últimas confirmadas», the same retry; the retry keeps the loader until it answers', async () => {
    const h = await harness({ hold: true });
    await h.settle(h.first, lost);
    expect(h.quick.getSnapshot()).toMatchObject({ options: null, optionsError: true });
    expect(h.view.getByText('No pudimos actualizar las opciones.')).toBeTruthy(); expect(h.view.queryByText(/desactualizadas/)).toBeNull();
    expect(h.view.queryByTestId(SLOT)).toBeNull();
    const next = h.refresh();
    expect(loader(h)).toBeTruthy(); expect(refreshing(h)).toBeNull(); expect(h.view.queryByTestId(SLOT)).toBeNull();
    await h.settle(next, h.good());
    expect(loader(h)).toBeNull(); expect(names(h.view)).toHaveLength(6); expect(h.quickApi.options).toHaveBeenCalledTimes(2);
  });
  it('saved meals unavailable with no suggestions shown: no confirmed section, so the retry shows the loader as today', async () => {
    const h = await harness({ options: { saved: { status: 'unavailable' } } });
    expect(h.view.getByText('No pudimos cargar estas opciones.')).toBeTruthy(); expect(h.view.queryByTestId(SLOT)).toBeNull();
    const next = h.refresh();
    expect(loader(h)).toBeTruthy(); expect(refreshing(h)).toBeNull();
    await h.settle(next, h.good({ saved: { status: 'ok', items: BASE } })); expect(loader(h)).toBeNull(); expect(names(h.view)).toHaveLength(6);
  });
  it('suggestions on but unavailable too: still nothing confirmed, the loader stays', async () => {
    const h = await harness({ suggestions: true, options: { saved: { status: 'unavailable' }, suggested: { status: 'unavailable' } } });
    const next = h.refresh();
    expect(loader(h)).toBeTruthy(); expect(refreshing(h)).toBeNull();
    await h.settle(next, h.good());
  });
});

describe('#303 · refreshing with confirmed meals on screen', () => {
  it('no loader: the same rows, query and list stay mounted; with no background status', async () => {
    const h = await harness({ pins: ok(snap(1, [ID(6)])) });
    fireEvent.changeText(h.view.getByLabelText('Buscar en tus comidas'), 'con');
    const list = h.view.UNSAFE_getByType(SectionList);
    const before = names(h.view).map(name => h.view.getByLabelText(`Revisar ${name}`));
    expect(names(h.view)).toEqual(['Avena con banana', 'Café con leche', 'Tostadas con palta']);

    const next = h.refresh();
    expect(h.quick.getSnapshot().optionsLoading).toBe(true);
    expect(loader(h)).toBeNull(); expect(h.view.queryByText(LOADER)).toBeNull();
    expect(h.view.queryByText('Actualizando…')).toBeNull(); expect(refreshing(h)).toBeNull();
    // Nothing remounted or reset.
    expect(h.view.UNSAFE_getByType(SectionList)).toBe(list);
    expect(names(h.view).map(name => h.view.getByLabelText(`Revisar ${name}`))).toEqual(before);
    names(h.view).forEach((name, i) => expect(h.view.getByLabelText(`Revisar ${name}`)).toBe(before[i]));
    expect(h.view.getByLabelText('Buscar en tus comidas').props.value).toBe('con');
    expect(h.view.getByText('3 resultados')).toBeTruthy();
    expect(h.view.queryByTestId(SLOT)).toBeNull();

    await h.settle(next, h.good());
    expect(refreshing(h)).toBeNull(); expect(loader(h)).toBeNull();
    expect(h.view.queryByTestId(SLOT)).toBeNull();
    expect(h.view.UNSAFE_getByType(SectionList)).toBe(list);
    names(h.view).forEach((name, i) => expect(h.view.getByLabelText(`Revisar ${name}`)).toBe(before[i]));
    expect(h.view.getByLabelText('Buscar en tus comidas').props.value).toBe('con');
  });
  it('#516 · a draft in «Administrar fijadas» survives a refresh untouched, and nothing is written', async () => {
    const h = await harness({ pins: ok(snap(1, [ID(6)])) });
    fireEvent.press(h.view.getByTestId('quick-pins-manage'));
    const sheet = () => within(h.view.getByTestId('quick-pins-editor'));
    fireEvent.press(sheet().getByTestId(`quick-pins-choice-${ID(2)}`));
    const next = h.refresh();
    await h.settle(next, h.good());
    expect(sheet().queryAllByTestId(/^quick-pins-draft-label-/).map(node => node.props.accessibilityLabel)).toEqual(['Café con leche, 1 de 2', 'Avena con banana, 2 de 2']);
    expect(h.pinsApi.write).not.toHaveBeenCalled(); expect(h.pinsApi.read).not.toHaveBeenCalled();
  });
  it('rows stay usable while refreshing: + still registers once', async () => {
    const h = await harness({ pins: ok(snap(0, [])) });
    const next = h.refresh();
    expect(h.view.getByLabelText('Agregar Pollo al horno').props.accessibilityState).toMatchObject({ disabled: false });
    await act(async () => { fireEvent.press(h.view.getByLabelText('Agregar Pollo al horno')); });
    await waitFor(() => expect(h.quickApi.confirm).toHaveBeenCalledTimes(1));
    expect(h.quickApi.confirm.mock.calls[0]![0].source).toMatchObject({ id: ID(5) });
    await h.settle(next, h.good());
  });
  it('a refresh that brings changes updates the rows; the indicator is gone', async () => {
    const h = await harness();
    const next = h.refresh();
    await h.settle(next, h.good({ saved: { status: 'ok', items: [...BASE, meal(7, 'Arroz con pollo')] } }));
    expect(refreshing(h)).toBeNull(); expect(names(h.view)).toContain('Arroz con pollo'); expect(names(h.view)).toHaveLength(7);
  });
  it('closing and reopening the sheet with options already held: no loader at all, one read per open', async () => {
    const h = await harness();
    await act(async () => { h.quick.close(); });
    const next = deferred(); h.quickApi.options.mockImplementationOnce(() => next.promise);
    await act(async () => { h.quick.open(quickDate); });
    expect(h.quick.getSnapshot()).toMatchObject({ optionsLoading: true }); expect(h.quick.getSnapshot().options).not.toBeNull();
    expect(loader(h)).toBeNull(); expect(refreshing(h)).toBeNull(); expect(names(h.view)).toHaveLength(6);
    await h.settle(next, h.good());
    expect(refreshing(h)).toBeNull(); expect(h.quickApi.options).toHaveBeenCalledTimes(2);
  });
  it.each([0, 1, 200])('%i saved meals: no crash, no loader, the same rows, no background status', async count => {
    const h = await harness({ meals: synthetic(count) });
    const shown = names(h.view);
    const next = h.refresh();
    expect(loader(h)).toBeNull(); expect(refreshing(h)).toBeNull();
    expect(names(h.view)).toEqual(shown);
    if (count === 0) expect(h.view.getByText('Todavía no tenés comidas guardadas.')).toBeTruthy();
    await h.settle(next, h.good()); expect(refreshing(h)).toBeNull(); expect(names(h.view)).toEqual(shown);
  });
});

describe('#303 · a failed refresh keeps the last confirmed rows and says so', () => {
  it.each<[string, 'result' | 'throw']>([['unavailable (offline or server)', 'result'], ['a thrown error', 'throw']])('%s: rows stay, no loader, the new alert, the same retry that reads once more and recovers', async (_label, how) => {
    const h = await harness();
    const shown = names(h.view), before = h.view.getByLabelText('Revisar Pollo al horno');
    const next = h.refresh();
    expect(refreshing(h)).toBeNull();
    if (how === 'result') await h.settle(next, lost); else await act(async () => { next.reject(new Error('offline')); });
    expect(h.quick.getSnapshot()).toMatchObject({ optionsError: true, optionsLoading: false }); expect(h.quick.getSnapshot().options).not.toBeNull();
    expect(loader(h)).toBeNull(); expect(refreshing(h)).toBeNull(); expect(h.view.queryByTestId(SLOT)).toBeNull();
    expect(names(h.view)).toEqual(shown); expect(h.view.getByLabelText('Revisar Pollo al horno')).toBe(before);
    const alert = h.view.getByText(STALE_ROWS);
    expect(alert.props.accessibilityRole).toBe('alert'); expect(h.view.queryByText('No pudimos actualizar las opciones.')).toBeNull();
    const retry = h.view.getByRole('button', { name: 'Reintentar opciones' });
    expect(retry.props.accessibilityRole).toBe('button');
    expect(h.quickApi.options).toHaveBeenCalledTimes(2);
    const again = deferred(); h.quickApi.options.mockImplementationOnce(() => again.promise);
    act(() => { fireEvent.press(retry); });
    expect(h.quickApi.options).toHaveBeenCalledTimes(3);
    // Retry runs silently, the rows never leave.
    expect(h.view.queryByText(STALE_ROWS)).toBeNull(); expect(refreshing(h)).toBeNull(); expect(loader(h)).toBeNull(); expect(names(h.view)).toEqual(shown);
    await h.settle(again, h.good());
    expect(refreshing(h)).toBeNull(); expect(h.view.queryByText(STALE_ROWS)).toBeNull(); expect(h.view.queryByText('Reintentar opciones')).toBeNull();
    expect(names(h.view)).toEqual(shown); expect(h.quickApi.options).toHaveBeenCalledTimes(3);
  });
  it('a retry that fails again keeps the rows and the same alert, one read per press', async () => {
    const h = await harness();
    await act(async () => { h.quickApi.options.mockResolvedValueOnce(lost); await h.quick.loadOptions(); });
    h.quickApi.options.mockResolvedValueOnce(lost);
    await act(async () => { fireEvent.press(h.view.getByText('Reintentar opciones')); });
    expect(h.view.getByText(STALE_ROWS)).toBeTruthy(); expect(names(h.view)).toHaveLength(6); expect(h.quickApi.options).toHaveBeenCalledTimes(3);
  });
  it('0 saved meals confirmed then a failed refresh: the empty text and the new alert, no loader', async () => {
    const h = await harness({ meals: [] });
    await act(async () => { h.quickApi.options.mockResolvedValueOnce(lost); await h.quick.loadOptions(); });
    expect(h.view.getByText(STALE_ROWS)).toBeTruthy(); expect(h.view.getByText('Todavía no tenés comidas guardadas.')).toBeTruthy(); expect(loader(h)).toBeNull();
  });
  it('saved meals that arrive unavailable after a good read keep the old text (the server answered, nothing stale is shown)', async () => {
    const h = await harness({ suggestions: true, suggested: [{ ...meal(50, 'Sugerida'), source: { kind: 'suggestion', id: ID(50), version: 'a'.repeat(64) } }] });
    await act(async () => { h.quickApi.options.mockResolvedValueOnce(h.good({ saved: { status: 'unavailable' } })); await h.quick.loadOptions(); });
    expect(h.view.getByText('No pudimos cargar estas opciones.')).toBeTruthy(); expect(h.view.queryByText(/desactualizadas/)).toBeNull();
    expect(h.view.getByText('Reintentar opciones')).toBeTruthy(); expect(h.view.queryByTestId(SLOT)).toBeNull();
  });
});

describe('#303 · each section counts on its own', () => {
  const suggestion = (n: number, name: string): QuickOption => ({ ...meal(n, name), source: { kind: 'suggestion', id: ID(n), version: 'a'.repeat(64) } });
  it('saved unavailable + suggestions ok (shown): confirmed, so the retry refreshes quietly, with the error still above', async () => {
    const h = await harness({ suggestions: true, suggested: [suggestion(50, 'Sugerida uno')], options: { saved: { status: 'unavailable' } } });
    expect(h.view.getByText('Sugerida uno')).toBeTruthy(); expect(h.view.getByText('No pudimos cargar estas opciones.')).toBeTruthy();
    const next = h.refresh();
    expect(loader(h)).toBeNull(); expect(refreshing(h)).toBeNull(); expect(h.view.getByText('Sugerida uno')).toBeTruthy();
    // The error row is showing: no extra reserved slot, the error is the only extra row.
    expect(h.view.queryByTestId(SLOT)).toBeNull();
    await h.settle(next, h.good({ saved: { status: 'ok', items: BASE }, suggested: { status: 'ok', items: [suggestion(50, 'Sugerida uno')] } }));
    expect(refreshing(h)).toBeNull(); expect(names(h.view)).toHaveLength(7);
  });
  it('saved ok + suggestions unavailable (shown): the saved meals are confirmed, quiet refresh, the retry stays', async () => {
    const h = await harness({ suggestions: true, options: { suggested: { status: 'unavailable' } } });
    expect(h.view.getByText('Reintentar opciones')).toBeTruthy();
    const next = h.refresh();
    expect(loader(h)).toBeNull(); expect(refreshing(h)).toBeNull(); expect(names(h.view)).toHaveLength(6);
    await h.settle(next, h.good()); expect(refreshing(h)).toBeNull();
  });
  it('suggestions ok but not shown (suggestions off) and saved unavailable: nothing to show, the loader stays', async () => {
    const h = await harness({ suggestions: false, suggested: [suggestion(50, 'Sugerida uno')], options: { saved: { status: 'unavailable' } } });
    const next = h.refresh();
    expect(loader(h)).toBeTruthy(); expect(refreshing(h)).toBeNull();
    await h.settle(next, h.good());
  });
});

describe('#303 · pins are independent of the refresh', () => {
  const stale = { status: 'unavailable' } as QuickPins;
  it('pins never read: the library, never «0 pins», no manage control, nothing writes, the refresh row shows on its own', async () => {
    const h = await harness({ pins: stale });
    const next = h.refresh();
    expect(refreshing(h)).toBeNull(); expect(loader(h)).toBeNull();
    expect(names(h.view)).toHaveLength(6); expect(h.view.queryByText('Fijadas')).toBeNull(); expect(h.view.queryByText(/0 fijadas|no tenés fijadas|sin fijadas/i)).toBeNull();
    expect(h.view.queryByTestId('quick-pins-manage')).toBeNull(); expect(h.view.queryByTestId('quick-pins-stale')).toBeNull();
    const row = h.view.getByLabelText('Revisar Pollo al horno');
    expect(row.props.accessibilityActions).toEqual([]);
    fireEvent(row, 'longPress'); fireEvent(row, 'accessibilityAction', { nativeEvent: { actionName: 'pin' } });
    await h.settle(next, h.good({ pins: stale }));
    expect(h.pinsApi.write).not.toHaveBeenCalled(); expect(h.view.queryByTestId('quick-pins-manage')).toBeNull();
  });
  it('a confirmed list that turns unavailable: both signals together, the list readable, nothing editable, nothing written', async () => {
    const h = await harness({ pins: ok(snap(3, [ID(1), ID(2)])) });
    act(() => { h.pins.adopt(stale); });
    const next = h.refresh();
    expect(h.view.getByTestId('quick-pins-stale')).toBeTruthy(); expect(refreshing(h)).toBeNull();
    expect(names(h.view).slice(0, 2)).toEqual(['Tostadas con palta', 'Avena con banana']); expect(h.view.queryByTestId('quick-pins-manage')).toBeNull();
    for (const row of h.view.getAllByLabelText('Revisar Avena con banana')) expect(row.props.accessibilityActions).toEqual([]);
    // The pins notice sits after the refresh row but is neither replaced nor hidden by it.
    await h.settle(next, h.good({ pins: stale }));
    expect(h.view.getByTestId('quick-pins-stale')).toBeTruthy(); expect(refreshing(h)).toBeNull();
    expect(h.pins.getSnapshot().confirmed).toEqual(snap(3, [ID(1), ID(2)]));
    expect(h.pinsApi.write).not.toHaveBeenCalled();
    expect(await h.pins.pin(ID(5))).toBe('refused'); expect(h.pinsApi.write).not.toHaveBeenCalled();
  });
  it('blocked and uncertain pins notices stay visible while refreshing, and the refresh adds no pins call', async () => {
    const blocked = await harness({ pins: ok(snap(0, [])), intent: { version: 1 } });
    const b = blocked.refresh();
    expect(blocked.view.getByTestId('quick-pins-blocked')).toBeTruthy(); expect(refreshing(blocked)).toBeNull(); expect(blocked.view.queryByTestId('quick-pins-manage')).toBeNull();
    await blocked.settle(b, blocked.good());
    expect(blocked.view.getByTestId('quick-pins-blocked')).toBeTruthy();

    const older = { version: 1, intent: { savedMealIds: [ID(4)], expectedRevision: 0, idempotencyKey: 'pins-old' }, base: snap(0, []) };
    const uncertain = await harness({ pins: ok(snap(0, [])), intent: older });
    const u = uncertain.refresh();
    expect(uncertain.view.getByTestId('quick-pins-uncertain')).toBeTruthy(); expect(refreshing(uncertain)).toBeNull(); expect(uncertain.view.getByText('Comprobar')).toBeTruthy();
    await uncertain.settle(u, uncertain.good());
    expect(uncertain.view.getByTestId('quick-pins-uncertain')).toBeTruthy(); expect(uncertain.pinsApi.write).not.toHaveBeenCalled(); expect(uncertain.pinsApi.read).not.toHaveBeenCalled();
  });
  it('a pins conflict stays visible, with its decisions, while the options refresh', async () => {
    const h = await harness({ pins: ok(snap(1, [ID(1)])) });
    h.pinsApi.write.mockResolvedValueOnce({ status: 'conflict', code: 'QUICK_PINS_CHANGED', message: 'm', data: { error: 'QUICK_PINS_CHANGED', message: 'm', current: snap(2, [ID(3)]) }, meta: { ...meta, httpStatus: 409, outcome: 'conflict' } });
    fireEvent.press(h.view.getByTestId('quick-pins-manage'));
    fireEvent.press(within(h.view.getByTestId('quick-pins-editor')).getByTestId(`quick-pins-choice-${ID(2)}`));
    await act(async () => { fireEvent.press(within(h.view.getByTestId('quick-pins-editor')).getByTestId('quick-pins-save')); });
    expect(h.view.getByTestId('quick-pins-conflict')).toBeTruthy();
    const next = h.refresh();
    expect(h.view.getByTestId('quick-pins-conflict')).toBeTruthy(); expect(refreshing(h)).toBeNull(); expect(h.view.getByText('Descartar')).toBeTruthy(); expect(h.view.getByText('Aplicar mi cambio')).toBeTruthy();
    // The conflict screen is writable as before: the refresh did not change that.
    expect(h.view.getByTestId('quick-pins-manage')).toBeTruthy();
    await h.settle(next, h.good());
    expect(h.pinsApi.write).toHaveBeenCalledTimes(1);
  });
  it('a failed refresh next to unavailable pins shows both messages, each its own', async () => {
    const h = await harness({ pins: ok(snap(2, [ID(1)])) });
    act(() => { h.pins.adopt(stale); });
    await act(async () => { h.quickApi.options.mockResolvedValueOnce(lost); await h.quick.loadOptions(); });
    expect(h.view.getByText(STALE_ROWS)).toBeTruthy(); expect(h.view.getByTestId('quick-pins-stale')).toBeTruthy(); expect(h.view.getByText('Reintentar opciones')).toBeTruthy();
    expect(h.pinsApi.write).not.toHaveBeenCalled(); expect(h.view.queryByTestId('quick-pins-manage')).toBeNull();
  });
});

describe('#303 · no new reads or writes', () => {
  it('one read per open and per explicit retry; no pins call, no fetch, nothing registered', async () => {
    const h = await harness();
    expect(h.quickApi.options).toHaveBeenCalledTimes(1);
    await act(async () => { h.quick.close(); }); await act(async () => { h.quick.open(quickDate); });
    await waitFor(() => expect(h.quick.getSnapshot().optionsLoading).toBe(false));
    expect(h.quickApi.options).toHaveBeenCalledTimes(2);
    // Searching, switching views and re-rendering during a pending refresh read nothing.
    const next = h.refresh(); expect(h.quickApi.options).toHaveBeenCalledTimes(3);
    fireEvent.changeText(h.view.getByLabelText('Buscar en tus comidas'), 'pollo'); fireEvent.changeText(h.view.getByLabelText('Buscar en tus comidas'), '');
    expect(h.quickApi.options).toHaveBeenCalledTimes(3);
    await h.settle(next, lost);
    expect(h.quickApi.options).toHaveBeenCalledTimes(3);
    await act(async () => { fireEvent.press(h.view.getByText('Reintentar opciones')); });
    expect(h.quickApi.options).toHaveBeenCalledTimes(4);
    expect(h.pinsApi.read).not.toHaveBeenCalled(); expect(h.pinsApi.write).not.toHaveBeenCalled(); expect(fetchSpy).not.toHaveBeenCalled();
    expect(h.quickApi.preview).not.toHaveBeenCalled(); expect(h.quickApi.confirm).not.toHaveBeenCalled(); expect(h.quickApi.read).not.toHaveBeenCalled();
  });
});

describe('#661 · accessibility and Dynamic Type', () => {
  it('a background refresh takes no space and remains silent even with large text', async () => {
    atFontScale(2);
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
    const h = await harness();
    const next = h.refresh();
    expect(h.view.queryByTestId(SLOT)).toBeNull();
    expect(h.view.queryByLabelText('Actualizando opciones rápidas')).toBeNull();
    await h.settle(next, lost);
    expect(announce).not.toHaveBeenCalled();
    expect(h.view.getByText(STALE_ROWS).props.numberOfLines).toBeUndefined();
    expect(h.view.getByRole('button', { name: 'Reintentar opciones' })).toBeTruthy();
  });
});
