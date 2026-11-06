import "server-only";
import { createHash } from "node:crypto";
import { todayInCordoba } from "@/lib/phase2/cordoba-date";
import { readAllTrainingRows } from "@/lib/phase2/training-robust";
import { createInsightsSnapshot, insightsDaysPage, insightsRelation, insightsRelations, insightsSummary, INSIGHTS_MAX_DAYS, type InsightsSnapshot, type InsightsSource } from "@/lib/progress/insights-engine";
import type { InsightsEngineMethod } from "@/lib/progress/insights-engine/types";
import { MobileApiValidationError } from "./auth";
import { NutritionReportDayChangedError } from "./nutrition-report-server";
import { InsightsSnapshotCache } from "./performance-insights-cache";
import { parsePerformanceInsights } from "./performance-insights-contract";
import { progressReadResponse } from "./progress-server";
import type { MobileSupabaseAuthenticatedContext } from "./supabase";
import { configurationIdentity } from "./training-exercise-configuration-contract";

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
  energy_level: number | null; performance_level: number | null; pain_level: number | null; day: { log_date: string; weight_kg?: number | string | null } };
type ExerciseRow = { id: string; workout_session_id: string; exercise_id: string; nombre_snapshot: string; implement_snapshot: string | null; weight_mode_snapshot: string | null; is_completed: boolean;
  /** One-to-one by primary key: PostgREST sends an object, the generated types say a list. Both are read the same way. */
  configuration?: ConfigurationRow | ConfigurationRow[] | null;
  /** The exercise's own sets, embedded: one request per page of exercises instead of a stream of its own. */
  sets: EmbeddedSetRow[] };
type ConfigurationRow = { kind: string | null; label: string | null };
const oneConfiguration = (value: ExerciseRow["configuration"]) => Array.isArray(value) ? value.length === 1 ? value[0]! : null : value ?? null;
type SetRow = { id: string; workout_session_exercise_id: string; actual_reps: number | null; actual_weight_kg: number | string | null; is_completed: boolean; completed_at: string | null };
type EmbeddedSetRow = Omit<SetRow, "workout_session_exercise_id">;
/** uuid order is byte order, which is the order of their canonical text: the same order as `order("id")` in the database. */
const byId = (a: { id: string }, b: { id: string }) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
type MetricRow = { id: string; name: string; unit: string | null; value_type: string; is_active: boolean; archived_at: string | null; system_key?: string | null };
type NightRow = { convention: string; declared_updated_at: string; declared_value: number | string; declared_date: string };
type ValueRow = { id: string; metric_id: string; metric_date: string; value: unknown; updated_at?: string; night?: NightRow | NightRow[] | null };
const SLEEP_NIGHT = "sleep_night_ending_on_date/1";
/**
 * A declaration holds only for the version of the value it was made for. Any later write moves updated_at, so an edit by any
 * client, old ones included, leaves it outdated: it is read as undeclared, never as the new value's meaning.
 */
export function sleepNightOf(row: Pick<ValueRow, "metric_date" | "value" | "updated_at" | "night">): "declared" | "undeclared" | "stale_declaration" {
  const night = Array.isArray(row.night) ? row.night.length === 1 ? row.night[0]! : null : row.night ?? null;
  if (!night) return "undeclared";
  return night.convention === SLEEP_NIGHT && night.declared_updated_at === row.updated_at && night.declared_date === row.metric_date
    && Number(night.declared_value) === Number(row.value) ? "declared" : "stale_declaration";
}
type MealRow = { id: string; consumed_at: string | null; consumed_at_source: string | null; raw_input: unknown; entry_kind: string | null; source_type: string | null; import_run_id: string | null;
  final_calories: unknown; final_protein_g: unknown; final_carbs_g: unknown; final_fat_g: unknown; day_logs: { log_date: string } };
type FeelingRow = { session_id: string; revision: number; facts: unknown };

/**
 * Six grouped streams, whole history, one stable order each. Pages grow with rows, never with exercises or candidates.
 * Sets travel inside their exercise's page (#367): PostgREST's row cap applies to the page's exercises, not to the rows
 * embedded in them, so each exercise brings all of its own sets, filtered by owner and ordered by id.
 */
