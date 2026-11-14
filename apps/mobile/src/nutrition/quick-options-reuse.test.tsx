// #303 C3b: reopening Rápido may reuse the options QuickController already holds instead of a new quick-options GET.
// Real QuickController / QuickPinsController, in-memory APIs and storage, a test clock and the REAL per-domain write
// revision of the ConfirmedReadCache with simulated clients. Counts are simulated GETs, never network measurements.
import { act, render, renderHook, waitFor } from '@testing-library/react-native';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

import { clearConfirmedReads, invalidateConfirmedReads, settledWritesFor } from '@/api/confirmed-read-cache';
import type { QuickOptions, QuickPins, QuickPinsSnapshot } from '@/api/nutrition-quick';
import type { MobileApiReadResult } from '@/api/results';
import { OwnlevelThemeProvider } from '@/design-system';

import { QuickController, QUICK_OPTIONS_REUSE_MS, type QuickApi } from './quick-controller';
import { QuickEditor } from './quick-editor';
import { QuickPinsController, type QuickPinsApi } from './quick-pins-controller';
import { QuickPinsIntentRepository } from './quick-pins-storage';
import { QuickIntentRepository } from './quick-storage';
import { quickDate, quickOption, quickOptions, quickPreview, quickReceipt } from './quick-fixture.test-helper';
import { BASE, ID, names, snap, storage } from './quick-library-fixture.test-helper';
import { nutritionFixture } from './day-fixture.test-helper';
import { useQuickPinsController } from './use-quick-pins-controller';

jest.mock('./day-resource', () => ({ useNutritionDayResource: () => ({ state: { status: 'loading' } }) }));
jest.mock('@/api', () => ({ useMobileApi: () => ({ client: null }) }));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
const mockStore = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({ __esModule: true, default: {
  getItem: async (k: string) => mockStore.get(k) ?? null, setItem: async (k: string, v: string) => { mockStore.set(k, v); }, removeItem: async (k: string) => { mockStore.delete(k); },
} }));
const mockPut = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockFetchOptions = jest.fn<(...args: unknown[]) => Promise<unknown>>();
jest.mock('@/api/nutrition-quick', () => ({ ...jest.requireActual<object>('@/api/nutrition-quick'),
  putQuickPins: (...args: unknown[]) => mockPut(...args), fetchQuickOptions: (...args: unknown[]) => mockFetchOptions(...args) }));

type Read = MobileApiReadResult<QuickOptions>;
const meta = { durationMs: 1, httpStatus: 200, outcome: 'ok' as const };
const okRead = (data: QuickOptions = quickOptions()): Read => ({ status: 'ok', data, meta });
const offline: Read = { status: 'unavailable', reason: 'network', meta: { durationMs: 1, httpStatus: null, outcome: 'unavailable' } };
const denied401 = { status: 'unauthorized', meta: { durationMs: 1, httpStatus: 401, outcome: 'unauthorized' } } as unknown as Read;
const denied403: Read = { status: 'unavailable', reason: 'server', meta: { durationMs: 1, httpStatus: 403, outcome: 'unavailable' } } as Read;
const settle = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
let clock = 0;
let day = quickDate;
let account: object = {};

/** A Rápido controller as the app builds it: reuse driven by the clock, the account's nutrition writes and the day. */
function quick(options = jest.fn<QuickApi['options']>().mockImplementation(async () => okRead()), reuse = true) {
  const shared = storage();
  const api: QuickApi = { options,
    preview: jest.fn<QuickApi['preview']>().mockImplementation(async s => ({ status: 'ok', data: quickPreview(s), meta })),
    confirm: jest.fn<QuickApi['confirm']>().mockResolvedValue({ status: 'ok', data: quickReceipt, meta }),
    read: jest.fn<QuickApi['read']>().mockImplementation(async d => ({ status: 'ok', data: nutritionFixture(d), meta })) };
  const client = account;
  const controller = new QuickController(api, new QuickIntentRepository(shared.port, 'owner'), () => {}, undefined,
    reuse ? { now: () => clock, writeRevision: () => settledWritesFor(client as never, ['nutrition']), today: () => day } : undefined);
  /** Open Rápido (no option chosen) and let its read, if any, settle. */
  const open = async () => { await act(async () => { controller.open(quickDate); await settle(); }); };
  const close = () => act(() => { controller.close(); });
  return { controller, api, options, open, close };
}

