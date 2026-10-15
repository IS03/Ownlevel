import "server-only";
import type { NutritionReportRange } from "@/lib/nutrition/reports-core";
import { MobileApiConflictError, MobileApiNotFoundError, MobileApiValidationError } from "./auth";
import { NutritionReportDayChangedError } from "./nutrition-report-server";
import type { ProgressPeriod } from "./progress-contract";
import { parseExploreMeasure } from "./progress-explore-contract";
import { buildMobileProgressExplore } from "./progress-explore";
import { buildMobileProgressInfluence } from "./progress-influence";
import {
  influenceDefinitionOf, isInfluenceView, isProgressViewId, parseProgressViewCreate, parseProgressViewMutation, parseProgressViewOrder, parseProgressViewRename, parseProgressViewsSnapshot, parseViewDefinition,
  type ProgressViewMutation, type ProgressViewsRead,
} from "./progress-views-contract";
import type { MobileSupabaseAuthenticatedContext } from "./supabase";

type Context = MobileSupabaseAuthenticatedContext;

/** Database errors → API errors. Conflicts are explicit (409) so the app re-reads server truth instead of retrying. */
function viewError(error: unknown): never {
  const e = (error ?? {}) as { code?: string; message?: string };
  const message = e.message ?? "";
  if (e.code === "22023") throw new MobileApiValidationError(message || "Los datos de la vista no son válidos.");
  if (e.code === "P0002" && message.includes("PROGRESS_VIEW_NOT_FOUND")) throw new MobileApiNotFoundError("La vista ya no existe.");
  if (message.includes("IDEMPOTENCY_KEY_REUSED")) throw new MobileApiConflictError("La operación ya se usó con otros datos.", "IDEMPOTENCY_KEY_REUSED");
  if (e.code === "40001" && message.includes("PROGRESS_VIEW_LIST_CHANGED")) throw new MobileApiConflictError("Tus vistas cambiaron en otro dispositivo.", "PROGRESS_VIEW_LIST_CHANGED");
  if (e.code === "40001" && message.includes("PROGRESS_VIEW_CHANGED")) throw new MobileApiConflictError("La vista cambió en otro dispositivo.", "PROGRESS_VIEW_CHANGED");
  throw new Error("Progress views unavailable", { cause: error });
}
const idempotentRow = (data: unknown) => {
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object" || typeof (row as Record<string, unknown>).response_status !== "number") throw new Error("Invalid idempotent response");
  return row as { response_status: number; response_body: unknown; replayed: boolean };
};

/** Every view with its result in the shared period. One broken view never hides the others. */
export async function buildMobileProgressViews(context: Context, range: NutritionReportRange, period: ProgressPeriod, comparing: boolean, today: string, includeInfluence = false): Promise<ProgressViewsRead> {
  const { data, error } = await context.supabase.rpc("mobile_progress_views_snapshot");
  if (error) viewError(error);
  const snapshot = parseProgressViewsSnapshot(data);
  if (!snapshot) throw new Error("Invalid progress views snapshot");
  // EXPAND: only clients explicitly requesting kinds=influence see those definitions.
  // Older clients expect positions 1..n, so the legacy response renumbers the visible views in their stored order.
  // The database positions and listVersion never change; a legacy reorder of the visible subset is rejected
  // as PROGRESS_VIEW_LIST_CHANGED (the stored list differs), so nothing is ever overwritten.
  const visible = includeInfluence ? snapshot.views
    : snapshot.views.filter(v => (v.definition as Record<string, unknown>).kind !== "influence").map((v, i) => ({ ...v, position: i + 1 }));
  const views = await Promise.all(visible.map(async (stored): Promise<ProgressViewsRead["views"][number]> => {
    const definition = parseViewDefinition(stored.definition);
    // The stored definition travels as-is so an invalid view can still be shown and removed.
    const view = { ...stored, definition: stored.definition as ProgressViewsRead["views"][number]["definition"] };
    if (!definition) return { ...view, result: { status: "unavailable", reason: "invalid_definition" } };
    try {
      if (isInfluenceView(definition)) {
        const data = await buildMobileProgressInfluence(context, influenceDefinitionOf(definition), period, comparing, today);
        return { ...view, definition, result: { status: "ok", kind: "influence", data } };
      }
      const measure = parseExploreMeasure(definition.measure);
      if (!measure) return { ...view, result: { status: "unavailable", reason: "invalid_definition" } };
      const result = await buildMobileProgressExplore(context, { measure, breakdown: definition.breakdown, days: definition.days, series: definition.series }, range, period, comparing, today);
      return { ...view, definition, result: { status: "ok", data: result } };
    } catch (e) {
      if (e instanceof NutritionReportDayChangedError) throw e;
      // A metric or exercise that no longer exists is an invalid view; anything else is a failed read, never empty.
      if (e instanceof MobileApiValidationError || e instanceof MobileApiNotFoundError) return { ...view, result: { status: "unavailable", reason: "invalid_definition" } };
      console.warn("[mobile.progress] view unavailable");
      return { ...view, result: { status: "unavailable", reason: "data_unavailable" } };
    }
  }));
  return { today, period, listVersion: snapshot.listVersion, views };
}