export async function readInsightsSource(context: Context): Promise<InsightsSource> {
  const { supabase, userId } = context;
  const [sessions, exercises, feelings, definitions, values, meals] = await Promise.all([
    readAllTrainingRows<SessionRow>("Leer sesiones de Insights", from => supabase.from("workout_sessions")
      .select("id,routine_id,routine_name_snapshot,session_name,status,started_at,ended_at,energy_level,performance_level,pain_level,day:day_logs!inner(log_date,weight_kg)", firstPage(from))
      .eq("user_id", userId).eq("status", "completed").order("id").range(from, from + 999).returns<SessionRow[]>()),
    readAllTrainingRows<ExerciseRow>("Leer ejercicios de Insights", from => supabase.from("workout_session_exercises")
      .select("id,workout_session_id,exercise_id,nombre_snapshot,implement_snapshot,weight_mode_snapshot,is_completed,configuration:workout_session_exercise_configurations(kind,label),sets:workout_sets(id,actual_reps,actual_weight_kg,is_completed,completed_at)", firstPage(from))
      .eq("user_id", userId).eq("sets.user_id", userId).order("id").order("id", { referencedTable: "sets" }).range(from, from + 999).returns<ExerciseRow[]>()),
    readAllTrainingRows<FeelingRow>("Leer sensaciones de Insights", from => supabase.from("workout_session_feelings")
      .select("session_id,revision,facts,session:workout_sessions!inner(user_id,status)", firstPage(from))
      .eq("session.user_id", userId).eq("session.status", "completed").order("session_id").range(from, from + 999)),
    // Archived metrics stay: every numeric metric takes part by UUID, with no list by name, unit or system key.
    readAllTrainingRows<MetricRow>("Leer métricas de Insights", from => supabase.from("user_metrics")
      .select("id,name,unit,value_type,is_active,archived_at,system_key", firstPage(from)).eq("user_id", userId).order("id").range(from, from + 999)),
    readAllTrainingRows<ValueRow>("Leer valores de Insights", from => supabase.from("daily_metric_values")
      .select("id,metric_id,metric_date,value,updated_at,night:daily_metric_value_conventions(convention,declared_updated_at,declared_value,declared_date)", firstPage(from)).eq("user_id", userId).order("id").range(from, from + 999)),
    readAllTrainingRows<MealRow>("Leer comidas de Insights", from => supabase.from("meal_entries")
      .select("id,consumed_at,consumed_at_source,raw_input,entry_kind,source_type,import_run_id,final_calories,final_protein_g,final_carbs_g,final_fat_g,day_logs!inner(log_date)", firstPage(from))
      .eq("user_id", userId).is("deleted_at", null).order("id").range(from, from + 999).returns<MealRow[]>()),
  ]);
  // Without joins on every page: rows of an in-progress or discarded session are dropped here, against the completed sessions just read.
  const completed = new Set(sessions.map(row => row.id));
  const completedExercises = exercises.filter(row => completed.has(row.workout_session_id));
  // The same rows, in the same order, as the stream they replace: every set of a completed session's exercise, by id.
  const sets = completedExercises.flatMap(row => row.sets.map(set => ({ ...set, workout_session_exercise_id: row.id }))).sort(byId);
  return {
    sessions: sessions.map(row => ({ id: row.id, date: row.day.log_date, dayWeightKg: strictNumber(row.day.weight_kg), routineId: row.routine_id, routineName: row.routine_name_snapshot, name: row.session_name, status: row.status,
      startedAt: row.started_at, endedAt: row.ended_at, performanceLevel: row.performance_level, painLevel: row.pain_level, legacyEnergyLevel: row.energy_level })),
    exercises: completedExercises.map(row => ({ id: row.id, sessionId: row.workout_session_id, exerciseId: row.exercise_id, name: row.nombre_snapshot, implement: row.implement_snapshot, weightMode: row.weight_mode_snapshot, isCompleted: row.is_completed,
      // Recorded by the person for this session, or unknown. The catalog is not history and nothing is invented.
      configuration: configurationIdentity(oneConfiguration(row.configuration)) })),
    sets: sets.map(row => ({ id: row.id, sessionExerciseId: row.workout_session_exercise_id, actualReps: strictNumber(row.actual_reps), actualLoad: strictNumber(row.actual_weight_kg), isCompleted: row.is_completed, completedAt: row.completed_at })),
    feelings: feelings.map(row => ({ sessionId: row.session_id, revision: row.revision, facts: row.facts })),
    metricDefinitions: definitions.map(row => ({ id: row.id, name: row.name, unit: row.unit, valueType: row.value_type, archived: !row.is_active || row.archived_at !== null, systemKey: row.system_key ?? null })),
    metricValues: values.map(row => ({ metricId: row.metric_id, date: row.metric_date, value: row.value, sleepNight: sleepNightOf(row) })),
    meals: meals.map(row => ({ id: row.id, date: row.day_logs.log_date, consumedAt: row.consumed_at, consumedAtSource: row.consumed_at_source, rawInput: row.raw_input, entryKind: row.entry_kind, sourceType: row.source_type, importRunId: row.import_run_id,
      calories: strictNumber(row.final_calories), proteinG: strictNumber(row.final_protein_g), carbsG: strictNumber(row.final_carbs_g), fatG: strictNumber(row.final_fat_g) })),
  };
}

