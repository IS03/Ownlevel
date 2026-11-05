import {
  createClient,
  type AuthenticatedRequestContext,
} from "@/lib/supabase/server";
import type { DayLog, MealEntry, NutritionPrecision } from "./types";
import {
  isMostRecentWeightEntry,
  parseOptionalWeight,
  type WeightHistoryPoint,
} from "../weight-history";
import { todayInCordoba } from "../phase2/cordoba-date";
import {
  nullableMealMacrosMatch,
  normalizeMealText,
  optionalMealMacro,
  requiredMealCalories,
} from "../nutrition/meal-macros";

export type IsoDate = `${number}-${number}-${number}`; // YYYY-MM-DD

function assertIsoDate(date: string): asserts date is IsoDate {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error("Fecha inválida. Usá YYYY-MM-DD.");
  }
}

/** Body weight is recorded only up to today's product day (America/Argentina/Cordoba). */
function assertNotFutureWeightDate(date: string): void {
  if (date > todayInCordoba()) throw new Error("No se puede registrar peso en una fecha futura.");
}

async function getAuthedUserId() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error) throw new Error(`Auth falló: ${error.message}`);
  if (!user) throw new Error("No autenticado.");
  return user.id;
}

export async function getOrCreateDayLog(
  date: string,
  context?: AuthenticatedRequestContext,
): Promise<DayLog> {
  assertIsoDate(date);
  const supabase = context?.supabase ?? await createClient();
  if (!context) await getAuthedUserId();

  const { data, error } = await supabase.rpc("get_or_create_day_log", {
    p_log_date: date,
  });

  if (error) {
    throw new Error(`RPC get_or_create_day_log: ${error.message}`, { cause: error });
  }

  return data as DayLog;
}

export type CreateMealInput = {
  date: string;
  consumed_at?: string;
  title?: string;
  description?: string;
  final_calories: number;
  final_protein_g?: number | null;
  final_carbs_g?: number | null;
  final_fat_g?: number | null;
  precision_level?: NutritionPrecision | null;
  context_type?: string | null;
  source_note?: string | null;
  idempotencyKey?: string;
};

function normalizedIdempotencyKey(value: string | undefined): string | null {
  if (value === undefined) return null;
  const key = value.trim();
  if (!key || key.length > 128 || !/^[A-Za-z0-9._:-]+$/.test(key)) {
    throw new Error("La operación de creación no es válida.");
  }
  return key;
}

/** Título o descripción nuevos coinciden con el registro (ya normalizado en BD). */
function newMealTextMatchesExisting(
  newTitle: string,
  newDescription: string,
  existing: { title: string | null; description: string | null },
): boolean {
  const nt = normalizeMealText(newTitle);
  const nd = normalizeMealText(newDescription);
  const et = existing.title;
  const ed = existing.description;
  const titleMatch = nt != null && et != null && nt === et;
  const descMatch = nd != null && ed != null && nd === ed;
  return titleMatch || descMatch;
}

export const DUPLICATE_MEAL_LOOKBACK_MS = 60_000;

/**
 * Busca otra comida no borrada en el mismo día, misma carga numérica, texto
 * coincidente (título o descripción) y creada hace poco. Para evitar dobles
 * accidentales, no reemplaza una validación estricta en el servidor.
 */
