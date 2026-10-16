// M5.3 Metric Definitions contract, shared by the Mobile API adapter and Expo (pure; no server imports).
// A definition says WHAT is measured (identity, name, type, unit, current target,
// state, order). Daily values live elsewhere (M5.2) and are never touched here.

export const METRIC_DEFINITION_VALUE_TYPES = ["integer", "decimal", "duration"] as const;
export type MetricDefinitionValueType = (typeof METRIC_DEFINITION_VALUE_TYPES)[number];
export type MetricSystemKey = "steps" | "water" | "mate" | "sleep";
/** Canonical system identity (mirrors user_metrics_system_identity_check). */
export const METRIC_SYSTEM_IDENTITY: Record<MetricSystemKey, { name: string; unit: string; valueType: MetricDefinitionValueType }> = {
  steps: { name: "Pasos", unit: "pasos", valueType: "integer" },
  water: { name: "Agua", unit: "L", valueType: "decimal" },
  mate: { name: "Mate", unit: "L", valueType: "decimal" },
  sleep: { name: "Sueño", unit: "min", valueType: "duration" },
};
export const METRIC_NAME_MAX = 80;
export const METRIC_UNIT_MAX = 16;
export const METRIC_TARGET_MAX = 9_999_999_999.9999;

/** What the domain allows for a definition (server rules, derived from its facts). */
export type MetricDefinitionActions = {
  editName: boolean; editMeaning: boolean; editTarget: boolean; archive: boolean; restore: boolean; delete: boolean;
};
export type MetricDefinition = {
  id: string; systemKey: MetricSystemKey | null; name: string; unit: string | null; valueType: MetricDefinitionValueType;
  target: number | null; isActive: boolean; sortOrder: number; updatedAt: string; hasHistory: boolean; actions: MetricDefinitionActions;
  /** Only present when the client explicitly requests presentation=1. Unknown valid keys are allowed. */
  icon?: string | null; quickValue?: number | null;
};
export type MetricDefinitionsResponse = { definitions: MetricDefinition[] };
export type MetricDefinitionFields = { name: string; valueType: MetricDefinitionValueType; unit: string | null; target: number | null; icon?: string | null; quickValue?: number | null };
export type MetricDefinitionOperation = "create" | "update" | "archive" | "restore" | "delete";
export type MetricDefinitionIntent = {
  operation: MetricDefinitionOperation; metricId: string | null; expectedUpdatedAt: string | null;
  fields: MetricDefinitionFields | null; idempotencyKey: string;
};
export type MetricDefinitionReceipt = {
  status: "confirmed"; operation: MetricDefinitionOperation; metricId: string; definition: MetricDefinition | null;
};
export type MetricOrderIntent = { operation: "reorder"; metricIds: string[]; expectedMetricIds: string[]; idempotencyKey: string };
export type MetricOrderReceipt = { status: "confirmed"; operation: "reorder"; metricIds: string[] };

const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const keys = (v: Record<string, unknown>, names: readonly string[]) => Object.keys(v).length === names.length && names.every(n => n in v);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const KEY = /^[A-Za-z0-9._:-]{1,128}$/;
const isUuid = (v: unknown): v is string => typeof v === "string" && UUID.test(v);
export function isMetricTimestamp(v: unknown): v is string {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(v) && Number.isFinite(Date.parse(v));
}
const isType = (v: unknown): v is MetricDefinitionValueType => METRIC_DEFINITION_VALUE_TYPES.includes(v as MetricDefinitionValueType);
const fourDecimals = (n: number) => Math.abs(n * 10_000 - Math.round(n * 10_000)) < 1e-6;
export function isMetricTarget(v: unknown, type: MetricDefinitionValueType): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= METRIC_TARGET_MAX && fourDecimals(v)
    && (type === "decimal" || Number.isInteger(v));
}
const trim = (s: string) => s.replace(/^\s+|\s+$/g, "");
export const isMetricIcon = (v: unknown): v is string => typeof v === 'string' && /^[a-z][a-z0-9-]{0,31}$/.test(v);
export const isMetricQuickValue = (v: unknown, type: MetricDefinitionValueType): v is number => isMetricTarget(v, type) && v > 0;
const presentationKeys = ['icon', 'quickValue'];
const hasPresentation = (v: Record<string, unknown>) => Object.hasOwn(v, 'icon') || Object.hasOwn(v, 'quickValue');
const presentationValid = (v: Record<string, unknown>, type: MetricDefinitionValueType) =>
  (v.icon === null || isMetricIcon(v.icon)) && (v.quickValue === null || isMetricQuickValue(v.quickValue, type));

