import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useMobileApi } from '@/api';
import { fetchMobileNutritionDay, type MobileNutritionDayResponse } from '@/api/nutrition-day';
import { useMobileAuth } from '@/auth';
import { nutritionToday } from '@/nutrition/day-format';
import { MetricEntrySheet } from '@/nutrition/metric-entry-sheet';
import { canEditDayMetric, findDayMetric } from '@/nutrition/metric-entry-model';
import { MetricSavedNotice } from '@/nutrition/metric-notice';
import { useDayWriteController } from '@/nutrition/use-day-write-controller';
import { useMetricEntry } from '@/nutrition/use-metric-entry';

/**
 * Quick load from Home: the same sheet, write controller (CAS, intent recovery) and "Guardado · Deshacer"
 * notice as Nutrición › Tu día. Today's day is read ahead (on focus and after each save) so the sheet opens
 * at once; a stale read is safe because the save is checked against the server's version (CAS).
 */
type DayRead = { date: string; at: number; data: MobileNutritionDayResponse };
const FRESH_MS = 5 * 60_000;
export function useHomeMetricEntry(onSaved: () => void) {
  const { client } = useMobileApi();
  const { session } = useMobileAuth();
  // A stable callback: a new one would rebuild the write controller (and drop the open sheet).
  const saved = useRef(onSaved);
  useEffect(() => { saved.current = onSaved; }, [onSaved]);
  const ahead = useRef<{ read: DayRead | null; pending: Promise<DayRead | null> | null }>({ read: null, pending: null });
  const readDay = useCallback((): Promise<DayRead | null> => {
    if (!client) return Promise.resolve(null);
    if (ahead.current.pending) return ahead.current.pending;
    const date = nutritionToday();
    const pending = fetchMobileNutritionDay(client, date).then(result => {
      const read = result.status === 'ok' ? { date, at: Date.now(), data: result.data } : null;
      if (ahead.current.pending === pending) ahead.current = { read: read ?? ahead.current.read, pending: null };
      return read;
    });
    ahead.current.pending = pending;
    return pending;
  }, [client]);
  useEffect(() => { ahead.current = { read: null, pending: null }; }, [client]);
  useFocusEffect(useCallback(() => { void readDay(); }, [readDay]));
  const readAhead = useRef(readDay);
  useEffect(() => { readAhead.current = readDay; }, [readDay]);
  const invalidate = useCallback(() => {
    ahead.current.read = null;
    void readAhead.current();
    saved.current();
  }, []);
  const writes = useDayWriteController(client, session?.user.id ?? 'anonymous', invalidate);
  const [today, setToday] = useState(() => nutritionToday());
  const entry = useMetricEntry(writes?.controller, today);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const open = useCallback(async (metricId: string) => {
    if (!client || loading) return;
    const date = nutritionToday();
    setToday(date); setError(null);
    const cached = ahead.current.read;
    let read = cached && cached.date === date && Date.now() - cached.at < FRESH_MS ? cached : null;
    if (!read) {
      setLoading(metricId);
      const fresh = await readDay();
      setLoading(null);
      read = fresh?.date === date ? fresh : null;
    }
    const metric = read ? findDayMetric(read.data, metricId) : undefined;
    if (!read || !metric) { setError('No pudimos abrir esta métrica. Probá de nuevo.'); return; }
    if (!canEditDayMetric(read.data, metric)) { setError('Este día no se puede editar desde acá.'); return; }
    entry.open(read.data, metric);
  }, [client, loading, entry, readDay]);
  const state = writes?.state;
  const element = <>
    {writes && entry.entry && state?.draft ? <MetricEntrySheet id={entry.entry.id} controller={writes.controller} state={writes.state} onClose={entry.close} /> : null}
    {entry.undoing && state?.phase === 'pending' ? <MetricSavedNotice notice={{ date: today, message: 'Deshaciendo…', undo: null }} disabled pending onUndo={() => {}} onClose={() => {}} /> : null}
    {entry.notice ? <MetricSavedNotice notice={entry.notice} disabled={!!state?.draft || state?.phase !== 'idle'} onUndo={entry.undoNotice} onClose={entry.dismissNotice} /> : null}
  </>;
  const clearError = useCallback(() => setError(null), []);
  return { open, loading, error, clearError, element };
}
