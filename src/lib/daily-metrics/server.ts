import "server-only";

import { requireAuthenticatedRequestContext, type AuthenticatedRequestContext } from "@/lib/supabase/server";
import {
  METRIC_VALUE_TYPES,
  buildHistoricalDailyMetrics,
  normalizeMetricName,
  normalizeMetricUnit,
  parseDailyMetricValue,
  parseMetricTarget,
  type DailyMetricWithValue,
  type MetricValueType,
  type UserMetric,
} from "./core";
import { measurePerformance } from "@/lib/request-performance";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const SYSTEM_METRIC_KEYS = ["steps", "water", "mate", "sleep"] as const;

function asNumber(value: unknown) {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function metricFromRow(row: Record<string, unknown>, history: Set<string>): UserMetric {
  return {
    ...(row as Omit<UserMetric, "target_value" | "has_history">),
    target_value: asNumber(row.target_value),
    has_history: history.has(String(row.id)),
  };
}

async function context(auth?: AuthenticatedRequestContext) {
  return auth ?? requireAuthenticatedRequestContext();
}

/** The database rejects values after today's product day (M5.2); show it plainly. */
function metricWriteError(prefix: string, error: { message: string }, cause?: unknown): Error {
  if (error.message.includes("metric_future_date")) return new Error("No se pueden registrar métricas en una fecha futura.");
  return new Error(`${prefix}: ${error.message}`, cause === undefined ? undefined : { cause });
}

export async function getUserMetrics(auth?: AuthenticatedRequestContext): Promise<UserMetric[]> {
  const { supabase, userId } = await context(auth);
  const ensured = await supabase.rpc("ensure_user_metrics");
  if (ensured.error) throw new Error(`Inicializar métricas: ${ensured.error.message}`);
  const metrics = await supabase.from("user_metrics").select("*").eq("user_id", userId)
    .order("is_active", { ascending: false }).order("sort_order").order("created_at");
  if (metrics.error) throw new Error(`Leer métricas: ${metrics.error.message}`);
  const historyChecks = await Promise.all((metrics.data ?? []).map(async (row) => {
    const result = await supabase.from("daily_metric_values")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId).eq("metric_id", row.id);
    if (result.error) throw new Error(`Leer historial de métricas: ${result.error.message}`);
    return { id: String(row.id), hasHistory: Boolean(result.count) };
  }));
  const history = new Set(historyChecks.filter((item) => item.hasHistory).map((item) => item.id));
  return (metrics.data ?? []).map((row) => metricFromRow(row, history));
}

export async function getActiveDailyMetrics(
  date: string,
  auth?: AuthenticatedRequestContext,
): Promise<DailyMetricWithValue[]> {
  if (!ISO_DATE.test(date)) throw new Error("Fecha inválida. Usá YYYY-MM-DD.");
  const { supabase, userId } = await context(auth);
  const readDefinitions = () => supabase.from("user_metrics").select("*")
    .eq("user_id", userId).order("sort_order").order("created_at");
  const [initialMetrics, values] = await Promise.all([
    readDefinitions(),
    supabase.from("daily_metric_values").select("metric_id,value")
      .eq("user_id", userId).eq("metric_date", date),
  ]);
  let metrics = initialMetrics;
  if (metrics.error) throw new Error(`Leer métricas activas: ${metrics.error.message}`);
  if (values.error) throw new Error(`Leer valores diarios: ${values.error.message}`);

  const definitions = metrics.data ?? [];
  const hasSystemDefaults = SYSTEM_METRIC_KEYS.every((key) =>
    definitions.some((row) => row.system_key === key)
  );
  if (!hasSystemDefaults) {
    const ensured = await supabase.rpc("ensure_user_metrics");
    if (ensured.error) throw new Error(`Inicializar métricas: ${ensured.error.message}`);
    metrics = await readDefinitions();
    if (metrics.error) throw new Error(`Leer métricas activas: ${metrics.error.message}`);
  }

  const rows = (metrics.data ?? []).filter((row) => row.is_active);
  if (!rows.length) return [];
  const byMetric = new Map((values.data ?? []).map((row) => [String(row.metric_id), asNumber(row.value)]));

  return rows.map((row) => ({
    ...metricFromRow(row, new Set()),
    value: byMetric.get(String(row.id)) ?? null,
  }));
}

export type HistoricalDailyMetrics = {
  recorded: DailyMetricWithValue[];
  editable: DailyMetricWithValue[];
};

/**
 * History reads every definition once so archived metrics keep their recorded
 * values. Active metrics without a value are only exposed to the editor.
 */
