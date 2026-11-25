import { describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render, renderHook } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { OwnlevelThemeProvider } from '@/design-system';
import { ManualMealEntry } from './manual-meal-entry';
import { useSyncExternalStore } from 'react';
import type { PersonalFood } from '@/api/nutrition-food';
import { personalFood } from './food-fixture.test-helper';
import { quickOptions } from './quick-fixture.test-helper';
import { nutritionFixture } from './day-fixture.test-helper';
import { MealController, type MealApi } from './meal-controller';
import { MealIntentRepository } from './meal-storage';
import { mealDraft } from './meal-form-model';
import { MEAL_ACTIVITY_MS, MEAL_DISCARD, mealActivityState } from './meal-activity-model';
import { PlateController, type PlateApi } from './plate-controller';
import { PlateIntentRepository } from './plate-storage';
import { plateDraft, withSource } from './plate-model';
import { parseUnfinishedMeals, UnfinishedMealRepository } from './unfinished-meal-storage';
import { UnfinishedMealContext, useUnfinishedMeals } from './use-unfinished-meals';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('@react-native-async-storage/async-storage', () => jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'));

const TODAY = '2026-11-25', meta = { durationMs: 1, httpStatus: 200, outcome: 'ok' as const };
const bread: PersonalFood = { ...personalFood, id: '42200000-0000-4000-8000-000000000101', version: '1'.repeat(64), name: 'PAN', servingQuantity: 1, servingUnit: 'rebanada', calories: 65 };
const plateWithBread = () => withSource(plateDraft(TODAY), { kind: 'food', food: bread });
const manual = (patch: Partial<ReturnType<typeof mealDraft>> = {}) => ({ ...mealDraft(TODAY), title: 'TOSTADAS', calories: '320', ...patch });
const memory = () => {
  const map = new Map<string, string>();
  return { map, port: { getItem: async (k: string) => map.get(k) ?? null, setItem: async (k: string, v: string) => { map.set(k, v); }, removeItem: async (k: string) => { map.delete(k); } } };
};
const settle = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };

describe('unfinished meals storage (#645)', () => {
  it('keeps a plate with items and a manual meal per account, and forgets an empty plate', async () => {
    const { map, port } = memory(); let clock = 1000;
    const repository = new UnfinishedMealRepository(port, 'owner@x', () => clock);
    await repository.writePlate(plateWithBread()); clock = 2000; await repository.writeManual(manual());
    expect([...map.keys()]).toEqual(['ownlevel.nutrition.unfinished.v1.owner%40x']);
    const read = await repository.read();
    expect(read.plate).toMatchObject({ savedAt: 1000, draft: { items: [{ quantity: '1' }] } }); expect(read.manual).toMatchObject({ savedAt: 2000, draft: { title: 'TOSTADAS' } });
    await repository.writePlate(plateDraft(TODAY)); expect((await repository.read()).plate).toBeNull();
    await repository.writeManual(null); expect(map.size).toBe(0);
  });
  it('a damaged record reads as nothing left', () => {
    expect(parseUnfinishedMeals({ plate: { draft: { nope: 1 }, savedAt: 1 }, manual: { draft: manual(), savedAt: -1 } })).toEqual({ plate: null, manual: null });
    expect(parseUnfinishedMeals('x')).toEqual({ plate: null, manual: null });
  });
});

