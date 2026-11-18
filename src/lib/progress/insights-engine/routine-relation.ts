import { sessionChange, type LoadDirections } from "./performance-change";
import type { InsightsSnapshot } from "./read-model";
import { relationSleepMetric } from "./sleep-metric";
import type { DayFact, NutritionContext, SessionFact } from "./types";

/**
 * #533 · Relación: how each session of one routine went and how the user arrived at it, described. Read from the published facts
 * of the cached snapshot: no query of its own, no candidate search, no ranking. Rules in docs/progress/533-cambio-medido.md.
 */
export const ROUTINE_RELATION_METHOD = "insights-routine-relation/1" as const;
/** The last 90 logical days up to today, both included. */
export const ROUTINE_RELATION_DAYS = 90;
/** A median needs three valid observations of that factor inside that group. */
export const ROUTINE_RELATION_MIN_PER_GROUP = 3;

/**
 * - `up` / `same` / `down`: the sign of the session's measured change (mean of its eligible exercises, both lanes), when no load
 *   signal of the session points the other way.
 * - `mixed`: the measured change and a load signal point opposite ways, or the mean is 0 with exercises up and down.
 * - `load_only`: no repetition change was measured, but a load signal was.
 * - `not_compared`: nothing was measured. Neither of the last three is ever counted as up, equal or down.
 */
export type RelationGroup = "up" | "same" | "down" | "mixed" | "load_only" | "not_compared";
export type RelationFactorKey = "carbs_pre_3h" | "last_meal_hours" | "calories_day" | "protein_previous_day" | "calories_previous_day" | "sleep_night_before" | "energy_pre" | `metric_previous_day:${string}`;
type GroupStat = { valid: number; median: number | null };
export type RelationFactor = {
  key: RelationFactorKey; unit: string | null; metricId: string | null;
  /** Sessions of the routine with a valid value, and why the others have none. */
  valid: number; missing: Record<string, number>;
  groups: { up: GroupStat; same: GroupStat; down: GroupStat };
  /**
   * Optional: the nutrition target of the same day as the factor's value (that day's, as recorded that day), over the routine's
   * sessions with one. Only on kcal and protein factors. Median of every target found (not by group); null without any.
   */
  target?: { valid: number; median: number | null };
};
export type RelationSession = {
  sessionId: string; date: string; startedAt: string | null; name: string | null; group: RelationGroup;
  pct: number | null; eligible: number; total: number; lanes: { strict: number; partial: number };
  directions: LoadDirections; load: LoadDirections;
  /** One value per factor, in the order of `factors`. Null: no valid value (the factor's `missing` says why). */
  values: (number | null)[];
};
export type InsightsRoutineRelation = {
  view: "routine-relation"; method: typeof ROUTINE_RELATION_METHOD;
  window: { start: string; end: string; days: number }; minimumPerGroup: number;
  routine: { id: string; name: string | null };
  routines: { id: string; name: string | null; sessions: number }[];
  counts: Record<RelationGroup, number>;
  sessions: RelationSession[];
  factors: RelationFactor[];
};

type Read = { value: number | null; missing?: string };
type FactorRule = { key: RelationFactorKey; unit: string | null; metricId: string | null; read: (session: SessionFact, day: DayFact, energy: { state: string; value: number | null } | undefined) => Read };
const shiftDays = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

/** A day's recorded total of one nutrient: none without meals, none when one meal lacks it (partial sum), and a real zero kept. */
function nutrient(nutrition: NutritionContext | undefined, key: "calories" | "proteinG"): Read {
  if (nutrition === undefined) return { value: null, missing: "unavailable" };
  if (nutrition === null) return { value: null, missing: "no_meals" };
  return nutrition[key].missing ? { value: null, missing: "partial_sum" } : { value: nutrition[key].recorded };
}

