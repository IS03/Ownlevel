import "server-only";
import { readAllDailyMetricValues } from "@/lib/daily-metrics/reports";
import { buildNutritionReportDays, type NutritionReportDay, type NutritionReportRange } from "@/lib/nutrition/reports-core";
import { buildSessionRecords, type SessionRecord } from "@/lib/phase2/training-analysis";
import { loadCompletedTrainingData } from "@/lib/phase2/training-robust";
import { addProgressIsoDays, bucketProgressRange, progressBucketForDays, progressRangeDays } from "@/lib/progress/analytics";
import { MobileApiNotFoundError, MobileApiValidationError } from "./auth";
import { readMobileNutritionFacts } from "./nutrition-report-server";
import type { MetricValueType, ProgressPeriod } from "./progress-contract";
import {
  exploreAggregation, type ExploreBreakdown, type ExploreDays, type ExploreGroup, type ExploreMeasure, type ExploreResult, type ProgressExplore,
} from "./progress-explore-contract";
import { readMealRows, type MealRow } from "./progress-nutrition-timing";
import { bodyReport, comparisonDto, webAuth } from "./progress-sources";
import { loadTrainingContext, trainingExerciseDto } from "./progress-training";
import type { MobileSupabaseAuthenticatedContext } from "./supabase";

type Context = MobileSupabaseAuthenticatedContext;
type Range = { start: string; end: string };
export type ExploreInput = { measure: ExploreMeasure; breakdown: ExploreBreakdown | null; days: ExploreDays | null; series: boolean };

const WEEKDAYS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
const MOMENTS: [string, string][] = [["breakfast", "Desayuno"], ["lunch", "Almuerzo"], ["snack", "Merienda"], ["dinner", "Cena"], ["extra", "Extra"]];
const BANDS: [string, string][] = [["morning", "Mañana · 5–11"], ["midday", "Mediodía · 11–15"], ["afternoon", "Tarde · 15–20"], ["night", "Noche · 20–5"]];
const NUTRITION: Record<string, { label: string; unit: string; valueType: MetricValueType; day: (d: NutritionReportDay) => number | null; meal: (m: MealRow) => number | null }> = {
  "nutrition.kcal": { label: "Calorías", unit: "kcal", valueType: "integer", day: d => d.calories, meal: m => m.kcal },
  "nutrition.protein": { label: "Proteína", unit: "g", valueType: "decimal", day: d => d.proteinG, meal: m => m.proteinG },
  "nutrition.carbs": { label: "Carbohidratos", unit: "g", valueType: "decimal", day: d => d.carbsG, meal: m => m.carbsG },
  "nutrition.fat": { label: "Grasas", unit: "g", valueType: "decimal", day: d => d.fatG, meal: m => m.fatG },
};
const TRAINING: Record<string, { label: string; unit: string; valueType: MetricValueType }> = {
  "training.sets": { label: "Series", unit: "series", valueType: "integer" },
  "training.sessions": { label: "Sesiones", unit: "sesiones", valueType: "integer" },
  "training.minutes": { label: "Duración", unit: "min", valueType: "duration" },
};

const dates = (r: Range) => { const out: string[] = []; for (let d = r.start; d <= r.end; d = addProgressIsoDays(d, 1)) out.push(d); return out; };
const weekdayOf = (d: string) => (new Date(`${d}T12:00:00Z`).getUTCDay() + 6) % 7;
const mean = (xs: number[]) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
const total = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const bucketsOf = (r: Range) => bucketProgressRange(r, progressBucketForDays(progressRangeDays(r)));
const inBucket = (b: Range, d: string) => d >= b.start && d <= b.end;

/** The day filter: training = a completed session; work comes from the day's snapshot (unknown work = in neither group). */
type Flags = { training: Set<string>; work: Map<string, boolean | null> };
const allows = (days: ExploreDays | null, f: Flags) => (d: string) => days === null ? true
  : days === "training" ? f.training.has(d) : days === "rest" ? !f.training.has(d) : days === "work" ? f.work.get(d) === true : f.work.get(d) === false;

