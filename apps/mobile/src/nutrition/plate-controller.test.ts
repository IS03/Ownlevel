import { describe, expect, it, jest } from '@jest/globals';
import type { PersonalFood } from '@/api/nutrition-food';
import type { QuickOption, QuickPreview, QuickSelection } from '@/api/nutrition-quick';
import { personalFood } from './food-fixture.test-helper';
import { quickOption, quickOptions } from './quick-fixture.test-helper';
import { nutritionFixture } from './day-fixture.test-helper';
import { PlateController, type PlateApi } from './plate-controller';
import { PlateIntentRepository } from './plate-storage';
import { itemEstimate, plateDraft, plateEstimate, selectionFromPlate, stepped, unitLabel, withSource, type PlateSource } from './plate-model';

/** Synthetic foods and saved meals only: a bread by slices, a cream cheese per 100 g, a 0 kcal coffee with unknown protein. */
const DATE = '2026-11-20', MEAL = '41100000-0000-4000-8000-000000000002';
const food = (n: number, patch: Partial<PersonalFood>): PersonalFood => ({ ...personalFood, id: `42200000-0000-4000-8000-00000000010${n}`, version: String(n).repeat(64), ...patch });
const bread = food(1, { name: 'PAN LACTAL', servingQuantity: 1, servingUnit: 'rebanada', calories: 65.5, proteinG: 2.2, carbsG: 12, fatG: 0.8 });
const cheese = food(2, { name: 'QUESO CREMA', servingQuantity: 100, servingUnit: 'g', calories: 220, proteinG: 6, carbsG: 4, fatG: 20 });
const coffee = food(3, { name: 'CAFÉ', servingQuantity: 1, servingUnit: 'taza', calories: 0, proteinG: null, carbsG: 0, fatG: 0 });
const unknown = food(4, { name: 'SIN DATOS', calories: null });
const F = (f: PersonalFood): PlateSource => ({ kind: 'food', food: f });
const yogurt: QuickOption = { ...quickOption(), source: { kind: 'saved', id: '42100000-0000-4000-8000-0000000000d1', version: 'd'.repeat(64) }, name: 'YOGUR CON GRANOLA', calories: 180, proteinG: null, carbsG: 25, fatG: 4 };
const S = (m: QuickOption): PlateSource => ({ kind: 'saved', meal: m });
const meta = { durationMs: 1, httpStatus: 200, outcome: 'ok' as const };
const settle = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
const preview = (selection: QuickSelection): QuickPreview => ({ status: 'preview', selection,
  snapshot: { title: 'MERIENDA', description: '2 REBANADA PAN LACTAL', calories: 197, proteinG: 6.2, carbsG: 25.2, fatG: 7.6, precision: null, contextType: 'food_plate', sourceNote: null },
  items: selection.quantities!.map(q => ({ id: q.itemId, label: 'X', quantity: q.quantity, unit: 'g', calories: 1, proteinG: 1, carbsG: 1, fatG: 1 })) });

function fixture(foods = [bread, cheese, coffee, unknown], saved = [yogurt]) {
  const map = new Map<string, string>();
  const storage = { getItem: async (k: string) => map.get(k) ?? null, setItem: async (k: string, v: string) => { map.set(k, v); }, removeItem: async (k: string) => { map.delete(k); } };
  const api: PlateApi = {
    foods: jest.fn<PlateApi['foods']>().mockResolvedValue({ status: 'ok', data: { foods }, meta } as never),
    saved: jest.fn<PlateApi['saved']>().mockResolvedValue({ status: 'ok', data: { ...quickOptions(), saved: { status: 'ok', items: saved } }, meta }),
    preview: jest.fn<PlateApi['preview']>().mockImplementation(async s => ({ status: 'ok', data: preview(s), meta })),
    confirm: jest.fn<PlateApi['confirm']>().mockResolvedValue({ status: 'ok', data: { status: 'registered', operation: 'register', date: DATE, resourceId: MEAL, updatedAt: '2026-11-20T18:00:00.123456Z' }, meta }),
    read: jest.fn<PlateApi['read']>().mockImplementation(async d => ({ status: 'ok', data: nutritionFixture(d), meta })),
  };
  const invalidate = jest.fn<() => void>(); let key = 0;
  const controller = new PlateController(api, new PlateIntentRepository(storage, 'owner'), invalidate, () => `plate:${++key}`);
  return { controller, api, invalidate, map, storage };
}