export async function findRecentPossibleDuplicateMeal(input: {
  date: string;
  title?: string;
  description?: string;
  final_calories: number;
  final_protein_g?: number | null;
  final_carbs_g?: number | null;
  final_fat_g?: number | null;
}): Promise<MealEntry | null> {
  assertIsoDate(input.date);
  const dayLog = await getOrCreateDayLog(input.date);
  const supabase = await createClient();
  const userId = await getAuthedUserId();
  const cutoff = new Date(Date.now() - DUPLICATE_MEAL_LOOKBACK_MS).toISOString();
  const kcal = Math.trunc(input.final_calories);

  const { data, error } = await supabase
    .from("meal_entries")
    .select("*")
    .eq("day_log_id", dayLog.id)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .gte("created_at", cutoff)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Buscar duplicado reciente: ${error.message}`);

  const t = input.title ?? "";
  const d = input.description ?? "";

  for (const row of data ?? []) {
    const m = row as MealEntry;
    if (m.final_calories == null) continue;
    if (Math.trunc(m.final_calories) !== kcal) continue;
    if (!nullableMealMacrosMatch(input.final_protein_g, m.final_protein_g)) {
      continue;
    }
    if (!nullableMealMacrosMatch(input.final_carbs_g, m.final_carbs_g)) {
      continue;
    }
    if (!nullableMealMacrosMatch(input.final_fat_g, m.final_fat_g)) {
      continue;
    }
    if (!newMealTextMatchesExisting(t, d, m)) continue;
    return m;
  }
  return null;
}

export async function createMeal(
  input: CreateMealInput,
  context?: AuthenticatedRequestContext,
): Promise<MealEntry> {
  assertIsoDate(input.date);
  const calories = requiredMealCalories(input.final_calories);
  const protein = optionalMealMacro(input.final_protein_g, "Proteína");
  const carbs = optionalMealMacro(input.final_carbs_g, "Carbohidratos");
  const fat = optionalMealMacro(input.final_fat_g, "Grasas");
  const idempotencyKey = normalizedIdempotencyKey(input.idempotencyKey);
  const dayLog = await getOrCreateDayLog(input.date, context);
  const supabase = context?.supabase ?? await createClient();
  const userId = context?.userId ?? await getAuthedUserId();

  const { data, error } = await supabase
    .from("meal_entries")
    .insert({
      user_id: userId,
      day_log_id: dayLog.id,
      consumed_at: input.consumed_at ?? new Date().toISOString(),
      // The app's clock filled it in. A time passed by a caller says nothing about who chose it, so it stays unknown.
      consumed_at_source: input.consumed_at ? null : "default_clock",
      title: input.title ?? null,
      description: input.description ?? null,
      final_calories: calories,
      final_protein_g: protein,
      final_carbs_g: carbs,
      final_fat_g: fat,
      precision_level: input.precision_level ?? null,
      context_type: input.context_type ?? null,
      source_note: input.source_note ?? null,
      source_type: "manual",
      entry_kind: "meal",
      idempotency_key: idempotencyKey,
    })
    .select("*")
    .single();

  if (error && idempotencyKey) {
    const existing = await supabase
      .from("meal_entries")
      .select("*")
      .eq("user_id", userId)
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();
    if (!existing.error && existing.data) return existing.data as MealEntry;
  }
  if (error) throw new Error(`Crear meal_entries: ${error.message}`, { cause: error });
  return data as MealEntry;
}

/**
 * Crea una nueva comida manual desde una entrada propia, activa y elegible.
 * La carga nutricional se obtiene siempre del servidor; el navegador sólo
 * identifica la comida fuente.
 */
export async function quickAddMeal(
  sourceMealId: string,
  date: string,
  context?: AuthenticatedRequestContext,
  idempotencyKey?: string,
): Promise<MealEntry> {
  if (!sourceMealId) throw new Error("Comida rápida inválida.");
  assertIsoDate(date);

  const supabase = context?.supabase ?? await createClient();
  const userId = context?.userId ?? await getAuthedUserId();
  const { data, error } = await supabase
    .from("meal_entries")
    .select("title, description, final_calories, final_protein_g, final_carbs_g, final_fat_g")
    .eq("id", sourceMealId)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .eq("entry_kind", "meal")
    .eq("source_type", "manual")
    .maybeSingle();

  if (error) throw new Error(`Buscar comida rápida: ${error.message}`);
  if (!data) throw new Error("Esta comida rápida ya no está disponible.");

  return createMeal({
    date,
    title: data.title ?? undefined,
    description: data.description ?? undefined,
    final_calories: data.final_calories,
    final_protein_g: data.final_protein_g,
    final_carbs_g: data.final_carbs_g,
    final_fat_g: data.final_fat_g,
    idempotencyKey,
  }, context);
}

export type UpdateMealInput = {
  id: string;
  date?: string;
  title?: string | null;
  description?: string | null;
  final_calories?: number | null;
  final_protein_g?: number | null;
  final_carbs_g?: number | null;
  final_fat_g?: number | null;
};

export class MealNotFoundError extends Error {
  constructor() {
    super("La comida no existe o ya no está disponible.");
    this.name = "MealNotFoundError";
  }
}

export async function updateMeal(
  input: UpdateMealInput,
  context?: AuthenticatedRequestContext,
): Promise<MealEntry> {
  const supabase = context?.supabase ?? await createClient();
  const userId = context?.userId ?? await getAuthedUserId();

  const patch: Record<string, unknown> = {};
  if (input.date !== undefined) {
    assertIsoDate(input.date);
    const destinationDay = await getOrCreateDayLog(input.date, context);
    patch.day_log_id = destinationDay.id;
  }
  if (input.title !== undefined) patch.title = input.title;
  if (input.description !== undefined) patch.description = input.description;
  if (input.final_calories !== undefined) {
    patch.final_calories = requiredMealCalories(input.final_calories);
  }
  if (input.final_protein_g !== undefined)
    patch.final_protein_g = optionalMealMacro(input.final_protein_g, "Proteína");
  if (input.final_carbs_g !== undefined)
    patch.final_carbs_g = optionalMealMacro(input.final_carbs_g, "Carbohidratos");
  if (input.final_fat_g !== undefined)
    patch.final_fat_g = optionalMealMacro(input.final_fat_g, "Grasas");

  const { data, error } = await supabase
    .from("meal_entries")
    .update(patch)
    .eq("id", input.id)
    .eq("user_id", userId)
    .select("*")
    .maybeSingle();

  if (error) throw new Error(`Editar meal_entries: ${error.message}`);
  if (!data) throw new MealNotFoundError();
  return data as MealEntry;
}

export async function softDeleteMeal(
  id: string,
  context?: AuthenticatedRequestContext,
): Promise<void> {
  const supabase = context?.supabase ?? await createClient();
  const userId = context?.userId ?? await getAuthedUserId();

  const { data, error } = await supabase
    .from("meal_entries")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle();

  if (error) throw new Error(`Soft delete meal_entries: ${error.message}`);
  if (!data) throw new MealNotFoundError();
}

export async function listRecentDays(limit = 14): Promise<DayLog[]> {
  const supabase = await createClient();
  const userId = await getAuthedUserId();

  const { data, error } = await supabase
    .from("day_logs")
    .select("*")
    .eq("user_id", userId)
    .order("log_date", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Leer day_logs: ${error.message}`);
  return (data ?? []) as DayLog[];
}

