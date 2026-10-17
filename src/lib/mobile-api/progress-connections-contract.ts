// EXPAND: facts for "Lo que se movió junto". Pure, shared with Expo.
// Dates are inclusive Córdoba dates. Food excludes today; outcomes may include completed records today.
import { isNutritionDate } from "./nutrition-day-contract";
import { parseProgressPeriod, type ProgressPeriod } from "./progress-contract";

export const CONNECTION_KEYS = ["protein_strength", "carbs_strength", "carbs_energy", "kcal_weight"] as const;
export type ConnectionKey = typeof CONNECTION_KEYS[number];
export type ConnectionFoodKey = "nutrition.protein" | "nutrition.carbs" | "nutrition.kcal";
export type ConnectionMissing = {
  side: "food" | "outcome"; reason: "food_days" | "weigh_ins" | "comparable_exercises" | "energy_sessions";
  /** null only when the source failed, never a fabricated zero. */
  have: number | null; need: number; period: "current" | "previous";
};
export type ConnectionCoverage = { days: number | null; eligible: number };
export type ConnectionWeek = { start: string; end: string; food: number | null; days: number | null; eligible: number };
export type ConnectionExercise = {
  exerciseId: string; name: string; previousE1rm: number; currentE1rm: number;
  status: "improved" | "stable" | "declined" | "insufficient_data";
};
export type ConnectionStrength = {
  kind: "strength"; improved: number | null; comparable: number | null; top: Omit<ConnectionExercise, "status"> | null;
};
export type ConnectionEnergy = {
  kind: "energy"; current: number | null; previous: number | null; scaleMaximum: 5;
  sessions: { current: number | null; previous: number | null };
};
export type ConnectionWeight = {
  kind: "weight"; current: number | null; previous: number | null; perWeekCurrent: number | null; perWeekPrevious: number | null;
  weighIns: { current: number | null; previous: number | null };
};
export type ConnectionWeightWeek = { start: string; end: string; trend: number | null };
type ConnectionBase = {
  key: ConnectionKey; status: "ready" | "insufficient" | "unavailable";
  food: { key: ConnectionFoodKey; unit: "g" | "kcal"; current: number | null; previous: number | null;
    coverage: { current: ConnectionCoverage; previous: ConnectionCoverage } };
  missing: ConnectionMissing | null; weeks: ConnectionWeek[]; weeksPrevious: ConnectionWeek[];
};
export type ConnectionStory = ConnectionBase & (
  | { key: "protein_strength" | "carbs_strength"; outcome: ConnectionStrength; exercises: ConnectionExercise[] }
  | { key: "carbs_energy"; outcome: ConnectionEnergy }
  | { key: "kcal_weight"; outcome: ConnectionWeight; weightWeeks: ConnectionWeightWeek[]; weightWeeksPrevious: ConnectionWeightWeek[] }
);
export type ProgressConnections = {
  today: string; period: ProgressPeriod; reference: ProgressPeriod; stories: ConnectionStory[]; ranking: ConnectionKey[];
};

const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const exact = (v: Record<string, unknown>, fields: readonly string[]) => Object.keys(v).length === fields.length && fields.every(f => Object.hasOwn(v, f));
const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const nonnegative = (v: unknown): v is number => num(v) && v >= 0;
const count = (v: unknown): v is number => nonnegative(v) && Number.isInteger(v);
const optional = (v: unknown, test: (v: unknown) => boolean) => v === null || test(v);
const dayCount = (start: string, end: string) => Math.round((Date.parse(end) - Date.parse(start)) / 86_400_000) + 1;
const nextDay = (date: string) => new Date(Date.parse(date) + 86_400_000).toISOString().slice(0, 10);

