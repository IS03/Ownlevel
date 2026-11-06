import { parseDayWriteIntent, type DayWriteIntent } from '@/api/nutrition-day-write';
import { SLEEP_NIGHT_CONVENTION } from '../../../../src/lib/daily-metrics/sleep-night';
import type { MobileNutritionDayResponse } from '@/api/nutrition-day';
export type MetricInput = { value: string; hours: string; minutes: string };
export type DayWriteDraft = { kind: 'metrics' | 'context'; baseline: MobileNutritionDayResponse; metrics: Record<string, MetricInput>; target: string; expenditure: string };
function metricInput(value: number | null, duration: boolean): MetricInput {
  return { value: value === null ? '' : String(value).replace('.',','), hours: duration && value !== null ? String(Math.floor(value / 60)) : '', minutes: duration && value !== null ? String(value % 60) : '' };
}
export function dayWriteDraft(kind: DayWriteDraft['kind'], baseline: MobileNutritionDayResponse): DayWriteDraft {
  const c = baseline.nutrition.status === 'ok' && baseline.nutrition.data.dayState === 'recorded' ? baseline.nutrition.data.context : null;
  return { kind, baseline, metrics: Object.fromEntries(baseline.activity.status === 'ok' ? baseline.activity.data.metrics.map(m => [m.id,metricInput(m.value,m.valueType === 'duration')]) : []),
    target: c?.targetOverrideKcal === null || c?.targetOverrideKcal === undefined ? '' : String(c.targetOverrideKcal),
    expenditure: c?.expenditureOverrideKcal === null || c?.expenditureOverrideKcal === undefined ? '' : String(c.expenditureOverrideKcal) };
}
export function canWriteDay(kind: DayWriteDraft['kind'], data: MobileNutritionDayResponse) {
  // Metrics are recorded only up to the SERVER's today (M5.2); the server rejects later dates too.
  return kind === 'metrics' ? data.date <= data.today && data.activity.status === 'ok'
    && data.activity.data.metrics.some(m => m.isActive || (data.date < data.today && m.value !== null)) && data.activity.data.metrics.every(m => !!m.definitionUpdatedAt)
    : data.nutrition.status === 'ok' && data.nutrition.data.dayState === 'recorded' && !!data.nutrition.data.context.updatedAt;
}
export function draftDirty(d: DayWriteDraft) {
  const original = dayWriteDraft(d.kind,d.baseline);
  return d.kind === 'metrics' ? JSON.stringify(d.metrics) !== JSON.stringify(original.metrics) : d.target !== original.target || d.expenditure !== original.expenditure;
}
export function metricInputValue(input: MetricInput, type: string): number | null | undefined {
  if (type === 'duration') {
    const h=input.hours.trim(), m=input.minutes.trim();
    if (!h && !m) return null;
    if ((h && !/^\d+$/.test(h)) || (m && !/^\d+$/.test(m)) || Number(m)>59) return;
    const value=Number(h||0)*60+Number(m||0);
    return Number.isSafeInteger(value) && value<=9999999999 ? value : undefined;
  }
  const raw=input.value.trim();
  if (!raw) return null;
  if (!(type === 'integer' ? /^\d+$/ : /^\d+(?:[,.]\d{1,4})?$/).test(raw)) return;
  const value=Number(raw.replace(',','.'));
  return Number.isFinite(value) && value<=9999999999.9999 ? value : undefined;
}
export function buildDayWriteIntent(d: DayWriteDraft, idempotencyKey: string): { intent?: DayWriteIntent; errors: Record<string,string>; empty?: boolean } {
  const errors: Record<string,string> = {};
  if (!canWriteDay(d.kind,d.baseline)) return { errors: { form:'No hay una versión editable confirmada para esta fecha.' } };
  if (d.kind === 'metrics' && d.baseline.activity.status === 'ok') {
    const changes=[];
    for (const m of d.baseline.activity.data.metrics) {
      if (!m.isActive && d.baseline.date >= d.baseline.today) continue;
      const input=d.metrics[m.id];
      const value=input ? metricInputValue(input,m.valueType) : undefined;
      if (value === undefined || (m.systemKey === 'steps' && value !== null && value>2147483647)) { errors[m.id]=m.valueType==='duration' ? 'Usá horas enteras y minutos de 0 a 59.' : 'Usá un valor no negativo del tipo indicado.'; continue; }
      // The sleep sheet says which night it is (#367): a value written there declares it. Clearing declares nothing.
      if (value !== m.value) changes.push({metricId:m.id,definitionUpdatedAt:m.definitionUpdatedAt!,expectedUpdatedAt:m.updatedAt,value,...(m.systemKey === 'sleep' && value !== null ? { sleepNight: SLEEP_NIGHT_CONVENTION } : {})});
    }
    if (Object.keys(errors).length) return { errors };
    if (!changes.length) return { errors,empty:true };
    const intent=parseDayWriteIntent({operation:'metrics',date:d.baseline.date,idempotencyKey,changes});
    return intent ? {intent,errors} : {errors:{form:'Revisá los valores del grupo.'}};
  }
  const original=dayWriteDraft(d.kind,d.baseline), changes: Record<string,unknown>={};
  for (const [key,max] of [['target',20000],['expenditure',50000]] as const) {
    if (d[key] === original[key]) continue;
    const raw=d[key].trim();
    if (!raw) changes[key]={action:'clear'};
    else if (!/^\d+$/.test(raw) || Number(raw)<1 || Number(raw)>max) errors[key]=`Usá calorías enteras entre 1 y ${max}.`;
    else changes[key]={action:'set',value:Number(raw)};
  }
  if (Object.keys(errors).length) return {errors};
  if (!Object.keys(changes).length) return {errors,empty:true};
  const c=d.baseline.nutrition.status==='ok' && d.baseline.nutrition.data.dayState==='recorded' ? d.baseline.nutrition.data.context : null;
  const intent=parseDayWriteIntent({operation:'context',date:d.baseline.date,idempotencyKey,expectedUpdatedAt:c?.updatedAt,changes});
  return intent ? {intent,errors} : {errors:{form:'No hay una versión del contexto confirmada.'}};
}
export function rebaseDayDraft(d: DayWriteDraft, truth: MobileNutritionDayResponse): DayWriteDraft | null {
  if (truth.date!==d.baseline.date || !canWriteDay(d.kind,truth)) return null;
  const next=dayWriteDraft(d.kind,truth), original=dayWriteDraft(d.kind,d.baseline);
  if (d.kind==='context') return {...next,target:d.target!==original.target ? d.target : next.target,expenditure:d.expenditure!==original.expenditure ? d.expenditure : next.expenditure};
  if (d.baseline.activity.status!=='ok' || truth.activity.status!=='ok') return null;
  for (const old of d.baseline.activity.data.metrics) {
    if (JSON.stringify(d.metrics[old.id])===JSON.stringify(original.metrics[old.id])) continue;
    const current=truth.activity.data.metrics.find(m=>m.id===old.id);
    if (!current || current.valueType!==old.valueType || current.unit!==old.unit || (!current.isActive && current.value===null)) return null;
    next.metrics[old.id]=d.metrics[old.id];
  }
  return next;
}
