import { useCallback, useEffect, useRef, useState } from 'react';
import type { MobileNutritionDayResponse, NutritionDayMetric } from '@/api/nutrition-day';
import type { DayWriteController, DayWriteState } from './day-write-controller';
import { canEditDayMetric, confirmedMetricUndo, findDayMetric, metricRaw, quickMetricValue, type MetricUndo } from './metric-entry-model';
import { metricValue } from './day-details';

export type MetricNotice = { date: string; message: string; undo: MetricUndo | null; id?: number; queuedCount?: number };
type QueuedNotice = MetricNotice & { id: number; metricId: string };
export const dayWriteInFlight = (state: DayWriteState | undefined) => state?.phase === 'pending' || state?.phase === 'confirmed' && state.message === null;
export function useMetricEntry(controller: DayWriteController | undefined, date: string) {
  const [entry, setEntry] = useState<{ id: string; date: string } | null>(null);
  const [notices, setNotices] = useState<QueuedNotice[]>([]);
  const [paused, setPaused] = useState(false);
  const sequence = useRef(0);
  const notice = notices.find(n => n.date === date) ?? null;
  const [undoing, setUndoing] = useState(false);
  const [feedbackHandled, setFeedbackHandled] = useState(false);
  const [owner, setOwner] = useState(controller);
  if (owner !== controller) { setOwner(controller); setEntry(null); setNotices([]); setPaused(false); setUndoing(false); setFeedbackHandled(false); }
  const active = useRef(entry), undo = useRef<{ id: string; date: string; value: number | null } | null>(null);
  const close = useCallback(() => { controller?.close(); active.current = null; setEntry(null); }, [controller]);
  useEffect(() => {
    if (!controller) return;
    const unsubscribe = controller.subscribeConfirmed(({ intent, baseline, current }) => {
      if (intent.operation === 'metrics') setNotices(rows => rows.map(row => row.date === current.date && row.undo && intent.changes.some(change => change.metricId === row.metricId)
        ? { ...row, undo: null, message: `${row.message} · reemplazado por otro registro` } : row));
      if (intent.operation !== 'metrics' || intent.changes.length !== 1) { setFeedbackHandled(false); return; }
      const id = intent.changes[0].metricId;
      const target = undo.current ?? active.current;
      if (!target || target.id !== id || target.date !== intent.date) { setFeedbackHandled(false); return; }
      setFeedbackHandled(true);
      const wasUndo = !!undo.current && intent.changes[0].value === undo.current.value;
      undo.current = null; active.current = null; setEntry(null); setUndoing(false);
      const metric = findDayMetric(current, id);
      if (!metric) { setFeedbackHandled(false); return; }
      const snapshot = confirmedMetricUndo(intent, baseline, current);
      const confirmed: QueuedNotice = { id: ++sequence.current, metricId: id, date: current.date, message: `${metric.label}: ${metricValue(metric, metric.value)}${wasUndo ? ' · deshecho' : ''}`, undo: wasUndo ? null : snapshot };
      // A later write of this metric invalidates its older CAS. Keep that fact visible,
      // explicitly retire its undo; never rebase a reversal onto a different receipt.
      setNotices(rows => [confirmed, ...rows]);
    });
    const unsubscribeState = controller.subscribe(() => {
      const current = controller.getSnapshot();
      setPaused(current.phase !== 'idle' || !!current.draft || !!current.intent);
      // A cancelled recovery releases this presentation flow. Successful writes publish
      // their confirmation just after the idle update, so leave those refs intact.
      if (current.phase === 'idle' && !current.draft && !current.intent && current.message === null) {
        active.current = null; undo.current = null; setEntry(null); setUndoing(false);
      }
    });
    return () => { unsubscribe(); unsubscribeState(); active.current = null; undo.current = null; };
  }, [controller]);
  useEffect(() => {
    if (!notice || paused) return;
    // Ten visible seconds per slot. Editors and newer results pause older slots;
    // returning restarts ten seconds, never silently shortening their undo.
    const timer = setTimeout(() => setNotices(rows => rows.filter(row => row.id !== notice.id)), 10000);
    return () => clearTimeout(timer);
  }, [notice, paused]);
  const open = useCallback((data: MobileNutritionDayResponse, metric: NutritionDayMetric) => {
    const state = controller?.getSnapshot();
    if (!controller || !state || state.phase !== 'idle' || state.intent || state.draft || !canEditDayMetric(data, metric)) return;
    controller.open('metrics', data);
    if (!controller.getSnapshot().draft) return;
    undo.current = null; setUndoing(false);
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
    undo.current = { id: metric.id, date, value: metric.value }; setUndoing(true); setNotices(rows => rows.filter(row => row.id !== notice.id));
    void controller.save();
  }, [controller, date, notice]);
  const quick=useCallback(async(data:MobileNutritionDayResponse,metric:NutritionDayMetric,portion:number)=>{
    const state=controller?.getSnapshot(),value=quickMetricValue(metric,portion);
    if(!controller||!state||state.phase!=='idle'||state.intent||state.draft||!canEditDayMetric(data,metric)||value===undefined)return false;
    controller.open('metrics',data);
    if(!controller.getSnapshot().draft)return false;
    const raw=metricRaw(value,metric.valueType==='duration');
    undo.current=null;setUndoing(false);active.current={id:metric.id,date:data.date};
    for(const field of ['value','hours','minutes'] as const)controller.changeMetric(metric.id,field,raw[field]);
    await controller.save();return true;
  },[controller]);
  return { entry, feedbackHandled, notice: notice && !paused ? { ...notice, queuedCount: notices.filter(n => n.date === date).length - 1 } : null,
    undoing, open, quick, close, undoNotice,
    dismissNotice: () => setNotices(rows => rows.filter(row => row.id !== notice?.id)),
    previousNotice: () => { if (notice) setNotices(rows => [...rows.filter(row => row.id !== notice.id), notice]); },
  };
}
