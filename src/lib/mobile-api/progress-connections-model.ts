import type { NutritionReportDay } from "@/lib/nutrition/reports-core";
import { addProgressIsoDays } from "@/lib/progress/analytics";
import type { ProgressPeriod } from "./progress-contract";
import {
  CONNECTION_KEYS, type ConnectionExercise, type ConnectionFoodKey, type ConnectionMissing,
  type ConnectionStory, type ConnectionWeek, type ProgressConnections,
} from "./progress-connections-contract";
import { registeredNutritionDays } from "./progress-nutrition-days";
import { weightDaysBetween, weightPerWeek, weightTrendAt } from "./progress-weight-trend";

type Range = { start: string; end: string };
export type ConnectionTrainingEvidence = {
  exercises: ConnectionExercise[];
  energy: { current: number | null; previous: number | null; sessions: { current: number; previous: number } };
};
export type ConnectionSources = {
  nutrition: NutritionReportDay[] | null; training: ConnectionTrainingEvidence | null;
  weights: { date: string; value: number }[] | null;
};
const mean = (xs: number[]) => xs.length ? xs.reduce((t, n) => t + n, 0) / xs.length : null;
const inside = (r: Range, date: string) => date >= r.start && date <= r.end;

/** Monday–Sunday, inclusive and clipped to the chosen period. */
export function connectionWeeks(range: Range): Range[] {
  const weeks: Range[] = [];
  for (let start = range.start; start <= range.end;) {
    const weekday = (new Date(start).getUTCDay() + 6) % 7;
    const end = [addProgressIsoDays(start, 6 - weekday), range.end].sort()[0];
    weeks.push({ start, end }); start = addProgressIsoDays(end, 1);
  }
  return weeks;
}
const foodValue = (key: ConnectionFoodKey, day: NutritionReportDay) => key === "nutrition.kcal" ? day.calories : key === "nutrition.protein" ? day.proteinG : day.carbsG;

function foodPeriod(key: ConnectionFoodKey, range: Range, today: string, source: ConnectionSources["nutrition"]) {
  const spanDays = weightDaysBetween(range.start, range.end) + 1;
  const eligible = spanDays - (range.end === today ? 1 : 0);
  const days = source === null ? null : registeredNutritionDays(source.filter(d => inside(range, d.date) && d.date < today), d => foodValue(key, d));
  const weeks: ConnectionWeek[] = connectionWeeks(range).map(w => {
    const data = days?.filter(d => inside(w, d.date));
    return { ...w, food: data ? mean(data.map(d => foodValue(key, d)!)) : null, days: data?.length ?? null,
      eligible: weightDaysBetween(w.start, w.end) + 1 - (w.end === today ? 1 : 0) };
  });
  // Up to two weeks: require 4/7 coverage in each calendar week, prorated for partial weeks.
  // Longer windows: require half of all eligible days. A today-only window still needs one completed day.
  const shortfall = spanDays <= 14
    ? weeks.find(w => w.eligible > 0 && (w.days ?? 0) < Math.ceil(w.eligible * 4 / 7))
    : null;
  const need = shortfall ? Math.max(1, Math.ceil(shortfall.eligible * 4 / 7)) : Math.max(1, Math.ceil(eligible / 2));
  const have = shortfall ? shortfall.days : days?.length ?? null;
  const enough = days !== null && eligible > 0 && (spanDays <= 14 ? !shortfall : days.length >= need);
  return { value: enough ? mean(days!.map(d => foodValue(key, d)!)) : null, coverage: { days: days?.length ?? null, eligible },
    weeks, enough, have, need };
}

function weightPeriod(range: Range, source: ConnectionSources["weights"]) {
  const points = source?.filter(p => inside(range, p.date)).sort((a, b) => a.date.localeCompare(b.date)) ?? [];
  const slope = source === null ? null : weightPerWeek(points);
  return { value: weightTrendAt(points, range.end), slope, count: source === null ? null : points.length,
    weeks: connectionWeeks(range).map(w => ({ ...w,
      // The fitted trend is shown only in weeks with an actual weigh-in; gaps remain gaps.
      trend: points.some(p => inside(w, p.date)) ? weightTrendAt(points, w.end) : null })),
  };
}
const relative = (now: number | null, before: number | null) =>
  now === null || before === null || before === 0 ? 0 : Math.abs((now - before) / before);
/** Sum of absolute relative changes. Strength uses the top exercise's estimated 1RM.
 * Zero baselines do not manufacture infinity; equal scores preserve CONNECTION_KEYS order.
 */
export function connectionRank(story: ConnectionStory): number {
  const o = story.outcome;
  return relative(story.food.current, story.food.previous) + (o.kind === "strength"
    ? relative(o.top?.currentE1rm ?? null, o.top?.previousE1rm ?? null) : relative(o.current, o.previous));
}