export function metricDefinitionActions(d: { systemKey: MetricSystemKey | null; isActive: boolean; hasHistory: boolean }): MetricDefinitionActions {
  const custom = d.systemKey === null;
  return { editName: custom, editMeaning: custom && !d.hasHistory, editTarget: true, archive: d.isActive, restore: !d.isActive, delete: custom && !d.hasHistory };
}

/**
 * Mirrors mobile_normalize_metric_fields (and daily-metrics/core.ts): trimmed name
 * 1..80, duration unit is always "min", blank unit is null. undefined = invalid.
 */
export function normalizeMetricDefinitionFields(v: unknown): MetricDefinitionFields | undefined {
  if (!record(v) || !keys(v, ["name", "valueType", "unit", "target", ...(hasPresentation(v) ? presentationKeys : [])]) || typeof v.name !== "string" || !isType(v.valueType)
    || (v.unit !== null && typeof v.unit !== "string") || (v.target !== null && typeof v.target !== "number")) return;
  const name = trim(v.name);
  const unit = v.valueType === "duration" ? "min" : (typeof v.unit === "string" && trim(v.unit)) || null;
  if (!name || [...name].length > METRIC_NAME_MAX || (unit !== null && [...unit].length > METRIC_UNIT_MAX)) return;
  if (v.target !== null && !isMetricTarget(v.target, v.valueType)) return;
  if (hasPresentation(v) && !presentationValid(v, v.valueType)) return;
  return { name, valueType: v.valueType, unit, target: v.target as number | null, ...(hasPresentation(v) ? {icon: v.icon as string | null, quickValue: v.quickValue as number | null} : {}) };
}

export function parseMetricDefinition(v: unknown): MetricDefinition | undefined {
  if (!record(v) || !keys(v, ["id", "systemKey", "name", "unit", "valueType", "target", "isActive", "sortOrder", "updatedAt", "hasHistory", "actions", ...(hasPresentation(v) ? presentationKeys : [])])
    || !isUuid(v.id) || typeof v.name !== "string" || !trim(v.name) || (v.unit !== null && typeof v.unit !== "string") || !isType(v.valueType)
    || (v.target !== null && !isMetricTarget(v.target, v.valueType)) || typeof v.isActive !== "boolean"
    || typeof v.sortOrder !== "number" || !Number.isInteger(v.sortOrder) || v.sortOrder < 0
    || !isMetricTimestamp(v.updatedAt) || typeof v.hasHistory !== "boolean" || (hasPresentation(v) && !presentationValid(v, v.valueType))) return;
  const systemKey = v.systemKey;
  if (systemKey !== null) {
    if (typeof systemKey !== "string" || !(systemKey in METRIC_SYSTEM_IDENTITY)) return;
    const identity = METRIC_SYSTEM_IDENTITY[systemKey as MetricSystemKey];
    if (identity.name !== v.name || identity.unit !== v.unit || identity.valueType !== v.valueType) return;
  }
  const base = { systemKey: systemKey as MetricSystemKey | null, isActive: v.isActive, hasHistory: v.hasHistory };
  const actions = metricDefinitionActions(base);
  // The server's actions must be exactly what the domain derives; anything else is an invalid response.
  const names = Object.keys(actions) as (keyof MetricDefinitionActions)[];
  const received = v.actions;
  if (!record(received) || !keys(received, names) || names.some(n => received[n] !== actions[n])) return;
  return { ...(v as MetricDefinition), id: v.id.toLowerCase(), actions };
}

