import { describeFeelingOutcome, FEELING_OUTCOME_KINDS } from "./feeling-outcomes";
import { parseSessionFeelings } from "./source-adapter";
import { periodOf } from "./period-range";
import { INSIGHTS_PERFORMANCE_METHOD } from "../performance-insights/types";
import { nutritionDays } from "./exposures";
import { INSIGHTS_CONTRACT, INSIGHTS_ENGINE_METHOD, INSIGHTS_ENGINE_METHOD_V2, type FeelingKey, type InsightsSource, type SessionFeeling, type InsightsEngineMethod } from "./types";

export type PeriodFeelingSource = Pick<InsightsSource, "sessions" | "feelings"> & { firstSetBySession: ReadonlyMap<string, number> };
export type PeriodMeal = Pick<InsightsSource["meals"][number], "date" | "entryKind" | "calories" | "proteinG" | "carbsG" | "fatG">;
/** All recorded days, trained or not. Unknown nutrients remain counts of missing entries, not a zero total. */
export function periodNutritionDetail(meals: readonly PeriodMeal[], today: string, asOf: string, revision: string, method: InsightsEngineMethod) {
  const frame = periodDetailFrame(today, asOf, revision, method);
  const days = [...nutritionDays(meals, {}).entries()].filter(([date]) => date >= frame.period.start && date <= frame.period.end)
    .sort(([a], [b]) => b.localeCompare(a)).map(([date, day]) => ({ date, ...day }));
  return { ...frame, view: "period-nutrition" as const, days, daysWithoutMeals: frame.period.days - days.length, ingestionCompleteKnown: false as const };
}
export function periodDetailFrame(today: string, asOf: string, revision: string, method: InsightsEngineMethod) {
  return { contractVersion: INSIGHTS_CONTRACT, methodVersion: method === 2 ? INSIGHTS_ENGINE_METHOD_V2 : INSIGHTS_ENGINE_METHOD,
    performanceMethodVersion: INSIGHTS_PERFORMANCE_METHOD, integrity: "valid" as const, today, sourceRevision: revision,
    periodMethodVersion: "insights-period/1" as const, asOf, period: periodOf(asOf) };
}
/** Same description and pre-answer timing as the summary; no comparator or association is constructed. */
export function periodFeelingDetail(source: PeriodFeelingSource, today: string, asOf: string, revision: string, method: InsightsEngineMethod) {
  const frame = periodDetailFrame(today, asOf, revision, method);
  const sessions = source.sessions.filter(s => s.date && s.date >= frame.period.start && s.date <= frame.period.end);
  const byId = new Map(sessions.map(s => [s.id, s]));
  const feelingsBySession = new Map<string, Partial<Record<FeelingKey, SessionFeeling>>>(), unreadableFeelingsBySession = new Map<string, FeelingKey[]>();
  for (const f of source.feelings) {
    const session = byId.get(f.sessionId); if (!session) continue;
    const parsed = parseSessionFeelings(f.facts, session, source.firstSetBySession.get(session.id) ?? null);
    feelingsBySession.set(session.id, parsed.values); if (parsed.unreadable.length) unreadableFeelingsBySession.set(session.id, parsed.unreadable);
  }
  const input: InsightsSource = { sessions, feelings: source.feelings, exercises: [], sets: [], metricDefinitions: [], metricValues: [], meals: [] };
  return { ...frame, view: "period-feelings" as const, outcomes: FEELING_OUTCOME_KINDS.map(kind => describeFeelingOutcome(input, kind, { feelingsBySession, unreadableFeelingsBySession }, today)) };
}
