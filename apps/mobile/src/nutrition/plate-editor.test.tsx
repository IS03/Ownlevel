import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { describe, expect, it, jest } from '@jest/globals';
import { Alert, Keyboard, Platform, type KeyboardEvent } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { OwnlevelThemeProvider } from '@/design-system';
import type { PersonalFood } from '@/api/nutrition-food';
import type { QuickSelection } from '@/api/nutrition-quick';
import { personalFood } from './food-fixture.test-helper';
import { quickOption, quickOptions } from './quick-fixture.test-helper';
import { nutritionFixture } from './day-fixture.test-helper';
import { PlateEditor } from './plate-editor';
import { PlateController, type PlateApi } from './plate-controller';
import { PlateIntentRepository } from './plate-storage';
jest.mock('./day-resource', () => ({ useNutritionDayResource: () => ({ state: { status: 'loading' } }) }));
jest.mock('@/api', () => ({ useMobileApi: () => ({ client: null }) }));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));

/** Synthetic foods only. */
const DATE = '2026-11-20', meta = { durationMs: 1, httpStatus: 200, outcome: 'ok' as const };
const food = (n: number, patch: Partial<PersonalFood>): PersonalFood => ({ ...personalFood, id: `42200000-0000-4000-8000-00000000020${n}`, version: String(n).repeat(64), ...patch });
const bread = food(1, { name: 'PAN LACTAL', servingQuantity: 1, servingUnit: 'rebanada', calories: 65.5, proteinG: 2.2, carbsG: 12, fatG: 0.8 });
const cheese = food(2, { name: 'QUESO CREMA', servingQuantity: 100, servingUnit: 'g', calories: 220, proteinG: 6, carbsG: 4, fatG: 20 });
const empty = food(3, { name: 'SIN DATOS', calories: null });
const yogurt = { ...quickOption(), source: { kind: 'saved' as const, id: '42100000-0000-4000-8000-0000000000d1', version: 'd'.repeat(64) }, name: 'YOGUR CON GRANOLA', calories: 180 };
function fixture() {
  const map = new Map<string, string>();
  const api: PlateApi = {
    foods: jest.fn<PlateApi['foods']>().mockResolvedValue({ status: 'ok', data: { foods: [bread, cheese, empty] }, meta } as never),
    saved: jest.fn<PlateApi['saved']>().mockResolvedValue({ status: 'ok', data: { ...quickOptions(), saved: { status: 'ok', items: [yogurt] } }, meta }),
    preview: jest.fn<PlateApi['preview']>().mockImplementation(async (s: QuickSelection) => ({ status: 'ok', meta, data: { status: 'preview', selection: s,
      snapshot: { title: 'MERIENDA', description: null, calories: 197, proteinG: 6.2, carbsG: 25.2, fatG: 7.6, precision: null, contextType: 'food_plate', sourceNote: null },
      items: s.quantities!.map(q => ({ id: q.itemId, label: 'X', quantity: q.quantity, unit: 'g', calories: 10, proteinG: 1, carbsG: 1, fatG: 1 })) } })),
    confirm: jest.fn<PlateApi['confirm']>().mockResolvedValue({ status: 'ok', data: { status: 'registered', operation: 'register', date: DATE, resourceId: '41100000-0000-4000-8000-000000000002', updatedAt: '2026-11-20T18:00:00.123456Z' }, meta }),
    read: jest.fn<PlateApi['read']>().mockImplementation(async d => ({ status: 'ok', data: nutritionFixture(d), meta })),
  };
  const c = new PlateController(api, new PlateIntentRepository({ getItem: async k => map.get(k) ?? null, setItem: async (k, v) => { map.set(k, v); }, removeItem: async k => { map.delete(k); } }, 'owner'), () => {});
  const ui = () => <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }}>
    <OwnlevelThemeProvider initialMode="light"><PlateEditor controller={c} state={c.getSnapshot()} /></OwnlevelThemeProvider>
  </SafeAreaProvider>;
  const view = render(ui());
  c.subscribe(() => view.rerender(ui()));
  return { c, api, view };
}

