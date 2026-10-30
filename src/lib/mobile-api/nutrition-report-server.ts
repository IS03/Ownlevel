import 'server-only';
import { todayInCordoba } from '../phase2/cordoba-date';
import { buildNutritionReportDays, NUTRITION_REPORT_MAX_DAYS, resolveNutritionReportRange, type NutritionReportDay } from '../nutrition/reports-core';
import { addProgressIsoDays } from '../progress/analytics';
import { MobileApiValidationError } from './auth';
import { isNutritionDate } from './nutrition-day-contract';
import { parseReportQuery } from './nutrition-report-contract';
import { buildMobileNutritionReport, parseNutritionReportFacts } from './nutrition-report';
import type { MobileSupabaseAuthenticatedContext } from './supabase';

export class NutritionReportDayChangedError extends Error {
  constructor(readonly today: string) { super('Report date changed'); }
}
/** The canonical M4.3-2 snapshot (facts) for an exact range; same RPC as Reports. */
export async function readMobileNutritionFacts(context: MobileSupabaseAuthenticatedContext, range: { start: string; end: string }, today: string) {
  const {data,error}=await context.supabase.rpc('mobile_read_nutrition_report',{p_start:range.start,p_end:range.end,p_expected_today:today},{get:true});
  if(error || !data || typeof data!=='object' || Array.isArray(data)) throw new Error('Report snapshot unavailable');
  if(data.status==='day_changed'&&isNutritionDate(data.today)) throw new NutritionReportDayChangedError(data.today);
  if(data.status!=='ok'||data.today!==today||data.start!==range.start||data.end!==range.end) throw new Error('Report snapshot unavailable');
  const facts=parseNutritionReportFacts(data);
  if(!facts) throw new Error('Report snapshot invalid');
  return facts;
}

/**
 * Days of several ranges with as few snapshot reads as possible: ranges that touch or overlap share one read while
 * their union fits the RPC's limit. The snapshot filters every fact by day (log, meals, workouts and the names of
 * the stages those days reference) and each day is built only from its own facts, so the union's days cut by date
 * are exactly the days each range would read alone.
 */
export async function readMobileNutritionDays(context: MobileSupabaseAuthenticatedContext, ranges: readonly { start: string; end: string }[], today: string): Promise<NutritionReportDay[][]> {
  const spanDays = (start: string, end: string) => Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000) + 1;
  const groups: { start: string; end: string; members: number[] }[] = [];
  for (const index of ranges.map((_, i) => i).sort((a, b) => ranges[a].start.localeCompare(ranges[b].start))) {
    const range = ranges[index], last = groups.at(-1);
    const end = last && range.end > last.end ? range.end : last?.end;
    if (last && end && range.start <= addProgressIsoDays(last.end, 1) && spanDays(last.start, end) <= NUTRITION_REPORT_MAX_DAYS) {
      last.end = end; last.members.push(index);
    } else groups.push({ start: range.start, end: range.end, members: [index] });
  }
  const days: NutritionReportDay[][] = new Array(ranges.length);
  await Promise.all(groups.map(async (group) => {
    const all = buildNutritionReportDays({ range: group, today, ...await readMobileNutritionFacts(context, group, today) });
    for (const index of group.members) days[index] = all.filter((day) => day.date >= ranges[index].start && day.date <= ranges[index].end);
  }));
  return days;
}

export async function readMobileNutritionReport(params: URLSearchParams, context: MobileSupabaseAuthenticatedContext) {
  const input: Record<string,string> = {};
  for (const [key,value] of params) {
    if (key in input) throw new MobileApiValidationError('Parámetro repetido.');
    input[key]=value;
  }
  const query=parseReportQuery({period:'7',...input});
  if (!query) throw new MobileApiValidationError('Período no válido.');
  let today=todayInCordoba();
  // One bounded retry of a READ coordinates a server-midnight boundary without
  // duplicating the canonical calendar resolver inside Postgres.
  for(let attempt=0;attempt<2;attempt++) {
    const range=resolveNutritionReportRange(query,today);
    try {
      return buildMobileNutritionReport(query,range,today,await readMobileNutritionFacts(context,range,today));
    } catch(e) {
      if(e instanceof NutritionReportDayChangedError) {today=e.today;continue;}
      throw e;
    }
  }
  throw new Error('Report date changed');
}