/** Training: a sum where 0 is real. Weekday = average per occurrence of that weekday. */
function trainingResult(records: SessionRecord[], input: ExploreInput, eligible: string[], range: Range): ExploreResult {
  const key = input.measure.key;
  const ok = new Set(eligible), recs = records.filter(r => ok.has(r.logDate));
  const amount = (r: SessionRecord, ex?: SessionRecord["exercises"][number]) =>
    key === "training.sessions" ? 1 : key === "training.minutes" ? r.minutes : ex ? ex.sets.length : total(r.exercises.map(e => e.sets.length));
  const contribs = (r: SessionRecord): { key: string; label: string; amount: number }[] => {
    if (input.breakdown === "routine") return [{ key: r.routineId ?? "free", label: r.routineName, amount: amount(r) }];
    if (input.breakdown === "muscle" || input.breakdown === "exercise") {
      const by = new Map<string, { label: string; amount: number }>();
      for (const ex of r.exercises) {
        if (!ex.sets.length) continue;
        const k = input.breakdown === "muscle" ? ex.muscleKey : ex.id, label = input.breakdown === "muscle" ? ex.muscleLabel : ex.name;
        const cur = by.get(k) ?? { label, amount: 0 };
        cur.amount = key === "training.sessions" ? 1 : cur.amount + amount(r, ex);
        by.set(k, cur);
      }
      return [...by].map(([k, v]) => ({ key: k, ...v }));
    }
    return [];
  };
  const buckets = bucketsOf(range);
  const seriesOf = (pick: (r: SessionRecord) => number) => input.series ? buckets.map(b => ({ ...b, value: eligible.some(d => inBucket(b, d)) ? total(recs.filter(r => inBucket(b, r.logDate)).map(pick)) : null })) : null;
  let groups: ExploreGroup[] = [];
  if (input.breakdown === "weekday") {
    groups = WEEKDAYS.map((label, w) => {
      const wd = eligible.filter(d => weekdayOf(d) === w), mine = recs.filter(r => weekdayOf(r.logDate) === w);
      return { key: String(w + 1), label, value: wd.length ? total(mine.map(r => amount(r))) / wd.length : null,
        coverage: { days: new Set(mine.map(r => r.logDate)).size, eligible: wd.length }, series: null };
    });
  } else if (input.breakdown) {
    const by = new Map<string, { label: string; amount: number; days: Set<string> }>();
    for (const r of recs) for (const c of contribs(r)) {
      const cur = by.get(c.key) ?? { label: c.label, amount: 0, days: new Set<string>() };
      cur.amount += c.amount; cur.days.add(r.logDate); by.set(c.key, cur);
    }
    groups = [...by].sort(([, a], [, b]) => b.amount - a.amount || a.label.localeCompare(b.label, "es-AR")).map(([k, g]) => ({
      key: k, label: g.label, value: g.amount, coverage: { days: g.days.size, eligible: eligible.length },
      series: seriesOf(r => total(contribs(r).filter(c => c.key === k).map(c => c.amount))),
    }));
  }
  return { value: total(recs.map(r => amount(r))), change: null, coverage: { days: new Set(recs.map(r => r.logDate)).size, eligible: eligible.length },
    unassigned: 0, groups, series: seriesOf(r => amount(r)) };
}