function periodValid(v: unknown, today: string): v is ProgressPeriod {
  const p = parseProgressPeriod(v);
  return !!p && p.end <= today && p.days === dayCount(p.start, p.end) && p.previousStart <= p.previousEnd
    && p.includesToday === (p.end === today);
}
function coverage(v: unknown, eligible: number): v is ConnectionCoverage {
  return record(v) && exact(v, ["days", "eligible"]) && v.eligible === eligible && optional(v.days, count)
    && (v.days === null || (v.days as number) <= eligible);
}
function weeksValid(v: unknown, range: ProgressPeriod, today: string, weight = false): boolean {
  if (!Array.isArray(v) || v.length === 0 || v.length > 54) return false;
  let expected = range.start;
  for (const w of v) {
    if (!record(w) || !exact(w, weight ? ["start", "end", "trend"] : ["start", "end", "food", "days", "eligible"])
      || !isNutritionDate(w.start) || !isNutritionDate(w.end) || w.start !== expected || w.start > w.end || w.end > range.end) return false;
    // A partial first week ends on Sunday; all subsequent weeks start on Monday.
    if ((w.end !== range.end && new Date(w.end).getUTCDay() !== 0) || dayCount(w.start, w.end) > 7) return false;
    if (weight) { if (!optional(w.trend, num)) return false; }
    else {
      const eligible = dayCount(w.start, w.end) - (w.end === today ? 1 : 0);
      if (!coverage({ days: w.days, eligible: w.eligible }, eligible) || !optional(w.food, num)
        || w.food !== null && (!count(w.days) || w.days === 0)) return false;
    }
    expected = nextDay(w.end);
  }
  return expected === nextDay(range.end);
}
function exerciseValid(v: unknown, status: boolean): boolean {
  if (!record(v) || !exact(v, ["exerciseId", "name", "previousE1rm", "currentE1rm", ...(status ? ["status"] : [])])
    || typeof v.exerciseId !== "string" || !v.exerciseId || typeof v.name !== "string"
    || !num(v.previousE1rm) || v.previousE1rm <= 0 || !num(v.currentE1rm) || v.currentE1rm <= 0
    || !Number.isInteger(v.previousE1rm * 2) || !Number.isInteger(v.currentE1rm * 2)) return false;
  return !status || ["improved", "stable", "declined", "insufficient_data"].includes(String(v.status));
}
function missingValid(v: unknown): v is ConnectionMissing {
  return record(v) && exact(v, ["side", "reason", "have", "need", "period"]) && ["food", "outcome"].includes(String(v.side))
    && ["food_days", "weigh_ins", "comparable_exercises", "energy_sessions"].includes(String(v.reason))
    && optional(v.have, count) && count(v.need) && v.need > 0 && ["current", "previous"].includes(String(v.period))
    && (v.side === "food") === (v.reason === "food_days");
}
function storyValid(v: unknown, key: ConnectionKey, period: ProgressPeriod, reference: ProgressPeriod, today: string): v is ConnectionStory {
  const strength = key.endsWith("_strength"), weight = key === "kcal_weight";
  if (!record(v) || !exact(v, ["key", "status", "food", "outcome", "missing", "weeks", "weeksPrevious",
    ...(strength ? ["exercises"] : weight ? ["weightWeeks", "weightWeeksPrevious"] : [])]) || v.key !== key
    || !["ready", "insufficient", "unavailable"].includes(String(v.status))) return false;
  const f = v.food, o = v.outcome;
  if (!record(f) || !exact(f, ["key", "unit", "current", "previous", "coverage"])
    || f.key !== (weight ? "nutrition.kcal" : key === "protein_strength" ? "nutrition.protein" : "nutrition.carbs")
    || f.unit !== (weight ? "kcal" : "g") || !optional(f.current, num) || !optional(f.previous, num)
    || !record(f.coverage) || !exact(f.coverage, ["current", "previous"])
    || !coverage(f.coverage.current, period.days - (period.includesToday ? 1 : 0))
    || !coverage(f.coverage.previous, reference.days - (reference.includesToday ? 1 : 0))
    || !weeksValid(v.weeks, period, today) || !weeksValid(v.weeksPrevious, reference, today) || !record(o)) return false;
  if (v.status === "ready" ? v.missing !== null || f.current === null || f.previous === null : !missingValid(v.missing)) return false;
  if (v.status === "insufficient" && (v.missing as ConnectionMissing).have === null) return false;
  if (v.status === "unavailable" && (v.missing as ConnectionMissing).have !== null) return false;
  if (v.status !== "unavailable" && (f.coverage.current.days === null || f.coverage.previous.days === null
    || [...v.weeks as ConnectionWeek[], ...v.weeksPrevious as ConnectionWeek[]].some(w => w.days === null))) return false;
  if (v.status !== "ready") {
    const m = v.missing as ConnectionMissing;
    if (m.side === "outcome" && m.reason !== (strength ? "comparable_exercises" : weight ? "weigh_ins" : "energy_sessions")) return false;
  }
  if (strength) {
    if (!exact(o, ["kind", "improved", "comparable", "top"]) || o.kind !== "strength" || !optional(o.improved, count) || !optional(o.comparable, count)
      || !(o.top === null || exerciseValid(o.top, false)) || !Array.isArray(v.exercises) || !v.exercises.every(e => exerciseValid(e, true))) return false;
    const exercises = v.exercises as ConnectionExercise[];
    if (new Set(exercises.map(e => e.exerciseId)).size !== exercises.length) return false;
    if (v.status !== "unavailable" && (o.comparable !== exercises.length || o.improved !== exercises.filter(e => e.status === "improved").length)) return false;
    if (o.top !== null) {
      const top = o.top as ConnectionStrength["top"];
      if (!exercises.some(e => e.exerciseId === top!.exerciseId && e.name === top!.name && e.previousE1rm === top!.previousE1rm && e.currentE1rm === top!.currentE1rm)) return false;
    }
    if (v.status === "ready" && (!count(o.comparable) || o.comparable < 1 || o.top === null)) return false;
  } else {
    const pairs = weight ? "weighIns" : "sessions";
    if (!exact(o, ["kind", "current", "previous", pairs, ...(weight ? ["perWeekCurrent", "perWeekPrevious"] : ["scaleMaximum"])])
      || o.kind !== (weight ? "weight" : "energy") || !record(o[pairs]) || !exact(o[pairs], ["current", "previous"])
      || !Object.values(o[pairs]).every(n => optional(n, count))) return false;
    if (v.status !== "unavailable" && Object.values(o[pairs]).some(n => n === null)) return false;
    const value = weight ? num : (n: unknown) => num(n) && n >= 1 && n <= 5;
    if (!optional(o.current, value) || !optional(o.previous, value)) return false;
    if (weight ? !optional(o.perWeekCurrent, num) || !optional(o.perWeekPrevious, num)
      || !weeksValid(v.weightWeeks, period, today, true) || !weeksValid(v.weightWeeksPrevious, reference, today, true) : o.scaleMaximum !== 5) return false;
    if (v.status === "ready" && (o.current === null || o.previous === null || !count(o[pairs].current) || !count(o[pairs].previous)
      || o[pairs].current < (weight ? 3 : 2) || o[pairs].previous < (weight ? 3 : 2) || weight && (o.perWeekCurrent === null || o.perWeekPrevious === null))) return false;
  }
  if (v.status === "unavailable") {
    if (f.current !== null || f.previous !== null) return false;
    if (strength ? o.improved !== null || o.comparable !== null || o.top !== null || (v.exercises as unknown[]).length > 0
      : o.current !== null || o.previous !== null || Object.values(o[weight ? "weighIns" : "sessions"] as object).some(n => n !== null)
        || weight && (o.perWeekCurrent !== null || o.perWeekPrevious !== null)) return false;
    if ([...(v.weeks as ConnectionWeek[]), ...(v.weeksPrevious as ConnectionWeek[])].some(w => w.food !== null)
      || weight && [...v.weightWeeks as ConnectionWeightWeek[], ...v.weightWeeksPrevious as ConnectionWeightWeek[]].some(w => w.trend !== null)) return false;
  }
  return true;
}

export function parseProgressConnections(v: unknown): ProgressConnections | undefined {
  if (!record(v) || !exact(v, ["today", "period", "reference", "stories", "ranking"]) || !isNutritionDate(v.today)
    || !periodValid(v.period, v.today) || !periodValid(v.reference, v.today)
    || v.period.previousStart !== v.reference.start || v.period.previousEnd !== v.reference.end
    || !Array.isArray(v.stories) || v.stories.length !== 4 || !Array.isArray(v.ranking)) return;
  if (!v.stories.every((s, i) => storyValid(s, CONNECTION_KEYS[i], v.period as ProgressPeriod, v.reference as ProgressPeriod, v.today as string))) return;
  const stories = v.stories as ConnectionStory[], ready = stories.filter(s => s.status === "ready").map(s => s.key);
  if (new Set(v.ranking).size !== v.ranking.length || v.ranking.length !== ready.length || !v.ranking.every(k => ready.includes(k))) return;
  return { today: v.today, period: v.period, reference: v.reference, stories, ranking: v.ranking as ConnectionKey[] };
}
