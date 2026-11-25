import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import type { MobileNutritionDayResponse, NutritionDayMetric } from '@/api/nutrition-day';
import type { DayWriteController, DayWriteState } from './day-write-controller';
import { canEditDayMetric, confirmedMetricUndo, findDayMetric, metricRaw, quickMetricValue, type MetricUndo } from './metric-entry-model';
import { metricValue } from './day-details';
import { useConfirmationSlot } from '@/design-system/notice-host';

export type MetricNotice = { date: string; message: string; undo: MetricUndo | null; id?: number };
/** `brief`: the confirmation of an undo («· deshecho»): a result with no action left, so it needs no Undo window. */
type ShownNotice = MetricNotice & { id: number; metricId: string; brief?: boolean; expiresAt: number };
/** #635: one confirmation, the latest. Its window counts from the confirmation, also while an editor hides it, and a newer one
 * replaces it for good. Six seconds on screen (QA: ten felt long); a screen reader keeps ten, to hear it and still reach Deshacer. */
export const METRIC_NOTICE_MS = 6000;
export const NOTICE_SCREEN_READER_MS = 10000;
/** #511: a result with nothing to act on reads in a couple of seconds, unless a screen reader may still be reading it. */
export const METRIC_RESULT_MS = 2500;
export function useScreenReader() {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    let live = true;
    void AccessibilityInfo.isScreenReaderEnabled().then(value => { if (live) setEnabled(value); }).catch(() => undefined);
    const subscription = AccessibilityInfo.addEventListener('screenReaderChanged', setEnabled);
    return () => { live = false; subscription.remove(); };
  }, []);
  return enabled;
}
export const dayWriteInFlight = (state: DayWriteState | undefined) => state?.phase === 'pending' || state?.phase === 'confirmed' && state.message === null;
export function useMetricEntry(controller: DayWriteController | undefined, date: string) {
  const [entry, setEntry] = useState<{ id: string; date: string } | null>(null);
  const [current, setCurrent] = useState<ShownNotice | null>(null);
  const [paused, setPaused] = useState(false);
  const screenReader = useScreenReader();
  const screenReaderOn = useRef(screenReader);
  useEffect(() => { screenReaderOn.current = screenReader; }, [screenReader]);
  const sequence = useRef(0);
  const notice = current?.date === date ? current : null;
  const [undoing, setUndoing] = useState(false);
  const [feedbackHandled, setFeedbackHandled] = useState(false);
  const [owner, setOwner] = useState(controller);
  if (owner !== controller) { setOwner(controller); setEntry(null); setCurrent(null); setPaused(false); setUndoing(false); setFeedbackHandled(false); }
  const shown = useRef<ShownNotice | null>(null);
  useEffect(() => { shown.current = current; });
  const active = useRef(entry), undo = useRef<{ id: string; date: string; value: number | null } | null>(null);
  const close = useCallback(() => { controller?.close(); active.current = null; setEntry(null); }, [controller]);
  useEffect(() => {
    if (!controller) return;
    const unsubscribe = controller.subscribeConfirmed(({ intent, baseline, current: day }) => {
      // Another write of the metric on screen invalidates its CAS: its Undo is gone, and so is the notice.
      if (intent.operation === 'metrics') setCurrent(row => row && row.date === day.date && intent.changes.some(change => change.metricId === row.metricId) ? null : row);
      if (intent.operation !== 'metrics' || intent.changes.length !== 1) { setFeedbackHandled(false); return; }
      const id = intent.changes[0].metricId;
      const target = undo.current ?? active.current;
      if (!target || target.id !== id || target.date !== intent.date) { setFeedbackHandled(false); return; }
      setFeedbackHandled(true);
      const wasUndo = !!undo.current && intent.changes[0].value === undo.current.value;
      undo.current = null; active.current = null; setEntry(null); setUndoing(false);
      const metric = findDayMetric(day, id);
      if (!metric) { setFeedbackHandled(false); return; }
      const snapshot = confirmedMetricUndo(intent, baseline, day);
      setCurrent({ id: ++sequence.current, metricId: id, date: day.date, message: `${metric.label}: ${metricValue(metric, metric.value)}${wasUndo ? ' · deshecho' : ''}`,
        undo: wasUndo ? null : snapshot, brief: wasUndo,
        expiresAt: Date.now() + (screenReaderOn.current ? NOTICE_SCREEN_READER_MS : wasUndo ? METRIC_RESULT_MS : METRIC_NOTICE_MS) });
    });
    const unsubscribeState = controller.subscribe(() => {
      const state = controller.getSnapshot();
      setPaused(state.phase !== 'idle' || !!state.draft || !!state.intent);
      // A cancelled recovery releases this presentation flow. Successful writes publish
      // their confirmation just after the idle update, so leave those refs intact.
      if (state.phase === 'idle' && !state.draft && !state.intent && state.message === null) {
        active.current = null; undo.current = null; setEntry(null); setUndoing(false);
      }
    });
    return () => { unsubscribe(); unsubscribeState(); active.current = null; undo.current = null; };
  }, [controller]);
  useEffect(() => {
    if (!current) return;
    const timer = setTimeout(() => setCurrent(row => row?.id === current.id ? null : row), Math.max(0, current.expiresAt - Date.now()));
    return () => clearTimeout(timer);
  }, [current]);
  const visible = notice && !paused ? notice : null;
  // Held while it lives, also hidden (another day, an editor open): showing it again must never retire a newer one.
  useConfirmationSlot(current ? `metric:${current.id}` : null, () => setCurrent(null));
  const open = useCallback((data: MobileNutritionDayResponse, metric: NutritionDayMetric) => {
    const state = controller?.getSnapshot();
    if (!controller || !state || state.phase !== 'idle' || state.intent || state.draft || !canEditDayMetric(data, metric)) return;
    controller.open('metrics', data);
    if (!controller.getSnapshot().draft) return;
    undo.current = null; setUndoing(false);
    active.current = { id: metric.id, date: data.date }; setEntry(active.current);
  }, [controller]);
  /** Deshacer of the notice the user saw: a tap that started on a notice since replaced or run out does nothing. */
  const undoNotice = useCallback((noticeId?: number) => {
    const notice = shown.current, snapshot = notice?.undo, state = controller?.getSnapshot();
    if (!controller || !notice || !snapshot || (noticeId !== undefined && noticeId !== notice.id) || notice.expiresAt <= Date.now()
      || notice.date !== date || !state || state.phase !== 'idle' || state.intent || state.draft) return;
    controller.open('metrics', snapshot.after);
    if (!controller.getSnapshot().draft) return;
    const metric = snapshot.before;
    const raw = metricRaw(metric.value, metric.valueType === 'duration');
    // Clear duration's two fields too; null and zero have different canonical writes.
    for (const field of ['value', 'hours', 'minutes'] as const) controller.changeMetric(metric.id, field, metric.value === null ? '' : raw[field]);
    undo.current = { id: metric.id, date, value: metric.value }; setUndoing(true); setCurrent(row => row?.id === notice.id ? null : row);
    void controller.save();
  }, [controller, date]);
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
  return { entry, feedbackHandled, notice: visible ? { id: visible.id, date: visible.date, message: visible.message, undo: visible.undo } : null,
    undoing, open, quick, close, undoNotice,
    /** Hides it for good; it never writes. */
    dismissNotice: (noticeId?: number) => setCurrent(row => row && (noticeId === undefined || row.id === noticeId) ? null : row),
  };
}
