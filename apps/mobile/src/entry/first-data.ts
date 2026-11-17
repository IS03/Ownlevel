/**
 * The first useful Inicio data after a cold start (#536). With a restored session the native splash waits for it a brief,
 * bounded moment (`FIRST_DATA_HOLD_MS`) while Inicio's priority reads run behind it, so the app opens on data instead of
 * skeletons. Slow network, offline or any other route: the splash goes at the limit and each block shows its own state.
 * Presentation only: no read waits for this, and nothing here is retried or cached.
 */
export const FIRST_DATA_HOLD_MS = 900;

type Mark = 'start' | 'restored' | 'firstData' | 'splashHidden';
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

let ready = false;
let marks: Partial<Record<Mark, number>> = { start: now() };
const listeners = new Set<() => void>();

function mark(name: Mark) {
  if (marks[name] === undefined) marks[name] = now();
}

/** Inicio's priority reads settled (ready or unavailable) for the first time in this process. */
export function markFirstData() {
  if (ready) return;
  ready = true;
  mark('firstData');
  for (const listener of [...listeners]) listener();
  listeners.clear();
}

/** Calls `listener` once, when the first data arrives (now if it already did). Returns the unsubscribe. */
export function onFirstData(listener: () => void): () => void {
  if (ready) { listener(); return () => {}; }
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function markRestored() { mark('restored'); }
export function markSplashHidden() {
  if (marks.splashHidden !== undefined) return;
  mark('splashHidden');
  if (__DEV__ && process.env.NODE_ENV !== 'test') console.info('[startup]', startupTimings());
}

/**
 * Milliseconds since the JS start: session restored, first Inicio data, splash hidden (the interface responds). Measured
 * locally to compare before/after (#536); never sent anywhere.
 */
export function startupTimings() {
  const at = (name: Mark) => marks[name] === undefined ? null : Math.round(marks[name]! - marks.start!);
  return { restoredMs: at('restored'), firstDataMs: at('firstData'), splashHiddenMs: at('splashHidden') };
}

/** Tests only. */
export function resetFirstData() {
  ready = false; marks = { start: now() }; listeners.clear();
}
