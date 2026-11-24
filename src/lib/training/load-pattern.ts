import { normalizeWeightMode, weightModeStrategy } from "../mobile-api/weight-modes";
import type { SessionSetDto } from "../mobile-api/training-session";
import type { LoadPattern, LoadPatternSchemeSet } from "../mobile-api/training-load-pattern-contract";

/**
 * #537 · Load pattern of one exercise of an active session, from its previous executions. Pure: no reads, no clock.
 *
 * Only previous executions count (today's sets never make the pattern appear or vanish while they are logged), only in
 * the same routine, only within the last `RECENT_DAYS` before today, and only while they stay comparable:
 * same exercise, weight mode, implement and variant (the rule of `sameContext`: two unknown variants are the same
 * unknown, a known one only matches itself). Any change of context, a set with a missing value or an execution without
 * completed sets ends the run: missing is never read as equal.
 */
export const RECENT_DAYS = 56;
export const REPEATED_MIN = 4;
export const SURPLUS_REPS = 2;

type Decision = "maintain" | "increase_weight" | "increase_reps" | "custom";
export type LoadPatternContext = { exerciseId: string; routineId: string | null; weightMode: string | null; implement: string | null; configuration: string | null };
export type LoadPatternCurrent = LoadPatternContext & { logDate: string; nextAdjustment: Decision };
export type LoadPatternExecution = LoadPatternContext & { sessionId: string; logDate: string; routineName: string; sets: SessionSetDto[] };

const dayNumber = (date: string) => Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10))) / 86_400_000;
const implementOf = (value: string | null) => value?.trim().replace(/\s+/g, " ").toLocaleLowerCase("es-AR") || null;
const configurationOf = (value: string | null) => value?.trim() || null;

function sameContext(a: LoadPatternContext, b: LoadPatternContext) {
  return a.exerciseId === b.exerciseId && normalizeWeightMode(a.weightMode) === normalizeWeightMode(b.weightMode)
    && implementOf(a.implement) === implementOf(b.implement) && configurationOf(a.configuration) === configurationOf(b.configuration);
}

/** The completed sets in order, as reps × kg. Null when there are none or one of them lacks a value. */
export function schemeOf(sets: readonly SessionSetDto[]): LoadPatternSchemeSet[] | null {
  const done = sets.filter(set => set.isCompleted).sort((a, b) => a.setNumber - b.setNumber);
  if (!done.length) return null;
  const scheme: LoadPatternSchemeSet[] = [];
  for (const set of done) {
    if (set.actualReps === null || set.actualWeightKg === null || !Number.isFinite(set.actualReps) || !Number.isFinite(set.actualWeightKg)) return null;
    scheme.push({ reps: set.actualReps, weightKg: set.actualWeightKg });
  }
  return scheme;
}
export const sameScheme = (a: readonly LoadPatternSchemeSet[], b: readonly LoadPatternSchemeSet[]) =>
  a.length === b.length && a.every((set, index) => set.reps === b[index]!.reps && set.weightKg === b[index]!.weightKg);

function lastSetSurplus(sets: readonly SessionSetDto[]): { weightKg: number } | null {
  const done = sets.filter(set => set.isCompleted).sort((a, b) => a.setNumber - b.setNumber);
  const last = done.at(-1);
  if (!last || last.actualReps === null || last.targetReps === null || last.actualWeightKg === null) return null;
  return last.actualReps >= last.targetReps + SURPLUS_REPS ? { weightKg: last.actualWeightKg } : null;
}

const keyOf = (signal: string, current: LoadPatternContext, scheme: readonly LoadPatternSchemeSet[]) =>
  [signal, current.exerciseId, current.routineId, scheme.map(set => `${set.reps}x${set.weightKg}`).join(",")].join("|");

/**
 * `history`: previous completed executions of any routine, newest first (as the history read returns them).
 * `surplus` («2 por 2») wins over `repeated`: it is the more concrete signal.
 */
export function detectLoadPattern(current: LoadPatternCurrent, history: readonly LoadPatternExecution[]): LoadPattern | null {
  if (!current.routineId || current.nextAdjustment !== "maintain") return null;
  if (weightModeStrategy(normalizeWeightMode(current.weightMode)) !== "load_reps") return null;
  const today = dayNumber(current.logDate);
  const run: { execution: LoadPatternExecution; scheme: LoadPatternSchemeSet[] }[] = [];
  for (const execution of history) {
    if (execution.routineId !== current.routineId) continue;
    const age = today - dayNumber(execution.logDate);
    if (age < 0) continue;
    if (age > RECENT_DAYS || !sameContext(execution, current)) break;
    const scheme = schemeOf(execution.sets);
    if (!scheme) break;
    run.push({ execution, scheme });
  }
  const evidence = (rows: typeof run) => rows.map(({ execution }) => ({ sessionId: execution.sessionId, logDate: execution.logDate,
    routineName: execution.routineName, sets: execution.sets.filter(set => set.isCompleted).sort((a, b) => a.setNumber - b.setNumber) }));

  const [latest, previous] = run;
  if (latest && previous) {
    const a = lastSetSurplus(latest.execution.sets), b = lastSetSurplus(previous.execution.sets);
    if (a && b && a.weightKg === b.weightKg) {
      return { key: keyOf("surplus", current, latest.scheme), signal: "surplus", scheme: latest.scheme, count: 2, sessions: evidence([latest, previous]) };
    }
  }
  if (!latest) return null;
  let count = 1;
  while (count < run.length && sameScheme(run[count]!.scheme, latest.scheme)) count++;
  if (count < REPEATED_MIN) return null;
  return { key: keyOf("repeated", current, latest.scheme), signal: "repeated", scheme: latest.scheme, count, sessions: evidence(run.slice(0, count)) };
}
