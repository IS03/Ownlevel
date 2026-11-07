import { isNutritionDate } from '@/api/nutrition-day';
import { PROGRESS_MAX_DAYS, addDays, calendarRange, daysBetween } from '@/progress/progress-range';

/** What Insights was showing. Every value is checked on the way back: a route parameter is never trusted as an address. */
export type InsightsOrigin = { view?: 'exercises'; family?: string; relations?: '1'; date?: string; session?: string; relation?: string; summary?: '1' };
const FAMILIES = ['metric', 'nutrition', 'meal_window', 'feeling'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RELATION = /^[a-zA-Z0-9_:-]{1,120}$/;
type Params = Record<string, unknown>;

export const validSession = (value: unknown): value is string => typeof value === 'string' && UUID.test(value);
const clean = (raw: Params): InsightsOrigin => ({
  ...(raw.view === 'exercises' ? { view: 'exercises' as const } : {}),
  ...(typeof raw.family === 'string' && FAMILIES.includes(raw.family) ? { family: raw.family } : {}),
  ...(raw.relations === '1' ? { relations: '1' as const } : {}),
  ...(isNutritionDate(raw.date) ? { date: raw.date } : {}),
  ...(validSession(raw.session) ? { session: raw.session } : {}),
  ...(typeof raw.relation === 'string' && RELATION.test(raw.relation) ? { relation: raw.relation } : {}),
  ...(raw.summary === '1' ? { summary: '1' as const } : {}),
});
/** The state of the Insights screen, read from its own route. */
export const insightsOriginOf = (params: Params): InsightsOrigin => { const { relation: _relation, ...origin } = clean(params); return origin; };

const hrefParams = (origin: InsightsOrigin) => Object.fromEntries(Object.entries(origin).map(([key, value]) => [`insights${key[0]!.toUpperCase()}${key.slice(1)}`, value]));

/** From the end of a session straight to its facts. Asks for nothing here: the screen reads when it opens. */
export const insightsSessionHref = (session: string, date: string) => ({ pathname: '/(tabs)/train/insights' as const, params: { session, date } });

/**
 * A metric in Progreso, chosen, and the month of the day it was seen on. Crossing tabs loses the stack's way back, so the
 * origin travels along. Without a date the period the person already had stays.
 */
export function metricTrendHref(metric: string, date: string | null, origin: InsightsOrigin) {
  const range = date ? calendarRange('month', date) : null;
  return { pathname: '/(tabs)/progress/trends/metrics' as const, params: { metric, ...(range ? { from: range.start, to: range.end } : {}), insightsReturn: '1', ...hrefParams(origin) } };
}

/** The Nutrition day of that date. Crossing tabs loses the way back, so the origin travels along, as with a metric. */
export const nutritionDayHref = (date: string, origin: InsightsOrigin) => ({ pathname: '/(tabs)/nutrition' as const, params: { date, insightsReturn: '1', ...hrefParams(origin) } });

/**
 * The weight in Cuerpo over the days Insights was looking at: the month of one day, or the span of a relation's days (its newest
 * year at most, the longest period Progreso reads). Without dates the period the person already had stays. The origin travels along.
 */
export function bodyWeightHref(range: { from: string; to: string } | null, origin: InsightsOrigin) {
  const from = range && daysBetween(range.from, range.to) > PROGRESS_MAX_DAYS ? addDays(range.to, 1 - PROGRESS_MAX_DAYS) : range?.from;
  return { pathname: '/(tabs)/progress/trends/body' as const, params: { metric: 'body.weight', ...(range ? { from: from!, to: range.to } : {}), insightsReturn: '1', ...hrefParams(origin) } };
}
export const dayWeightHref = (date: string, origin: InsightsOrigin) => { const month = calendarRange('month', date); return bodyWeightHref({ from: month.start, to: month.end }, origin); };

/**
 * The evidence of one comparison Insights showed: the selected exercise of that session, in that method, with the reference and
 * result it showed and the read they came from, so the detail can tell whether it still says the same. The origin travels along.
 */
export function insightsEvidenceHref(selection: { session: string; exercise: string; lane: 'strict' | 'partial'; reference: string | null; result: string; revision: string }, origin: InsightsOrigin) {
  return { pathname: '/(tabs)/train/insights/evidence' as const, params: { session: selection.session, exercise: selection.exercise, lane: selection.lane, reference: selection.reference ?? 'none',
    result: selection.result, revision: selection.revision, insightsReturn: '1', ...hrefParams(origin) } };
}

/** Where "Volver a Insights" goes, if this route was opened from there. */
export function insightsReturnHref(params: Params) {
  if (params.insightsReturn !== '1') return null;
  const origin = clean({ view: params.insightsView, family: params.insightsFamily, relations: params.insightsRelations, date: params.insightsDate, session: params.insightsSession, relation: params.insightsRelation, summary: params.insightsSummary });
  if (origin.relation) return { pathname: '/(tabs)/train/insights/[relation]' as const, params: { relation: origin.relation } };
  // Opened from the summary of the last three months: back to it, which reads again when it opens.
  if (origin.summary) return { pathname: '/(tabs)/train/insights/period' as const, params: {} };
  return { pathname: '/(tabs)/train/insights' as const, params: origin };
}