beforeEach(() => { clock = Date.parse('2026-10-03T15:00:00.000Z'); day = quickDate; account = {}; mockStore.clear(); mockPut.mockReset(); mockFetchOptions.mockReset(); });
afterEach(() => { clearConfirmedReads(account as never); });

describe('QuickController · reopening reuses the options it holds (no second copy)', () => {
  it('cold open reads; reopening within 30 s reads nothing; after 30 s it reads again', async () => {
    const q = quick();
    await act(async () => { await q.controller.initialize(); });
    await q.open();
    expect(q.options).toHaveBeenCalledTimes(1);
    const held = q.controller.getSnapshot().options;
    q.close();
    clock += 20_000;
    await q.open();
    expect(q.options).toHaveBeenCalledTimes(1); // before C3b: 2
    expect(q.controller.getSnapshot()).toMatchObject({ open: true, optionsReused: true, optionsLoading: false, optionsError: false });
    expect(q.controller.getSnapshot().options).toBe(held); // the same object: nothing copied
    q.close();
    clock += QUICK_OPTIONS_REUSE_MS; // 50 s after the read
    await q.open();
    expect(q.options).toHaveBeenCalledTimes(2);
    expect(q.controller.getSnapshot().optionsReused).toBe(false);
  });

  it.each([
    ['a meal registered (Rápido or the day)', '/api/mobile/v1/nutrition/days/2026-10-03/meal-registrations'],
    ['a saved meal edited', '/api/mobile/v1/nutrition/meals/m1'],
    ['pins changed', '/api/mobile/v1/nutrition/quick-pins'],
    ['physical data (targets)', '/api/mobile/v1/profile/physical'],
    ['an unmapped write (profile)', '/api/mobile/v1/profile'],
  ])('after %s, reopening within 30 s reads again', async (_name, path) => {
    const q = quick();
    await act(async () => { await q.controller.initialize(); });
    await q.open(); q.close();
    invalidateConfirmedReads(account as never, path);
    clock += 1_000;
    await q.open();
    expect(q.options).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['a weight', '/api/mobile/v1/body/weights/2026-10-03'],
    ['a finished session', '/api/mobile/v1/training/sessions/s/finish'],
    ['a Progreso view', '/api/mobile/v1/progress/views'],
    ['a meal preview (computes only)', '/api/mobile/v1/nutrition/days/2026-10-03/meal-preview'],
  ])('%s does not touch the options: reopening reuses them', async (_name, path) => {
    const q = quick();
    await act(async () => { await q.controller.initialize(); });
    await q.open(); q.close();
    invalidateConfirmedReads(account as never, path);
    clock += 1_000;
    await q.open();
    expect(q.options).toHaveBeenCalledTimes(1);
  });

  it('a write that settles WHILE the GET is in flight makes that answer unusable for a reopening', async () => {
    let finish!: (value: Read) => void;
    const options = jest.fn<QuickApi['options']>().mockImplementationOnce(() => new Promise(resolve => { finish = resolve; })).mockImplementation(async () => okRead());
    const q = quick(options);
    await act(async () => { await q.controller.initialize(); });
    await q.open();
    invalidateConfirmedReads(account as never, '/api/mobile/v1/nutrition/days/2026-10-03/meal-registrations');
    await act(async () => { finish(okRead()); await settle(); });
    q.close();
    await q.open();
    expect(options).toHaveBeenCalledTimes(2);
  });

  it('a new Córdoba day (or an answer for another day) never reuses', async () => {
    const q = quick();
    await act(async () => { await q.controller.initialize(); });
    await q.open(); q.close();
    day = '2026-10-04'; clock += 1_000;
    await q.open();
    expect(q.options).toHaveBeenCalledTimes(2);
  });

  it('another account: its writes do not count here, and a new controller (account switch) always reads', async () => {
    const q = quick();
    await act(async () => { await q.controller.initialize(); });
    await q.open(); q.close();
    const other = {};
    invalidateConfirmedReads(other as never, '/api/mobile/v1/nutrition/quick-pins');
    clock += 1_000;
    await q.open();
    expect(q.options).toHaveBeenCalledTimes(1);
    clearConfirmedReads(other as never);
    account = other; // the app builds one controller per client and user
    const switched = quick();
    await act(async () => { await switched.controller.initialize(); });
    await switched.open();
    expect(switched.options).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['pins unknown', { ...quickOptions(), pins: { status: 'unavailable' } as QuickPins }],
    ['saved unavailable', { ...quickOptions(), saved: { status: 'unavailable' } } as QuickOptions],
    ['suggested unavailable', { ...quickOptions(), suggested: { status: 'unavailable' } } as QuickOptions],
  ])('an incomplete answer (%s) is never reused: reopening reads again', async (_name, data) => {
    const q = quick(jest.fn<QuickApi['options']>().mockImplementationOnce(async () => okRead(data)).mockImplementation(async () => okRead()));
    await act(async () => { await q.controller.initialize(); });
    await q.open(); q.close();
    clock += 1_000;
    await q.open();
    expect(q.options).toHaveBeenCalledTimes(2);
  });

  it.each([['offline', offline], ['401', denied401], ['403', denied403]])('a failed refresh (%s) drops the reuse: the next opening reads, and recovers', async (_name, failure) => {
    const options = jest.fn<QuickApi['options']>().mockImplementationOnce(async () => okRead()).mockImplementationOnce(async () => failure).mockImplementation(async () => okRead());
    const q = quick(options);
    await act(async () => { await q.controller.initialize(); });
    await q.open();
    await act(async () => { await q.controller.loadOptions(); }); // foreground / «Reintentar» while open: it always reads
    expect(q.controller.getSnapshot().optionsError).toBe(true);
    q.close();
    clock += 1_000;
    await q.open();
    expect(options).toHaveBeenCalledTimes(3);
    expect(q.controller.getSnapshot()).toMatchObject({ optionsError: false, optionsReused: false });
  });

  it('foreground and «Reintentar» (loadOptions) always read, even inside the window', async () => {
    const q = quick();
    await act(async () => { await q.controller.initialize(); });
    await q.open(); q.close();
    await q.open(); // reused
    await act(async () => { await q.controller.loadOptions(); });
    expect(q.options).toHaveBeenCalledTimes(2);
  });

  it('a preview conflict reads the current truth from the server, never the reused options', async () => {
    const q = quick();
    await act(async () => { await q.controller.initialize(); });
    await q.open(); q.close();
    await q.open(); // reused, no GET
    expect(q.options).toHaveBeenCalledTimes(1);
    (q.api.preview as jest.Mock<QuickApi['preview']>).mockResolvedValueOnce({ status: 'conflict', code: 'QUICK_SOURCE_CHANGED', message: 'La opción cambió.' } as never);
    await act(async () => { q.controller.choose(quickOption(true)); await settle(); });
    expect(q.controller.getSnapshot().phase).toBe('conflict');
    expect(q.options).toHaveBeenCalledTimes(2);
  });

  it('a late answer of an earlier opening is ignored and never becomes reusable', async () => {
    let finishOld!: (value: Read) => void;
    const older = { ...quickOptions(), saved: { status: 'ok' as const, items: [] } };
    const options = jest.fn<QuickApi['options']>().mockImplementationOnce(() => new Promise(resolve => { finishOld = resolve; })).mockImplementation(async () => okRead());
    const q = quick(options);
    await act(async () => { await q.controller.initialize(); });
    await q.open(); q.close(); // the first GET is still pending
    await q.open(); // nothing completed yet: it reads
    expect(options).toHaveBeenCalledTimes(2);
    await act(async () => { finishOld(okRead(older)); await settle(); });
    expect(q.controller.getSnapshot().options?.saved).toEqual(quickOptions().saved); // the late, older answer did not win
    q.close();
    await q.open(); // reuses the answer of the SECOND opening
    expect(options).toHaveBeenCalledTimes(2);
  });

  it('a clock set back (negative age) never counts as recent: the opening reads', async () => {
    const q = quick();
    await act(async () => { await q.controller.initialize(); });
    await q.open(); q.close();
    clock -= 60_000; // the device clock was moved back a minute
    await q.open();
    expect(q.options).toHaveBeenCalledTimes(2);
    expect(q.controller.getSnapshot().optionsReused).toBe(false);
    q.close();
    clock += 1_000; // and from that new read on, reuse works normally again
    await q.open();
    expect(q.options).toHaveBeenCalledTimes(2);
  });

  it('without a reuse policy (as before C3b) every opening reads', async () => {
    const q = quick(undefined, false);
    await act(async () => { await q.controller.initialize(); });
    await q.open(); q.close();
    await q.open();
    expect(q.options).toHaveBeenCalledTimes(2);
  });
});