/**
 * The counter the database moves in the same transaction as any change to these sources. Seeing the same value twice means no
 * such transaction committed in between. No row yet means nothing changed since it exists: 0, never an error. Needs the EXPAND.
 */
export async function readInsightsRevision(context: Context): Promise<string> {
  const { data, error } = await context.supabase.from("insights_source_revisions").select("revision").eq("user_id", context.userId).maybeSingle();
  if (error) throw new Error("Insights revision unavailable");
  return String((data as { revision?: number } | null)?.revision ?? 0);
}

/** Publishes only a read whose sources did not change meanwhile. One retry; after that the read is unavailable, never partial. */
export async function readConsistentInsightsSource(context: Context, known?: string): Promise<{ source: InsightsSource; revision: string }> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const before = attempt === 0 && known !== undefined ? known : await readInsightsRevision(context);
    const source = await readInsightsSource(context);
    if (await readInsightsRevision(context) === before) return { source, revision: before };
  }
  throw new Error("Insights sources kept changing");
}

const snapshots = new InsightsSnapshotCache<InsightsSnapshot>({ maxEntries: 3, ttlMs: 5 * 60_000 });
export const clearInsightsSnapshots = () => snapshots.clear();
const publicRevision = (userId: string, revision: string) => createHash("sha256").update(`${userId}|${revision}`).digest("hex").slice(0, 32);

/** Reuses the snapshot only if the counter just read under this token still matches: one query against a whole read. An optimization, never a guarantee of a hit. */
export async function readInsightsSnapshot(context: Context, today: string, method: InsightsEngineMethod = 1): Promise<InsightsSnapshot> {
  // Each method is its own family of hypotheses: one answer never stands in for the other.
  const key = `${context.userId}#m${method}`;
  const current = await readInsightsRevision(context);
  const reused = snapshots.get(key, current, today);
  if (reused) return reused;
  const { source, revision } = await readConsistentInsightsSource(context, current);
  const snapshot = createInsightsSnapshot(source, { today, revision: publicRevision(context.userId, revision), method });
  snapshots.set(key, revision, today, snapshot);
  return snapshot;
}

export function parseInsightsParams(params: URLSearchParams) {
  for (const key of new Set(params.keys())) {
    if (!["view", "before", "limit", "association", "pairs", "method"].includes(key) || params.getAll(key).length > 1) throw new MobileApiValidationError("Parámetro no válido.");
  }
  const before = params.get("before") ?? undefined, limit = params.get("limit"), association = params.get("association") ?? undefined, view = params.get("view") ?? "summary";
  if (!["summary", "days", "relations"].includes(view)) throw new MobileApiValidationError("Vista no válida.");
  if (before !== undefined && (!/^\d{4}-\d{2}-\d{2}$/.test(before) || new Date(`${before}T00:00:00Z`).toISOString().slice(0, 10) !== before)) throw new MobileApiValidationError("Fecha no válida.");
  if (limit !== null && (!/^\d{1,3}$/.test(limit) || +limit < 1 || +limit > INSIGHTS_MAX_DAYS)) throw new MobileApiValidationError(`El límite va de 1 a ${INSIGHTS_MAX_DAYS} días.`);
  if (association !== undefined && !/^[a-zA-Z0-9_:-]{1,120}$/.test(association)) throw new MobileApiValidationError("Relación no válida.");
  const method = params.get("method");
  if (method !== null && method !== "2") throw new MobileApiValidationError("Método no válido.");
  const pairs = params.get("pairs");
  if (pairs !== null && (pairs !== "all" || association === undefined)) throw new MobileApiValidationError("Parámetro no válido.");
  return { view: view as "summary" | "days" | "relations", before, limit: limit === null ? undefined : +limit, association, method: (method === "2" ? 2 : 1) as InsightsEngineMethod, ...(pairs === "all" ? { pairs: "all" as const } : {}) };
}

export const performanceInsightsResponse = (request: Request) => progressReadResponse(request, "performance-insights", async (context, params, today) => {
  const options = parseInsightsParams(params);
  const snapshot = await readInsightsSnapshot(context, today, options.method);
  const model = options.association ? insightsRelation(snapshot, options.association, { pairs: options.pairs ?? "recent" })
    : options.view === "relations" ? insightsRelations(snapshot)
    : options.view === "days" ? insightsDaysPage(snapshot, options) : insightsSummary(snapshot, options);
  // A read straddling Córdoba midnight is retried by the shared GET handler.
  const after = todayInCordoba();
  if (after !== today) throw new NutritionReportDayChangedError(after);
  return model;
}, parsePerformanceInsights);
