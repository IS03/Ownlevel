import { act, fireEvent, render, waitFor, within } from '@testing-library/react-native';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { ActionSheetIOS, Alert, Dimensions, SectionList, StyleSheet } from 'react-native';
import { OwnlevelThemeProvider } from '@/design-system';
import type { QuickOption, QuickOptions, QuickPins, QuickPinsSnapshot } from '@/api/nutrition-quick';
import { QuickEditor } from './quick-editor';
import { QuickController, type QuickApi } from './quick-controller';
import { QuickIntentRepository } from './quick-storage';
import { QuickPinsController, type QuickPinsApi } from './quick-pins-controller';
import { QuickPinsIntentRepository, quickPinsStorageKey } from './quick-pins-storage';
import { librarySections, initialOf, searchLibrary, sortAZ } from './quick-library-model';
import { quickDate, quickPreview, quickReceipt } from './quick-fixture.test-helper';
import { nutritionFixture } from './day-fixture.test-helper';
import { State } from 'react-native-gesture-handler';
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';

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
const original = { window: Dimensions.get('window'), screen: Dimensions.get('screen') };
const atFontScale = (fontScale: number) => Dimensions.set({ window: { ...original.window, fontScale }, screen: original.screen });
// The RN jest environment defaults to fontScale 2: the tests set the size they mean.
beforeEach(() => { atFontScale(1); });
afterEach(() => { Dimensions.set(original); });
const meta = { durationMs: 1, httpStatus: 200, outcome: 'ok' as const };
const ID = (n: number) => `42100000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const meal = (n: number, name: string, description: string | null = null): QuickOption => ({ source: { kind: 'saved', id: ID(n), version: 'a'.repeat(64) }, name, description,
  templateType: 'manual', calories: 100 + n, proteinG: 10, carbsG: 20, fatG: 5, items: [], useCount: null, lastUsedDate: null });
const snap = (revision: number, ids: string[], states: Record<string, 'archived' | 'deleted'> = {}): QuickPinsSnapshot => ({ revision, items: ids.map(id => ({ id, state: states[id] ?? 'active' })) });
const ok = (s: QuickPinsSnapshot): QuickPins => ({ status: 'ok', ...s });
const BASE = [meal(1, 'Tostadas con palta'), meal(2, 'Avena con banana', 'Desayuno de entreno'), meal(3, 'Ñoquis caseros'), meal(4, 'Ensalada de atún'), meal(5, 'Pollo al horno'), meal(6, 'Café con leche')];

function storage() {
  const map = new Map<string, string>();
  return { map, port: { getItem: async (k: string) => map.get(k) ?? null, setItem: async (k: string, v: string) => { map.set(k, v); }, removeItem: async (k: string) => { map.delete(k); } } };
}
async function setup({ meals = BASE, pins = ok(snap(0, [])) as QuickPins, intent }: { meals?: QuickOption[]; pins?: QuickPins; intent?: unknown } = {}) {
  const shared = storage();
  if (intent) shared.map.set(quickPinsStorageKey('owner'), JSON.stringify(intent));
  const options: QuickOptions = { today: quickDate, saved: { status: 'ok', items: meals }, suggested: { status: 'ok', items: [] }, pins };
  const quickApi = { options: jest.fn<QuickApi['options']>().mockResolvedValue({ status: 'ok', data: options, meta }),
    preview: jest.fn<QuickApi['preview']>().mockImplementation(async s => ({ status: 'ok', data: quickPreview(s), meta })),
    confirm: jest.fn<QuickApi['confirm']>().mockResolvedValue({ status: 'ok', data: quickReceipt, meta }),
    read: jest.fn<QuickApi['read']>().mockImplementation(async d => ({ status: 'ok', data: nutritionFixture(d), meta })) };
  const pinsApi = { write: jest.fn<QuickPinsApi['write']>().mockImplementation(async w => ({ status: 'ok', data: snap(w.expectedRevision + 1, w.savedMealIds), meta })),
    read: jest.fn<QuickPinsApi['read']>().mockResolvedValue({ status: 'ok', data: options, meta }) };
  const quick = new QuickController(quickApi, new QuickIntentRepository(shared.port, 'owner'), () => {});
  let keys = 0;
  const pinsController = new QuickPinsController(pinsApi, new QuickPinsIntentRepository(shared.port, 'owner'), () => `pins-${++keys}`);
  const ui = () => <OwnlevelThemeProvider initialMode="light"><QuickEditor controller={quick} state={quick.getSnapshot()} pins={{ controller: pinsController, state: pinsController.getSnapshot() }} /></OwnlevelThemeProvider>;
  const view = render(ui());
  quick.subscribe(() => view.rerender(ui())); pinsController.subscribe(() => view.rerender(ui()));
  await act(async () => { await quick.initialize(); await pinsController.initialize(); quick.open(quickDate); });
  await waitFor(() => expect(quick.getSnapshot().options).not.toBeNull());
  // What useQuickPinsController does with the same answer.
  act(() => { pinsController.adopt(quick.getSnapshot().options!.pins); });
  return { view, quick, quickApi, pins: pinsController, pinsApi, shared };
}
const names = (view: ReturnType<typeof render>) => view.queryAllByLabelText(/^Revisar /).map(node => node.props.accessibilityLabel.replace('Revisar ', ''));

describe('#479 C · library model', () => {
  it('orders A–Z in Spanish (accents and case ignored, Ñ after N), stable by id, grouped by initial', () => {
    const items = [meal(9, 'ñandú'), meal(8, 'Zapallo'), meal(7, 'Ñoquis'), meal(6, 'nuez'), meal(5, 'Ácido'), meal(4, 'acelga'), meal(3, '3 huevos'), meal(2, 'Acelga'), meal(1, 'Acelga')];
    expect(sortAZ(items).map(o => o.name)).toEqual(['3 huevos', 'Acelga', 'Acelga', 'acelga', 'Ácido', 'nuez', 'ñandú', 'Ñoquis', 'Zapallo']);
    expect(sortAZ(items).filter(o => /acelga/i.test(o.name)).map(o => o.source.id)).toEqual([ID(1), ID(2), ID(4)]);
    expect(librarySections(items).map(s => `${s.title}:${s.data.length}`)).toEqual(['#:1', 'A:4', 'N:1', 'Ñ:2', 'Z:1']);
    expect(['Éclair', '¡Hola', 'ñ'].map(initialOf)).toEqual(['E', '#', 'Ñ']);
  });
  it('searches names and descriptions without accents or case, each meal once', () => {
    const items = [...BASE, BASE[1]!];
    expect(searchLibrary(items, 'cafe').map(o => o.name)).toEqual(['Café con leche']);
    expect(searchLibrary(items, 'ENTRENO').map(o => o.name)).toEqual(['Avena con banana']);
    expect(searchLibrary(items, 'con').map(o => o.name)).toEqual(['Avena con banana', 'Café con leche', 'Tostadas con palta']);
    expect(searchLibrary(items, '   ')).toEqual([]);
  });
});

describe('#479 C · Rápido entry, library and search', () => {
  it('with 0 confirmed pins: the whole A–Z library directly, and a visible way to choose pins', async () => {
    const { view } = await setup();
    expect(view.queryByText('Fijadas')).toBeNull(); expect(view.queryByTestId('quick-all-meals')).toBeNull();
    expect(view.getByText('Todas las comidas')).toBeTruthy();
    expect(names(view)).toEqual(['Avena con banana', 'Café con leche', 'Ensalada de atún', 'Ñoquis caseros', 'Pollo al horno', 'Tostadas con palta']);
    expect(view.getByText('Ñ')).toBeTruthy();
    expect(within(view.getByTestId('quick-pins-manage')).getByText('Elegir fijadas')).toBeTruthy();
  });

  it('with pins unavailable (backend not ready): the library, never «0 pins», no pin controls and no PUT', async () => {
    const actionSheet = jest.spyOn(ActionSheetIOS, 'showActionSheetWithOptions').mockImplementation(() => {});
    const { view, pinsApi } = await setup({ pins: { status: 'unavailable' } });
    expect(names(view)).toHaveLength(6); expect(view.queryByText('Fijadas')).toBeNull();
    expect(view.queryByText(/0 fijadas|no tenés fijadas|sin fijadas/i)).toBeNull();
    expect(view.queryByTestId('quick-pins-manage')).toBeNull();
    const row = view.getByLabelText('Revisar Pollo al horno');
    expect(row.props.accessibilityActions).toEqual([]);
    fireEvent(row, 'longPress'); fireEvent(row, 'accessibilityAction', { nativeEvent: { actionName: 'pin' } });
    expect(actionSheet).not.toHaveBeenCalled(); expect(pinsApi.write).not.toHaveBeenCalled();
    actionSheet.mockRestore();
  });

  it('with 1–6 pins: the pinned meals in the person\'s order on top, and the whole library A–Z below in the same view (#516)', async () => {
    const long = meal(7, 'Guiso de lentejas con chorizo colorado, panceta ahumada, zapallo, papa y un toque de pimentón de la Vera');
    const { view } = await setup({ meals: [...BASE, long], pins: ok(snap(3, [ID(5), ID(7), ID(1), ID(2), ID(4), ID(6)])) });
    expect(view.getByText('Fijadas')).toBeTruthy(); expect(view.getByText('Todas las comidas')).toBeTruthy();
    expect(names(view).slice(0, 6)).toEqual(['Pollo al horno', long.name, 'Tostadas con palta', 'Avena con banana', 'Ensalada de atún', 'Café con leche']);
    expect(names(view).slice(6)).toEqual(['Avena con banana', 'Café con leche', 'Ensalada de atún', long.name, 'Ñoquis caseros', 'Pollo al horno', 'Tostadas con palta']);
    // Long names are never cut; no second screen to reach the library, and no way «back» to lose.
    expect(view.getAllByText(long.name)[0].props.numberOfLines).toBeUndefined();
    expect(view.queryByTestId('quick-all-meals')).toBeNull(); expect(view.queryByTestId('quick-back-to-pins')).toBeNull();
  });

  it('search finds every active saved meal (pinned or not) once, and clearing returns to the same view', async () => {
    const { view } = await setup({ pins: ok(snap(1, [ID(6)])) });
    const search = view.getByLabelText('Buscar en tus comidas');
    fireEvent.changeText(search, 'CON');
    expect(names(view)).toEqual(['Avena con banana', 'Café con leche', 'Tostadas con palta']);
    expect(view.getByText('3 resultados')).toBeTruthy(); expect(view.queryByText('Fijadas')).toBeNull();
    fireEvent.changeText(search, '');
    expect(names(view)[0]).toBe('Café con leche'); expect(names(view)).toHaveLength(7);
    fireEvent.changeText(search, 'ñoq'); expect(names(view)).toEqual(['Ñoquis caseros']);
    fireEvent.changeText(search, 'xyz'); expect(view.getByText('No encontramos comidas con esa búsqueda.')).toBeTruthy();
    fireEvent.changeText(search, ''); expect(view.getByText('Fijadas')).toBeTruthy(); expect(names(view)).toHaveLength(7);
  });

  it('reviewing a meal and coming back keeps the query and the same list (its scroll position)', async () => {
    const { view, quick } = await setup({ pins: ok(snap(1, [ID(6)])) });
    fireEvent.changeText(view.getByLabelText('Buscar en tus comidas'), 'a');
    const list = view.UNSAFE_getByType(SectionList);
    await act(async () => { fireEvent.press(view.getByLabelText('Revisar Pollo al horno')); });
    expect(quick.getSnapshot().draft?.option.name).toBe('Pollo al horno');
    // The library stays mounted, hidden from the screen and from VoiceOver while the meal is reviewed.
    expect(view.UNSAFE_getByType(SectionList)).toBe(list);
    expect(view.queryByLabelText('Revisar Avena con banana')).toBeNull();
    await act(async () => { quick.back(); });
    expect(view.UNSAFE_getByType(SectionList)).toBe(list);
    expect(view.getByLabelText('Buscar en tus comidas').props.value).toBe('a');
    expect(view.getByLabelText('Revisar Avena con banana')).toBeTruthy();
    fireEvent.changeText(view.getByLabelText('Buscar en tus comidas'), '');
    expect(view.getByText('Fijadas')).toBeTruthy(); expect(names(view)).toHaveLength(7);
  });

  it('the + adds immediately from pins, library or search, with the #481 row and the same single write', async () => {
    const { view, quickApi } = await setup({ pins: ok(snap(1, [ID(5)])) });
    const add = view.getAllByLabelText('Agregar Pollo al horno')[0]!;
    expect(StyleSheet.flatten(add.props.style)).toMatchObject({ width: 44, height: 44 });
    expect(StyleSheet.flatten(within(add).getByTestId('quick-add-disc').props.style)).toMatchObject({ width: 36, height: 36, borderRadius: 18 });
    expect(StyleSheet.flatten(view.getAllByText('Pollo al horno')[0]!.props.style)).toMatchObject({ fontSize: 17, fontWeight: '400' });
    await act(async () => { fireEvent.press(add); });
    await waitFor(() => expect(quickApi.confirm).toHaveBeenCalledTimes(1));
    expect(quickApi.options).toHaveBeenCalledTimes(1); expect(quickApi.preview).toHaveBeenCalledTimes(1);
  });
});

describe('#479 C / #516 · pins change only in «Administrar fijadas», as one saved list', () => {
  const editor = (view: ReturnType<typeof render>) => within(view.getByTestId('quick-pins-editor'));
  const draft = (view: ReturnType<typeof render>) => editor(view).queryAllByTestId(/^quick-pins-draft-label-/).map(node => node.props.accessibilityLabel as string);
  it('nothing is pinned without «Guardar»: adding, moving and removing in the sheet write nothing, then one whole list', async () => {
    const { view, pinsApi } = await setup({ pins: ok(snap(2, [ID(5), ID(1)])) });
    fireEvent.press(view.getByTestId('quick-pins-manage'));
    expect(draft(view)).toEqual(['Pollo al horno, 1 de 2', 'Tostadas con palta, 2 de 2']);
    expect(editor(view).getByTestId('quick-pins-save').props.accessibilityState).toMatchObject({ disabled: true });
    fireEvent.press(editor(view).getByTestId(`quick-pins-choice-${ID(4)}`));
    fireEvent(editor(view).getByTestId(`quick-pins-draft-label-${ID(4)}`), 'accessibilityAction', { nativeEvent: { actionName: 'up' } });
    fireEvent.press(editor(view).getByTestId(`quick-pins-remove-${ID(5)}`));
    expect(draft(view)).toEqual(['Ensalada de atún, 1 de 2', 'Tostadas con palta, 2 de 2']);
    expect(pinsApi.write).not.toHaveBeenCalled();
    // The view under the sheet did not move while editing.
    expect(names(view).slice(0, 2)).toEqual(['Pollo al horno', 'Tostadas con palta']);
    await act(async () => { fireEvent.press(editor(view).getByTestId('quick-pins-save')); });
    expect(pinsApi.write).toHaveBeenCalledTimes(1);
    expect(pinsApi.write).toHaveBeenLastCalledWith({ savedMealIds: [ID(4), ID(1)], expectedRevision: 2, idempotencyKey: 'pins-1' });
    expect(view.queryByTestId('quick-pins-editor')).toBeNull();
    expect(names(view).slice(0, 2)).toEqual(['Ensalada de atún', 'Tostadas con palta']);
    // The + is never in the sheet and always in the view: adding to the day is not pinning.
    expect(view.getAllByLabelText('Agregar Café con leche')).toHaveLength(1);
  });

  it('long press and VoiceOver actions open the sheet with the change prepared; neither writes by itself', async () => {
    const sheet = jest.spyOn(ActionSheetIOS, 'showActionSheetWithOptions').mockImplementation((options, pick) => pick(options.options.indexOf('Fijar en Rápido…')));
    const alert = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => buttons?.find(b => b.text === 'Fijar en Rápido…')?.onPress?.());
    const { view, pinsApi } = await setup({ pins: ok(snap(0, [])) });
    act(() => { fireEvent(view.getByLabelText('Revisar Café con leche'), 'longPress'); });
    expect(draft(view)).toEqual(['Café con leche, 1 de 1']); expect(pinsApi.write).not.toHaveBeenCalled();
    await act(async () => { fireEvent.press(editor(view).getByTestId('quick-pins-save')); });
    expect(pinsApi.write).toHaveBeenLastCalledWith({ savedMealIds: [ID(6)], expectedRevision: 0, idempotencyKey: 'pins-1' });
    const row = view.getAllByLabelText('Revisar Avena con banana')[0]!;
    expect(row.props.accessibilityActions).toEqual([{ name: 'pin', label: 'Fijar' }]);
    act(() => { fireEvent(row, 'accessibilityAction', { nativeEvent: { actionName: 'pin' } }); });
    expect(draft(view)).toEqual(['Café con leche, 1 de 2', 'Avena con banana, 2 de 2']); expect(pinsApi.write).toHaveBeenCalledTimes(1);
    expect(view.getAllByLabelText('Revisar Café con leche')[0]!.props.accessibilityActions).toEqual([{ name: 'unpin', label: 'Desfijar' }]);
    sheet.mockRestore(); alert.mockRestore();
  });

  it('«Cancelar» drops only the draft: zero writes, asking first when it changed', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => buttons?.find(b => b.text === 'Descartar')?.onPress?.());
    const { view, pinsApi } = await setup({ pins: ok(snap(4, [ID(5), ID(1)])) });
    fireEvent.press(view.getByTestId('quick-pins-manage'));
    fireEvent.press(editor(view).getByTestId('quick-pins-cancel'));
    expect(alert).not.toHaveBeenCalled(); expect(view.queryByTestId('quick-pins-editor')).toBeNull(); // Unchanged: no question.
    fireEvent.press(view.getByTestId('quick-pins-manage'));
    fireEvent.press(editor(view).getByTestId(`quick-pins-remove-${ID(1)}`));
    fireEvent.press(editor(view).getByTestId('quick-pins-cancel'));
    expect(alert).toHaveBeenCalledWith('¿Descartar los cambios?', 'Tus fijadas guardadas no cambian.', expect.any(Array));
    expect(view.queryByTestId('quick-pins-editor')).toBeNull();
    expect(pinsApi.write).not.toHaveBeenCalled(); expect(names(view).slice(0, 2)).toEqual(['Pollo al horno', 'Tostadas con palta']);
    alert.mockRestore();
  });

  it('archived and deleted pins keep their place, are never offered for adding, and are released in the sheet', async () => {
    const six = [ID(1), ID(90), ID(2), ID(91), ID(3), ID(4)];
    const { view, pinsApi } = await setup({ pins: ok(snap(5, six, { [ID(90)]: 'archived', [ID(91)]: 'deleted' })) });
    expect(view.getByText('Comida archivada')).toBeTruthy(); expect(view.getByText('Comida eliminada')).toBeTruthy();
    // Six places taken (two by unavailable meals): nothing else can be pinned.
    fireEvent.press(view.getByTestId('quick-pins-manage'));
    expect(editor(view).getByTestId(`quick-pins-choice-${ID(5)}`).props.accessibilityState).toMatchObject({ disabled: true });
    fireEvent.press(editor(view).getByTestId('quick-pins-cancel'));
    fireEvent.press(within(view.getByTestId(`quick-pin-gone-${ID(90)}`)).getByText('Liberar lugar'));
    expect(draft(view)).toHaveLength(5); expect(pinsApi.write).not.toHaveBeenCalled();
    await act(async () => { fireEvent.press(editor(view).getByTestId('quick-pins-save')); });
    expect(pinsApi.write).toHaveBeenLastCalledWith({ savedMealIds: [ID(1), ID(2), ID(91), ID(3), ID(4)], expectedRevision: 5, idempotencyKey: 'pins-1' });
  });

  it('pending, uncertain and conflict stay in the sheet with their recovery; nothing is called saved before the receipt', async () => {
    const pending = await setup({ pins: ok(snap(1, [ID(1)])) });
    let release!: () => void;
    pending.pinsApi.write.mockImplementationOnce(w => new Promise(resolve => { release = () => resolve({ status: 'unavailable', reason: 'network', meta }); void w; }));
    fireEvent.press(pending.view.getByTestId('quick-pins-manage'));
    fireEvent.press(editor(pending.view).getByTestId(`quick-pins-choice-${ID(2)}`));
    act(() => { fireEvent.press(editor(pending.view).getByTestId('quick-pins-save')); });
    await waitFor(() => expect(pending.view.getByText('Guardando tus fijadas…')).toBeTruthy());
    expect(editor(pending.view).getByText('Guardando…')).toBeTruthy(); expect(names(pending.view)[0]).toBe('Tostadas con palta');
    await act(async () => { release(); });
    expect(editor(pending.view).getByTestId('quick-pins-editor-uncertain')).toBeTruthy(); expect(pending.view.getByTestId('quick-pins-uncertain')).toBeTruthy();
    expect(editor(pending.view).getByTestId('quick-pins-save').props.accessibilityState).toMatchObject({ disabled: true }); // No second save over it.
    const first = pending.pinsApi.write.mock.calls[0]![0];
    await act(async () => { fireEvent.press(editor(pending.view).getByTestId('quick-pins-editor-recover')); });
    expect(pending.pinsApi.write.mock.calls[1]![0]).toEqual(first);
    expect(pending.view.queryByTestId('quick-pins-editor')).toBeNull(); expect(pending.view.queryByTestId('quick-pins-uncertain')).toBeNull();

    const conflict = await setup({ pins: ok(snap(1, [ID(1)])) });
    conflict.pinsApi.write.mockResolvedValueOnce({ status: 'conflict', code: 'QUICK_PINS_CHANGED', message: 'm',
      data: { error: 'QUICK_PINS_CHANGED', message: 'm', current: snap(2, [ID(3)]) }, meta: { ...meta, httpStatus: 409, outcome: 'conflict' } });
    fireEvent.press(conflict.view.getByTestId('quick-pins-manage'));
    fireEvent.press(editor(conflict.view).getByTestId(`quick-pins-choice-${ID(2)}`));
    await act(async () => { fireEvent.press(editor(conflict.view).getByTestId('quick-pins-save')); });
    expect(editor(conflict.view).getByTestId('quick-pins-editor-conflict')).toBeTruthy();
    expect(editor(conflict.view).getByText('Guardadas: Ñoquis caseros.')).toBeTruthy();
    expect(names(conflict.view)[0]).toBe('Ñoquis caseros'); // The truth under the sheet; the draft is still in the sheet.
    expect(draft(conflict.view)).toEqual(['Tostadas con palta, 1 de 2', 'Avena con banana, 2 de 2']);
    fireEvent.press(editor(conflict.view).getByTestId('quick-pins-keep-mine'));
    await act(async () => { fireEvent.press(editor(conflict.view).getByTestId('quick-pins-save')); });
    expect(conflict.pinsApi.write).toHaveBeenLastCalledWith({ savedMealIds: [ID(1), ID(2)], expectedRevision: 2, idempotencyKey: 'pins-2' });
    expect(conflict.view.queryByTestId('quick-pins-editor')).toBeNull();

    const blocked = await setup({ pins: ok(snap(0, [])), intent: { version: 1 } });
    expect(blocked.view.getByTestId('quick-pins-blocked')).toBeTruthy(); expect(blocked.view.queryByTestId('quick-pins-manage')).toBeNull();
    expect(names(blocked.view)).toHaveLength(6);
  });

  it('six pins reordered by dragging the handles: no write per move, one whole list on «Guardar»', async () => {
    const six = [ID(1), ID(2), ID(3), ID(4), ID(5), ID(6)];
    const { view, pinsApi } = await setup({ pins: ok(snap(7, six)) });
    fireEvent.press(view.getByTestId('quick-pins-manage'));
    // Rows are 56 pt: dragging the last handle up five rows puts it first; the second drag moves the new last one up one row.
    act(() => { fireGestureHandler(getByGestureTestId(`quick-pins-drag-${ID(6)}`), [{ state: State.BEGAN, translationY: 0 }, { state: State.ACTIVE, translationY: -150 }, { state: State.ACTIVE, translationY: -280 }, { state: State.END, translationY: -280 }]); });
    expect(draft(view).map(label => label.split(',')[0])).toEqual(['Café con leche', 'Tostadas con palta', 'Avena con banana', 'Ñoquis caseros', 'Ensalada de atún', 'Pollo al horno']);
    act(() => { fireGestureHandler(getByGestureTestId(`quick-pins-drag-${ID(5)}`), [{ state: State.BEGAN, translationY: 0 }, { state: State.ACTIVE, translationY: -56 }, { state: State.END, translationY: -56 }]); });
    // A drag that ends where it started changes nothing.
    act(() => { fireGestureHandler(getByGestureTestId(`quick-pins-drag-${ID(1)}`), [{ state: State.BEGAN, translationY: 0 }, { state: State.ACTIVE, translationY: 10 }, { state: State.END, translationY: 10 }]); });
    expect(pinsApi.write).not.toHaveBeenCalled();
    await act(async () => { fireEvent.press(editor(view).getByTestId('quick-pins-save')); });
    expect(pinsApi.write).toHaveBeenCalledTimes(1);
    expect(pinsApi.write).toHaveBeenLastCalledWith({ savedMealIds: [ID(6), ID(1), ID(2), ID(3), ID(5), ID(4)], expectedRevision: 7, idempotencyKey: 'pins-1' });
    expect(names(view).slice(0, 6)).toEqual(['Café con leche', 'Tostadas con palta', 'Avena con banana', 'Ñoquis caseros', 'Pollo al horno', 'Ensalada de atún']);
  });

  it('pins that changed elsewhere while the sheet was open: nothing is sent; the person chooses the saved list or theirs', async () => {
    const { view, pins, pinsApi } = await setup({ pins: ok(snap(3, [ID(1), ID(2)])) });
    fireEvent.press(view.getByTestId('quick-pins-manage'));
    fireEvent(editor(view).getByTestId(`quick-pins-draft-label-${ID(2)}`), 'accessibilityAction', { nativeEvent: { actionName: 'up' } });
    act(() => { pins.adopt(ok(snap(4, [ID(3)]))); }); // Rápido's GET brought another device's list.
    expect(names(view)[0]).toBe('Ñoquis caseros');
    await act(async () => { fireEvent.press(editor(view).getByTestId('quick-pins-save')); });
    expect(pinsApi.write).not.toHaveBeenCalled();
    expect(editor(view).getByText('Tus fijadas cambiaron en otro dispositivo mientras editabas. No guardamos nada.')).toBeTruthy();
    expect(draft(view)).toEqual(['Avena con banana, 1 de 2', 'Tostadas con palta, 2 de 2']);
    fireEvent.press(editor(view).getByTestId('quick-pins-use-saved'));
    expect(draft(view)).toEqual(['Ñoquis caseros, 1 de 1']);
    expect(editor(view).getByTestId('quick-pins-save').props.accessibilityState).toMatchObject({ disabled: true });
    expect(pinsApi.write).not.toHaveBeenCalled();
  });

  it('an unconfirmed intent from an earlier session shows the person\'s list as unconfirmed, with Comprobar, and no sheet over it', async () => {
    const { view, pinsApi } = await setup({ pins: ok(snap(0, [])), intent: { version: 1, intent: { savedMealIds: [ID(4)], expectedRevision: 0, idempotencyKey: 'pins-old' }, base: snap(0, []) } });
    expect(view.getByTestId('quick-pins-uncertain')).toBeTruthy();
    expect(names(view)[0]).toBe('Ensalada de atún'); expect(view.queryByTestId('quick-pins-manage')).toBeNull();
    await act(async () => { fireEvent.press(view.getByText('Comprobar')); });
    expect(pinsApi.write).toHaveBeenCalledWith({ savedMealIds: [ID(4)], expectedRevision: 0, idempotencyKey: 'pins-old' });
  });
});

describe('#479 C · 10, 50 and 200 saved meals', () => {
  const words = ['Arroz', 'Batido', 'Calabaza', 'Dulce', 'Ensalada', 'Fideos', 'Guiso', 'Hamburguesa', 'Licuado', 'Milanesa', 'Ñoquis', 'Omelette', 'Pollo', 'Queso', 'Ravioles', 'Sopa', 'Tarta', 'Yogur', 'Zapallo'];
  const many = (count: number) => Array.from({ length: count }, (_, n) => meal(n + 1, `${words[n % words.length]} ${String(n + 1).padStart(3, '0')}`));
  it.each([10, 50, 200])('%i meals: a bounded window of rows, search over all of them, the whole alphabet, and no extra GET', async count => {
    const scroll = jest.spyOn(SectionList.prototype, 'scrollToLocation').mockImplementation(() => {});
    const { view, quickApi, pinsApi } = await setup({ meals: many(count), pins: ok(snap(1, [ID(count)])) });
    expect(names(view).length).toBeLessThanOrEqual(Math.min(count + 1, 30));
    expect(names(view)[0]).toBe(many(count).at(-1)!.name); expect(names(view)[1]).toBe('Arroz 001');
    if (count >= 12) {
      // All 28 places (# A–Z with Ñ), in order; an initial with no meals is there, disabled, and never jumps.
      expect(within(view.getByTestId('quick-letters')).queryAllByTestId(/^quick-letter-/).map(node => node.props.testID.replace('quick-letter-', '')).join('')).toBe('#ABCDEFGHIJKLMNÑOPQRSTUVWXYZ');
      expect(view.getByTestId('quick-letter-K').props.accessibilityState).toMatchObject({ disabled: true });
      expect(view.getByTestId('quick-letter-K').props.accessibilityLabel).toBe('K, sin comidas');
      fireEvent.press(view.getByTestId('quick-letter-K')); expect(scroll).not.toHaveBeenCalled();
      fireEvent.press(view.getByTestId('quick-letter-Ñ'));
      // Sections: «Fijadas», the «Todas las comidas» heading, then the letters.
      expect(scroll).toHaveBeenLastCalledWith({ sectionIndex: librarySections(many(count)).findIndex(s => s.key === 'Ñ') + 2, itemIndex: 0, viewPosition: 0, animated: false });
      fireEvent.press(view.getByTestId('quick-letter-Z'));
      expect(scroll).toHaveBeenLastCalledWith({ sectionIndex: librarySections(many(count)).findIndex(s => s.key === 'Z') + 2, itemIndex: 0, viewPosition: 0, animated: false });
    } else expect(view.queryByTestId('quick-letters')).toBeNull();
    const last = many(count).at(-1)!.name;
    fireEvent.changeText(view.getByLabelText('Buscar en tus comidas'), last.toLowerCase());
    expect(names(view)).toEqual([last]);
    fireEvent.changeText(view.getByLabelText('Buscar en tus comidas'), '');
    expect(quickApi.options).toHaveBeenCalledTimes(1); expect(pinsApi.read).not.toHaveBeenCalled(); expect(pinsApi.write).not.toHaveBeenCalled();
    scroll.mockRestore();
  });
  it('large text: the same 28 letters open on request («Ir a letra»), in the same order, empty ones disabled', async () => {
    atFontScale(1.6);
    const scroll = jest.spyOn(SectionList.prototype, 'scrollToLocation').mockImplementation(() => {});
    const { view } = await setup({ meals: many(50), pins: ok(snap(1, [])) });
    expect(view.queryByTestId('quick-letters')).toBeNull();
    const toggle = view.getByTestId('quick-letters-toggle');
    expect(toggle.props.accessibilityState).toMatchObject({ expanded: false }); expect(view.queryByTestId('quick-letter-A')).toBeNull();
    fireEvent.press(toggle);
    expect(view.getByTestId('quick-letters-toggle').props.accessibilityState).toMatchObject({ expanded: true });
    expect(view.queryAllByTestId(/^quick-letter-/).map(node => node.props.testID.replace('quick-letter-', '')).join('')).toBe('#ABCDEFGHIJKLMNÑOPQRSTUVWXYZ');
    expect(view.getByTestId('quick-letter-W').props.accessibilityState).toMatchObject({ disabled: true });
    fireEvent.press(view.getByTestId('quick-letter-T'));
    // No pins: the «Todas las comidas» heading, then the letters.
    expect(scroll).toHaveBeenLastCalledWith({ sectionIndex: librarySections(many(50)).findIndex(s => s.key === 'T') + 1, itemIndex: 0, viewPosition: 0, animated: false });
    expect(view.queryByTestId('quick-letter-A')).toBeNull(); // Folds again after the jump.
    scroll.mockRestore();
  });
});
