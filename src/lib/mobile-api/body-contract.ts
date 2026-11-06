// M5.1 Body contract, shared by the Mobile API adapter and Expo (pure; no server imports).
// missing != zero: every absent weight/measurement is null, never 0.
import { isNutritionDate } from "./nutrition-day-contract";

export const BODY_MEASUREMENT_FIELDS = [
  "waistCm", "abdomenCm", "chestCm", "hipCm", "armRightCm", "armLeftCm",
  "thighRightCm", "thighLeftCm", "calfRightCm", "calfLeftCm",
] as const;
export type BodyMeasurementField = (typeof BODY_MEASUREMENT_FIELDS)[number];
export const BODY_MEASUREMENT_LABELS: Record<BodyMeasurementField | "armCm" | "thighCm", string> = {
  waistCm: "Cintura", abdomenCm: "Abdomen", chestCm: "Pecho", hipCm: "Cadera",
  armRightCm: "Brazo derecho", armLeftCm: "Brazo izquierdo", thighRightCm: "Muslo derecho", thighLeftCm: "Muslo izquierdo",
  calfRightCm: "Pantorrilla derecha", calfLeftCm: "Pantorrilla izquierda", armCm: "Brazo", thighCm: "Muslo",
};
export const BODY_WEIGHT_MAX_KG = 999.99;
export const BODY_MEASUREMENT_MAX_CM = 500;

export type BodyWeightEntry = { date: string; weightKg: number };
export type BodyMeasurement = Record<BodyMeasurementField, number | null> & {
  id: string; measuredOn: string; armCm: number | null; thighCm: number | null;
  condition: string | null; notes: string | null;
  imported: boolean; importSource: string | null;
  qualityStatus: "verified" | "suspect"; qualityNote: string | null; updatedAt: string;
};
export type BodyPage<T> = { items: T[]; nextBefore: string | null };
export type BodyOverview = {
  today: string;
  current: BodyWeightEntry | null;
  profileWeightKg: number | null;
  weights: BodyPage<BodyWeightEntry>;
  measurements: BodyPage<BodyMeasurement>;
};
export type BodyWeightIntent = {
  operation: "set" | "delete"; date: string;
  expectedWeightKg: number | null; weightKg: number | null; idempotencyKey: string;
};
export type BodyWeightReceipt = {
  status: "confirmed"; operation: "set" | "delete"; date: string; weightKg: number | null;
  current: BodyWeightEntry | null; profileWeightKg: number | null; currentWeightChanged: boolean;
};
export type BodyMeasurementFields = Record<BodyMeasurementField, number | null> & {
  measuredOn: string; condition: string | null; notes: string | null;
};
export type BodyMeasurementIntent = {
  operation: "create" | "update" | "delete"; measurementId: string | null; expectedUpdatedAt: string | null;
  fields: BodyMeasurementFields | null; idempotencyKey: string;
};
export type BodyMeasurementReceipt = {
  status: "confirmed"; operation: "create" | "update" | "delete"; measurementId: string; measurement: BodyMeasurement | null;
};
export const BODY_PAGE_SIZES = { weights: 30, measurements: 20 } as const;

export const bodyRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const keys = (v: Record<string, unknown>, names: readonly string[]) => Object.keys(v).length === names.length && names.every(n => n in v);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const KEY = /^[A-Za-z0-9._:-]{1,128}$/;
const twoDecimals = (n: number) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-7;
/** A weight to write: above zero. Reading keeps isBodyWeight, so a stored 0 kg still reads and can be corrected or deleted. */
export const isNewBodyWeight = (v: unknown): v is number => isBodyWeight(v) && v > 0;
export const isBodyWeight = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= BODY_WEIGHT_MAX_KG && twoDecimals(v);
export const isBodyMeasurementCm = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v > 0 && v <= BODY_MEASUREMENT_MAX_CM && twoDecimals(v);
const nullableText = (v: unknown): v is string | null => v === null || typeof v === "string";
export function isBodyTimestamp(v: unknown): v is string {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(v) && Number.isFinite(Date.parse(v));
}

export function parseBodyWeightEntry(v: unknown): BodyWeightEntry | undefined {
  return bodyRecord(v) && keys(v, ["date", "weightKg"]) && isNutritionDate(v.date) && isBodyWeight(v.weightKg) ? { date: v.date, weightKg: v.weightKg } : undefined;
}
const MEASUREMENT_KEYS = ["id", "measuredOn", ...BODY_MEASUREMENT_FIELDS, "armCm", "thighCm", "condition", "notes",
  "imported", "importSource", "qualityStatus", "qualityNote", "updatedAt"] as const;
