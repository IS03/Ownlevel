import "server-only";
import { addProgressIsoDays } from "@/lib/progress/analytics";
import { MobileApiValidationError } from "./auth";
import type { ProgressPeriod } from "./progress-contract";
import { buildMobileProgressInfluenceSuggested } from "./progress-influence";
import { INSIGHT_MIN_PAIRS, isInsightKey, type ProgressInsight } from "./progress-insight-contract";
import type { MobileSupabaseAuthenticatedContext } from "./supabase";

type Context = MobileSupabaseAuthenticatedContext;
const WEEK_DAYS = 7;

/** Dismissed keys never come back; any dismissal in the last 7 days pauses insights (at most one a week). */
async function dismissals(context: Context): Promise<{ key: string; at: string }[]> {
  const { data, error } = await context.supabase.from("progress_insight_dismissals").select("insight_key,dismissed_at").eq("user_id", context.userId);
  if (error || !data) throw new Error("Insight dismissals unavailable", { cause: error });
  return (data as { insight_key: string; dismissed_at: string }[]).map(d => ({ key: d.insight_key, at: d.dismissed_at }));
}

/**
 * Stage 4: one neutral insight, only with a lot of data and a clear difference.
 * Window: the last 3 months (independent of the period on screen). Candidates: the ready-made questions with
 * status ok, clear evidence and ≥ 30 days. The largest relative difference wins.
 */
export async function buildMobileProgressInsight(context: Context, period: ProgressPeriod, today: string): Promise<ProgressInsight> {
  const dismissed = await dismissals(context);
  const weekAgo = `${addProgressIsoDays(today, -WEEK_DAYS + 1)}T00:00:00-03:00`;
  if (dismissed.some(d => new Date(d.at).getTime() >= new Date(weekAgo).getTime())) return { today, insight: null };
  const suggested = await buildMobileProgressInfluenceSuggested(context, period, false, today);
  const candidates = suggested.questions.filter(q => !dismissed.some(d => d.key === q.key)
    && q.current.status === "ok" && q.current.evidence === "clear" && q.current.pairs >= INSIGHT_MIN_PAIRS);
  const score = (q: (typeof candidates)[number]) => q.current.status === "ok" ? Math.abs(q.current.differencePercent ?? 0) : 0;
  const best = [...candidates].sort((a, b) => score(b) - score(a) || a.key.localeCompare(b.key))[0];
  if (!best) return { today, insight: null };
  const { key, ...reading } = best;
  return { today, insight: { key, data: { today, period: suggested.period, ...reading } } };
}

export async function dismissMobileProgressInsight(payload: unknown, context: Context): Promise<{ key: string }> {
  const key = (payload as { key?: unknown } | null)?.key;
  if (!payload || typeof payload !== "object" || Object.keys(payload).length !== 1 || !isInsightKey(key)) throw new MobileApiValidationError("El aviso no es válido.");
  const { data, error } = await context.supabase.rpc("mobile_dismiss_progress_insight", { p_key: key });
  if (error) {
    if ((error as { code?: string }).code === "22023") throw new MobileApiValidationError("El aviso no es válido.");
    throw new Error("Dismiss insight unavailable", { cause: error });
  }
  if ((data as { key?: unknown } | null)?.key !== key) throw new Error("Invalid dismiss insight response");
  return { key };
}
