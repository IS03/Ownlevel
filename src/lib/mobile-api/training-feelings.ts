import { MobileApiValidationError } from "./auth";
import { parseMobileIdempotencyKey, parseMobileTrainingId } from "./training";
import { parseSessionVersion } from "./training-session";

export const TRAINING_FEELINGS_CONTRACT = "training-feelings/1" as const;
export const FEELING_KEYS = ["energyPre", "fatiguePre", "energyPost", "fatiguePost"] as const;
export type FeelingKey = typeof FEELING_KEYS[number];
export type FeelingFact = {
  value: number;
  instrumentVersion: "energy-fatigue/1";
  declaredMoment: "pre" | "post";
  declaredAt: string | null;
  capturedAt: string | null;
  source: "mobile" | "web";
};
export type StoredFeelingFact = FeelingFact & { receivedAt: string; temporalQuality: "unknown" | "unverified_client_clock" };
export type FeelingPatch = Partial<Record<FeelingKey, ({ op: "set" } & FeelingFact) | { op: "clear" }>>;
type CommonInput = {
  contractVersion: typeof TRAINING_FEELINGS_CONTRACT;
  expectedRevision: number;
  patch: FeelingPatch;
  idempotencyKey: string;
};
export type FeelingsSaveInput = CommonInput & { operation: "save" };
export type FeelingsFinishInput = CommonInput & {
  operation: "finish";
  expectedSessionUpdatedAt: string;
  /** Omission preserves the legacy value; null explicitly clears it. No aliases to new facts. */
  metadata: Partial<{ energyLevel: number | null; performanceLevel: number | null; painLevel: number | null; notes: string | null }>;
};
export type FeelingsResponse = {
  contractVersion: typeof TRAINING_FEELINGS_CONTRACT;
  sessionId: string;
  sessionStatus: "in_progress" | "completed" | "discarded";
  sessionUpdatedAt: string;
  endedAt: string | null;
  revision: number;
  values: Partial<Record<FeelingKey, StoredFeelingFact>>;
};

function invalid(): never { throw new MobileApiValidationError("Los datos de sensaciones no son válidos."); }
function object(value: unknown, allowed: readonly string[], required = allowed): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalid();
  const row = value as Record<string, unknown>;
  if (Object.keys(row).some(key => !allowed.includes(key)) || required.some(key => !Object.hasOwn(row, key))) return invalid();
  return row;
}
function revision(value: unknown, max = Number.MAX_SAFE_INTEGER): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value > max) return invalid();
  return value;
}
function timestamp(value: unknown): string {
  if (typeof value !== "string" || !/T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return invalid();
  return parseSessionVersion(value);
}
const FACT_KEYS = ["value", "instrumentVersion", "declaredMoment", "declaredAt", "capturedAt", "source"] as const;
function fact(value: unknown, key: FeelingKey, stored = false): FeelingFact | StoredFeelingFact {
  const row = object(value, stored ? [...FACT_KEYS, "receivedAt", "temporalQuality"] : FACT_KEYS);
  const moment = key.endsWith("Pre") ? "pre" : "post";
  if (typeof row.value !== "number" || !Number.isInteger(row.value) || row.value < 1 || row.value > 5
    || row.instrumentVersion !== "energy-fatigue/1" || row.declaredMoment !== moment
    || (row.source !== "web" && row.source !== "mobile")) return invalid();
  const parsed: FeelingFact = { value: row.value, instrumentVersion: row.instrumentVersion, declaredMoment: moment,
    declaredAt: row.declaredAt === null ? null : timestamp(row.declaredAt),
    capturedAt: row.capturedAt === null ? null : timestamp(row.capturedAt), source: row.source };
  if (!stored) return parsed;
  const quality = parsed.capturedAt === null ? "unknown" : "unverified_client_clock";
  if (row.temporalQuality !== quality) return invalid();
  return { ...parsed, receivedAt: timestamp(row.receivedAt), temporalQuality: quality };
}

export function parseFeelingsInput(value: unknown, operation: "save"): FeelingsSaveInput;
export function parseFeelingsInput(value: unknown, operation: "finish"): FeelingsFinishInput;
export function parseFeelingsInput(value: unknown, operation: "save" | "finish"): FeelingsSaveInput | FeelingsFinishInput {
  const keys = ["contractVersion", "operation", "expectedRevision", "patch", "idempotencyKey"];
  const row = object(value, operation === "finish" ? [...keys, "expectedSessionUpdatedAt", "metadata"] : keys);
  if (row.contractVersion !== TRAINING_FEELINGS_CONTRACT || row.operation !== operation) return invalid();
  const sourcePatch = object(row.patch, FEELING_KEYS, []), patch: FeelingPatch = {};
  for (const key of FEELING_KEYS) {
    if (!Object.hasOwn(sourcePatch, key)) continue;
    const entry = object(sourcePatch[key], ["op", ...FACT_KEYS], ["op"]);
    if (entry.op === "clear") { object(entry, ["op"]); patch[key] = { op: "clear" }; }
    else if (entry.op === "set") {
      const fields = { ...entry }; delete fields.op;
      patch[key] = { op: "set", ...fact(fields, key) };
    } else return invalid();
  }
  const common: CommonInput = { contractVersion: TRAINING_FEELINGS_CONTRACT, expectedRevision: revision(row.expectedRevision, Number.MAX_SAFE_INTEGER - 1),
    patch, idempotencyKey: parseMobileIdempotencyKey(row.idempotencyKey) };
  if (operation === "save") return { ...common, operation };
  const metadata = object(row.metadata, ["energyLevel", "performanceLevel", "painLevel", "notes"], []);
  for (const [key, value] of Object.entries(metadata)) {
    if (value === null) continue;
    if (key === "notes") { if (typeof value !== "string" || value.length > 10000) return invalid(); }
    else if (typeof value !== "number" || !Number.isInteger(value) || value < (key === "painLevel" ? 0 : 1) || value > (key === "painLevel" ? 10 : 5)) return invalid();
  }
  return { ...common, operation, expectedSessionUpdatedAt: timestamp(row.expectedSessionUpdatedAt), metadata };
}

export function parseFeelingsResponse(value: unknown): FeelingsResponse {
  const row = object(value, ["contractVersion", "sessionId", "sessionStatus", "sessionUpdatedAt", "endedAt", "revision", "values"]);
  if (row.contractVersion !== TRAINING_FEELINGS_CONTRACT || !["in_progress", "completed", "discarded"].includes(String(row.sessionStatus))) return invalid();
  const inputValues = object(row.values, FEELING_KEYS, []), values: FeelingsResponse["values"] = {};
  for (const key of FEELING_KEYS) if (Object.hasOwn(inputValues, key)) values[key] = fact(inputValues[key], key, true) as StoredFeelingFact;
  if (row.sessionStatus === "completed" && row.endedAt === null) return invalid();
  return { contractVersion: TRAINING_FEELINGS_CONTRACT, sessionId: parseMobileTrainingId(row.sessionId, "La sesión").toLowerCase(),
    sessionStatus: row.sessionStatus as FeelingsResponse["sessionStatus"], sessionUpdatedAt: timestamp(row.sessionUpdatedAt),
    endedAt: row.endedAt === null ? null : timestamp(row.endedAt), revision: revision(row.revision), values };
}
