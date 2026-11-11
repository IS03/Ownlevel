import { describe, expect, it, jest } from '@jest/globals';
import type { QuickOptions, QuickPins, QuickPinsConflict, QuickPinsSnapshot, QuickPinsWrite } from '@/api/nutrition-quick';
import type { MobileApiRequestResult } from '@/api/results';
import { QuickPinsController, visibleQuickPins, type QuickPinsApi } from './quick-pins-controller';
import { QuickPinsIntentRepository, quickPinsStorageKey } from './quick-pins-storage';

const meta = { durationMs: 1, httpStatus: 200, outcome: 'ok' as const };
const ID = (n: number) => `47900000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const snap = (revision: number, list: string[], state: 'active' | 'archived' | 'deleted' = 'active'): QuickPinsSnapshot => ({ revision, items: list.map(id => ({ id, state })) });
const ok = (snapshot: QuickPinsSnapshot): QuickPins => ({ status: 'ok', ...snapshot });
const options = (pins: QuickPins): QuickOptions => ({ today: '2026-11-11', saved: { status: 'ok', items: [] }, suggested: { status: 'unavailable' }, pins });
type WriteResult = MobileApiRequestResult<QuickPinsSnapshot | QuickPinsConflict>;
const receipt = (w: QuickPinsWrite): WriteResult => ({ status: 'ok', data: snap(w.expectedRevision + 1, w.savedMealIds), meta });
const lost: WriteResult = { status: 'unavailable', reason: 'network', meta: { ...meta, httpStatus: null, outcome: 'unavailable' } };
const conflict = (code: 'QUICK_PINS_CHANGED' | 'QUICK_PIN_UNAVAILABLE' | 'IDEMPOTENCY_KEY_REUSED', current: QuickPinsSnapshot | null): WriteResult =>
  ({ status: 'conflict', code, message: 'm', ...(code === 'IDEMPOTENCY_KEY_REUSED' ? {} : { data: { error: code, message: 'm', current } }), meta: { ...meta, httpStatus: 409, outcome: 'conflict' } });

function memory() {
  const map = new Map<string, string>(), port = { getItem: async (k: string) => map.get(k) ?? null, setItem: async (k: string, v: string) => { map.set(k, v); }, removeItem: async (k: string) => { map.delete(k); } };
  return { map, port };
}
function setup({ storage = memory(), user = 'owner', truth = snap(0, []) } = {}) {
  const api = { write: jest.fn<QuickPinsApi['write']>(async w => receipt(w)), read: jest.fn<QuickPinsApi['read']>(async () => ({ status: 'ok', data: options(ok(truth)), meta })) };
  let n = 0;
  const c = new QuickPinsController(api, new QuickPinsIntentRepository(storage.port, user), () => `pins-${user}-${++n}`);
  return { c, api, storage, stored: () => storage.map.get(quickPinsStorageKey(user)) };
}
/** Lets the stored intent be written and the request leave. */
async function sent(write: { mock: { calls: unknown[] } }, count: number) { for (let i = 0; i < 50 && write.mock.calls.length < count; i++) await new Promise(r => setTimeout(r, 0)); }
async function ready(truth = snap(0, []), extra: Parameters<typeof setup>[0] = {}) {
  const s = setup({ truth, ...extra }); await s.c.initialize(); s.c.adopt(ok(truth)); return s;
}

describe('#479 B · quick pins controller', () => {
  it('reads pins from the quick-options answer it is given; «unavailable» is unknown, never zero, and nothing can be written', async () => {
    const s = setup();
    await s.c.initialize();
    expect(s.c.getSnapshot()).toMatchObject({ phase: 'idle', confirmed: null, availability: 'unknown' });
    s.c.adopt({ status: 'unavailable' });
    expect(s.c.getSnapshot()).toMatchObject({ confirmed: null, availability: 'unavailable' });
    expect(visibleQuickPins(s.c.getSnapshot())).toBeNull();
    expect(await s.c.pin(ID(1))).toBe('refused');
    expect(s.c.getSnapshot().error).toBe('unavailable');
    expect(s.api.write).not.toHaveBeenCalled(); expect(s.api.read).not.toHaveBeenCalled();
    s.c.adopt(ok(snap(0, [])));
    expect(s.c.getSnapshot()).toMatchObject({ confirmed: { revision: 0, items: [] }, availability: 'ok' });
    expect(visibleQuickPins(s.c.getSnapshot())).toEqual({ ids: [], unconfirmed: false });
  });

  it('pins, unpins and reorders as whole lists against the confirmed revision, stored with their key before they are sent', async () => {
    const s = await ready();
    s.api.write.mockImplementationOnce(async w => { expect(JSON.parse(s.stored()!).intent).toEqual(w); return receipt(w); });
    expect(await s.c.pin(ID(1))).toBe('sent');
    expect(s.api.write).toHaveBeenLastCalledWith({ savedMealIds: [ID(1)], expectedRevision: 0, idempotencyKey: 'pins-owner-1' });
    expect(s.c.getSnapshot()).toMatchObject({ phase: 'idle', confirmed: snap(1, [ID(1)]), intent: null, error: null });
    expect(s.stored()).toBeUndefined();
    await s.c.pin(ID(2)); await s.c.pin(ID(3));
    await s.c.move(ID(3), 0);
    expect(s.api.write).toHaveBeenLastCalledWith({ savedMealIds: [ID(3), ID(1), ID(2)], expectedRevision: 3, idempotencyKey: 'pins-owner-4' });
    await s.c.unpin(ID(1));
    expect(s.c.getSnapshot().confirmed).toEqual(snap(5, [ID(3), ID(2)]));
    // Unchanged lists send nothing.
    expect(await s.c.pin(ID(3))).toBe('unchanged'); expect(await s.c.write([ID(3), ID(2)])).toBe('unchanged');
    expect(s.api.write).toHaveBeenCalledTimes(5);
  });

  it('0 and 6 pins are writable; a seventh or a repeat is refused on the device without a request', async () => {
    const six = Array.from({ length: 6 }, (_, n) => ID(n + 1));
    const s = await ready(snap(4, six));
    expect(await s.c.pin(ID(7))).toBe('refused'); expect(s.c.getSnapshot().error).toBe('full');
    expect(await s.c.write([ID(1), ID(1)])).toBe('refused'); expect(s.c.getSnapshot().error).toBe('invalid');
    expect(s.api.write).not.toHaveBeenCalled();
    expect(await s.c.write([])).toBe('sent');
    expect(s.c.getSnapshot().confirmed).toEqual(snap(5, []));
  });

  it('a lost answer keeps the intent; recovery replays exactly the same request, never a second key', async () => {
    const s = await ready(snap(2, [ID(1)]));
    s.api.write.mockResolvedValueOnce(lost).mockRejectedValueOnce(new Error('offline'));
    await s.c.pin(ID(2));
    expect(s.c.getSnapshot()).toMatchObject({ phase: 'uncertain', error: 'uncertain', confirmed: snap(2, [ID(1)]) });
    expect(visibleQuickPins(s.c.getSnapshot())).toEqual({ ids: [ID(1), ID(2)], unconfirmed: true });
    expect(JSON.parse(s.stored()!).intent).toEqual(s.api.write.mock.calls[0]![0]);
    // A new change waits for this one.
    expect(await s.c.unpin(ID(1))).toBe('refused');
    await s.c.recover();
    expect(s.c.getSnapshot().phase).toBe('uncertain');
    await s.c.recover();
    expect(s.api.write).toHaveBeenCalledTimes(3);
    expect(new Set(s.api.write.mock.calls.map(([w]) => JSON.stringify(w))).size).toBe(1);
    expect(s.c.getSnapshot()).toMatchObject({ phase: 'idle', confirmed: snap(3, [ID(1), ID(2)]), intent: null });
    expect(s.stored()).toBeUndefined();
  });

  it('the intent survives closing the app: a new controller finds it unconfirmed and replays it only when asked', async () => {
    const storage = memory();
    const first = await ready(snap(0, []), { storage });
    first.api.write.mockResolvedValueOnce(lost);
    await first.c.pin(ID(1)); first.c.dispose();
    const second = setup({ storage });
    await second.c.initialize();
    expect(second.c.getSnapshot()).toMatchObject({ phase: 'uncertain', intent: { intent: { savedMealIds: [ID(1)], expectedRevision: 0, idempotencyKey: 'pins-owner-1' } } });
    expect(second.api.write).not.toHaveBeenCalled();
    // Meanwhile the GET shows the write was applied (revision 1): the replay gets the stored receipt, no second change.
    second.c.adopt(ok(snap(1, [ID(1)])));
    second.api.write.mockResolvedValueOnce({ status: 'ok', data: snap(1, [ID(1)]), meta });
    await second.c.recover();
    expect(second.api.write).toHaveBeenCalledWith(first.api.write.mock.calls[0]![0]);
    expect(second.c.getSnapshot()).toMatchObject({ phase: 'idle', confirmed: snap(1, [ID(1)]) });
  });

  it('a reinstall (empty storage) has no intent: the server truth is all there is', async () => {
    const s = setup({ storage: memory() });
    await s.c.initialize(); s.c.adopt(ok(snap(7, [ID(4)], 'archived')));
    expect(s.c.getSnapshot()).toMatchObject({ phase: 'idle', intent: null, confirmed: snap(7, [ID(4)], 'archived') });
  });

  it('accounts never share pins or intents on one device', async () => {
    const storage = memory();
    const a = await ready(snap(0, []), { storage, user: 'a' });
    a.api.write.mockResolvedValueOnce(lost);
    await a.c.pin(ID(1));
    const b = setup({ storage, user: 'b' });
    await b.c.initialize();
    expect(b.c.getSnapshot()).toMatchObject({ phase: 'idle', intent: null });
    b.c.adopt(ok(snap(3, [ID(9)]))); await b.c.pin(ID(8));
    expect(b.api.write).toHaveBeenCalledWith({ savedMealIds: [ID(9), ID(8)], expectedRevision: 3, idempotencyKey: 'pins-b-1' });
    expect(JSON.parse(storage.map.get(quickPinsStorageKey('a'))!).intent.savedMealIds).toEqual([ID(1)]);
    expect(storage.map.has(quickPinsStorageKey('b'))).toBe(false);
  });

  it('a stale revision from another device: server truth is shown, my change is kept apart and sent again only on request', async () => {
    const s = await ready(snap(1, [ID(1)]));
    s.api.write.mockResolvedValueOnce(conflict('QUICK_PINS_CHANGED', snap(2, [ID(5)])));
    await s.c.pin(ID(2));
    expect(s.c.getSnapshot()).toMatchObject({ phase: 'conflict', error: 'changed', confirmed: snap(2, [ID(5)]), wanted: [ID(1), ID(2)], intent: null });
    expect(visibleQuickPins(s.c.getSnapshot())).toEqual({ ids: [ID(5)], unconfirmed: false });
    expect(s.stored()).toBeUndefined(); expect(s.api.write).toHaveBeenCalledTimes(1); expect(s.api.read).not.toHaveBeenCalled();
    await s.c.reapply();
    expect(s.api.write).toHaveBeenLastCalledWith({ savedMealIds: [ID(1), ID(2)], expectedRevision: 2, idempotencyKey: 'pins-owner-2' });
    expect(s.c.getSnapshot()).toMatchObject({ phase: 'idle', confirmed: snap(3, [ID(1), ID(2)]), wanted: null });
  });

  it('an unavailable meal or a conflict without truth re-reads the same GET; a dismissed wish is dropped', async () => {
    const s = await ready(snap(1, [ID(1)]), {});
    s.api.write.mockResolvedValueOnce(conflict('QUICK_PIN_UNAVAILABLE', snap(1, [ID(1)])));
    await s.c.pin(ID(2));
    expect(s.c.getSnapshot()).toMatchObject({ phase: 'conflict', error: 'pin_unavailable', wanted: [ID(1), ID(2)] });
    s.c.dismiss();
    expect(s.c.getSnapshot()).toMatchObject({ phase: 'idle', wanted: null, error: null });
    s.api.read.mockResolvedValueOnce({ status: 'ok', data: options(ok(snap(4, [ID(3)]))), meta });
    s.api.write.mockResolvedValueOnce({ status: 'conflict', code: 'QUICK_PINS_CHANGED', message: 'm', data: { error: 'QUICK_PINS_CHANGED', message: 'm', current: null }, meta: { ...meta, httpStatus: 409, outcome: 'conflict' } });
    await s.c.pin(ID(2));
    expect(s.api.read).toHaveBeenCalledTimes(1);
    expect(s.c.getSnapshot()).toMatchObject({ phase: 'conflict', confirmed: snap(4, [ID(3)]) });
    s.c.dismiss();
    s.api.write.mockResolvedValueOnce(conflict('IDEMPOTENCY_KEY_REUSED', null));
    s.api.read.mockResolvedValueOnce({ status: 'unavailable', reason: 'network', meta });
    await s.c.pin(ID(2));
    expect(s.c.getSnapshot()).toMatchObject({ phase: 'conflict', error: 'key_reused', availability: 'unavailable', confirmed: snap(4, [ID(3)]) });
  });

  it('answers out of order never move the truth back; a late answer after an account switch changes nothing', async () => {
    const s = await ready(snap(1, [ID(1)]));
    await s.c.pin(ID(2));
    expect(s.c.getSnapshot().confirmed).toEqual(snap(2, [ID(1), ID(2)]));
    s.c.adopt(ok(snap(1, [ID(1)])));
    expect(s.c.getSnapshot().confirmed).toEqual(snap(2, [ID(1), ID(2)]));
    // Same revision: a newer read of the same list (a pinned meal archived meanwhile) refreshes the states.
    s.c.adopt(ok({ revision: 2, items: [{ id: ID(1), state: 'archived' }, { id: ID(2), state: 'active' }] }));
    expect(s.c.getSnapshot().confirmed!.items[0]).toEqual({ id: ID(1), state: 'archived' });
    // A failed read keeps the confirmed snapshot but says it could not be refreshed.
    s.c.adopt({ status: 'unavailable' });
    expect(s.c.getSnapshot()).toMatchObject({ availability: 'unavailable', confirmed: { revision: 2 } });
    // A good read with an older revision: the read worked («ok»), the newer confirmed truth stays.
    s.c.adopt(ok(snap(1, [ID(9)])));
    expect(s.c.getSnapshot()).toMatchObject({ availability: 'ok', confirmed: { revision: 2 } });
    // An older reload answering after a newer one is ignored.
    let releaseOld!: (v: Awaited<ReturnType<QuickPinsApi['read']>>) => void;
    s.api.read.mockImplementationOnce(() => new Promise(resolve => { releaseOld = resolve; })).mockResolvedValueOnce({ status: 'ok', data: options(ok(snap(5, [ID(5)]))), meta });
    const old = s.c.reload(); await s.c.reload();
    releaseOld({ status: 'ok', data: options(ok(snap(3, [ID(3)]))), meta }); await old;
    expect(s.c.getSnapshot().confirmed).toEqual(snap(5, [ID(5)]));
    // In flight when the account changes: the controller is disposed, the answer is ignored, the intent stays stored.
    let release!: (v: WriteResult) => void;
    s.api.write.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
    const calls = s.api.write.mock.calls.length;
    const pending = s.c.pin(ID(6));
    await sent(s.api.write, calls + 1);
    const before = s.c.getSnapshot();
    expect(before.phase).toBe('pending');
    s.c.dispose(); release(receipt(s.api.write.mock.calls.at(-1)![0])); await pending;
    expect(s.c.getSnapshot()).toBe(before); expect(s.stored()).toBeDefined();
  });

  it('one write at a time: a second change while one is in flight is refused, not queued', async () => {
    const s = await ready();
    let release!: (v: WriteResult) => void;
    s.api.write.mockImplementationOnce(w => new Promise(resolve => { release = () => resolve(receipt(w)); }));
    const first = s.c.pin(ID(1));
    await sent(s.api.write, 1);
    expect(await s.c.pin(ID(2))).toBe('refused');
    release(lost); await first;
    expect(s.api.write).toHaveBeenCalledTimes(1);
  });

  it('session and validation outcomes: a session error keeps the intent to replay; a validation error drops it and keeps the wish', async () => {
    const s = await ready(snap(1, [ID(1)]));
    s.api.write.mockResolvedValueOnce({ status: 'unauthorized', meta }).mockResolvedValueOnce({ status: 'validation', message: 'Revisá las comidas fijadas.', meta });
    await s.c.pin(ID(2));
    expect(s.c.getSnapshot()).toMatchObject({ phase: 'uncertain', error: 'session' }); expect(s.stored()).toBeDefined();
    await s.c.recover();
    expect(s.c.getSnapshot()).toMatchObject({ phase: 'idle', error: 'invalid', intent: null, wanted: [ID(1), ID(2)] }); expect(s.stored()).toBeUndefined();
    expect(s.api.write.mock.calls[0]![0]).toEqual(s.api.write.mock.calls[1]![0]);
  });

  it('a receipt for another list is not a confirmation; giving up keeps the wish and re-reads the truth', async () => {
    const s = await ready(snap(1, [ID(1)]), { truth: snap(2, [ID(2), ID(1)]) });
    s.api.write.mockResolvedValueOnce({ status: 'ok', data: snap(2, [ID(2), ID(1)]), meta });
    await s.c.pin(ID(2));
    expect(s.c.getSnapshot()).toMatchObject({ phase: 'uncertain', confirmed: snap(1, [ID(1)]) });
    await s.c.forget();
    expect(s.stored()).toBeUndefined(); expect(s.api.read).toHaveBeenCalledTimes(1);
    expect(s.c.getSnapshot()).toMatchObject({ phase: 'idle', intent: null, wanted: [ID(1), ID(2)], confirmed: snap(2, [ID(2), ID(1)]) });
  });

  it('device storage: an unreadable intent blocks pins (not meals); a failed save sends nothing', async () => {
    const storage = memory();
    storage.map.set(quickPinsStorageKey('owner'), '{"version":1}');
    const broken = setup({ storage });
    await broken.c.initialize();
    expect(broken.c.getSnapshot()).toMatchObject({ phase: 'blocked', error: 'storage' });
    broken.c.adopt(ok(snap(0, [])));
    expect(await broken.c.pin(ID(1))).toBe('refused');
    const failing = memory(); failing.port.setItem = async () => { throw new Error('disk full'); };
    const s = await ready(snap(0, []), { storage: failing });
    expect(await s.c.pin(ID(1))).toBe('refused');
    expect(s.c.getSnapshot()).toMatchObject({ phase: 'idle', error: 'storage', intent: null });
    expect(s.api.write).not.toHaveBeenCalled();
  });
});
