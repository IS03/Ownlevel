import "server-only";
import { NextResponse } from "next/server";
import { MobileApiUnauthorizedError, MobileApiValidationError, mobileBearerToken } from "./auth";
import { authenticateMobileAccessToken, authenticateMobileMutationAccessToken } from "./supabase";
import { mobileApiResponseHeaders, readMobileJson } from "./http";
import {
  metricDefinitionActions, parseMetricDefinitionIntent, parseMetricDefinitionReceipt, parseMetricDefinitions,
  parseMetricOrderIntent, parseMetricOrderReceipt, type MetricDefinitionOperation, type MetricSystemKey,
} from "./metric-definitions-contract";

const VALIDATION_CODES = ["22023", "22P02", "22003", "22008", "22007", "23514"];
const CONFLICTS = ["METRIC_CHANGED", "METRIC_HAS_HISTORY", "SYSTEM_METRIC_IMMUTABLE", "SYSTEM_METRIC_PROTECTED", "METRIC_ORDER_CHANGED", "IDEMPOTENCY_KEY_REUSED"];
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** Adds the domain-derived actions to each raw definition (server facts only). */
function withActions(raw: unknown): unknown {
  if (!record(raw)) return raw;
  return { ...raw, actions: metricDefinitionActions({
    systemKey: (raw.systemKey ?? null) as MetricSystemKey | null, isActive: raw.isActive === true, hasHistory: raw.hasHistory === true,
  }) };
}
export function metricDefinitionsReadDto(raw: unknown, presentation = false) {
  if (!record(raw) || !Array.isArray(raw.definitions)) return undefined;
  return parseMetricDefinitions({ definitions: raw.definitions.map(d => {
    if (!record(d) || presentation) return withActions(d);
    const { icon: _icon, quickValue: _quick, ...legacy } = d;
    void _icon; void _quick;
    return withActions(legacy);
  }) });
}

/** GET /metrics/definitions. Initializes system definitions (ensure_user_metrics) before reading. */
export async function metricDefinitionsReadResponse(request: Request) {
  let status = 503, body: unknown = { error: "DATA_UNAVAILABLE" };
  try {
    const auth = await authenticateMobileAccessToken(mobileBearerToken(request.headers.get("authorization")));
    // POST on purpose: the read initializes missing system definitions (idempotent write).
    const presentation = new URL(request.url).searchParams.get('presentation') === '1';
    const { data, error } = await auth.supabase.rpc(presentation ? "mobile_read_metric_presentations" : "mobile_read_metric_definitions");
    const dto = error ? undefined : metricDefinitionsReadDto(data, presentation);
    if (!dto) throw new Error("Metric definitions read unavailable");
    status = 200; body = dto;
  } catch (e) {
    if (e instanceof MobileApiUnauthorizedError) { status = 401; body = { error: "UNAUTHORIZED" }; }
    else console.warn("[mobile.metrics.definitions] read unavailable");
  }
  return NextResponse.json(body, { status, headers: mobileApiResponseHeaders(request) });
}

type Receipt = { response_status: number; response_body: unknown };
const single = (data: unknown): Receipt | null => Array.isArray(data) && data.length === 1 ? data[0] as Receipt : null;
function receiptResponse(row: Receipt | null, ok: (body: unknown) => unknown) {
  if (row?.response_status === 200) {
    const parsed = ok(row.response_body);
    if (parsed) return { status: 200, body: parsed };
  }
  if (row?.response_status === 404 && record(row.response_body) && row.response_body.error === "NOT_FOUND") {
    return { status: 404, body: { error: "NOT_FOUND", message: "La métrica ya no está disponible." } };
  }
  const conflict = row?.response_status === 409 && record(row.response_body) ? row.response_body : null;
  if (conflict && CONFLICTS.includes(String(conflict.error)) && typeof conflict.message === "string") {
    return { status: 409, body: { error: conflict.error, message: conflict.message } };
  }
  throw new Error("Invalid metric definition receipt");
}
async function mutationResponse(request: Request, run: (auth: Awaited<ReturnType<typeof authenticateMobileMutationAccessToken>>, input: unknown) => Promise<{ status: number; body: unknown }>) {
  let status = 503, body: unknown = { error: "DATA_UNAVAILABLE" };
  try {
    const auth = await authenticateMobileMutationAccessToken(mobileBearerToken(request.headers.get("authorization")));
    ({ status, body } = await run(auth, await readMobileJson(request)));
  } catch (e) {
    if (e instanceof MobileApiUnauthorizedError) { status = 401; body = { error: "UNAUTHORIZED" }; }
    else if (e instanceof MobileApiValidationError) { status = 400; body = { error: "VALIDATION_ERROR", message: e.message }; }
    else console.warn("[mobile.metrics.definitions] mutation unavailable");
  }
  return NextResponse.json(body, { status, headers: mobileApiResponseHeaders(request) });
}

/** POST /definitions (create), PUT /definitions/[id] (update|archive|restore), DELETE /definitions/[id]. */
export function metricDefinitionMutationResponse(request: Request, operations: readonly MetricDefinitionOperation[], id: string | null) {
  return mutationResponse(request, async (auth, input) => {
    const intent = parseMetricDefinitionIntent(input);
    if (!intent || !operations.includes(intent.operation) || (intent.metricId?.toLowerCase() ?? null) !== (id?.toLowerCase() ?? null)) {
      throw new MobileApiValidationError("Revisá los datos de la métrica.");
    }
    const { data, error } = await auth.supabase.rpc("mobile_mutate_metric_definition", { p_intent: intent });
    if (error) {
      if (VALIDATION_CODES.includes(error.code)) throw new MobileApiValidationError("Revisá los datos de la métrica.");
      throw new Error("Metric definition mutation unavailable");
    }
    return receiptResponse(single(data), body => {
      const receipt = parseMetricDefinitionReceipt(body === null ? body : withReceiptActions(body));
      return receipt && receipt.operation === intent.operation && (!id || receipt.metricId === id.toLowerCase()) ? receipt : undefined;
    });
  });
}
function withReceiptActions(body: unknown) {
  return record(body) && record(body.definition) ? { ...body, definition: withActions(body.definition) } : body;
}

/** PUT /definitions/order: the full active list, with the order the client loaded as CAS. */
export function metricOrderMutationResponse(request: Request) {
  return mutationResponse(request, async (auth, input) => {
    const intent = parseMetricOrderIntent(input);
    if (!intent) throw new MobileApiValidationError("Revisá el orden de las métricas.");
    const { data, error } = await auth.supabase.rpc("mobile_reorder_metric_definitions", { p_intent: intent });
    if (error) {
      if (VALIDATION_CODES.includes(error.code)) throw new MobileApiValidationError("Revisá el orden de las métricas.");
      throw new Error("Metric order mutation unavailable");
    }
    return receiptResponse(single(data), body => {
      const receipt = parseMetricOrderReceipt(body);
      return receipt && receipt.metricIds.join() === intent.metricIds.map(x => x.toLowerCase()).join() ? receipt : undefined;
    });
  });
}
