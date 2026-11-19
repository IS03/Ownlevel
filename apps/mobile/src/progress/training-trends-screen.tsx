import { useCallback, useEffect, useState, type ReactNode } from 'react';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { ExerciseSegmented } from '@/training/exercise-segmented';
import { Pressable, RefreshControl, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMobileApi } from '@/api';
import {
  fetchProgressTraining,
  progressRequestKey,
  type ProgressTraining,
} from '@/api/progress';
import {
  AppIcon,
  AppText,
  Button,
  ChipGroup,
  Heading,
  InlineUnavailable,
  SkeletonBlock,
  UnavailableState,
  brandTokens,
  spacing,
  useOwnlevelTheme,
  useReduceMotion,
} from '@/design-system';
import { ProgressScroll } from './progress-scroll';
import { TrainingStory, TrainingDisclosure, hasTrainingBlocks } from './training-story';
import { useProgressRange } from './progress-range-context';
import { formatValue } from './progress-format';
import { useCachedRead } from '@/api/use-cached-read';
import { ProgressReadStatus } from './progress-read-status';
import { PortadaPointNote, sameValue, usePortadaPoint, type PortadaPoint } from './portada-point';
import { comparisonsFromTrainingHref } from '@/insights/navigation';

type SeriesMetric = 'sets' | 'sessions' | 'minutes';
type ChartInspection = { metric: SeriesMetric; bucket: { start: string; end: string } | null };
const emptyInspection = (): ChartInspection => ({ metric: 'sets', bucket: null });
const SERIES_LABELS: Record<SeriesMetric, string> = { sets: 'Series', sessions: 'Sesiones', minutes: 'Duración' };
export { STATUS_LABELS, REASON_LABELS, signalLine } from './training-presenters';
const fmt = (n: number, digits = 1) => new Intl.NumberFormat('es-AR', { maximumFractionDigits: digits }).format(n);
const shortDate = (date: string) =>
  new Intl.DateTimeFormat('es-AR', { timeZone: 'UTC', day: 'numeric', month: 'short' })
    .format(new Date(`${date}T12:00:00Z`))
    .replace('.', '')
    .replace('sept', 'sep');