describe('QuickPinsController · a reused reading is never the authority for a pins write', () => {
  const pinsRead = (revision: number, ids: string[]): Read => okRead({ ...quickOptions(), pins: { status: 'ok', ...snap(revision, ids) } });
  function pins(read = jest.fn<QuickPinsApi['read']>()) {
    const shared = storage();
    const write = jest.fn<QuickPinsApi['write']>().mockImplementation(async w => ({ status: 'ok', data: snap(w.expectedRevision + 1, w.savedMealIds), meta }));
    const controller = new QuickPinsController({ write, read }, new QuickPinsIntentRepository(shared.port, 'owner'), () => 'pins-key');
    return { controller, write, read };
  }
  it('after a reused opening, pinning reads first and builds the list on THAT truth (another device added one)', async () => {
    const p = pins(jest.fn<QuickPinsApi['read']>().mockResolvedValue(pinsRead(5, [ID(2)])));
    await act(async () => { await p.controller.initialize(); });
    act(() => { p.controller.adopt({ status: 'ok', ...snap(4, []) }); });
    act(() => { p.controller.requireVerification(); });
    await act(async () => { await p.controller.pin(ID(1)); });
    expect(p.read).toHaveBeenCalledTimes(1);
    expect(p.read.mock.invocationCallOrder[0]).toBeLessThan(p.write.mock.invocationCallOrder[0]);
    expect(p.write.mock.calls[0][0]).toMatchObject({ savedMealIds: [ID(2), ID(1)], expectedRevision: 5 }); // not [ID(1)] @ 4
  });
  it.each([['offline', offline], ['401', denied401], ['403', denied403]])('if that read fails (%s), nothing is written with the retained revision', async (_name, failure) => {
    const p = pins(jest.fn<QuickPinsApi['read']>().mockResolvedValue(failure));
    await act(async () => { await p.controller.initialize(); });
    act(() => { p.controller.adopt({ status: 'ok', ...snap(4, []) }); p.controller.requireVerification(); });
    let outcome: string | undefined;
    await act(async () => { outcome = await p.controller.unpin(ID(1)); });
    expect(outcome).toBe('refused');
    expect(p.write).not.toHaveBeenCalled();
    expect(p.controller.getSnapshot().error).toBe('unavailable');
  });
  it('a conflict on the verified write still shows the server truth and keeps the wish (409 path unchanged)', async () => {
    const p = pins(jest.fn<QuickPinsApi['read']>().mockResolvedValue(pinsRead(5, [ID(2)])));
    p.write.mockResolvedValueOnce({ status: 'conflict', code: 'QUICK_PINS_CHANGED', message: 'x', data: { error: 'QUICK_PINS_CHANGED', current: snap(6, [ID(3)]) } } as never);
    await act(async () => { await p.controller.initialize(); });
    act(() => { p.controller.adopt({ status: 'ok', ...snap(4, []) }); p.controller.requireVerification(); });
    await act(async () => { await p.controller.pin(ID(1)); });
    expect(p.controller.getSnapshot()).toMatchObject({ phase: 'conflict', error: 'changed', wanted: [ID(2), ID(1)], confirmed: snap(6, [ID(3)]) });
  });
  it('a pin read in this opening (no reuse) writes with no extra read, as before', async () => {
    const p = pins();
    await act(async () => { await p.controller.initialize(); });
    act(() => { p.controller.adopt({ status: 'ok', ...snap(4, []) }); });
    await act(async () => { await p.controller.pin(ID(1)); });
    expect(p.read).not.toHaveBeenCalled();
    expect(p.write).toHaveBeenCalledTimes(1);
  });
  it('a write receipt verifies: the next change in the same opening needs no read', async () => {
    const p = pins(jest.fn<QuickPinsApi['read']>().mockResolvedValue(pinsRead(5, [])));
    await act(async () => { await p.controller.initialize(); });
    act(() => { p.controller.adopt({ status: 'ok', ...snap(4, []) }); p.controller.requireVerification(); });
    await act(async () => { await p.controller.pin(ID(1)); });
    await act(async () => { await p.controller.pin(ID(2)); });
    expect(p.read).toHaveBeenCalledTimes(1);
    expect(p.write.mock.calls[1][0]).toMatchObject({ savedMealIds: [ID(1), ID(2)], expectedRevision: 6 });
  });
});

