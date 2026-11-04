import { isNutritionDate } from '@/api/nutrition-day';
import { calendarRange } from '@/progress/progress-range';

/** What Insights was showing. Every value is checked on the way back: a route parameter is never trusted as an address. */
export type InsightsOrigin = { view?: 'exercises'; family?: string; relations?: '1'; date?: string; session?: string; relation?: string };
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

/** Where "Volver a Insights" goes, if this route was opened from there. */
export function insightsReturnHref(params: Params) {
  if (params.insightsReturn !== '1') return null;
  const origin = clean({ view: params.insightsView, family: params.insightsFamily, relations: params.insightsRelations, date: params.insightsDate, session: params.insightsSession, relation: params.insightsRelation });
  if (origin.relation) return { pathname: '/(tabs)/train/insights/[relation]' as const, params: { relation: origin.relation } };
  return { pathname: '/(tabs)/train/insights' as const, params: origin };
}
