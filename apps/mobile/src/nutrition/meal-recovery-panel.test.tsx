import { useSyncExternalStore } from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { StyleSheet } from 'react-native';
import { OwnlevelThemeProvider } from '@/design-system';
import type { MealMutationReceipt } from '@/api/nutrition-meal';
import { MealController, type MealApi } from './meal-controller';
import { MealRecoveryPanel } from './meal-recovery-panel';
import { MealIntentRepository, type MealStoragePort } from './meal-storage';
import { nutritionFixture } from './day-fixture.test-helper';

let mockFontScale = 1;
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({ __esModule: true,
  default: () => ({ width: 390, height: 844, scale: 3, fontScale: mockFontScale }),
}));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
afterEach(() => { mockFontScale = 1; });

const date = '2026-10-02', version = '2026-10-02T12:00:00Z', id = '41200000-0000-4000-8000-000000000003';
const meta = { durationMs: 1, httpStatus: 200, outcome: 'ok' as const };
const failure = { status: 'unavailable' as const, reason: 'network' as const, meta: { durationMs: 1, httpStatus: null, outcome: 'unavailable' as const } };
const deleted: MealMutationReceipt = { status: 'deleted', mealId: id, sourceDate: date, destinationDate: date, updatedAt: '2026-10-02T13:00:00Z' };
const conflict = (code: 'MEAL_CHANGED' | 'MEAL_UNAVAILABLE', currentDate?: string) => ({ status: 'conflict' as const, code, message: code === 'MEAL_CHANGED' ? 'La comida fue editada.' : 'La comida ya no está disponible.',
  ...(currentDate ? { data: { error: code, message: 'x', currentDate } } : {}), meta: { ...meta, httpStatus: 409, outcome: 'conflict' as const } });
type Mutate = jest.Mock<MealApi['mutate']>; type Read = jest.Mock<MealApi['read']>;
function fixture() {
  const map = new Map<string, string>();
  const storage: MealStoragePort = { getItem: async k => map.get(k) ?? null, setItem: async (k, v) => { map.set(k, v); }, removeItem: async k => { map.delete(k); } };
  const repository = new MealIntentRepository(storage, 'owner');
  const day = nutritionFixture(date).nutrition;
  if (day.status !== 'ok' || day.data.dayState !== 'recorded') throw new Error('Bad fixture');
  const meal = { ...day.data.meals[0], id, updatedAt: version, sourceType: 'manual' as const, title: 'Pasta', calories: 250 };
  // What the server holds after somebody else edited the meal: the version a conflict's truth read finds.
  const served = { ...meal, updatedAt: '2026-10-02T14:00:00Z', title: 'Pasta cambiada', calories: 300 };
  const servedDay = (d: string) => { const data = nutritionFixture(d); if (data.nutrition.status === 'ok' && data.nutrition.data.dayState === 'recorded') data.nutrition.data.meals = [served]; return data; };
  const api: MealApi = { mutate: jest.fn<MealApi['mutate']>().mockResolvedValue({ status: 'ok', data: deleted, meta }),
    read: jest.fn<MealApi['read']>().mockImplementation(async d => ({ status: 'ok', data: servedDay(d), meta })) };
  const invalidate = jest.fn<(dates: string[]) => void>();
  const newKey = jest.fn(() => `intent:${newKey.mock.calls.length}`);
  const controller = new MealController(api, repository, invalidate, newKey);
  return { controller, api, mutate: api.mutate as Mutate, read: api.read as Read, repository, storage, map, invalidate, newKey, meal };
}
type Fixture = ReturnType<typeof fixture>;
function Harness({ controller, undoing }: { controller: MealController; undoing?: boolean }) {
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  return <MealRecoveryPanel controller={controller} state={state} undoing={undoing} />;
}
const show = (f: Fixture, undoing = false) => render(<OwnlevelThemeProvider initialMode="light"><Harness controller={f.controller} undoing={undoing} /></OwnlevelThemeProvider>);
const flat = (style: unknown) => StyleSheet.flatten(typeof style === 'function' ? (style as (s: { pressed: boolean }) => object)({ pressed: false }) : style as object) as Record<string, number>;
async function headlessDelete(f: Fixture) { await f.controller.initialize(); await f.controller.undo(f.meal, date); }
const snap = (f: Fixture) => f.controller.getSnapshot();
const press = async (view: ReturnType<typeof show>, name: string | RegExp) => { await act(async () => { fireEvent.press(view.getByRole('button', { name })); }); };

