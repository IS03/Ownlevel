import { median, type BodyWeek, type BodyWeekChange } from "../body-evolution/weekly";
import { instantMs } from "./source-adapter";
import { postFact, POST_CAPTURE_GRACE_HOURS } from "./feeling-outcomes";
import type { createInsightsSnapshot } from "./read-model";
import type { InsightsSource, NutritionContext, SessionFact } from "./types";

export const COINCIDENCE_METHOD = "insights-coincidences/1" as const;
type Snapshot = ReturnType<typeof createInsightsSnapshot>;
type Week = { start: string; end: string; wholeWeek: boolean; days: { date: string; nutrition: NutritionContext | null }[]; weight: BodyWeek | null; weightChange: BodyWeekChange | null };
type Post = { state: "recorded" | "before_end" | "late" | "unknown_time" | "not_recorded" | "unreadable" | "other_instrument"; value: number | null };
const BANDS = ["morning", "midday", "afternoon", "night"] as const;
const hour = new Intl.DateTimeFormat("en-GB", { timeZone: "America/Argentina/Cordoba", hour: "2-digit", hourCycle: "h23" });
function bandOf(at: string | null) {
  if (instantMs(at) === null) return null;
  const h = Number(hour.format(new Date(at!)));
  return BANDS[h >= 5 && h < 11 ? 0 : h >= 11 && h < 15 ? 1 : h >= 15 && h < 20 ? 2 : 3]!;
}
function postOf(facts: unknown, key: "energyPost" | "fatiguePost", endedAt: string | null): Post {
  const fact = postFact(facts, key);
  if (fact.state !== "answered") return { state: fact.state, value: null };
  const end = instantMs(endedAt);
  const state = fact.capturedAt === null || end === null ? "unknown_time" : fact.capturedAt < end ? "before_end"
    : fact.capturedAt > end + POST_CAPTURE_GRACE_HOURS * 3_600_000 ? "late" : "recorded";
  return { state, value: state === "recorded" ? fact.value : null };
}
function ordinal(rows: { post: { energy: Post; fatigue: Post } }[], kind: "energy" | "fatigue") {
  const posts = [0, 0, 0, 0, 0], exclusions: Record<string, number> = {};
  for (const row of rows) { const p = row.post[kind]; if (p.state === "recorded") posts[p.value! - 1]!++; else exclusions[p.state] = (exclusions[p.state] ?? 0) + 1; }
  return { posts, eligible: posts.reduce((a, b) => a + b, 0), total: rows.length, exclusions };
}
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const cutOf = (values: number[]) => values.length ? median(values) : null;
const side = (value: number | null, cut: number | null) => value === null || cut === null ? null : value <= cut ? "lower" as const : "upper" as const;
function routines(rows: { routineId: string | null; routineName: string | null }[]) {
  const groups = new Map<string, { id: string | null; name: string | null; sessions: number }>();
  for (const row of rows) { const key = row.routineId ?? "unknown", previous = groups.get(key); if (previous) previous.sessions++; else groups.set(key, { id: row.routineId, name: row.routineName, sessions: 1 }); }
  return [...groups.values()].sort((a, b) => (a.id ?? "").localeCompare(b.id ?? ""));
}
const countsOf = (rows: { strict: SessionFact["counts"] }[]) => {
  const keys = ["improved", "observedStable", "declined", "ambiguous", "insufficient", "comparable", "total"] as const;
  return Object.fromEntries(keys.map(key => [key, sum(rows.map(row => row.strict[key]))])) as Record<typeof keys[number], number>;
};
const partialOf = (rows: { partial: Snapshot["partialDays"][number]["sessions"][number]["counts"] | null }[]) => {
  const keys = ["higher", "same", "lower", "ambiguous", "insufficient", "comparable", "total"] as const;
  return Object.fromEntries(keys.map(key => [key, sum(rows.map(row => row.partial?.[key] ?? 0))])) as Record<typeof keys[number], number>;
};

