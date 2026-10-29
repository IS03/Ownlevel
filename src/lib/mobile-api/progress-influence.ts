import "server-only";
import { SYSTEM_METRIC_KEYS, type SystemMetricKey } from "@/lib/daily-metrics/core";
import { readAllDailyMetricValues } from "@/lib/daily-metrics/reports";
import { buildNutritionReportDays, NUTRITION_REPORT_MAX_DAYS } from "@/lib/nutrition/reports-core";
import { todayInCordoba } from "@/lib/phase2/cordoba-date";
import { buildSessionRecords } from "@/lib/phase2/training-analysis";
import { loadCompletedTrainingData } from "@/lib/phase2/training-robust";
import { addProgressIsoDays } from "@/lib/progress/analytics";
import { MobileApiValidationError } from "./auth";
import { NutritionReportDayChangedError, readMobileNutritionFacts } from "./nutrition-report-server";
import type { ProgressPeriod } from "./progress-contract";
import { NUTRITION, TRAINING } from "./progress-explore";
import {
  parseInfluenceMeasure, type InfluenceDefinition, type InfluenceMeasureInfo, type InfluenceReading,
  type InfluenceSuggestedKey, type ProgressInfluence, type ProgressInfluenceSuggested,
} from "./progress-influence-contract";
import { calculateInfluence, influenceDates } from "./progress-influence-model";
import { webAuth } from "./progress-sources";
import type { MobileSupabaseAuthenticatedContext } from "./supabase";

type Context = MobileSupabaseAuthenticatedContext;
type Range = { start: string; end: string };
type MetricDefinition = { id: string; name: string; unit: string | null; value_type: "integer" | "decimal" | "duration";
  system_key: string | null; is_active: boolean; archived_at: string | null };

async function definitions(context: Context): Promise<MetricDefinition[]> {
  const { data, error } = await webAuth(context).supabase.from("user_metrics")
    .select("id,name,unit,value_type,system_key,is_active,archived_at").eq("user_id", context.userId);
  if (error || !data) throw new Error("Metric definitions unavailable");
  return data as MetricDefinition[];
}

/** Union the requested windows, then respect the canonical facts RPC's 366-day limit (including the lag tail).
 * Each chunk is shared by every suggested question, never read again for individual questions. */
export function influenceReadRanges(ranges: Range[], lag: number, today: string): Range[] {
  const merged: Range[] = [];
  for (const r of ranges.map(r => ({ start: r.start, end: [addProgressIsoDays(r.end, lag), today].sort()[0] })).sort((a, b) => a.start.localeCompare(b.start))) {
    const last = merged.at(-1);
    if (last && r.start <= addProgressIsoDays(last.end, 1)) last.end = [last.end, r.end].sort().at(-1)!;
    else merged.push({ ...r });
  }
  return merged.flatMap(r => {
    const chunks: Range[] = [];
    for (let start = r.start; start <= r.end;) {
      const end = [addProgressIsoDays(start, NUTRITION_REPORT_MAX_DAYS - 1), r.end].sort()[0];
      chunks.push({ start, end }); start = addProgressIsoDays(end, 1);
    }
    return chunks;
  });
}

