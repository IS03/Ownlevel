import { ScrollHeaderScreen } from '@/navigation/scroll-header-screen';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, RefreshControl, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { FadeIn, runOnJS } from 'react-native-reanimated';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { MobileApiClient } from '@/api/client';
import { fetchHistoryRange, type HistoryFact } from '@/api/history';
import { LinkRow, AppIcon, AppText, brandTokens, GlassSurface, InlineUnavailable, ListRow, radius, ScrollScreen, Separator, SkeletonBlock, spacing, useOwnlevelTheme, useReduceMotion } from '@/design-system';
import { haptics } from '@/platform/haptics';
import { displayNutritionDate } from '@/nutrition/day-format';
import { buildTrainingMonth, formatTrainingMonth } from '@/training/calendar';
import { addMonths } from '@/training/history-model';
import { useHistoryResource } from './use-history-resource';
import { historyDayHref } from './navigation';
import { useDomainDate } from './use-domain-date';
import { historyAreaLabels } from './history-presentation';

// Fixed positions and colors, not a score: training, nutrition, body, metrics (the brand's comparison series, in its
// order). Hollow = unknown, never «nothing».
const AREAS = ['Entrenamiento', 'Nutrición', 'Cuerpo', 'Métricas'] as const;
function domainMarks(fact?: HistoryFact): (boolean | null)[] {
  return fact ? [fact.completedSessionsCount === null ? null : fact.completedSessionsCount > 0,
    (fact.nutritionEntriesCount ?? 0) > 0 || fact.hasExplicitOverrides === true ? true : fact.nutritionEntriesCount === null || fact.hasExplicitOverrides === null ? null : false,
    fact.hasWeight === true || (fact.measurementsCount ?? 0) > 0 ? true : fact.hasWeight === null || fact.measurementsCount === null ? null : false,
    fact.metricValuesCount === null ? null : fact.metricValuesCount > 0] : [null, null, null, null];
}
/** A round glass control (IDENTIDAD.md § Vidrio: controls only), 44 pt. */
function MonthButton({ icon, label, disabled, onPress }: { icon: 'chevronLeft' | 'chevronRight'; label: string; disabled: boolean; onPress: () => void }) {
  const { colors } = useOwnlevelTheme();
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [pressed && styles.pressed]}>
    <GlassSurface interactive style={styles.round}><AppIcon name={icon} size={20} color={disabled ? colors.border : colors.text} /></GlassSurface>
  </Pressable>;
}

/**
 * Calendario: one month, centred under its own name, swiped (or stepped) month to month. Each day carries one dot per
 * area with records, in the area's colour, always in the same place; the month's summary below names the colours and
 * says how many days each area has, so there is no legend to read. Unknown stays unknown: a hollow dot, and «—».
 */
