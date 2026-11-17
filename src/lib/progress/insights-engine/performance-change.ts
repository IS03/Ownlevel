import type { ChangeBasis, PerformanceChange } from "../performance-insights/types";

/**
 * #533: what a session and an exercise history say about the measured change of their exercises. Rules in
 * docs/progress/533-cambio-medido.md. Pure, from the published facts only.
 */
export const REPS_BASES: ReadonlySet<ChangeBasis> = new Set<ChangeBasis>(["reps_at_load", "bodyweight_reps"]);
export const RECENT_CHANGES = 10;
const round = (value: number) => Math.round(value * 10_000) / 10_000;

/** Exercises by the direction of their load signals: one exercise counts once, whatever its number of loads. */
export type LoadDirections = { up: number; same: number; down: number };
export type SessionChange = {
  /** `no_eligible`: no exercise had a repetition change measured at an equal condition. */
  state: "measured" | "no_eligible";
  /** Mean of the eligible exercises' `pct`. Time and load never enter it. */
  pct: number | null;
  /** Exercises that entered `pct`, out of `total` exercises of the session in this lane. */
  eligible: number;
  total: number;
  /** Eligible exercises that went up, stayed equal and went down. */
  directions: LoadDirections;
  load: LoadDirections;
};

export const eligibleForSession = (change: PerformanceChange | undefined): change is PerformanceChange & { pct: number; basis: ChangeBasis } =>
  !!change && change.state === "measured" && change.pct !== null && change.basis !== null && REPS_BASES.has(change.basis);

export function loadDirection(change: PerformanceChange | undefined): keyof LoadDirections | null {
  const load = change?.load;
  if (!load || load.up + load.same + load.down === 0) return null;
  if (load.up && load.down) return null;
  return load.up ? "up" : load.down ? "down" : "same";
}

export function sessionChange(exercises: readonly { change?: PerformanceChange }[]): SessionChange {
  const eligible = exercises.map(row => row.change).filter(eligibleForSession);
  const directions: LoadDirections = { up: 0, same: 0, down: 0 }, load: LoadDirections = { up: 0, same: 0, down: 0 };
  for (const change of eligible) directions[change.pct > 0 ? "up" : change.pct < 0 ? "down" : "same"]++;
  for (const row of exercises) { const direction = loadDirection(row.change); if (direction) load[direction]++; }
  return { state: eligible.length ? "measured" : "no_eligible",
    pct: eligible.length ? round(eligible.reduce((sum, change) => sum + change.pct, 0) / eligible.length) : null,
    eligible: eligible.length, total: exercises.length, directions, load };
}

/** Up to ten measured results of one exercise, oldest first, all of the basis of the latest one. */
export type RecentChanges = { basis: ChangeBasis | null; items: { date: string | null; pct: number }[] };
/**
 * `rows` in the order of the published sessions (logical date, then session id): `items` keep that order, so each one is the
 * exercise's result on that date in the days. A different basis is a different measure and is left out, never mixed.
 */
export function recentChanges(rows: readonly { date: string | null; sessionId: string; change?: PerformanceChange }[]): RecentChanges {
  const measured = rows.filter(row => row.change?.state === "measured" && row.change.pct !== null && row.change.basis !== null);
  const basis = measured.at(-1)?.change!.basis ?? null;
  const items = measured.filter(row => row.change!.basis === basis).slice(-RECENT_CHANGES).map(row => ({ date: row.date, pct: row.change!.pct! }));
  return { basis, items };
}