/** Averages per day with data (nutrition, metrics). By moment or time band: per data day, a missing moment counts 0 (that meal did not exist). */
function averageResult(value: Map<string, number>, input: ExploreInput, eligible: string[], range: Range, meals?: MealRow[], mealValue?: (m: MealRow) => number | null): ExploreResult {
  const data = eligible.filter(d => value.has(d));
  const buckets = bucketsOf(range);
  const avgSeries = (pick: (d: string) => number) => input.series ? buckets.map(b => { const ds = data.filter(d => inBucket(b, d)); return { ...b, value: ds.length ? mean(ds.map(pick)) : null }; }) : null;
  let groups: ExploreGroup[] = [], unassigned = 0;
  if (input.breakdown === "weekday") {
    groups = WEEKDAYS.map((label, w) => {
      const ds = data.filter(d => weekdayOf(d) === w);
      return { key: String(w + 1), label, value: mean(ds.map(d => value.get(d)!)), coverage: { days: ds.length, eligible: eligible.filter(d => weekdayOf(d) === w).length }, series: null };
    });
  } else if ((input.breakdown === "meal_moment" || input.breakdown === "time_band") && meals && mealValue) {
    const dataSet = new Set(data), keyOf = (m: MealRow) => input.breakdown === "meal_moment" ? m.mealLabel : m.band;
    const onData = meals.filter(m => dataSet.has(m.logDate));
    unassigned = onData.filter(m => !keyOf(m)).length;
    const sumOn = (k: string, d: string) => total(onData.filter(m => m.logDate === d && keyOf(m) === k).map(m => mealValue(m) ?? 0));
    groups = (input.breakdown === "meal_moment" ? MOMENTS : BANDS).map(([k, label]) => ({
      key: k, label, value: data.length ? total(data.map(d => sumOn(k, d))) / data.length : null,
      coverage: { days: new Set(onData.filter(m => keyOf(m) === k).map(m => m.logDate)).size, eligible: data.length },
      series: avgSeries(d => sumOn(k, d)),
    }));
  }
  return { value: mean(data.map(d => value.get(d)!)), change: null, coverage: { days: data.length, eligible: eligible.length }, unassigned, groups, series: avgSeries(d => value.get(d)!) };
}

/** Records in time (body points, exercise sessions): latest (body) or best (exercise) per bucket; never interpolated. */
function pointsResult(points: { date: string; value: number }[], input: ExploreInput, range: Range, how: "latest" | "best"): ExploreResult {
  const pick = (ps: { value: number }[]) => !ps.length ? null : how === "latest" ? ps[ps.length - 1].value : Math.max(...ps.map(p => p.value));
  return {
    value: pick(points), change: points.length >= 2 ? points[points.length - 1].value - points[0].value : null,
    coverage: { days: new Set(points.map(p => p.date)).size, eligible: progressRangeDays(range) }, unassigned: 0, groups: [],
    series: input.series ? bucketsOf(range).map(b => ({ ...b, value: pick(points.filter(p => inBucket(b, p.date))) })) : null,
  };
}