describe('Plato · model', () => {
  it('adds once, then − / + move by its step (grams by 10, the rest by one); below the first step it leaves', () => {
    let d = withSource(withSource(withSource(plateDraft(DATE), F(bread)), F(cheese)), F(bread));
    expect(d.items.map(i => i.quantity)).toEqual(['1', '100']);
    d = stepped(stepped(d, cheese.id, -1), bread.id, 1);
    expect(d.items.map(i => i.quantity)).toEqual(['2', '90']);
    expect(stepped(stepped(d, bread.id, -1), bread.id, -1).items.map(i => i.source.kind === 'food' && i.source.food.name)).toEqual(['QUESO CREMA']);
    // Unknown calories never enter a plate; 0 kcal does.
    expect(withSource(d, F(unknown)).items).toHaveLength(2);
    expect(withSource(d, F(coffee)).items).toHaveLength(3);
  });
  it('estimates like the server, a saved meal by portions, and an unknown macro stays unknown', () => {
    const d = { ...plateDraft(DATE), items: [{ source: F(bread), quantity: '2' }, { source: F(cheese), quantity: '30' }] };
    expect(itemEstimate(d.items[1]!)).toEqual({ calories: 66, proteinG: 1.8, carbsG: 1.2, fatG: 6 });
    expect(plateEstimate(d)).toEqual({ calories: 197, proteinG: 6.2, carbsG: 25.2, fatG: 7.6 });
    expect(plateEstimate({ ...d, items: [...d.items, { source: S(yogurt), quantity: '2' }] })).toMatchObject({ calories: 557, proteinG: null, carbsG: 75.2 });
  });
  it('builds the plate selection in its order, each with its version; a saved meal says so; saving needs a name', () => {
    const d = { ...withSource(withSource(plateDraft(DATE), F(cheese)), S(yogurt)), title: ' Merienda ' };
    expect(selectionFromPlate(d).selection).toMatchObject({ source: { kind: 'plate', title: 'Merienda', saveToLibrary: false },
      quantities: [{ itemId: cheese.id, quantity: 100, version: cheese.version }, { itemId: yogurt.source.id, quantity: 1, version: 'd'.repeat(64), kind: 'saved' }] });
    expect(selectionFromPlate({ ...d, title: '  ', saveToLibrary: true }).errors.title).toBeTruthy();
    for (const bad of ['', '0', '1,234', 'abc']) expect(selectionFromPlate({ ...d, items: [{ source: F(bread), quantity: bad }] }).selection).toBeUndefined();
  });
  it('says units in plural, never abbreviations', () => {
    expect([unitLabel('unidad', 2), unitLabel('porción', 2), unitLabel('taza', 3), unitLabel('g', 150), unitLabel('rebanada', 1)]).toEqual(['unidades', 'porciones', 'tazas', 'g', 'rebanada']);
  });
});

