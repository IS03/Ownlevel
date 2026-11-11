import { act, fireEvent, waitFor, within } from '@testing-library/react-native';
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { ActionSheetIOS, Alert, SectionList } from 'react-native';
import { BASE, ID, at, meta, names, ok, setup, snap, storage, synthetic } from './quick-library-fixture.test-helper';
import { quickPinsStorageKey } from './quick-pins-storage';
import type { QuickPins } from '@/api/nutrition-quick';

jest.mock('./day-resource', () => ({ useNutritionDayResource: () => ({ state: { status: 'loading' } }) }));
jest.mock('@/api', () => ({ useMobileApi: () => ({ client: null }) }));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));

// #479 D1 · regression audit of increments A–C. Rápido registers once per decision; pins never reach a PUT they should not;
// what the person must act on is never buried under a long library.
describe('#479 D1 · Rápido registers exactly once per decision', () => {
  it('a double tap on + is one preview, one write and one day re-read', async () => {
    const { view, quickApi } = await setup({ pins: ok(snap(0, [])) });
    const add = view.getByLabelText('Agregar Pollo al horno');
    await act(async () => { fireEvent.press(add); fireEvent.press(add); });
    await waitFor(() => expect(view.getByLabelText('Pollo al horno agregado')).toBeTruthy());
    expect(quickApi.preview).toHaveBeenCalledTimes(1); expect(quickApi.confirm).toHaveBeenCalledTimes(1); expect(quickApi.read).toHaveBeenCalledTimes(1);
  });
  it('+ on two different meals at once registers only the first; the second waits for its own decision', async () => {
    const { view, quickApi } = await setup({ pins: ok(snap(0, [])) });
    await act(async () => { fireEvent.press(view.getByLabelText('Agregar Pollo al horno')); fireEvent.press(view.getByLabelText('Agregar Café con leche')); });
    await waitFor(() => expect(view.getByLabelText('Pollo al horno agregado')).toBeTruthy());
    expect(quickApi.confirm).toHaveBeenCalledTimes(1);
    expect(quickApi.confirm.mock.calls[0]![0].source.id).toBe(ID(5));
    expect(view.getByLabelText('Agregar Café con leche').props.accessibilityState).toMatchObject({ disabled: false });
  });
  it('pinning, unpinning, reordering, searching and jumping never preview, register or re-read a day', async () => {
    const { view, quickApi, pinsApi } = await setup({ meals: synthetic(50), pins: ok(snap(1, [ID(3)])) });
    fireEvent.press(view.getByTestId('quick-pins-manage'));
    fireEvent.press(view.getByTestId('quick-all-meals'));
    await act(async () => { fireEvent.press(view.getByTestId(`quick-pin-toggle-${ID(4)}`)); });
    await act(async () => { fireEvent.press(view.getByTestId(`quick-pin-up-${ID(4)}`)); });
    await act(async () => { fireEvent.press(view.getByTestId(`quick-pin-toggle-${ID(3)}`)); });
    fireEvent.changeText(view.getByLabelText('Buscar en tus comidas'), 'ar');
    expect(pinsApi.write).toHaveBeenCalledTimes(3);
    expect(quickApi.preview).not.toHaveBeenCalled(); expect(quickApi.confirm).not.toHaveBeenCalled(); expect(quickApi.read).not.toHaveBeenCalled();
    expect(quickApi.options).toHaveBeenCalledTimes(1);
  });
  it('nothing is saved or pinned by itself: opening, closing, searching and receiving pins write nothing', async () => {
    const { view, quick, pins, quickApi, pinsApi } = await setup({ pins: ok(snap(0, [])) });
    fireEvent.changeText(view.getByLabelText('Buscar en tus comidas'), 'pollo'); fireEvent.changeText(view.getByLabelText('Buscar en tus comidas'), '');
    act(() => { pins.adopt(ok(snap(1, [ID(2)]))); pins.adopt({ status: 'unavailable' }); pins.adopt(ok(snap(2, [ID(2), ID(3)]))); });
    await act(async () => { quick.close(); quick.open('2026-10-03'); });
    expect(pinsApi.write).not.toHaveBeenCalled(); expect(quickApi.confirm).not.toHaveBeenCalled();
    expect(pins.getSnapshot().confirmed).toEqual(snap(2, [ID(2), ID(3)]));
  });
});

