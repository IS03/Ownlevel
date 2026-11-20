import { eligibleForSession } from "./performance-change";
import type { PerformanceChange } from "../performance-insights/types";
import type { InsightsSnapshot } from "./read-model";

/**
 * Orden de la rutina: from which exercise of one routine performance drops, described. Each session counts in the order it was
 * actually done (`exercise_order` as it stayed, including what was moved during the session). Two lenses:
 * - progress: how often each exercise went up against its previous time (more reps at an equal load, #533, or more load), by
 *   position. A share of times, not a median of %: most comparisons are «equal», and a median would read 0 everywhere;
 * - target: the share of completed sets that reached their target reps, by position.
 * A cut is named only when it is large, has enough data and shows up in both halves of the window. Descriptive: it says where the
 * drop coincides, never that the order causes it. Rules in docs/progress/orden-rutina.md.
 */
export const ROUTINE_ORDER_METHOD = "insights-routine-order/2" as const;
export const ROUTINE_ORDER_DAYS = 90;
export const ROUTINE_ORDER_RULES = {
  /** Measured changes a position needs, from at least `minSessions` sessions. */
  minChanges: 5, minSessions: 3,
  /** Completed sets with a target a position needs, from at least `minSessions` sessions. */
  minTargetSets: 9,
  /** Baseline progress (share of times up at positions 1–2) below this leaves nothing to drop from. */
  minBaselineRate: 0.1,
  /** First cut: at least this loss (relative for progress, in points for target), and never back above it. */
  firstLoss: 0.1,
  /** Second cut: everything after it at least this much worse than everything between both cuts. */
  secondGap: 0.15,
} as const;

/** One block of a session of the routine, as recorded: its order and its sets with their target. */
export type OrderBlock = {
  sessionId: string; exerciseId: string; name: string; order: number;
  sets: { targetReps: number | null; actualReps: number | null; actualLoad: number | null; isCompleted: boolean }[];
};
type Lens = "progress" | "target";
export type OrderCut = {
  /** First position of the segment. */
  position: number;
  /** Progress: relative loss against the baseline (0.1 = −10 %). Target: points below the baseline rate (0.25 = −25 points). */
  loss: number;
};
export type OrderLensStatus = "ready" | "no_cut" | "insufficient" | "no_baseline";
export type OrderPosition = {
  position: number;
  /** Exercises done in this position, most frequent first. */
  exercises: { exerciseId: string; name: string; sessions: number }[];
  sessions: number;
  /** Comparisons with a direction, how many went up, equal or down, and the share up. `level`: that share against positions 1–2. */
  progress: { compared: number; up: number; same: number; down: number; sessions: number; rate: number | null; level: number | null };
  target: { sets: number; sessions: number; reached: number; rate: number | null };
};
export type OrderDirection = "up" | "same" | "down";
export type OrderExerciseSession = { sessionId: string; date: string; position: number; moved: boolean; direction: OrderDirection | null; pct: number | null; best: { load: number; reps: number } | null };
export type OrderExercise = {
  exerciseId: string; name: string; usualPosition: number;
  sessions: OrderExerciseSession[];
  /** Same exercise at the same load in different positions: the only reading that separates order from exercise. */
  compare: { load: number; groups: { position: number; sessions: number; reps: number }[]; pct: number } | null;
};
export type InsightsRoutineOrder = {
  view: "routine-order"; method: typeof ROUTINE_ORDER_METHOD;
  window: { start: string; end: string; days: number }; rules: typeof ROUTINE_ORDER_RULES;
  routine: { id: string; name: string | null };
  routines: { id: string; name: string | null; sessions: number }[];
  sessions: number;
  positions: OrderPosition[];
  lenses: Record<Lens, { status: OrderLensStatus; baseline: number | null; cuts: OrderCut[] }>;
  exercises: OrderExercise[];
};

const shiftDays = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
const round = (value: number) => Math.round(value * 10_000) / 10_000;
function median(values: readonly number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b), middle = sorted.length >> 1;
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

/**
 * Up: more reps at an equal load or more load, with nothing pointing down. Down: fewer reps or less load, with nothing pointing
 * up. Equal: compared, without a change. Signals both ways, or nothing compared, have no direction and never count.
 */
