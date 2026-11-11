import { act, fireEvent, render, waitFor, within } from '@testing-library/react-native';
import { describe, expect, it, jest } from '@jest/globals';
import { ActionSheetIOS, Alert, SectionList, StyleSheet } from 'react-native';
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

jest.mock('./day-resource', () => ({ useNutritionDayResource: () => ({ state: { status: 'loading' } }) }));
jest.mock('@/api', () => ({ useMobileApi: () => ({ client: null }) }));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
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

  it('with 1–6 pins: the pinned meals in the person\'s order, «Todas las comidas» always reachable, and back', async () => {
    const long = meal(7, 'Guiso de lentejas con chorizo colorado, panceta ahumada, zapallo, papa y un toque de pimentón de la Vera');
    const { view } = await setup({ meals: [...BASE, long], pins: ok(snap(3, [ID(5), ID(7), ID(1), ID(2), ID(4), ID(6)])) });
    expect(view.getByText('Fijadas')).toBeTruthy();
    expect(names(view)).toEqual(['Pollo al horno', long.name, 'Tostadas con palta', 'Avena con banana', 'Ensalada de atún', 'Café con leche']);
    // Long names are never cut.
    expect(view.getByText(long.name).props.numberOfLines).toBeUndefined();
    const all = view.getByTestId('quick-all-meals');
    expect(all.props.accessibilityLabel).toBe('Todas las comidas, 7');
    fireEvent.press(all);
    expect(names(view)[0]).toBe('Avena con banana'); expect(view.getByTestId('quick-back-to-pins')).toBeTruthy();
    fireEvent.press(view.getByTestId('quick-back-to-pins'));
    expect(names(view)[0]).toBe('Pollo al horno');
  });

  it('search finds every active saved meal (pinned or not) once, and clearing returns to where it started', async () => {
    const { view } = await setup({ pins: ok(snap(1, [ID(6)])) });
    const search = view.getByLabelText('Buscar en tus comidas');
    fireEvent.changeText(search, 'CON');
    expect(names(view)).toEqual(['Avena con banana', 'Café con leche', 'Tostadas con palta']);
    expect(view.getByText('3 resultados')).toBeTruthy();
    fireEvent.changeText(search, '');
    expect(names(view)).toEqual(['Café con leche']);
    fireEvent.press(view.getByTestId('quick-all-meals'));
    fireEvent.changeText(search, 'ñoq'); expect(names(view)).toEqual(['Ñoquis caseros']);
    fireEvent.changeText(search, 'xyz'); expect(view.getByText('No encontramos comidas con esa búsqueda.')).toBeTruthy();
    fireEvent.changeText(search, ''); expect(names(view)).toHaveLength(6); expect(view.getByTestId('quick-back-to-pins')).toBeTruthy();
  });

  it('reviewing a meal and coming back keeps the query, the view and the same list (its scroll position)', async () => {
    const { view, quick } = await setup({ pins: ok(snap(1, [ID(6)])) });
    fireEvent.press(view.getByTestId('quick-all-meals'));
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
    // Clearing the query lands in the view it came from: the library, with the way back to pins.
    fireEvent.changeText(view.getByLabelText('Buscar en tus comidas'), '');
    expect(view.getByTestId('quick-back-to-pins')).toBeTruthy(); expect(names(view)).toHaveLength(6);
  });

  it('the + adds immediately from pins, library or search, with the #481 row and the same single write', async () => {
    const { view, quickApi } = await setup({ pins: ok(snap(1, [ID(5)])) });
    const add = view.getByLabelText('Agregar Pollo al horno');
    expect(StyleSheet.flatten(add.props.style)).toMatchObject({ width: 44, height: 44 });
    expect(StyleSheet.flatten(within(add).getByTestId('quick-add-disc').props.style)).toMatchObject({ width: 36, height: 36, borderRadius: 18 });
    expect(StyleSheet.flatten(view.getByText('Pollo al horno').props.style)).toMatchObject({ fontSize: 17, fontWeight: '400' });
    await act(async () => { fireEvent.press(add); });
    await waitFor(() => expect(quickApi.confirm).toHaveBeenCalledTimes(1));
    expect(quickApi.options).toHaveBeenCalledTimes(1); expect(quickApi.preview).toHaveBeenCalledTimes(1);
  });
});