/** Active first in canonical order, then archived; ids unique. */
export function parseMetricDefinitions(v: unknown): MetricDefinitionsResponse | undefined {
  if (!record(v) || !keys(v, ["definitions"]) || !Array.isArray(v.definitions)) return;
  const definitions = v.definitions.map(parseMetricDefinition);
  if (!definitions.every((d): d is MetricDefinition => d !== undefined)) return;
  if (new Set(definitions.map(d => d.id)).size !== definitions.length) return;
  if (definitions.some((d, i) => i > 0 && d.isActive && !definitions[i - 1].isActive)) return;
  return { definitions };
}

export function parseMetricDefinitionIntent(v: unknown): MetricDefinitionIntent | undefined {
  if (!record(v) || !keys(v, ["operation", "metricId", "expectedUpdatedAt", "fields", "idempotencyKey"])
    || !["create", "update", "archive", "restore", "delete"].includes(String(v.operation))
    || typeof v.idempotencyKey !== "string" || !KEY.test(v.idempotencyKey)) return;
  const op = v.operation as MetricDefinitionOperation;
  if (op === "create" ? v.metricId !== null || v.expectedUpdatedAt !== null : !isUuid(v.metricId) || !isMetricTimestamp(v.expectedUpdatedAt)) return;
  if (op === "create" || op === "update") {
    const fields = normalizeMetricDefinitionFields(v.fields);
    return fields ? { ...(v as MetricDefinitionIntent), fields } : undefined;
  }
  return v.fields === null ? v as MetricDefinitionIntent : undefined;
}
export function parseMetricDefinitionReceipt(v: unknown): MetricDefinitionReceipt | undefined {
  if (!record(v) || !keys(v, ["status", "operation", "metricId", "definition"]) || v.status !== "confirmed"
    || !["create", "update", "archive", "restore", "delete"].includes(String(v.operation)) || !isUuid(v.metricId)) return;
  const metricId = v.metricId.toLowerCase();
  if (v.operation === "delete") return v.definition === null ? { ...(v as MetricDefinitionReceipt), metricId } : undefined;
  const definition = parseMetricDefinition(v.definition);
  return definition && definition.id === metricId ? { ...(v as MetricDefinitionReceipt), metricId, definition } : undefined;
}

const permutation = (a: string[], b: string[]) => a.length === b.length && new Set(a).size === a.length
  && [...a].map(x => x.toLowerCase()).sort().join() === [...b].map(x => x.toLowerCase()).sort().join();
export function parseMetricOrderIntent(v: unknown): MetricOrderIntent | undefined {
  if (!record(v) || !keys(v, ["operation", "metricIds", "expectedMetricIds", "idempotencyKey"]) || v.operation !== "reorder"
    || !Array.isArray(v.metricIds) || !Array.isArray(v.expectedMetricIds) || v.metricIds.length < 1 || v.metricIds.length > 200
    || !v.metricIds.every(isUuid) || !v.expectedMetricIds.every(isUuid) || typeof v.idempotencyKey !== "string" || !KEY.test(v.idempotencyKey)
    || !permutation(v.metricIds as string[], v.expectedMetricIds as string[])) return;
  return v as MetricOrderIntent;
}
export function parseMetricOrderReceipt(v: unknown): MetricOrderReceipt | undefined {
  if (!record(v) || !keys(v, ["status", "operation", "metricIds"]) || v.status !== "confirmed" || v.operation !== "reorder"
    || !Array.isArray(v.metricIds) || !v.metricIds.every(isUuid)) return;
  return { status: "confirmed", operation: "reorder", metricIds: v.metricIds.map(x => (x as string).toLowerCase()) };
}