async function readSources(context: Context, ds: InfluenceDefinition[], defs: MetricDefinition[], ranges: Range[], today: string) {
  const measures = new Set(ds.flatMap(d => [d.split, d.outcome]));
  for (const key of measures) {
    const m = parseInfluenceMeasure(key, "split")!;
    if (m.kind === "metric" && !defs.some(d => d.id === m.metricId)) throw new MobileApiValidationError("Métrica no válida.");
  }
  const windows = influenceReadRanges(ranges, Math.max(0, ...ds.map(d => d.lag)), today);
  const span = { start: windows[0].start, end: windows.at(-1)!.end };
  const needTraining = [...measures].some(k => k.startsWith("training.") || k === "day.training");
  const needNutrition = [...measures].some(k => k.startsWith("nutrition.") || k === "day.work");
  const needMetrics = [...measures].some(k => k.startsWith("metric."));
  const auth = webAuth(context);
  const [training, days, metricRows] = await Promise.all([
    needTraining ? loadCompletedTrainingData(auth) : null,
    needNutrition ? Promise.all(windows.map(async range => buildNutritionReportDays({ range, today, ...await readMobileNutritionFacts(context, range, today) }))).then(ds => ds.flat()) : [],
    needMetrics ? readAllDailyMetricValues(auth.supabase, auth.userId, span.start, span.end) : [],
  ]);
  const records = training ? buildSessionRecords(training, span) : [];
  const trainingDays = new Set(records.map(r => r.logDate));
  const maps = new Map<string, Map<string, number | boolean>>();
  const metadata = new Map<string, InfluenceMeasureInfo>();
  for (const key of measures) {
    const m = parseInfluenceMeasure(key, "split")!;
    let values = new Map<string, number | boolean>();
    if (m.kind === "nutrition") {
      const meta = NUTRITION[key];
      metadata.set(key, { key, label: meta.label, unit: meta.unit, valueType: meta.valueType });
      values = new Map(days.filter(d => d.hasNutrition && d.isComplete && meta.day(d) !== null).map(d => [d.date, meta.day(d)!]));
    } else if (m.kind === "training") {
      metadata.set(key, { key, ...TRAINING[key] });
      for (const day of influenceDates(span)) values.set(day, 0);
      for (const r of records) {
        const n = key === "training.sessions" ? 1 : key === "training.minutes" ? r.minutes : r.exercises.reduce((sum, e) => sum + e.sets.length, 0);
        values.set(r.logDate, Number(values.get(r.logDate)) + n);
      }
    } else if (m.kind === "day") {
      metadata.set(key, { key, label: key === "day.training" ? "Día de entrenamiento" : "Día laboral", unit: null, valueType: "boolean" });
      values = key === "day.training" ? new Map(influenceDates(span).map(d => [d, trainingDays.has(d)]))
        : new Map(days.filter(d => d.workEffective !== null).map(d => [d.date, d.workEffective!]));
    } else {
      const def = defs.find(d => d.id === m.metricId)!;
      metadata.set(key, { key, label: def.name, unit: def.unit, valueType: def.value_type });
      for (const row of metricRows) {
        // null/empty are missing, never a coerced zero. The canonical reader preserves numeric strings.
        if (row.metric_id === m.metricId && row.value !== null && row.value !== "" && Number.isFinite(Number(row.value))) values.set(String(row.metric_date), Number(row.value));
      }
    }
    maps.set(key, values);
  }
  const after = todayInCordoba();
  if (after !== today) throw new NutritionReportDayChangedError(after);
  return {
    info: (key: string) => metadata.get(key)!,
    values: (key: string, outcome = false) => {
      const values = maps.get(key)!;
      return outcome && key.startsWith("training.") ? new Map([...values].filter(([d]) => trainingDays.has(d))) : values;
    },
  };
}

async function readings(context: Context, ds: InfluenceDefinition[], defs: MetricDefinition[], period: ProgressPeriod, comparing: boolean, today: string): Promise<InfluenceReading[]> {
  if (!ds.length) return [];
  const ranges = [{ start: period.start, end: period.end }, ...(comparing ? [{ start: period.previousStart, end: period.previousEnd }] : [])];
  const source = await readSources(context, ds, defs, ranges, today);
  return ds.map(definition => {
    const results = ranges.map(r => calculateInfluence(r, today, definition, source.values(definition.split), source.values(definition.outcome, true)));
    return { definition, measure: { split: source.info(definition.split), outcome: source.info(definition.outcome) }, current: results[0], reference: results[1] ?? null };
  });
}

export async function buildMobileProgressInfluence(context: Context, definition: InfluenceDefinition, period: ProgressPeriod, comparing: boolean, today: string): Promise<ProgressInfluence> {
  const defs = [definition.split, definition.outcome].some(k => k.startsWith("metric.")) ? await definitions(context) : [];
  const [result] = await readings(context, [definition], defs, period, comparing, today);
  return { today, period, ...result };
}

export async function buildMobileProgressInfluenceSuggested(context: Context, period: ProgressPeriod, comparing: boolean, today: string): Promise<ProgressInfluenceSuggested> {
  const defs = await definitions(context);
  const systems = new Map(defs.filter(d => d.is_active && d.archived_at === null && (SYSTEM_METRIC_KEYS as readonly string[]).includes(d.system_key ?? ""))
    .map(d => [d.system_key, `metric.${d.id}`]));
  const metric = (key: SystemMetricKey) => systems.get(key);
  const candidates: { key: InfluenceSuggestedKey; split: string | undefined; cut: string; lag: 0 | 1 | 2; outcome: string | undefined }[] = [
    { key: "sleep_sets", split: metric("sleep"), cut: "median", lag: 1, outcome: "training.sets" },
    { key: "carbs_sets", split: "nutrition.carbs", cut: "median", lag: 1, outcome: "training.sets" },
    { key: "training_kcal", split: "day.training", cut: "yes", lag: 0, outcome: "nutrition.kcal" },
    { key: "steps_sleep", split: metric("steps"), cut: "median", lag: 0, outcome: metric("sleep") },
    { key: "training_water", split: "day.training", cut: "yes", lag: 0, outcome: metric("water") },
  ];
  const questions = candidates.filter((q): q is InfluenceDefinition & { key: InfluenceSuggestedKey } => q.split !== undefined && q.outcome !== undefined);
  const results = await readings(context, questions.map(({ split, cut, lag, outcome }) => ({ split, cut, lag, outcome })), defs, period, comparing, today);
  return { today, period, questions: results.map((r, i) => ({ key: questions[i].key, ...r })) };
}
