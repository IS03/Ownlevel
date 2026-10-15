// M7.1 Progress contract, shared by the Mobile API adapter and Expo (pure; no server imports).
// Every analytic value is computed server-side by the Web Progress engine; Mobile only renders.
// missing != zero: absent values are null; an unavailable domain is never "empty" or "0".
import { isNutritionDate } from "./nutrition-day-contract";
import { REPORT_PRESETS, type ReportPreset, type ReportQuery } from "./nutrition-report-contract";

export const PROGRESS_PRESETS = REPORT_PRESETS;
export type ProgressPreset = ReportPreset;
export type ProgressQuery = ReportQuery;
export const PROGRESS_DEFAULT_PRESET: ProgressPreset = "30";
export const PROGRESS_CUSTOM_MAX_DAYS = 366;

export type ProgressBucket = "day" | "week" | "month";
export type ProgressPeriod = {
  preset: ProgressPreset; start: string; end: string; days: number;
  previousStart: string; previousEnd: string; bucket: ProgressBucket; includesToday: boolean;
};
export type ProgressComparisonStatus = "comparable" | "not_comparable" | "insufficient_data";
export type ProgressChange = "increased" | "decreased" | "stable" | "deficit_to_surplus" | "surplus_to_deficit" | "insufficient_data";
/** current vs previous equivalent period (engine result). Percent is null when not valid (baseline 0, metric disallows it). */
export type ProgressComparison = {
  status: ProgressComparisonStatus; reason: string; current: number | null; previous: number | null;
  deltaAbsolute: number | null; deltaPercent: number | null; change: ProgressChange;
};
export type ProgressCoverage = { registered: number; eligible: number | null; ratio: number | null };
export type ProgressDestination = { kind: "body" } | { kind: "nutrition" } | { kind: "metrics"; metricId: string | null }
  | { kind: "training" } | { kind: "training_exercise"; exerciseId: string };
export type ProgressRow = { id: string; label: string; value: string; detail: string | null; destination: ProgressDestination };
export type ProgressFinding = { id: string; domain: "body" | "nutrition" | "metrics" | "training"; label: string; description: string; destination: ProgressDestination };
export type ProgressSection<T> = { status: "ok"; data: T } | { status: "unavailable" };
export type MetricValueType = "integer" | "decimal" | "duration";

export type ProgressNutritionSummary = {
  averageKcal: number | null; averageProteinG: number | null; averageTargetKcal: number | null; averageTargetProteinG: number | null;
  accumulatedBalanceKcal: number | null; registeredDays: number; completedDays: number; days: number;
  calories: ProgressComparison; protein: ProgressComparison; balance: ProgressComparison;
};
export type ProgressMetricHabit = {
  id: string; name: string; unit: string | null; valueType: MetricValueType;
  average: number | null; coverage: ProgressCoverage; comparison: ProgressComparison;
};
/** Calendar week for Home; averages exclude today while it is in progress. */
export type ProgressHabitWeek = {
  today: string; weekStart: string; weekEnd: string; previousWeekStart: string; previousWeekEnd: string; completedDays: number;
  items: (ProgressMetricHabit & { systemKey: string | null })[];
};

/** Pure date context, shared with the parser so a rolling window cannot masquerade as a calendar week. */
export function habitWeekRange(today: string) {
  if (!isNutritionDate(today)) throw new Error("Invalid habit week date");
  const date = new Date(`${today}T12:00:00Z`);
  const completedDays = (date.getUTCDay() + 6) % 7;
  const shift = (days: number) => new Date(date.getTime() + days * 86_400_000).toISOString().slice(0, 10);
  return { weekStart: shift(-completedDays), weekEnd: shift(6 - completedDays),
    previousWeekStart: shift(-completedDays - 7), previousWeekEnd: shift(-completedDays - 1), completedDays };
}

