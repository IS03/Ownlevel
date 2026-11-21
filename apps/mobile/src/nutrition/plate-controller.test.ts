import { describe, expect, it, jest } from '@jest/globals';
import type { PersonalFood } from '@/api/nutrition-food';
import type { QuickPreview, QuickSelection } from '@/api/nutrition-quick';
import { personalFood } from './food-fixture.test-helper';
import { nutritionFixture } from './day-fixture.test-helper';
import { PlateController, type PlateApi } from './plate-controller';
import { PlateIntentRepository } from './plate-storage';
import { itemEstimate, plateDraft, plateEstimate, selectionFromPlate, stepped, withFood } from './plate-model';

/** Synthetic foods only: a bread by slices, a cream cheese per 100 g and a black coffee of 0 kcal with unknown protein. */
const DATE = '2026-11-20', MEAL = '41100000-0000-4000-8000-000000000002';
const food = (n: number, patch: Partial<PersonalFood>): PersonalFood => ({ ...personalFood, id: `42200000-0000-4000-8000-00000000010${n}`, version: String(n).repeat(64), ...patch });
const bread = food(1, { name: 'PAN LACTAL', servingQuantity: 1, servingUnit: 'rebanada', calories: 65.5, proteinG: 2.2, carbsG: 12, fatG: 0.8 });
const cheese = food(2, { name: 'QUESO CREMA', servingQuantity: 100, servingUnit: 'g', calories: 220, proteinG: 6, carbsG: 4, fatG: 20 });
const coffee = food(3, { name: 'CAFÉ', servingQuantity: 1, servingUnit: 'taza', calories: 0, proteinG: null, carbsG: 0, fatG: 0 });
const unknown = food(4, { name: 'SIN DATOS', calories: null });
const meta = { durationMs: 1, httpStatus: 200, outcome: 'ok' as const };
const settle = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
const preview = (selection: QuickSelection): QuickPreview => ({ status: 'preview', selection,
  snapshot: { title: 'MERIENDA', description: '2 REBANADA PAN LACTAL', calories: 197, proteinG: 6.2, carbsG: 25.2, fatG: 7.6, precision: null, contextType: 'food_plate', sourceNote: null },
  items: selection.quantities!.map(q => ({ id: q.itemId, label: 'X', quantity: q.quantity, unit: 'g', calories: 1, proteinG: 1, carbsG: 1, fatG: 1 })) });

function fixture(foods = [bread, cheese, coffee, unknown]) {
  const map = new Map<string, string>();
  const storage = { getItem: async (k: string) => map.get(k) ?? null, setItem: async (k: string, v: string) => { map.set(k, v); }, removeItem: async (k: string) => { map.delete(k); } };
  const api: PlateApi = {
    foods: jest.fn<PlateApi['foods']>().mockResolvedValue({ status: 'ok', data: { foods }, meta } as never),
    preview: jest.fn<PlateApi['preview']>().mockImplementation(async s => ({ status: 'ok', data: preview(s), meta })),
    confirm: jest.fn<PlateApi['confirm']>().mockResolvedValue({ status: 'ok', data: { status: 'registered', operation: 'register', date: DATE, resourceId: MEAL, updatedAt: '2026-11-20T18:00:00.123456Z' }, meta }),
    read: jest.fn<PlateApi['read']>().mockImplementation(async d => ({ status: 'ok', data: nutritionFixture(d), meta })),
  };
  const invalidate = jest.fn<() => void>(); let key = 0;
  const controller = new PlateController(api, new PlateIntentRepository(storage, 'owner'), invalidate, () => `plate:${++key}`);
  return { controller, api, invalidate, map, storage };
}

describe('Plato · model', () => {
  it('adds a portion per tap (the same food twice is one row with two portions) and steps grams by 10, units by one', () => {
    let d = withFood(withFood(withFood(plateDraft(DATE), bread), cheese), bread);
    expect(d.items.map(i => [i.food.name, i.quantity])).toEqual([['PAN LACTAL', '2'], ['QUESO CREMA', '100']]);
    d = stepped(stepped(d, cheese.id, -1), cheese.id, -1);
    expect(d.items[1]!.quantity).toBe('80');
    expect(stepped(d, bread.id, 1).items[0]!.quantity).toBe('3');
    // A food with unknown calories never enters a plate; 0 kcal does.
    expect(withFood(d, unknown).items).toHaveLength(2);
    expect(withFood(d, coffee).items).toHaveLength(3);
  });
  it('estimates like the server: whole kcal per food, two-decimal macros, an unknown macro stays unknown', () => {
    const d = { ...withFood(withFood(plateDraft(DATE), bread), cheese), items: [{ food: bread, quantity: '2' }, { food: cheese, quantity: '30' }] };
    expect(itemEstimate(d.items[1]!)).toEqual({ calories: 66, proteinG: 1.8, carbsG: 1.2, fatG: 6 });
    expect(plateEstimate(d)).toEqual({ calories: 197, proteinG: 6.2, carbsG: 25.2, fatG: 7.6 });
    expect(plateEstimate(withFood(d, coffee))).toMatchObject({ calories: 197, proteinG: null, carbsG: 25.2 });
  });
  it('builds the plate selection in its own order with each food version; saving needs a name', () => {
    const d = { ...withFood(withFood(plateDraft(DATE), cheese), bread), title: ' Merienda ' };
    expect(selectionFromPlate(d).selection).toMatchObject({ source: { kind: 'plate', title: 'Merienda', saveToLibrary: false },
      quantities: [{ itemId: cheese.id, quantity: 100, version: cheese.version }, { itemId: bread.id, quantity: 1, version: bread.version }] });
    expect(selectionFromPlate({ ...d, title: '  ', saveToLibrary: true }).errors.title).toBeTruthy();
    for (const bad of ['', '0', '1,234', 'abc']) expect(selectionFromPlate({ ...d, items: [{ food: bread, quantity: bad }] }).selection).toBeUndefined();
  });
});

