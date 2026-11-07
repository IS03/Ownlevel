import { cordobaDateOf } from "../../phase2/cordoba-date";
import { foodBeforeSession } from "./exposures";
import { instantMs, mealTimeEvidence } from "./source-adapter";
import { INSIGHTS_CONTRACT, INSIGHTS_ENGINE_METHOD_V2, type InsightsSource } from "./types";
import { INSIGHTS_PERFORMANCE_METHOD } from "../performance-insights/types";

const HOUR = 3_600_000;
export const POST_SESSION_HOURS = 3;
const SAMPLE = 20;
type Meal = InsightsSource['meals'][number];
const nutrients = ['calories', 'proteinG', 'carbsG', 'fatG'] as const;
function datesOf(from: number, to: number) {
  const first = cordobaDateOf(from), last = cordobaDateOf(to - 1);
  const dates: string[] = [];
  for (let date = first; date <= last; date = new Date(Date.parse(`${date}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10)) dates.push(date);
  return dates;
}
function references(meals: readonly Meal[]) {
  const sorted = [...meals].sort((a, b) => (a.date.localeCompare(b.date) || (a.consumedAt ?? '').localeCompare(b.consumedAt ?? '') || a.id.localeCompare(b.id)));
  return { total: meals.length, omitted: Math.max(0, meals.length - SAMPLE), dates: [...new Set(meals.map(m => m.date))].sort(),
    rows: sorted.slice(0, SAMPLE).map(m => ({ id: m.id, date: m.date, entryKind: m.entryKind, at: m.consumedAt, timeEvidence: mealTimeEvidence(m),
      calories: m.calories, proteinG: m.proteinG, carbsG: m.carbsG, fatG: m.fatG })) };
}
function windowMeals(meals: readonly Meal[], from: number, to: number, cutoff: number) {
  const dates = datesOf(from, to), known: Meal[] = [], uncertain: Meal[] = [];
  for (const meal of meals) {
    const at = instantMs(meal.consumedAt), explicit = mealTimeEvidence(meal) === 'explicit';
    if (explicit) { if (at !== null && at >= from && at < to && at <= cutoff) known.push(meal); }
    else if (dates.includes(meal.date) || (at !== null && at >= from && at < to)) uncertain.push(meal);
  }
  return { known, uncertain, dates };
}
/** Descriptive context only. No comparator, candidate, association or persisted analytical result. */
export function sessionTemporalDay(source: InsightsSource, date: string, calculatedAt: string, sourceRevision: string) {
  const now = instantMs(calculatedAt); if (now === null) throw Error('Invalid temporal cutoff');
  const completed = source.sessions.filter(s => s.status === 'completed');
  const sessions = completed.filter(s => s.date === date);
  const mealsByDate = new Map<string, Meal[]>();
  for (const meal of source.meals) { const rows = mealsByDate.get(meal.date) ?? []; rows.push(meal); mealsByDate.set(meal.date, rows); }
  return { contractVersion: INSIGHTS_CONTRACT, methodVersion: INSIGHTS_ENGINE_METHOD_V2, performanceMethodVersion: INSIGHTS_PERFORMANCE_METHOD,
    integrity: 'valid' as const, view: 'session-temporal' as const, contextMethodVersion: 'session-temporal/1' as const,
    today: cordobaDateOf(now), sourceRevision, date, calculatedAt, timezone: 'America/Argentina/Cordoba' as const,
    sessions: sessions.map(s => {
      const start = instantMs(s.startedAt), end = instantMs(s.endedAt), valid = end !== null && (start === null || end >= start) && end <= now;
      const preEvidence = start === null ? null : windowMeals(source.meals, start - 12 * HOUR, start, now);
      const before = foodBeforeSession(mealsByDate, date, start);
      const pre3h = start === null ? null : windowMeals(source.meals, start - 3 * HOUR, start, now);
      const lastHours = before.preStart.lastExplicitMeal.hours;
      const last = start === null || lastHours === null ? [] : source.meals.filter(m => mealTimeEvidence(m) === 'explicit' && instantMs(m.consumedAt) === start - Math.round(lastHours * HOUR));
      const after = valid ? windowMeals(source.meals, end!, end! + POST_SESSION_HOURS * HOUR, now) : null;
      const from = valid ? end! : null, to = valid ? end! + POST_SESSION_HOURS * HOUR : null;
      const post = after ? {
        from: new Date(from!).toISOString(), to: new Date(to!).toISOString(), provisional: now < to!,
        knownMeals: after.known.length, uncertainMeals: after.uncertain.length,
        nutrients: Object.fromEntries(nutrients.map(key => [key, { recorded: after.known.reduce((sum, m) => sum + (m[key] ?? 0), 0), missing: after.known.filter(m => m[key] === null).length }])) as Record<typeof nutrients[number], { recorded: number; missing: number }>,
        overlaps: completed.filter(other => { const at = instantMs(other.endedAt), began = instantMs(other.startedAt); return other.id !== s.id && at !== null && (began === null || at >= began) && at <= now && at < to! && at + POST_SESSION_HOURS * HOUR > from!; }).map(other => other.id).sort(),
        evidence: references([...after.known, ...after.uncertain]),
      } : null;
      return { sessionId: s.id, name: s.routineName ?? s.name ?? 'Sesión', startedAt: s.startedAt, endedAt: s.endedAt,
        durationMinutes: valid && start !== null ? (end! - start) / 60_000 : null,
        timingState: end === null ? 'no_end_time' as const : !valid ? 'invalid_time' as const : 'recorded' as const,
        before: { ...before, coverage3h: pre3h ? { knownMeals: pre3h.known.length, uncertainMeals: pre3h.uncertain.length } : null,
          lastMeal: references(last), evidence: preEvidence ? references([...preEvidence.known, ...preEvidence.uncertain]) : null }, post };
    }), ingestionCompleteKnown: false as const, associations: 'not_computed' as const };
}
export type SessionTemporalDay = ReturnType<typeof sessionTemporalDay>;
// Keep daily nutrition's meaning separate from the temporal window (and its provenance exclusions).