export function directionOf(change: PerformanceChange | undefined): OrderDirection | null {
  if (!change) return null;
  const pct = eligibleForSession(change) ? change.pct : null, up = (pct !== null && pct > 0) || !!change.load?.up, down = (pct !== null && pct < 0) || !!change.load?.down;
  if (up && down) return null;
  if (up) return "up";
  if (down) return "down";
  return pct !== null || (change.load?.same ?? 0) > 0 ? "same" : null;
}
/** One exercise in one session: where it went, its direction and measured change, and its target sets. */
type Row = { sessionId: string; date: string; position: number; exerciseId: string; name: string; dir: OrderDirection | null; pct: number | null; targetSets: number; reached: number; block: OrderBlock };

/** Pooled reading of a set of rows for one lens: enough data or null, and the value (share of times up, or of sets reached). */
function pooled(rows: readonly Row[], lens: Lens): { value: number; enough: boolean } | null {
  const sessions = new Set<string>();
  if (lens === "progress") {
    const compared = rows.filter(row => row.dir !== null);
    if (!compared.length) return null;
    for (const row of compared) sessions.add(row.sessionId);
    return { value: compared.filter(row => row.dir === "up").length / compared.length, enough: compared.length >= ROUTINE_ORDER_RULES.minChanges && sessions.size >= ROUTINE_ORDER_RULES.minSessions };
  }
  let sets = 0, reached = 0;
  for (const row of rows) if (row.targetSets) { sets += row.targetSets; reached += row.reached; sessions.add(row.sessionId); }
  if (!sets) return null;
  return { value: reached / sets, enough: sets >= ROUTINE_ORDER_RULES.minTargetSets && sessions.size >= ROUTINE_ORDER_RULES.minSessions };
}

/** Loss of a value against the baseline: relative for progress, in points for target. */
const lossOf = (lens: Lens, baseline: number, value: number) => lens === "progress" ? 1 - value / baseline : baseline - value;

function cutsOf(rows: readonly Row[], lens: Lens, maxPosition: number): { status: OrderLensStatus; baseline: number | null; cuts: OrderCut[] } {
  const at = (from: number, to = maxPosition) => rows.filter(row => row.position >= from && row.position <= to);
  const base = pooled(at(1, 2), lens);
  if (!base || !base.enough) return { status: "insufficient", baseline: base ? round(base.value) : null, cuts: [] };
  if (lens === "progress" && base.value < ROUTINE_ORDER_RULES.minBaselineRate) return { status: "no_baseline", baseline: round(base.value), cuts: [] };
  const losses = new Map<number, number>();
  for (let position = 3; position <= maxPosition; position++) {
    const reading = pooled(at(position, position), lens);
    if (reading?.enough) losses.set(position, lossOf(lens, base.value, reading.value));
  }
  const eligible = [...losses.keys()];
  const first = eligible.find(position => eligible.filter(other => other >= position).every(other => losses.get(other)! >= ROUTINE_ORDER_RULES.firstLoss));
  if (first === undefined) return { status: "no_cut", baseline: round(base.value), cuts: [] };
  const second = eligible.find(position => position > first && (() => {
    const before = eligible.filter(other => other >= first && other < position), after = eligible.filter(other => other >= position);
    return before.length > 0 && Math.min(...after.map(other => losses.get(other)!)) - Math.max(...before.map(other => losses.get(other)!)) >= ROUTINE_ORDER_RULES.secondGap;
  })());
  // Both halves of the window, by date, must show the drop on their own; otherwise the cut is not named.
  const dates = [...new Set(rows.map(row => `${row.date}#${row.sessionId}`))].sort();
  const halves = [dates.slice(0, Math.ceil(dates.length / 2)), dates.slice(Math.ceil(dates.length / 2))].map(keys => new Set(keys));
  const half = (keys: Set<string>) => rows.filter(row => keys.has(`${row.date}#${row.sessionId}`));
  const repeats = (from: number, to: number, threshold: (baseline: number, inside: number) => boolean) => halves.every(keys => {
    const part = half(keys), b = pooled(part.filter(row => row.position <= 2), lens), inside = pooled(part.filter(row => row.position >= from && row.position <= to), lens);
    return !!b && !!inside && b.value > 0 && threshold(b.value, inside.value);
  });
  const firstEnd = second === undefined ? maxPosition : second - 1;
  if (!repeats(first, firstEnd, (b, v) => lossOf(lens, b, v) >= ROUTINE_ORDER_RULES.firstLoss)) return { status: "no_cut", baseline: round(base.value), cuts: [] };
  const segment = (from: number, to: number) => { const reading = pooled(at(from, to), lens)!; return round(lossOf(lens, base.value, reading.value)); };
  const cuts: OrderCut[] = [{ position: first, loss: segment(first, firstEnd) }];
  if (second !== undefined && halves.every(keys => {
    const part = half(keys), b = pooled(part.filter(row => row.position <= 2), lens);
    const mid = pooled(part.filter(row => row.position >= first && row.position < second), lens), late = pooled(part.filter(row => row.position >= second), lens);
    return !!b && !!mid && !!late && lossOf(lens, b.value, late.value) > lossOf(lens, b.value, mid.value);
  })) cuts.push({ position: second, loss: segment(second, maxPosition) });
  return { status: "ready", baseline: round(base.value), cuts };
}

