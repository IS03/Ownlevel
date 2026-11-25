import { palette } from '@/design-system/brand';
import type { SessionPresence } from './session-presence-store';

/** Brand colors handed to the Live Activity layout: it runs as text inside the extension and cannot import them. */
export type LiveActivityColors = { accentDark: string; accentLight: string; mutedDark: string; mutedLight: string };
/** What the lock screen and the Dynamic Island show. Times are epoch ms: props travel as JSON. */
export type LiveActivityProps = {
  sessionName: string;
  rest: { exerciseName: string; startedAt: number; endAt: number } | null;
  colors: LiveActivityColors;
};
export type LiveActivityState = { sessionId: string; props: LiveActivityProps };
/** When the current rest began, so the bar keeps its length when the rest is lengthened or shortened. */
export type RestAnchor = { key: string; startedAt: number } | null;

const colors: LiveActivityColors = {
  accentDark: palette.dark.accent, accentLight: palette.light.accent,
  mutedDark: palette.dark.textMuted, mutedLight: palette.light.textMuted,
};

function restKey(timer: NonNullable<SessionPresence['timer']>) {
  return `${timer.exerciseId}:${timer.sourceSet?.localId ?? ''}`;
}

/**
 * Only a session the app itself shows as in progress gets an activity. No numbers beyond the rest the session already
 * runs: an expired rest keeps its end so the layout reports it as finished, never as a fresh countdown.
 */
export function liveActivityState(presence: SessionPresence, anchor: RestAnchor, now: number): { state: LiveActivityState | null; anchor: RestAnchor } {
  const { session, timer } = presence;
  if (!session) return { state: null, anchor: null };
  let rest: LiveActivityProps['rest'] = null;
  let nextAnchor: RestAnchor = null;
  if (timer) {
    const key = restKey(timer);
    const startedAt = Math.min(anchor?.key === key ? anchor.startedAt : now, timer.endAt);
    nextAnchor = { key, startedAt };
    rest = { exerciseName: timer.exerciseName, startedAt, endAt: timer.endAt };
  }
  return { state: { sessionId: session.id, props: { sessionName: session.name, rest, colors } }, anchor: nextAnchor };
}