/** Training load: sessions, days and sets are real zeros when nothing was trained; duration is start→end (includes rests). */
export type ProgressTrainingSummary = {
  sessions: number; trainingDays: number; sets: number; minutes: number; sessionsPerWeek: number | null;
  comparisons: { sessions: ProgressComparison; trainingDays: ProgressComparison; sets: ProgressComparison; minutes: ProgressComparison; setsPerSession: ProgressComparison };
  performance: { improved: number; stable: number; declined: number; comparable: number; insufficient: number; headline: string };
};
export type ProgressOverview = {
  today: string; period: ProgressPeriod;
  evolution: ProgressRow[]; changes: ProgressFinding[];
  nutrition: ProgressSection<ProgressNutritionSummary>;
  metrics: ProgressSection<{ items: ProgressMetricHabit[] }>;
  body: ProgressSection<{ excludedSuspect: number; trackedMetrics: number }>;
  training: ProgressSection<ProgressTrainingSummary>;
  /** Only when requested (`spark=1`): mini charts for the Progreso rows. */
  sparks?: ProgressOverviewSparks;
  inPeriod?: { improved: number; comparable: number } | null;
};
/** One bucket of a mini chart. null = no data in the bucket (a gap, never 0). */
export type ProgressSparkPoint = { start: string; end: string; value: number | null };
/** Buckets of the period and, only while comparing, of the comparison range (its own natural buckets). */
export type ProgressSpark = { current: ProgressSparkPoint[]; reference: ProgressSparkPoint[] | null };
/** Weight: last weighing per bucket; first/last of the period and the last weighing of the comparison range. */
export type ProgressWeightSpark = ProgressSpark & { first: number | null; last: number | null; referenceLast: number | null };
/** Training = completed sets per bucket (0 is real). Nutrition = average kcal of complete days per bucket. */
export type ProgressOverviewSparks = { weight: ProgressWeightSpark | null; training: ProgressSpark | null; nutrition: ProgressSpark | null };
export type TrainingPerformanceStatus = "improved" | "stable" | "declined" | "insufficient_data";
export type TrainingSignal = { kind: string; description: string; currentValue: number | null; referenceValue: number | null; contextValue: number | null };
export type ProgressTrainingExercise = {
  id: string; name: string; muscleLabel: string; weightMode: string | null; status: TrainingPerformanceStatus; reason: string;
  signal: TrainingSignal | null; isPersonalRecord: boolean; sessions: number; sets: number; lastDate: string | null;
};
export type ProgressTrainingFeeling = { key: "energy" | "performance" | "pain"; label: string; average: number; scaleMaximum: 5 | 10; registered: number; eligible: number; ratio: number };
export type ProgressTrainingInPeriod = {
  improved: number; stable: number; declined: number; insufficient: number;
  exercises: { id: string; status: TrainingPerformanceStatus; reason: string; sessions: number; firstDate: string; lastDate: string; signal: TrainingSignal | null }[];
};
export type ProgressTraining = {
  inPeriod?: ProgressTrainingInPeriod;
  today: string; period: ProgressPeriod; summary: ProgressTrainingSummary;
  series: { start: string; end: string; sessions: number; sets: number; minutes: number }[];
  exercises: ProgressTrainingExercise[];
  personalRecords: { exerciseId: string; name: string; description: string }[];
  feelings: ProgressTrainingFeeling[];
  muscles: { key: string; label: string; sets: number; sessions: number; exercises: number }[];
  routines: { id: string; name: string; sessions: number; sets: number; minutes: number }[];
};
export type ProgressExerciseMark = { kind: "best_load" | "best_reps" | "best_time"; label: string; value: number; unit: "kg" | "lingotes" | "reps" | "s"; context: string | null; date: string };
export type ProgressExerciseChartKind = "load" | "reps" | "time";
export type ProgressTrainingExerciseDetail = {
  today: string; period: ProgressPeriod;
  exercise: { id: string; name: string; muscleLabel: string; weightMode: string | null };
  performance: { status: TrainingPerformanceStatus; reason: string; signal: TrainingSignal | null; isPersonalRecord: boolean; primarySamples: number; referenceSamples: number };
  comparisons: { sessions: ProgressComparison; sets: ProgressComparison };
  marks: ProgressExerciseMark[];
  chart: { kind: ProgressExerciseChartKind; unit: "kg" | "lingotes" | "reps" | "s"; points: { date: string; sessionId: string; value: number; context: number | null }[] } | null;
  sessions: { sessionId: string; date: string; routineName: string; sets: { reps: number | null; weightKg: number | null }[] }[];
};

export type BodyObservationDto = { date: string; value: number; imported: boolean; provenanceLabel: string };
export type BodyTrend = "increased" | "decreased" | "stable" | "variable" | "unavailable";
export type BodyConfidence = "unavailable" | "limited" | "supported";
export type ProgressBodyMetric = {
  key: string; label: string; unit: "kg" | "cm";
  latest: BodyObservationDto | null; first: BodyObservationDto | null; last: BodyObservationDto | null;
  change: number | null; referenceChange: number | null; trend: BodyTrend; confidence: BodyConfidence;
  observations: BodyObservationDto[]; referenceCount: number;
  comparison: { status: ProgressComparisonStatus; reason: string };
};
export type ProgressBody = { today: string; period: ProgressPeriod; excludedSuspect: number; metrics: ProgressBodyMetric[] };