describe('Plato · controller', () => {
  it('closing keeps the plate; reopening brings it back on its review', async () => {
    const f = fixture(); await f.controller.initialize();
    f.controller.open(DATE); await settle();
    expect(f.controller.getSnapshot().view).toBe('pick');
    f.controller.add(bread); f.controller.add(cheese); f.controller.close();
    f.controller.open(DATE); await settle();
    expect(f.controller.getSnapshot()).toMatchObject({ open: true, view: 'review' });
    expect(f.controller.getSnapshot().draft!.items).toHaveLength(2);
    f.controller.clear();
    expect(f.controller.getSnapshot().draft!.items).toHaveLength(0);
  });
  it('registers one meal through the quick source `plate`, stored before it is sent, and announces it for «Deshacer»', async () => {
    const f = fixture(); await f.controller.initialize();
    const announced = jest.fn(); f.controller.subscribeConfirmed(announced);
    f.controller.open(DATE); await settle();
    // Named on purpose: after 23 h there is no suggested moment, and saving needs a name.
    f.controller.add(bread); f.controller.add(cheese); f.controller.rename('Merienda'); f.controller.saveToLibrary(true);
    await f.controller.requestPreview();
    expect(f.controller.getSnapshot().preview).toBeTruthy();
    await f.controller.save(); await settle();
    const sent = (f.api.confirm as jest.Mock).mock.calls[0]![0] as { source: unknown; operation: string; idempotencyKey: string };
    expect(sent).toMatchObject({ operation: 'register', idempotencyKey: 'plate:1', source: { kind: 'plate', saveToLibrary: true } });
    expect(f.invalidate).toHaveBeenCalled();
    expect(announced).toHaveBeenCalledWith(expect.objectContaining({ id: MEAL, updatedAt: '2026-11-20T18:00:00.123456Z' }), DATE);
    expect(f.controller.getSnapshot()).toMatchObject({ phase: 'idle', open: false, draft: null, intent: null });
    expect(f.map.size).toBe(0);
  });
  it('an unknown outcome keeps the intent and only re-sends the very same one on request', async () => {
    const f = fixture(); await f.controller.initialize();
    f.controller.open(DATE); await settle(); f.controller.add(bread);
    await f.controller.requestPreview();
    (f.api.confirm as jest.Mock).mockRejectedValueOnce(new Error('network') as never);
    await f.controller.save(); await settle();
    expect(f.controller.getSnapshot().phase).toBe('uncertain');
    expect(f.map.size).toBe(1);
    await f.controller.recover(); await settle();
    const calls = (f.api.confirm as jest.Mock).mock.calls as { idempotencyKey: string }[][];
    expect(calls.map(c => c[0]!.idempotencyKey)).toEqual(['plate:1', 'plate:1']);
    expect(f.controller.getSnapshot().phase).toBe('idle');
  });
  it('a food that changed is brought up to date, keeping its quantity; one gone leaves the plate and says so', async () => {
    const edited = { ...bread, calories: 70, version: '9'.repeat(64) };
    const f = fixture(); await f.controller.initialize();
    f.controller.open(DATE); await settle(); f.controller.add(bread); f.controller.add(cheese); f.controller.step(cheese.id, -1);
    (f.api.foods as jest.Mock).mockResolvedValueOnce({ status: 'ok', data: { foods: [edited] }, meta } as never);
    (f.api.preview as jest.Mock).mockResolvedValueOnce({ status: 'conflict', code: 'QUICK_SOURCE_CHANGED', message: 'x', meta } as never);
    await f.controller.requestPreview(); await settle();
    const s = f.controller.getSnapshot();
    expect(s.draft!.items.map(i => [i.food.version, i.quantity])).toEqual([['9'.repeat(64), '1']]);
    expect(s.message).toContain('QUESO CREMA ya no está disponible');
  });
  it('a repeated name keeps everything and points at the name', async () => {
    const f = fixture(); await f.controller.initialize();
    f.controller.open(DATE); await settle(); f.controller.add(bread); f.controller.rename('Merienda'); f.controller.saveToLibrary(true);
    await f.controller.requestPreview();
    (f.api.confirm as jest.Mock).mockResolvedValueOnce({ status: 'conflict', code: 'SAVED_NAME_EXISTS', message: 'x', meta } as never);
    await f.controller.save(); await settle();
    expect(f.controller.getSnapshot()).toMatchObject({ phase: 'idle', intent: null, errors: { title: 'Ese nombre ya está en tus comidas.' } });
    expect(f.controller.getSnapshot().draft!.items).toHaveLength(1);
    expect(f.map.size).toBe(0);
  });
});