export function HistoryCalendarScreen() {
  const params = useLocalSearchParams(), router = useRouter(), { colors, isDark } = useOwnlevelTheme(), { fontScale } = useWindowDimensions(), reduced = useReduceMotion();
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
  const series = brandTokens.chart[isDark ? 'dark' : 'light'];
  const describe = (date: string) => {
    const fact = facts.get(date), labels = fact ? historyAreaLabels(fact) : [];
    const incomplete = !fact || Object.values(fact).some(value => value === null);
    return date > (today ?? '') ? 'Fecha futura' : `${labels.join(', ') || (incomplete ? 'Cobertura parcial' : 'Sin actividad')}${labels.length && incomplete ? '. Cobertura parcial' : ''}`;
  };
  const canNext = !!month && !!today && addMonths(month, 1) <= today.slice(0, 7);
  const go = useCallback((delta: number) => {
    if (!month || (delta > 0 && !canNext)) return;
    haptics.selection(); setMonth(addMonths(month, delta));
  }, [canNext, month, setMonth]);
  // Swipe the month sideways, like the system calendar; vertical scrolling is left alone.
  const swipe = useMemo(() => Gesture.Pan().activeOffsetX([-24, 24]).failOffsetY([-16, 16])
    .onEnd(event => { if (Math.abs(event.translationX) > 60 || Math.abs(event.velocityX) > 600) runOnJS(go)(event.translationX < 0 ? 1 : -1); }), [go]);
  // Days with records in the month, per area. An area that could not be read is «—», not 0.
  const summary = useMemo(() => AREAS.map((label, k) => {
    if (!data || !month) return { label, days: null as number | null };
    const days = data.days.filter(d => d.date.startsWith(month) && d.date <= data.today);
    const marks = days.map(d => domainMarks(d)[k]);
    // Any day of this area that could not be read leaves its count unknown: a lower number would read as fewer days.
    return { label, days: marks.some(mark => mark === null) ? null : marks.filter(mark => mark === true).length };
  }), [data, month]);
  const thisMonth = today?.slice(0, 7);

  return <ScrollHeaderScreen title="Calendario"><ScrollScreen testID="global-calendar" refreshControl={<RefreshControl refreshing={state.status === 'ready' && state.refreshing}
    onRefresh={() => void refresh()} tintColor={colors.primary} />}>
    {month ? <View style={styles.header}>
      <MonthButton icon="chevronLeft" label="Mes anterior" disabled={false} onPress={() => go(-1)} />
      <View style={styles.title}>
        <AppText accessibilityRole="header" variant="title2" style={styles.center}>{formatTrainingMonth(month)}</AppText>
        {thisMonth && month !== thisMonth ? <Pressable accessibilityRole="button" accessibilityLabel="Volver a este mes" onPress={() => { haptics.selection(); setMonth(thisMonth); }}
          style={({ pressed }) => [styles.todayChip, { backgroundColor: colors.surfaceRaised }, pressed && styles.pressed]}>
          <AppText variant="footnote" style={{ color: colors.primary, fontWeight: '600' }}>Hoy</AppText>
        </Pressable> : <AppText muted variant="footnote" style={styles.center}>Tocá un día para ver sus registros</AppText>}
      </View>
      <MonthButton icon="chevronRight" label="Mes siguiente" disabled={!canNext} onPress={() => go(1)} />
    </View> : null}
    {!data ? state.status === 'loading' ? <SkeletonBlock height={300} /> : <InlineUnavailable message="No pudimos cargar este mes." actionLabel="Reintentar" onAction={() => void refresh()} /> : <>
      {stale || partial ? <InlineUnavailable message={stale ? 'La última lectura de este mes no pudo actualizarse.' : 'Algunas áreas no se pudieron leer: sus puntos van vacíos.'} actionLabel="Reintentar" onAction={() => void refresh()} /> : null}
      {fontScale > 1.3 ? <View testID="history-calendar-agenda">
        <AppText muted variant="footnote">Fechas del mes · vista con texto grande</AppText>
        {weeks.flat().filter(cell => !!cell).map(cell => <View key={cell!.date}>
          <Separator />
          <ListRow title={displayNutritionDate(cell!.date)} subtitle={`${cell!.date === data.today ? 'Hoy · en curso. ' : ''}${describe(cell!.date)}`}
            accessibilityLabel={`${cell!.date}. ${describe(cell!.date)}`} accessibilityHint="Abre los registros de esta fecha exacta."
            disabled={cell!.date > data.today} onPress={() => router.push(historyDayHref(cell!.date, month!))} />
        </View>)}
      </View> : <GestureDetector gesture={swipe}>
        <Animated.View key={month} entering={FadeIn.duration(reduced ? 150 : 250)} style={styles.grid} testID="history-calendar-grid">
          <View style={styles.row}>{['L','M','X','J','V','S','D'].map((d, i) => <AppText key={i} muted variant="caption" style={styles.weekday}>{d}</AppText>)}</View>
          {weeks.map((week, i) => <View key={i} style={styles.row}>{week.map((cell, j) => {
            if (!cell) return <View key={j} style={styles.cell} />;
            const future = cell.date > data.today, marks = domainMarks(facts.get(cell.date)), isToday = cell.date === data.today;
            return <Pressable key={cell.date} style={({ pressed }) => [styles.cell, isToday && { borderColor: colors.primary, borderWidth: 1.5 },
              pressed && !future && { backgroundColor: colors.surfaceRaised }]}
              accessibilityRole="button" accessibilityLabel={`${cell.date}. ${describe(cell.date)}`}
              accessibilityHint={isToday ? 'Hoy, en curso. Abre los registros de esta fecha exacta.' : 'Abre los registros de esta fecha exacta.'}
              accessibilityState={{ disabled: future }} disabled={future} onPress={() => router.push(historyDayHref(cell.date, month!))}>
              <AppText numeric muted={future} style={[future && styles.future, isToday && { color: colors.primary, fontWeight: '700' }]}>{cell.day}</AppText>
              <View style={styles.marks} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                {marks.map((value, k) => <View key={k} style={[styles.mark, { backgroundColor: !future && value === true ? series[k] : 'transparent',
                  borderColor: !future && value === null ? series[k] : 'transparent' }]} />)}
              </View>
            </Pressable>;
          })}</View>)}
        </Animated.View>
      </GestureDetector>}
      {/* The month in four numbers, and the key to the dots: same colour, same order. */}
      <View style={styles.summary} testID="history-calendar-summary">
        {summary.map(({ label, days }, k) => <View key={label} style={[styles.tile, { backgroundColor: colors.surface }]}
          accessible accessibilityLabel={`${label}: ${days === null ? 'no disponible' : `${days} ${days === 1 ? 'día' : 'días'}`}`}>
          <View style={styles.tileHead}><View style={[styles.legendDot, { backgroundColor: series[k] }]} /><AppText muted variant="footnote">{label}</AppText></View>
          <AppText numeric variant="headline">{days === null ? '—' : `${days} ${days === 1 ? 'día' : 'días'}`}</AppText>
        </View>)}
      </View>
    </>}
    <LinkRow label="Ver historial" onPress={() => router.push('/history')} />
  </ScrollScreen></ScrollHeaderScreen>;
}
const DOT = 6;
const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: { flex: 1, alignItems: 'center', gap: spacing.xs },
  center: { textAlign: 'center' },
  round: { width: brandTokens.layout.minTouch, height: brandTokens.layout.minTouch, borderRadius: brandTokens.layout.minTouch / 2, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  pressed: { transform: [{ scale: 0.95 }] },
  todayChip: { minHeight: 28, paddingHorizontal: 12, borderRadius: radius.chip, alignItems: 'center', justifyContent: 'center' },
  grid: { gap: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center' }, weekday: { flex: 1, textAlign: 'center', paddingVertical: spacing.sm },
  cell: { flex: 1, minWidth: brandTokens.layout.minTouch, minHeight: brandTokens.layout.minTouch + spacing.md, gap: 6, marginHorizontal: 2,
    alignItems: 'center', justifyContent: 'center', borderRadius: radius.inner, paddingVertical: spacing.sm, borderWidth: 1.5, borderColor: 'transparent' },
  future: { opacity: 0.45 },
  marks: { flexDirection: 'row', gap: 3, height: DOT }, mark: { width: DOT, height: DOT, borderWidth: 1, borderRadius: DOT / 2 },
  summary: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tile: { flexGrow: 1, flexBasis: '45%', borderRadius: radius.inner, padding: spacing.md, gap: spacing.xs },
  tileHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
});