export async function getHistoricalDailyMetrics(
  date: string,
  auth?: AuthenticatedRequestContext,
): Promise<HistoricalDailyMetrics> {
  if (!ISO_DATE.test(date)) throw new Error("Fecha inválida. Usá YYYY-MM-DD.");
  const { supabase, userId } = await context(auth);
  const [metrics, values] = await Promise.all([
    supabase.from("user_metrics").select("*").eq("user_id", userId)
      .order("is_active", { ascending: false }).order("sort_order").order("created_at"),
    supabase.from("daily_metric_values").select("metric_id,value")
      .eq("user_id", userId).eq("metric_date", date),
  ]);
  if (metrics.error) throw new Error(`Leer definiciones de métricas: ${metrics.error.message}`);
  if (values.error) throw new Error(`Leer métricas del día: ${values.error.message}`);

  return buildHistoricalDailyMetrics(
    (metrics.data ?? []).map((row) => metricFromRow(row, new Set())),
    (values.data ?? []).map((row) => ({ metric_id: String(row.metric_id), value: asNumber(row.value) })),
  );
}

export async function createMetric(input: {
  name: unknown;
  valueType: unknown;
  unit: unknown;
  target: unknown;
}): Promise<void> {
  const { supabase, userId } = await context();
  const valueType = String(input.valueType) as MetricValueType;
  if (!METRIC_VALUE_TYPES.includes(valueType)) throw new Error("Elegí un tipo válido.");
  const name = normalizeMetricName(input.name);
  const unit = normalizeMetricUnit(input.unit, valueType);
  const target = parseMetricTarget(input.target, valueType);
  const { data: last, error: orderError } = await supabase.from("user_metrics")
    .select("sort_order").eq("user_id", userId).eq("is_active", true)
    .order("sort_order", { ascending: false }).limit(1).maybeSingle();
  if (orderError) throw new Error(`Calcular orden: ${orderError.message}`);
  const { error } = await supabase.from("user_metrics").insert({
    user_id: userId,
    system_key: null,
    name,
    unit,
    value_type: valueType,
    target_value: target,
    sort_order: Number(last?.sort_order ?? -1) + 1,
    is_active: true,
    archived_at: null,
  });
  if (error) throw new Error(`Crear métrica: ${error.message}`);
}

export async function updateMetric(input: {
  id: string;
  name: unknown;
  valueType: unknown;
  unit: unknown;
  target: unknown;
}): Promise<void> {
  const { supabase, userId } = await context();
  const { data: current, error: readError } = await supabase.from("user_metrics")
    .select("id,system_key,name,unit,value_type").eq("id", input.id).eq("user_id", userId).single();
  if (readError || !current) throw new Error("La métrica ya no está disponible.");
  const valueType = String(input.valueType) as MetricValueType;
  if (!METRIC_VALUE_TYPES.includes(valueType)) throw new Error("Elegí un tipo válido.");
  const target = parseMetricTarget(input.target, valueType);
  const identity = current.system_key
    ? { name: current.name, unit: current.unit, value_type: current.value_type }
    : {
        name: normalizeMetricName(input.name),
        unit: normalizeMetricUnit(input.unit, valueType),
        value_type: valueType,
      };
  const { data, error } = await supabase.from("user_metrics").update({ ...identity, target_value: target })
    .eq("id", input.id).eq("user_id", userId).select("id").maybeSingle();
  if (error) throw new Error(error.message.includes("history") ? "Una métrica con historial no puede cambiar de tipo o unidad." : `Editar métrica: ${error.message}`);
  if (!data) throw new Error("La métrica ya no está disponible.");
}

export async function archiveMetric(id: string): Promise<void> {
  const { supabase, userId } = await context();
  const { data, error } = await supabase.from("user_metrics")
    .update({ is_active: false, archived_at: new Date().toISOString() })
    .eq("id", id).eq("user_id", userId).select("id").maybeSingle();
  if (error) throw new Error(`Archivar métrica: ${error.message}`);
  if (!data) throw new Error("La métrica ya no está disponible.");
}

export async function restoreMetric(id: string): Promise<void> {
  const { supabase, userId } = await context();
  const { data: last, error: orderError } = await supabase.from("user_metrics")
    .select("sort_order").eq("user_id", userId).eq("is_active", true)
    .order("sort_order", { ascending: false }).limit(1).maybeSingle();
  if (orderError) throw new Error(`Calcular orden: ${orderError.message}`);
  const { data, error } = await supabase.from("user_metrics")
    .update({ is_active: true, archived_at: null, sort_order: Number(last?.sort_order ?? -1) + 1 })
    .eq("id", id).eq("user_id", userId).select("id").maybeSingle();
  if (error) throw new Error(`Reactivar métrica: ${error.message}`);
  if (!data) throw new Error("La métrica ya no está disponible.");
}

export async function deleteMetricIfUnused(id: string): Promise<void> {
  const { supabase, userId } = await context();
  const { data: value, error: historyError } = await supabase.from("daily_metric_values")
    .select("id").eq("user_id", userId).eq("metric_id", id).limit(1).maybeSingle();
  if (historyError) throw new Error(`Comprobar historial: ${historyError.message}`);
  if (value) throw new Error("Esta métrica tiene historial y sólo puede archivarse.");
  const { data, error } = await supabase.from("user_metrics").delete()
    .eq("id", id).eq("user_id", userId).is("system_key", null).select("id").maybeSingle();
  if (error) throw new Error(`Eliminar métrica: ${error.message}`);
  if (!data) throw new Error("Las métricas del sistema no se eliminan.");
}

