// Progreso stage 2 · "Mis vistas" contract (pure; shared by the Mobile API and Expo). Plan: bocetos/explorar/PLAN.md.
// A view is a saved Explorar query or Qué influye question. It never stores dates: it follows Progreso's period.
import { isNutritionDate } from "./nutrition-day-contract";
import { parseProgressPeriod, type ProgressPeriod } from "./progress-contract";
import { exploreOptions, parseExploreMeasure, parseProgressExplore, type ExploreBreakdown, type ExploreDays, type ProgressExplore } from "./progress-explore-contract";
import { parseProgressInfluence, validInfluenceDefinition, type InfluenceDefinition, type ProgressInfluence } from "./progress-influence-contract";

export const PROGRESS_VIEWS_MAX = 6;
export type ExploreViewDefinition = { measure: string; breakdown: ExploreBreakdown | null; days: ExploreDays | null; series: boolean };
/** `measure` is the outcome, keeping the existing database JSON check. An explicit outcome, if supplied, must agree. */
export type InfluenceViewDefinition = { kind: "influence"; measure: string; split: string; cut: string; lag: 0 | 1 | 2; outcome?: string };
export type ProgressViewDefinition = ExploreViewDefinition | InfluenceViewDefinition;
export const isInfluenceView = (d: ProgressViewDefinition): d is InfluenceViewDefinition => "kind" in d && d.kind === "influence";
export const influenceDefinitionOf = (d: InfluenceViewDefinition): InfluenceDefinition => ({ split: d.split, cut: d.cut, lag: d.lag, outcome: d.measure });
export type ProgressView = { id: string; name: string; position: number; version: number; definition: ProgressViewDefinition };
export type ProgressViewResult = { status: "ok"; kind?: "explore"; data: ProgressExplore } | { status: "ok"; kind: "influence"; data: ProgressInfluence }
  | { status: "unavailable"; reason: "invalid_definition" | "data_unavailable" };
export type ProgressViewsRead = { today: string; period: ProgressPeriod; listVersion: number; views: (ProgressView & { result: ProgressViewResult })[] };
export type ProgressViewCreate = { name: string; definition: ProgressViewDefinition; idempotencyKey: string };
export type ProgressViewRename = { name: string; expectedVersion: number };
export type ProgressViewOrder = { viewIds: string[]; expectedListVersion: number; idempotencyKey: string };
export type ProgressViewMutation = { view: ProgressView; listVersion: number };

const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const keys = (v: Record<string, unknown>, names: readonly string[]) => Object.keys(v).length === names.length && names.every(n => n in v);
const version = (v: unknown, min = 1): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= min;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const KEY = /^[A-Za-z0-9._:-]{1,128}$/;