describe('Plato', () => {
  it('fills the plate from foods and saved meals, − / + in place, floats its total, and registers one meal', async () => {
    const { c, api, view } = fixture();
    await act(async () => { await c.initialize(); c.open(DATE); });
    // A food without calories cannot go in (unknown is not zero).
    expect(view.getByLabelText('Agregar SIN DATOS al plato').props.accessibilityState).toMatchObject({ disabled: true });
    expect(view.queryByTestId('plate-bar')).toBeNull();
    fireEvent.press(view.getByLabelText('Agregar PAN LACTAL al plato'));
    // Once in the plate its «+» becomes its amount: the next tap adds a slice, never a hidden extra on a tick.
    expect(view.queryByLabelText('Agregar PAN LACTAL al plato')).toBeNull();
    fireEvent.press(view.getByLabelText('Sumar PAN LACTAL'));
    expect(view.getByText('rebanadas')).toBeTruthy();
    fireEvent.press(view.getByLabelText('Agregar QUESO CREMA al plato'));
    fireEvent.press(view.getByText('Comidas guardadas'));
    fireEvent.press(view.getByLabelText('Agregar YOGUR CON GRANOLA al plato'));
    // 2 × 65,5 + 100 g × 220/100 + 1 × 180 = 531 kcal, instantly.
    expect(view.getByLabelText('Ver el plato: 3 ingredientes, 531 kcal')).toBeTruthy();
    await act(async () => { fireEvent.press(view.getByTestId('plate-bar')); });
    fireEvent.changeText(view.getByTestId('plate-title'), 'Merienda');
    fireEvent.changeText(view.getByLabelText('Cantidad de QUESO CREMA'), '30');
    await waitFor(() => expect(view.getByTestId('plate-total')).toBeTruthy());
    await act(async () => { fireEvent.press(view.getByText(/Registrar plato · 197 kcal/)); });
    await waitFor(() => expect(view.queryByTestId('plate-editor')).toBeNull());
    expect(api.confirm).toHaveBeenCalledWith(expect.objectContaining({ operation: 'register', source: { kind: 'plate', title: 'Merienda', saveToLibrary: false },
      quantities: [{ itemId: bread.id, quantity: 2, version: bread.version }, { itemId: cheese.id, quantity: 30, version: cheese.version },
        { itemId: yogurt.source.id, quantity: 1, version: yogurt.source.version, kind: 'saved' }] }));
  });
  it('keeps review actions outside the scroll, hides them with the keyboard and clears only after confirmation', async () => {
    const listeners = new Map<string, (event: KeyboardEvent) => void>();
    const keyboard = jest.spyOn(Keyboard, 'addListener').mockImplementation((event, cb) => {
      listeners.set(event, cb);
      return { remove: () => { listeners.delete(event); } } as ReturnType<typeof Keyboard.addListener>;
    });
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    try {
      const { c, api, view } = fixture();
      await act(async () => { await c.initialize(); c.open(DATE); });
      fireEvent.press(view.getByLabelText('Agregar PAN LACTAL al plato'));
      fireEvent.press(view.getByTestId('plate-bar'));
      expect(view.getByTestId('meal-review-footer')).toBeTruthy();
      expect(view.getByTestId('meal-review-scroll').findAllByProps({ testID: 'plate-review-actions' })).toHaveLength(0);
      act(() => listeners.get(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow')?.({} as KeyboardEvent));
      expect(view.queryByTestId('plate-review-actions')).toBeNull();
      expect(view.getByTestId('plate-title')).toBeTruthy();
      act(() => listeners.get('keyboardDidHide')?.({} as KeyboardEvent));
      fireEvent.press(view.getByRole('button', { name: 'Vaciar plato' }));
      expect(c.getSnapshot().draft?.items).toHaveLength(1);
      const confirmation = alert.mock.calls.at(-1)?.[2]?.find(action => action.style === 'destructive');
      act(() => confirmation?.onPress?.());
      expect(c.getSnapshot().draft?.items).toHaveLength(0);
      expect(api.confirm).not.toHaveBeenCalled();
    } finally { keyboard.mockRestore(); alert.mockRestore(); }
  });
  it('searches the foods without accents or case and closes keeping the plate', async () => {
    const { c, view } = fixture();
    await act(async () => { await c.initialize(); c.open(DATE); });
    fireEvent.changeText(view.getByLabelText('Buscar en tus alimentos'), 'queso');
    expect(view.queryByTestId(`plate-food-${bread.id}`)).toBeNull();
    fireEvent.press(view.getByLabelText('Agregar QUESO CREMA al plato'));
    act(() => { c.close(); });
    expect(view.queryByTestId('plate-editor')).toBeNull();
    await act(async () => { c.open(DATE); });
    expect(view.getByLabelText('Cantidad de QUESO CREMA').props.value).toBe('100');
  });
});