describe('#499 controller facts the recovery panel relies on', () => {
  it('a headless delete keeps its editor hidden while every non-success phase leaves it set', async () => {
    const f = fixture(); f.mutate.mockResolvedValueOnce(failure); await headlessDelete(f);
    expect(snap(f)).toMatchObject({ phase: 'uncertain', editor: { headless: true, mealId: id, expectedUpdatedAt: version } });
    expect(snap(f).intent?.intent).toMatchObject({ operation: 'delete', idempotencyKey: 'intent:1', expectedUpdatedAt: version });
  });
  it('recover() re-sends the very same stored intent object and key, never a new one', async () => {
    const f = fixture(); f.mutate.mockResolvedValueOnce(failure); await headlessDelete(f);
    await f.controller.recover();
    expect(f.mutate).toHaveBeenCalledTimes(2); expect(f.mutate.mock.calls[1][0]).toBe(f.mutate.mock.calls[0][0]);
    expect(f.newKey).toHaveBeenCalledTimes(1); expect(snap(f)).toMatchObject({ phase: 'idle', editor: null, intent: null });
  });
  it('close() from conflict clears editor, truth and phase, and touches neither storage nor the API', async () => {
    const f = fixture(); f.mutate.mockResolvedValueOnce(conflict('MEAL_CHANGED', date)); await headlessDelete(f);
    expect(snap(f)).toMatchObject({ phase: 'conflict', intent: null, truthDate: date, editor: { headless: true } }); expect(snap(f).truth).not.toBeNull();
    const reads = f.read.mock.calls.length, writes = jest.spyOn(f.storage, 'setItem'), removes = jest.spyOn(f.storage, 'removeItem');
    f.controller.close();
    expect(snap(f)).toMatchObject({ phase: 'idle', editor: null, intent: null, message: null, truth: null, truthDate: null });
    expect(f.mutate).toHaveBeenCalledTimes(1); expect(f.read.mock.calls.length).toBe(reads); expect(writes).not.toHaveBeenCalled(); expect(removes).not.toHaveBeenCalled();
  });
  it('reviewWithServerVersion() would keep the editor headless and adopt the server version: it must never be offered', async () => {
    const f = fixture(); f.mutate.mockResolvedValueOnce(conflict('MEAL_CHANGED', date));
    await headlessDelete(f); expect(snap(f).truth?.updatedAt).toBe('2026-10-02T14:00:00Z');
    f.controller.reviewWithServerVersion();
    expect(snap(f)).toMatchObject({ phase: 'idle', editor: { headless: true, expectedUpdatedAt: '2026-10-02T14:00:00Z' } });
  });
  it('initialize() with nothing stored leaves a headless editor set; with a stored intent it builds a visible one', async () => {
    const f = fixture(); f.storage.setItem = async () => { throw new Error('full'); }; await headlessDelete(f);
    expect(snap(f)).toMatchObject({ phase: 'blocked', intent: null, editor: { headless: true } });
    await f.controller.initialize(); expect(snap(f)).toMatchObject({ phase: 'idle', intent: null, message: null, editor: { headless: true } });
    const g = fixture(); g.mutate.mockResolvedValueOnce(failure); await headlessDelete(g);
    const restored = new MealController(g.api, g.repository, g.invalidate); await restored.initialize();
    expect(restored.getSnapshot().editor).toMatchObject({ mealId: id, expectedUpdatedAt: version }); expect(restored.getSnapshot().editor?.headless).toBeUndefined();
    g.controller.showRecovery(); expect(g.controller.getSnapshot().editor?.headless).toBeUndefined();
  });
});