describe('Plato · controller', () => {
  it('closing keeps the plate; reopening brings it back on its review; it reads foods and saved meals', async () => {
    const f = fixture(); await f.controller.initialize();
    f.controller.open(DATE); await settle();
    expect(f.controller.getSnapshot()).toMatchObject({ view: 'pick', tab: 'foods' });
    expect(f.controller.getSnapshot().saved).toHaveLength(1);
    f.controller.add(F(bread)); f.controller.add(S(yogurt)); f.controller.close();
    f.controller.open(DATE); await settle();
    expect(f.controller.getSnapshot()).toMatchObject({ open: true, view: 'review' });
    expect(f.controller.getSnapshot().draft!.items).toHaveLength(2);
    // The last item stepped out leaves the plate empty and goes back to the lists.
    f.controller.step(bread.id, -1); f.controller.step(yogurt.source.id, -1);
    expect(f.controller.getSnapshot()).toMatchObject({ view: 'pick' });
  });
  it('registers one meal through the quick source `plate`, stored before it is sent, and announces it for «Deshacer»', async () => {
    const f = fixture(); await f.controller.initialize();
    const announced = jest.fn(); f.controller.subscribeConfirmed(announced);
    f.controller.open(DATE); await settle();
    // Named on purpose: after 23 h there is no suggested moment, and saving needs a name.
    f.controller.add(F(bread)); f.controller.add(S(yogurt)); f.controller.rename('Merienda'); f.controller.saveToLibrary(true);
    await f.controller.requestPreview();
    expect(f.controller.getSnapshot().preview).toBeTruthy();
    await f.controller.save(); await settle();
    const sent = (f.api.confirm as jest.Mock).mock.calls[0]![0] as { source: unknown; operation: string; idempotencyKey: string; quantities: unknown[] };
    expect(sent).toMatchObject({ operation: 'register', idempotencyKey: 'plate:1', source: { kind: 'plate', saveToLibrary: true } });
    expect(sent.quantities[1]).toMatchObject({ kind: 'saved', itemId: yogurt.source.id });
    expect(f.invalidate).toHaveBeenCalled();
    expect(announced).toHaveBeenCalledWith(expect.objectContaining({ id: MEAL, updatedAt: '2026-11-20T18:00:00.123456Z' }), DATE);
    expect(f.controller.getSnapshot()).toMatchObject({ phase: 'idle', open: false, draft: null, intent: null });
    expect(f.map.size).toBe(0);
  });
  it('an unknown outcome keeps the intent and only re-sends the very same one on request', async () => {
    const f = fixture(); await f.controller.initialize();
    f.controller.open(DATE); await settle(); f.controller.add(F(bread));
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
  it('an item that changed is brought up to date, keeping its quantity; one gone leaves the plate and says so', async () => {
    const edited = { ...bread, calories: 70, version: '9'.repeat(64) };
    const f = fixture(); await f.controller.initialize();
    f.controller.open(DATE); await settle(); f.controller.add(F(bread)); f.controller.add(F(cheese)); f.controller.add(S(yogurt)); f.controller.step(cheese.id, -1);
    (f.api.foods as jest.Mock).mockResolvedValueOnce({ status: 'ok', data: { foods: [edited] }, meta } as never);
    (f.api.preview as jest.Mock).mockResolvedValueOnce({ status: 'conflict', code: 'QUICK_SOURCE_CHANGED', message: 'x', meta } as never);
    await f.controller.requestPreview(); await settle();
    const s = f.controller.getSnapshot();
    expect(s.draft!.items.map(i => [i.source.kind, i.quantity])).toEqual([['food', '1'], ['saved', '1']]);
    expect(s.draft!.items[0]!.source.kind === 'food' && s.draft!.items[0]!.source.food.version).toBe('9'.repeat(64));
    expect(s.message).toContain('QUESO CREMA ya no está disponible');
  });
  it('a repeated name keeps everything and points at the name', async () => {
    const f = fixture(); await f.controller.initialize();
    f.controller.open(DATE); await settle(); f.controller.add(F(bread)); f.controller.rename('Merienda'); f.controller.saveToLibrary(true);
    await f.controller.requestPreview();
    (f.api.confirm as jest.Mock).mockResolvedValueOnce({ status: 'conflict', code: 'SAVED_NAME_EXISTS', message: 'x', meta } as never);
    await f.controller.save(); await settle();
    expect(f.controller.getSnapshot()).toMatchObject({ phase: 'idle', intent: null, errors: { title: 'Ese nombre ya está en tus comidas.' } });
    expect(f.controller.getSnapshot().draft!.items).toHaveLength(1);
    expect(f.map.size).toBe(0);
  });
});