describe('«Comida sin terminar» activity (#645)', () => {
  it('shows the latest one left, with only what its draft holds', () => {
    const state = mealActivityState({ plate: { draft: plateWithBread(), savedAt: 1000 }, manual: { draft: manual(), savedAt: 2000 } }, { plate: false, manual: false }, TODAY, 3000);
    expect(state).toMatchObject({ sessionId: 'manual:2000', props: { kind: 'manual', title: 'TOSTADAS', detail: '320 kcal', day: 'Hoy', until: 2000 + MEAL_ACTIVITY_MS } });
    const plate = mealActivityState({ plate: { draft: plateWithBread(), savedAt: 1000 }, manual: null }, { plate: false, manual: false }, '2026-11-26', 3000);
    expect(plate?.props).toMatchObject({ kind: 'plate', detail: '1 elemento en el plato', day: 'Ayer' });
    // No calories typed: no made-up kcal.
    expect(mealActivityState({ plate: null, manual: { draft: manual({ calories: '' }), savedAt: 1 } }, { plate: false, manual: false }, TODAY, 2)?.props.detail).toBeNull();
  });
  it('not while its own sheet is open, and not after eight hours', () => {
    const meals = { plate: { draft: plateWithBread(), savedAt: 1000 }, manual: null };
    expect(mealActivityState(meals, { plate: true, manual: false }, TODAY, 2000)).toBeNull();
    expect(mealActivityState(meals, { plate: false, manual: false }, TODAY, 1000 + MEAL_ACTIVITY_MS)).toBeNull();
  });
});

function controllers(port: ReturnType<typeof memory>['port']) {
  const plateApi: PlateApi = {
    foods: jest.fn<PlateApi['foods']>().mockResolvedValue({ status: 'ok', data: { foods: [bread] }, meta } as never),
    saved: jest.fn<PlateApi['saved']>().mockResolvedValue({ status: 'ok', data: quickOptions(), meta }),
    preview: jest.fn<PlateApi['preview']>(), confirm: jest.fn<PlateApi['confirm']>(),
    read: jest.fn<PlateApi['read']>().mockImplementation(async d => ({ status: 'ok', data: nutritionFixture(d), meta })),
  };
  const mealApi: MealApi = { mutate: jest.fn<MealApi['mutate']>(), read: jest.fn<MealApi['read']>().mockImplementation(async d => ({ status: 'ok', data: nutritionFixture(d), meta })) };
  const plate = new PlateController(plateApi, new PlateIntentRepository(port, 'owner'), () => undefined);
  const meals = new MealController(mealApi, new MealIntentRepository(port, 'owner'), () => undefined);
  return { plate, meals, mealApi };
}

describe('Continuar carga (#645)', () => {
  function setup(port = memory().port) {
    const { plate, meals } = controllers(port);
    const sync = jest.fn<(state: unknown) => Promise<void>>(async () => undefined);
    let send: ((event: { target?: string; timestamp?: number }) => void) | null = null;
    const listen = (listener: typeof send & object) => { send = listener; return { remove: jest.fn() }; };
    const view = renderHook(() => {
      const plateState = useSyncExternalStore(plate.subscribe, plate.getSnapshot);
      const mealState = useSyncExternalStore(meals.subscribe, meals.getSnapshot);
      return useUnfinishedMeals({ userId: 'owner', plate: { controller: plate, state: plateState }, meals: { controller: meals, state: mealState }, today: TODAY,
        listen, sync: sync as never, storage: port });
    });
    return { plate, meals, sync, view, port, discard: (timestamp: number) => send?.({ target: MEAL_DISCARD, timestamp }) };
  }
  it('keeps the plate across a restart, brings it back closed, and offers it as «Plato sin terminar»', async () => {
    const { port } = memory();
    const first = setup(port);
    await act(async () => { await first.plate.initialize(); await first.meals.initialize(); await settle(); });
    act(() => { first.plate.open(TODAY); first.plate.add({ kind: 'food', food: bread }); first.plate.close(); });
    await act(settle);
    expect(first.sync).toHaveBeenLastCalledWith(expect.objectContaining({ props: expect.objectContaining({ kind: 'plate', detail: '1 elemento en el plato' }) }));
    first.view.unmount();
    expect(first.sync).toHaveBeenLastCalledWith(null);
    const second = setup(port);
    await act(async () => { await second.plate.initialize(); await second.meals.initialize(); await settle(); });
    expect(second.plate.getSnapshot()).toMatchObject({ open: false, draft: { items: [{ quantity: '1' }] } });
    act(() => second.view.result.current.resume()); await act(settle);
    expect(second.plate.getSnapshot().open).toBe(true);
    // While its sheet is open, the activity goes.
    expect(second.sync).toHaveBeenLastCalledWith(null);
  });
  it('a manual meal left for later comes back as it was; discarding from the activity drops only that draft', async () => {
    const s = setup();
    await act(async () => { await s.plate.initialize(); await s.meals.initialize(); await settle(); });
    act(() => s.view.result.current.park(manual())); await act(settle);
    expect(s.sync).toHaveBeenLastCalledWith(expect.objectContaining({ props: expect.objectContaining({ kind: 'manual', title: 'TOSTADAS', detail: '320 kcal' }) }));
    act(() => s.view.result.current.resume()); await act(settle);
    expect(s.meals.getSnapshot().editor).toMatchObject({ mealId: null, draft: { title: 'TOSTADAS', calories: '320' } });
    expect(s.meals.dirty()).toBe(true);
    // Left again for later: still kept.
    act(() => { s.view.result.current.park(s.meals.getSnapshot().editor!.draft); s.meals.close(); }); await act(settle);
    expect(s.view.result.current.stored?.manual).not.toBeNull();
    act(() => s.discard(1)); act(() => s.discard(1)); await act(settle);
    expect(s.view.result.current.stored?.manual).toBeNull(); expect(s.sync).toHaveBeenLastCalledWith(null);
  });
  it('a resumed manual meal closed with «Descartar» is no longer kept', async () => {
    const s = setup();
    await act(async () => { await s.plate.initialize(); await s.meals.initialize(); await settle(); });
    act(() => s.view.result.current.park(manual())); await act(settle);
    act(() => s.view.result.current.resume()); await act(settle);
    act(() => s.meals.close()); await act(settle);
    expect(s.view.result.current.stored?.manual).toBeNull();
  });
});