export async function listWeightHistory(limit = 366, context?: AuthenticatedRequestContext): Promise<WeightHistoryPoint[]> {
  const supabase = context?.supabase ?? await createClient();
  const userId = context?.userId ?? await getAuthedUserId();
  const safeLimit = Math.min(Math.max(limit, 1), 1000);

  const { data, error } = await supabase
    .from("day_logs")
    .select("id, log_date, weight_kg")
    .eq("user_id", userId)
    .not("weight_kg", "is", null)
    .order("log_date", { ascending: true })
    .limit(safeLimit);

  if (error) throw new Error(`Leer historial de peso: ${error.message}`);
  return (data ?? []) as WeightHistoryPoint[];
}

export async function getLatestWeightHistoryEntry(): Promise<WeightHistoryPoint | null> {
  const supabase = await createClient();
  const userId = await getAuthedUserId();
  const { data, error } = await supabase
    .from("day_logs")
    .select("id, log_date, weight_kg")
    .eq("user_id", userId)
    .not("weight_kg", "is", null)
    .order("log_date", { ascending: false })
    .limit(1);

  if (error) throw new Error(`Leer último peso histórico: ${error.message}`);
  return ((data ?? [])[0] ?? null) as WeightHistoryPoint | null;
}

export type WeightHistoryMutation = {
  entry: WeightHistoryPoint | null;
  currentWeightKg: number | null;
  syncedCurrentWeight: boolean;
};