/** A trimmed name of 1–60 characters. */
export const parseViewName = (v: unknown): string | undefined => typeof v === "string" && v.trim() === v && v.length >= 1 && v.length <= 60 ? v : undefined;
/** Each shape uses its read's validation rules; existing Explorar definitions keep their exact shape. */
export function parseViewDefinition(v: unknown): ProgressViewDefinition | undefined {
  if (!record(v)) return;
  if (v.kind === "influence") {
    if (!(keys(v, ["kind", "measure", "split", "cut", "lag"]) || keys(v, ["kind", "measure", "split", "cut", "lag", "outcome"]))
      || typeof v.measure !== "string" || typeof v.split !== "string" || typeof v.cut !== "string" || typeof v.lag !== "number"
      || ("outcome" in v && v.outcome !== v.measure)) return;
    const definition = v as InfluenceViewDefinition;
    return validInfluenceDefinition(influenceDefinitionOf(definition)) ? { ...definition } : undefined;
  }
  if (!keys(v, ["measure", "breakdown", "days", "series"]) || typeof v.measure !== "string" || typeof v.series !== "boolean") return;
  const measure = parseExploreMeasure(v.measure);
  if (!measure) return;
  const options = exploreOptions(measure);
  if (v.breakdown !== null && !(options.breakdowns as readonly unknown[]).includes(v.breakdown)) return;
  if (v.days !== null && !(options.days as readonly unknown[]).includes(v.days)) return;
  if (v.series && v.breakdown === "weekday") return;
  return { measure: v.measure, breakdown: v.breakdown as ExploreBreakdown | null, days: v.days as ExploreDays | null, series: v.series };
}
/** A stored view. An old definition that no longer parses is kept as-is for the API to mark unavailable. */
function parseStoredView(v: unknown): (Omit<ProgressView, "definition"> & { definition: unknown }) | undefined {
  if (!record(v) || !keys(v, ["id", "name", "position", "version", "definition"]) || typeof v.id !== "string" || !UUID.test(v.id) || !parseViewName(v.name)
    || !version(v.position) || (v.position as number) > PROGRESS_VIEWS_MAX || !version(v.version) || !record(v.definition)) return;
  return { id: v.id, name: v.name as string, position: v.position as number, version: v.version as number, definition: v.definition };
}
export function parseProgressViewsSnapshot(v: unknown): { listVersion: number; views: (Omit<ProgressView, "definition"> & { definition: unknown })[] } | undefined {
  if (!record(v) || !keys(v, ["listVersion", "views"]) || !version(v.listVersion, 0) || !Array.isArray(v.views) || v.views.length > PROGRESS_VIEWS_MAX) return;
  const views = v.views.map(parseStoredView);
  if (views.some(x => !x) || views.some((x, i) => x!.position !== i + 1)) return;
  return { listVersion: v.listVersion as number, views: views as NonNullable<ReturnType<typeof parseStoredView>>[] };
}
export function parseProgressView(v: unknown): ProgressView | undefined {
  const stored = parseStoredView(v), definition = stored && parseViewDefinition(stored.definition);
  return stored && definition ? { ...stored, definition } : undefined;
}
export function parseProgressViewMutation(v: unknown): ProgressViewMutation | undefined {
  if (!record(v) || !keys(v, ["view", "listVersion"]) || !version(v.listVersion)) return;
  const view = parseProgressView(v.view);
  return view ? { view, listVersion: v.listVersion as number } : undefined;
}
export function parseProgressViewsRead(v: unknown): ProgressViewsRead | undefined {
  if (!record(v) || !keys(v, ["today", "period", "listVersion", "views"]) || !isNutritionDate(v.today) || !version(v.listVersion, 0) || !Array.isArray(v.views) || v.views.length > PROGRESS_VIEWS_MAX) return;
  const period = parseProgressPeriod(v.period);
  if (!period) return;
  const views: ProgressViewsRead["views"] = [];
  for (const [i, raw] of v.views.entries()) {
    if (!record(raw) || !("result" in raw)) return;
    const { result, ...rest } = raw;
    const view = parseStoredView(rest);
    // Positions are always 1..n in the response (a legacy read renumbers the views it shows).
    if (!view || view.position !== i + 1 || !record(result)) return;
    if (result.status === "ok" && result.kind === "influence" && keys(result, ["status", "kind", "data"])) {
      const data = parseProgressInfluence(result.data), definition = parseViewDefinition(view.definition);
      if (!data || !definition || !isInfluenceView(definition) || data.definition.split !== definition.split || data.definition.cut !== definition.cut
        || data.definition.lag !== definition.lag || data.definition.outcome !== definition.measure
        || data.period.start !== period.start || data.period.end !== period.end || data.today !== v.today) return;
      views.push({ ...view, definition, result: { status: "ok", kind: "influence", data } });
    } else if (result.status === "ok" && (keys(result, ["status", "data"]) || (keys(result, ["status", "kind", "data"]) && result.kind === "explore"))) {
      const data = parseProgressExplore(result.data), definition = parseViewDefinition(view.definition);
      if (!data || !definition || isInfluenceView(definition) || data.measure.key !== definition.measure || data.period.start !== period.start || data.period.end !== period.end) return;
      views.push({ ...view, definition, result: { status: "ok", ...(result.kind === "explore" ? { kind: "explore" as const } : {}), data } });
    } else if (result.status === "unavailable" && keys(result, ["status", "reason"]) && (result.reason === "invalid_definition" || result.reason === "data_unavailable")) {
      // An invalid stored definition still needs a shape the app can show and remove.
      const definition = parseViewDefinition(view.definition) ?? { measure: String((view.definition as Record<string, unknown>).measure ?? ""), breakdown: null, days: null, series: false };
      views.push({ ...view, definition, result: { status: "unavailable", reason: result.reason } });
    } else return;
  }
  return { today: v.today, period, listVersion: v.listVersion as number, views };
}

// ---- requests ----
export function parseProgressViewCreate(v: unknown): ProgressViewCreate | undefined {
  if (!record(v) || !keys(v, ["name", "definition", "idempotencyKey"]) || typeof v.idempotencyKey !== "string" || !KEY.test(v.idempotencyKey)) return;
  const name = parseViewName(v.name), definition = parseViewDefinition(v.definition);
  return name && definition ? { name, definition, idempotencyKey: v.idempotencyKey } : undefined;
}
export function parseProgressViewRename(v: unknown): ProgressViewRename | undefined {
  if (!record(v) || !keys(v, ["name", "expectedVersion"]) || !version(v.expectedVersion)) return;
  const name = parseViewName(v.name);
  return name ? { name, expectedVersion: v.expectedVersion as number } : undefined;
}
export function parseProgressViewOrder(v: unknown): ProgressViewOrder | undefined {
  if (!record(v) || !keys(v, ["viewIds", "expectedListVersion", "idempotencyKey"]) || !Array.isArray(v.viewIds) || v.viewIds.length > PROGRESS_VIEWS_MAX
    || !v.viewIds.every(id => typeof id === "string" && UUID.test(id)) || new Set(v.viewIds).size !== v.viewIds.length
    || !version(v.expectedListVersion, 0) || typeof v.idempotencyKey !== "string" || !KEY.test(v.idempotencyKey)) return;
  return { viewIds: v.viewIds as string[], expectedListVersion: v.expectedListVersion as number, idempotencyKey: v.idempotencyKey };
}
export const isProgressViewId = (v: unknown): v is string => typeof v === "string" && UUID.test(v);
