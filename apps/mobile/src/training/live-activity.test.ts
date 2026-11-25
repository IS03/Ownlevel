import { describe, expect, it, jest } from '@jest/globals';
import { palette } from '@/design-system/brand';
import { liveActivityState } from './live-activity-model';
import { createLiveActivitySync, type LiveActivityApi, type LiveActivityHandle } from './live-activity-sync';
import type { SessionPresence } from './session-presence-store';

const session = { id: 'session-1', name: 'Torso A', logDate: '2026-11-25' };
const presence = (timer: SessionPresence['timer'] = null, current = session): SessionPresence =>
  ({ session: current, timer, unavailable: false, recovery: false });
const rest = (endAt: number, localId = 'set-a') => ({ exerciseId: 'ex-1', exerciseName: 'Press banca', endAt, sourceSet: { localId, position: 0 } });

describe('liveActivityState', () => {
  it('has no activity without a session in progress', () => {
    expect(liveActivityState({ session: null, timer: null, unavailable: false, recovery: false }, null, 1000)).toEqual({ state: null, anchor: null });
  });

  it('shows the session alone when there is no rest, with the brand colors', () => {
    const { state } = liveActivityState(presence(), null, 1000);
    expect(state).toEqual({ sessionId: 'session-1', props: { sessionName: 'Torso A', rest: null,
      colors: { accentDark: palette.dark.accent, accentLight: palette.light.accent, mutedDark: palette.dark.textMuted, mutedLight: palette.light.textMuted } } });
  });

  it('keeps when a rest started when it is lengthened, and restarts it for the next set', () => {
    const first = liveActivityState(presence(rest(91_000)), null, 1000);
    expect(first.state?.props.rest).toEqual({ exerciseName: 'Press banca', startedAt: 1000, endAt: 91_000 });
    const longer = liveActivityState(presence(rest(106_000)), first.anchor, 20_000);
    expect(longer.state?.props.rest).toEqual({ exerciseName: 'Press banca', startedAt: 1000, endAt: 106_000 });
    const next = liveActivityState(presence(rest(300_000, 'set-b')), longer.anchor, 210_000);
    expect(next.state?.props.rest?.startedAt).toBe(210_000);
  });

  it('keeps an expired rest as finished instead of inventing a new countdown', () => {
    const { state } = liveActivityState(presence(rest(5000)), null, 9000);
    expect(state?.props.rest).toEqual({ exerciseName: 'Press banca', startedAt: 5000, endAt: 5000 });
  });
});

function fakeApi() {
  const live: (LiveActivityHandle & { props: unknown; stale?: Date; url?: string })[] = [];
  let ids = 0;
  const handle = (props: unknown, url?: string, stale?: Date) => {
    const id = `activity-${++ids}`;
    const item = {
      props, url, stale, getId: () => id,
      update: jest.fn(async (next: unknown, nextStale?: Date) => { item.props = next; item.stale = nextStale; }),
      end: jest.fn(async () => { live.splice(live.indexOf(item), 1); }),
    };
    live.push(item);
    return item;
  };
  const api = { start: jest.fn(handle), getInstances: jest.fn(() => [...live]) } as unknown as LiveActivityApi & { start: jest.Mock };
  return { api, live, orphan: () => handle({ sessionName: 'Otra' }) };
}

describe('syncLiveActivity', () => {
  const url = (id: string) => `ownlevel-dev://train/session/${id}`;

  it('starts once, updates on a new rest and ends when the session closes', async () => {
    const { api, live } = fakeApi();
    const sync = createLiveActivitySync(() => api, { url });
    const idle = liveActivityState(presence(), null, 1000).state;
    await sync(idle);
    await sync(idle);
    expect(api.start).toHaveBeenCalledTimes(1);
    expect(live[0]).toMatchObject({ url: 'ownlevel-dev://train/session/session-1', stale: undefined });

    const resting = liveActivityState(presence(rest(91_000)), null, 1000).state;
    await sync(resting);
    expect(api.start).toHaveBeenCalledTimes(1);
    expect(live[0].update).toHaveBeenCalledWith(resting?.props, new Date(91_000));

    await sync(null);
    expect(live).toHaveLength(0);
  });

  it('ends activities it does not own and replaces the one of another session', async () => {
    const { api, live, orphan } = fakeApi();
    orphan();
    const sync = createLiveActivitySync(() => api, { url });
    await sync(liveActivityState(presence(), null, 1000).state);
    expect(live.map(item => item.url)).toEqual(['ownlevel-dev://train/session/session-1']);

    await sync(liveActivityState(presence(null, { ...session, id: 'session-2' }), null, 1000).state);
    expect(live.map(item => item.url)).toEqual(['ownlevel-dev://train/session/session-2']);
  });

  it('retries a start the system refused once forced again', async () => {
    const { api, live } = fakeApi();
    const sync = createLiveActivitySync(() => api, { url });
    api.start.mockImplementationOnce(() => { throw new Error('background'); });
    const idle = liveActivityState(presence(), null, 1000).state;
    await sync(idle);
    expect(live).toHaveLength(0);
    await sync(idle, true);
    expect(live).toHaveLength(1);
  });

  it('does nothing without the native module', async () => {
    const sync = createLiveActivitySync(() => null, { url });
    await expect(sync(liveActivityState(presence(), null, 1000).state)).resolves.toBeUndefined();
  });
});