export function factorRules(snapshot: InsightsSnapshot): FactorRule[] {
  const definitions = new Map(snapshot.metrics.map(metric => [metric.id, metric]));
  const order = snapshot.relationContext.metricOrder;
  const named = (row: { id: string; systemKey: string | null }) => { const d = definitions.get(row.id); return d ? { ...d, systemKey: row.systemKey } : null; };
  const sleepDefinition = relationSleepMetric(order.map(named).filter((d): d is NonNullable<ReturnType<typeof named>> => !!d));
  const sleep = sleepDefinition ? order.find(row => row.id === sleepDefinition.id) : undefined;
  const rules: FactorRule[] = [
    { key: "carbs_pre_3h", unit: "g", metricId: null, read: session => session.context.carbsPre3h.state === "recorded" ? { value: session.context.carbsPre3h.value } : { value: null, missing: session.context.carbsPre3h.state } },
    { key: "last_meal_hours", unit: "h", metricId: null, read: session => {
      const last = session.context.preStart?.lastExplicitMeal;
      if (!last) return { value: null, missing: "unavailable" };
      if (last.untimedInScope) return { value: null, missing: "untimed_meal_in_scope" };
      if (last.unverifiedInScope) return { value: null, missing: "unverified_meal_time_in_scope" };
      return last.state === "recorded" ? { value: last.hours } : { value: null, missing: last.state };
    } },
    { key: "calories_day", unit: "kcal", metricId: null, read: (_, day) => nutrient(day.context.nutrition, "calories") },
    { key: "protein_previous_day", unit: "g", metricId: null, read: (_, day) => nutrient(day.context.previousDay?.nutrition, "proteinG") },
    { key: "calories_previous_day", unit: "kcal", metricId: null, read: (_, day) => nutrient(day.context.previousDay?.nutrition, "calories") },
  ];
  if (sleep) rules.push({ key: "sleep_night_before", unit: definitions.get(sleep.id)?.unit ?? null, metricId: sleep.id, read: (_, day) => {
    const row = day.context.metrics.find(metric => metric.metricId === sleep.id);
    if (!row) return { value: null, missing: "not_recorded" };
    return row.sleepNight === "declared" ? { value: row.value } : { value: null, missing: row.sleepNight === "stale_declaration" ? "night_declaration_outdated" : "night_undeclared" };
  } });
  rules.push({ key: "energy_pre", unit: "1-5", metricId: null, read: (_, __, energy) => energy?.state === "recorded" ? { value: energy.value } : { value: null, missing: energy?.state ?? "not_recorded" } });
  // The user's own metrics, in their order (then by id), the previous day: what was recorded before the training day started.
  const metrics = order.filter(row => row.systemKey !== "sleep" && row.id !== sleep?.id && definitions.has(row.id) && !definitions.get(row.id)!.archived)
    .sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity) || a.id.localeCompare(b.id));
  for (const metric of metrics) rules.push({ key: `metric_previous_day:${metric.id}`, unit: definitions.get(metric.id)?.unit ?? null, metricId: metric.id, read: (_, day) => {
    const previous = snapshot.relationContext.previousDayMetrics.get(day.date);
    if (!previous) return { value: null, missing: "unavailable" };
    const row = previous.find(value => value.metricId === metric.id);
    return row ? { value: row.value } : { value: null, missing: "not_recorded" };
  } });
  return rules;
}

function groupOf(change: ReturnType<typeof sessionChange>): RelationGroup {
  if (!change.eligible) return change.load.up + change.load.down > 0 ? "load_only" : "not_compared";
  const direction = change.pct! > 0 ? "up" : change.pct! < 0 ? "down" : change.directions.up && change.directions.down ? "mixed" : "same";
  if ((direction === "up" && change.load.down) || (direction === "down" && change.load.up)) return "mixed";
  return direction;
}

/** The target that sits next to a factor: the same day's, never today's applied backwards. */
const TARGET: Partial<Record<RelationFactorKey, (day: DayFact) => number | null | undefined>> = {
  calories_day: day => day.context.target?.calories,
  calories_previous_day: day => day.context.previousDay?.target?.calories,
  protein_previous_day: day => day.context.previousDay?.target?.proteinG,
};
function plainMedian(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b), middle = sorted.length >> 1;
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

