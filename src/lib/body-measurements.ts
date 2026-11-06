import { createClient, type AuthenticatedRequestContext } from "@/lib/supabase/server";
import { todayInCordoba } from "@/lib/phase2/cordoba-date";
import {
  BODY_MEASUREMENT_FIELDS,
  type BodyMeasurement,
  type BodyMeasurementInput,
} from "./body-measurement-types";

export {
  BODY_MEASUREMENT_FIELDS,
  type BodyMeasurement,
  type BodyMeasurementField,
  type BodyMeasurementInput,
} from "./body-measurement-types";

type RawMeasurementInput = {
  measuredOn: string;
  waistCm?: string | null;
  abdomenCm?: string | null;
  chestCm?: string | null;
  armCm?: string | null;
  armRightCm?: string | null;
  armLeftCm?: string | null;
  thighCm?: string | null;
  thighRightCm?: string | null;
  thighLeftCm?: string | null;
  calfRightCm?: string | null;
  calfLeftCm?: string | null;
  hipCm?: string | null;
  condition?: string | null;
  notes?: string | null;
};

const MAX_MEASUREMENT_CM = 500;

function assertIsoDate(value: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("Fecha inválida. Usá YYYY-MM-DD.");
  }
}

function parseMeasurement(value: string | null | undefined, label: string): number | null {
  const raw = value?.trim() ?? "";
  if (!raw) return null;
  const parsed = Number(raw.replace(",", "."));
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > MAX_MEASUREMENT_CM) {
    throw new Error(`${label} debe ser un número mayor a 0 y hasta ${MAX_MEASUREMENT_CM} cm.`);
  }
  const rounded = Math.round(parsed * 100) / 100;
  if (Math.abs(parsed - rounded) > Number.EPSILON) {
    throw new Error(`${label} puede tener como máximo dos decimales.`);
  }
  return rounded;
}

export function parseBodyMeasurementInput(input: RawMeasurementInput, today = todayInCordoba()): BodyMeasurementInput {
  assertIsoDate(input.measuredOn);
  if (input.measuredOn > today) throw new Error("No se pueden registrar medidas en una fecha futura.");
  const result: BodyMeasurementInput = {
    measuredOn: input.measuredOn,
    waistCm: parseMeasurement(input.waistCm, "Cintura"),
    abdomenCm: parseMeasurement(input.abdomenCm, "Abdomen"),
    chestCm: parseMeasurement(input.chestCm, "Pecho"),
    armCm: parseMeasurement(input.armCm, "Brazo"),
    armRightCm: parseMeasurement(input.armRightCm, "Brazo derecho"),
    armLeftCm: parseMeasurement(input.armLeftCm, "Brazo izquierdo"),
    thighCm: parseMeasurement(input.thighCm, "Muslo"),
    thighRightCm: parseMeasurement(input.thighRightCm, "Muslo derecho"),
    thighLeftCm: parseMeasurement(input.thighLeftCm, "Muslo izquierdo"),
    calfRightCm: parseMeasurement(input.calfRightCm, "Pantorrilla derecha"),
    calfLeftCm: parseMeasurement(input.calfLeftCm, "Pantorrilla izquierda"),
    hipCm: parseMeasurement(input.hipCm, "Cadera"),
    condition: input.condition?.trim() || null,
    notes: input.notes?.trim() || null,
  };
  const inputKeys: Record<(typeof BODY_MEASUREMENT_FIELDS)[number], keyof BodyMeasurementInput> = {
    waist_cm: "waistCm", abdomen_cm: "abdomenCm", chest_cm: "chestCm",
    arm_cm: "armCm", arm_right_cm: "armRightCm", arm_left_cm: "armLeftCm",
    thigh_cm: "thighCm", thigh_right_cm: "thighRightCm", thigh_left_cm: "thighLeftCm",
    calf_right_cm: "calfRightCm", calf_left_cm: "calfLeftCm", hip_cm: "hipCm",
  };
  if (BODY_MEASUREMENT_FIELDS.every((field) => result[inputKeys[field]] === null)) {
    throw new Error("Registrá al menos una medida corporal.");
  }
  return result;
}

async function getAuthedContext(context?: AuthenticatedRequestContext) {
  if (context) return { supabase: context.supabase, userId: context.userId };
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error) throw new Error(`Autenticación: ${error.message}`);
  if (!user) throw new Error("No autenticado.");
  return { supabase, userId: user.id };
}

function rowPayload(input: BodyMeasurementInput, { preserveLegacy = false } = {}) {
  return {
    measured_on: input.measuredOn,
    waist_cm: input.waistCm,
    abdomen_cm: input.abdomenCm,
    chest_cm: input.chestCm,
    ...(preserveLegacy ? {} : { arm_cm: input.armCm }),
    arm_right_cm: input.armRightCm,
    arm_left_cm: input.armLeftCm,
    ...(preserveLegacy ? {} : { thigh_cm: input.thighCm }),
    thigh_right_cm: input.thighRightCm,
    thigh_left_cm: input.thighLeftCm,
    calf_right_cm: input.calfRightCm,
    calf_left_cm: input.calfLeftCm,
    hip_cm: input.hipCm,
    condition: input.condition,
    notes: input.notes,
  };
}

export function bodyMeasurementMatchesInput(
  measurement: BodyMeasurement,
  input: BodyMeasurementInput,
): boolean {
  const expected = rowPayload(input);
  return Object.entries(expected).every(
    ([field, value]) => measurement[field as keyof BodyMeasurement] === value,
  );
}

