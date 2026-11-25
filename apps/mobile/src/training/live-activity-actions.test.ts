import { describe, expect, it, jest } from '@jest/globals';
import { applyLiveActivityAction, listenLiveActivityActions } from './live-activity-actions';
import { liveActivityAction, liveActivityState, REST_ADD, REST_SKIP } from './live-activity-model';
import type { SessionPresence } from './session-presence-store';

const controller = () => ({ adjustRest: jest.fn(), skipRest: jest.fn(), completeShownSet: jest.fn(() => true) });
const session = { id: 'session-1', name: 'LEGS', logDate: '2026-11-25' };
const next = { exerciseId: 'ex-1', setId: 'set-a-1', exerciseName: 'SENTADILLA', set: 'Serie 2 de 3', load: '100 kg × 8' };
const presence = (patch: Partial<SessionPresence> = {}): SessionPresence =>
  ({ session, timer: null, unavailable: false, recovery: false, progress: { completedSets: 1, totalSets: 3, next }, ...patch });

describe('Live Activity buttons (#645)', () => {
  it('reads only its own targets', () => {
    expect(liveActivityAction(REST_ADD)).toEqual({ kind: 'add' });
    expect(liveActivityAction(REST_SKIP)).toEqual({ kind: 'skip' });
    expect(liveActivityAction('set:ex-1:set-a-1')).toEqual({ kind: 'complete', exerciseId: 'ex-1', setId: 'set-a-1' });
    for (const other of ['', 'set:ex-1', 'set::x', 'rest:add30', 0, null, undefined]) expect(liveActivityAction(other)).toBeNull();
  });
  it('shows buttons only while the session screen can act, and «Completar serie» only for a row with a load', () => {
    const timer = { exerciseId: 'ex-1', exerciseName: 'SENTADILLA', endAt: 91_000, startedAt: 1000 };
    expect(liveActivityState(presence({ controls: true, timer }), null, 1000).state?.props.controls).toEqual({ rest: true, complete: 'set:ex-1:set-a-1' });
    expect(liveActivityState(presence({ controls: false, timer }), null, 1000).state?.props.controls).toBeNull();
    expect(liveActivityState(presence({ controls: true, progress: { completedSets: 1, totalSets: 3, next: { ...next, load: null } } }), null, 1000).state?.props.controls)
      .toEqual({ rest: false, complete: null });
    // A row known only from a confirmed read has no id: it can't be completed from the Lock Screen.
    expect(liveActivityState(presence({ controls: true, progress: { completedSets: 1, totalSets: 3, next: { ...next, setId: null } } }), null, 1000).state?.props.controls?.complete).toBeNull();
    // The ids never reach the activity's visible text.
    expect(liveActivityState(presence({ controls: true }), null, 1000).state?.props.next).toEqual({ exerciseName: 'SENTADILLA', set: 'Serie 2 de 3', load: '100 kg × 8' });
  });
  it('applies each action through the session controller, the same operations as its own controls', () => {
    const c = controller();
    applyLiveActivityAction(c, { kind: 'add' }); applyLiveActivityAction(c, { kind: 'skip' });
    applyLiveActivityAction(c, { kind: 'complete', exerciseId: 'ex-1', setId: 'set-a-1' });
    expect(c.adjustRest).toHaveBeenCalledWith(15); expect(c.skipRest).toHaveBeenCalledTimes(1); expect(c.completeShownSet).toHaveBeenCalledWith('ex-1', 'set-a-1');
  });
  it('acts once per tap, only on the mounted session, and stops listening', () => {
    const c = controller(); let send!: (event: { source?: string; target?: string; timestamp?: number }) => void;
    const remove = jest.fn();
    const store = { getSnapshot: () => presence(), controllerFor: (id: string) => id === 'session-1' ? c as never : null };
    const stop = listenLiveActivityActions(store, listener => { send = listener; return { remove }; });
    send({ source: 'a', target: REST_ADD, timestamp: 1 }); send({ source: 'a', target: REST_ADD, timestamp: 1 }); send({ source: 'a', target: REST_ADD, timestamp: 2 });
    expect(c.adjustRest).toHaveBeenCalledTimes(2);
    send({ source: 'a', target: 'unknown', timestamp: 3 }); expect(c.skipRest).not.toHaveBeenCalled();
    const lone = listenLiveActivityActions({ getSnapshot: () => presence(), controllerFor: () => null }, listener => { listener({ target: REST_SKIP, timestamp: 4 }); return { remove: jest.fn() }; });
    expect(c.skipRest).not.toHaveBeenCalled(); lone();
    stop(); expect(remove).toHaveBeenCalledTimes(1);
  });
  it('without the native module nothing listens and nothing breaks', () => {
    expect(listenLiveActivityActions({ getSnapshot: () => presence(), controllerFor: () => null }, null)()).toBeUndefined();
    expect(listenLiveActivityActions({ getSnapshot: () => presence(), controllerFor: () => null }, () => { throw new Error('no module'); })()).toBeUndefined();
  });
});
