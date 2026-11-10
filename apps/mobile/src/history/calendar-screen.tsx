import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { MobileApiClient } from '@/api/client';
import { fetchHistoryRange, type HistoryFact } from '@/api/history';
import { AppText, brandTokens, Button, Heading, InlineUnavailable, ListRow, radius, ScrollScreen, Separator, SkeletonBlock, spacing, useOwnlevelTheme } from '@/design-system';
import { displayNutritionDate } from '@/nutrition/day-format';
import { buildTrainingMonth, formatTrainingMonth } from '@/training/calendar';
import { addMonths } from '@/training/history-model';
import { useHistoryResource } from './use-history-resource';
import { historyDayHref } from './navigation';
import { useDomainDate } from './use-domain-date';
import { historyAreaLabels, historyStyles } from './history-presentation';

// Fixed positions, not a score: training, nutrition, body, metrics. Hollow = unknown.
function domainMarks(fact?: HistoryFact): (boolean | null)[] {
  return fact ? [fact.completedSessionsCount === null ? null : fact.completedSessionsCount > 0,
    (fact.nutritionEntriesCount ?? 0) > 0 || fact.hasExplicitOverrides === true ? true : fact.nutritionEntriesCount === null || fact.hasExplicitOverrides === null ? null : false,
    fact.hasWeight === true || (fact.measurementsCount ?? 0) > 0 ? true : fact.hasWeight === null || fact.measurementsCount === null ? null : false,
    fact.metricValuesCount === null ? null : fact.metricValuesCount > 0] : [null, null, null, null];
}
export function HistoryCalendarScreen() {
  const params = useLocalSearchParams(), router = useRouter(), { colors } = useOwnlevelTheme(), { fontScale } = useWindowDimensions();
  const [month, setMonth] = useDomainDate(typeof params.month === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(params.month) ? params.month : null);
  const [serverToday, setServerToday] = useState<string | null>(null);
  const read = useCallback(async (client: MobileApiClient, signal: AbortSignal) => {
    const dates = month ? buildTrainingMonth(month).flat().filter(d => !!d).map(d => d!.date) : null;
    const result = await fetchHistoryRange(client, dates?.length ? { from: dates[0], to: dates.at(-1)! } : undefined, signal);
    if (!signal.aborted && result.status === 'ok') { setServerToday(result.data.today); if (!month) setMonth(result.data.today.slice(0, 7)); }
    return result;
  }, [month, setMonth]);
  const { data, state, stale, refresh } = useHistoryResource(`calendar:${month ?? 'server-month'}`, read);
  const partial = data && Object.values(data.availability).some(s => s === 'unavailable');
  const facts = new Map(data?.days.map(d => [d.date, d]));
  const today = data?.today ?? serverToday;
  const weeks = month ? buildTrainingMonth(month) : [];
  const describe = (date: string) => {
    const fact = facts.get(date), labels = fact ? historyAreaLabels(fact) : [];
    const incomplete = !fact || Object.values(fact).some(value => value === null);
    return date > (today ?? '') ? 'Fecha futura' : `${labels.join(', ') || (incomplete ? 'Cobertura parcial' : 'Sin actividad')}${labels.length && incomplete ? '. Cobertura parcial' : ''}`;
  };
  return <ScrollScreen testID="global-calendar" refreshControl={<RefreshControl refreshing={state.status === 'ready' && state.refreshing}
    onRefresh={() => void refresh()} tintColor={colors.primary} />}>
    <AppText muted variant="caption">RECORRIDO POR FECHA</AppText>
    <Heading level={1}>{month ? formatTrainingMonth(month) : 'Calendario'}</Heading>
    <AppText muted>Elegí un día para abrir sus registros.</AppText>
    {month ? <View style={historyStyles.controls}>
      <Button label="" icon="chevronLeft" accessibilityLabel="Mes anterior" onPress={() => setMonth(addMonths(month, -1))} variant="secondary" />
      <Button label="Hoy" accessibilityLabel="Abrir hoy" disabled={!today} onPress={() => today && router.push(historyDayHref(today, month))} variant="quiet" />
      <View style={historyStyles.grow} />
      <Button label="" icon="chevronRight" accessibilityLabel="Mes siguiente" disabled={!today || addMonths(month, 1) > today.slice(0, 7)} onPress={() => setMonth(addMonths(month, 1))} variant="secondary" />
    </View> : null}
    {!data ? state.status === 'loading' ? <SkeletonBlock height={300} /> : <InlineUnavailable message="No pudimos cargar este mes." actionLabel="Reintentar" onAction={() => void refresh()} /> : <>
      {stale || partial ? <InlineUnavailable message={stale ? 'La última lectura de este mes no pudo actualizarse.' : 'Algunos indicadores no están disponibles.'} actionLabel="Reintentar" onAction={() => void refresh()} /> : null}
      {fontScale > 1.3 ? <View testID="history-calendar-agenda">
        <AppText muted variant="footnote">Fechas del mes · vista con texto grande</AppText>
        {weeks.flat().filter(cell => !!cell).map(cell => <View key={cell!.date}>
          <Separator />
          <ListRow title={displayNutritionDate(cell!.date)} subtitle={`${cell!.date === data.today ? 'Hoy · en curso. ' : ''}${describe(cell!.date)}`}
            accessibilityLabel={`${cell!.date}. ${describe(cell!.date)}`} accessibilityHint="Abre los registros de esta fecha exacta."
            disabled={cell!.date > data.today} onPress={() => router.push(historyDayHref(cell!.date, month!))} />
        </View>)}
      </View> : <>
        <ScrollView horizontal style={{ flexGrow: 0 }} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.month} testID="history-calendar-grid">
          <View style={styles.grid}>
            <View style={styles.row}>{['L','M','X','J','V','S','D'].map((d, i) => <AppText key={i} muted variant="caption" style={styles.weekday}>{d}</AppText>)}</View>
            {weeks.map((week, i) => <View key={i} style={styles.row}>{week.map((cell, j) => {
              if (!cell) return <View key={j} style={styles.cell} />;
              const future = cell.date > data.today, marks = domainMarks(facts.get(cell.date));
              return <Pressable key={cell.date} style={({ pressed }) => [styles.cell,
                cell.date === data.today && { backgroundColor: colors.brandSubtle }, pressed && !future && { backgroundColor: colors.surfaceRaised }]}
                accessibilityRole="button" accessibilityLabel={`${cell.date}. ${describe(cell.date)}`}
                accessibilityHint={cell.date === data.today ? 'Hoy, en curso. Abre los registros de esta fecha exacta.' : 'Abre los registros de esta fecha exacta.'}
                accessibilityState={{ disabled: future }} disabled={future} onPress={() => router.push(historyDayHref(cell.date, month!))}>
                <AppText numeric muted={future}>{cell.day}</AppText>
                <View style={styles.marks} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                  {marks.map((value, k) => <View key={k} style={[styles.mark, { backgroundColor: !future && value === true ? colors.textMuted : 'transparent',
                    borderColor: !future && value === null ? colors.textMuted : 'transparent' }]} />)}
                </View>
              </Pressable>;
            })}</View>)}
          </View>
        </ScrollView>
        <AppText muted variant="footnote">Marcas de izquierda a derecha: Entrenamiento, Nutrición, Cuerpo y Métricas.</AppText>
        <AppText muted variant="caption">Marca llena: hay registros · contorno: lectura no disponible. Sin marcas: sin registros confirmados. Las fechas futuras no se pueden abrir.</AppText>
      </>}
    </>}
  </ScrollScreen>;
}
const styles = StyleSheet.create({
  month: { flexGrow: 1 }, grid: { flex: 1, minWidth: brandTokens.layout.minTouch * 7, gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center' }, weekday: { flex: 1, textAlign: 'center', paddingVertical: spacing.sm },
  cell: { flex: 1, minWidth: brandTokens.layout.minTouch, minHeight: brandTokens.layout.minTouch + spacing.md, gap: spacing.sm,
    alignItems: 'center', justifyContent: 'center', borderRadius: radius.inner, paddingVertical: spacing.sm },
  marks: { flexDirection: 'row', gap: spacing.xs }, mark: { width: spacing.xs, height: spacing.xs, borderWidth: 1, borderRadius: radius.full },
});