/**
 * The newest `limit` measurements, oldest first. Only for a recent window. Analysis reads listAllBodyMeasurements: a window
 * would lose references it needs (the previous period, the first record of a long one).
 */
export async function listBodyMeasurements(limit = 366, context?: AuthenticatedRequestContext): Promise<BodyMeasurement[]> {
  const { supabase, userId } = await getAuthedContext(context);
  const safeLimit = Math.min(Math.max(limit, 1), 1000);
  const { data, error } = await supabase
    .from("body_measurements")
    .select("*")
    .eq("user_id", userId)
    .order("measured_on", { ascending: false })
    .order("id", { ascending: false })
    .limit(safeLimit);
  if (error) throw new Error(`Leer medidas corporales: ${error.message}`);
  return ((data ?? []) as BodyMeasurement[]).reverse();
}

export const BODY_MEASUREMENT_PAGE = 1000;
/** Far beyond any real history. Past it the read fails instead of returning part of it. */
export const BODY_MEASUREMENT_MAX_PAGES = 100;
const CURSOR_DATE = /^\d{4}-\d{2}-\d{2}$/;
const CURSOR_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Every measurement, oldest first, in keyset pages on (measured_on, id). The schema keeps one per user and date
 * (body_measurements_user_date_unique), but the cursor does not rely on it: with the id as tie-breaker a repeated date
 * is never skipped or repeated. It stops on an empty page, so a server row cap below the page size cannot end it early,
 * and it throws instead of returning a truncated history or reading a failure as an empty one. Suspect rows come back
 * too: the analysis excludes and counts them.
 */
export async function listAllBodyMeasurements(context?: AuthenticatedRequestContext): Promise<BodyMeasurement[]> {
  const { supabase, userId } = await getAuthedContext(context);
  const rows: BodyMeasurement[] = [];
  let cursor: { date: string; id: string } | null = null;
  for (let page = 0; page < BODY_MEASUREMENT_MAX_PAGES; page++) {
    let query = supabase.from("body_measurements").select("*").eq("user_id", userId);
    if (cursor) {
      // Both values come from rows just read; checked anyway, since they are written into a filter.
      if (!CURSOR_DATE.test(cursor.date) || !CURSOR_ID.test(cursor.id)) throw new Error("Leer medidas corporales: cursor no válido.");
      query = query.or(`measured_on.gt.${cursor.date},and(measured_on.eq.${cursor.date},id.gt.${cursor.id})`);
    }
    const { data, error } = await query
      .order("measured_on", { ascending: true })
      .order("id", { ascending: true })
      .limit(BODY_MEASUREMENT_PAGE);
    if (error) throw new Error(`Leer medidas corporales: ${error.message}`);
    const batch = (data ?? []) as BodyMeasurement[];
    if (batch.length === 0) return rows;
    rows.push(...batch);
    const last = batch.at(-1)!;
    cursor = { date: last.measured_on, id: last.id };
  }
  throw new Error("Leer medidas corporales: el historial supera el máximo que se puede leer completo.");
}

export async function getLatestBodyMeasurement(): Promise<BodyMeasurement | null> {
  const { supabase, userId } = await getAuthedContext();
  const { data, error } = await supabase
    .from("body_measurements")
    .select("*")
    .eq("user_id", userId)
    .order("measured_on", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Leer última medida corporal: ${error.message}`);
  return (data as BodyMeasurement | null) ?? null;
}

export async function upsertBodyMeasurement(
  input: BodyMeasurementInput,
  context?: AuthenticatedRequestContext,
): Promise<BodyMeasurement> {
  const { supabase, userId } = await getAuthedContext(context);
  const { data, error } = await supabase
    .from("body_measurements")
    .insert({ user_id: userId, ...rowPayload(input) })
    .select("*")
    .single();
  if (error) {
    const existing = await supabase
      .from("body_measurements")
      .select("*")
      .eq("user_id", userId)
      .eq("measured_on", input.measuredOn)
      .maybeSingle();
    if (!existing.error && existing.data) {
      const measurement = existing.data as BodyMeasurement;
      if (bodyMeasurementMatchesInput(measurement, input)) return measurement;
      throw new Error("Ya existe una medición para esa fecha. Editá la existente o elegí otra fecha.");
    }
    throw new Error(`Guardar medidas corporales: ${error.message}`, { cause: error });
  }
  return data as BodyMeasurement;
}

export async function updateBodyMeasurement(
  input: BodyMeasurementInput & { id: string },
  context?: AuthenticatedRequestContext,
): Promise<BodyMeasurement> {
  const { supabase, userId } = await getAuthedContext(context);
  const { data, error } = await supabase
    .from("body_measurements")
    // A saved correction verifies a suspect measurement; import provenance stays.
    .update({ ...rowPayload(input, { preserveLegacy: true }), quality_status: "verified", quality_note: null })
    .eq("id", input.id)
    .eq("user_id", userId)
    .select("*")
    .single();
  if (error) throw new Error(`Editar medidas corporales: ${error.message}`);
  return data as BodyMeasurement;
}

export async function deleteBodyMeasurement(id: string): Promise<void> {
  const { supabase, userId } = await getAuthedContext();
  const { error } = await supabase
    .from("body_measurements")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);
  if (error) throw new Error(`Eliminar medidas corporales: ${error.message}`);
}