/** Best reps per load among completed sets with both values. */
function bestByLoad(block: OrderBlock): Map<number, number> {
  const best = new Map<number, number>();
  for (const set of block.sets) if (set.isCompleted && set.actualReps !== null && set.actualLoad !== null && set.actualReps > 0) best.set(set.actualLoad, Math.max(best.get(set.actualLoad) ?? 0, set.actualReps));
  return best;
}

export function routineOrder(snapshot: InsightsSnapshot, blocks: readonly OrderBlock[], routineId: string): InsightsRoutineOrder {
  const end = snapshot.today, start = shiftDays(end, -(ROUTINE_ORDER_DAYS - 1));
  const partial = new Map(snapshot.partialDays.flatMap(day => day.sessions.map(session => [session.sessionId, session] as const)));
  const bySession = new Map<string, OrderBlock[]>();
  for (const block of blocks) bySession.set(block.sessionId, [...(bySession.get(block.sessionId) ?? []), block]);
  const routines = new Map<string, { id: string; name: string | null; sessions: number; last: string }>();
  const rows: Row[] = [];
  let sessions = 0;
  for (const day of snapshot.days) {
    if (day.date < start || day.date > end) continue;
    for (const session of day.sessions) {
      if (!session.routineId) continue;
      const key = session.routineId.toLowerCase(), known = routines.get(key);
      if (known) known.sessions++; else routines.set(key, { id: key, name: session.routineName, sessions: 1, last: day.date });
      if (key !== routineId) continue;
      sessions++;
      // The lanes partition the exercises: each one has its change in one of them at most.
      const changes = new Map<string, PerformanceChange>();
      for (const fact of [...session.exercises, ...(partial.get(session.sessionId)?.exercises ?? [])]) if (fact.change) changes.set(fact.exerciseId.toLowerCase(), fact.change);
      // The order it was done: positions 1..n by `exercise_order`, gaps closed.
      const ordered = [...(bySession.get(session.sessionId) ?? [])].sort((a, b) => a.order - b.order || a.exerciseId.localeCompare(b.exerciseId));
      ordered.forEach((block, index) => {
        const target = block.sets.filter(set => set.isCompleted && set.targetReps !== null && set.targetReps > 0 && set.actualReps !== null);
        const change = changes.get(block.exerciseId.toLowerCase());
        rows.push({ sessionId: session.sessionId, date: day.date, position: index + 1, exerciseId: block.exerciseId.toLowerCase(), name: block.name,
          dir: directionOf(change), pct: eligibleForSession(change) ? change.pct : null, targetSets: target.length, reached: target.filter(set => set.actualReps! >= set.targetReps!).length, block });
      });
    }
  }
  const maxPosition = rows.reduce((max, row) => Math.max(max, row.position), 0);
  const positions: OrderPosition[] = [];
  const progressBase = pooled(rows.filter(row => row.position <= 2), "progress");
  for (let position = 1; position <= maxPosition; position++) {
    const here = rows.filter(row => row.position === position);
    const names = new Map<string, { exerciseId: string; name: string; sessions: number }>();
    for (const row of here) { const known = names.get(row.exerciseId); if (known) known.sessions++; else names.set(row.exerciseId, { exerciseId: row.exerciseId, name: row.name, sessions: 1 }); }
    const compared = here.filter(row => row.dir !== null), up = compared.filter(row => row.dir === "up").length;
    const rate = compared.length ? up / compared.length : null;
    const targeted = here.filter(row => row.targetSets), sets = targeted.reduce((sum, row) => sum + row.targetSets, 0), reached = targeted.reduce((sum, row) => sum + row.reached, 0);
    positions.push({ position, sessions: new Set(here.map(row => row.sessionId)).size,
      exercises: [...names.values()].sort((a, b) => b.sessions - a.sessions || a.name.localeCompare(b.name)),
      progress: { compared: compared.length, up, same: compared.filter(row => row.dir === "same").length, down: compared.filter(row => row.dir === "down").length,
        sessions: new Set(compared.map(row => row.sessionId)).size, rate: rate === null ? null : round(rate),
        level: rate !== null && progressBase && progressBase.value >= ROUTINE_ORDER_RULES.minBaselineRate ? round(rate / progressBase.value) : null },
      target: { sets, sessions: new Set(targeted.map(row => row.sessionId)).size, reached, rate: sets ? round(reached / sets) : null } });
  }
  // Each exercise: its sessions in date order, its usual place, and how it went at its most used load where it changed place.
  const exercises: OrderExercise[] = [];
  for (const exerciseId of [...new Set(rows.map(row => row.exerciseId))]) {
    const mine = rows.filter(row => row.exerciseId === exerciseId).sort((a, b) => a.date.localeCompare(b.date) || a.sessionId.localeCompare(b.sessionId));
    const tally = new Map<number, number>();
    for (const row of mine) tally.set(row.position, (tally.get(row.position) ?? 0) + 1);
    const usual = [...tally.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]![0];
    const best = mine.map(row => bestByLoad(row.block));
    const heaviest = best.map(map => map.size ? Math.max(...map.keys()) : null);
    const loads = new Map<number, number>();
    for (const load of heaviest) if (load !== null) loads.set(load, (loads.get(load) ?? 0) + 1);
    const load = [...loads.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]?.[0];
    let compare: OrderExercise["compare"] = null;
    if (load !== undefined) {
      const groups = new Map<number, number[]>();
      mine.forEach((row, index) => { const reps = best[index]!.get(load); if (reps !== undefined) groups.set(row.position, [...(groups.get(row.position) ?? []), reps]); });
      const list = [...groups.entries()].sort((a, b) => a[0] - b[0]).map(([position, reps]) => ({ position, sessions: reps.length, reps: median(reps)! }));
      if (list.length >= 2 && list[0]!.reps > 0) compare = { load, groups: list, pct: round((list.at(-1)!.reps - list[0]!.reps) / list[0]!.reps * 100) };
    }
    exercises.push({ exerciseId, name: mine.at(-1)!.name, usualPosition: usual, compare,
      sessions: mine.map((row, index) => {
        const map = best[index]!, top = heaviest[index];
        return { sessionId: row.sessionId, date: row.date, position: row.position, moved: row.position !== usual, direction: row.dir, pct: row.pct === null ? null : round(row.pct),
          best: top === null || top === undefined ? null : { load: top, reps: map.get(top)! } };
      }) });
  }
  exercises.sort((a, b) => a.usualPosition - b.usualPosition || a.name.localeCompare(b.name));
  const list = [...routines.values()].sort((a, b) => b.last.localeCompare(a.last) || a.id.localeCompare(b.id)).map(({ id, name, sessions: count }) => ({ id, name, sessions: count }));
  return { view: "routine-order", method: ROUTINE_ORDER_METHOD, window: { start, end, days: ROUTINE_ORDER_DAYS }, rules: ROUTINE_ORDER_RULES,
    routine: { id: routineId, name: routines.get(routineId)?.name ?? null }, routines: list, sessions, positions,
    lenses: { progress: cutsOf(rows, "progress", maxPosition), target: cutsOf(rows, "target", maxPosition) }, exercises };
}
