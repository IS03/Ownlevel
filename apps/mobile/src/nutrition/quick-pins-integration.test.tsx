import { act, renderHook, waitFor } from '@testing-library/react-native';
import { describe, expect, it, jest } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { MobileApiClient } from '@/api/client';
import type { QuickOptions, QuickPins, QuickPinsSnapshot } from '@/api/nutrition-quick';
import { QuickController, type QuickApi } from './quick-controller';
import { QuickIntentRepository } from './quick-storage';
import { QuickPinsController, type QuickPinsApi } from './quick-pins-controller';
import { QuickPinsIntentRepository, quickPinsStorageKey } from './quick-pins-storage';
import { useQuickPinsController } from './use-quick-pins-controller';
import { quickDate, quickOptions, quickPreview, quickReceipt } from './quick-fixture.test-helper';
import { nutritionFixture } from './day-fixture.test-helper';

jest.mock('@react-native-async-storage/async-storage', () => jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'));
const meta = { durationMs: 1, httpStatus: 200, outcome: 'ok' as const };
const ID = (n: number) => `47900000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const snap = (revision: number, list: string[]): QuickPinsSnapshot => ({ revision, items: list.map(id => ({ id, state: 'active' as const })) });
const withPins = (pins: QuickPins): QuickOptions => ({ ...quickOptions(), pins });

describe('#479 B · pins hook: the quick-options answer Rápido already has, one controller per account', () => {
  it('adopts pins from each new GET answer without a request of its own, and isolates accounts', async () => {
    const client = { read: jest.fn(), request: jest.fn() } as unknown as MobileApiClient;
    const first = withPins({ status: 'ok', ...snap(2, [ID(1)]) });
    type Props = { user: string; quick: { options: QuickOptions | null; optionsError: boolean } | null };
    const view = renderHook<ReturnType<typeof useQuickPinsController>, Props>(({ user, quick }) => useQuickPinsController(client, user, quick),
      { initialProps: { user: 'a', quick: { options: first, optionsError: false } } });
    await waitFor(() => expect(view.result.current?.state.confirmed).toEqual(snap(2, [ID(1)])));
    view.rerender({ user: 'a', quick: { options: withPins({ status: 'ok', ...snap(3, [ID(1), ID(2)]) }), optionsError: false } });
    await waitFor(() => expect(view.result.current?.state.confirmed?.revision).toBe(3));
    // A failed GET with nothing to show: unknown pins, not zero.
    view.rerender({ user: 'a', quick: { options: null, optionsError: true } });
    await waitFor(() => expect(view.result.current?.state.availability).toBe('unavailable'));
    expect(view.result.current?.state.confirmed?.revision).toBe(3);
    // Another account: a new controller that knows nothing of the first one's pins.
    const firstController = view.result.current!.controller;
    view.rerender({ user: 'b', quick: null });
    await waitFor(() => expect(view.result.current?.userId).toBe('b'));
    expect(view.result.current!.controller).not.toBe(firstController);
    expect(view.result.current!.state).toMatchObject({ confirmed: null, availability: 'unknown', intent: null });
    expect(client.read).not.toHaveBeenCalled(); expect(client.request).not.toHaveBeenCalled();
    view.unmount();
  });
  it('a failed GET that keeps the previous options marks the pins unavailable, keeps revision N for CAS, and the next good GET restores «ok» without going back', async () => {
    const N = 4;
    await AsyncStorage.setItem(quickPinsStorageKey('a'), JSON.stringify({ version: 1, intent: { savedMealIds: [ID(1), ID(2)], expectedRevision: N, idempotencyKey: 'pins-a-pending' }, base: snap(N, [ID(1)]) }));
    const lost = { status: 'unavailable' as const, reason: 'network' as const, meta: { ...meta, httpStatus: null, outcome: 'unavailable' as const } };
    const options = jest.fn<QuickApi['options']>()
      .mockResolvedValueOnce({ status: 'ok', data: withPins({ status: 'ok', ...snap(N, [ID(1)]) }), meta })
      .mockResolvedValueOnce(lost)
      .mockResolvedValueOnce({ status: 'ok', data: withPins({ status: 'ok', ...snap(N - 1, [ID(9)]) }), meta })
      .mockResolvedValueOnce(lost)
      .mockResolvedValueOnce({ status: 'ok', data: withPins({ status: 'ok', ...snap(N + 1, [ID(1), ID(2)]) }), meta });
    // The real Rápido controller: it keeps its previous options when a GET fails and sets optionsError.
    const quick = new QuickController({ options, preview: jest.fn<QuickApi['preview']>(), confirm: jest.fn<QuickApi['confirm']>(), read: jest.fn<QuickApi['read']>() },
      new QuickIntentRepository({ getItem: async () => null, setItem: async () => undefined, removeItem: async () => undefined }, 'a'), () => {});
    const client = { read: jest.fn(), request: jest.fn() } as unknown as MobileApiClient;
    const view = renderHook<ReturnType<typeof useQuickPinsController>, { quick: ReturnType<QuickController['getSnapshot']> }>(
      ({ quick: state }) => useQuickPinsController(client, 'a', state), { initialProps: { quick: quick.getSnapshot() } });
    const load = async () => { await act(async () => { await quick.loadOptions(); }); view.rerender({ quick: quick.getSnapshot() }); };
    const pins = () => view.result.current!.state;

    // 1. A successful GET at revision N.
    await load();
    await waitFor(() => expect(pins()).toMatchObject({ availability: 'ok', confirmed: { revision: N } }));
    const confirmedOptions = quick.getSnapshot().options;
    // 2. A failed GET: Rápido keeps the same options object and sets optionsError.
    await load();
    expect(quick.getSnapshot()).toMatchObject({ optionsError: true }); expect(quick.getSnapshot().options).toBe(confirmedOptions);
    // 3. Unavailable, revision N kept for CAS, never an empty list, the pending intent untouched.
    await waitFor(() => expect(pins().availability).toBe('unavailable'));
    expect(pins().confirmed).toEqual(snap(N, [ID(1)]));
    expect(pins()).toMatchObject({ phase: 'uncertain', intent: { intent: { idempotencyKey: 'pins-a-pending' } } });
    // 4. A successful GET restores «ok»; one with an older revision does not move the confirmed truth back.
    await load();
    await waitFor(() => expect(pins().availability).toBe('ok'));
    expect(pins().confirmed).toEqual(snap(N, [ID(1)]));
    await load();
    await waitFor(() => expect(pins().availability).toBe('unavailable'));
    await load();
    await waitFor(() => expect(pins()).toMatchObject({ availability: 'ok', confirmed: snap(N + 1, [ID(1), ID(2)]) }));
    expect(pins().intent?.intent.idempotencyKey).toBe('pins-a-pending');
    expect(JSON.parse((await AsyncStorage.getItem(quickPinsStorageKey('a')))!).intent.idempotencyKey).toBe('pins-a-pending');
    expect(options).toHaveBeenCalledTimes(5); expect(client.read).not.toHaveBeenCalled(); expect(client.request).not.toHaveBeenCalled();
    view.unmount(); quick.dispose(); await AsyncStorage.clear();
  });
  it('restores an unconfirmed pins intent only for its own account', async () => {
    await AsyncStorage.setItem(quickPinsStorageKey('a'), JSON.stringify({ version: 1, intent: { savedMealIds: [ID(1)], expectedRevision: 0, idempotencyKey: 'pins-a-1' }, base: snap(0, []) }));
    const client = { read: jest.fn(), request: jest.fn() } as unknown as MobileApiClient;
    const a = renderHook(() => useQuickPinsController(client, 'a', null));
    await waitFor(() => expect(a.result.current?.state.phase).toBe('uncertain'));
    const b = renderHook(() => useQuickPinsController(client, 'b', null));
    await waitFor(() => expect(b.result.current?.state.phase).toBe('idle'));
    expect(b.result.current?.state.intent).toBeNull();
    a.unmount(); b.unmount(); await AsyncStorage.clear();
  });
});

describe('#479 B · pins never block or duplicate the quick add', () => {
  function storage() {
    const map = new Map<string, string>();
    return { map, port: { getItem: async (k: string) => map.get(k) ?? null, setItem: async (k: string, v: string) => { map.set(k, v); }, removeItem: async (k: string) => { map.delete(k); } } };
  }
  it('with an unconfirmed pins intent being replayed and no answer yet, + still registers once, with the same reads and writes as before', async () => {
    const shared = storage();
    const quickApi: QuickApi = {
      options: jest.fn<QuickApi['options']>().mockResolvedValue({ status: 'ok', data: withPins({ status: 'ok', ...snap(1, [ID(1)]) }), meta }),
      preview: jest.fn<QuickApi['preview']>().mockImplementation(async s => ({ status: 'ok', data: quickPreview(s), meta })),
      confirm: jest.fn<QuickApi['confirm']>().mockResolvedValue({ status: 'ok', data: quickReceipt, meta }),
      read: jest.fn<QuickApi['read']>().mockImplementation(async d => {
        const day = nutritionFixture(d);
        if (day.nutrition.status === 'ok') day.nutrition.data.meals[0] = { ...day.nutrition.data.meals[0]!, id: quickReceipt.resourceId };
        return { status: 'ok', data: day, meta };
      }),
    };
    const quick = new QuickController(quickApi, new QuickIntentRepository(shared.port, 'owner'), () => {});
    // The same person has an unconfirmed pins intent from earlier, and now a pins write that never answers.
    shared.map.set(quickPinsStorageKey('owner'), JSON.stringify({ version: 1, intent: { savedMealIds: [ID(1), ID(2)], expectedRevision: 0, idempotencyKey: 'pins-old' }, base: snap(0, []) }));
    const pinsApi = { write: jest.fn<QuickPinsApi['write']>(() => new Promise(() => {})), read: jest.fn<QuickPinsApi['read']>() };
    const pins = new QuickPinsController(pinsApi, new QuickPinsIntentRepository(shared.port, 'owner'));
    await act(async () => { await quick.initialize(); await pins.initialize(); quick.open(quickDate); });
    await waitFor(() => expect(quick.getSnapshot().options).not.toBeNull());
    pins.adopt(quick.getSnapshot().options!.pins);
    expect(pins.getSnapshot()).toMatchObject({ phase: 'uncertain', confirmed: snap(1, [ID(1)]) });
    void pins.recover();
    await waitFor(() => expect(pinsApi.write).toHaveBeenCalledTimes(1));
    expect(pins.getSnapshot().phase).toBe('pending');

    const saved = quick.getSnapshot().options!.saved;
    if (saved.status !== 'ok') throw Error('fixture');
    await act(async () => { await quick.addInline(saved.items[0]!); });
    expect(quick.getSnapshot().added?.[`saved:${saved.items[0]!.source.id}`]).toBeDefined();
    expect(quickApi.options).toHaveBeenCalledTimes(1); expect(quickApi.preview).toHaveBeenCalledTimes(1);
    expect(quickApi.confirm).toHaveBeenCalledTimes(1); expect(quickApi.read).toHaveBeenCalledTimes(1);
    expect(pinsApi.read).not.toHaveBeenCalled();
    // Two separate durable records: the meal journal is cleared on confirmation, the pins intent is untouched.
    expect(shared.map.has('ownlevel.nutrition.quick.v1.owner')).toBe(false);
    expect(JSON.parse(shared.map.get(quickPinsStorageKey('owner'))!).intent.idempotencyKey).toBe('pins-old');
    pins.dispose(); quick.dispose();
  });
});