describe('#479 C · explicit pin management', () => {
  it('nothing is pinned without an action; manage mode pins, reorders and unpins as whole lists', async () => {
    const { view, pinsApi } = await setup({ pins: ok(snap(2, [ID(5), ID(1)])) });
    expect(pinsApi.write).not.toHaveBeenCalled();
    fireEvent.press(view.getByTestId('quick-pins-manage'));
    expect(view.getByText('Listo')).toBeTruthy();
    await act(async () => { fireEvent.press(view.getByTestId(`quick-pin-down-${ID(5)}`)); });
    expect(pinsApi.write).toHaveBeenLastCalledWith({ savedMealIds: [ID(1), ID(5)], expectedRevision: 2, idempotencyKey: 'pins-1' });
    fireEvent.press(view.getByTestId('quick-all-meals'));
    await act(async () => { fireEvent.press(view.getByTestId(`quick-pin-toggle-${ID(4)}`)); });
    expect(pinsApi.write).toHaveBeenLastCalledWith({ savedMealIds: [ID(1), ID(5), ID(4)], expectedRevision: 3, idempotencyKey: 'pins-2' });
    expect(view.getByTestId(`quick-pin-toggle-${ID(4)}`).props.accessibilityState).toMatchObject({ selected: true });
    await act(async () => { fireEvent.press(view.getByTestId(`quick-pin-toggle-${ID(1)}`)); });
    expect(pinsApi.write).toHaveBeenLastCalledWith({ savedMealIds: [ID(5), ID(4)], expectedRevision: 4, idempotencyKey: 'pins-3' });
    // In manage mode the + gives way to the pin toggle; «Listo» brings the + back.
    expect(view.queryByLabelText('Agregar Café con leche')).toBeNull();
    fireEvent.press(view.getByTestId('quick-pins-manage'));
    expect(view.getByLabelText('Agregar Café con leche')).toBeTruthy();
  });

  it('long press and VoiceOver actions are alternatives to each other and to manage mode', async () => {
    const sheet = jest.spyOn(ActionSheetIOS, 'showActionSheetWithOptions').mockImplementation((options, pick) => pick(options.options.indexOf('Fijar en Rápido')));
    const alert = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => buttons?.find(b => b.text === 'Fijar en Rápido')?.onPress?.());
    const { view, pinsApi } = await setup({ pins: ok(snap(0, [])) });
    await act(async () => { fireEvent(view.getByLabelText('Revisar Café con leche'), 'longPress'); });
    expect(pinsApi.write).toHaveBeenLastCalledWith({ savedMealIds: [ID(6)], expectedRevision: 0, idempotencyKey: 'pins-1' });
    // Pinning the first meal from the library keeps the person in the library.
    expect(view.getByTestId('quick-back-to-pins')).toBeTruthy(); expect(names(view)).toHaveLength(6);
    const row = view.getByLabelText('Revisar Avena con banana');
    expect(row.props.accessibilityActions).toEqual([{ name: 'pin', label: 'Fijar' }]);
    await act(async () => { fireEvent(row, 'accessibilityAction', { nativeEvent: { actionName: 'pin' } }); });
    expect(pinsApi.write).toHaveBeenLastCalledWith({ savedMealIds: [ID(6), ID(2)], expectedRevision: 1, idempotencyKey: 'pins-2' });
    expect(view.getByLabelText('Revisar Avena con banana').props.accessibilityActions).toEqual([{ name: 'unpin', label: 'Desfijar' }, { name: 'up', label: 'Subir' }]);
    sheet.mockRestore(); alert.mockRestore();
  });

  it('archived and deleted pins keep their place, are never offered for adding, and can be released explicitly', async () => {
    const six = [ID(1), ID(90), ID(2), ID(91), ID(3), ID(4)];
    const { view, pinsApi } = await setup({ pins: ok(snap(5, six, { [ID(90)]: 'archived', [ID(91)]: 'deleted' })) });
    expect(view.getByText('Comida archivada')).toBeTruthy(); expect(view.getByText('Comida eliminada')).toBeTruthy();
    expect(view.queryAllByLabelText(/^Agregar /)).toHaveLength(4);
    // Six places taken (two by unavailable meals): nothing else can be pinned.
    fireEvent.press(view.getByTestId('quick-pins-manage')); fireEvent.press(view.getByTestId('quick-all-meals'));
    expect(view.getByTestId(`quick-pin-toggle-${ID(5)}`).props.accessibilityState).toMatchObject({ disabled: true });
    fireEvent.press(view.getByTestId('quick-back-to-pins'));
    await act(async () => { fireEvent.press(within(view.getByTestId(`quick-pin-gone-${ID(90)}`)).getByText('Liberar lugar')); });
    expect(pinsApi.write).toHaveBeenLastCalledWith({ savedMealIds: [ID(1), ID(2), ID(91), ID(3), ID(4)], expectedRevision: 5, idempotencyKey: 'pins-1' });
  });

  it('pending, unconfirmed, conflict and storage states are explicit; recovery and reapply are decisions', async () => {
    const pending = await setup({ pins: ok(snap(1, [ID(1)])) });
    let release!: () => void;
    pending.pinsApi.write.mockImplementationOnce(w => new Promise(resolve => { release = () => resolve({ status: 'unavailable', reason: 'network', meta }); void w; }));
    fireEvent.press(pending.view.getByTestId('quick-pins-manage')); fireEvent.press(pending.view.getByTestId('quick-all-meals'));
    act(() => { fireEvent.press(pending.view.getByTestId(`quick-pin-toggle-${ID(2)}`)); });
    await waitFor(() => expect(pending.view.getByText('Guardando tus fijadas…')).toBeTruthy());
    expect(pending.view.queryByTestId('quick-pins-manage')).toBeNull();
    await act(async () => { release(); });
    expect(pending.view.getByTestId('quick-pins-uncertain')).toBeTruthy();
    const first = pending.pinsApi.write.mock.calls[0]![0];
    await act(async () => { fireEvent.press(pending.view.getByText('Comprobar')); });
    expect(pending.pinsApi.write.mock.calls[1]![0]).toEqual(first);
    expect(pending.view.queryByTestId('quick-pins-uncertain')).toBeNull();

    const conflict = await setup({ pins: ok(snap(1, [ID(1)])) });
    conflict.pinsApi.write.mockResolvedValueOnce({ status: 'conflict', code: 'QUICK_PINS_CHANGED', message: 'm',
      data: { error: 'QUICK_PINS_CHANGED', message: 'm', current: snap(2, [ID(3)]) }, meta: { ...meta, httpStatus: 409, outcome: 'conflict' } });
    fireEvent.press(conflict.view.getByTestId('quick-pins-manage')); fireEvent.press(conflict.view.getByTestId('quick-all-meals'));
    await act(async () => { fireEvent.press(conflict.view.getByTestId(`quick-pin-toggle-${ID(2)}`)); });
    expect(conflict.view.getByTestId('quick-pins-conflict')).toBeTruthy();
    expect(conflict.view.getByText('Tu cambio: Tostadas con palta, Avena con banana.')).toBeTruthy();
    fireEvent.press(conflict.view.getByTestId('quick-back-to-pins'));
    expect(names(conflict.view)).toEqual(['Ñoquis caseros']);
    await act(async () => { fireEvent.press(conflict.view.getByText('Aplicar mi cambio')); });
    expect(conflict.pinsApi.write).toHaveBeenLastCalledWith({ savedMealIds: [ID(1), ID(2)], expectedRevision: 2, idempotencyKey: 'pins-2' });
    expect(conflict.view.queryByTestId('quick-pins-conflict')).toBeNull();

    const blocked = await setup({ pins: ok(snap(0, [])), intent: { version: 1 } });
    expect(blocked.view.getByTestId('quick-pins-blocked')).toBeTruthy(); expect(blocked.view.queryByTestId('quick-pins-manage')).toBeNull();
    expect(names(blocked.view)).toHaveLength(6);
  });

  it('an unconfirmed intent from an earlier session shows the person\'s list as unconfirmed, with Comprobar', async () => {
    const { view, pinsApi } = await setup({ pins: ok(snap(0, [])), intent: { version: 1, intent: { savedMealIds: [ID(4)], expectedRevision: 0, idempotencyKey: 'pins-old' }, base: snap(0, []) } });
    expect(view.getByTestId('quick-pins-uncertain')).toBeTruthy();
    expect(names(view)).toEqual(['Ensalada de atún']);
    await act(async () => { fireEvent.press(view.getByText('Comprobar')); });
    expect(pinsApi.write).toHaveBeenCalledWith({ savedMealIds: [ID(4)], expectedRevision: 0, idempotencyKey: 'pins-old' });
  });
});

