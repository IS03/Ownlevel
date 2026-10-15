/** Shared time provenance: imported summaries and explicitly unknown original times never become timed meals. */
export function nutritionMealTimeKnown(raw: unknown, kind: unknown): boolean {
  if (kind === "legacy_daily_summary") return false;
  if (typeof raw !== "string") return true;
  try { return JSON.parse(raw)?.originalTimeKnown !== false; } catch { return true; }
}