export async function recordWeightForDate(input: {
  date: string;
  weightKg: number;
}): Promise<WeightHistoryMutation> {
  assertIsoDate(input.date);
  assertNotFutureWeightDate(input.date);
  const parsed = parseOptionalWeight(String(input.weightKg));
  if (!parsed.ok || parsed.value === null) {
    throw new Error(parsed.ok ? "El peso es obligatorio." : parsed.error);
  }

  const dayLog = await getOrCreateDayLog(input.date);
  const supabase = await createClient();
  const userId = await getAuthedUserId();
  const { data, error } = await supabase
    .from("day_logs")
    .update({ weight_kg: parsed.value })
    .eq("id", dayLog.id)
    .eq("user_id", userId)
    .select("id, log_date, weight_kg")
    .single();

  if (error) throw new Error(`Guardar peso histórico: ${error.message}`);
  const entry = data as WeightHistoryPoint;
  const latest = await getLatestWeightHistoryEntry();
  const syncedCurrentWeight = isMostRecentWeightEntry(entry.log_date, latest?.log_date ?? null);
  return {
    entry,
    currentWeightKg: syncedCurrentWeight ? entry.weight_kg : null,
    syncedCurrentWeight,
  };
}

export async function updateWeightHistoryEntry(input: {
  logDate: string;
  weightKg: number;
}): Promise<WeightHistoryMutation> {
  assertIsoDate(input.logDate);
  assertNotFutureWeightDate(input.logDate);
  const parsed = parseOptionalWeight(String(input.weightKg));
  if (!parsed.ok || parsed.value === null) {
    throw new Error(parsed.ok ? "El peso es obligatorio." : parsed.error);
  }

  const supabase = await createClient();
  const userId = await getAuthedUserId();
  const { data, error } = await supabase
    .from("day_logs")
    .update({ weight_kg: parsed.value })
    .eq("user_id", userId)
    .eq("log_date", input.logDate)
    .select("id, log_date, weight_kg")
    .single();

  if (error) throw new Error(`Editar peso histórico: ${error.message}`);
  const entry = data as WeightHistoryPoint;
  const latest = await getLatestWeightHistoryEntry();
  const syncedCurrentWeight = isMostRecentWeightEntry(entry.log_date, latest?.log_date ?? null);
  return {
    entry,
    currentWeightKg: syncedCurrentWeight ? entry.weight_kg : null,
    syncedCurrentWeight,
  };
}

export async function deleteWeightHistoryEntry(logDate: string): Promise<WeightHistoryMutation> {
  assertIsoDate(logDate);
  const latestBefore = await getLatestWeightHistoryEntry();
  const supabase = await createClient();
  const userId = await getAuthedUserId();
  const { error } = await supabase
    .from("day_logs")
    .update({ weight_kg: null })
    .eq("user_id", userId)
    .eq("log_date", logDate);

  if (error) throw new Error(`Eliminar peso histórico: ${error.message}`);
  if (!isMostRecentWeightEntry(logDate, latestBefore?.log_date ?? null)) {
    return { entry: null, currentWeightKg: null, syncedCurrentWeight: false };
  }

  const latestAfter = await getLatestWeightHistoryEntry();
  const nextWeight = latestAfter?.weight_kg ?? null;
  return { entry: null, currentWeightKg: nextWeight, syncedCurrentWeight: true };
}
