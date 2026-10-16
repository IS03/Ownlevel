import { describe, expect, it, jest } from '@jest/globals';
import { foodQuickOption } from '@/api/nutrition-food';
import { personalFood } from './food-fixture.test-helper';
import { QuickController, type QuickApi } from './quick-controller';
import { QuickIntentRepository } from './quick-storage';
import { quickDraft, selectionFromDraft } from './quick-model';
import { quickDate, quickId, quickOption, quickOptions, quickPreview, quickReceipt } from './quick-fixture.test-helper';
import { nutritionFixture } from './day-fixture.test-helper';
const meta = { durationMs: 1, httpStatus: 200, outcome: 'ok' as const };
const failure = { status: 'unavailable' as const, reason: 'network' as const, meta: { durationMs: 1, httpStatus: null, outcome: 'unavailable' as const } };
const settle = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
function fixture() {
  const map = new Map<string,string>();
  const storage = { getItem: async (k: string) => map.get(k) ?? null, setItem: async (k: string,v: string) => { map.set(k,v); }, removeItem: async (k: string) => { map.delete(k); } };
  const repository = new QuickIntentRepository(storage, 'owner');
  const api: QuickApi = { options: jest.fn<QuickApi['options']>().mockResolvedValue({ status: 'ok', data: quickOptions(), meta }),
    preview: jest.fn<QuickApi['preview']>().mockImplementation(async s => ({ status: 'ok', data: quickPreview(s), meta })),
    confirm: jest.fn<QuickApi['confirm']>().mockResolvedValue({ status: 'ok', data: quickReceipt, meta }),
    read: jest.fn<QuickApi['read']>().mockImplementation(async d => ({ status: 'ok', data: nutritionFixture(d), meta })) };
  const invalidate = jest.fn<() => void>(); let key = 0;
  const controller = new QuickController(api, repository, invalidate, () => `quick:${++key}`);
  const open = async (option = quickOption()) => { await controller.initialize(); controller.open(quickDate); controller.choose(option); await settle(); };
  return { controller, repository, storage, api, invalidate, map, open };
}
describe('Reliable quick registration', () => {
  it('quantities accept comma/point, reject absent and zero without inventing nutrients', () => {
    const d = quickDraft(quickDate, quickOption(true)); d.quantities[quickId] = '150,25';
    expect(selectionFromDraft(d).selection?.quantities).toEqual([{ itemId: quickId, quantity: 150.25 }]);
    for (const raw of ['', '0', '-1', '1.234', '1e2']) expect(selectionFromDraft({ ...d, quantities: { [quickId]: raw } }).selection).toBeUndefined();
    expect(selectionFromDraft(quickDraft(quickDate, quickOption())).selection?.quantities).toBeNull();
  });
  it('persists before confirm, gates double taps, rereads exact day and clears only after truth', async () => {
    const f = fixture(); await f.open();
    (f.api.confirm as jest.Mock<QuickApi['confirm']>).mockImplementation(async () => { expect(await f.repository.read()).not.toBeNull(); return { status: 'ok', data: quickReceipt, meta }; });
    await Promise.all([f.controller.save(), f.controller.save()]);
    expect(f.api.confirm).toHaveBeenCalledTimes(1); expect(f.api.read).toHaveBeenCalledWith(quickDate); expect(f.invalidate).toHaveBeenCalled();
    expect(await f.repository.read()).toBeNull(); expect(f.controller.getSnapshot().open).toBe(false);
  });
  it('quantity edits invalidate preview and stale preview responses cannot reenable confirm', async () => {
    const f = fixture(); await f.open(quickOption(true));
    let finish!: (v: Awaited<ReturnType<QuickApi['preview']>>) => void;
    (f.api.preview as jest.Mock<QuickApi['preview']>).mockImplementationOnce(() => new Promise(r => { finish = r; }));
    f.controller.change(quickId, '200'); const pending = f.controller.requestPreview();
    const old = selectionFromDraft(f.controller.getSnapshot().draft!).selection!;
    f.controller.change(quickId, '300'); finish({ status: 'ok', data: quickPreview(old), meta }); await pending;
    expect(f.controller.getSnapshot().preview).toBeNull(); await f.controller.save(); expect(f.api.confirm).not.toHaveBeenCalled();
    await f.controller.requestPreview(); await f.controller.save(); expect(f.api.confirm).toHaveBeenCalledWith(expect.objectContaining({ quantities: [{ itemId: quickId, quantity: 300 }] }));
  });
  it('options refresh preserves adjusted draft and destination', async () => {
    const f = fixture(); await f.open(quickOption(true)); f.controller.change(quickId, '200,5'); await f.controller.loadOptions();
    expect(f.controller.getSnapshot().draft?.quantities[quickId]).toBe('200,5'); expect(f.controller.getSnapshot().date).toBe(quickDate);
    f.controller.close(); f.controller.open('2026-09-01'); expect(f.controller.getSnapshot().draft).toBeNull();
  });
  it('conflict preserves draft, loads truth and requires conscious review/new preview', async () => {
    const f = fixture(); await f.open(quickOption(true)); f.controller.change(quickId, '200'); await f.controller.requestPreview();
    const truth = { ...quickOption(true), source: { ...quickOption().source, version: 'b'.repeat(64) } };
    (f.api.options as jest.Mock<QuickApi['options']>).mockResolvedValue({ status: 'ok', data: { ...quickOptions(), saved: { status: 'ok', items: [truth] } }, meta });
    (f.api.confirm as jest.Mock<QuickApi['confirm']>).mockResolvedValueOnce({ status: 'conflict', code: 'QUICK_SOURCE_CHANGED', message: 'changed', meta: { ...meta, outcome: 'conflict' } });
    await f.controller.save(); expect(f.controller.getSnapshot().phase).toBe('conflict'); expect(f.controller.getSnapshot().draft?.quantities[quickId]).toBe('200');
    f.controller.reviewTruth(); expect(f.controller.getSnapshot().draft?.option.source.version).toBe('b'.repeat(64));
    expect(f.controller.getSnapshot().previousDraft?.quantities[quickId]).toBe('200'); await f.controller.save(); expect(f.api.confirm).toHaveBeenCalledTimes(1);
    await f.controller.requestPreview(); await f.controller.save(); expect(f.api.confirm).toHaveBeenCalledTimes(2);
  });
  it('replaced ingredient IDs retain old quantities as reference instead of silently applying them', async () => {
    const f = fixture(); await f.open(quickOption(true)); f.controller.change(quickId, '200'); await f.controller.requestPreview();
    const newId = '42100000-0000-4000-8000-000000000002';
    const truth = { ...quickOption(true), items: [{ ...quickOption(true).items[0], id: newId, quantity: 50 }] };
    (f.api.options as jest.Mock<QuickApi['options']>).mockResolvedValue({ status: 'ok', data: { ...quickOptions(), saved: { status: 'ok', items: [truth] } }, meta });
    (f.api.confirm as jest.Mock<QuickApi['confirm']>).mockResolvedValueOnce({ status: 'conflict', code: 'QUICK_SOURCE_CHANGED', message: 'changed', meta: { ...meta, outcome: 'conflict' } });
    await f.controller.save(); f.controller.reviewTruth();
    expect(f.controller.getSnapshot().draft?.quantities).toEqual({ [newId]: '50' }); expect(f.controller.getSnapshot().previousDraft?.quantities).toEqual({ [quickId]: '200' });
  });
  it('cancelling a rejected conflict unlocks new operations; closing ambiguity keeps the intent fenced', async () => {
    const f = fixture(); await f.open();
    (f.api.confirm as jest.Mock<QuickApi['confirm']>).mockResolvedValueOnce({ status: 'conflict', code: 'QUICK_SOURCE_UNAVAILABLE', message: 'missing', meta: { ...meta, outcome: 'conflict' } });
    await f.controller.save(); f.controller.close();
    expect(f.controller.getSnapshot().phase).toBe('idle'); expect(f.controller.getSnapshot().draft).toBeNull();
    f.controller.open(quickDate); f.controller.choose(quickOption()); await settle();
    (f.api.confirm as jest.Mock<QuickApi['confirm']>).mockResolvedValueOnce(failure);
    await f.controller.save(); f.controller.close(); f.controller.open('2026-09-01');
    expect(f.controller.getSnapshot().phase).toBe('uncertain'); expect(f.controller.getSnapshot().intent?.intent.date).toBe(quickDate);
    expect(f.controller.getSnapshot().open).toBe(false);
  });
  it('remount restores ambiguous intent without sending; explicit recovery replays identical key/payload', async () => {
    const f = fixture(); await f.open(); (f.api.confirm as jest.Mock<QuickApi['confirm']>).mockResolvedValueOnce(failure);
    await f.controller.save(); const stored = (await f.repository.read())!; expect(f.controller.getSnapshot().phase).toBe('uncertain');
    const restored = new QuickController(f.api, f.repository, f.invalidate); await restored.initialize();
    expect(f.api.confirm).toHaveBeenCalledTimes(1); restored.showRecovery(); await restored.recover();
    expect(f.api.confirm).toHaveBeenLastCalledWith(stored.intent); expect(await f.repository.read()).toBeNull();
  });
  it('food quantity ambiguity survives restart and replays the same source version/quantity', async () => {
    const f = fixture(); await f.open(foodQuickOption(personalFood)); f.controller.change(personalFood.id, '0,375'); await f.controller.requestPreview();
    (f.api.confirm as jest.Mock<QuickApi['confirm']>).mockResolvedValueOnce(failure); await f.controller.save(); const stored = (await f.repository.read())!;
    const restored = new QuickController(f.api, f.repository, f.invalidate); await restored.initialize(); expect(restored.getSnapshot().draft?.quantities[personalFood.id]).toBe('0,375');
    expect(f.api.confirm).toHaveBeenCalledTimes(1); await restored.recover(); expect(f.api.confirm).toHaveBeenLastCalledWith(stored.intent); expect(await f.repository.read()).toBeNull();
  });
  it('confirmed receipt recovery reads only, and a wrong-date read never clears the intent', async () => {
    const f = fixture(); await f.open(); (f.api.read as jest.Mock<QuickApi['read']>).mockResolvedValueOnce(failure);
    await f.controller.save(); expect(f.controller.getSnapshot().phase).toBe('confirmed');
    const restored = new QuickController(f.api, f.repository, f.invalidate); await restored.initialize();
    (f.api.read as jest.Mock<QuickApi['read']>).mockResolvedValueOnce({ status: 'ok', data: nutritionFixture('2026-09-01'), meta });
    await restored.recover(); expect(await f.repository.read()).not.toBeNull(); await restored.recover();
    expect(f.api.confirm).toHaveBeenCalledTimes(1); expect(await f.repository.read()).toBeNull();
  });
  it('saving suggestion refreshes saved options, creates no additional day write, and recovers receipt with reads only', async () => {
    const f = fixture(); await f.open(quickOption(false, true));
    (f.api.confirm as jest.Mock<QuickApi['confirm']>).mockResolvedValueOnce({ status: 'ok', data: { ...quickReceipt, operation: 'saveSuggestion', status: 'habitual_saved' }, meta });
    await f.controller.save('saveSuggestion'); expect(f.api.confirm).toHaveBeenCalledWith(expect.objectContaining({ operation: 'saveSuggestion' }));
    expect(f.api.read).not.toHaveBeenCalled(); expect(f.controller.getSnapshot().message).toContain('No agregamos otra comida');
  });
  it('storage failure prevents new send; corrupted/foreign receipts cannot authorize recovery', async () => {
    const f = fixture(); await f.open(); f.storage.setItem = async () => { throw new Error('disk'); };
    await f.controller.save(); expect(f.api.confirm).not.toHaveBeenCalled(); expect(f.controller.getSnapshot().phase).toBe('blocked');
    const g = fixture(); await g.open(); (g.api.confirm as jest.Mock<QuickApi['confirm']>).mockResolvedValueOnce(failure); await g.controller.save();
    const stored = (await g.repository.read())!; g.map.set(g.repository.key, JSON.stringify({ ...stored, receipt: { ...quickReceipt, date: '2026-09-01' } }));
    await expect(g.repository.read()).rejects.toThrow('Invalid quick intent');
    expect(await new QuickIntentRepository(g.storage, 'other').read()).toBeNull();
  });
  it('dispose during local persistence never sends after logout', async () => {
    const f = fixture(); await f.open(); let finish!: () => void;
    f.storage.setItem = async (k,v) => { await new Promise<void>(r => { finish = r; }); f.map.set(k,v); };
    const saving = f.controller.save(); await settle(); f.controller.dispose(); finish(); await saving; expect(f.api.confirm).not.toHaveBeenCalled();
  });
});

