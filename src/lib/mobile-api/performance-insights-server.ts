import "server-only";
import { createHash } from "node:crypto";
import { todayInCordoba } from "@/lib/phase2/cordoba-date";
import { readAllTrainingRows } from "@/lib/phase2/training-robust";
import { createInsightsSnapshot, insightsDaysPage, insightsExerciseEvidence, insightsFeelingOutcomes, insightsPeriodSummary, periodOf, insightsRelation, insightsRelations, insightsSummary, INSIGHTS_MAX_DAYS, type EvidenceLane, type InsightsSnapshot, type InsightsSource } from "@/lib/progress/insights-engine";
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
const SET_COLUMNS = "id,actual_reps,actual_weight_kg,is_completed,completed_at";
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
 *
 * Sets travel inside their exercise's page (#367), filtered by owner and ordered by id. PostgREST caps every embedded list at
 * max-rows as well as the page itself (checked on 16.5: one parent with 1500 children receives 1000). The schema keeps a
 * session exercise at 50 sets at most (`workout_sets_set_number_check` with `workout_sets_unique_number`), so a list is not
 * cut while max-rows is at least 50. That is not assumed: one count of the person's sets runs alongside, and if the embedded
 * lists add up to less, the sets are read as their own paged stream instead, as before. Never a partial list.
 */