function median(values: number[]): number | null {
  if (values.length < ROUTINE_RELATION_MIN_PER_GROUP) return null;
  const sorted = [...values].sort((a, b) => a - b), middle = sorted.length >> 1;
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

export function routineRelation(snapshot: InsightsSnapshot, routineId: string): InsightsRoutineRelation {
  const end = snapshot.today, start = shiftDays(end, -(ROUTINE_RELATION_DAYS - 1));
  const partialById = new Map(snapshot.partialDays.flatMap(day => day.sessions.map(session => [session.sessionId, session] as const)));
  const rules = factorRules(snapshot);
  const routines = new Map<string, { id: string; name: string | null; sessions: number; last: string }>();
  const sessions: RelationSession[] = [];
  // Days arrive newest first: the routine's name is the one of its latest session.
  for (const day of snapshot.days) {
    if (day.date < start || day.date > end) continue;
    for (const session of day.sessions) {
      if (!session.routineId) continue;
      const key = session.routineId.toLowerCase(), known = routines.get(key);
      if (known) known.sessions++; else routines.set(key, { id: key, name: session.routineName, sessions: 1, last: day.date });
      if (key !== routineId) continue;
      const partial = partialById.get(session.sessionId);
      // The lanes partition the exercises: one compared in the strict lane is never compared in the partial one.
      const strictChange = sessionChange(session.exercises), partialChange = partial ? sessionChange(partial.exercises) : null;
      const change = sessionChange([...session.exercises, ...(partial?.exercises ?? [])]);
      const energy = snapshot.relationContext.priorEnergy.get(session.sessionId);
      sessions.push({ sessionId: session.sessionId, date: day.date, startedAt: session.startedAt, name: session.name, group: groupOf(change),
        pct: change.pct, eligible: change.eligible, total: session.exercises.length, lanes: { strict: strictChange.eligible, partial: partialChange?.eligible ?? 0 },
        directions: change.directions, load: change.load, values: rules.map(rule => rule.read(session, day, energy).value) });
    }
  }
  sessions.sort((a, b) => a.date.localeCompare(b.date) || (a.startedAt ?? "").localeCompare(b.startedAt ?? "") || a.sessionId.localeCompare(b.sessionId));
  const counts: Record<RelationGroup, number> = { up: 0, same: 0, down: 0, mixed: 0, load_only: 0, not_compared: 0 };
  for (const session of sessions) counts[session.group]++;
  const dayOf = new Map(snapshot.days.map(day => [day.date, day]));
  const sessionOf = new Map(snapshot.days.flatMap(day => day.sessions.map(session => [session.sessionId, session] as const)));
  const factors = rules.map((rule, index): RelationFactor => {
    const missing: Record<string, number> = {};
    const byGroup = { up: [] as number[], same: [] as number[], down: [] as number[] };
    for (const row of sessions) {
      const value = row.values[index];
      if (value === null || value === undefined) {
        const reason = rule.read(sessionOf.get(row.sessionId)!, dayOf.get(row.date)!, snapshot.relationContext.priorEnergy.get(row.sessionId)).missing ?? "not_recorded";
        missing[reason] = (missing[reason] ?? 0) + 1;
      } else if (row.group === "up" || row.group === "same" || row.group === "down") byGroup[row.group].push(value);
    }
    const stat = (values: number[]): GroupStat => ({ valid: values.length, median: median(values) });
    const goal = TARGET[rule.key];
    const targets = goal ? sessions.map(row => goal(dayOf.get(row.date)!)).filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value > 0) : [];
    return { key: rule.key, unit: rule.unit, metricId: rule.metricId, valid: sessions.filter(row => row.values[index] !== null).length, missing,
      groups: { up: stat(byGroup.up), same: stat(byGroup.same), down: stat(byGroup.down) },
      ...(goal ? { target: { valid: targets.length, median: plainMedian(targets) } } : {}) };
  });
  const list = [...routines.values()].sort((a, b) => b.last.localeCompare(a.last) || a.id.localeCompare(b.id)).map(({ id, name, sessions }) => ({ id, name, sessions }));
  return { view: "routine-relation", method: ROUTINE_RELATION_METHOD, window: { start, end, days: ROUTINE_RELATION_DAYS }, minimumPerGroup: ROUTINE_RELATION_MIN_PER_GROUP,
    routine: { id: routineId, name: routines.get(routineId)?.name ?? null }, routines: list, counts, sessions, factors };
}