export type ProgressMetricDefinition = {
  id: string; systemKey: string | null; name: string; unit: string | null; valueType: MetricValueType; isActive: boolean; currentTarget: number | null;
};
export type ProgressMetricSummary = {
  average: number | null; median: number | null; minimum: number | null; maximum: number | null;
  registeredDays: number; eligibleDays: number; coverageRatio: number | null; trendDelta: number | null; trendPercentDelta: number | null;
};
export type ProgressSeriesPoint = { start: string; end: string; value: number | null; samples: number };
export type ProgressMetrics = {
  today: string; period: ProgressPeriod; definitions: ProgressMetricDefinition[];
  metric: ProgressMetricDefinition | null; summary: ProgressMetricSummary | null;
  previous: { average: number | null; registeredDays: number; eligibleDays: number } | null;
  comparison: ProgressComparison | null; series: ProgressSeriesPoint[];
};

// ---- parsers (strict: unknown or inconsistent shapes are invalid responses) ----
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const keys = (v: Record<string, unknown>, names: readonly string[]) => Object.keys(v).length === names.length && names.every(n => n in v);
const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const numOrNull = (v: unknown): v is number | null => v === null || num(v);
const count = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0;
const str = (v: unknown): v is string => typeof v === "string";
const strOrNull = (v: unknown): v is string | null => v === null || typeof v === "string";
const list = <T>(v: unknown, item: (x: unknown) => T | undefined): T[] | undefined => {
  if (!Array.isArray(v)) return;
  const out = v.map(item);
  return out.every((x): x is T => x !== undefined) ? out : undefined;
};
const VALUE_TYPES = ["integer", "decimal", "duration"];
const CHANGES = ["increased", "decreased", "stable", "deficit_to_surplus", "surplus_to_deficit", "insufficient_data"];
const STATUSES = ["comparable", "not_comparable", "insufficient_data"];

export function parseProgressQuery(v: unknown): ProgressQuery | undefined {
  if (!record(v) || !(PROGRESS_PRESETS as readonly unknown[]).includes(v.period)) return;
  if (v.period === "custom") {
    if (!keys(v, ["period", "from", "to"]) || !isNutritionDate(v.from) || !isNutritionDate(v.to) || v.from > v.to) return;
    return { period: "custom", from: v.from, to: v.to };
  }
  return keys(v, ["period"]) ? { period: v.period as ProgressPreset } : undefined;
}
export function progressQueryKey(q: ProgressQuery) { return q.period === "custom" ? `custom:${q.from}:${q.to}` : q.period; }
export function progressQueryString(q: ProgressQuery) {
  const params = new URLSearchParams({ period: q.period });
  if (q.period === "custom" && q.from && q.to) { params.set("from", q.from); params.set("to", q.to); }
  return params.toString();
}