export function parseBodyMeasurement(v: unknown): BodyMeasurement | undefined {
  if (!bodyRecord(v) || !keys(v, MEASUREMENT_KEYS) || typeof v.id !== "string" || !UUID.test(v.id) || !isNutritionDate(v.measuredOn)
    || ![...BODY_MEASUREMENT_FIELDS, "armCm", "thighCm"].every(k => v[k] === null || isBodyMeasurementCm(v[k]))
    || !nullableText(v.condition) || !nullableText(v.notes) || typeof v.imported !== "boolean" || !nullableText(v.importSource)
    || (v.qualityStatus !== "verified" && v.qualityStatus !== "suspect") || !nullableText(v.qualityNote) || !isBodyTimestamp(v.updatedAt)) return;
  return { ...(v as BodyMeasurement), id: v.id.toLowerCase() };
}
function parsePage<T>(v: unknown, item: (x: unknown) => T | undefined, cursor: (x: T) => string): BodyPage<T> | undefined {
  if (!bodyRecord(v) || !keys(v, ["items", "nextBefore"]) || !Array.isArray(v.items) || (v.nextBefore !== null && !isNutritionDate(v.nextBefore))) return;
  const items = v.items.map(item);
  if (!items.every((x): x is T => x !== undefined)) return;
  // Strictly newest-first and the cursor must be the last item shown.
  const dates = items.map(cursor);
  if (dates.some((d, i) => i > 0 && d >= dates[i - 1])) return;
  if (v.nextBefore !== null && v.nextBefore !== dates.at(-1)) return;
  return { items, nextBefore: v.nextBefore };
}
export const parseBodyWeightPage = (v: unknown) => parsePage(v, parseBodyWeightEntry, e => e.date);
export const parseBodyMeasurementPage = (v: unknown) => parsePage(v, parseBodyMeasurement, m => m.measuredOn);
export function parseBodyOverview(v: unknown): BodyOverview | undefined {
  if (!bodyRecord(v) || !keys(v, ["today", "current", "profileWeightKg", "weights", "measurements"]) || !isNutritionDate(v.today)
    || (v.profileWeightKg !== null && !isBodyWeight(v.profileWeightKg))) return;
  const current = v.current === null ? null : parseBodyWeightEntry(v.current);
  const weights = parseBodyWeightPage(v.weights), measurements = parseBodyMeasurementPage(v.measurements);
  if (current === undefined || !weights || !measurements) return;
  return { today: v.today, current, profileWeightKg: v.profileWeightKg as number | null, weights, measurements };
}

export function parseBodyWeightIntent(v: unknown): BodyWeightIntent | undefined {
  if (!bodyRecord(v) || !keys(v, ["operation", "date", "expectedWeightKg", "weightKg", "idempotencyKey"])
    || (v.operation !== "set" && v.operation !== "delete") || !isNutritionDate(v.date)
    // The expectation may be a stored 0 kg: correcting or deleting it must stay possible. Only a new value must be a weight.
    || (v.expectedWeightKg !== null && !isBodyWeight(v.expectedWeightKg))
    || (v.operation === "set" ? !isNewBodyWeight(v.weightKg) : v.weightKg !== null)
    || typeof v.idempotencyKey !== "string" || !KEY.test(v.idempotencyKey)) return;
  return v as BodyWeightIntent;
}
export function parseBodyWeightReceipt(v: unknown): BodyWeightReceipt | undefined {
  if (!bodyRecord(v) || !keys(v, ["status", "operation", "date", "weightKg", "current", "profileWeightKg", "currentWeightChanged"])
    || v.status !== "confirmed" || (v.operation !== "set" && v.operation !== "delete") || !isNutritionDate(v.date)
    || (v.operation === "set" ? !isBodyWeight(v.weightKg) : v.weightKg !== null)
    || (v.profileWeightKg !== null && !isBodyWeight(v.profileWeightKg)) || typeof v.currentWeightChanged !== "boolean") return;
  const current = v.current === null ? null : parseBodyWeightEntry(v.current);
  return current === undefined ? undefined : { ...(v as BodyWeightReceipt), current };
}
export function parseBodyMeasurementFields(v: unknown): BodyMeasurementFields | undefined {
  if (!bodyRecord(v) || !keys(v, ["measuredOn", ...BODY_MEASUREMENT_FIELDS, "condition", "notes"]) || !isNutritionDate(v.measuredOn)
    || !BODY_MEASUREMENT_FIELDS.every(k => v[k] === null || isBodyMeasurementCm(v[k]))
    || !nullableText(v.condition) || !nullableText(v.notes)
    || (typeof v.condition === "string" && v.condition.length > 2000) || (typeof v.notes === "string" && v.notes.length > 2000)) return;
  return v as BodyMeasurementFields;
}
export function parseBodyMeasurementIntent(v: unknown): BodyMeasurementIntent | undefined {
  if (!bodyRecord(v) || !keys(v, ["operation", "measurementId", "expectedUpdatedAt", "fields", "idempotencyKey"])
    || !["create", "update", "delete"].includes(String(v.operation)) || typeof v.idempotencyKey !== "string" || !KEY.test(v.idempotencyKey)) return;
  const creating = v.operation === "create";
  if (creating ? v.measurementId !== null || v.expectedUpdatedAt !== null
    : typeof v.measurementId !== "string" || !UUID.test(v.measurementId) || !isBodyTimestamp(v.expectedUpdatedAt)) return;
  if (v.operation === "delete") return v.fields === null ? v as BodyMeasurementIntent : undefined;
  const fields = parseBodyMeasurementFields(v.fields);
  return fields ? { ...(v as BodyMeasurementIntent), fields } : undefined;
}
export function parseBodyMeasurementReceipt(v: unknown): BodyMeasurementReceipt | undefined {
  if (!bodyRecord(v) || !keys(v, ["status", "operation", "measurementId", "measurement"]) || v.status !== "confirmed"
    || !["create", "update", "delete"].includes(String(v.operation)) || typeof v.measurementId !== "string" || !UUID.test(v.measurementId)) return;
  if (v.operation === "delete") return v.measurement === null ? { ...(v as BodyMeasurementReceipt), measurementId: v.measurementId.toLowerCase() } : undefined;
  const measurement = parseBodyMeasurement(v.measurement);
  return measurement && measurement.id === v.measurementId.toLowerCase()
    ? { ...(v as BodyMeasurementReceipt), measurementId: measurement.id, measurement } : undefined;
}