/** Fixed descriptive inventory. No hypothesis/candidate evaluator, data-dependent search, ranking of differences or public association. */
export function descriptiveCoincidences(source: InsightsSource, snapshot: Snapshot, weeks: readonly Week[], period: { start: string; end: string }) {
  const strict = new Map(snapshot.days.flatMap(day => day.sessions.map(session => [session.sessionId, session] as const)));
  const partial = new Map(snapshot.partialDays.flatMap(day => day.sessions.map(session => [session.sessionId, session] as const)));
  const facts = new Map(source.feelings.map(row => [row.sessionId, row.facts]));
  const rows = source.sessions.filter(s => s.status === "completed" && s.date && s.date >= period.start && s.date <= period.end).map(s => {
    const fact = strict.get(s.id), window = fact?.context.preStart?.proteinG;
    const value = window?.state === "recorded" && window.value !== null && Number.isFinite(window.value) && window.value >= 0 ? window.value : null;
    return { id: s.id, date: s.date!, name: s.routineName ?? s.name ?? "Sesión", routineId: s.routineId, routineName: s.routineName, startedAt: s.startedAt,
      protein: { state: value !== null ? "recorded" : window?.state === "recorded" ? "invalid" : window?.state ?? "unavailable", value }, band: bandOf(s.startedAt),
      strict: fact?.counts ?? { improved: 0, observedStable: 0, declined: 0, ambiguous: 0, insufficient: 0, comparable: 0, total: 0, coverage: null },
      partial: partial.get(s.id)?.counts ?? null, post: { energy: postOf(facts.get(s.id), "energyPost", s.endedAt), fatigue: postOf(facts.get(s.id), "fatiguePost", s.endedAt) } };
  }).sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const proteinCut = cutOf(rows.flatMap(row => row.protein.value === null ? [] : [row.protein.value]));
  const proteinGroups = (["lower", "upper"] as const).map(key => {
    const selected = rows.filter(row => side(row.protein.value, proteinCut) === key);
    return { key, ids: selected.map(row => row.id), sessions: selected.length, strict: countsOf(selected), partial: partialOf(selected),
      strictSessions: selected.filter(row => row.strict.comparable > 0).length, partialSessions: selected.filter(row => (row.partial?.comparable ?? 0) > 0).length, routines: routines(selected) };
  });
  const proteinExclusions: Record<string, number> = {};
  for (const row of rows) if (row.protein.value === null) proteinExclusions[row.protein.state] = (proteinExclusions[row.protein.state] ?? 0) + 1;
  const timingGroups = BANDS.map(key => {
    const selected = rows.filter(row => row.band === key);
    return { key, ids: selected.map(row => row.id), sessions: selected.length, energy: ordinal(selected, "energy"), fatigue: ordinal(selected, "fatigue"), routines: routines(selected) };
  });
  const weekRows = weeks.map(week => {
    const complete = week.days.filter(day => day.nutrition && day.nutrition.activeMeals > 0 && day.nutrition.proteinG.missing === 0);
    const partialDays = week.days.filter(day => day.nutrition && day.nutrition.proteinG.missing > 0 && day.nutrition.proteinG.missing < day.nutrition.activeMeals).length;
    const amount = week.wholeWeek && complete.length >= 4 ? sum(complete.map(day => day.nutrition!.proteinG.recorded)) / complete.length : null;
    return { start: week.start, end: week.end, wholeWeek: week.wholeWeek, proteinPerRecordedDay: amount, completeDays: complete.length, partialDays, unknownDays: week.days.length - complete.length - partialDays,
      median: week.weight?.median ?? null, weighIns: week.weight?.weighIns ?? [], change: week.weightChange?.change ?? null,
      changeReason: week.weightChange?.reason ?? "no_previous_week", previousStart: week.weightChange?.previousStart ?? null,
      days: week.days.map(day => ({ date: day.date, protein: day.nutrition?.proteinG ?? null, records: day.nutrition?.activeMeals ?? 0 })) };
  });
  const weekCut = cutOf(weekRows.flatMap(row => row.proteinPerRecordedDay === null ? [] : [row.proteinPerRecordedDay]));
  const bodyGroups = (["lower", "upper"] as const).map(key => {
    const selected = weekRows.filter(row => side(row.proteinPerRecordedDay, weekCut) === key), eligible = selected.filter(row => row.change !== null);
    return { key, starts: selected.map(row => row.start), weeks: selected.length, eligible: eligible.length,
      increased: eligible.filter(row => row.change! > 0).length, same: eligible.filter(row => row.change === 0).length, decreased: eligible.filter(row => row.change! < 0).length,
      completeDays: sum(selected.map(row => row.completeDays)), partialDays: sum(selected.map(row => row.partialDays)), unknownDays: sum(selected.map(row => row.unknownDays)) };
  });
  const strictReady = proteinGroups.every(group => group.strictSessions >= 3), partialReady = proteinGroups.every(group => group.partialSessions >= 3);
  return { methodVersion: COINCIDENCE_METHOD, claim: "descriptive_only" as const, sessionRows: rows, weekRows,
    protein: { cut: proteinCut, total: rows.length, eligible: sum(proteinGroups.map(g => g.sessions)), groups: proteinGroups, exclusions: proteinExclusions,
      status: strictReady || partialReady ? "described" as const : "insufficient" as const, strictReady, partialReady },
    timing: { groups: timingGroups, total: rows.length, unknownStart: rows.filter(row => row.band === null).length,
      energyReady: timingGroups.filter(g => g.energy.eligible >= 3).length >= 2, fatigueReady: timingGroups.filter(g => g.fatigue.eligible >= 3).length >= 2 },
    body: { cut: weekCut, groups: bodyGroups, total: weekRows.length, excludedNutrition: weekRows.filter(row => row.proteinPerRecordedDay === null).length,
      status: bodyGroups.every(group => group.eligible >= 2) ? "described" as const : "insufficient" as const },
  };
}
export type DescriptiveCoincidences = ReturnType<typeof descriptiveCoincidences>;