export function parseProgressPeriod(v: unknown): ProgressPeriod | undefined {
  if (!record(v) || !keys(v, ["preset", "start", "end", "days", "previousStart", "previousEnd", "bucket", "includesToday"])
    || !(PROGRESS_PRESETS as readonly unknown[]).includes(v.preset) || !isNutritionDate(v.start) || !isNutritionDate(v.end) || v.start > v.end
    || !count(v.days) || v.days < 1 || v.days > PROGRESS_CUSTOM_MAX_DAYS || !isNutritionDate(v.previousStart) || !isNutritionDate(v.previousEnd)
    || v.previousEnd >= v.start || !["day", "week", "month"].includes(String(v.bucket)) || typeof v.includesToday !== "boolean") return;
  return v as ProgressPeriod;
}
export function parseProgressComparison(v: unknown): ProgressComparison | undefined {
  if (!record(v) || !keys(v, ["status", "reason", "current", "previous", "deltaAbsolute", "deltaPercent", "change"])
    || !STATUSES.includes(String(v.status)) || !str(v.reason) || !numOrNull(v.current) || !numOrNull(v.previous)
    || !numOrNull(v.deltaAbsolute) || !numOrNull(v.deltaPercent) || !CHANGES.includes(String(v.change))) return;
  // A percent never exists without a non-zero baseline.
  if (v.deltaPercent !== null && (v.previous === null || v.previous === 0)) return;
  if (v.status !== "comparable" && (v.deltaAbsolute !== null || v.deltaPercent !== null)) return;
  return v as ProgressComparison;
}
function parseCoverage(v: unknown): ProgressCoverage | undefined {
  if (!record(v) || !keys(v, ["registered", "eligible", "ratio"]) || !count(v.registered) || (v.eligible !== null && !count(v.eligible))
    || (v.ratio !== null && !(num(v.ratio) && v.ratio >= 0 && v.ratio <= 1))) return;
  return v as ProgressCoverage;
}
function parseDestination(v: unknown): ProgressDestination | undefined {
  if (!record(v)) return;
  if ((v.kind === "body" || v.kind === "nutrition") && keys(v, ["kind"])) return { kind: v.kind };
  if (v.kind === "metrics" && keys(v, ["kind", "metricId"]) && strOrNull(v.metricId)) return { kind: "metrics", metricId: v.metricId };
  if (v.kind === "training" && keys(v, ["kind"])) return { kind: "training" };
  if (v.kind === "training_exercise" && keys(v, ["kind", "exerciseId"]) && str(v.exerciseId)) return { kind: "training_exercise", exerciseId: v.exerciseId };
}
function parseRow(v: unknown): ProgressRow | undefined {
  if (!record(v) || !keys(v, ["id", "label", "value", "detail", "destination"]) || !str(v.id) || !str(v.label) || !str(v.value) || !strOrNull(v.detail)) return;
  const destination = parseDestination(v.destination);
  return destination ? { ...(v as ProgressRow), destination } : undefined;
}
function parseFinding(v: unknown): ProgressFinding | undefined {
  if (!record(v) || !keys(v, ["id", "domain", "label", "description", "destination"]) || !["body", "nutrition", "metrics", "training"].includes(String(v.domain))
    || !str(v.id) || !str(v.label) || !str(v.description)) return;
  const destination = parseDestination(v.destination);
  return destination ? { ...(v as ProgressFinding), destination } : undefined;
}
function section<T>(v: unknown, parse: (x: unknown) => T | undefined): ProgressSection<T> | undefined {
  if (!record(v)) return;
  if (v.status === "unavailable" && keys(v, ["status"])) return { status: "unavailable" };
  if (v.status !== "ok" || !keys(v, ["status", "data"])) return;
  const data = parse(v.data);
  return data === undefined ? undefined : { status: "ok", data };
}
function parseNutrition(v: unknown): ProgressNutritionSummary | undefined {
  if (!record(v) || !keys(v, ["averageKcal", "averageProteinG", "averageTargetKcal", "averageTargetProteinG", "accumulatedBalanceKcal",
    "registeredDays", "completedDays", "days", "calories", "protein", "balance"])
    || !numOrNull(v.averageKcal) || !numOrNull(v.averageProteinG) || !numOrNull(v.averageTargetKcal) || !numOrNull(v.averageTargetProteinG)
    || !numOrNull(v.accumulatedBalanceKcal) || !count(v.registeredDays) || !count(v.completedDays) || !count(v.days)) return;
  const calories = parseProgressComparison(v.calories), protein = parseProgressComparison(v.protein), balance = parseProgressComparison(v.balance);
  return calories && protein && balance ? { ...(v as ProgressNutritionSummary), calories, protein, balance } : undefined;
}
function parseHabit(v: unknown): ProgressMetricHabit | undefined {
  if (!record(v) || !keys(v, ["id", "name", "unit", "valueType", "average", "coverage", "comparison"]) || !str(v.id) || !str(v.name)
    || !strOrNull(v.unit) || !VALUE_TYPES.includes(String(v.valueType)) || !numOrNull(v.average)) return;
  const coverage = parseCoverage(v.coverage), comparison = parseProgressComparison(v.comparison);
  return coverage && comparison ? { ...(v as ProgressMetricHabit), coverage, comparison } : undefined;
}
export function parseProgressHabitWeek(v: unknown): ProgressHabitWeek | undefined {
  if (!record(v) || !keys(v, ["today", "weekStart", "weekEnd", "previousWeekStart", "previousWeekEnd", "completedDays", "items"])
    || !isNutritionDate(v.today)) return;
  const range = habitWeekRange(v.today);
  if (Object.entries(range).some(([key, value]) => v[key] !== value)) return;
  const items = list(v.items, raw => {
    if (!record(raw) || !strOrNull(raw.systemKey)) return;
    const { systemKey, ...rest } = raw;
    const item = parseHabit(rest);
    if (!item || item.coverage.eligible !== range.completedDays || item.coverage.registered > range.completedDays
      || (item.average === null) !== (item.coverage.registered === 0) || item.comparison.current !== item.average) return;
    return { ...item, systemKey: systemKey as string | null };
  });
  if (!items || new Set(items.map(item => item.id)).size !== items.length) return;
  return { today: v.today, ...range, items };
}

