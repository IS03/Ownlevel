/** Cold-start timings used for local startup measurement (#536, #658). */
export const FIRST_DATA_HOLD_MS = 2500;

type Mark = 'start' | 'restored' | 'firstData' | 'splashHidden' | 'homeRevealed';
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

let ready = false;
let marks: Partial<Record<Mark, number>> = { start: now() };
const listeners = new Set<() => void>();
type HomeNativeEvent = 'page-control-layout' | 'page-control-change' | 'week-calendar-layout' | 'add-menu-layout';
const nativeEvents = new Set<HomeNativeEvent>();

/** Correlates the first native Home events with startup on a device. No account or control data. */
export function traceStartupNative(event: HomeNativeEvent) {
  if (!__DEV__ || process.env.NODE_ENV === 'test' || nativeEvents.has(event)) return;
  nativeEvents.add(event);
  console.info('[startup native]', { event, atMs: Math.round(now() - marks.start!) });
}

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
}
export function markHomeRevealed() {
  if (marks.homeRevealed !== undefined) return;
  mark('homeRevealed');
  if (__DEV__ && process.env.NODE_ENV !== 'test') console.info('[startup]', startupTimings());
}

/**
 * Milliseconds since JS start, including the native splash handoff and the reveal of Inicio.
 * Local instrumentation for a before/after measurement (#536, #658).
 */
export function startupTimings() {
  const at = (name: Mark) => marks[name] === undefined ? null : Math.round(marks[name]! - marks.start!);
  return { restoredMs: at('restored'), firstDataMs: at('firstData'), splashHiddenMs: at('splashHidden'), homeRevealedMs: at('homeRevealed') };
}

/** Tests only. */
export function resetFirstData() {
  ready = false; marks = { start: now() }; listeners.clear();
}
