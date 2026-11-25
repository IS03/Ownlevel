import { Platform } from 'react-native';
import * as Linking from 'expo-linking';
import type { LiveActivityProps } from './live-activity-model';

export type LiveActivityHandle<P = LiveActivityProps> = {
  getId(): string;
  update(props: P, staleDate?: Date): Promise<void>;
  end(dismissalPolicy?: 'immediate'): Promise<void>;
};
export type LiveActivityApi<P = LiveActivityProps> = {
  start(props: P, url?: string, staleDate?: Date): LiveActivityHandle<P>;
  getInstances(): LiveActivityHandle<P>[];
};
/** `sessionId`: what the activity belongs to (a session, an unfinished meal); a different one replaces it. */
type SyncState<P> = { sessionId: string; props: P };
type Options<P> = { url?: (sessionId: string) => string; stale?: (props: P) => Date | undefined };

function staleDate(props: LiveActivityProps) {
  // The system marks the activity stale when the rest ends, even with the app suspended.
  return props.rest ? new Date(props.rest.endAt) : undefined;
}

/**
 * One activity, for the one session in progress. Calls are queued and only the latest wanted state is applied; an
 * activity this app no longer owns (a crash, another account, a session closed elsewhere) is ended on the next sync.
 */
export function createLiveActivitySync<P extends object = LiveActivityProps>(resolve: () => LiveActivityApi<P> | null,
  { url = sessionUrl, stale = staleDate as unknown as (props: P) => Date | undefined }: Options<P> = {}) {
  let wantedKey: string | null = null;
  let revision = 0;
  let queue: Promise<void> = Promise.resolve();
  let current: { handle: LiveActivityHandle<P>; sessionId: string; key: string } | null = null;

  return function syncLiveActivity(next: SyncState<P> | null, force = false) {
    const key = next ? JSON.stringify(next) : '';
    if (key === wantedKey && !force) return queue;
    wantedKey = key;
    const mine = ++revision;
    queue = queue.then(async () => {
      if (mine !== revision) return;
      const api = resolve();
      if (!api) return;
      let instances: LiveActivityHandle<P>[] = [];
      try { instances = api.getInstances(); } catch { return; } // ActivityKit unavailable (iOS < 16.2).
      const keep = next && current?.sessionId === next.sessionId ? current : null;
      for (const instance of instances) {
        if (keep && instance.getId() === keep.handle.getId()) continue;
        await instance.end('immediate').catch(() => undefined);
      }
      if (!next) { current = null; return; }
      if (keep && instances.some(instance => instance.getId() === keep.handle.getId())) {
        if (keep.key !== key) {
          await keep.handle.update(next.props, stale(next.props)).catch(() => undefined);
          keep.key = key;
        }
        return;
      }
      current = null;
      if (mine !== revision) return;
      try {
        current = { handle: api.start(next.props, url(next.sessionId), stale(next.props)), sessionId: next.sessionId, key };
      } catch {
        // iOS starts activities only in the foreground, and the user may have turned them off. Try again next time.
        if (mine === revision) wantedKey = null;
      }
    }).catch(() => {
      // The workout never depends on the activity.
    });
    return queue;
  };
}

function sessionUrl(sessionId: string) {
  return Linking.createURL(`/train/session/${encodeURIComponent(sessionId)}`);
}

let api: LiveActivityApi | null | undefined;
function nativeLiveActivities(): LiveActivityApi | null {
  if (api !== undefined) return api;
  if (Platform.OS !== 'ios') return (api = null);
  try {
    // Resolve the native module only when used, so a build without the widget extension still opens the workout.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    api = (require('./live-activity') as typeof import('./live-activity')).workoutActivities();
  } catch {
    api = null;
  }
  return api;
}

export const syncLiveActivity = createLiveActivitySync(nativeLiveActivities);