describe('#479 D1 · what the person must act on is not buried under a long library', () => {
  const sixHundred = synthetic(200);
  async function uncertainAdd() {
    const s = await setup({ meals: sixHundred, pins: ok(snap(0, [])) });
    s.quickApi.confirm.mockRejectedValueOnce(new Error('offline'));
    await act(async () => { fireEvent.press(s.view.getByLabelText(`Agregar ${sixHundred[0]!.name}`)); });
    await waitFor(() => expect(s.view.getByText('Comprobar intento guardado')).toBeTruthy());
    return s;
  }
  it('an unconfirmed registration shows its message and «Comprobar» above the rows, where the locked + buttons are', async () => {
    const { view, quick } = await uncertainAdd();
    expect(quick.getSnapshot().phase).toBe('uncertain');
    // Every + is locked: the reason has to be in sight, not 200 rows down.
    expect(view.getByLabelText(`Agregar ${sixHundred[1]!.name}`).props.accessibilityState).toMatchObject({ disabled: true });
    const firstRow = at(view, 'Revisar ');
    expect(at(view, 'Comprobar intento guardado')).toBeLessThan(firstRow);
    expect(at(view, 'Volver al día · conservar intento')).toBeLessThan(firstRow);
    expect(at(view, 'No sabemos si se guardó')).toBeLessThan(firstRow);
  });
  it('recovering from there still replays the same intent once', async () => {
    const { view, quickApi } = await uncertainAdd();
    const first = quickApi.confirm.mock.calls[0]![0];
    await act(async () => { fireEvent.press(view.getByText('Comprobar intento guardado')); });
    expect(quickApi.confirm).toHaveBeenCalledTimes(2); expect(quickApi.confirm.mock.calls[1]![0]).toEqual(first);
    await waitFor(() => expect(view.queryByText('Comprobar intento guardado')).toBeNull());
  });
  it('a source that changed while adding shows the conflict above the rows', async () => {
    const s = await setup({ meals: sixHundred, pins: ok(snap(0, [])) });
    s.quickApi.confirm.mockResolvedValueOnce({ status: 'conflict', code: 'QUICK_SOURCE_CHANGED', message: 'La comida cambió.', meta: { ...meta, httpStatus: 409, outcome: 'conflict' } });
    await act(async () => { fireEvent.press(s.view.getByLabelText(`Agregar ${sixHundred[0]!.name}`)); });
    await waitFor(() => expect(s.view.getByText('La comida cambió.')).toBeTruthy());
    expect(at(s.view, 'La comida cambió.')).toBeLessThan(at(s.view, 'Revisar '));
  });
  it('«Reintentar opciones» sits next to the error it answers, not after the last row', async () => {
    const s = await setup({ meals: sixHundred, pins: ok(snap(0, [])) });
    s.quickApi.options.mockResolvedValueOnce({ status: 'unavailable', reason: 'network', meta });
    await act(async () => { await s.quick.loadOptions(); });
    expect(s.view.getByText('No pudimos actualizar las opciones.')).toBeTruthy();
    expect(at(s.view, 'Reintentar opciones')).toBeLessThan(at(s.view, 'Revisar '));
    await act(async () => { fireEvent.press(s.view.getByText('Reintentar opciones')); });
    expect(s.quickApi.options).toHaveBeenCalledTimes(3);
    expect(s.view.queryByText('No pudimos actualizar las opciones.')).toBeNull();
  });
  it('the destination stays under the library, where it always was', async () => {
    const { view } = await setup({ meals: sixHundred, pins: ok(snap(0, [])) });
    expect(at(view, 'Destino ·')).toBeGreaterThan(at(view, 'Revisar '));
  });
});

