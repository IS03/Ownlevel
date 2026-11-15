/**
 * #516 / #525 · «Ir a letra» that lands on the first tap.
 *
 * Measured on the iOS simulator (also on main before #516): with 200 meals, «Ñ» landed in «M/N». A virtualized list places an
 * unmeasured row at `averageLength × index`; every retry of `scrollToLocation` landed on that same estimate, the offset
 * stopped moving, and the old loop took «not moving» for «arrived». Here the destination itself is the check: a pass is done
 * only when the chosen section is the first one on screen (or visible at the end of the list). Until then each pass corrects
 * the distance from what IS on screen (rows measured now), and once the section is rendered `scrollToLocation` is exact.
 * Bounded (MAX_PASSES), and it gives way to the person: a drag, a search or another letter cancels it.
 */
export type LetterJumpList = {
  /** `scrollToLocation(sectionIndex, itemIndex 0, viewPosition 0)`, not animated. */
  toSection: (sectionIndex: number) => void;
  /** Scroll to an absolute offset, not animated. */
  toOffset: (y: number) => void;
  /** The flat indexes (headers and rows, as the list counts them) on screen now, and where the list is. */
  view: () => { first: number | null; last: number | null; offset: number; viewport: number; atEnd: boolean };
  schedule: (run: () => void, ms: number) => unknown;
  cancel: (handle: unknown) => void;
};
export const JUMP_MAX_PASSES = 10, JUMP_PASS_MS = 120;
/** Flat index of each section's header: every section counts its header, its rows and its footer. */
export function sectionStarts(lengths: readonly number[]) {
  const starts: number[] = [];
  let at = 0;
  for (const length of lengths) { starts.push(at); at += length + 2; }
  return starts;
}

export class LetterJump {
  private job: { section: number; start: number; end: number; passes: number; timer: unknown } | null = null;
  constructor(private list: LetterJumpList) {}
  get active() { return this.job !== null; }
  /** Jump to `section` (index in the list), whose header is the flat index `start` and whose rows end before `end`. */
  start(section: number, start: number, end: number) {
    this.stop();
    this.job = { section, start, end, passes: 0, timer: null };
    this.toSection();
  }
  stop() {
    if (this.job?.timer) this.list.cancel(this.job.timer);
    this.job = null;
  }
  /** `scrollToLocation`: exact when the section is rendered (measured), an estimate otherwise. */
  private toSection() {
    const job = this.job;
    if (!job) return;
    job.passes += 1;
    this.list.toSection(job.section);
    job.timer = this.list.schedule(() => this.check(), JUMP_PASS_MS);
  }
  private check() {
    const job = this.job;
    if (!job) return;
    const { first, last, offset, viewport, atEnd } = this.list.view();
    // The letter's own heading is the first thing on screen (not a row of it with the heading just above the edge).
    const onTop = first === job.start;
    const shown = first !== null && last !== null && last >= job.start && first < job.end;
    // Arrived: the section's heading starts the screen, or the section is on screen and the list cannot scroll further.
    if (onTop || (shown && atEnd)) { this.job = null; return; }
    if (job.passes >= JUMP_MAX_PASSES) { this.job = null; return; }
    // On screen now (so measured): one exact placement. Nothing known yet: ask the list again.
    if (shown || first === null || last === null) { this.toSection(); return; }
    // Not on screen: never ask the same estimate again. Move by the distance in rows, at the height the rows on screen
    // actually have; the rows found there get measured, and the next check places the section exactly.
    const rowLength = viewport / Math.max(1, last - first + 1);
    job.passes += 1;
    this.list.toOffset(Math.max(0, offset + (job.start - first) * rowLength));
    job.timer = this.list.schedule(() => this.check(), JUMP_PASS_MS);
  }
}