describe('QuickPinsController · «Aplicar mi cambio» and every new write verify; a replay never does', () => {
  const pinsRead = (revision: number, ids: string[]): Read => okRead({ ...quickOptions(), pins: { status: 'ok', ...snap(revision, ids) } });
  const conflict = (current: QuickPinsSnapshot) => ({ status: 'conflict', code: 'QUICK_PINS_CHANGED', message: 'x', data: { error: 'QUICK_PINS_CHANGED', current } }) as never;
  /** A 409 left `wanted` and phase «conflict»; then Rápido was closed and reopened reusing its options. */
  async function conflictThenReusedOpening(read: jest.Mock<QuickPinsApi['read']>) {
    const shared = storage();
    const write = jest.fn<QuickPinsApi['write']>().mockResolvedValueOnce(conflict(snap(6, [ID(3)])))
      .mockImplementation(async w => ({ status: 'ok', data: snap(w.expectedRevision + 1, w.savedMealIds), meta }));
    let key = 0;
    const controller = new QuickPinsController({ write, read }, new QuickPinsIntentRepository(shared.port, 'owner'), () => `pins-key-${++key}`);
    await act(async () => { await controller.initialize(); });
    act(() => { controller.adopt({ status: 'ok', ...snap(4, []) }); });
    await act(async () => { await controller.pin(ID(1)); });
    expect(controller.getSnapshot()).toMatchObject({ phase: 'conflict', wanted: [ID(1)], confirmed: snap(6, [ID(3)]) });
    act(() => { controller.requireVerification(); }); // the reused opening
    return { controller, write, read };
  }
  it('«Aplicar mi cambio» after a reused opening reads first and sends `wanted` as it is, against the CURRENT revision', async () => {
    const c = await conflictThenReusedOpening(jest.fn<QuickPinsApi['read']>().mockResolvedValue(pinsRead(7, [ID(3), ID(4)])));
    await act(async () => { await c.controller.reapply(); });
    expect(c.read).toHaveBeenCalledTimes(1);
    expect(c.read.mock.invocationCallOrder[0]).toBeLessThan(c.write.mock.invocationCallOrder[1]);
    // The person's explicit wish, unmerged, against the revision just read (7), not the retained 6.
    expect(c.write.mock.calls[1][0]).toMatchObject({ savedMealIds: [ID(1)], expectedRevision: 7 });
    expect(c.controller.getSnapshot()).toMatchObject({ phase: 'idle', wanted: null, confirmed: snap(8, [ID(1)]) });
  });
  it.each([['offline', offline], ['401', denied401], ['403', denied403]])('«Aplicar mi cambio» whose read fails (%s): zero PUT, `wanted` and the conflict intact', async (_name, failure) => {
    const c = await conflictThenReusedOpening(jest.fn<QuickPinsApi['read']>().mockResolvedValue(failure));
    let outcome: string | undefined;
    await act(async () => { outcome = await c.controller.reapply(); });
    expect(outcome).toBe('refused');
    expect(c.write).toHaveBeenCalledTimes(1); // only the original, refused write
    expect(c.controller.getSnapshot()).toMatchObject({ phase: 'conflict', wanted: [ID(1)], confirmed: snap(6, [ID(3)]), intent: null, error: 'unavailable' });
    // Once the pins can be read, the same wish applies on request.
    c.read.mockResolvedValue(pinsRead(7, [ID(3)]));
    await act(async () => { await c.controller.reapply(); });
    expect(c.write.mock.calls[1][0]).toMatchObject({ savedMealIds: [ID(1)], expectedRevision: 7 });
  });
  it('a direct write() after a reused opening reads first as well', async () => {
    const shared = storage();
    const read = jest.fn<QuickPinsApi['read']>().mockResolvedValue(pinsRead(5, [ID(2)]));
    const write = jest.fn<QuickPinsApi['write']>().mockImplementation(async w => ({ status: 'ok', data: snap(w.expectedRevision + 1, w.savedMealIds), meta }));
    const controller = new QuickPinsController({ write, read }, new QuickPinsIntentRepository(shared.port, 'owner'), () => 'k');
    await act(async () => { await controller.initialize(); });
    act(() => { controller.adopt({ status: 'ok', ...snap(4, []) }); controller.requireVerification(); });
    await act(async () => { await controller.write([ID(9)]); });
    expect(read.mock.invocationCallOrder[0]).toBeLessThan(write.mock.invocationCallOrder[0]);
    expect(write.mock.calls[0][0]).toMatchObject({ savedMealIds: [ID(9)], expectedRevision: 5 });
  });
  it('recovering an uncertain intent after a reused opening replays the SAME body and key, with no read', async () => {
    const shared = storage();
    const read = jest.fn<QuickPinsApi['read']>();
    const write = jest.fn<QuickPinsApi['write']>().mockResolvedValueOnce(offline as never)
      .mockImplementation(async w => ({ status: 'ok', data: snap(w.expectedRevision + 1, w.savedMealIds), meta }));
    const controller = new QuickPinsController({ write, read }, new QuickPinsIntentRepository(shared.port, 'owner'), () => 'the-key');
    await act(async () => { await controller.initialize(); });
    act(() => { controller.adopt({ status: 'ok', ...snap(4, []) }); });
    await act(async () => { await controller.pin(ID(1)); });
    expect(controller.getSnapshot()).toMatchObject({ phase: 'uncertain', intent: { intent: { savedMealIds: [ID(1)], expectedRevision: 4, idempotencyKey: 'the-key' } } });
    act(() => { controller.requireVerification(); }); // reopened reusing the options
    await act(async () => { await controller.recover(); });
    expect(read).not.toHaveBeenCalled();
    expect(write).toHaveBeenCalledTimes(2);
    expect(write.mock.calls[1][0]).toEqual(write.mock.calls[0][0]); // exactly the same body and idempotency key
    expect(controller.getSnapshot()).toMatchObject({ phase: 'idle', intent: null, confirmed: snap(5, [ID(1)]) });
  });
});

