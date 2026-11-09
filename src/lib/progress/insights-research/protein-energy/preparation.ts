import { buildExposureContext, foodBeforeSession } from "../../insights-engine/exposures";
import { instantMs } from "../../insights-engine/source-adapter";
import type { InsightsSource } from "../../insights-engine/types";
import { POLICY } from "./policy";

export type Snapshot = { asOf: string; revision: string; source: InsightsSource };
export type TargetState = "in_window" | "before_end" | "late" | "time_unknown" | "missing" | "unreadable" | "other_instrument" | "not_yet_captured";
export type Features = { id: string; date: string; routine: string; pre: number; hour: number; weekday: number; protein: number };
export type Row = Features & { target: { state: TargetState; value: number | null } };
export type Preparation = { rows: Row[]; completed: number; targetCounts: Record<TargetState, number>; exclusions: Record<string, number>; featureEligible: number; jointEligible: number };
const HOUR = 3_600_000;

export function validDay(day: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(Date.parse(day)) && new Date(day).toISOString().slice(0, 10) === day;
}
export function midnight(day: string): number {
  if (!validDay(day)) throw new Error("Invalid Córdoba calendar date");
  return Date.parse(`${day}T00:00:00-03:00`);
}
export function monthAfter(anchor: string, months: number): string {
  if (!validDay(anchor) || !anchor.endsWith("-01")) throw new Error("Anchor must be the first day of a month");
  const date = new Date(`${anchor}T12:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + months);
  return date.toISOString().slice(0, 10);
}
export function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function fact(facts: unknown, key: string) { return object(object(facts)?.[key]); }
function validFact(raw: Record<string, unknown> | null, moment: "pre" | "post"): boolean {
  return raw !== null && Number.isInteger(raw.value) && Number(raw.value) >= 1 && Number(raw.value) <= 5 && raw.declaredMoment === moment;
}
function capture(raw: Record<string, unknown> | null): number | null { return typeof raw?.capturedAt === "string" ? instantMs(raw.capturedAt) : null; }
function targetOf(facts: unknown, end: number | null, cutoff: number): Row["target"] {
  const raw = fact(facts, "energyPost");
  const excluded = (state: TargetState): Row["target"] => ({ state, value: null });
  if (object(facts)?.energyPost === undefined) return excluded("missing");
  if (!validFact(raw, "post")) return excluded("unreadable");
  if (raw!.instrumentVersion !== "energy-fatigue/1") return excluded("other_instrument");
  const at = capture(raw);
  if (at === null || end === null) return excluded("time_unknown");
  if (at >= cutoff) return excluded("not_yet_captured");
  if (at < end) return excluded("before_end");
  if (at > end + POLICY.postGraceHours * HOUR) return excluded("late");
  return { state: "in_window", value: Number(raw!.value) };
}
const bump = (counts: Record<string, number>, key: string) => { counts[key] = (counts[key] ?? 0) + 1; };
function duplicateKeys<T>(rows: readonly T[], key: (row: T) => string): Set<string> {
  const seen = new Set<string>(), duplicate = new Set<string>();
  for (const row of rows) { const id = key(row); if (seen.has(id)) duplicate.add(id); seen.add(id); }
  return duplicate;
}

/** Pure preparation of caller-supplied as-of snapshots, never a live reader or a reconstruction from today's view. */
export function prepare(snapshot: Snapshot, from: string, until = snapshot.asOf): Preparation {
  const cutoff = midnight(snapshot.asOf);
  if (!validDay(from) || !validDay(until) || until > snapshot.asOf || from > until || !snapshot.revision) throw new Error("Invalid snapshot interval/revision");
  // The canonical meal helper caches by object identity and assumes immutable meals. Give each preparation its own identities,
  // so a caller's in-memory revision cannot reuse provenance cached during an earlier invocation.
  const source = { ...snapshot.source, meals: snapshot.source.meals.map(meal => ({ ...meal })) };
  const context = buildExposureContext({ ...source, sets: source.sets.filter(row => {
    const at = instantMs(row.completedAt); return at !== null && at < cutoff;
  }) });
  const feelings = new Map(source.feelings.map(row => [row.sessionId, row.facts]));
  const ambiguousFeelings = duplicateKeys(source.feelings, row => row.sessionId);
  const ambiguousSessions = duplicateKeys(source.sessions, row => row.id);
  const ambiguousMeals = duplicateKeys(source.meals, row => row.id);
  const sessions = source.sessions.filter(row => row.status === "completed" && row.date !== null && row.date >= from && row.date < until);
  const days = new Map<string, number>();
  for (const session of sessions) days.set(session.date!, (days.get(session.date!) ?? 0) + 1);
  const targetCounts: Preparation["targetCounts"] = { in_window: 0, before_end: 0, late: 0, time_unknown: 0, missing: 0, unreadable: 0, other_instrument: 0, not_yet_captured: 0 };
  const result: Preparation = { rows: [], completed: sessions.length, targetCounts, exclusions: {}, featureEligible: 0, jointEligible: 0 };
  for (const session of sessions) {
    const start = instantMs(session.startedAt), end = instantMs(session.endedAt), facts = feelings.get(session.id);
    const target = targetOf(facts, end, cutoff);
    // Every completed row gets a target timing classification, even when another feature makes it ineligible.
    targetCounts[target.state]++;
    const reasons: string[] = [];
    if (!session.id || ambiguousSessions.has(session.id) || ambiguousFeelings.has(session.id) || ambiguousMeals.size > 0) reasons.push("ambiguous_identity");
    if (!validDay(session.date!)) reasons.push("invalid_date");
    if (days.get(session.date!) !== 1) reasons.push("multiple_completed_sessions_in_day");
    if (start === null || end === null || end <= start || end >= cutoff) reasons.push("invalid_session_time");
    if (!session.routineId) reasons.push("unknown_routine");
    const pre = fact(facts, "energyPre"), parsedPre = context.feelingsBySession.get(session.id)?.energyPre;
    if (!validFact(pre, "pre") || pre!.instrumentVersion !== "energy-fatigue/1" || !parsedPre
      || !["before_start", "before_first_set"].includes(parsedPre.timing) || capture(pre) === null || capture(pre)! >= cutoff) reasons.push("ineligible_pre_energy");
    const protein = validDay(session.date!) ? foodBeforeSession(context.mealsByDate, session.date!, start).preStart.proteinG : { state: "invalid_date", value: null };
    if (protein.state !== "recorded" || protein.value === null || !Number.isFinite(protein.value) || protein.value < 0) reasons.push(`protein:${protein.state}`);
    if (reasons.length) { for (const reason of reasons) bump(result.exclusions, reason); continue; }
    const local = new Date(start! - 3 * HOUR);
    result.rows.push({ id: session.id, date: session.date!, routine: session.routineId!, pre: Number(pre!.value),
      hour: local.getUTCHours() + local.getUTCMinutes() / 60, weekday: local.getUTCDay(), protein: protein.value!, target });
    result.featureEligible++;
    if (target.state === "in_window") result.jointEligible++;
  }
  result.rows.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  return result;
}
