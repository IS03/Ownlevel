import { describe, expect, it, jest } from '@jest/globals';
import { ActiveSessionController, type ActiveSessionApi } from './active-session-controller';
import { SessionDraftRepository, type SessionStoragePort } from './active-session-storage';
import { SessionPresenceStore, type SessionPresenceApi } from './session-presence-store';
import { EXERCISE_ID, SESSION_ID, testDetail } from './active-session-test-fixtures';

const meta = { durationMs: 0, httpStatus: 200, outcome: 'ok' as const };
const ok = <T,>(data: T) => ({ status: 'ok' as const, data, meta });
const active = (id: string | null = SESSION_ID) => ok({ activeSession: { status: 'ok' as const, data: id ? { id, name: 'Sesión libre', logDate: '2026-09-30' } : null }, calendar: { status: 'ok' as const, data: { month: '2026-09', days: [] } } });
function setup() {
  const values = new Map<string, string>();
  const storage: SessionStoragePort = { getItem: async key => values.get(key) ?? null, setItem: async (key, value) => { values.set(key, value); },
    removeItem: async key => { values.delete(key); }, getAllKeys: async () => [...values.keys()] };
  const api: SessionPresenceApi = { active: jest.fn<SessionPresenceApi['active']>().mockResolvedValue(active()), detail: jest.fn<SessionPresenceApi['detail']>().mockResolvedValue(ok(testDetail())) };
  const store = new SessionPresenceStore(api, storage, 'owner');
  const unused = async () => { throw new Error('Unexpected session write in a presence test'); };
  const controllerApi: ActiveSessionApi = { detail: async () => ok(testDetail()), cancel: async () => ok({ status: 'cancelled', sessionId: SESSION_ID }),
    sync: unused, save: unused, add: unused, remove: unused, reorder: unused, finish: unused };
  const controller = new ActiveSessionController(controllerApi, new SessionDraftRepository(storage, 'owner', SESSION_ID));
  return { store, api, storage, controller };
}

describe('session presence outside the workout', () => {
  it('retains the same deadline when the session screen detaches, without keeping a write controller alive', async () => {
    const { store, controller, storage } = setup();
    const detach = store.attach(SESSION_ID, controller); await controller.refresh(); controller.startRest(EXERCISE_ID);
    const deadline = controller.getTimer(); expect(deadline).not.toBeNull();
    detach(); controller.dispose();
    expect(store.getSnapshot().timer).toBe(deadline);
    await store.refresh(); expect(store.getSnapshot().timer).toEqual(deadline);
    const next = new ActiveSessionController({ detail: async () => ok(testDetail()) } as ActiveSessionApi, new SessionDraftRepository(storage, 'owner', SESSION_ID));
    const detachNext = store.attach(SESSION_ID, next); await next.refresh();
    expect(next.getTimer()).toEqual(deadline);
    next.skipRest(); expect(store.getSnapshot().timer).toBeNull();
    detachNext(); next.dispose(); store.dispose();
  });
  it('keeps last confirmed presence on unavailable reads and clears only a confirmed empty/closed result', async () => {
    const { store, api } = setup(); await store.refresh();
    jest.mocked(api.active).mockResolvedValueOnce({ status: 'unavailable', reason: 'network', meta: { durationMs: 0, httpStatus: null, outcome: 'unavailable' } });
    await store.refresh(); expect(store.getSnapshot()).toMatchObject({ session: { id: SESSION_ID }, unavailable: true });
    jest.mocked(api.active).mockResolvedValueOnce(active(null)); await store.refresh(); expect(store.getSnapshot().session).toBeNull();
    const closed = testDetail(); closed.session.status = 'completed';
    jest.mocked(api.detail).mockResolvedValueOnce(ok(closed)); await store.refresh(); expect(store.getSnapshot().session).toBeNull(); store.dispose();
  });
  it('rejects stale discovery reads after a controller has published a newer timer', async () => {
    const { store, api, controller } = setup();
    let resolve!: (value: Awaited<ReturnType<SessionPresenceApi['active']>>) => void;
    jest.mocked(api.active).mockReturnValueOnce(new Promise(done => { resolve = done; }));
    const pending = store.refresh(); const detach = store.attach(SESSION_ID, controller);
    await controller.refresh(); controller.startRest(EXERCISE_ID);
    const deadline = controller.getTimer(); resolve(active(null)); await pending;
    expect(store.getSnapshot()).toMatchObject({ session: { id: SESSION_ID }, timer: deadline });
    detach(); controller.dispose(); store.dispose();
  });
  it('does not restore another account’s timer and ignores responses after disposal', async () => {
    const { store, api, controller, storage } = setup();
    await controller.refresh(); controller.startRest(EXERCISE_ID); controller.dispose();
    const other = new SessionPresenceStore(api, storage, 'other-owner'); await other.refresh(); expect(other.getSnapshot().timer).toBeNull(); other.dispose();
    const pending = store.refresh(); store.dispose(); await pending; expect(store.getSnapshot().session).toBeNull();
  });
  it('removes a completed session when its attached controller confirms closure', async () => {
    const { store, controller, storage } = setup(); const detach = store.attach(SESSION_ID, controller); await controller.refresh(); detach(); controller.dispose();
    const closed = testDetail(); closed.session.status = 'completed';
    const completed = new ActiveSessionController({ detail: async () => ok(closed) } as ActiveSessionApi, new SessionDraftRepository(storage, 'owner', SESSION_ID));
    const detachCompleted = store.attach(SESSION_ID, completed); await completed.refresh(); expect(store.getSnapshot().session).toBeNull();
    detachCompleted(); completed.dispose(); store.dispose();
  });
  it('clears both controls after cancellation is confirmed', async () => {
    const { store, controller } = setup(); const detach = store.attach(SESSION_ID, controller);
    await controller.refresh(); controller.startRest(EXERCISE_ID); expect(store.getSnapshot().timer).not.toBeNull();
    await controller.cancel(); expect(store.getSnapshot()).toMatchObject({ session: null, timer: null, recovery: false });
    detach(); controller.dispose(); store.dispose();
  });
  it('keeps the recovery route for an unresolved intent even if discovery reports no active session', async () => {
    const { store, api, controller, storage } = setup();
    await new SessionDraftRepository(storage, 'owner', SESSION_ID).writeIntent({ kind: 'cancel', idempotencyKey: 'cancel-key' });
    const detach = store.attach(SESSION_ID, controller); await controller.refresh();
    expect(store.getSnapshot().recovery).toBe(true); detach(); controller.dispose();
    jest.mocked(api.active).mockResolvedValueOnce(active(null)); await store.refresh(); expect(store.getSnapshot().session?.id).toBe(SESSION_ID);
    store.dispose();
  });
});