const OVERVIEW_KEYS = ["today", "period", "evolution", "changes", "nutrition", "metrics", "body", "training"];
const parseSparkPoints = (v: unknown, value: (x: unknown) => boolean): ProgressSparkPoint[] | undefined => {
  const points = list(v, p => record(p) && keys(p, ["start", "end", "value"]) && isNutritionDate(p.start) && isNutritionDate(p.end)
    && p.start <= p.end && (p.value === null || value(p.value)) ? p as ProgressSparkPoint : undefined);
  return points && points.every((p, i) => i === 0 || p.start > points[i - 1].end) ? points : undefined;
};
function parseSpark(v: unknown, value: (x: unknown) => boolean, extra: readonly string[] = []): ProgressSpark | undefined {
  if (!record(v) || !keys(v, ["current", "reference", ...extra])) return;
  const current = parseSparkPoints(v.current, value), reference = v.reference === null ? null : parseSparkPoints(v.reference, value);
  return current && reference !== undefined ? { current, reference } : undefined;
}
function parseSparks(v: unknown): ProgressOverviewSparks | undefined {
  if (!record(v) || !keys(v, ["weight", "training", "nutrition"])) return;
  const positive = (x: unknown) => num(x) && x > 0;
  const w = v.weight;
  const weight = w === null ? null : (() => {
    const spark = parseSpark(w, positive, ["first", "last", "referenceLast"]), r = w as Record<string, unknown>;
    if (!spark || ![r.first, r.last, r.referenceLast].every(x => x === null || positive(x))) return;
    return { ...spark, first: r.first as number | null, last: r.last as number | null, referenceLast: r.referenceLast as number | null };
  })();
  const training = v.training === null ? null : parseSpark(v.training, count);
  const nutrition = v.nutrition === null ? null : parseSpark(v.nutrition, x => num(x) && x >= 0);
  return weight !== undefined && training !== undefined && nutrition !== undefined ? { weight, training, nutrition } : undefined;
}
export function parseProgressOverview(v: unknown): ProgressOverview | undefined {
  if (!record(v) || !keys(v, [...OVERVIEW_KEYS, ...("sparks" in v ? ["sparks"] : []), ...("inPeriod" in v ? ["inPeriod"] : [])]) || !isNutritionDate(v.today)) return;
  const inPeriod = v.inPeriod;
  if ("inPeriod" in v && inPeriod !== null && (!record(inPeriod) || !keys(inPeriod, ["improved", "comparable"]) || !count(inPeriod.improved) || !count(inPeriod.comparable) || inPeriod.improved > inPeriod.comparable)) return;
  const sparks = "sparks" in v ? parseSparks(v.sparks) : null;
  if (sparks === undefined) return;
  const period = parseProgressPeriod(v.period);
  const evolution = list(v.evolution, parseRow), changes = list(v.changes, parseFinding);
  const nutrition = section(v.nutrition, parseNutrition);
  const metrics = section(v.metrics, d => {
    if (!record(d) || !keys(d, ["items"])) return;
    const items = list(d.items, parseHabit);
    return items ? { items } : undefined;
  });
  const body = section(v.body, d => record(d) && keys(d, ["excludedSuspect", "trackedMetrics"]) && count(d.excludedSuspect) && count(d.trackedMetrics)
    ? { excludedSuspect: d.excludedSuspect, trackedMetrics: d.trackedMetrics } : undefined);
  const training = section(v.training, parseTrainingSummary);
  if (!period || period.end > v.today || !evolution || !changes || changes.length > 3 || !nutrition || !metrics || !body || !training) return;
  // At most 2 findings per domain.
  const perDomain = new Map<string, number>();
  for (const f of changes) perDomain.set(f.domain, (perDomain.get(f.domain) ?? 0) + 1);
  if ([...perDomain.values()].some(n => n > 2)) return;
  return { today: v.today, period, evolution, changes, nutrition, metrics, body, training, ...(sparks ? { sparks } : {}), ...("inPeriod" in v ? { inPeriod: inPeriod as ProgressOverview["inPeriod"] } : {}) };
}

