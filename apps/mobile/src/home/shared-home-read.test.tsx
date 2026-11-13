// #303 C2: the /home reading Inicio and Entrenar share through the existing ConfirmedReadCache. Simulated clients and
// request counters only: the counts below are simulated requests, never network traffic or latency measurements.
import { act, renderHook } from '@testing-library/react-native';
import { AppState } from 'react-native';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

import { clearConfirmedReads, invalidateConfirmedReads } from '@/api/confirmed-read-cache';
import type { MobileHomeResponse } from '@/api/home';
import { ApiResourceController } from '@/api/resource';

import { useSharedHomeRead } from './shared-home-read';

const mockFetchHome = jest.fn<(client: unknown, signal: AbortSignal) => Promise<unknown>>();
jest.mock('@/api/home', () => ({ fetchMobileHome: (client: unknown, signal: AbortSignal) => mockFetchHome(client, signal) }));

const meta = { durationMs: 1, httpStatus: 200, outcome: 'ok' as const };
const ok = (name: string) => ({ status: 'ok' as const, data: { date: '2026-10-10', profile: { status: 'ok', data: { displayName: name } } } as unknown as MobileHomeResponse, meta });
const nameOf = (state: { status: string; current?: { data: MobileHomeResponse } }) =>
  state.status === 'ready' && state.current!.data.profile.status === 'ok' ? state.current!.data.profile.data.displayName : null;
const START = Date.parse('2026-10-10T15:00:00.000Z'); // Saturday 12:00 in Córdoba
let clock = START;
let day = '2026-10-10';
const today = () => day;
const visible = () => true;
let accountA: object, accountB: object;
let listeners: ((state: string) => void)[] = [];
const settle = () => act(async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); });
const foreground = () => act(() => { [...listeners].forEach(l => l('background')); [...listeners].forEach(l => l('active')); });

/** One screen consuming the shared reading (Inicio or Entrenar), as the screens do. */
function screen(client: object | null, isVisible = visible) {
  return renderHook(() => useSharedHomeRead(client as never, today, isVisible));
}

beforeEach(() => {
  clock = START; day = '2026-10-10'; listeners = [];
  accountA = {}; accountB = {};
  jest.spyOn(Date, 'now').mockImplementation(() => clock);
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
    listeners.push(listener as (state: string) => void);
    return { remove: () => { listeners = listeners.filter(item => item !== listener); } } as never;
  });
  mockFetchHome.mockReset();
  let n = 0;
  mockFetchHome.mockImplementation(async () => ok(`lectura ${++n}`));
});
afterEach(() => { clearConfirmedReads(accountA as never); clearConfirmedReads(accountB as never); jest.restoreAllMocks(); });