describe('useQuickPinsController · every reused opening asks for verification', () => {
  it('two reused openings in a row: a pin after each reads first', async () => {
    const client = { request: jest.fn() };
    mockFetchOptions.mockResolvedValue(okRead({ ...quickOptions(), pins: { status: 'ok', ...snap(4, []) } }));
    mockPut.mockImplementation(async (_c, w) => ({ status: 'ok', data: snap((w as { expectedRevision: number }).expectedRevision + 1, (w as { savedMealIds: string[] }).savedMealIds), meta }));
    const options = quickOptions();
    let state = { options, optionsError: false, optionsReused: false, open: true };
    const hook = renderHook(() => useQuickPinsController(client as never, 'owner', state));
    await waitFor(() => expect(hook.result.current?.state.phase).toBe('idle'));
    // Opening 2 reused the options; the pins are verified by a read before the pin.
    state = { ...state, open: false }; hook.rerender({});
    state = { ...state, open: true, optionsReused: true }; hook.rerender({});
    await act(async () => { await hook.result.current!.controller.pin(ID(1)); });
    expect(mockFetchOptions).toHaveBeenCalledTimes(1);
    // A read for the unpin of opening 3 too (the flag did not change, the opening did).
    state = { ...state, open: false }; hook.rerender({});
    state = { ...state, open: true }; hook.rerender({});
    await act(async () => { await hook.result.current!.controller.unpin(ID(1)); });
    expect(mockFetchOptions).toHaveBeenCalledTimes(2);
    expect(mockFetchOptions.mock.invocationCallOrder[1]).toBeLessThan(mockPut.mock.invocationCallOrder[1]);
    hook.unmount();
  });
});