const COMPARISON_KEYS = ["sessions", "trainingDays", "sets", "minutes", "setsPerSession"] as const;
export function parseTrainingSummary(v: unknown): ProgressTrainingSummary | undefined {
  if (!record(v) || !keys(v, ["sessions", "trainingDays", "sets", "minutes", "sessionsPerWeek", "comparisons", "performance"])
    || !count(v.sessions) || !count(v.trainingDays) || !count(v.sets) || !count(v.minutes) || !numOrNull(v.sessionsPerWeek)
    || v.trainingDays > v.sessions || !record(v.comparisons) || !keys(v.comparisons, COMPARISON_KEYS)) return;
  const comparisons = Object.fromEntries(COMPARISON_KEYS.map(k => [k, parseProgressComparison((v.comparisons as Record<string, unknown>)[k])]));
  if (Object.values(comparisons).some(c => c === undefined)) return;
  const p = v.performance;
  if (!record(p) || !keys(p, ["improved", "stable", "declined", "comparable", "insufficient", "headline"]) || !count(p.improved) || !count(p.stable)
    || !count(p.declined) || !count(p.comparable) || !count(p.insufficient) || !str(p.headline) || p.improved + p.stable + p.declined !== p.comparable) return;
  return { ...(v as ProgressTrainingSummary), comparisons: comparisons as ProgressTrainingSummary["comparisons"] };
}
const PERFORMANCE_STATUSES = ["improved", "stable", "declined", "insufficient_data"];
function parseSignal(v: unknown): TrainingSignal | null | undefined {
  if (v === null) return null;
  if (!record(v) || !keys(v, ["kind", "description", "currentValue", "referenceValue", "contextValue"]) || !str(v.kind) || !str(v.description)
    || !numOrNull(v.currentValue) || !numOrNull(v.referenceValue) || !numOrNull(v.contextValue)) return;
  return v as TrainingSignal;
}
function parseTrainingExercise(v: unknown): ProgressTrainingExercise | undefined {
  if (!record(v) || !keys(v, ["id", "name", "muscleLabel", "weightMode", "status", "reason", "signal", "isPersonalRecord", "sessions", "sets", "lastDate"])
    || !str(v.id) || !str(v.name) || !str(v.muscleLabel) || !strOrNull(v.weightMode) || !PERFORMANCE_STATUSES.includes(String(v.status)) || !str(v.reason)
    || typeof v.isPersonalRecord !== "boolean" || !count(v.sessions) || !count(v.sets) || (v.lastDate !== null && !isNutritionDate(v.lastDate))) return;
  const signal = parseSignal(v.signal);
  // Insufficient data never carries a signal; a PR is always an improvement with evidence.
  if (signal === undefined || (v.status === "insufficient_data" && signal !== null) || (v.isPersonalRecord && (v.status !== "improved" || !signal))) return;
  return { ...(v as ProgressTrainingExercise), signal };
}
function parseTrainingInPeriod(v: unknown, period: ProgressPeriod, trained: ProgressTrainingExercise[]): ProgressTrainingInPeriod | undefined {
  if (!record(v) || !keys(v, ["improved", "stable", "declined", "insufficient", "exercises"]) || ![v.improved, v.stable, v.declined, v.insufficient].every(count)) return;
  const exercises = list(v.exercises, e => {
    if (!record(e) || !keys(e, ["id", "status", "reason", "sessions", "firstDate", "lastDate", "signal"]) || !str(e.id) || !PERFORMANCE_STATUSES.includes(String(e.status)) || !str(e.reason) || !count(e.sessions) || e.sessions < 2 || !isNutritionDate(e.firstDate) || !isNutritionDate(e.lastDate) || e.firstDate > e.lastDate || e.firstDate < period.start || e.lastDate > period.end) return;
    const signal = parseSignal(e.signal);
    if (signal === undefined || (e.status === "insufficient_data" && signal !== null) || !trained.some(t => t.id === e.id && t.sessions === e.sessions)) return;
    return { ...e, signal } as ProgressTrainingInPeriod["exercises"][number];
  });
  if (!exercises || new Set(exercises.map(e => e.id)).size !== exercises.length) return;
  if ((v.improved as number) + (v.stable as number) + (v.declined as number) + (v.insufficient as number) !== exercises.length) return;
  for (const [countKey, status] of [["improved", "improved"], ["stable", "stable"], ["declined", "declined"], ["insufficient", "insufficient_data"]]) if (v[countKey] !== exercises.filter(e => e.status === status).length) return;
  return { improved: v.improved as number, stable: v.stable as number, declined: v.declined as number, insufficient: v.insufficient as number, exercises };
}
export function parseProgressTraining(v: unknown): ProgressTraining | undefined {
  if (!record(v) || !keys(v, ["today", "period", "summary", "series", "exercises", "personalRecords", "feelings", "muscles", "routines", ...("inPeriod" in v ? ["inPeriod"] : [])]) || !isNutritionDate(v.today)) return;
  const period = parseProgressPeriod(v.period), summary = parseTrainingSummary(v.summary);
  const series = list(v.series, p => record(p) && keys(p, ["start", "end", "sessions", "sets", "minutes"]) && isNutritionDate(p.start) && isNutritionDate(p.end)
    && count(p.sessions) && count(p.sets) && count(p.minutes) ? p as ProgressTraining["series"][number] : undefined);
  const exercises = list(v.exercises, parseTrainingExercise);
  const personalRecords = list(v.personalRecords, p => record(p) && keys(p, ["exerciseId", "name", "description"]) && str(p.exerciseId) && str(p.name) && str(p.description)
    ? p as ProgressTraining["personalRecords"][number] : undefined);
  const feelings = list(v.feelings, f => record(f) && keys(f, ["key", "label", "average", "scaleMaximum", "registered", "eligible", "ratio"])
    && ["energy", "performance", "pain"].includes(String(f.key)) && str(f.label) && num(f.average) && (f.scaleMaximum === 5 || f.scaleMaximum === 10)
    && count(f.registered) && f.registered >= 1 && count(f.eligible) && f.registered <= f.eligible && num(f.ratio) ? f as ProgressTrainingFeeling : undefined);
  const muscles = list(v.muscles, m => record(m) && keys(m, ["key", "label", "sets", "sessions", "exercises"]) && str(m.key) && str(m.label) && count(m.sets)
    && count(m.sessions) && count(m.exercises) ? m as ProgressTraining["muscles"][number] : undefined);
  const routines = list(v.routines, r => record(r) && keys(r, ["id", "name", "sessions", "sets", "minutes"]) && str(r.id) && str(r.name) && count(r.sessions)
    && count(r.sets) && count(r.minutes) ? r as ProgressTraining["routines"][number] : undefined);
  if (!period || !summary || !series || !exercises || !personalRecords || !feelings || !muscles || !routines) return;
  if (series.reduce((t, p) => t + p.sessions, 0) !== summary.sessions || series.reduce((t, p) => t + p.sets, 0) !== summary.sets) return;
  const inPeriod = "inPeriod" in v ? parseTrainingInPeriod(v.inPeriod, period, exercises) : undefined;
  if ("inPeriod" in v && !inPeriod) return;
  return { today: v.today, period, summary, series, exercises, personalRecords, feelings, muscles, routines, ...(inPeriod ? { inPeriod } : {}) };
}
export function parseProgressTrainingExercise(v: unknown): ProgressTrainingExerciseDetail | undefined {
  if (!record(v) || !keys(v, ["today", "period", "exercise", "performance", "comparisons", "marks", "chart", "sessions"]) || !isNutritionDate(v.today)) return;
  const period = parseProgressPeriod(v.period);
  const e = v.exercise, p = v.performance, c = v.comparisons;
  if (!period || !record(e) || !keys(e, ["id", "name", "muscleLabel", "weightMode"]) || !str(e.id) || !str(e.name) || !str(e.muscleLabel) || !strOrNull(e.weightMode)) return;
  if (!record(p) || !keys(p, ["status", "reason", "signal", "isPersonalRecord", "primarySamples", "referenceSamples"]) || !PERFORMANCE_STATUSES.includes(String(p.status))
    || !str(p.reason) || typeof p.isPersonalRecord !== "boolean" || !count(p.primarySamples) || !count(p.referenceSamples)) return;
  const signal = parseSignal(p.signal);
  if (signal === undefined || !record(c) || !keys(c, ["sessions", "sets"])) return;
  const sessionsCmp = parseProgressComparison(c.sessions), setsCmp = parseProgressComparison(c.sets);
  const marks = list(v.marks, m => record(m) && keys(m, ["kind", "label", "value", "unit", "context", "date"]) && ["best_load", "best_reps", "best_time"].includes(String(m.kind))
    && str(m.label) && num(m.value) && ["kg", "lingotes", "reps", "s"].includes(String(m.unit)) && strOrNull(m.context) && isNutritionDate(m.date) ? m as ProgressExerciseMark : undefined);
  const sessions = list(v.sessions, s => record(s) && keys(s, ["sessionId", "date", "routineName", "sets"]) && str(s.sessionId) && isNutritionDate(s.date) && str(s.routineName)
    && Array.isArray(s.sets) && s.sets.every(x => record(x) && keys(x, ["reps", "weightKg"]) && numOrNull(x.reps) && numOrNull(x.weightKg))
    ? s as ProgressTrainingExerciseDetail["sessions"][number] : undefined);
  let chart: ProgressTrainingExerciseDetail["chart"] | undefined = null;
  if (v.chart !== null) {
    const ch = v.chart;
    const points = record(ch) ? list(ch.points, x => record(x) && keys(x, ["date", "sessionId", "value", "context"]) && isNutritionDate(x.date) && str(x.sessionId)
      && num(x.value) && numOrNull(x.context) ? x as { date: string; sessionId: string; value: number; context: number | null } : undefined) : undefined;
    chart = record(ch) && keys(ch, ["kind", "unit", "points"]) && ["load", "reps", "time"].includes(String(ch.kind)) && ["kg", "lingotes", "reps", "s"].includes(String(ch.unit)) && points
      && !points.some((x, i) => i > 0 && x.date < points[i - 1].date) ? { kind: ch.kind as ProgressExerciseChartKind, unit: ch.unit as "kg", points } : undefined;
  }
  if (!sessionsCmp || !setsCmp || !marks || !sessions || chart === undefined) return;
  return { today: v.today, period, exercise: e as ProgressTrainingExerciseDetail["exercise"],
    performance: { ...(p as ProgressTrainingExerciseDetail["performance"]), signal }, comparisons: { sessions: sessionsCmp, sets: setsCmp }, marks, chart, sessions };
}