describe('#479 D1 · with pins unavailable the library stays and no road leads to a PUT', () => {
  const stale = { status: 'unavailable' } as QuickPins;
  const olderIntent = { version: 1, intent: { savedMealIds: [ID(4)], expectedRevision: 0, idempotencyKey: 'pins-old' }, base: snap(0, []) };
  /** Every pin or library control on screen (not the meal actions or the day controls), plus the long press and the VoiceOver actions of every row. */
  const PIN_CONTROL = /^(Todas las comidas|Volver a fijadas|Ir a la letra|Administrar|Elegir fijadas|Listo|Comprobar|Aplicar mi cambio|Descartar|Liberar lugar|Subir |Bajar |Fijar |Desfijar )/;
  async function pressEverything(s: Awaited<ReturnType<typeof setup>>) {
    const sheet = jest.spyOn(ActionSheetIOS, 'showActionSheetWithOptions').mockImplementation(() => {});
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const labels = () => [...new Set(s.view.queryAllByRole('button').map(node => String(node.props.accessibilityLabel ?? '')).filter(label => PIN_CONTROL.test(label)))];
    // Fresh queries at every step: pressing one control re-renders the tree.
    for (let round = 0; round < 2; round++) for (const label of labels()) {
      for (let i = 0; i < s.view.queryAllByLabelText(label).length; i++) {
        const node = s.view.queryAllByLabelText(label)[i];
        if (node && !node.props.accessibilityState?.disabled) await act(async () => { fireEvent.press(node); });
      }
    }
    for (let i = 0; i < s.view.queryAllByLabelText(/^Revisar /).length; i++) {
      const row = () => s.view.queryAllByLabelText(/^Revisar /)[i]!;
      await act(async () => { fireEvent(row(), 'longPress'); });
      for (const action of row().props.accessibilityActions ?? []) await act(async () => { fireEvent(row(), 'accessibilityAction', { nativeEvent: { actionName: action.name } }); });
    }
    sheet.mockRestore(); alert.mockRestore();
  }
  it('pins never read (production today): the whole library, no pin control, nothing to press that writes', async () => {
    const s = await setup({ pins: stale });
    expect(names(s.view)).toHaveLength(6); expect(s.view.queryByTestId('quick-pins-manage')).toBeNull();
    expect(s.view.queryAllByLabelText(/^(Fijar|Desfijar|Subir|Bajar) /)).toHaveLength(0);
    await pressEverything(s);
    expect(s.pinsApi.write).not.toHaveBeenCalled();
  });
  it('a failed refresh after confirmed pins keeps them readable but not editable, and nothing writes', async () => {
    const s = await setup({ pins: ok(snap(3, [ID(1), ID(2)])) });
    act(() => { s.pins.adopt(stale); });
    expect(s.view.getByTestId('quick-pins-stale')).toBeTruthy(); expect(s.view.queryByTestId('quick-pins-manage')).toBeNull();
    expect(names(s.view)).toEqual(['Tostadas con palta', 'Avena con banana']);
    await pressEverything(s);
    for (const action of ['pin', 'unpin', 'up', 'down']) for (const row of s.view.queryAllByLabelText(/^Revisar /)) fireEvent(row, 'accessibilityAction', { nativeEvent: { actionName: action } });
    expect(s.pinsApi.write).not.toHaveBeenCalled();
    // The controller itself refuses too, whoever calls it.
    expect(await s.pins.pin(ID(5))).toBe('refused'); expect(await s.pins.unpin(ID(1))).toBe('refused'); expect(await s.pins.move(ID(2), 0)).toBe('refused'); expect(await s.pins.write([])).toBe('refused');
    expect(s.pinsApi.write).not.toHaveBeenCalled();
  });
  it('an unconfirmed change left from an earlier session is kept, but «Comprobar» (a PUT) is not offered until pins are readable', async () => {
    const s = await setup({ pins: stale, intent: olderIntent });
    expect(s.pins.getSnapshot()).toMatchObject({ phase: 'uncertain', availability: 'unavailable' });
    expect(s.view.getByTestId('quick-pins-uncertain')).toBeTruthy();
    expect(s.view.queryByText('Comprobar')).toBeNull();
    expect(s.view.getByText(/no están disponibles/i)).toBeTruthy();
    await s.pins.recover();
    await pressEverything(s);
    expect(s.pinsApi.write).not.toHaveBeenCalled();
    expect(JSON.parse(s.shared.map.get(quickPinsStorageKey('owner'))!).intent.idempotencyKey).toBe('pins-old');
    // Readable again: the same intent can be checked, with the same key.
    act(() => { s.pins.adopt(ok(snap(0, []))); });
    await act(async () => { fireEvent.press(s.view.getByText('Comprobar')); });
    expect(s.pinsApi.write).toHaveBeenCalledWith({ savedMealIds: [ID(4)], expectedRevision: 0, idempotencyKey: 'pins-old' });
  });
  it('«Dejar de esperar» is a local decision: it sends nothing, keeps what the person wanted and reads pins again', async () => {
    const s = await setup({ pins: stale, intent: olderIntent });
    await act(async () => { fireEvent.press(s.view.getByText('Dejar de esperar')); });
    expect(s.pinsApi.write).not.toHaveBeenCalled(); expect(s.shared.map.has(quickPinsStorageKey('owner'))).toBe(false);
    expect(s.pins.getSnapshot()).toMatchObject({ phase: 'idle', intent: null, wanted: [ID(4)] }); expect(s.pinsApi.read).toHaveBeenCalledTimes(1);
  });
  it('a conflict whose refresh then failed offers «Descartar» but not «Aplicar mi cambio»', async () => {
    const s = await setup({ pins: ok(snap(1, [ID(1)])) });
    s.pinsApi.write.mockResolvedValueOnce({ status: 'conflict', code: 'QUICK_PINS_CHANGED', message: 'm', data: { error: 'QUICK_PINS_CHANGED', message: 'm', current: snap(2, [ID(3)]) }, meta: { ...meta, httpStatus: 409, outcome: 'conflict' } });
    fireEvent.press(s.view.getByTestId('quick-pins-manage')); fireEvent.press(s.view.getByTestId('quick-all-meals'));
    await act(async () => { fireEvent.press(s.view.getByTestId(`quick-pin-toggle-${ID(2)}`)); });
    expect(s.view.getByText('Aplicar mi cambio')).toBeTruthy();
    act(() => { s.pins.adopt(stale); });
    expect(s.view.queryByText('Aplicar mi cambio')).toBeNull(); expect(s.view.getByText('Descartar')).toBeTruthy();
    expect(await s.pins.reapply()).toBe('refused');
    expect(s.pinsApi.write).toHaveBeenCalledTimes(1);
    // «Descartar» is a local decision and works without pins.
    fireEvent.press(s.view.getByText('Descartar')); expect(s.pins.getSnapshot()).toMatchObject({ phase: 'idle', wanted: null });
  });
  it('the registration + keeps working while pins are unavailable (it is another journal)', async () => {
    const s = await setup({ pins: stale });
    await act(async () => { fireEvent.press(s.view.getByLabelText('Agregar Café con leche')); });
    await waitFor(() => expect(s.view.getByLabelText('Café con leche agregado')).toBeTruthy());
    expect(s.quickApi.confirm).toHaveBeenCalledTimes(1); expect(s.pinsApi.write).not.toHaveBeenCalled();
  });
});