describe('Rápido UI · a reused opening keeps library, A–Z, search and pins as they were', () => {
  it('reopening within 30 s: no loader, no GET, the same A–Z rows and pinned section', async () => {
    const shared = storage();
    const data: QuickOptions = { today: quickDate, saved: { status: 'ok', items: BASE }, suggested: { status: 'ok', items: [] }, pins: { status: 'ok', ...snap(1, [ID(3)]) } as QuickPins };
    const options = jest.fn<QuickApi['options']>().mockResolvedValue(okRead(data));
    const quickApi: QuickApi = { options, preview: jest.fn<QuickApi['preview']>(), confirm: jest.fn<QuickApi['confirm']>(), read: jest.fn<QuickApi['read']>() };
    const client = account;
    const controller = new QuickController(quickApi, new QuickIntentRepository(shared.port, 'owner'), () => {}, undefined,
      { now: () => clock, writeRevision: () => settledWritesFor(client as never, ['nutrition']), today: () => day });
    const pinsController = new QuickPinsController({ write: jest.fn<QuickPinsApi['write']>(), read: jest.fn<QuickPinsApi['read']>() }, new QuickPinsIntentRepository(shared.port, 'owner'), () => 'k');
    const ui = () => <OwnlevelThemeProvider initialMode="light"><QuickEditor controller={controller} state={controller.getSnapshot()} pins={{ controller: pinsController, state: pinsController.getSnapshot() }} /></OwnlevelThemeProvider>;
    const view = render(ui());
    controller.subscribe(() => view.rerender(ui())); pinsController.subscribe(() => view.rerender(ui()));
    await act(async () => { await controller.initialize(); await pinsController.initialize(); controller.open(quickDate); await settle(); });
    act(() => { pinsController.adopt(controller.getSnapshot().options!.pins); });
    const before = names(view);
    expect(before.length).toBeGreaterThan(0);
    act(() => { controller.close(); });
    clock += 10_000;
    await act(async () => { controller.open(quickDate); await settle(); });
    expect(options).toHaveBeenCalledTimes(1);
    expect(view.queryByLabelText('Cargando opciones rápidas')).toBeNull();
    expect(view.queryByTestId('quick-options-refreshing')).toBeNull();
    expect(names(view)).toEqual(before);
    expect(pinsController.getSnapshot().confirmed).toEqual(snap(1, [ID(3)]));
    view.unmount();
  });
});