function parseObservation(v: unknown): BodyObservationDto | undefined {
  if (!record(v) || !keys(v, ["date", "value", "imported", "provenanceLabel"]) || !isNutritionDate(v.date) || !num(v.value)
    || typeof v.imported !== "boolean" || !str(v.provenanceLabel)) return;
  return v as BodyObservationDto;
}
const obsOrNull = (v: unknown) => v === null ? null : parseObservation(v);
function parseBodyMetric(v: unknown): ProgressBodyMetric | undefined {
  if (!record(v) || !keys(v, ["key", "label", "unit", "latest", "first", "last", "change", "referenceChange", "trend", "confidence",
    "observations", "referenceCount", "comparison"]) || !str(v.key) || !str(v.label) || (v.unit !== "kg" && v.unit !== "cm")
    || !numOrNull(v.change) || !numOrNull(v.referenceChange) || !["increased", "decreased", "stable", "variable", "unavailable"].includes(String(v.trend))
    || !["unavailable", "limited", "supported"].includes(String(v.confidence)) || !count(v.referenceCount)
    || !record(v.comparison) || !keys(v.comparison, ["status", "reason"]) || !STATUSES.includes(String(v.comparison.status)) || !str(v.comparison.reason)) return;
  const latest = obsOrNull(v.latest), first = obsOrNull(v.first), last = obsOrNull(v.last), observations = list(v.observations, parseObservation);
  if (latest === undefined || first === undefined || last === undefined || !observations) return;
  // Chronological, and the summary must describe exactly these observations.
  if (observations.some((o, i) => i > 0 && o.date < observations[i - 1].date)) return;
  if ((observations.length > 0) !== (first !== null && last !== null)) return;
  if ((v.change !== null) !== (observations.length >= 2)) return;
  if (observations.length < 2 && v.trend !== "unavailable") return;
  return { ...(v as ProgressBodyMetric), latest, first, last, observations };
}
export function parseProgressBody(v: unknown): ProgressBody | undefined {
  if (!record(v) || !keys(v, ["today", "period", "excludedSuspect", "metrics"]) || !isNutritionDate(v.today) || !count(v.excludedSuspect)) return;
  const period = parseProgressPeriod(v.period), metrics = list(v.metrics, parseBodyMetric);
  return period && metrics ? { today: v.today, period, excludedSuspect: v.excludedSuspect, metrics } : undefined;
}

