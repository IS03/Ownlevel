// Progreso stage 2 · "Explorar" contract (pure; shared by the Mobile API and Expo). Plan: bocetos/explorar/PLAN.md.
// A query is measure × optional breakdown × optional day filter, always inside the chosen period.
// missing != zero: a value without data is null; coverage says how many days counted.
import { isNutritionDate } from "./nutrition-day-contract";
import { parseProgressPeriod, type MetricValueType, type ProgressPeriod } from "./progress-contract";

export const EXPLORE_TRAINING = ["training.sets", "training.sessions", "training.minutes"] as const;
export const EXPLORE_NUTRITION = ["nutrition.kcal", "nutrition.protein", "nutrition.carbs", "nutrition.fat"] as const;
export const EXPLORE_BREAKDOWNS = ["routine", "muscle", "exercise", "weekday", "meal_moment", "time_band"] as const;
export const EXPLORE_DAYS = ["training", "rest", "work", "off"] as const;
export type ExploreBreakdown = typeof EXPLORE_BREAKDOWNS[number];
export type ExploreDays = typeof EXPLORE_DAYS[number];
export type ExploreAggregation = "sum" | "average" | "latest" | "best";

export type ExploreMeasure =
  | { kind: "training"; key: typeof EXPLORE_TRAINING[number] }
  | { kind: "nutrition"; key: typeof EXPLORE_NUTRITION[number] }
  | { kind: "metric"; key: string; metricId: string }
  | { kind: "body"; key: string }
  | { kind: "exercise"; key: string; exerciseId: string; stat: "best" | "e1rm" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/** `training.sets`, `nutrition.protein`, `metric.<uuid>`, `body.weight`, `exercise.<uuid>.best` | `.e1rm`. */
export function parseExploreMeasure(key: string): ExploreMeasure | undefined {
  if ((EXPLORE_TRAINING as readonly string[]).includes(key)) return { kind: "training", key: key as typeof EXPLORE_TRAINING[number] };
  if ((EXPLORE_NUTRITION as readonly string[]).includes(key)) return { kind: "nutrition", key: key as typeof EXPLORE_NUTRITION[number] };
  const metric = /^metric\.(.+)$/.exec(key);
  if (metric && UUID.test(metric[1])) return { kind: "metric", key, metricId: metric[1] };
  if (/^body\.[a-z_]+$/.test(key)) return { kind: "body", key };
  const exercise = /^exercise\.(.+)\.(best|e1rm)$/.exec(key);
  if (exercise && UUID.test(exercise[1])) return { kind: "exercise", key, exerciseId: exercise[1], stat: exercise[2] as "best" | "e1rm" };
  return undefined;
}

/** Which breakdowns and day filters each measure admits (PLAN.md § Medidas). */
export function exploreOptions(m: ExploreMeasure): { breakdowns: readonly ExploreBreakdown[]; days: readonly ExploreDays[] } {
  if (m.kind === "training") return { breakdowns: m.key === "training.minutes" ? ["routine", "weekday"] : ["routine", "muscle", "exercise", "weekday"], days: ["work", "off"] };
  if (m.kind === "nutrition") return { breakdowns: ["meal_moment", "time_band", "weekday"], days: EXPLORE_DAYS };
  if (m.kind === "metric") return { breakdowns: ["weekday"], days: EXPLORE_DAYS };
  return { breakdowns: [], days: [] };
}
export const exploreAggregation = (m: ExploreMeasure): ExploreAggregation =>
  m.kind === "training" ? "sum" : m.kind === "body" ? "latest" : m.kind === "exercise" ? "best" : "average";

export type ExploreBucket = { start: string; end: string; value: number | null };
/** `days` that had data among `eligible` days (after the day filter). */
export type ExploreCoverage = { days: number; eligible: number };
export type ExploreGroup = { key: string; label: string; value: number | null; coverage: ExploreCoverage; series: ExploreBucket[] | null };
export type ExploreResult = {
  value: number | null; change: number | null; coverage: ExploreCoverage;
  /** Meals without moment (or without a known time) that could not enter the breakdown. */
  unassigned: number;
  groups: ExploreGroup[]; series: ExploreBucket[] | null;
};
export type ProgressExplore = {
  today: string; period: ProgressPeriod;
  measure: { key: string; label: string; unit: string | null; valueType: MetricValueType; aggregation: ExploreAggregation; derived: boolean };
  breakdown: ExploreBreakdown | null; days: ExploreDays | null; series: boolean;
  current: ExploreResult; reference: ExploreResult | null;
};

// ---- parser (strict) ----
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const keys = (v: Record<string, unknown>, names: readonly string[]) => Object.keys(v).length === names.length && names.every(n => n in v);
const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const count = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0;
const list = <T>(v: unknown, item: (x: unknown) => T | undefined): T[] | undefined => {
  if (!Array.isArray(v)) return;
  const out: T[] = [];
  for (const x of v) { const parsed = item(x); if (parsed === undefined) return; out.push(parsed); }
  return out;
};
const coverage = (v: unknown): ExploreCoverage | undefined =>
  record(v) && keys(v, ["days", "eligible"]) && count(v.days) && count(v.eligible) && v.days <= v.eligible ? { days: v.days, eligible: v.eligible } : undefined;
const buckets = (v: unknown, range: { start: string; end: string }): ExploreBucket[] | undefined => {
  const out = list(v, b => record(b) && keys(b, ["start", "end", "value"]) && isNutritionDate(b.start) && isNutritionDate(b.end) && b.start <= b.end
    && b.start >= range.start && b.end <= range.end && (b.value === null || num(b.value)) ? b as ExploreBucket : undefined);
  return out && out.every((b, i) => i === 0 || b.start > out[i - 1].end) ? out : undefined;
};
function parseResult(v: unknown, range: { start: string; end: string }, withSeries: boolean, breakdown: ExploreBreakdown | null): ExploreResult | undefined {
  if (!record(v) || !keys(v, ["value", "change", "coverage", "unassigned", "groups", "series"])) return;
  if (!(v.value === null || num(v.value)) || !(v.change === null || num(v.change)) || !count(v.unassigned)) return;
  const cov = coverage(v.coverage);
  const series = v.series === null ? null : buckets(v.series, range);
  if (!cov || series === undefined || (series !== null) !== withSeries) return;
  const groups = list(v.groups, g => {
    if (!record(g) || !keys(g, ["key", "label", "value", "coverage", "series"]) || typeof g.key !== "string" || typeof g.label !== "string" || !(g.value === null || num(g.value))) return;
    const gc = coverage(g.coverage), gs = g.series === null ? null : buckets(g.series, range);
    if (!gc || gs === undefined || (gs !== null) !== withSeries) return;
    return { key: g.key, label: g.label, value: g.value as number | null, coverage: gc, series: gs };
  });
  if (!groups || (breakdown === null && groups.length > 0) || new Set(groups.map(g => g.key)).size !== groups.length) return;
  return { value: v.value as number | null, change: v.change as number | null, coverage: cov, unassigned: v.unassigned, groups, series };
}
export function parseProgressExplore(v: unknown): ProgressExplore | undefined {
  if (!record(v) || !keys(v, ["today", "period", "measure", "breakdown", "days", "series", "current", "reference"]) || !isNutritionDate(v.today) || typeof v.series !== "boolean") return;
  const period = parseProgressPeriod(v.period);
  const m = v.measure;
  if (!period || period.end > v.today || !record(m) || !keys(m, ["key", "label", "unit", "valueType", "aggregation", "derived"]) || typeof m.key !== "string" || typeof m.label !== "string"
    || !(m.unit === null || typeof m.unit === "string") || !["integer", "decimal", "duration"].includes(String(m.valueType)) || typeof m.derived !== "boolean") return;
  const measure = parseExploreMeasure(m.key);
  if (!measure || m.aggregation !== exploreAggregation(measure) || m.derived !== (measure.kind === "exercise" && measure.stat === "e1rm")) return;
  const options = exploreOptions(measure);
  const breakdown = v.breakdown === null ? null : (options.breakdowns as readonly unknown[]).includes(v.breakdown) ? v.breakdown as ExploreBreakdown : undefined;
  const days = v.days === null ? null : (options.days as readonly unknown[]).includes(v.days) ? v.days as ExploreDays : undefined;
  if (breakdown === undefined || days === undefined || (v.series && breakdown === "weekday")) return;
  const current = parseResult(v.current, period, v.series, breakdown);
  const reference = v.reference === null ? null : parseResult(v.reference, { start: period.previousStart, end: period.previousEnd }, v.series, breakdown);
  if (!current || reference === undefined) return;
  return { today: v.today, period, measure: { ...(m as ProgressExplore["measure"]) }, breakdown, days, series: v.series, current, reference };
}
