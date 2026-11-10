import "server-only";
import { buildNutritionReportDays } from "@/lib/nutrition/reports-core";
import { buildTrainingAnalysis, type TrainingAnalysisSource } from "@/lib/phase2/training-analysis";
import { readAllTrainingRows } from "@/lib/phase2/training-robust";
import { todayInCordoba } from "@/lib/phase2/cordoba-date";
import { configurationIdentity } from "./training-exercise-configuration-contract";
import { buildTrainingFeelings, buildTrainingPerformanceComparison, NON_COMPARABLE_EXECUTION_REASONS, trainingPerformanceStrategy } from "@/lib/progress/training-performance";
import { buildTrainingExercisesAnalytics } from "@/lib/progress/training-exercises";
import type { ProgressPeriod } from "./progress-contract";
import type { ConnectionExercise } from "./progress-connections-contract";
import { calculateProgressConnections, type ConnectionTrainingEvidence } from "./progress-connections-model";
import { influenceReadRanges } from "./progress-influence";
import { NutritionReportDayChangedError, readMobileNutritionFacts } from "./nutrition-report-server";
import { exerciseCharts } from "./progress-training";
import type { MobileSupabaseAuthenticatedContext } from "./supabase";

type Context = MobileSupabaseAuthenticatedContext;
type Range = { start: string; end: string };

/** Same comparison status and session 1RM chart as the existing training read, without a new data read. */
export function connectionTrainingEvidence(source: TrainingAnalysisSource, period: ProgressPeriod, reference: ProgressPeriod, today: string): ConnectionTrainingEvidence {
  const analysis = (range: ProgressPeriod) => buildTrainingAnalysis(source, { today, period: "custom", routines: [], range });
  const current = analysis(period), previous = analysis(reference);
  const performance = buildTrainingPerformanceComparison({ source, primaryPeriod: current.range, referencePeriod: previous.range });
  const exercises: ConnectionExercise[] = [];
  for (const item of performance.exercises) {
    if (trainingPerformanceStrategy(item.weightMode) !== "load_reps" || item.primarySampleSize < 1 || item.referenceSampleSize < 1
      || NON_COMPARABLE_EXECUTION_REASONS.includes(item.reason)) continue;
    const selected = buildTrainingExercisesAnalytics({ source, primary: current, reference: previous,
      referenceDefinition: { type: "previous_period", period: reference, label: "Período anterior" }, selectedExerciseId: item.exerciseId }).selected;
    if (!selected) continue;
    const chart = exerciseCharts(selected, true).measures.find(m => m.key === "estimated_1rm");
    const now = chart?.points.map(p => p.value) ?? [], before = chart?.reference?.map(p => p.value) ?? [];
    if (!now.length || !before.length) continue;
    exercises.push({ exerciseId: item.exerciseId, name: item.name, status: item.status, currentE1rm: Math.max(...now), previousE1rm: Math.max(...before) });
  }
  const energy = (range: Range) => {
    const feeling = buildTrainingFeelings(source, range).find(f => f.key === "energy");
    // Feelings intentionally omit averages below two observations. Preserve the actual count for missing.have.
    const count = source.sessions.filter(s => {
      const date = source.dateByDayLog.get(s.day_log_id);
      return s.status === "completed" && date && date >= range.start && date <= range.end && typeof s.energy_level === "number" && Number.isFinite(s.energy_level);
    }).length;
    return { value: feeling?.average ?? null, count };
  };
  const a = energy(period), b = energy(reference);
  return { exercises, energy: { current: a.value, previous: b.value, sessions: { current: a.count, previous: b.count } } };
}

/** Reuse the historical reader's owner-scoped pagination. Embed dates to bound every query to A ∪ B,
 * including exercise/set pages (no full-history fetch, long .in() lists or per-exercise requests).
 */
