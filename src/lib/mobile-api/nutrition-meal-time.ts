/** Shared time provenance: imported summaries and explicitly unknown original times never become timed meals. */
export function nutritionMealTimeKnown(raw: unknown, kind: unknown): boolean {
  if (kind === "legacy_daily_summary") return false;
  if (typeof raw !== "string") return true;
  try { return JSON.parse(raw)?.originalTimeKnown !== false; } catch { return true; }
}


/**
 * Where a meal's time comes from (#308): said by the user or the app (`explicit`), the registration instant of a
 * meal registered as eaten now (`registration`, approximate) or nobody knows (`unknown`). Only `explicit` counts
 * as a known time: stats and anything reading nutritionMealTimeKnown keep leaving approximate times out.
 */
export type NutritionMealTimeSource = "explicit" | "registration" | "unknown";
export function nutritionMealTimeSource(raw: unknown, kind: unknown): NutritionMealTimeSource {
  if (nutritionMealTimeKnown(raw, kind)) return "explicit";
  if (kind === "legacy_daily_summary" || typeof raw !== "string") return "unknown";
  try { return JSON.parse(raw)?.timeSource === "registration" ? "registration" : "unknown"; } catch { return "unknown"; }
}
