import { parseNutritionReport, type ReportQuery } from '../../../../src/lib/mobile-api/nutrition-report-contract';
import type { MobileApiClient } from './client';
export { parseNutritionReport, parseReportQuery, REPORT_PRESETS, REPORT_METRICS, REPORT_NUTRIENTS } from '../../../../src/lib/mobile-api/nutrition-report-contract';
export type { NutritionReport, ReportQuery, ReportPreset, ReportMetric, ReportStatistic, ReportDailyRow } from '../../../../src/lib/mobile-api/nutrition-report-contract';
export function reportQueryKey(query: ReportQuery) { return `${query.period}:${query.from ?? ''}:${query.to ?? ''}`; }
export function fetchNutritionReport(client:MobileApiClient, query:ReportQuery, signal?:AbortSignal, background=false) {
  const params=new URLSearchParams({period:query.period});
  if(query.from!==undefined)params.set('from',query.from);
  if(query.to!==undefined)params.set('to',query.to);
  return client.read({path:`/api/mobile/v1/nutrition/reports?${params}`,signal,...(background?{background:true}:{}),parse:raw=>{
    const data=parseNutritionReport(raw);
    return data&&reportQueryKey(data.range.requested)===reportQueryKey(query)?data:undefined;
  }});
}