describe('#479 C · 10, 50 and 200 saved meals', () => {
  const words = ['Arroz', 'Batido', 'Calabaza', 'Dulce', 'Ensalada', 'Fideos', 'Guiso', 'Hamburguesa', 'Licuado', 'Milanesa', 'Ñoquis', 'Omelette', 'Pollo', 'Queso', 'Ravioles', 'Sopa', 'Tarta', 'Yogur', 'Zapallo'];
  const many = (count: number) => Array.from({ length: count }, (_, n) => meal(n + 1, `${words[n % words.length]} ${String(n + 1).padStart(3, '0')}`));
  it.each([10, 50, 200])('%i meals: a bounded window of rows, search over all of them, letters, and no extra GET', async count => {
    const scroll = jest.spyOn(SectionList.prototype, 'scrollToLocation').mockImplementation(() => {});
    const { view, quickApi, pinsApi } = await setup({ meals: many(count), pins: ok(snap(1, [ID(count)])) });
    fireEvent.press(view.getByTestId('quick-all-meals'));
    expect(names(view).length).toBeLessThanOrEqual(Math.min(count, 30));
    expect(names(view)[0]).toBe('Arroz 001');
    if (count >= 12) {
      fireEvent.press(view.getByTestId('quick-letter-Z'));
      const zIndex = librarySections(many(count)).findIndex(s => s.key === 'Z');
      expect(scroll).toHaveBeenLastCalledWith({ sectionIndex: zIndex, itemIndex: 0, viewPosition: 0, animated: false });
    } else expect(view.queryByTestId('quick-letters')).toBeNull();
    const last = many(count).at(-1)!.name;
    fireEvent.changeText(view.getByLabelText('Buscar en tus comidas'), last.toLowerCase());
    expect(names(view)).toEqual([last]);
    fireEvent.changeText(view.getByLabelText('Buscar en tus comidas'), '');
    expect(quickApi.options).toHaveBeenCalledTimes(1); expect(pinsApi.read).not.toHaveBeenCalled(); expect(pinsApi.write).not.toHaveBeenCalled();
    scroll.mockRestore();
  });
});