describe('#479 D1 · pin transitions from 0 to 6, with archived and deleted places', () => {
  const six = [ID(1), ID(2), ID(3), ID(4), ID(5), ID(6)];
  it.each([0, 1, 2, 3, 4, 5, 6])('%i pinned: the right entry, the right controls, and the limit of six', async count => {
    const ids = six.slice(0, count);
    const s = await setup({ pins: ok(snap(count + 1, ids)) });
    const manage = s.view.getByTestId('quick-pins-manage');
    expect(within(manage).getByText(count ? 'Administrar' : 'Elegir fijadas')).toBeTruthy();
    if (count) expect(s.view.getByText('Fijadas')).toBeTruthy(); else expect(s.view.queryByText('Fijadas')).toBeNull();
    expect(names(s.view)).toHaveLength(count || 6);
    fireEvent.press(manage); if (count) fireEvent.press(s.view.getByTestId('quick-all-meals'));
    const toggle = (n: number) => s.view.getByTestId(`quick-pin-toggle-${ID(n)}`);
    for (let n = 1; n <= 6; n++) expect(toggle(n).props.accessibilityState).toMatchObject({ selected: n <= count, disabled: n > count && count === 6 });
    // The first can never go up and the last can never go down.
    if (count > 1) { expect(s.view.getByTestId(`quick-pin-up-${ID(1)}`).props.accessibilityState?.disabled).toBe(true); expect(s.view.getByTestId(`quick-pin-down-${ID(count)}`).props.accessibilityState?.disabled).toBe(true); }
    if (count < 6) {
      await act(async () => { fireEvent.press(toggle(6)); });
      expect(s.pinsApi.write).toHaveBeenLastCalledWith({ savedMealIds: [...ids, ID(6)], expectedRevision: count + 1, idempotencyKey: 'pins-owner-1' });
    }
    if (count > 0) {
      await act(async () => { fireEvent.press(toggle(1)); });
      expect(s.pinsApi.write.mock.calls.at(-1)![0].savedMealIds).not.toContain(ID(1));
    }
  });
  it('six places taken (two by archived and deleted meals): a seventh meal cannot be pinned, by any road', async () => {
    const meals = [...BASE, { ...BASE[0]!, source: { ...BASE[0]!.source, id: ID(7) }, name: 'Séptima' }];
    const ids = [ID(1), ID(90), ID(2), ID(91), ID(3), ID(4)];
    const s = await setup({ meals, pins: ok(snap(4, ids, { [ID(90)]: 'archived', [ID(91)]: 'deleted' })) });
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {}), sheet = jest.spyOn(ActionSheetIOS, 'showActionSheetWithOptions').mockImplementation(() => {});
    fireEvent.press(s.view.getByTestId('quick-pins-manage')); fireEvent.press(s.view.getByTestId('quick-all-meals'));
    expect(s.view.getByTestId(`quick-pin-toggle-${ID(7)}`).props.accessibilityState).toMatchObject({ disabled: true });
    const row = s.view.getByLabelText('Revisar Séptima');
    expect(row.props.accessibilityActions).toEqual([]);
    await act(async () => { fireEvent(row, 'longPress'); });
    expect(alert).toHaveBeenCalledWith('Séptima', 'Ya tenés 6 fijadas. Desfijá una para fijar otra.'); expect(sheet).not.toHaveBeenCalled();
    fireEvent.press(s.view.getByTestId(`quick-pin-toggle-${ID(7)}`));
    expect(s.pinsApi.write).not.toHaveBeenCalled();
    // Releasing one unavailable place frees it for the seventh.
    fireEvent.press(s.view.getByTestId('quick-back-to-pins'));
    await act(async () => { fireEvent.press(within(s.view.getByTestId(`quick-pin-gone-${ID(91)}`)).getByText('Liberar lugar')); });
    fireEvent.press(s.view.getByTestId('quick-all-meals'));
    expect(s.view.getByTestId(`quick-pin-toggle-${ID(7)}`).props.accessibilityState).toMatchObject({ disabled: false });
    alert.mockRestore(); sheet.mockRestore();
  });
  it('an archived meal restored comes back in its place; a deleted one stays until released', async () => {
    const s = await setup({ pins: ok(snap(2, [ID(1), ID(90), ID(2)], { [ID(90)]: 'archived' })) });
    expect(names(s.view)).toEqual(['Tostadas con palta', 'Avena con banana']); expect(s.view.getByText('Comida archivada')).toBeTruthy();
    // The next GET after restoring: the same meal, active, between the same two.
    const restored = { ...BASE[0]!, source: { ...BASE[0]!.source, id: ID(90) }, name: 'Restaurada' };
    const options = s.quick.getSnapshot().options!;
    await act(async () => { s.quickApi.options.mockResolvedValueOnce({ status: 'ok', data: { ...options, saved: { status: 'ok', items: [...BASE, restored] }, pins: ok(snap(2, [ID(1), ID(90), ID(2)])) }, meta }); await s.quick.loadOptions(); });
    act(() => { s.pins.adopt(s.quick.getSnapshot().options!.pins); });
    expect(names(s.view)).toEqual(['Tostadas con palta', 'Restaurada', 'Avena con banana']); expect(s.view.queryByText('Comida archivada')).toBeNull();
    expect(s.pinsApi.write).not.toHaveBeenCalled();
  });
});

