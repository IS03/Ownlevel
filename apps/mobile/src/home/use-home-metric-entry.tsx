import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useMobileApi } from '@/api';
import {
  fetchMobileNutritionDay,
  type MobileNutritionDayResponse,
} from '@/api/nutrition-day';
import { useMobileAuth } from '@/auth';
import { nutritionToday } from '@/nutrition/day-format';
import { MetricEntrySheet } from '@/nutrition/metric-entry-sheet';
import {
  canEditDayMetric,
  findDayMetric,
  sameMetricTimestamp,
} from '@/nutrition/metric-entry-model';
import { MetricSavedNotice } from '@/nutrition/metric-notice';
import { useDayWriteController } from '@/nutrition/use-day-write-controller';
import { useMetricEntry } from '@/nutrition/use-metric-entry';
import { useMetricPresentations } from '@/metrics/presentation-provider';
import { triggerMetricHaptic } from '@/platform/haptics';
import { NutritionToast } from '@/nutrition/nutrition-toast';
import { subscribeMetricDefinitionsChanged } from '@/metrics/presentation-resource';
export type QuickMetricTap = {
  value: number | null;
  updatedAt: string | null;
  definitionUpdatedAt?: string;
  portion: number;
  date: string;
};

/**
 * Quick load from Home: the same sheet, write controller (CAS, intent recovery) and "Guardado · Deshacer"
 * notice as Nutrición › Tu día. Today's day is read ahead (on focus and after each save) so the sheet opens
 * at once; a stale read is safe because the save is checked against the server's version (CAS).
 */
