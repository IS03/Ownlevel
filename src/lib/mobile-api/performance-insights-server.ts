import "server-only";
import { todayInCordoba } from "@/lib/phase2/cordoba-date";
import { readAllTrainingRows } from "@/lib/phase2/training-robust";
import { buildInsightsReadModel, INSIGHTS_MAX_DAYS, type InsightsSource } from "@/lib/progress/insights-engine";
import { MobileApiValidationError } from "./auth";
import { NutritionReportDayChangedError } from "./nutrition-report-server";
import { parsePerformanceInsights } from "./performance-insights-contract";
import { progressReadResponse } from "./progress-server";
import type { MobileSupabaseAuthenticatedContext } from "./supabase";

type Context = MobileSupabaseAuthenticatedContext;
const firstPage = (from: number) => (from === 0 ? { count: "exact" as const } : undefined);
const toNumber = (value: unknown) => {
  if (value === null || value === undefined || value === "") return null;
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
};
/** A value the database returned but that cannot be read is not missing: the source is broken and nothing is published. */
const strictNumber = (value: unknown) => {
  const number = toNumber(value);
  if (number === null && value !== null && value !== undefined) throw new Error("Invalid insights numeric source");
  return number;
};

type SessionRow = { id: string; routine_id: string | null; routine_name_snapshot: string | null; session_name: string | null; status: "completed"; started_at: string | null; ended_at: string | null;
  energy_level: number | null; performance_level: number | null; pain_level: number | null; day: { log_date: string } };
type ExerciseRow = { id: string; workout_session_id: string; exercise_id: string; nombre_snapshot: string; implement_snapshot: string | null; weight_mode_snapshot: string | null; is_completed: boolean };
type SetRow = { id: string; workout_session_exercise_id: string; actual_reps: number | null; actual_weight_kg: number | string | null; is_completed: boolean; completed_at: string | null };
type MetricRow = { id: string; name: string; unit: string | null; value_type: string; is_active: boolean; archived_at: string | null };
type ValueRow = { id: string; metric_id: string; metric_date: string; value: unknown };
type MealRow = { id: string; consumed_at: string | null; consumed_at_source: string | null; raw_input: unknown; entry_kind: string | null; source_type: string | null;
  final_calories: unknown; final_protein_g: unknown; final_carbs_g: unknown; final_fat_g: unknown; day_logs: { log_date: string } };
type FeelingRow = { session_id: string; revision: number; facts: unknown };

/** Seven grouped streams, whole history, one stable order each. Pages grow with rows, never with exercises or candidates. */
export async function readInsightsSource(context: Context): Promise<InsightsSource> {
  const { supabase, userId } = context;
  const [sessions, exercises, sets, feelings, definitions, values, meals] = await Promise.all([
    readAllTrainingRows<SessionRow>("Leer sesiones de Insights", from => supabase.from("workout_sessions")
      .select("id,routine_id,routine_name_snapshot,session_name,status,started_at,ended_at,energy_level,performance_level,pain_level,day:day_logs!inner(log_date)", firstPage(from))
      .eq("user_id", userId).eq("status", "completed").order("id").range(from, from + 999).returns<SessionRow[]>()),
    readAllTrainingRows<ExerciseRow>("Leer ejercicios de Insights", from => supabase.from("workout_session_exercises")
      .select("id,workout_session_id,exercise_id,nombre_snapshot,implement_snapshot,weight_mode_snapshot,is_completed", firstPage(from))
      .eq("user_id", userId).order("id").range(from, from + 999)),
    readAllTrainingRows<SetRow>("Leer series de Insights", from => supabase.from("workout_sets")
      .select("id,workout_session_exercise_id,actual_reps,actual_weight_kg,is_completed,completed_at", firstPage(from))
      .eq("user_id", userId).order("id").range(from, from + 999)),
    readAllTrainingRows<FeelingRow>("Leer sensaciones de Insights", from => supabase.from("workout_session_feelings")
      .select("session_id,revision,facts,session:workout_sessions!inner(user_id,status)", firstPage(from))
      .eq("session.user_id", userId).eq("session.status", "completed").order("session_id").range(from, from + 999)),
    // Archived metrics stay: every numeric metric takes part by UUID, with no list by name, unit or system key.
    readAllTrainingRows<MetricRow>("Leer métricas de Insights", from => supabase.from("user_metrics")
      .select("id,name,unit,value_type,is_active,archived_at", firstPage(from)).eq("user_id", userId).order("id").range(from, from + 999)),
    readAllTrainingRows<ValueRow>("Leer valores de Insights", from => supabase.from("daily_metric_values")
      .select("id,metric_id,metric_date,value", firstPage(from)).eq("user_id", userId).order("id").range(from, from + 999)),
    readAllTrainingRows<MealRow>("Leer comidas de Insights", from => supabase.from("meal_entries")
      .select("id,consumed_at,consumed_at_source,raw_input,entry_kind,source_type,final_calories,final_protein_g,final_carbs_g,final_fat_g,day_logs!inner(log_date)", firstPage(from))
      .eq("user_id", userId).is("deleted_at", null).order("id").range(from, from + 999).returns<MealRow[]>()),
  ]);
  // Without joins on every page: rows of an in-progress or discarded session are dropped here, against the completed sessions just read.
  const completed = new Set(sessions.map(row => row.id));
  const completedExercises = exercises.filter(row => completed.has(row.workout_session_id));
  const kept = new Set(completedExercises.map(row => row.id));
  return {
    sessions: sessions.map(row => ({ id: row.id, date: row.day.log_date, routineId: row.routine_id, routineName: row.routine_name_snapshot, name: row.session_name, status: row.status,
      startedAt: row.started_at, endedAt: row.ended_at, performanceLevel: row.performance_level, painLevel: row.pain_level, legacyEnergyLevel: row.energy_level })),
    exercises: completedExercises.map(row => ({ id: row.id, sessionId: row.workout_session_id, exerciseId: row.exercise_id, name: row.nombre_snapshot, implement: row.implement_snapshot, weightMode: row.weight_mode_snapshot, isCompleted: row.is_completed,
      // No column stores it yet. Unknown stays unknown: the catalog is not history and nothing is invented.
      configuration: null })),
    sets: sets.filter(row => kept.has(row.workout_session_exercise_id)).map(row => ({ id: row.id, sessionExerciseId: row.workout_session_exercise_id, actualReps: strictNumber(row.actual_reps), actualLoad: strictNumber(row.actual_weight_kg), isCompleted: row.is_completed, completedAt: row.completed_at })),
    feelings: feelings.map(row => ({ sessionId: row.session_id, revision: row.revision, facts: row.facts })),
    metricDefinitions: definitions.map(row => ({ id: row.id, name: row.name, unit: row.unit, valueType: row.value_type, archived: !row.is_active || row.archived_at !== null })),
    metricValues: values.map(row => ({ metricId: row.metric_id, date: row.metric_date, value: row.value })),
    meals: meals.map(row => ({ id: row.id, date: row.day_logs.log_date, consumedAt: row.consumed_at, consumedAtSource: row.consumed_at_source, rawInput: row.raw_input, entryKind: row.entry_kind, sourceType: row.source_type,
      calories: strictNumber(row.final_calories), proteinG: strictNumber(row.final_protein_g), carbsG: strictNumber(row.final_carbs_g), fatG: strictNumber(row.final_fat_g) })),
  };
}