const fullDate = (date: string) => new Intl.DateTimeFormat('es-AR', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${date}T12:00:00Z`));
const plural = (n: number, one: string, many: string) => `${fmt(n, 0)} ${n === 1 ? one : many}`;
function FlatRow({
  children,
  onPress,
  label,
  testID,
  compact,
}: {
  children: ReactNode;
  onPress?: () => void;
  label?: string;
  testID?: string;
  compact?: boolean;
}) {
  const { colors } = useOwnlevelTheme();
  const content = (
    <>
      {children}
      {onPress ? <AppIcon name="chevronRight" color={colors.textMuted} size={17} /> : null}
    </>
  );
  return onPress ? (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.row, compact && styles.compact, { borderColor: colors.border }, pressed && { opacity: 0.6 }]}
    >
      {content}
    </Pressable>
  ) : (
    <View
      testID={testID}
      accessible={!!label}
      accessibilityLabel={label}
      style={[styles.row, compact && styles.compact, { borderColor: colors.border }]}
    >
      {content}
    </View>
  );
}
/** A bar that animates to its height (300 ms, IDENTIDAD.md § Movimiento); with Reduce Motion it just changes. */
function GrowingBar({ height, zero, soft, reduced, testID }: { height: number; zero: boolean; soft: boolean; reduced: boolean; testID: string }) {
  const { colors } = useOwnlevelTheme();
  const h = useSharedValue(height);
  useEffect(() => { h.value = reduced ? height : withTiming(height, { duration: brandTokens.motion.duration.base, easing: Easing.out(Easing.cubic) }); }, [h, height, reduced]);
  const style = useAnimatedStyle(() => ({ height: h.value }));
  return <Animated.View testID={testID} style={[{
    width: '60%', maxWidth: brandTokens.space.xxl, alignSelf: 'center', borderTopLeftRadius: zero ? 0 : 3, borderTopRightRadius: zero ? 0 : 3,
    backgroundColor: zero ? colors.border : colors.primary,
    // Single series in champagne (IDENTIDAD.md § Gráficos); the bucket still in course is soft.
    opacity: zero || !soft ? 1 : 0.4,
  }, style]} />;
}
function TrainingChart({ data, inspection, onInspect }: { data: ProgressTraining; inspection: ChartInspection; onInspect: (next: ChartInspection) => void }) {
  const router = useRouter(), reduced = useReduceMotion(), { colors } = useOwnlevelTheme();
  const { fontScale } = useWindowDimensions();
  const [width, setWidth] = useState(300);
  const { metric } = inspection;
  const max = Math.max(1, ...data.series.map(p => p[metric]));
  const bucket = { day: 'día', week: 'semana', month: 'mes' }[data.period.bucket];
  const inCourse = data.series.some(p => p.start <= data.today && p.end >= data.today);
  const shown = (value: number) => metric === 'minutes' ? formatValue(value, null, 'duration') : `${fmt(value, 0)} ${SERIES_LABELS[metric].toLocaleLowerCase('es-AR')}`;
  const selected = data.series.find(p => p.start === inspection.bucket?.start && p.end === inspection.bucket?.end);
  const Selector = fontScale > 1.3 ? ChipGroup : ExerciseSegmented;
  // Same temporal buckets; only their drawing width changes. Never fill a missing interval.
  const slot = Math.max(brandTokens.layout.minTouch, (brandTokens.layout.minTouch + brandTokens.space.lg) * Math.max(1, fontScale));
  return <View style={styles.section}>
    <Heading level={2}>Evolución</Heading>
    <Selector accessibilityLabel="Medida del gráfico" value={metric}
      options={(Object.keys(SERIES_LABELS) as SeriesMetric[]).map(value => ({ value, label: SERIES_LABELS[value] }))}
      onChange={metric => onInspect({ ...inspection, metric })} />
    <AppText muted variant="footnote">Actividad registrada · no mide ganancia muscular ni rendimiento.</AppText>
    <View onLayout={event => setWidth(event.nativeEvent.layout.width)}>
      <ScrollView showsVerticalScrollIndicator={false} horizontal showsHorizontalScrollIndicator={false} style={styles.chartScroll}
        contentContainerStyle={styles.chartContent} accessibilityLabel={`Actividad: ${SERIES_LABELS[metric].toLocaleLowerCase('es-AR')} por ${bucket}`}>
        <View testID="training-chart" style={[styles.bars, { width: Math.max(width, data.series.length * slot) }]}>
          {data.series.map(p => {
            const value = p[metric], current = p.start <= data.today && p.end >= data.today;
            const isSelected = selected?.start === p.start && selected?.end === p.end;
            const range = p.start === p.end ? fullDate(p.start) : `${fullDate(p.start)} – ${fullDate(p.end)}`;
            return <Pressable key={`${p.start}:${p.end}`} testID={`training-bucket-${p.start}`} accessibilityRole="button"
              accessibilityLabel={`${range}, ${shown(value)}${current ? ', en curso' : ''}`}
              accessibilityState={{ selected: isSelected }} accessibilityHint="Inspecciona el valor y su intervalo sin abrir otra pantalla."
              onPress={() => onInspect({ metric, bucket: isSelected ? null : { start: p.start, end: p.end } })}
              style={[styles.barColumn, { minWidth: slot }]}>
              <View style={[styles.plot, isSelected && { backgroundColor: colors.brandSubtle }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                <GrowingBar testID={`training-bar-${p.start}${value === 0 ? '-zero' : ''}`} height={value === 0 ? 1 : 110 * value / max}
                  zero={value === 0} soft={current} reduced={reduced} />
              </View>
              <AppText muted numeric variant="caption" style={styles.center}>{shortDate(p.start)}{p.start !== p.end ? `\n– ${shortDate(p.end)}` : ''}</AppText>
            </Pressable>;
          })}
        </View>
      </ScrollView>
    </View>
    <AppText muted variant="caption">{SERIES_LABELS[metric]} por {bucket}{inCourse ? ` · ${data.period.bucket === 'day' ? 'hoy' : data.period.bucket === 'week' ? 'esta semana' : 'este mes'} en curso` : ''}</AppText>
    <AppText muted numeric variant="caption">Mayor registro del gráfico: {shown(Math.max(0, ...data.series.map(p => p[metric])))}.</AppText>
    {selected ? <View testID="training-bucket-inspection" style={styles.stack}>
      <AppText numeric variant="headline">{shown(selected[metric])}</AppText>
      <AppText numeric>{fullDate(selected.start)}{selected.start !== selected.end ? ` – ${fullDate(selected.end)}` : ''}</AppText>
      <AppText muted variant="footnote">{plural(selected.sessions, 'sesión', 'sesiones')}{selected.start <= data.today && selected.end >= data.today ? ' · período en curso' : ''}</AppText>
      {data.period.bucket === 'day' && selected.start === selected.end && selected.sessions > 0 ? <Button label="Ver día y sesiones originales" variant="quiet"
        onPress={() => router.push({ pathname: '/history/day/[date]', params: { date: selected.start } })} />
        : data.period.bucket !== 'day' || selected.start !== selected.end ? <AppText muted variant="footnote">Total del intervalo; no corresponde a un único día.</AppText> : null}
    </View> : <AppText muted variant="footnote">{inspection.bucket ? 'El intervalo seleccionado ya no está disponible.' : `Tocá una barra para consultar su valor y fechas.${data.series.length * slot > width ? ' Deslizá para recorrer el período.' : ''}`}</AppText>}
  </View>;
}
function Content({ data, inspection, onInspect, portada }: { data: ProgressTraining; inspection: ChartInspection; onInspect: (next: ChartInspection) => void;
  portada: { point: PortadaPoint; matched: boolean } | null }) {
  const chart = portada ? <><PortadaPointNote point={portada.point} matched={portada.matched} reason="Este gráfico no tiene ese mismo intervalo con esas series: no seleccionamos otro en su lugar." /><TrainingChart data={data} inspection={inspection} onInspect={onInspect} /></> : null;
  return <TrainingStory data={data} chart={portada ? chart : <TrainingDisclosure title="Actividad en el tiempo" initialOpen={inspection.bucket !== null || !hasTrainingBlocks(data)}><TrainingChart data={data} inspection={inspection} onInspect={onInspect} /></TrainingDisclosure>} />;
}
export function TrainingTrendsScreen() {
  const router = useRouter(),
    { client } = useMobileApi(),
    { colors } = useOwnlevelTheme(),
    { query, compare } = useProgressRange();
  const load = useCallback(
    (c: NonNullable<typeof client>, signal: AbortSignal) => fetchProgressTraining(c, query, signal, compare),
    [query, compare],
  );
  const key = progressRequestKey(query, compare);
  const { state, data, refresh } = useCachedRead(client, 'training', key, load);
  const point = usePortadaPoint();
  // `fromPortada`: still the scope this screen opened with and nothing touched yet. Any other account, period or
  // comparison, or the reader's own choice, retires the portada point.
  const [saved, setSaved] = useState({ client, key, inspection: emptyInspection(), fromPortada: true, version: 0 });
  const sameScope = saved.client === client && saved.key === key;
  if (!sameScope) setSaved({ client, key, inspection: emptyInspection(), fromPortada: false, version: saved.version + 1 });
  const portada = sameScope && saved.fromPortada ? point : null;
  // Only the same datum: the spark counts completed sets per interval, exactly as this chart's sets bucket.
  const match = portada && data ? data.series.find(p => p.start === portada.start && p.end === portada.end && sameValue(p.sets, portada.value)) : undefined;
  const inspection = !sameScope ? emptyInspection() : match ? { metric: 'sets' as const, bucket: { start: match.start, end: match.end } } : saved.inspection;
  const onInspect = (next: ChartInspection) => setSaved({ client, key, inspection: next, fromPortada: false, version: saved.version });
  return (
    <ProgressScroll
      title="Entrenamiento"
      periodPickerTestID="training-period-picker"
      compactPeriod
      testID="training-trends-screen"
      refreshControl={
        <RefreshControl
          refreshing={state.status === 'ready' && state.refreshing}
          onRefresh={() => void refresh()}
          tintColor={colors.primary}
        />
      }
    >
      <ProgressReadStatus state={state} />
      {state.status === 'loading' ? (
        <SkeletonBlock height={200} />
      ) : !data ? (
        <UnavailableState
          title="No pudimos cargar Entrenamiento"
          description="Tus datos siguen seguros. Revisá la conexión e intentá nuevamente."
          action={<Button label="Reintentar" onPress={() => void refresh()} />}
        />
      ) : (
        <>
          {state.status !== 'ready' ? (
            <InlineUnavailable
              actionLabel="Reintentar"
              message="No se pudo actualizar. Mostramos la última lectura confirmada."
              onAction={() => void refresh()}
            />
          ) : null}
          <Content key={`${key}:${saved.version}`} data={data} inspection={inspection} onInspect={onInspect} portada={portada ? { point: portada, matched: !!match } : null} />
        </>
      )}
      {/* #518 · The fixed door to Comparaciones. Asks for nothing here; going back returns to this screen and its period. */}
      <FlatRow onPress={() => router.navigate(comparisonsFromTrainingHref)} label="Ver Comparaciones: cada sesión con lo tuyo y con la anterior" testID="training-trends-comparisons">
        <View style={styles.text}>
          <AppText variant="headline">Comparaciones</AppText>
          <AppText muted variant="footnote">Cada sesión con lo tuyo y con la anterior, ejercicio por ejercicio.</AppText>
        </View>
      </FlatRow>
      <FlatRow onPress={() => router.push('/(tabs)/train/history')} label="Ver el historial de entrenamientos">
        <View style={styles.text}>
          <AppText variant="headline">Historial</AppText>
          <AppText muted variant="footnote">Cada sesión, día por día, en Entrenar.</AppText>
        </View>
      </FlatRow>
    </ProgressScroll>
  );
}
const styles = StyleSheet.create({
  section: { gap: spacing.sm },
  row: {
    minHeight: 64,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  compact: { minHeight: 44, paddingVertical: 10 },
  text: { flex: 1, gap: 4 },
  bars: { flexDirection: 'row', alignItems: 'flex-start' },
  barColumn: { flex: 1, gap: spacing.sm, minHeight: brandTokens.layout.minTouch, paddingHorizontal: spacing.sm },
  plot: { height: 136, justifyContent: 'flex-end' },
  center: { textAlign: 'center' },
  chartScroll: { flexGrow: 0 }, chartContent: { minWidth: '100%' },
  stack: { gap: spacing.sm },
});