type DayRead = { date: string; at: number; data: MobileNutritionDayResponse };
const FRESH_MS = 5 * 60_000;
export function useHomeMetricEntry(onSaved: () => void) {
  const definitions = useMetricPresentations();
  const { client } = useMobileApi();
  const { session } = useMobileAuth();
  // A stable callback: a new one would rebuild the write controller (and drop the open sheet).
  const saved = useRef(onSaved);
  useEffect(() => {
    saved.current = onSaved;
  }, [onSaved]);
  const ahead = useRef<{
    read: DayRead | null;
    pending: Promise<DayRead | null> | null;
  }>({ read: null, pending: null });
  const readDay = useCallback((): Promise<DayRead | null> => {
    if (!client) return Promise.resolve(null);
    if (ahead.current.pending) return ahead.current.pending;
    const date = nutritionToday();
    const pending = fetchMobileNutritionDay(client, date).then((result) => {
      const read =
        result.status === 'ok'
          ? { date, at: Date.now(), data: result.data }
          : null;
      if (ahead.current.pending === pending)
        ahead.current = { read: read ?? ahead.current.read, pending: null };
      return read;
    });
    ahead.current.pending = pending;
    return pending;
  }, [client]);
  useEffect(() => {
    ahead.current = { read: null, pending: null };
  }, [client]);
  useFocusEffect(
    useCallback(() => {
      void readDay();
    }, [readDay]),
  );
  const readAhead = useRef(readDay);
  useEffect(() => {
    readAhead.current = readDay;
  }, [readDay]);
  const invalidate = useCallback(() => {
    ahead.current = { read: null, pending: null };
    void readAhead.current();
    saved.current();
  }, []);
  const writes = useDayWriteController(
    client,
    session?.user.id ?? 'anonymous',
    invalidate,
  );
  useEffect(() => {
    if (client && session?.user.id)
      return subscribeMetricDefinitionsChanged(
        client,
        session.user.id,
        invalidate,
      );
  }, [client, session?.user.id, invalidate]);
  const [today, setToday] = useState(() => nutritionToday());
  const entry = useMetricEntry(writes?.controller, today);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [quickNotice, setQuickNotice] = useState<string | null>(null);
  useEffect(() => {
    if (quickNotice) {
      const t = setTimeout(() => setQuickNotice(null), 10000);
      return () => clearTimeout(t);
    }
  }, [quickNotice]);
  const busyRef = useRef(false);
  const open = useCallback(
    async (metricId: string, quick?: QuickMetricTap) => {
      const current = writes?.controller.getSnapshot();
      if (
        !client ||
        busyRef.current ||
        !current ||
        current.phase !== 'idle' ||
        current.intent ||
        current.draft
      )
        return;
      busyRef.current = true;
      setLoading(metricId);
      try {
        const date = nutritionToday();
        setToday(date);
        setError(null);
        setQuickNotice(null);
        const cached = ahead.current.read;
        let read =
          cached && cached.date === date && Date.now() - cached.at < FRESH_MS
            ? cached
            : null;
        if (!read) {
          const fresh = await readDay();
          read = fresh?.date === date ? fresh : null;
        }
        const metric = read ? findDayMetric(read.data, metricId) : undefined;
        if (!read || !metric) {
          setError('No pudimos abrir esta métrica. Probá de nuevo.');
          return;
        }
        if (!canEditDayMetric(read.data, metric)) {
          setError('Este día no se puede editar desde acá.');
          return;
        }
        if (quick) {
          const sameTime = sameMetricTimestamp;
          const definition = definitions.find((d) => d.id === metricId);
          if (
            quick.date !== date ||
            quick.value !== metric.value ||
            !sameTime(quick.updatedAt, metric.updatedAt) ||
            (quick.definitionUpdatedAt &&
              !sameTime(
                quick.definitionUpdatedAt,
                metric.definitionUpdatedAt,
              )) ||
            definition?.quickValue !== quick.portion ||
            definition.valueType !== metric.valueType ||
            definition.unit !== metric.unit
          ) {
            setQuickNotice(
              'El valor cambió en otro lado. Actualizamos lo que llevás hoy; volvé a tocar para sumar.',
            );
            invalidate();
            return;
          }
          triggerMetricHaptic();
          const accepted = await entry.quick(read.data, metric, quick.portion);
          if (!accepted)
            setQuickNotice(
              'No pudimos sumar esa porción. Mantené apretado para cargar otro valor.',
            );
          if (writes?.controller.getSnapshot().phase === 'conflict') {
            writes.controller.close();
            invalidate();
            setQuickNotice(
              'El valor cambió en otro lado. Actualizamos lo que llevás hoy; no volvimos a sumar.',
            );
          }
        } else entry.open(read.data, metric);
      } finally {
        busyRef.current = false;
        setLoading(null);
      }
    },
    [client, writes, definitions, entry, readDay, invalidate],
  );
  const state = writes?.state;
  const element = (
    <>
      {writes && entry.entry && state?.draft ? (
        <MetricEntrySheet
          id={entry.entry.id}
          controller={writes.controller}
          state={writes.state}
          onClose={entry.close}
        />
      ) : null}
      {entry.undoing &&
      (state?.phase === 'pending' || state?.phase === 'confirmed') ? (
        <MetricSavedNotice
          notice={{ date: today, message: 'Deshaciendo…', undo: null }}
          disabled
          pending
          onUndo={() => {}}
          onClose={() => {}}
        />
      ) : null}
      {entry.notice ? (
        <MetricSavedNotice
          notice={entry.notice}
          disabled={!!state?.draft || state?.phase !== 'idle'}
          onUndo={entry.undoNotice}
          onClose={entry.dismissNotice}
        />
      ) : null}
      {quickNotice ? (
        <NutritionToast
          message={quickNotice}
          onClose={() => setQuickNotice(null)}
        />
      ) : null}
      {!entry.entry &&
      state &&
      ['uncertain', 'confirmed', 'blocked', 'conflict'].includes(state.phase) &&
      writes ? (
        <NutritionToast
          message={
            state.phase === 'conflict'
              ? 'El valor cambió. Revisá cómo quedó antes de seguir.'
              : 'Tu cambio sigue acá. Comprobá si se guardó.'
          }
          action={{
            label: state.phase === 'conflict' ? 'Revisar' : 'Comprobar',
            accessibilityLabel: 'Comprobar cambio de métrica',
            onPress: () => {
              if (state.phase === 'conflict') {
                writes.controller.close();
                invalidate();
              } else void writes.controller.recover();
            },
          }}
        />
      ) : null}
    </>
  );
  const clearError = useCallback(() => setError(null), []);
  const intent = state?.intent?.intent;
  const pendingId =
    loading ??
    (intent?.operation === 'metrics' && intent.changes.length === 1
      ? intent.changes[0].metricId
      : null);
  return {
    open,
    loading: pendingId,
    locked:
      !writes ||
      !!loading ||
      (!!state && (state.phase !== 'idle' || !!state.draft || !!state.intent)),
    definitions,
    error,
    clearError,
    element,
  };
}
