import { evaluateAssociations } from "../insights-engine/associations";
import type { Candidate, ObservationRow } from "../insights-engine/types";
import type { InsightsSource } from "../insights-engine/types";
import { weeklyWeights, type BodyWeekly, type WeighIn } from "./weekly";

/**
 * EXPERIMENTAL (`insights-body-weekly/1`, preregistered in 367-evolucion-corporal-metodo.md). Not published, and no view prepares it:
 * only tests and its calibration call it. One row per valid weekly change W−1 → W, dated with W's Monday; four exposures, all of W−1.
 * The association policy is used unchanged; only the row is a week instead of a day.
 */
export const BODY_WEEKLY_ANALYSIS_METHOD = "insights-body-weekly/1" as const;
export const MIN_MEAL_DAYS_PER_WEEK = 4;
const DAY = 86_400_000;
const shift = (date: string, days: number) => new Date(Date.parse(`${date}T12:00:00Z`) + days * DAY).toISOString().slice(0, 10);
const bump = (record: Record<string, number>, key: string) => { record[key] = (record[key] ?? 0) + 1; };

/** Recorded totals of each day that has meals. A day without meals is absent, never zero; a day with an unknown value has none for it. */
function nutritionByDay(source: InsightsSource) {
  const days = new Map<string, { calories: number | null; proteinG: number | null }>();
  for (const meal of source.meals) {
    if (meal.entryKind !== "meal" && meal.entryKind !== "legacy_daily_summary") continue;
    const day = days.get(meal.date) ?? { calories: 0, proteinG: 0 };
    for (const key of ["calories", "proteinG"] as const) {
      const value = meal[key];
      day[key] = day[key] === null || value === null || !Number.isFinite(value) ? null : day[key]! + value;
    }
    days.set(meal.date, day);
  }
  return days;
}

export type BodyWeeklyPreparation = { weekly: BodyWeekly; rows: ObservationRow[]; candidates: Candidate[]; coverage: Map<string, number>;
  evaluate: (permutations?: number, seed?: number) => ReturnType<typeof evaluateAssociations> };
export function prepareBodyWeeklyAssociations(source: InsightsSource, weights: readonly WeighIn[], period: { start: string; end: string }, today: string): BodyWeeklyPreparation {
  const weekly = weeklyWeights(weights, period, today);
  const nutrition = nutritionByDay(source);
  const completed = source.sessions.filter(session => session.status === "completed" && !!session.date);
  const sessionOf = new Map(source.exercises.map(row => [row.id, row.sessionId]));
  const completedIds = new Set(completed.map(session => session.id));
  const setsBySession = new Map<string, number>();
  for (const set of source.sets) {
    const session = sessionOf.get(set.sessionExerciseId);
    if (set.isCompleted && session && completedIds.has(session)) setsBySession.set(session, (setsBySession.get(session) ?? 0) + 1);
  }
  const rows: ObservationRow[] = [];
  const values = { calories: new Map<string, number>(), proteinG: new Map<string, number>(), sessions: new Map<string, number>(), sets: new Map<string, number>() };
  const exclusions = { calories: {} as Record<string, number>, proteinG: {} as Record<string, number> };
  const coverage = new Map<string, number>();
  for (const change of weekly.changes) {
    if (change.change === null) continue;
    const days = Array.from({ length: 7 }, (_, offset) => shift(change.previousStart, offset));
    const trained = completed.filter(session => session.date! >= days[0]! && session.date! <= days[6]!);
    const routines = [...new Set(trained.map(session => session.routineId ?? "free"))];
    rows.push({ date: change.weekStart, y: change.change, ySensitivity: change.change, routineKey: routines.length === 1 ? routines[0]! : null });
    // Activity of the previous week: a week without training is a real zero.
    values.sessions.set(change.weekStart, trained.length);
    values.sets.set(change.weekStart, trained.reduce((sum, session) => sum + (setsBySession.get(session.id) ?? 0), 0));
    const recorded = days.map(day => nutrition.get(day)).filter((day): day is NonNullable<typeof day> => !!day);
    coverage.set(change.weekStart, recorded.length);
    for (const key of ["calories", "proteinG"] as const) {
      const known = recorded.map(day => day[key]).filter((value): value is number => value !== null);
      if (recorded.length < MIN_MEAL_DAYS_PER_WEEK) bump(exclusions[key], "fewer_than_4_days_with_meals");
      else if (known.length < MIN_MEAL_DAYS_PER_WEEK) bump(exclusions[key], "fewer_than_4_days_with_known_value");
      else values[key].set(change.weekStart, known.reduce((sum, value) => sum + value, 0) / known.length);
    }
  }
  const candidate = (subject: keyof typeof values, family: "nutrition" | "metric", exclusion: Record<string, number> = {}): Candidate => ({ values: values[subject], exclusions: exclusion,
    definition: { id: `body_week:${subject}:previous_week`, family, window: "previous_week", subject, temporalBasis: "previous_calendar_week" } });
  const candidates = [candidate("calories", "nutrition", exclusions.calories), candidate("proteinG", "nutrition", exclusions.proteinG), candidate("sessions", "metric"), candidate("sets", "metric")];
  return { weekly, rows, candidates, coverage, evaluate: (permutations, seed) => evaluateAssociations(rows, candidates, { permutations, seed }) };
}
