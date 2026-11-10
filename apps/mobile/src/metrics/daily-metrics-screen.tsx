import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { selectedRouteDate } from '@/history/navigation';
import { ReturnToHistoryDay } from '@/history/return-to-day';
import { metricsChartOrigin, ReturnToMetricChart } from '@/progress/metrics-chart-navigation';
import { useDomainDate } from '@/history/use-domain-date';
import { useMobileApi } from '@/api';
import { useMobileAuth } from '@/auth';
import { AppText, Button, Heading, InlineUnavailable, ScrollScreen, SkeletonBlock, Surface, spacing, useOwnlevelTheme } from '@/design-system';
import { NutritionDateSelector } from '@/nutrition/date-selector';
import { metricValue } from '@/nutrition/day-content';
import { displayNutritionDate, inputNutritionDate, nutritionToday, shiftNutritionDate } from '@/nutrition/day-format';
import { useNutritionDayResource } from '@/nutrition/day-resource';
import { DayWriteEditor } from '@/nutrition/day-write-editor';
import { canWriteDay } from '@/nutrition/day-write-model';
import { useDayWriteController } from '@/nutrition/use-day-write-controller';
import type { DayWriteController, DayWriteState } from '@/nutrition/day-write-controller';

/**
 * Progress → Métricas diarias (M5.2). A surface over the SAME exact-date read
 * (nutrition day → activity.metrics) and the SAME writer/editor as Nutrition.
 */
function MetricsDay({ autoEdit = false, date, today, onAutoEdit, onSelect, onServerToday, writes }: {
  /** Home → Registrar: open today's metrics editor once it can be edited (M9.3A, B2). */
  autoEdit?: boolean; onAutoEdit?: () => void;
  date: string; today: string; onSelect: (date: string | null) => void; onServerToday: (today: string) => void;
  writes: { controller: DayWriteController; state: DayWriteState } | null;
}) {
  const { client } = useMobileApi();
  const { colors } = useOwnlevelTheme();
  const { fontScale } = useWindowDimensions();
  const origin = metricsChartOrigin(useLocalSearchParams());
  const router = useRouter();
  const { state, refresh } = useNutritionDayResource(client, date);
  const [selector, setSelector] = useState(false);
  const current = state.status === 'ready' ? state.current : state.status === 'unavailable' ? state.previous : undefined;
  const data = current?.data;
  const serverToday = data?.today ?? today;
  const reportedToday = data?.today;
  useEffect(() => { if (reportedToday) onServerToday(reportedToday); }, [reportedToday, onServerToday]);
  const previous = shiftNutritionDate(date, -1), next = shiftNutritionDate(date, 1);
  const future = date > serverToday;
  const editable = !!writes && writes.state.phase === 'idle' && !writes.state.intent && !writes.state.draft;
  const canAutoEdit = autoEdit && editable && !!data && date === serverToday && canWriteDay('metrics', data);
  useEffect(() => {
    if (!canAutoEdit || !data || !writes) return;
    onAutoEdit?.();
    writes.controller.open('metrics', data);
  }, [canAutoEdit, data, onAutoEdit, writes]);
  return <ScrollScreen testID="daily-metrics-screen" refreshControl={<RefreshControl refreshing={state.status === 'ready' && state.refreshing}
    onRefresh={() => void refresh()} tintColor={colors.primary} />}>
    <View style={styles.header}>
      <ReturnToHistoryDay /><ReturnToMetricChart />
      {origin?.interval ? <AppText muted variant="caption">Recorrido del intervalo {inputNutritionDate(origin.interval.start)} – {inputNutritionDate(origin.interval.end)}. Consultá cada fecha; este día no representa el promedio.{date < origin.interval.start || date > origin.interval.end ? ' Estás fuera del intervalo del gráfico.' : ''}</AppText> : null}
      <AppText variant="footnote">{date === serverToday ? 'Hoy' : 'Métricas del día'}</AppText>
      <AppText accessibilityRole="header" variant="heading">{displayNutritionDate(date)}</AppText>
      <View style={styles.dates}>
        <Button accessibilityLabel="Día anterior" disabled={!previous} label="‹" onPress={() => { if (previous) onSelect(previous); }} variant="secondary" />
        <View style={styles.flex}><Button label="Elegir fecha" onPress={() => setSelector(true)} variant="secondary" /></View>
        <Button accessibilityLabel="Día siguiente" disabled={!next || date >= serverToday} label="›" onPress={() => { if (next) onSelect(next); }} variant="secondary" />
      </View>
      {date !== serverToday ? <Button label="Volver a hoy" onPress={() => onSelect(null)} variant="quiet" /> : null}
    </View>
    {writes?.state.intent && !writes.state.draft ? <Surface>
      <AppText variant="caption">{writes.state.message ?? 'Hay un cambio de métricas sin confirmar.'}</AppText>
      <Button label="Revisar intento guardado" onPress={() => writes.controller.showRecovery()} />
    </Surface> : null}
    {writes?.state.phase === 'blocked' && !writes.state.draft ? <Surface><AppText style={{ color: colors.danger }} variant="caption">{writes.state.message}</AppText></Surface> : null}
    {!data ? state.status === 'loading' ? <><SkeletonBlock height={72} /><SkeletonBlock height={72} /></>
      : <Surface><InlineUnavailable actionLabel="Reintentar" message="No pudimos cargar las métricas de esta fecha." onAction={() => void refresh()} /></Surface>
      : <>
        {state.status === 'unavailable' ? <Surface><InlineUnavailable actionLabel="Reintentar" message="No se pudo actualizar. Mostramos la última lectura confirmada." onAction={() => void refresh()} /></Surface> : null}
        {future ? <Surface testID="daily-metrics-future"><AppText muted variant="caption">Sólo se pueden registrar métricas hasta hoy.</AppText></Surface> : null}
        {data.activity.status === 'unavailable' ? <Surface><InlineUnavailable actionLabel="Reintentar" message="Las métricas de esta fecha no están disponibles." onAction={() => void refresh()} /></Surface>
          : data.activity.data.metrics.length === 0 ? <Surface><AppText muted>No hay métricas disponibles para esta fecha.</AppText></Surface>
          : <Surface style={styles.list}>
            <Heading level={2}>Métricas</Heading>
            {origin && !data.activity.data.metrics.some(m => m.id === origin.metricId) ? <AppText muted>La métrica del gráfico no figura en la lectura de esta fecha. No se sustituye por otra.</AppText> : null}
            {data.activity.data.metrics.map(m => <View key={m.id} accessible={origin?.metricId === m.id} accessibilityState={{ selected: origin?.metricId === m.id }}
              accessibilityLabel={origin?.metricId === m.id ? `Métrica del gráfico, ${m.label}${m.isActive ? '' : ', archivada'}, ${metricValue(m, m.value)}${m.target !== null ? `. Objetivo actual: ${metricValue(m, m.target)}` : ''}` : undefined}
              style={[styles.metric, origin?.metricId === m.id && { borderLeftWidth: 2, borderColor: colors.primary, paddingLeft: spacing.sm }]} testID={`daily-metric-${m.id}`}>
              {origin?.metricId === m.id ? <AppText variant="caption" style={{ color: colors.primary }}>Métrica del gráfico</AppText> : null}
              <View style={[styles.row, fontScale > 1.3 && styles.stacked]}>
                <AppText style={styles.flex} variant="label">{m.label}{m.isActive ? '' : ' · archivada'}</AppText>
                <AppText numeric muted={m.value === null}>{metricValue(m, m.value)}</AppText>
              </View>
              {m.target !== null ? <AppText muted variant="caption">Objetivo actual: {metricValue(m, m.target)}</AppText> : null}
            </View>)}
            {!future && writes && canWriteDay('metrics', data) ? <Button label="Editar métricas" disabled={!editable}
              onPress={() => writes.controller.open('metrics', data)} /> : null}
          </Surface>}
      </>}
    {/* M5.3: the reusable definitions surface. This day re-reads on focus, so changes show on return. */}
    <Button label="Administrar métricas" onPress={() => router.push('/settings/metrics')} variant="secondary" />
    {selector ? <NutritionDateSelector date={date} onClose={() => setSelector(false)} onSelect={value => onSelect(value === serverToday ? null : value)} /> : null}
  </ScrollScreen>;
}