/** Pure assembly. Null sources mean failed reads; [] means successfully read, with no records. */
export function calculateProgressConnections(period: ProgressPeriod, reference: ProgressPeriod, today: string, sources: ConnectionSources): ProgressConnections {
  const weight = { current: weightPeriod(period, sources.weights), previous: weightPeriod(reference, sources.weights) };
  const stories = CONNECTION_KEYS.map((key): ConnectionStory => {
    const foodKey: ConnectionFoodKey = key === "protein_strength" ? "nutrition.protein" : key === "kcal_weight" ? "nutrition.kcal" : "nutrition.carbs";
    const a = foodPeriod(foodKey, period, today, sources.nutrition), b = foodPeriod(foodKey, reference, today, sources.nutrition);
    const isWeight = key === "kcal_weight", isEnergy = key === "carbs_energy";
    const unavailable = sources.nutrition === null || (isWeight ? sources.weights === null : sources.training === null);
    const reason = isWeight ? "weigh_ins" : isEnergy ? "energy_sessions" : "comparable_exercises";
    const need = isWeight ? 3 : isEnergy ? 2 : 1;
    let missing: ConnectionMissing | null = null;
    if (unavailable) missing = { side: sources.nutrition === null ? "food" : "outcome",
      reason: sources.nutrition === null ? "food_days" : reason, have: null, need: sources.nutrition === null ? a.need : need, period: "current" };
    else if (!a.enough || !b.enough) {
      const first = a.enough ? b : a;
      missing = { side: "food", reason: "food_days", have: first.have, need: first.need, period: a.enough ? "previous" : "current" };
    }
    const exercises = [...sources.training?.exercises ?? []].sort((a, b) =>
      Math.abs(b.currentE1rm - b.previousE1rm) - Math.abs(a.currentE1rm - a.previousE1rm) || a.exerciseId.localeCompare(b.exerciseId));
    const e = sources.training?.energy;
    const currentEnough = isWeight ? weight.current.slope !== null : isEnergy ? (e?.sessions.current ?? 0) >= 2 : exercises.length >= 1;
    const previousEnough = isWeight ? weight.previous.slope !== null : isEnergy ? (e?.sessions.previous ?? 0) >= 2 : exercises.length >= 1;
    if (!missing && (!currentEnough || !previousEnough)) {
      const previous = currentEnough;
      missing = { side: "outcome", reason, need, period: previous ? "previous" : "current",
        have: isWeight ? weight[previous ? "previous" : "current"].count : isEnergy ? e?.sessions[previous ? "previous" : "current"] ?? 0 : exercises.length };
    }
    const base = { key, status: unavailable ? "unavailable" as const : missing ? "insufficient" as const : "ready" as const,
      food: { key: foodKey, unit: isWeight ? "kcal" as const : "g" as const,
        current: unavailable ? null : a.value, previous: unavailable ? null : b.value, coverage: { current: a.coverage, previous: b.coverage } },
      missing, weeks: unavailable ? a.weeks.map(w => ({ ...w, food: null })) : a.weeks,
      weeksPrevious: unavailable ? b.weeks.map(w => ({ ...w, food: null })) : b.weeks };
    if (isWeight) return { ...base, key, outcome: { kind: "weight", current: unavailable ? null : weight.current.value,
      previous: unavailable ? null : weight.previous.value, perWeekCurrent: unavailable ? null : weight.current.slope,
      perWeekPrevious: unavailable ? null : weight.previous.slope,
      weighIns: { current: unavailable ? null : weight.current.count, previous: unavailable ? null : weight.previous.count } },
      weightWeeks: weight.current.weeks.map(w => unavailable ? { ...w, trend: null } : w),
      weightWeeksPrevious: weight.previous.weeks.map(w => unavailable ? { ...w, trend: null } : w) };
    if (isEnergy) return { ...base, key, outcome: { kind: "energy", scaleMaximum: 5,
      current: unavailable || !currentEnough ? null : e?.current ?? null, previous: unavailable || !previousEnough ? null : e?.previous ?? null,
      sessions: { current: unavailable ? null : e?.sessions.current ?? 0, previous: unavailable ? null : e?.sessions.previous ?? 0 } } };
    const top = exercises[0];
    return { ...base, key, exercises: unavailable ? [] : exercises, outcome: { kind: "strength",
      improved: unavailable ? null : exercises.filter(e => e.status === "improved").length, comparable: unavailable ? null : exercises.length,
      top: unavailable || !top ? null : { exerciseId: top.exerciseId, name: top.name, previousE1rm: top.previousE1rm, currentE1rm: top.currentE1rm } } };
  });
  const ranking = stories.filter(s => s.status === "ready").sort((a, b) => connectionRank(b) - connectionRank(a)).map(s => s.key);
  return { today, period, reference, stories, ranking };
}