describe('controllers take a kept draft back (#645)', () => {
  it('the plate only when it has none of its own; a manual meal only with no sheet open', async () => {
    const { port } = memory(); const { plate, meals } = controllers(port);
    await plate.initialize(); await meals.initialize();
    expect(plate.restore(plateDraft(TODAY))).toBe(false);
    expect(plate.restore(plateWithBread())).toBe(true); expect(plate.restore(plateWithBread())).toBe(false);
    expect(meals.resume(manual())).toBe(true); expect(meals.resume(manual())).toBe(false);
  });
});

describe('«Dejar para después» in the manual sheet (#645)', () => {
  const screen = (meals: MealController, park: (draft: ReturnType<typeof mealDraft>) => void) => {
    function Entry() { const state = useSyncExternalStore(meals.subscribe, meals.getSnapshot); return <ManualMealEntry controller={meals} state={state} />; }
    return render(<GestureHandlerRootView><SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }}>
      <OwnlevelThemeProvider initialMode="light"><UnfinishedMealContext.Provider value={{ park }}><Entry /></UnfinishedMealContext.Provider></OwnlevelThemeProvider>
    </SafeAreaProvider></GestureHandlerRootView>);
  };
  it('a new meal with changes offers to keep it for later; it keeps exactly what was typed', async () => {
    const { port } = memory(); const { meals } = controllers(port); await meals.initialize();
    const park = jest.fn(); const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    act(() => { meals.open(TODAY); meals.change('title', 'TOSTADAS'); meals.change('calories', '320'); });
    const view = screen(meals, park);
    fireEvent.press(view.getByLabelText('Cerrar Cargar a mano'));
    const [title, , buttons] = alert.mock.calls[0] as [string, string, { text: string; onPress?: () => void }[]];
    expect(title).toBe('¿Dejar la comida para después?'); expect(buttons.map(button => button.text)).toEqual(['Seguir editando', 'Dejar para después', 'Descartar']);
    act(() => buttons[1].onPress?.());
    expect(park).toHaveBeenCalledWith(expect.objectContaining({ title: 'TOSTADAS', calories: '320' })); expect(meals.getSnapshot().editor).toBeNull();
    alert.mockRestore();
  });
});