describe('shared /home reading (#303 C2)', () => {
  it('Inicio → Entrenar → Inicio, before and after 30 s: 2 simulated requests instead of 4', async () => {
    // Before C2 each screen owned its controller: Inicio read on mount and when its own 30 s interval elapsed;
    // Entrenar read on its first mount and when its own reading was 30 s old. The same script, step by step:
    //   t=0 Inicio mounts · t=10 s Entrenar opens · t=20 s back to Inicio · t=40 s Entrenar · t=50 s Inicio.
    //   before: 1 + 1 + 0 + 1 + 1 = 4      C2: 1 + 0 + 0 + 1 + 0 = 2
    const inicio = screen(accountA);
    await settle();
    expect(mockFetchHome).toHaveBeenCalledTimes(1);
    clock += 10_000;
    const entrenar = screen(accountA); // first open: Inicio's reading is 10 s old
    await settle();
    expect(mockFetchHome).toHaveBeenCalledTimes(1);
    expect(nameOf(entrenar.result.current.state)).toBe('lectura 1');
    clock += 10_000;
    await act(async () => { await inicio.result.current.ensure('initial'); }); // Inicio inside its interval reads nothing anyway
    expect(mockFetchHome).toHaveBeenCalledTimes(1);
    clock += 20_000; // 40 s: Entrenar comes back, the reading is 40 s old
    await act(async () => { await entrenar.result.current.ensure('initial'); });
    expect(mockFetchHome).toHaveBeenCalledTimes(2);
    clock += 10_000; // 50 s: Inicio's own interval elapsed, but the shared reading is 10 s old
    await act(async () => { await inicio.result.current.ensure('initial'); });
    expect(mockFetchHome).toHaveBeenCalledTimes(2);
    expect(nameOf(inicio.result.current.state)).toBe('lectura 2');
    expect(inicio.result.current.state).toBe(entrenar.result.current.state); // one reading, not two copies
    inicio.unmount(); entrenar.unmount();
  });

  it('simultaneous asks share one request, and both screens get the same confirmed reading', async () => {
    let finish!: (value: unknown) => void;
    mockFetchHome.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const inicio = screen(accountA), entrenar = screen(accountA);
    await act(async () => { void entrenar.result.current.ensure('initial'); void inicio.result.current.ensure('foreground'); });
    expect(mockFetchHome).toHaveBeenCalledTimes(1);
    expect(inicio.result.current.state.status).toBe('loading'); // nothing shown as confirmed before it is
    await act(async () => { finish(ok('única')); });
    await settle();
    expect(nameOf(inicio.result.current.state)).toBe('única');
    expect(nameOf(entrenar.result.current.state)).toBe('única');
    inicio.unmount(); entrenar.unmount();
  });

  it('a write of its domains invalidates the shared reading for both screens; an unrelated write does not', async () => {
    const inicio = screen(accountA);
    await settle();
    clock += 1_000;
    invalidateConfirmedReads(accountA as never, '/api/mobile/v1/progress/views/order');
    invalidateConfirmedReads(accountA as never, '/api/mobile/v1/metrics/definitions/m1');
    const entrenar = screen(accountA);
    await settle();
    expect(mockFetchHome).toHaveBeenCalledTimes(1); // views and metric definitions do not move /home
    invalidateConfirmedReads(accountA as never, '/api/mobile/v1/nutrition/days/2026-10-10/meals');
    await act(async () => { await entrenar.result.current.ensure('initial'); }); // 1 s old, but invalidated
    expect(mockFetchHome).toHaveBeenCalledTimes(2);
    await act(async () => { await inicio.result.current.ensure('initial'); }); // caught up by Entrenar's read
    expect(mockFetchHome).toHaveBeenCalledTimes(2);
    expect(nameOf(inicio.result.current.state)).toBe('lectura 2');
    inicio.unmount(); entrenar.unmount();
  });

  it('on screen, a write revalidates at once and the screen\'s reload joins that read instead of a second one', async () => {
    const inicio = screen(accountA);
    await settle();
    let blur!: () => void;
    act(() => { blur = inicio.result.current.focus(); });
    invalidateConfirmedReads(accountA as never, '/api/mobile/v1/body/weights/2026-10-10');
    expect(mockFetchHome).toHaveBeenCalledTimes(2); // the cache revalidates the focused reading
    await act(async () => { await inicio.result.current.reload(); });
    expect(mockFetchHome).toHaveBeenCalledTimes(2); // started after the write: joined, not repeated
    act(() => blur());
    inicio.unmount();
  });

  it('a read that started before a write never confirms after it, even when its response arrives last', async () => {
    let finishOld!: (value: unknown) => void;
    mockFetchHome.mockImplementationOnce(() => new Promise(resolve => { finishOld = resolve; }));
    const inicio = screen(accountA), entrenar = screen(accountA);
    await settle();
    const oldSignal = mockFetchHome.mock.calls[0][1];
    invalidateConfirmedReads(accountA as never, '/api/mobile/v1/training/sessions/s/finish');
    await act(async () => { await entrenar.result.current.reload(); });
    await act(async () => { finishOld(ok('antes de la escritura')); });
    await settle();
    expect(oldSignal.aborted).toBe(true);
    expect(mockFetchHome).toHaveBeenCalledTimes(2);
    expect(nameOf(inicio.result.current.state)).toBe('lectura 1'); // the post-write read (the old one never counted)
    expect(nameOf(entrenar.result.current.state)).toBe('lectura 1');
    inicio.unmount(); entrenar.unmount();
  });

  it('a new Córdoba day never reuses yesterday\'s reading: one read, on the new day\'s reading', async () => {
    const inicio = screen(accountA);
    await settle();
    day = '2026-10-11'; clock += 5_000; // midnight passed, the reading is only 5 s old
    await act(async () => { await inicio.result.current.ensure('initial'); });
    await settle();
    expect(mockFetchHome).toHaveBeenCalledTimes(2);
    expect(nameOf(inicio.result.current.state)).toBe('lectura 2');
    const entrenar = screen(accountA); // the other screen on the new day: the same new reading
    await settle();
    expect(mockFetchHome).toHaveBeenCalledTimes(2);
    expect(nameOf(entrenar.result.current.state)).toBe('lectura 2');
    inicio.unmount(); entrenar.unmount();
  });

  it('accounts never share a reading, and clearing an account drops its reading', async () => {
    const a = screen(accountA);
    await settle();
    const b = screen(accountB);
    await settle();
    expect(mockFetchHome).toHaveBeenCalledTimes(2);
    expect(mockFetchHome.mock.calls.map(call => call[0])).toEqual([accountA, accountB]);
    expect(nameOf(b.result.current.state)).toBe('lectura 2');
    a.unmount(); b.unmount();
    clearConfirmedReads(accountA as never);
    const again = screen(accountA);
    await settle();
    expect(mockFetchHome).toHaveBeenCalledTimes(3);
    again.unmount();
  });

  it.each([
    ['401', { status: 'unauthorized', meta: { durationMs: 1, httpStatus: 401, outcome: 'unauthorized' } }],
    ['403', { status: 'unavailable', reason: 'server', meta: { durationMs: 1, httpStatus: 403, outcome: 'unavailable' } }],
  ])('%s discards the shared confirmed reading: no screen shows it, and the other screen reads again', async (_code, denied) => {
    const inicio = screen(accountA);
    await settle();
    mockFetchHome.mockImplementationOnce(async () => denied);
    clock += 1_000;
    await act(async () => { await inicio.result.current.ensure('manual'); });
    const state = inicio.result.current.state as { status: string; previous?: unknown };
    expect(state.status).not.toBe('ready');
    expect(state.previous).toBeUndefined(); // the protected reading is not kept as a fallback
    const entrenar = screen(accountA);
    await settle();
    expect(mockFetchHome).toHaveBeenCalledTimes(3); // not reused: it was discarded
    expect(nameOf(entrenar.result.current.state)).toBe('lectura 2');
    inicio.unmount(); entrenar.unmount();
  });

  it('offline keeps the last reading as previous (never as fresh), the other screen does not reuse it, and a manual refresh recovers', async () => {
    const inicio = screen(accountA);
    await settle();
    mockFetchHome.mockImplementationOnce(async () => ({ status: 'unavailable', reason: 'network', meta: { durationMs: 1, httpStatus: null, outcome: 'unavailable' } }));
    clock += 1_000;
    await act(async () => { await inicio.result.current.ensure('manual'); });
    expect(inicio.result.current.state).toMatchObject({ status: 'unavailable', reason: 'network', previous: { data: { profile: { data: { displayName: 'lectura 1' } } } } });
    const entrenar = screen(accountA);
    await settle();
    expect(mockFetchHome).toHaveBeenCalledTimes(3); // an unavailable reading is never reused as confirmed
    expect(nameOf(entrenar.result.current.state)).toBe('lectura 2');
    expect(nameOf(inicio.result.current.state)).toBe('lectura 2'); // recovered for both
    inicio.unmount(); entrenar.unmount();
  });

  it('a manual refresh always reads, even a fresh reading; foreground reads only for the screen on screen', async () => {
    let inicioVisible = true;
    const inicio = screen(accountA, () => inicioVisible);
    await settle();
    clock += 1_000;
    await act(async () => { await inicio.result.current.refresh(); });
    expect(mockFetchHome).toHaveBeenCalledTimes(2);
    inicioVisible = false;
    foreground(); await settle();
    expect(mockFetchHome).toHaveBeenCalledTimes(2); // hidden tab: nothing read for nobody
    inicioVisible = true;
    foreground(); await settle();
    expect(mockFetchHome).toHaveBeenCalledTimes(3);
    inicio.unmount();
  });

  it('a cancelled read (screen gone before it answered) is not left as a confirmed reading', async () => {
    mockFetchHome.mockImplementationOnce((_client, signal) => new Promise(resolve => {
      signal.addEventListener('abort', () => resolve({ status: 'unavailable', reason: 'aborted', meta: { durationMs: 1, httpStatus: null, outcome: 'unavailable' } }));
    }));
    const inicio = screen(accountA);
    await settle();
    inicio.unmount();
    await settle(); // nobody waits for the first load anymore: cancelled
    expect((mockFetchHome.mock.calls[0][1]).aborted).toBe(true);
    const entrenar = screen(accountA);
    await settle();
    expect(mockFetchHome).toHaveBeenCalledTimes(2);
    expect(nameOf(entrenar.result.current.state)).toBe('lectura 1');
    entrenar.unmount();
  });

  it('without a client it answers unavailable, shares nothing and sends nothing', async () => {
    const none = screen(null);
    await settle();
    expect(none.result.current.state.status).toBe('unavailable');
    expect(mockFetchHome).not.toHaveBeenCalled();
    expect(none.result.current.resource).toBeInstanceOf(ApiResourceController);
    none.unmount();
  });
});