async function trainingSource(context: Context, ranges: Range[]): Promise<TrainingAnalysisSource> {
  const { supabase, userId } = context;
  const dates = ranges.map(r => `and(log_date.gte.${r.start},log_date.lte.${r.end})`).join(",");
  type Session = TrainingAnalysisSource["sessions"][number] & { day: { id: string; log_date: string } };
  const sessions = await readAllTrainingRows<Session>("Leer sesiones de conexiones", (from, to) => supabase.from("workout_sessions")
    .select("*,day:day_logs!inner(id,log_date)").eq("user_id", userId).eq("status", "completed")
    .or(dates, { referencedTable: "day" }).order("id").range(from, to));
  if (!sessions.length) return { sessions: [], sessionExercises: [], sets: [], dateByDayLog: new Map() };
  // The variant (#367) rides embedded on each exercise row (one-to-one): no extra request (P1-C2).
  type Stored = { kind: string | null; label: string | null };
  type ExerciseRow = TrainingAnalysisSource["sessionExercises"][number] & { configuration?: Stored | Stored[] | null };
  const [exerciseRows, sets] = await Promise.all([
    readAllTrainingRows<ExerciseRow>("Leer ejercicios de conexiones", (from, to) => supabase.from("workout_session_exercises")
      .select("*,configuration:workout_session_exercise_configurations(kind,label),session:workout_sessions!inner(day:day_logs!inner(log_date))").eq("user_id", userId).eq("session.status", "completed")
      .or(dates, { referencedTable: "session.day" }).order("id").range(from, to)),
    readAllTrainingRows<TrainingAnalysisSource["sets"][number]>("Leer series de conexiones", (from, to) => supabase.from("workout_sets")
      .select("*,exercise:workout_session_exercises!inner(session:workout_sessions!inner(day:day_logs!inner(log_date)))")
      .eq("user_id", userId).eq("is_completed", true).eq("exercise.session.status", "completed")
      .or(dates, { referencedTable: "exercise.session.day" }).order("id").range(from, to)),
  ]);
  const configurations = new Map<string, string | null>();
  const sessionExercises = exerciseRows.map(({ configuration, ...row }) => {
    const identity = configurationIdentity(Array.isArray(configuration) ? configuration.length === 1 ? configuration[0]! : null : configuration ?? null);
    if (identity) configurations.set(row.id, identity);
    return row;
  });
  return { sessions, sessionExercises, sets, dateByDayLog: new Map(sessions.map(s => [s.day_log_id, s.day.log_date])), configurations };
}
async function weightsSource(context: Context, ranges: Range[]) {
  const dates = ranges.map(r => `and(log_date.gte.${r.start},log_date.lte.${r.end})`).join(",");
  const rows = await readAllTrainingRows<{ log_date: string; weight_kg: number }>("Leer peso de conexiones", (from, to) => context.supabase.from("day_logs")
    .select("id,log_date,weight_kg").eq("user_id", context.userId).not("weight_kg", "is", null)
    .or(dates).order("log_date").order("id").range(from, to));
  return rows.filter(p => Number.isFinite(p.weight_kg))
    .map(p => ({ date: p.log_date, value: p.weight_kg }));
}
async function isolated<T>(task: () => Promise<T>, source: string): Promise<T | null> {
  try { return await task(); }
  catch (error) {
    if (error instanceof NutritionReportDayChangedError) throw error;
    console.warn(`[mobile.progress.connections] ${source} unavailable`);
    return null;
  }
}

export async function readProgressConnections(context: Context, period: ProgressPeriod, reference: ProgressPeriod, today: string) {
  const ranges = [period, reference].map(r => ({ start: r.start, end: r.end < today ? r.end : today }));
  // The report snapshot accepts at most 366 days. Merge adjacent/overlapping windows, split only when required,
  // and share every chunk across all four stories; disjoint ranges never read the gap.
  const windows = influenceReadRanges(ranges, 0, today);
  const [nutrition, training, weights] = await Promise.all([
    isolated(async () => (await Promise.all(windows.map(async range =>
      buildNutritionReportDays({ range, today, ...await readMobileNutritionFacts(context, range, today) })))).flat(), "nutrition"),
    isolated(async () => connectionTrainingEvidence(await trainingSource(context, ranges), period, reference, today), "training"),
    isolated(() => weightsSource(context, ranges), "weight"),
  ]);
  const after = todayInCordoba();
  if (after !== today) throw new NutritionReportDayChangedError(after);
  return calculateProgressConnections(period, reference, today, { nutrition, training, weights });
}