describe('M9 inline additions', () => {
  it('previews before writing, gates double taps, stays open and retains the original CAS for Undo', async () => {
    const f = fixture(); await f.controller.initialize(); f.controller.open(quickDate); await settle();
    const day = nutritionFixture(quickDate);
    if (day.nutrition.status === 'ok' && day.nutrition.data.dayState === 'recorded') day.nutrition.data.meals[0] = { ...day.nutrition.data.meals[0], id: quickId, updatedAt: '2026-10-03T13:00:00Z' };
    (f.api.read as jest.Mock<QuickApi['read']>).mockResolvedValue({ status: 'ok', data: day, meta });
    const added = jest.fn(); f.controller.subscribeConfirmed(added);
    let finish!: (v: Awaited<ReturnType<QuickApi['preview']>>) => void;
    (f.api.preview as jest.Mock<QuickApi['preview']>).mockImplementationOnce(() => new Promise(r => { finish = r; }));
    const first = f.controller.addInline(quickOption()); await settle();
    await f.controller.addInline(quickOption()); expect(f.api.confirm).not.toHaveBeenCalled();
    const selection = selectionFromDraft(f.controller.getSnapshot().draft!).selection!;
    finish({ status: 'ok', data: quickPreview(selection), meta }); await first;
    expect(f.api.confirm).toHaveBeenCalledTimes(1); expect(f.controller.getSnapshot()).toMatchObject({ open: true, draft: null, intent: null, phase: 'idle' });
    expect(added).toHaveBeenCalledWith(expect.objectContaining({ id: quickId, updatedAt: quickReceipt.updatedAt }), quickDate);
    expect(f.controller.getSnapshot().added?.[`saved:${quickId}`].meal.updatedAt).toBe(quickReceipt.updatedAt);
  });
  it('closing during a "+" add lets it finish in the background, once, without reopening the sheet', async () => {
    const f = fixture(); await f.controller.initialize(); f.controller.open(quickDate); await settle();
    const day = nutritionFixture(quickDate);
    if (day.nutrition.status === 'ok' && day.nutrition.data.dayState === 'recorded') day.nutrition.data.meals[0] = { ...day.nutrition.data.meals[0], id: quickId };
    (f.api.read as jest.Mock<QuickApi['read']>).mockResolvedValue({ status: 'ok', data: day, meta });
    const added = jest.fn(); f.controller.subscribeConfirmed(added);
    let finish!: (v: Awaited<ReturnType<QuickApi['preview']>>) => void;
    (f.api.preview as jest.Mock<QuickApi['preview']>).mockImplementationOnce(() => new Promise(r => { finish = r; }));
    const adding = f.controller.addInline(quickOption()); await settle();
    f.controller.close();
    expect(f.controller.getSnapshot()).toMatchObject({ open: false, inlineKey: `saved:${quickId}` });
    const selection = selectionFromDraft(f.controller.getSnapshot().draft!).selection!;
    finish({ status: 'ok', data: quickPreview(selection), meta }); await adding;
    expect(f.api.confirm).toHaveBeenCalledTimes(1); expect(added).toHaveBeenCalledTimes(1);
    expect(f.controller.getSnapshot()).toMatchObject({ open: false, inlineKey: null, intent: null, phase: 'idle' });
  });
  it('preview failure returns to the list without writing; an uncertain write keeps the SAME stored attempt', async () => {
    const f = fixture(); await f.controller.initialize(); f.controller.open(quickDate); await settle();
    (f.api.preview as jest.Mock<QuickApi['preview']>).mockResolvedValueOnce(failure);
    await f.controller.addInline(quickOption()); expect(f.api.confirm).not.toHaveBeenCalled();
    expect(f.controller.getSnapshot()).toMatchObject({ open: true, inlineKey: null, draft: null, phase: 'idle' });
    (f.api.confirm as jest.Mock<QuickApi['confirm']>).mockResolvedValueOnce(failure);
    await f.controller.addInline(quickOption()); const stored = (await f.repository.read())!;
    await f.controller.addInline(quickOption()); expect(f.api.confirm).toHaveBeenCalledTimes(1);
    await f.controller.recover(); expect(f.api.confirm).toHaveBeenLastCalledWith(stored.intent);
  });
  it('timing invalidates the preview and survives persistence/restart unchanged', async () => {
    const f = fixture(); await f.open();
    f.controller.timing('lunch', `${quickDate}T13:40:00-03:00`);
    await f.controller.save(); expect(f.api.confirm).not.toHaveBeenCalled();
    await f.controller.requestPreview();
    (f.api.confirm as jest.Mock<QuickApi['confirm']>).mockResolvedValueOnce(failure);
    await f.controller.save(); const stored = (await f.repository.read())!;
    expect(stored.intent).toMatchObject({ mealLabel: 'lunch', consumedAt: `${quickDate}T16:40:00.000Z` });
    const next = new QuickController(f.api, f.repository, f.invalidate); await next.initialize();
    await next.recover(); expect(f.api.confirm).toHaveBeenLastCalledWith(stored.intent);
  });
});
