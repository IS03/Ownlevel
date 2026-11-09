import { isNutritionDate } from '@/api/nutrition-day';
import { validPeriodAnchor,isFoodKind,validCoincidenceSelection,type FoodKind,type WeeklyNutrient,WEEKLY_NUTRIENTS } from '@/api/performance-insights';
import { PROGRESS_MAX_DAYS, addDays, calendarRange, daysBetween } from '@/progress/progress-range';

/** What Insights was showing. Every value is checked on the way back: a route parameter is never trusted as an address. */
export type InsightsOrigin = { fromProgress?: '1'; view?: 'exercises'; family?: string; relations?: '1'; date?: string; session?: string; fromSession?: '1'; relation?: string; summary?: '1'; period?: 'feelings' | 'nutrition'; asOf?: string; revision?: string; temporal?: '1'; explore?: '1'; week?: string; before?: string; coincidence?: FoodKind|'timing'|'body'; coincidenceGroup?: string; coincidencePage?: string; coincidenceView?: 'feelings'; weeklyNutrient?: WeeklyNutrient; weeklyOutcome?: 'training'|'weight'; compare?: '1'; weekA?: string; weekB?: string; weekSide?: 'A' | 'B' };
const FAMILIES = ['metric', 'nutrition', 'meal_window', 'feeling'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RELATION = /^[a-zA-Z0-9_:-]{1,120}$/;
type Params = Record<string, unknown>;
export function coincidenceSelection(raw: Params): Pick<InsightsOrigin,'coincidence'|'coincidenceGroup'|'coincidencePage'|'coincidenceView'|'weeklyNutrient'|'weeklyOutcome'> {
  const kind=raw.coincidence;
  if(!isFoodKind(kind)&&kind!=='timing'&&kind!=='body')return {};
  const validGroup=(value:unknown)=>kind==='body'?['lower','upper','excluded'].includes(String(value)):validCoincidenceSelection(kind,value);
  const page=typeof raw.coincidencePage==='string'&&/^\d{1,7}$/.test(raw.coincidencePage)&&Number(raw.coincidencePage)%25===0&&kind!=='body'&&typeof raw.coincidenceGroup==='string'&&validGroup(raw.coincidenceGroup)?raw.coincidencePage:undefined;
  return {coincidence:kind,...(kind==='body'&&WEEKLY_NUTRIENTS.includes(raw.weeklyNutrient as WeeklyNutrient)?{weeklyNutrient:raw.weeklyNutrient as WeeklyNutrient}:{}),...(kind==='body'&&(raw.weeklyOutcome==='training'||raw.weeklyOutcome==='weight')?{weeklyOutcome:raw.weeklyOutcome}:{}),...(isFoodKind(kind)&&raw.coincidenceView==='feelings'?{coincidenceView:'feelings' as const}:{}),...(page?{coincidencePage:page}:{}),...(typeof raw.coincidenceGroup==='string'&&validGroup(raw.coincidenceGroup)?{coincidenceGroup:raw.coincidenceGroup}:{})};
}

const comparisonParams = (raw: Params): Pick<InsightsOrigin, 'compare' | 'weekA' | 'weekB' | 'weekSide'> =>
  raw.compare === '1' && raw.explore === '1' && validPeriodAnchor(raw.asOf) && isNutritionDate(raw.week)
    && isNutritionDate(raw.weekA) && isNutritionDate(raw.weekB) && raw.weekA !== raw.weekB
    ? { compare: '1', weekA: raw.weekA, weekB: raw.weekB, ...(raw.weekSide === 'A' || raw.weekSide === 'B' ? { weekSide: raw.weekSide } : {}) } : {};

export const validSession = (value: unknown): value is string => typeof value === 'string' && UUID.test(value);
export const progressOriginParams=(raw:Params):{fromProgress?:'1'}=>raw.fromProgress==='1'?{fromProgress:'1'}:{};
const clean = (raw: Params): InsightsOrigin => ({
  ...progressOriginParams(raw),
  ...coincidenceSelection(raw),
  ...comparisonParams(raw),
  ...(raw.view === 'exercises' ? { view: 'exercises' as const } : {}),
  ...(typeof raw.family === 'string' && FAMILIES.includes(raw.family) ? { family: raw.family } : {}),
  ...(raw.relations === '1' ? { relations: '1' as const } : {}),
  ...(isNutritionDate(raw.date) ? { date: raw.date } : {}),
  ...(validSession(raw.session) ? { session: raw.session } : {}),
  ...(raw.fromSession === '1' && validSession(raw.session) && isNutritionDate(raw.date) ? { fromSession: '1' as const } : {}),
  ...(typeof raw.relation === 'string' && RELATION.test(raw.relation) ? { relation: raw.relation } : {}),
  ...(raw.summary === '1' ? { summary: '1' as const } : {}),
  ...(raw.temporal === '1' && isNutritionDate(raw.date) ? { temporal: '1' as const } : {}),
  ...(raw.explore === '1' && validPeriodAnchor(raw.asOf) && isNutritionDate(raw.week) ? { explore: '1' as const,week:raw.week } : {}),
  ...(isNutritionDate(raw.before) ? {before:raw.before} : {}),
  ...((raw.period === 'feelings' || raw.period === 'nutrition') && validPeriodAnchor(raw.asOf) ? { period: raw.period, asOf: raw.asOf } : {}),
  ...(validPeriodAnchor(raw.asOf) ? { asOf: raw.asOf } : {}),
  ...(typeof raw.revision === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(raw.revision) ? { revision: raw.revision } : {}),
});
/** The state of the Insights screen, read from its own route. */
export const insightsOriginOf = (params: Params): InsightsOrigin => { const { relation: _relation, ...origin } = clean(params); return origin; };

const hrefParams = (origin: InsightsOrigin) => Object.fromEntries(Object.entries(origin).map(([key, value]) => [`insights${key[0]!.toUpperCase()}${key.slice(1)}`, value]));

/** From the end of a session straight to its facts. Asks for nothing here: the screen reads when it opens. */
export const insightsSessionHref = (session: string, date: string) => validSession(session) && isNutritionDate(date)
  ? { pathname: '/(tabs)/train/insights' as const, params: { session, date, fromSession: '1' as const } } : null;

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
export const periodSummaryHref = (asOf?: string,origin:InsightsOrigin={}) => ({ pathname: '/(tabs)/train/insights/period' as const, params: {...progressOriginParams(origin),...(asOf?{asOf}:{})} });
export const explorationHref = (asOf: string,week?:string,revision?:string,selection:InsightsOrigin={}) => ({pathname:'/(tabs)/train/insights/weeks' as const,params:{...progressOriginParams(selection),asOf,...(week?{week}:{}),...(revision?{revision}:{}),...coincidenceSelection(selection),...comparisonParams({...selection,asOf,week,explore:'1'})}});
export const periodDetailHref = (kind: 'feelings' | 'nutrition', asOf: string, revision?: string,origin:InsightsOrigin={}) => ({
  pathname: kind === 'feelings' ? '/(tabs)/train/insights/period-feelings' as const : '/(tabs)/train/insights/period-nutrition' as const,
  params: { ...progressOriginParams(origin),asOf, ...(revision ? { revision } : {}) },
});

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
  const origin = clean({ fromProgress:params.insightsFromProgress,view: params.insightsView, family: params.insightsFamily, relations: params.insightsRelations, date: params.insightsDate, session: params.insightsSession, fromSession: params.insightsFromSession, relation: params.insightsRelation, summary: params.insightsSummary,
    period: params.insightsPeriod, asOf: params.insightsAsOf, revision: params.insightsRevision, temporal: params.insightsTemporal,explore:params.insightsExplore,week:params.insightsWeek,before:params.insightsBefore,compare:params.insightsCompare,weekA:params.insightsWeekA,weekB:params.insightsWeekB,weekSide:params.insightsWeekSide,coincidence:params.insightsCoincidence,coincidenceGroup:params.insightsCoincidenceGroup,coincidencePage:params.insightsCoincidencePage,coincidenceView:params.insightsCoincidenceView,weeklyNutrient:params.insightsWeeklyNutrient,weeklyOutcome:params.insightsWeeklyOutcome });
  if(params.insightsFromProgress!==undefined&&!origin.fromProgress)return null;
  if(params.insightsCoincidence!==undefined&&!origin.coincidence||params.insightsCoincidenceGroup!==undefined&&!origin.coincidenceGroup)return null;
  if(params.insightsWeeklyNutrient!==undefined&&!origin.weeklyNutrient||params.insightsWeeklyOutcome!==undefined&&!origin.weeklyOutcome)return null;
  if(params.insightsCoincidenceView!==undefined&&!origin.coincidenceView)return null;
  if(params.insightsCoincidencePage!==undefined&&!origin.coincidencePage)return null;
  if(params.insightsCompare!==undefined&&!origin.compare)return null;
  if (params.insightsTemporal !== undefined) { const {temporal:_temporal,...route}=origin;return origin.temporal&&origin.date?{pathname:'/(tabs)/train/insights/temporal' as const,params:route}:null; }
  if(params.insightsExplore!==undefined&&!origin.explore)return null;
  if(origin.explore&&origin.asOf&&origin.week&&!origin.date)return explorationHref(origin.asOf,origin.week,origin.revision,origin);
  if (params.insightsPeriod !== undefined && !origin.period) return null;
  if (origin.period && origin.asOf) return periodDetailHref(origin.period, origin.asOf, origin.revision,origin);
  if (origin.relation) return { pathname: '/(tabs)/train/insights/[relation]' as const, params: { ...progressOriginParams(origin),relation: origin.relation } };
  // Opened from the summary of the last three months: back to it, which reads again when it opens.
  if (origin.summary) return periodSummaryHref(origin.asOf,origin);
  return { pathname: '/(tabs)/train/insights' as const, params: origin };
}

export const withProgressOrigin=<T extends string>(pathname:T,origin:Params)=>progressOriginParams(origin).fromProgress?{pathname,params:progressOriginParams(origin)}:pathname;