export async function readInsightsSource(context: Context): Promise<InsightsSource> {
  const { supabase, userId } = context;
  const [sessions, exercises, feelings, definitions, values, meals, setTotal] = await Promise.all([
    readAllTrainingRows<SessionRow>("Leer sesiones de Insights", from => supabase.from("workout_sessions")
      .select("id,routine_id,routine_name_snapshot,session_name,status,started_at,ended_at,energy_level,performance_level,pain_level,day:day_logs!inner(log_date,weight_kg)", firstPage(from))
      .eq("user_id", userId).eq("status", "completed").order("id").range(from, from + 999).returns<SessionRow[]>()),
    readAllTrainingRows<ExerciseRow>("Leer ejercicios de Insights", from => supabase.from("workout_session_exercises")
      .select(`id,workout_session_id,exercise_id,nombre_snapshot,implement_snapshot,weight_mode_snapshot,is_completed,configuration:workout_session_exercise_configurations(kind,label),sets:workout_sets(${SET_COLUMNS})`, firstPage(from))
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
    // How many sets the embedded lists must add up to: the same rows the stream they replace counted on its first page.
    countSets(context),
  ]);
  // Without joins on every page: rows of an in-progress or discarded session are dropped here, against the completed sessions just read.
  const completed = new Set(sessions.map(row => row.id));
  const completedExercises = exercises.filter(row => completed.has(row.workout_session_id));
  // A cut list makes the embedded total fall short: read every set as its own stream then. Never a partial list.
  if (exercises.reduce((sum, row) => sum + row.sets.length, 0) !== setTotal) {
    const byExercise = await readSetStream(context);
    for (const row of exercises) row.sets = byExercise.get(row.id) ?? [];
  }
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

async function countSets(context: Context) {
  const { count, error } = await context.supabase.from("workout_sets").select("id", { count: "exact", head: true }).eq("user_id", context.userId);
  if (error || typeof count !== "number") throw new Error("Leer cantidad de series de Insights");
  return count;
}
/** Every set of the person in pages by id: the stream the embedded lists replace, read only when they fall short. */
async function readSetStream(context: Context) {
  const { supabase, userId } = context;
  const rows = await readAllTrainingRows<SetRow>("Leer series de Insights", from => supabase.from("workout_sets")
    .select(`workout_session_exercise_id,${SET_COLUMNS}`, firstPage(from)).eq("user_id", userId).order("id").range(from, from + 999));
  const byExercise = new Map<string, EmbeddedSetRow[]>();
  for (const { workout_session_exercise_id: exercise, ...set } of rows) {
    const list = byExercise.get(exercise);
    if (list) list.push(set); else byExercise.set(exercise, [set]);
  }
  return byExercise;
}

/** The evidence detail also reads where each set sits for the person: its block's order and its number. Insights does not. */
const EVIDENCE_SET_COLUMNS = `${SET_COLUMNS},set_number`;
type EvidenceSetRow = EmbeddedSetRow & { set_number: number };
/** Exported for the local PostgREST test, which reads the raw shape with this same select. */
export const EXERCISE_EVIDENCE_SELECT = `id,workout_session_id,exercise_id,exercise_order,nombre_snapshot,implement_snapshot,weight_mode_snapshot,is_completed,configuration:workout_session_exercise_configurations(kind,label),sets:workout_sets(${EVIDENCE_SET_COLUMNS}),set_count:workout_sets(count),session:workout_sessions!inner(id,routine_id,status,started_at,ended_at,day:day_logs!inner(log_date))`;
type EvidenceRow = Omit<ExerciseRow, "sets"> & { exercise_order: number; sets: EvidenceSetRow[]; set_count: { count: number }[];
  session: { id: string; routine_id: string | null; status: "completed"; started_at: string | null; ended_at: string | null; day: { log_date: string } } };
/**
 * The history of one exercise and nothing else (#367): its rows in completed sessions, each with its session, its configuration
 * and its sets, by id. Pages grow with the times it was done, never with the rest of the history. Each row also counts its own
 * sets, so a list PostgREST cut at max-rows is noticed and read again from its own stream, for those rows only. Never a partial list.
 */
export async function readExerciseSource(context: Context, exerciseId: string): Promise<InsightsSource> {
  const { supabase, userId } = context;
  const rows = await readAllTrainingRows<EvidenceRow>("Leer historial del ejercicio", from => supabase.from("workout_session_exercises")
    .select(EXERCISE_EVIDENCE_SELECT, firstPage(from))
    .eq("user_id", userId).eq("exercise_id", exerciseId).eq("session.status", "completed").eq("sets.user_id", userId).eq("set_count.user_id", userId)
    .order("id").order("id", { referencedTable: "sets" }).range(from, from + 999).returns<EvidenceRow[]>());
  const expected = (row: EvidenceRow) => row.set_count[0]?.count;
  const cut = rows.filter(row => row.sets.length !== expected(row));
  if (cut.length) {
    const owners = new Set(cut.map(row => row.id));
    const stream = await readAllTrainingRows<SetRow & { set_number: number }>("Leer series del ejercicio", from => supabase.from("workout_sets")
      .select(`workout_session_exercise_id,${EVIDENCE_SET_COLUMNS}`, firstPage(from)).eq("user_id", userId).in("workout_session_exercise_id", [...owners]).order("id").range(from, from + 999));
    const byOwner = new Map<string, EvidenceSetRow[]>();
    for (const { workout_session_exercise_id: owner, ...set } of stream) byOwner.set(owner, [...(byOwner.get(owner) ?? []), set]);
    for (const row of cut) row.sets = byOwner.get(row.id) ?? [];
    if (cut.some(row => row.sets.length !== expected(row))) throw new Error("Leer series del ejercicio");
  }
  const sessions = new Map(rows.map(row => [row.session.id, row.session]));
  const sets = rows.flatMap(row => row.sets.map(set => ({ ...set, workout_session_exercise_id: row.id }))).sort(byId);
  return {
    sessions: [...sessions.values()].sort(byId).map(row => ({ id: row.id, date: row.day.log_date, routineId: row.routine_id, routineName: null, name: null, status: row.status,
      startedAt: row.started_at, endedAt: row.ended_at, performanceLevel: null, painLevel: null, legacyEnergyLevel: null })),
    exercises: rows.map(row => ({ id: row.id, sessionId: row.workout_session_id, exerciseId: row.exercise_id, name: row.nombre_snapshot, implement: row.implement_snapshot, weightMode: row.weight_mode_snapshot, isCompleted: row.is_completed,
      configuration: configurationIdentity(oneConfiguration(row.configuration)), order: row.exercise_order })),
    sets: sets.map(row => ({ id: row.id, sessionExerciseId: row.workout_session_exercise_id, actualReps: strictNumber(row.actual_reps), actualLoad: strictNumber(row.actual_weight_kg), isCompleted: row.is_completed, completedAt: row.completed_at,
      setNumber: row.set_number })),
    feelings: [], metricDefinitions: [], metricValues: [], meals: [],
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

/** The same guarantee for one exercise's history: published only if the counter did not move while it was read. One retry. */
export async function readConsistentExerciseSource(context: Context, exerciseId: string): Promise<{ source: InsightsSource; revision: string }> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const before = await readInsightsRevision(context);
    const source = await readExerciseSource(context, exerciseId);
    if (await readInsightsRevision(context) === before) return { source, revision: before };
  }
  throw new Error("Insights sources kept changing");
}

/**
 * Every weight of a date range, trained or not: one paged read of `day_logs`, by the token's user and in date order. The weights a
 * session carries are only the days with training, never the history (#367 phase 4).
 */
export async function readPeriodWeights(context: Context, range: { start: string; end: string }) {
  const { supabase, userId } = context;
  const rows = await readAllTrainingRows<{ log_date: string; weight_kg: number | string | null }>("Leer pesos del período", from => supabase.from("day_logs")
    .select("log_date,weight_kg", firstPage(from)).eq("user_id", userId).gte("log_date", range.start).lte("log_date", range.end).not("weight_kg", "is", null)
    .order("log_date").range(from, from + 999));
  return rows.map(row => ({ date: row.log_date, value: strictNumber(row.weight_kg)! }));
}

/**
 * The summary of the last three whole months: the Insights snapshot and that period's weights, published only if the counter did
 * not move between them (a weight that changes moves it). One retry; after that the read is unavailable, never mixed.
 */
async function readConsistentPeriod(context: Context, today: string, method: InsightsEngineMethod) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const snapshot = await readInsightsSnapshot(context, today, method);
    const weights = await readPeriodWeights(context, periodOf(today));
    if (publicRevision(context.userId, await readInsightsRevision(context)) === snapshot.revision) return insightsPeriodSummary(snapshot, weights);
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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EVIDENCE_KEYS = ["session", "exercise", "lane"];
export function parseInsightsParams(params: URLSearchParams) {
  for (const key of new Set(params.keys())) {
    if (!["view", "before", "limit", "association", "pairs", "method", ...EVIDENCE_KEYS].includes(key) || params.getAll(key).length > 1) throw new MobileApiValidationError("Parámetro no válido.");
  }
  const before = params.get("before") ?? undefined, limit = params.get("limit"), association = params.get("association") ?? undefined, view = params.get("view") ?? "summary";
  if (!["summary", "days", "relations", "evidence", "feelings", "period"].includes(view)) throw new MobileApiValidationError("Vista no válida.");
  const method = params.get("method");
  if (method !== null && method !== "2") throw new MobileApiValidationError("Método no válido.");
  const engineMethod = (method === "2" ? 2 : 1) as InsightsEngineMethod;
  // One exercise of one session, in one method: the whole selection or nothing, and nothing else beside it.
  if (view === "evidence" || EVIDENCE_KEYS.some(key => params.has(key))) {
    const session = params.get("session"), exercise = params.get("exercise"), lane = params.get("lane");
    if (view !== "evidence" || [...params.keys()].some(key => !["view", "method", ...EVIDENCE_KEYS].includes(key))) throw new MobileApiValidationError("Parámetro no válido.");
    if (!session || !UUID.test(session) || !exercise || !UUID.test(exercise) || (lane !== "strict" && lane !== "partial")) throw new MobileApiValidationError("Comparación no válida.");
    return { view: "evidence" as const, method: engineMethod, selection: { sessionId: session.toLowerCase(), exerciseId: exercise.toLowerCase(), lane: lane as EvidenceLane } };
  }
  if (before !== undefined && (!/^\d{4}-\d{2}-\d{2}$/.test(before) || new Date(`${before}T00:00:00Z`).toISOString().slice(0, 10) !== before)) throw new MobileApiValidationError("Fecha no válida.");
  if (limit !== null && (!/^\d{1,3}$/.test(limit) || +limit < 1 || +limit > INSIGHTS_MAX_DAYS)) throw new MobileApiValidationError(`El límite va de 1 a ${INSIGHTS_MAX_DAYS} días.`);
  if (association !== undefined && !/^[a-zA-Z0-9_:-]{1,120}$/.test(association)) throw new MobileApiValidationError("Relación no válida.");
  const pairs = params.get("pairs");
  if (pairs !== null && (pairs !== "all" || association === undefined)) throw new MobileApiValidationError("Parámetro no válido.");
  // Described outcomes over the whole history: no period, filter or page to pick a pattern by.
  if ((view === "feelings" || view === "period") && [...params.keys()].some(key => key !== "view" && key !== "method")) throw new MobileApiValidationError("Parámetro no válido.");
  return { view: view as "summary" | "days" | "relations" | "feelings" | "period", before, limit: limit === null ? undefined : +limit, association, method: engineMethod, ...(pairs === "all" ? { pairs: "all" as const } : {}) };
}

export const performanceInsightsResponse = (request: Request) => progressReadResponse(request, "performance-insights", async (context, params, today) => {
  const options = parseInsightsParams(params);
  if (options.view === "evidence") {
    // Never the whole history: the selected exercise's sessions only, under the same counter as Insights.
    const { source, revision } = await readConsistentExerciseSource(context, options.selection.exerciseId);
    const evidence = insightsExerciseEvidence(source, options.selection, { today, revision: publicRevision(context.userId, revision), method: options.method });
    const after = todayInCordoba();
    if (after !== today) throw new NutritionReportDayChangedError(after);
    return evidence;
  }
  if (options.view === "period") {
    const model = await readConsistentPeriod(context, today, options.method);
    const after = todayInCordoba();
    if (after !== today) throw new NutritionReportDayChangedError(after);
    return model;
  }
  const snapshot = await readInsightsSnapshot(context, today, options.method);
  const model = options.association ? insightsRelation(snapshot, options.association, { pairs: options.pairs ?? "recent" })
    : options.view === "relations" ? insightsRelations(snapshot)
    : options.view === "feelings" ? insightsFeelingOutcomes(snapshot)
    : options.view === "days" ? insightsDaysPage(snapshot, options) : insightsSummary(snapshot, options);
  // A read straddling Córdoba midnight is retried by the shared GET handler.
  const after = todayInCordoba();
  if (after !== today) throw new NutritionReportDayChangedError(after);
  return model;
}, parsePerformanceInsights);
