import { useCallback, useEffect, useRef, useState } from 'react';
import type { MobileNutritionDayResponse, NutritionDayMetric } from '@/api/nutrition-day';
import type { DayWriteController } from './day-write-controller';
import { canEditDayMetric, confirmedMetricUndo, findDayMetric, metricRaw, quickMetricValue, type MetricUndo } from './metric-entry-model';
import { metricValue } from './day-details';

export type MetricNotice = { date: string; message: string; undo: MetricUndo | null };
export function useMetricEntry(controller: DayWriteController | undefined, date: string) {
  const [entry, setEntry] = useState<{ id: string; date: string } | null>(null);
  const [notice, setNotice] = useState<MetricNotice | null>(null);
  const [undoing, setUndoing] = useState(false);
  const [feedbackHandled, setFeedbackHandled] = useState(false);
  const [owner, setOwner] = useState(controller);
  if (owner !== controller) { setOwner(controller); setEntry(null); setNotice(null); setUndoing(false); setFeedbackHandled(false); }
  const active = useRef(entry), undo = useRef<{ id: string; date: string; value: number | null } | null>(null);
  const close = useCallback(() => { controller?.close(); active.current = null; setEntry(null); }, [controller]);
  useEffect(() => {
    if (!controller) return;
    const unsubscribe = controller.subscribeConfirmed(({ intent, baseline, current }) => {
      if (intent.operation !== 'metrics' || intent.changes.length !== 1) { setFeedbackHandled(false); return; }
      const id = intent.changes[0].metricId;
      const target = undo.current ?? active.current;
      if (!target || target.id !== id || target.date !== intent.date) { setFeedbackHandled(false); return; }
      setFeedbackHandled(true);
      const wasUndo = !!undo.current && intent.changes[0].value === undo.current.value;
      undo.current = null; active.current = null; setEntry(null); setUndoing(false);
      const metric = findDayMetric(current, id);
      const snapshot = confirmedMetricUndo(intent, baseline, current);
      setNotice({ date: current.date, message: metric ? `${metric.label}: ${metricValue(metric, metric.value)}${wasUndo ? ' · deshecho' : ''}` : 'Cambio guardado.', undo: wasUndo ? null : snapshot });
    });
    const unsubscribeState = controller.subscribe(() => {
      const current = controller.getSnapshot();
      // A cancelled recovery releases this presentation flow. Successful writes publish
      // their confirmation just after the idle update, so leave those refs intact.
      if (current.phase === 'idle' && !current.draft && !current.intent && current.message === null) {
        active.current = null; undo.current = null; setEntry(null); setUndoing(false);
      }
    });
    return () => { unsubscribe(); unsubscribeState(); active.current = null; undo.current = null; };
  }, [controller]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 10000);
    return () => clearTimeout(timer);
  }, [notice]);
  const open = useCallback((data: MobileNutritionDayResponse, metric: NutritionDayMetric) => {
    const state = controller?.getSnapshot();
    if (!controller || !state || state.phase !== 'idle' || state.intent || state.draft || !canEditDayMetric(data, metric)) return;
    controller.open('metrics', data);
    if (!controller.getSnapshot().draft) return;
    undo.current = null; setUndoing(false); setNotice(null);
    active.current = { id: metric.id, date: data.date }; setEntry(active.current);
  }, [controller]);
  const undoNotice = useCallback(() => {
    const snapshot = notice?.undo, state = controller?.getSnapshot();
    if (!controller || !snapshot || notice.date !== date || !state || state.phase !== 'idle' || state.intent || state.draft) return;
    controller.open('metrics', snapshot.after);
    if (!controller.getSnapshot().draft) return;
    const metric = snapshot.before;
    const raw = metricRaw(metric.value, metric.valueType === 'duration');
    // Clear duration's two fields too; null and zero have different canonical writes.
    for (const field of ['value', 'hours', 'minutes'] as const) controller.changeMetric(metric.id, field, metric.value === null ? '' : raw[field]);
    undo.current = { id: metric.id, date, value: metric.value }; setUndoing(true); setNotice(null);
    void controller.save();
  }, [controller, date, notice]);
  const quick=useCallback(async(data:MobileNutritionDayResponse,metric:NutritionDayMetric,portion:number)=>{
    const state=controller?.getSnapshot(),value=quickMetricValue(metric,portion);
    if(!controller||!state||state.phase!=='idle'||state.intent||state.draft||!canEditDayMetric(data,metric)||value===undefined)return false;
    controller.open('metrics',data);
    if(!controller.getSnapshot().draft)return false;
    const raw=metricRaw(value,metric.valueType==='duration');
    undo.current=null;setUndoing(false);setNotice(null);active.current={id:metric.id,date:data.date};
    for(const field of ['value','hours','minutes'] as const)controller.changeMetric(metric.id,field,raw[field]);
    await controller.save();return true;
  },[controller]);
  return { entry, feedbackHandled, notice: notice?.date === date ? notice : null, undoing, open, quick, close, undoNotice, dismissNotice: () => setNotice(null) };
}