function parseDefinition(v: unknown): ProgressMetricDefinition | undefined {
  if (!record(v) || !keys(v, ["id", "systemKey", "name", "unit", "valueType", "isActive", "currentTarget"]) || !str(v.id) || !strOrNull(v.systemKey)
    || !str(v.name) || !strOrNull(v.unit) || !VALUE_TYPES.includes(String(v.valueType)) || typeof v.isActive !== "boolean" || !numOrNull(v.currentTarget)) return;
  return v as ProgressMetricDefinition;
}
function parseSummary(v: unknown): ProgressMetricSummary | undefined {
  if (!record(v) || !keys(v, ["average", "median", "minimum", "maximum", "registeredDays", "eligibleDays", "coverageRatio", "trendDelta", "trendPercentDelta"])
    || !numOrNull(v.average) || !numOrNull(v.median) || !numOrNull(v.minimum) || !numOrNull(v.maximum) || !count(v.registeredDays) || !count(v.eligibleDays)
    || !numOrNull(v.coverageRatio) || !numOrNull(v.trendDelta) || !numOrNull(v.trendPercentDelta)) return;
  if ((v.average === null) !== (v.registeredDays === 0)) return;
  return v as ProgressMetricSummary;
}
function parsePoint(v: unknown): ProgressSeriesPoint | undefined {
  if (!record(v) || !keys(v, ["start", "end", "value", "samples"]) || !isNutritionDate(v.start) || !isNutritionDate(v.end) || v.start > v.end
    || !numOrNull(v.value) || !count(v.samples) || ((v.value === null) !== (v.samples === 0))) return;
  return v as ProgressSeriesPoint;
}
export function parseProgressMetrics(v: unknown): ProgressMetrics | undefined {
  if (!record(v) || !keys(v, ["today", "period", "definitions", "metric", "summary", "previous", "comparison", "series"]) || !isNutritionDate(v.today)) return;
  const period = parseProgressPeriod(v.period), definitions = list(v.definitions, parseDefinition), series = list(v.series, parsePoint);
  if (!period || !definitions || !series) return;
  if (v.metric === null) {
    return v.summary === null && v.previous === null && v.comparison === null && series.length === 0
      ? { today: v.today, period, definitions, metric: null, summary: null, previous: null, comparison: null, series } : undefined;
  }
  const metric = parseDefinition(v.metric), summary = parseSummary(v.summary), comparison = parseProgressComparison(v.comparison);
  const previous = record(v.previous) && keys(v.previous, ["average", "registeredDays", "eligibleDays"]) && numOrNull(v.previous.average)
    && count(v.previous.registeredDays) && count(v.previous.eligibleDays) ? v.previous as ProgressMetrics["previous"] : undefined;
  if (!metric || !summary || !comparison || !previous || !definitions.some(d => d.id === metric.id)) return;
  if (series.some((p, i) => i > 0 && p.start <= series[i - 1].end)) return;
  return { today: v.today, period, definitions, metric, summary, previous, comparison, series };
}
