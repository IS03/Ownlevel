// Progreso stage 4 · automatic insight contract (pure; shared by the Mobile API and Expo). Plan: bocetos/que-influye/PLAN.md.
// At most one insight: a ready-made Qué influye question over the last 3 months with clear evidence and ≥ 30 days.
import { INFLUENCE_SUGGESTED_KEYS, parseProgressInfluence, type InfluenceSuggestedKey, type ProgressInfluence } from "./progress-influence-contract";

export const INSIGHT_MIN_PAIRS = 30;
export type ProgressInsight = { today: string; insight: { key: InfluenceSuggestedKey; data: ProgressInfluence } | null };

const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const keys = (v: Record<string, unknown>, names: readonly string[]) => Object.keys(v).length === names.length && names.every(n => n in v);
export const isInsightKey = (v: unknown): v is InfluenceSuggestedKey => (INFLUENCE_SUGGESTED_KEYS as readonly unknown[]).includes(v);

export function parseProgressInsight(v: unknown): ProgressInsight | undefined {
  if (!record(v) || !keys(v, ["today", "insight"]) || typeof v.today !== "string") return;
  if (v.insight === null) return { today: v.today, insight: null };
  const i = v.insight;
  if (!record(i) || !keys(i, ["key", "data"]) || !isInsightKey(i.key)) return;
  const data = parseProgressInfluence(i.data);
  // Never an insight without a real answer: clear evidence, enough days, no comparison.
  if (!data || data.today !== v.today || data.reference !== null || data.current.status !== "ok" || data.current.evidence !== "clear" || data.current.pairs < INSIGHT_MIN_PAIRS) return;
  return { today: v.today, insight: { key: i.key, data } };
}
export const parseInsightDismissal = (v: unknown): { key: InfluenceSuggestedKey } | undefined =>
  record(v) && keys(v, ["key"]) && isInsightKey(v.key) ? { key: v.key } : undefined;