describe('MealRecoveryPanel', () => {
  it('shows nothing without a headless editor, while a delete runs, or after success', async () => {
    const f = fixture(); await f.controller.initialize();
    const view = show(f); expect(view.queryByTestId('meal-recovery-panel')).toBeNull();
    act(() => f.controller.open(date, f.meal)); expect(view.queryByTestId('meal-recovery-panel')).toBeNull();
    act(() => f.controller.close());
    await act(async () => { await f.controller.undo(f.meal, date); });
    expect(f.mutate).toHaveBeenCalledTimes(1); expect(view.queryByTestId('meal-recovery-panel')).toBeNull(); expect(snap(f).editor).toBeNull();
  });
  it('is not shown while the day says "Deshaciendo…" (pending or undoing), even if the state is already uncertain', async () => {
    const f = fixture(); let release!: (r: Awaited<ReturnType<MealApi['mutate']>>) => void;
    f.mutate.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
    await f.controller.initialize(); const view = show(f); let running!: Promise<void>;
    act(() => { running = f.controller.undo(f.meal, date); }); while (!release) await act(async () => { await Promise.resolve(); });
    expect(snap(f).phase).toBe('pending'); view.rerender(<OwnlevelThemeProvider initialMode="light"><Harness controller={f.controller} undoing /></OwnlevelThemeProvider>);
    expect(view.queryByTestId('meal-recovery-panel')).toBeNull();
    await act(async () => { release(failure); await running; });
    view.rerender(<OwnlevelThemeProvider initialMode="light"><Harness controller={f.controller} undoing /></OwnlevelThemeProvider>); expect(view.queryByTestId('meal-recovery-panel')).toBeNull();
    view.rerender(<OwnlevelThemeProvider initialMode="light"><Harness controller={f.controller} /></OwnlevelThemeProvider>); expect(view.getByText('Comprobar intento guardado')).toBeTruthy();
    expect(f.mutate).toHaveBeenCalledTimes(1);
  });
  it('uncertain: message as an alert and a 44+ pt button that replays the identical intent; success dismisses it and unlocks', async () => {
    const f = fixture(); f.mutate.mockResolvedValueOnce(failure); await headlessDelete(f); const view = show(f);
    const alert = view.getByRole('alert'); expect(alert.props.children).toMatch(/No sabemos si se guardó/);
    expect(view.getByTestId('meal-recovery-panel').children.length).toBe(2);
    const button = view.getByRole('button', { name: 'Comprobar intento guardado' }); expect(flat(button.props.style).minHeight).toBeGreaterThanOrEqual(44);
    expect(view.queryByRole('button', { name: 'Cerrar' })).toBeNull();
    await press(view, 'Comprobar intento guardado');
    expect(f.mutate).toHaveBeenCalledTimes(2); expect(f.mutate.mock.calls[1][0]).toBe(f.mutate.mock.calls[0][0]); expect(f.newKey).toHaveBeenCalledTimes(1);
    expect(view.queryByTestId('meal-recovery-panel')).toBeNull(); expect(snap(f)).toMatchObject({ phase: 'idle', editor: null, intent: null }); expect(await f.repository.read()).toBeNull();
  });
  it('two quick presses send once', async () => {
    const f = fixture(); f.mutate.mockResolvedValueOnce(failure); await headlessDelete(f); const view = show(f);
    let release!: (r: Awaited<ReturnType<MealApi['mutate']>>) => void; f.mutate.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
    const button = view.getByRole('button', { name: 'Comprobar intento guardado' });
    await act(async () => { fireEvent.press(button); fireEvent.press(button); });
    expect(view.getByText('Comprobando…')).toBeTruthy(); expect(view.queryByRole('button')).toBeNull();
    expect(f.mutate).toHaveBeenCalledTimes(2);
    await act(async () => { release({ status: 'ok', data: deleted, meta }); }); expect(f.mutate).toHaveBeenCalledTimes(2); expect(f.read).toHaveBeenCalledTimes(1);
    expect(view.queryByTestId('meal-recovery-panel')).toBeNull();
  });
  it('a second failure keeps the same panel and the same stored intent', async () => {
    const f = fixture(); f.mutate.mockResolvedValue(failure); await headlessDelete(f); const view = show(f); const stored = snap(f).intent;
    await press(view, 'Comprobar intento guardado'); await press(view, 'Comprobar intento guardado');
    expect(f.mutate).toHaveBeenCalledTimes(3); expect(view.getByText('Comprobar intento guardado')).toBeTruthy(); expect(snap(f).intent).toBe(stored);
    expect(new Set(f.mutate.mock.calls.map(c => c[0])).size).toBe(1);
  });
  it('confirmed with failed day reads: "Actualizar días confirmados" re-reads and never calls mutate again', async () => {
    const f = fixture(); f.read.mockResolvedValue(failure as never); await headlessDelete(f);
    expect(snap(f)).toMatchObject({ phase: 'confirmed', editor: { headless: true } }); const view = show(f);
    expect(view.getByRole('alert').props.children).toMatch(/No vuelvas a guardar/);
    f.read.mockImplementation(async d => ({ status: 'ok', data: nutritionFixture(d), meta }));
    await press(view, 'Actualizar días confirmados');
    expect(f.mutate).toHaveBeenCalledTimes(1); expect(view.queryByTestId('meal-recovery-panel')).toBeNull(); expect(snap(f)).toMatchObject({ phase: 'idle', editor: null }); expect(await f.repository.read()).toBeNull();
  });
  it('blocked by a failed local write: asks to check the storage, sends nothing, and leaves no editor behind once it is readable', async () => {
    const f = fixture(); const setItem = f.storage.setItem; f.storage.setItem = async () => { throw new Error('full'); }; await headlessDelete(f);
    const view = show(f); expect(f.mutate).not.toHaveBeenCalled();
    expect(view.getByRole('alert').props.children).toMatch(/No pudimos guardar el intento local/); expect(view.queryByRole('button', { name: 'Cerrar' })).toBeNull();
    await press(view, 'Comprobar almacenamiento'); expect(snap(f)).toMatchObject({ phase: 'idle', editor: null }); // storage reads fine: nothing was stored
    expect(view.queryByTestId('meal-recovery-panel')).toBeNull(); expect(f.mutate).not.toHaveBeenCalled();
    f.storage.setItem = setItem;
  });
  it('blocked by an unreadable store stays visible until the storage recovers', async () => {
    const f = fixture(); f.storage.setItem = async () => { throw new Error('full'); }; await headlessDelete(f); f.map.set(f.repository.key, 'invalid-json');
    const view = show(f); await press(view, 'Comprobar almacenamiento');
    expect(snap(f)).toMatchObject({ phase: 'blocked', editor: { headless: true } }); expect(view.getByRole('alert').props.children).toMatch(/No pudimos leer el intento local/);
    f.map.delete(f.repository.key); await press(view, 'Comprobar almacenamiento');
    expect(snap(f)).toMatchObject({ phase: 'idle', editor: null, intent: null }); expect(view.queryByTestId('meal-recovery-panel')).toBeNull(); expect(f.mutate).not.toHaveBeenCalled();
  });
  it('two quick presses on "Comprobar almacenamiento" read the store once', async () => {
    const f = fixture(); f.storage.setItem = async () => { throw new Error('full'); }; await headlessDelete(f); const view = show(f);
    const read = jest.spyOn(f.repository, 'read'); const button = view.getByRole('button', { name: 'Comprobar almacenamiento' });
    await act(async () => { fireEvent.press(button); fireEvent.press(button); });
    expect(read).toHaveBeenCalledTimes(1); expect(f.mutate).not.toHaveBeenCalled(); expect(snap(f)).toMatchObject({ phase: 'idle', editor: null });
  });
  it('MEAL_CHANGED with server truth: says it changed and was not deleted, shows what it is now, and Cerrar unlocks without sending anything', async () => {
    const f = fixture(); f.mutate.mockResolvedValueOnce(conflict('MEAL_CHANGED', date)); await headlessDelete(f); const view = show(f);
    expect(view.getByText('La comida cambió. No la eliminamos.')).toBeTruthy(); expect(view.getByText('Ahora: Pasta cambiada · 300 kcal')).toBeTruthy();
    expect(view.getByRole('alert')).toBeTruthy(); expect(view.queryByText('Revisar mis cambios sobre esta versión')).toBeNull();
    expect(flat(view.getByRole('button', { name: 'Cerrar' }).props.style).minHeight).toBeGreaterThanOrEqual(44);
    await press(view, 'Cerrar');
    expect(view.queryByTestId('meal-recovery-panel')).toBeNull(); expect(snap(f)).toMatchObject({ phase: 'idle', editor: null, intent: null, truth: null });
    expect(f.mutate).toHaveBeenCalledTimes(1); expect(await f.repository.read()).toBeNull();
  });
  it('MEAL_CHANGED with only the day: Actualizar is a read that may bring the truth, and the delete is never re-sent', async () => {
    const f = fixture(); f.mutate.mockResolvedValueOnce(conflict('MEAL_CHANGED', date)); f.read.mockResolvedValueOnce(failure as never); await headlessDelete(f);
    expect(snap(f)).toMatchObject({ phase: 'conflict', truth: null, truthDate: date }); const view = show(f);
    expect(view.getByText('La comida cambió. No la eliminamos.')).toBeTruthy(); expect(view.queryByText(/^Ahora:/)).toBeNull();
    const reads = f.read.mock.calls.length; await press(view, 'Actualizar');
    expect(f.read.mock.calls.length).toBe(reads + 1); expect(view.getByText(/^Ahora: /)).toBeTruthy(); expect(f.mutate).toHaveBeenCalledTimes(1);
    expect(snap(f).editor?.expectedUpdatedAt).toBe(version); // no adoption of the server's version
    await press(view, 'Cerrar'); expect(snap(f).editor).toBeNull();
  });
  it('a conflict without any day (the meal is not available) shows the real message and only Cerrar', async () => {
    const f = fixture(); f.mutate.mockResolvedValueOnce(conflict('MEAL_UNAVAILABLE')); await headlessDelete(f); const view = show(f);
    expect(view.getByText('La comida ya no está disponible.')).toBeTruthy(); expect(view.queryByRole('button', { name: 'Actualizar' })).toBeNull();
    expect(view.queryByText('La comida cambió. No la eliminamos.')).toBeNull();
    await press(view, 'Cerrar'); expect(snap(f)).toMatchObject({ phase: 'idle', editor: null }); expect(f.mutate).toHaveBeenCalledTimes(1);
  });
  it.each([
    ['not_found', { status: 'not_found' as const, message: 'No encontramos la comida.', meta: { ...meta, httpStatus: 404, outcome: 'not_found' as const } }, 'conflict'],
    ['validation', { status: 'validation' as const, message: 'La comida no se puede eliminar.', meta: { ...meta, httpStatus: 422, outcome: 'validation' as const } }, 'idle'],
    ['duplicate', { status: 'conflict' as const, code: 'POSSIBLE_DUPLICATE' as const, message: 'Parece repetida.', meta: { ...meta, httpStatus: 409, outcome: 'conflict' as const } }, 'duplicate'],
  ])('%s: the controller message and a Cerrar that ends the lock', async (_name, result, phase) => {
    const f = fixture(); f.mutate.mockResolvedValueOnce(result as never); await headlessDelete(f); expect(snap(f).phase).toBe(phase); const view = show(f);
    expect(view.getByText(result.message)).toBeTruthy(); expect(view.getByRole('alert')).toBeTruthy(); expect(view.queryByRole('button', { name: 'Comprobar intento guardado' })).toBeNull();
    await press(view, 'Cerrar'); expect(view.queryByTestId('meal-recovery-panel')).toBeNull(); expect(snap(f)).toMatchObject({ phase: 'idle', editor: null, intent: null, message: null });
    expect(f.mutate).toHaveBeenCalledTimes(1);
  });
  it('keeps its text and buttons whole at large font scales (wraps, no truncation, 44 pt touch targets)', async () => {
    mockFontScale = 2; const f = fixture(); f.mutate.mockResolvedValueOnce(conflict('MEAL_CHANGED', date)); await headlessDelete(f); const view = show(f);
    for (const text of ['La comida cambió. No la eliminamos.', 'Ahora: Pasta cambiada · 300 kcal']) expect(view.getByText(text).props.numberOfLines).toBeUndefined();
    for (const name of ['Actualizar', 'Cerrar']) expect(flat(view.getByRole('button', { name }).props.style).minHeight).toBeGreaterThanOrEqual(44);
    expect(view.getByText('Ahora: Pasta cambiada · 300 kcal').props.maxFontSizeMultiplier).toBeUndefined();
  });
  it('orders message before actions for focus', async () => {
    const f = fixture(); f.mutate.mockResolvedValueOnce(conflict('MEAL_CHANGED', date)); await headlessDelete(f); const view = show(f);
    const tree = JSON.stringify(view.toJSON()), at = ['La comida cambió. No la eliminamos.', 'Ahora: Pasta cambiada · 300 kcal', 'Actualizar', 'Cerrar'].map(label => tree.indexOf(label));
    expect(at.every(index => index >= 0)).toBe(true); expect([...at].sort((a, b) => a - b)).toEqual(at);
  });
});