export async function createMobileProgressView(payload: unknown, context: Context): Promise<ProgressViewMutation> {
  const input = parseProgressViewCreate(payload);
  if (!input) throw new MobileApiValidationError("Los datos de la vista no son válidos.");
  const { data, error } = await context.supabase.rpc("mobile_create_progress_view", { p_name: input.name, p_definition: input.definition, p_idempotency_key: input.idempotencyKey });
  if (error) viewError(error);
  const row = idempotentRow(data), response = parseProgressViewMutation(row.response_body);
  if (row.response_status !== 201 || !response || response.view.name !== input.name || response.view.definition.measure !== input.definition.measure) throw new Error("Invalid create view response");
  return response;
}

export async function renameMobileProgressView(id: unknown, payload: unknown, context: Context): Promise<ProgressViewMutation> {
  const input = parseProgressViewRename(payload);
  if (!isProgressViewId(id) || !input) throw new MobileApiValidationError("El nombre de la vista no es válido.");
  const { data, error } = await context.supabase.rpc("mobile_rename_progress_view", { p_view_id: id, p_name: input.name, p_expected_version: input.expectedVersion });
  if (error) viewError(error);
  const response = parseProgressViewMutation(data);
  if (!response || response.view.id !== id || response.view.name !== input.name) throw new Error("Invalid rename view response");
  return response;
}

export async function deleteMobileProgressView(id: unknown, expectedVersion: string | null, context: Context): Promise<{ listVersion: number }> {
  const version = expectedVersion !== null && /^[1-9]\d{0,15}$/.test(expectedVersion) ? Number(expectedVersion) : null;
  if (!isProgressViewId(id) || version === null) throw new MobileApiValidationError("La vista no es válida.");
  const { data, error } = await context.supabase.rpc("mobile_delete_progress_view", { p_view_id: id, p_expected_version: version });
  if (error) viewError(error);
  const listVersion = (data as { listVersion?: unknown } | null)?.listVersion;
  if (typeof listVersion !== "number" || !Number.isSafeInteger(listVersion) || listVersion < 1) throw new Error("Invalid delete view response");
  return { listVersion };
}

export async function reorderMobileProgressViews(payload: unknown, context: Context): Promise<{ viewIds: string[]; listVersion: number }> {
  // A legacy client omitting hidden influence views submits an incomplete list: the database returns
  // PROGRESS_VIEW_LIST_CHANGED. Keep this CAS check authoritative; never reorder just a visible subset.
  const input = parseProgressViewOrder(payload);
  if (!input) throw new MobileApiValidationError("El orden de las vistas no es válido.");
  const { data, error } = await context.supabase.rpc("mobile_reorder_progress_views", { p_view_ids: input.viewIds, p_expected_list_version: input.expectedListVersion, p_idempotency_key: input.idempotencyKey });
  if (error) viewError(error);
  const row = idempotentRow(data), body = row.response_body as { viewIds?: unknown; listVersion?: unknown } | null;
  if (row.response_status !== 200 || !body || JSON.stringify(body.viewIds) !== JSON.stringify(input.viewIds) || typeof body.listVersion !== "number" || body.listVersion < input.expectedListVersion) {
    throw new Error("Invalid reorder views response");
  }
  return { viewIds: input.viewIds, listVersion: body.listVersion };
}