describe('#479 D1 · sign-out and account change', () => {
  it('another account on the same device sees nothing of an unconfirmed change, and cannot send it', async () => {
    const shared = storage();
    const a = await setup({ pins: ok(snap(0, [])), user: 'a', shared });
    a.pinsApi.write.mockResolvedValueOnce({ status: 'unavailable', reason: 'network', meta: { ...meta, httpStatus: null, outcome: 'unavailable' } });
    fireEvent.press(a.view.getByTestId('quick-pins-manage'));
    await act(async () => { fireEvent.press(a.view.getByTestId(`quick-pin-toggle-${ID(6)}`)); });
    expect(a.view.getByTestId('quick-pins-uncertain')).toBeTruthy();
    a.view.unmount(); a.pins.dispose(); a.quick.dispose();
    const b = await setup({ pins: ok(snap(5, [ID(2)])), user: 'b', shared });
    expect(b.view.queryByTestId('quick-pins-uncertain')).toBeNull(); expect(b.pins.getSnapshot()).toMatchObject({ phase: 'idle', intent: null });
    expect(names(b.view)).toEqual(['Avena con banana']);
    expect(b.pinsApi.write).not.toHaveBeenCalled();
    // The first account comes back and finds its own change, still unconfirmed, under its own key.
    b.view.unmount(); b.pins.dispose(); b.quick.dispose();
    const again = await setup({ pins: ok(snap(0, [])), user: 'a', shared });
    expect(again.view.getByTestId('quick-pins-uncertain')).toBeTruthy();
    expect(names(again.view)).toEqual(['Café con leche']);
  });
});