export async function reorderMetrics(ids: string[]): Promise<void> {
  const { supabase } = await context();
  const { error } = await supabase.rpc("reorder_user_metrics", { p_metric_ids: ids });
  if (error) throw new Error(`Ordenar métricas: ${error.message}`);
}

export async function saveDailyMetricValue(input: {
  metricId: string;
  date: string;
  value: unknown;
}, auth?: AuthenticatedRequestContext): Promise<void> {
  const { supabase, userId } = await context(auth);
  if (!ISO_DATE.test(input.date)) throw new Error("Fecha inválida. Usá YYYY-MM-DD.");
  const { data: metric, error: metricError } = await supabase.from("user_metrics")
    .select("value_type").eq("id", input.metricId).eq("user_id", userId).single();
  if (metricError || !metric) throw new Error("La métrica ya no está disponible.");
  const value = parseDailyMetricValue(input.value, metric.value_type as MetricValueType);
  if (value === null) {
    const { error } = await supabase.from("daily_metric_values").delete()
      .eq("user_id", userId).eq("metric_id", input.metricId).eq("metric_date", input.date);
    if (error) throw new Error(`Borrar valor: ${error.message}`);
    return;
  }
  const { error } = await supabase.from("daily_metric_values").upsert({
    user_id: userId,
    metric_id: input.metricId,
    metric_date: input.date,
    value,
  }, { onConflict: "user_id,metric_date,metric_id" });
  if (error) throw metricWriteError("Guardar valor", error);
}

/** declaresSleepNight: the editor showed which night the sleep value means (#367). Without it nothing is declared. */
export async function saveDailyMetricValues(input: {
  date: string;
  values: Record<string, unknown>;
  declaresSleepNight?: boolean;
}): Promise<void> {
  return saveDailyMetricValuesInternal(input, false);
}

/** History can correct an archived metric only when that date already has a row. */
export async function saveHistoricalDailyMetricValues(input: {
  date: string;
  values: Record<string, unknown>;
  declaresSleepNight?: boolean;
}): Promise<void> {
  return saveDailyMetricValuesInternal(input, true);
}

async function saveDailyMetricValuesInternal(input: {
  date: string;
  values: Record<string, unknown>;
  declaresSleepNight?: boolean;
}, historical: boolean): Promise<void> {
  const auth = await context();
  const { supabase, userId } = auth;
  if (!ISO_DATE.test(input.date)) throw new Error("Fecha inválida. Usá YYYY-MM-DD.");
  const metricIds = Object.keys(input.values);
  if (!metricIds.length) return;

  const metricsQuery = supabase.from("user_metrics").select("id,value_type,is_active,system_key")
    .eq("user_id", userId).in("id", metricIds);
  const [metrics, existing] = await Promise.all([
    historical ? metricsQuery : metricsQuery.eq("is_active", true),
    historical
      ? supabase.from("daily_metric_values").select("metric_id")
        .eq("user_id", userId).eq("metric_date", input.date).in("metric_id", metricIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (metrics.error) throw new Error(`Leer métricas disponibles: ${metrics.error.message}`);
  if (existing.error) throw new Error(`Leer valores históricos: ${existing.error.message}`);
  if ((metrics.data ?? []).length !== new Set(metricIds).size) {
    throw new Error("Una métrica ya no está activa o disponible.");
  }
  if (historical) {
    const existingIds = new Set((existing.data ?? []).map((row) => String(row.metric_id)));
    const invalidArchived = (metrics.data ?? []).some((metric) => !metric.is_active && !existingIds.has(String(metric.id)));
    if (invalidArchived) throw new Error("Una métrica archivada sólo puede corregirse si ya tenía un valor ese día.");
  }

  const parsed = (metrics.data ?? []).map((metric) => ({
    metricId: String(metric.id),
    value: parseDailyMetricValue(input.values[String(metric.id)], metric.value_type as MetricValueType),
  }));
  await measurePerformance({
    route: historical ? "/history" : "/today",
    operation: "metrics.save",
    layer: "database",
    ...auth.requestPerformance,
  }, async () => {
    const values = Object.fromEntries(parsed.map((item) => [item.metricId, item.value]));
    // The night is declared with the write, in its transaction, and only for a sleep value this save sets.
    const sleepNights = input.declaresSleepNight ? (metrics.data ?? [])
      .filter((metric) => metric.system_key === "sleep" && values[String(metric.id)] !== null).map((metric) => String(metric.id)) : [];
    const saved = sleepNights.length
      ? await supabase.rpc("save_daily_metric_values_v2", { p_metric_date: input.date, p_values: values, p_historical: historical, p_sleep_night_metric_ids: sleepNights })
      : await supabase.rpc("save_daily_metric_values", { p_metric_date: input.date, p_values: values, p_historical: historical });
    if (saved.error) {
      throw metricWriteError("Guardar valores diarios", saved.error, saved.error);
    }
  });
}
