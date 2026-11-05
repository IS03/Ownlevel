// Portable wire contract shared by the API, Web and Expo. #367: the configuration (variant) of an exercise in one session.
// Rules: docs/progress/367-exercise-configuration.md. Unknown is null, never "none", and never read from the catalog.
export class TrainingExerciseConfigurationValidationError extends Error {}
export const TRAINING_EXERCISE_CONFIGURATION_CONTRACT = "training-exercise-configuration/1" as const;
export const CONFIGURATION_LABEL_MAX = 80;

export type ConfigurationSource = "entered" | "repeated_previous";
export type ConfigurationValue =
  | { kind: "recorded"; label: string; source: ConfigurationSource; repeatedFrom: string | null }
  | { kind: "not_applicable"; label: null; source: ConfigurationSource; repeatedFrom: string | null };
export type PreviousConfiguration = {
  sessionExerciseId: string;
  sessionId: string;
  endedAt: string;
  value: { kind: "recorded"; label: string } | { kind: "not_applicable"; label: null };
};
export type ConfigurationItem = {
  sessionExerciseId: string;
  exerciseId: string;
  revision: number;
  /** Null: unknown. Every session recorded before this capture, and any explicitly cleared. */
  value: ConfigurationValue | null;
  /** The single known value of the latest completed session that ended before this one started. An offer, not a fact of this session. */
  previous: PreviousConfiguration | null;
};
export type ConfigurationsResponse = {
  contractVersion: typeof TRAINING_EXERCISE_CONFIGURATION_CONTRACT;
  sessionId: string;
  sessionStatus: "in_progress" | "completed" | "discarded";
  items: ConfigurationItem[];
};
export type ConfigurationInput = {
  contractVersion: typeof TRAINING_EXERCISE_CONFIGURATION_CONTRACT;
  sessionExerciseId: string;
  expectedRevision: number;
  /** Null clears it explicitly. There is no partial update: an omitted field is invalid, not "keep". */
  value: ConfigurationValue | null;
  idempotencyKey: string;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function invalid(): never { throw new TrainingExerciseConfigurationValidationError("La variante no es válida."); }
function object(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalid();
  const row = value as Record<string, unknown>;
  if (Object.keys(row).some(key => !keys.includes(key)) || keys.some(key => !Object.hasOwn(row, key))) return invalid();
  return row;
}
const uuid = (value: unknown) => typeof value === "string" && UUID.test(value) ? value.toLowerCase() : invalid();
function revision(value: unknown, max = Number.MAX_SAFE_INTEGER) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= max ? value : invalid();
}
function timestamp(value: unknown) {
  return typeof value === "string" && /T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value)) ? value : invalid();
}

/** The spelling the database keeps: trimmed, single spaces, no line breaks. Null when nothing is left. */
export function normalizeConfigurationLabel(value: string): string | null {
  const label = value.replace(/\s+/g, " ").trim();
  return label ? label : null;
}
function label(value: unknown) {
  if (typeof value !== "string" || /[\u0000-\u001f\u007f]/.test(value.replace(/\s/g, " "))) return invalid();
  const normalized = normalizeConfigurationLabel(value);
  return normalized && normalized.length <= CONFIGURATION_LABEL_MAX ? normalized : invalid();
}

function parseValue(input: unknown): ConfigurationValue | null {
  if (input === null) return null;
  const row = object(input, ["kind", "label", "source", "repeatedFrom"]);
  if (row.source !== "entered" && row.source !== "repeated_previous") return invalid();
  const repeatedFrom = row.source === "repeated_previous" ? uuid(row.repeatedFrom) : row.repeatedFrom === null ? null : invalid();
  if (row.kind === "recorded") return { kind: "recorded", label: label(row.label), source: row.source, repeatedFrom };
  if (row.kind === "not_applicable" && row.label === null) return { kind: "not_applicable", label: null, source: row.source, repeatedFrom };
  return invalid();
}

export function parseConfigurationInput(value: unknown): ConfigurationInput {
  const row = object(value, ["contractVersion", "sessionExerciseId", "expectedRevision", "value", "idempotencyKey"]);
  if (row.contractVersion !== TRAINING_EXERCISE_CONFIGURATION_CONTRACT) return invalid();
  if (typeof row.idempotencyKey !== "string" || !/^[A-Za-z0-9._:-]{1,128}$/.test(row.idempotencyKey)) return invalid();
  return { contractVersion: TRAINING_EXERCISE_CONFIGURATION_CONTRACT, sessionExerciseId: uuid(row.sessionExerciseId),
    expectedRevision: revision(row.expectedRevision, Number.MAX_SAFE_INTEGER - 1), value: parseValue(row.value), idempotencyKey: row.idempotencyKey };
}

function parsePrevious(value: unknown): PreviousConfiguration | null {
  if (value === null) return null;
  const row = object(value, ["sessionExerciseId", "sessionId", "endedAt", "value"]);
  const stored = object(row.value, ["kind", "label"]);
  const parsed = stored.kind === "recorded" ? { kind: "recorded" as const, label: label(stored.label) }
    : stored.kind === "not_applicable" && stored.label === null ? { kind: "not_applicable" as const, label: null } : invalid();
  return { sessionExerciseId: uuid(row.sessionExerciseId), sessionId: uuid(row.sessionId), endedAt: timestamp(row.endedAt), value: parsed };
}

export function parseConfigurationsResponse(value: unknown): ConfigurationsResponse {
  const row = object(value, ["contractVersion", "sessionId", "sessionStatus", "items"]);
  if (row.contractVersion !== TRAINING_EXERCISE_CONFIGURATION_CONTRACT || !Array.isArray(row.items)
    || !["in_progress", "completed", "discarded"].includes(String(row.sessionStatus))) return invalid();
  const items = row.items.map((entry): ConfigurationItem => {
    const item = object(entry, ["sessionExerciseId", "exerciseId", "revision", "value", "previous"]);
    return { sessionExerciseId: uuid(item.sessionExerciseId), exerciseId: uuid(item.exerciseId), revision: revision(item.revision),
      value: parseValue(item.value), previous: parsePrevious(item.previous) };
  });
  if (new Set(items.map(item => item.sessionExerciseId)).size !== items.length) return invalid();
  return { contractVersion: TRAINING_EXERCISE_CONFIGURATION_CONTRACT, sessionId: uuid(row.sessionId),
    sessionStatus: row.sessionStatus as ConfigurationsResponse["sessionStatus"], items };
}

/** Same value, whatever its provenance: what the person would see as "the same variant". */
export function sameConfiguration(a: { kind: string; label: string | null } | null, b: { kind: string; label: string | null } | null) {
  return configurationIdentity(a) === configurationIdentity(b);
}

/**
 * What the strict comparator compares. Unknown stays null, so it can never equal a known one. Case is ignored: the person
 * typing "agarre neutro" one day and "Agarre neutro" the next did the same thing. Any other difference separates them.
 */
export function configurationIdentity(value: { kind: string | null; label: string | null } | null | undefined): string | null {
  if (!value || value.kind === null) return null;
  if (value.kind === "not_applicable") return "not_applicable";
  if (value.kind === "recorded" && typeof value.label === "string" && value.label.trim()) return `recorded:${value.label.normalize("NFC").toLocaleLowerCase("es-AR")}`;
  return null;
}