/** Row count and last change of each stream. Counts catch hard deletes; an in-progress session does not disturb completed history. */
export async function readInsightsRevision(context: Context): Promise<string> {
  const { supabase, userId } = context;
  const latest = (query: PromiseLike<{ data: unknown; error: unknown; count: number | null }>) => Promise.resolve(query).then(({ data, error, count }) => {
    if (error || !Array.isArray(data)) throw new Error("Insights revision unavailable");
    return `${count ?? "?"}:${(data[0] as { updated_at?: string } | undefined)?.updated_at ?? ""}`;
  });
  const parts = await Promise.all([
    latest(supabase.from("workout_sessions").select("updated_at", { count: "exact" }).eq("user_id", userId).eq("status", "completed").order("updated_at", { ascending: false }).limit(1)),
    latest(supabase.from("workout_session_exercises").select("updated_at,session:workout_sessions!inner(status)", { count: "exact" }).eq("user_id", userId).eq("session.status", "completed").order("updated_at", { ascending: false }).limit(1)),
    latest(supabase.from("workout_sets").select("updated_at,exercise:workout_session_exercises!inner(session:workout_sessions!inner(status))", { count: "exact" }).eq("user_id", userId).eq("exercise.session.status", "completed").order("updated_at", { ascending: false }).limit(1)),
    latest(supabase.from("workout_session_feelings").select("updated_at,session:workout_sessions!inner(user_id,status)", { count: "exact" }).eq("session.user_id", userId).eq("session.status", "completed").order("updated_at", { ascending: false }).limit(1)),
    latest(supabase.from("user_metrics").select("updated_at", { count: "exact" }).eq("user_id", userId).order("updated_at", { ascending: false }).limit(1)),
    latest(supabase.from("daily_metric_values").select("updated_at", { count: "exact" }).eq("user_id", userId).order("updated_at", { ascending: false }).limit(1)),
    latest(supabase.from("meal_entries").select("updated_at", { count: "exact" }).eq("user_id", userId).is("deleted_at", null).order("updated_at", { ascending: false }).limit(1)),
  ]);
  return parts.join("|");
}

/** Publishes only a read whose seven sources did not change meanwhile. One retry; after that the read is unavailable, never partial. */
export async function readConsistentInsightsSource(context: Context): Promise<InsightsSource> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const before = await readInsightsRevision(context);
    const source = await readInsightsSource(context);
    if (await readInsightsRevision(context) === before) return source;
  }
  throw new Error("Insights sources kept changing");
}

export function parseInsightsParams(params: URLSearchParams) {
  for (const key of new Set(params.keys())) {
    if (!["before", "limit", "association"].includes(key) || params.getAll(key).length > 1) throw new MobileApiValidationError("Parámetro no válido.");
  }
  const before = params.get("before") ?? undefined, limit = params.get("limit"), association = params.get("association") ?? undefined;
  if (before !== undefined && (!/^\d{4}-\d{2}-\d{2}$/.test(before) || new Date(`${before}T00:00:00Z`).toISOString().slice(0, 10) !== before)) throw new MobileApiValidationError("Fecha no válida.");
  if (limit !== null && (!/^\d{1,3}$/.test(limit) || +limit < 1 || +limit > INSIGHTS_MAX_DAYS)) throw new MobileApiValidationError(`El límite va de 1 a ${INSIGHTS_MAX_DAYS} días.`);
  if (association !== undefined && !/^[a-zA-Z0-9_:-]{1,120}$/.test(association)) throw new MobileApiValidationError("Relación no válida.");
  return { before, limit: limit === null ? undefined : +limit, association };
}

export const performanceInsightsResponse = (request: Request) => progressReadResponse(request, "performance-insights", async (context, params, today) => {
  const options = parseInsightsParams(params);
  const model = buildInsightsReadModel(await readConsistentInsightsSource(context), { ...options, today });
  // A read straddling Córdoba midnight is retried by the shared GET handler.
  const after = todayInCordoba();
  if (after !== today) throw new NutritionReportDayChangedError(after);
  return model;
}, parsePerformanceInsights);