// «Ir a letra», as measured on the iOS simulator: one scrollToLocation does nothing when the letter is below what the list has
// measured (200 meals: «G» is item 85, 64 measured) and with sticky section headers the retry even ended at the top.
// The native behavior itself is checked on the simulator (docs/progress/qa/479-d1); here, the logic that copes with it.
describe('#479 D1 · «Ir a letra» keeps trying until the letter is measured, and gives way to the person', () => {
  const failing = (failures: number) => {
    let calls = 0;
    const scrollTo = jest.fn();
    const scrollToLocation = jest.spyOn(SectionList.prototype, 'scrollToLocation').mockImplementation(function (this: SectionList) {
      calls += 1;
      if (calls <= failures) this.props.onScrollToIndexFailed?.({ averageItemLength: 60, highestMeasuredFrameIndex: 10 * calls, index: 85 });
    });
    jest.spyOn(SectionList.prototype, 'getScrollResponder').mockReturnValue({ scrollTo } as never);
    return { scrollTo, scrollToLocation };
  };
  const list = (s: Awaited<ReturnType<typeof setup>>) => s.view.UNSAFE_getByType(SectionList);
  const letterG = (s: Awaited<ReturnType<typeof setup>>) => s.view.getByTestId('quick-letter-G');
  afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });

  it('the list has no sticky headers (with them iOS lands at the top)', async () => {
    const s = await setup({ meals: synthetic(200), pins: ok(snap(0, [])) });
    expect(list(s).props.stickySectionHeadersEnabled).toBe(false);
  });
  it('each pass that hits rows not measured yet goes near the letter, and the next pass tries again until one lands', async () => {
    const s = await setup({ meals: synthetic(200), pins: ok(snap(0, [])) });
    const { scrollTo, scrollToLocation } = failing(2);
    jest.useFakeTimers();
    act(() => { fireEvent.press(letterG(s)); });
    expect(scrollToLocation).toHaveBeenCalledTimes(1); expect(scrollTo).toHaveBeenLastCalledWith({ y: 60 * 85, animated: false });
    act(() => { jest.advanceTimersByTime(80); }); expect(scrollToLocation).toHaveBeenCalledTimes(2);
    act(() => { jest.advanceTimersByTime(80); }); expect(scrollToLocation).toHaveBeenCalledTimes(3);
    // The third pass found everything measured, but the offset still moved: one more to settle, then it stops by itself.
    act(() => { list(s).props.onScroll?.({ nativeEvent: { contentOffset: { y: 4800 } } }); });
    act(() => { jest.advanceTimersByTime(80); });
    act(() => { list(s).props.onScroll?.({ nativeEvent: { contentOffset: { y: 4800 } } }); });
    act(() => { jest.advanceTimersByTime(80); });
    const settled = scrollToLocation.mock.calls.length;
    act(() => { jest.advanceTimersByTime(1000); });
    expect(scrollToLocation).toHaveBeenCalledTimes(settled); expect(settled).toBeLessThanOrEqual(5);
    for (const call of scrollToLocation.mock.calls) expect(call[0]).toEqual({ sectionIndex: expect.any(Number), itemIndex: 0, viewPosition: 0, animated: false });
    // No request of any kind comes with it.
    expect(s.quickApi.options).toHaveBeenCalledTimes(1); expect(s.pinsApi.write).not.toHaveBeenCalled(); expect(s.pinsApi.read).not.toHaveBeenCalled();
  });
  it('it never loops forever, even when the rows never get measured', async () => {
    const s = await setup({ meals: synthetic(200), pins: ok(snap(0, [])) });
    const { scrollToLocation } = failing(1000);
    jest.useFakeTimers();
    act(() => { fireEvent.press(letterG(s)); });
    act(() => { jest.advanceTimersByTime(10_000); });
    expect(scrollToLocation.mock.calls.length).toBeLessThanOrEqual(8);
  });
  it('touching the list ends the jump: the person is in charge of the scroll', async () => {
    const s = await setup({ meals: synthetic(200), pins: ok(snap(0, [])) });
    const { scrollToLocation } = failing(1000);
    jest.useFakeTimers();
    act(() => { fireEvent.press(letterG(s)); });
    act(() => { list(s).props.onScrollBeginDrag?.({} as never); });
    act(() => { jest.advanceTimersByTime(2000); });
    expect(scrollToLocation).toHaveBeenCalledTimes(1);
  });
  it('searching, or a new jump, replaces the one in progress', async () => {
    const s = await setup({ meals: synthetic(200), pins: ok(snap(0, [])) });
    const { scrollToLocation } = failing(1000);
    jest.useFakeTimers();
    act(() => { fireEvent.press(letterG(s)); });
    act(() => { fireEvent.changeText(s.view.getByLabelText('Buscar en tus comidas'), 'ar'); });
    act(() => { jest.advanceTimersByTime(2000); });
    expect(scrollToLocation).toHaveBeenCalledTimes(1);
    act(() => { fireEvent.changeText(s.view.getByLabelText('Buscar en tus comidas'), ''); });
    act(() => { fireEvent.press(letterG(s)); }); act(() => { fireEvent.press(s.view.getByTestId('quick-letter-A')); });
    expect(scrollToLocation.mock.calls.at(-1)![0]).toMatchObject({ sectionIndex: 0 });
    act(() => { jest.advanceTimersByTime(80); });
    expect(scrollToLocation.mock.calls.slice(-1)[0]![0]).toMatchObject({ sectionIndex: 0 });
  });
});
