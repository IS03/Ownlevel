import { useCallback, useEffect, useRef, useState } from 'react';
import { useMobileApi } from '@/api';
import { fetchMobileNutritionDay } from '@/api/nutrition-day';
import { useMobileAuth } from '@/auth';
import { nutritionToday } from '@/nutrition/day-format';
import { MetricEntrySheet } from '@/nutrition/metric-entry-sheet';
import { canEditDayMetric, findDayMetric } from '@/nutrition/metric-entry-model';
import { MetricSavedNotice } from '@/nutrition/metric-notice';
import { useDayWriteController } from '@/nutrition/use-day-write-controller';
import { useMetricEntry } from '@/nutrition/use-metric-entry';

/**
 * Quick load from Home: the same sheet, write controller (CAS, intent recovery) and "Guardado · Deshacer"
 * notice as Nutrición › Tu día. The day is read when a metric is tapped, so Home pays nothing until then.
 */
export function useHomeMetricEntry(onSaved: () => void) {
  const { client } = useMobileApi();
  const { session } = useMobileAuth();
  // A stable callback: a new one would rebuild the write controller (and drop the open sheet).
  const saved = useRef(onSaved);
  useEffect(() => { saved.current = onSaved; }, [onSaved]);
  const invalidate = useCallback(() => saved.current(), []);
  const writes = useDayWriteController(client, session?.user.id ?? 'anonymous', invalidate);
  const [today, setToday] = useState(() => nutritionToday());
  const entry = useMetricEntry(writes?.controller, today);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const open = useCallback(async (metricId: string) => {
    if (!client || loading) return;
    const date = nutritionToday();
    setToday(date); setLoading(metricId); setError(null);
    const result = await fetchMobileNutritionDay(client, date);
    setLoading(null);
    const metric = result.status === 'ok' ? findDayMetric(result.data, metricId) : undefined;
    if (result.status !== 'ok' || !metric) { setError('No pudimos abrir esta métrica. Probá de nuevo.'); return; }
    if (!canEditDayMetric(result.data, metric)) { setError('Este día no se puede editar desde acá.'); return; }
    entry.open(result.data, metric);
  }, [client, loading, entry]);
  const state = writes?.state;
  const element = <>
    {writes && entry.entry && state?.draft ? <MetricEntrySheet id={entry.entry.id} controller={writes.controller} state={writes.state} onClose={entry.close} /> : null}
    {entry.undoing && state?.phase === 'pending' ? <MetricSavedNotice notice={{ date: today, message: 'Deshaciendo…', undo: null }} disabled pending onUndo={() => {}} onClose={() => {}} /> : null}
    {entry.notice ? <MetricSavedNotice notice={entry.notice} disabled={!!state?.draft || state?.phase !== 'idle'} onUndo={entry.undoNotice} onClose={entry.dismissNotice} /> : null}
  </>;
  const clearError = useCallback(() => setError(null), []);
  return { open, loading, error, clearError, element };
}