export function DailyMetricsScreen() {
  const { session } = useMobileAuth();
  const userId = session?.user.id ?? 'anonymous';
  return <DailyMetricsUserScreen key={userId} userId={userId} />;
}
function DailyMetricsUserScreen({ userId }: { userId: string }) {
  const params = useLocalSearchParams();
  const routeDate = selectedRouteDate(params);
  const router = useRouter();
  // Consumed once per screen: closing the editor must never reopen it.
  const [autoEditUsed, setAutoEditUsed] = useState(false);
  const autoEdit = params.editar === 'metricas' && !autoEditUsed;
  const consumeAutoEdit = useCallback(() => { setAutoEditUsed(true); router.setParams({ editar: undefined }); }, [router]);
  const { client } = useMobileApi();
  const [revision, setRevision] = useState(0);
  const invalidate = useCallback(() => setRevision(v => v + 1), []);
  const writes = useDayWriteController(client, userId, invalidate);
  const [today, setToday] = useState(() => nutritionToday()); // initial guess only; replaced by the server's today
  const [selected, setSelected] = useDomainDate(routeDate);
  const writeController = writes?.controller;
  // Entering the surface re-reads the shared persisted intent (Nutrition may have changed it).
  useFocusEffect(useCallback(() => { if (writeController) void writeController.resync(); }, [writeController]));
  const date = selected ?? today;
  return <>
    <MetricsDay autoEdit={autoEdit && selected === null} key={`${userId}:${date}:${revision}`} onAutoEdit={consumeAutoEdit} date={date} today={today} onSelect={setSelected} onServerToday={setToday} writes={writes} />
    {writes?.state.draft ? <DayWriteEditor controller={writes.controller} state={writes.state} /> : null}
  </>;
}
const styles = StyleSheet.create({
  header: { gap: spacing.sm },
  dates: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
  list: { gap: spacing.md },
  metric: { gap: 2 },
  stacked: { flexDirection: 'column', alignItems: 'flex-start' },
  row: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm },
});