/** Explorar (stage 2, step 1): one read per source, reusing the existing Progress reads; no new SQL. */
export async function buildMobileProgressExplore(context: Context, input: ExploreInput, range: NutritionReportRange, period: ProgressPeriod, comparing: boolean, today: string): Promise<ProgressExplore> {
  const m = input.measure;
  const ranges: Range[] = [range, ...(comparing ? [{ start: period.previousStart, end: period.previousEnd }] : [])];
  const head = (label: string, unit: string | null, valueType: MetricValueType) =>
    ({ key: m.key, label, unit, valueType, aggregation: exploreAggregation(m), derived: m.kind === "exercise" && m.stat === "e1rm" });
  const done = (measure: ProgressExplore["measure"], results: ExploreResult[]): ProgressExplore =>
    ({ today, period, measure, breakdown: input.breakdown, days: input.days, series: input.series, current: results[0], reference: results[1] ?? null });

  if (m.kind === "body") {
    const body = await bodyReport(context, range, period);
    const metric = body.report.metrics.find(x => x.key === m.key && body.available.has(x.key));
    if (!metric) throw new MobileApiValidationError("Medida no disponible.");
    const pts = (obs: typeof metric.current) => obs.map(o => ({ date: o.date, value: o.value }));
    return done(head(metric.label, metric.unit, "decimal"), [pointsResult(pts(metric.current), input, range, "latest"), ...(comparing ? [pointsResult(pts(metric.reference), input, ranges[1], "latest")] : [])]);
  }
  if (m.kind === "exercise") {
    const ctx = await loadTrainingContext(webAuth(context), period, today);
    const dto = trainingExerciseDto(ctx, m.exerciseId, today, period, comparisonDto, true, comparing);
    if (!dto?.charts) throw new MobileApiNotFoundError();
    const keyFor = m.stat === "e1rm" ? ["estimated_1rm"] : ["best_set", "best_time"];
    const chart = dto.charts.measures.find(x => keyFor.includes(x.key));
    if (!chart) throw new MobileApiValidationError(m.stat === "e1rm" ? "El 1RM estimado solo existe para ejercicios con carga en kg." : "Este modo de carga no tiene una medida comparable.");
    const label = `${dto.exercise.name} · ${m.stat === "e1rm" ? "1RM estimado" : chart.label}`;
    return done(head(label, chart.unit, "decimal"), [pointsResult(chart.points, input, range, "best"), ...(comparing ? [pointsResult(chart.reference ?? [], input, ranges[1], "best")] : [])]);
  }

  // Sources for the day filter are read only when needed.
  const needTraining = m.kind === "training" || input.days === "training" || input.days === "rest";
  const needDays = m.kind === "nutrition" || input.days === "work" || input.days === "off";
  const auth = webAuth(context);
  const [source, nutritionDays] = await Promise.all([
    needTraining ? loadCompletedTrainingData(auth) : Promise.resolve(null),
    needDays ? Promise.all(ranges.map(async r => buildNutritionReportDays({ range: r, today, ...(await readMobileNutritionFacts(context, r, today)) }))) : Promise.resolve(null),
  ]);
  const records = ranges.map(r => source ? buildSessionRecords(source, r) : []);
  const flags = (i: number): Flags => ({
    training: new Set(records[i].map(r => r.logDate)),
    work: new Map((nutritionDays?.[i] ?? []).map(d => [d.date, d.workEffective])),
  });
  // An average never counts today while it is in progress; a sum does (what you trained today is real).
  const eligibleOf = (i: number, average: boolean) => dates(ranges[i]).filter(allows(input.days, flags(i))).filter(d => !(average && d === today));

  if (m.kind === "training") {
    const meta = TRAINING[m.key];
    return done(head(meta.label, meta.unit, meta.valueType), ranges.map((r, i) => trainingResult(records[i], input, eligibleOf(i, false), r)));
  }
  if (m.kind === "nutrition") {
    const meta = NUTRITION[m.key];
    const meals = input.breakdown === "meal_moment" || input.breakdown === "time_band" ? await Promise.all(ranges.map(r => readMealRows(context, r))) : null;
    return done(head(meta.label, meta.unit, meta.valueType), ranges.map((r, i) => {
      const value = new Map(nutritionDays![i].filter(d => d.hasNutrition && d.isComplete && meta.day(d) !== null).map(d => [d.date, meta.day(d)!]));
      return averageResult(value, input, eligibleOf(i, true), r, meals?.[i], meta.meal);
    }));
  }
  // Metric: average per day with a value; a recorded 0 counts.
  const { data: defs, error } = await auth.supabase.from("user_metrics").select("id,name,unit,value_type").eq("user_id", auth.userId);
  if (error) throw new Error("Metric definitions unavailable", { cause: error });
  const def = (defs ?? []).find(d => d.id === m.metricId);
  if (!def) throw new MobileApiValidationError("Métrica no válida.");
  const start = ranges.map(r => r.start).sort()[0], end = ranges.map(r => r.end).sort().at(-1)!;
  const rows = (await readAllDailyMetricValues(auth.supabase, auth.userId, start, end)).filter(r => String(r.metric_id) === m.metricId);
  const values = new Map(rows.map(r => [String(r.metric_date), Number(r.value)] as const).filter(([, v]) => Number.isFinite(v)));
  const valueType = (["integer", "decimal", "duration"].includes(def.value_type) ? def.value_type : "decimal") as MetricValueType;
  return done(head(def.name, def.unit ?? null, valueType), ranges.map((r, i) => {
    const inRange = new Map([...values].filter(([d]) => d >= r.start && d <= r.end));
    return averageResult(inRange, input, eligibleOf(i, true), r);
  }));
}
