import { useCallback, useEffect, useState, type ReactNode } from 'react';
import Animated, { Easing, FadeIn, LinearTransition, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { ExerciseSegmented } from '@/training/exercise-segmented';
import { Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMobileApi } from '@/api';
import {
  fetchProgressTraining,
  progressRequestKey,
  type ProgressTraining,
  type ProgressTrainingExercise,
  type TrainingSignal,
} from '@/api/progress';
import {
  AppIcon,
  AppText,
  Button,
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
import { useComparisonText, useProgressRange } from './progress-range-context';
import { periodHeading } from './progress-range';
import { arrowDelta, formatValue } from './progress-format';
import { useCachedProgressResource } from './use-cached-progress-resource';
import { ProgressReadStatus } from './progress-read-status';

type SeriesMetric = 'sets' | 'sessions' | 'minutes';
const SERIES_LABELS: Record<SeriesMetric, string> = { sets: 'Series', sessions: 'Sesiones', minutes: 'Duración' };
export const STATUS_LABELS: Record<ProgressTrainingExercise['status'], string> = {
  improved: 'Mejoró',
  stable: 'Estable',
  declined: 'Bajó',
  insufficient_data: 'Sin comparación',
};
export const REASON_LABELS: Record<string, string> = {
  new_exercise: 'No se hizo en el período de comparación.',
  not_trained_in_primary: 'No se hizo en este período.',
  different_weight_mode: 'Cambió el modo de carga.',
  missing_weight_mode: 'Falta el modo de carga.',
  unsupported_weight_mode: 'Este modo de carga no tiene una comparación confiable.',
  incomplete_sets: 'Faltan series comparables.',
  ambiguous_evidence: 'Sin cambio claro.',
};
const fmt = (n: number, digits = 1) => new Intl.NumberFormat('es-AR', { maximumFractionDigits: digits }).format(n);
const shortDate = (date: string) =>
  new Intl.DateTimeFormat('es-AR', { timeZone: 'UTC', day: 'numeric', month: 'short' })
    .format(new Date(`${date}T12:00:00Z`))
    .replace('.', '')
    .replace('sept', 'sep');
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
    width: '100%', borderTopLeftRadius: zero ? 0 : 3, borderTopRightRadius: zero ? 0 : 3,
    backgroundColor: zero ? colors.border : colors.primary,
    // Single series in champagne (IDENTIDAD.md § Gráficos); the bucket still in course is soft.
    opacity: zero || !soft ? 1 : 0.4,
  }, style]} />;
}
function TrainingChart({ data }: { data: ProgressTraining }) {
  const router = useRouter(),
    reduced = useReduceMotion();
  const [metric, setMetric] = useState<SeriesMetric>('sets'),
    [width, setWidth] = useState(300);
  const max = Math.max(1, ...data.series.map((p) => p[metric]));
  const bucket = { day: 'día', week: 'semana', month: 'mes' }[data.period.bucket];
  const live = data.series.at(-1),
    inCourse = !!live && live.start <= data.today && live.end >= data.today;
  const n = data.series.length, step = Math.ceil(n / 5);
  const labeled = (index: number) => n <= 6 || index === n - 1 || (index % step === 0 && n - 1 - index >= step / 2);
  return (
    <View style={styles.section}>
      <Heading level={2}>Evolución</Heading>
      {/* Native segmented control: Liquid Glass on iOS 26, the selection slides with the system animation. */}
      <ExerciseSegmented
        accessibilityLabel="Medida del gráfico"
        value={metric}
        options={(Object.keys(SERIES_LABELS) as SeriesMetric[]).map((value) => ({
          value,
          label: SERIES_LABELS[value],
        }))}
        onChange={setMetric}
      />
      {/* Every bucket fits the width (no sideways scroll); with many buckets only some dates are labeled. */}
      <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} testID="training-chart">
          <View style={[styles.bars, { gap: data.series.length > 16 ? 2 : 6 }]}>
            {data.series.map((p, index) => {
              const value = p[metric],
                current = index === data.series.length - 1 && inCourse;
              const shown =
                metric === 'minutes'
                  ? formatValue(value, null, 'duration')
                  : `${fmt(value, 0)} ${SERIES_LABELS[metric].toLocaleLowerCase('es-AR')}`;
              const onPress =
                p.start === p.end && p.sessions > 0
                  ? () => router.push({ pathname: '/history/day/[date]', params: { date: p.start } })
                  : undefined;
              const content = (
                <>
                  <View style={styles.plot}>
                    {data.series.length <= 8 ? (
                      <Animated.View key={metric} entering={FadeIn.duration(reduced ? 0 : 200)}>
                        <AppText numeric muted variant="caption" style={styles.center}>
                          {metric === 'minutes' ? formatValue(value, null, 'duration') : fmt(value, 0)}
                        </AppText>
                      </Animated.View>
                    ) : null}
                    {/* Changing the measure grows or shrinks each bar to its new height instead of jumping. */}
                    <GrowingBar
                      testID={`training-bar-${p.start}${value === 0 ? '-zero' : ''}`}
                      height={value === 0 ? 1 : (110 * value) / max}
                      zero={value === 0}
                      soft={current}
                      reduced={reduced}
                    />
                  </View>
                  <AppText muted numeric variant="caption" numberOfLines={1} style={[styles.center, styles.dateLabel, { width: Math.max(44, width / 5) }]}>
                    {labeled(index) ? shortDate(p.start) : ''}
                  </AppText>
                </>
              );
              const label = `${shortDate(p.start)}${p.start !== p.end ? ` a ${shortDate(p.end)}` : ''}, ${shown}${current ? ', en curso' : ''}`;
              return onPress ? (
                <Pressable
                  key={p.start}
                  style={styles.barColumn}
                  accessibilityRole="button"
                  accessibilityLabel={label}
                  accessibilityHint="Abre el día en Historial"
                  onPress={onPress}
                >
                  {content}
                </Pressable>
              ) : (
                <View key={p.start} style={styles.barColumn} accessible accessibilityLabel={label}>
                  {content}
                </View>
              );
            })}
          </View>
      </View>
      <AppText muted variant="caption" key={metric}>
        {SERIES_LABELS[metric]} por {bucket}
        {inCourse
          ? ` · ${data.period.bucket === 'day' ? 'hoy' : data.period.bucket === 'week' ? 'esta semana' : 'este mes'} en curso`
          : ''}
      </AppText>
    </View>
  );
}
function Breakdown({ data, open }: { data: ProgressTraining; open: (id: string) => void }) {
  const { colors } = useOwnlevelTheme(), reduced = useReduceMotion();
  const [group, setGroup] = useState<'muscle' | 'routine' | 'exercise'>('muscle'),
    [all, setAll] = useState(false);
  const items = (
    group === 'muscle'
      ? data.muscles.map((m) => ({ id: m.key, name: m.label, sets: m.sets, sessions: null }))
      : group === 'routine'
        ? data.routines.map((r) => ({ ...r }))
        : data.exercises.filter((e) => e.sessions > 0)
  )
    .slice()
    .sort((a, b) => b.sets - a.sets || a.name.localeCompare(b.name, 'es-AR'));
  const max = Math.max(1, ...items.map((i) => i.sets));
  return (
    <View style={styles.section} testID="training-breakdown">
      <Heading level={2}>Desglose</Heading>
      <ExerciseSegmented
        accessibilityLabel="Desglosar series"
        value={group}
        options={[
          { value: 'muscle', label: 'Músculo' },
          { value: 'routine', label: 'Rutina' },
          { value: 'exercise', label: 'Ejercicio' },
        ]}
        onChange={(v) => {
          setGroup(v);
          setAll(false);
        }}
      />
      {/* Switching músculo / rutina / ejercicio fades the new list in instead of swapping it at once. */}
      <Animated.View key={group} entering={FadeIn.duration(reduced ? 0 : 200)} layout={reduced ? undefined : LinearTransition.duration(brandTokens.motion.duration.base)}>
        {(all || items.length <= 7 ? items : items.slice(0, 6)).map((item) => (
          <FlatRow
            compact
            key={item.id}
            testID={`training-breakdown-${item.id}`}
            label={`${item.name}, ${item.sets} series${item.sessions !== null ? `, ${plural(item.sessions, 'sesión', 'sesiones')}` : ''}`}
            onPress={group === 'exercise' ? () => open(item.id) : undefined}
          >
            <View style={styles.breakdownName}>
              <AppText variant="subheadline">{item.name}</AppText>
              {item.sessions !== null ? (
                <AppText muted numeric variant="caption">
                  {plural(item.sessions, 'sesión', 'sesiones')}
                </AppText>
              ) : null}
            </View>
            <View style={styles.horizontalTrack}>
              <View
                testID={`training-breakdown-bar-${item.id}`}
                style={{
                  height: item.sets === 0 ? 1 : 8, borderRadius: item.sets === 0 ? 0 : 4,
                  width: item.sets === 0 ? '100%' : `${(item.sets / max) * 100}%`,
                  backgroundColor: item.sets === 0 ? colors.border : colors.primary,
                  opacity: item.sets === max ? 1 : 0.38,
                }}
              />
            </View>
            <AppText numeric variant="footnote">
              {plural(item.sets, 'serie', 'series')}
            </AppText>
          </FlatRow>
        ))}
      </Animated.View>
      {!items.length ? <AppText muted>Sin datos para este desglose.</AppText> : null}
      {items.length > 7 ? (
        <Button
          label={all ? 'Ver menos' : `Ver todos (${items.length})`}
          variant="quiet"
          onPress={() => setAll(!all)}
        />
      ) : null}
    </View>
  );
}
/**
 * Before → after with its unit, in one phrase: "9 → 10 reps con 60 kg", "9 → 10 lingotes, a 20 reps".
 * A stable exercise says nothing more than "Estable"; an unknown kind keeps the server's own sentence.
 */
export function signalLine(signal: TrainingSignal | null): string | null {
  if (!signal || signal.kind === 'stable') return null;
  const { referenceValue: before, currentValue: now, description } = signal;
  if (before === null || now === null) return description;
  const pair = `${fmt(before, 2)} → ${fmt(now, 2)}`;
  if (signal.kind.includes('reps_same_load') || signal.kind.endsWith('reps_bodyweight')) {
    const at = description.indexOf(' con ');
    return at >= 0 ? `${pair} reps${description.slice(at)}` : description;
  }
  if (signal.kind.includes('load_same_reps')) {
    const [delta, reps] = description.split(' manteniendo ');
    const unit = delta?.split(' ').slice(1).join(' ');
    return unit && reps ? `${pair} ${unit}, a ${reps}` : description;
  }
  if (signal.kind.endsWith('_time')) return `${pair} s en el mejor registro`;
  return description;
}
function Performance({ data, open }: { data: ProgressTraining; open: (id: string) => void }) {
  const { colors } = useOwnlevelTheme(),
    { compareOn, compareText, state, today } = useProgressRange();
  const names = new Map(data.exercises.map((e) => [e.id, e]));
  const order = { improved: 0, declined: 1, stable: 2, insufficient_data: 3 };
  const [all, setAll] = useState(false);
  const rows = data.inPeriod?.exercises
    .slice()
    .sort(
      (a, b) =>
        order[a.status] - order[b.status] ||
        (names.get(a.id)?.name ?? '').localeCompare(names.get(b.id)?.name ?? '', 'es-AR'),
    );
  const single = data.exercises.filter((e) => e.sessions === 1),
    previousOnly = compareOn ? data.exercises.filter((e) => e.sessions === 0) : [];
  const when = state.unit === 'month' ? periodHeading(state, today).replace(/^Tu /, 'en ') : 'en el período';
  return (
    <View style={styles.section} testID="training-performance">
      <Heading level={2}>Ejercicios</Heading>
      {data.inPeriod ? (
        <AppText muted variant="footnote">
          {plural(data.inPeriod.improved, 'mejoró', 'mejoraron')} {when}, de su primera a su última sesión.
        </AppText>
      ) : (
        <AppText muted>No pudimos consultar la comparación dentro del período.</AppText>
      )}
      <View>
        {(all ? rows : rows?.slice(0, 6))?.map((e) => {
          const item = names.get(e.id),
            status = STATUS_LABELS[e.status],
            signal = signalLine(e.signal);
          const comparison =
            compareOn && item
              ? `Frente a ${compareText}: ${STATUS_LABELS[item.status]}${item.status === 'stable' ? '' : ` · ${signalLine(item.signal) ?? REASON_LABELS[item.reason] ?? 'Datos insuficientes.'}`}`
              : null;
          return (
            <FlatRow
              key={e.id}
              testID={`training-exercise-${e.id}`}
              onPress={() => open(e.id)}
              label={`${item?.name ?? 'Ejercicio'}: ${status}. ${signal ?? REASON_LABELS[e.reason] ?? 'Datos insuficientes.'}${comparison ? `. ${comparison}` : ''}`}
            >
              <View style={styles.text}>
                <AppText variant="headline">{item?.name ?? 'Ejercicio'}</AppText>
                <AppText
                  numeric
                  variant="footnote"
                  style={{ color: e.status === 'improved' ? colors.primary : colors.textMuted }}
                >
                  {status}
                  {signal ? ` · ${signal}` : ''}
                </AppText>
                {!signal && e.status !== 'stable' ? (
                  <AppText muted variant="caption">
                    {REASON_LABELS[e.reason] ?? 'Datos insuficientes.'}
                  </AppText>
                ) : null}
                {comparison ? (
                  <AppText muted numeric variant="caption">
                    {comparison}
                  </AppText>
                ) : null}
              </View>
            </FlatRow>
          );
        })}
      </View>
      {rows && rows.length > 6 ? (
        <Button label={all ? 'Ver menos' : `Ver todos (${rows.length})`} variant="quiet" onPress={() => setAll(!all)} />
      ) : null}
      {single.length ? (
        <AppText muted variant="caption">
          Con una sola sesión: {single.map((e) => e.name).join(', ')}
        </AppText>
      ) : null}
      {previousOnly.length ? (
        <AppText muted variant="caption">
          Sólo en el período de comparación: {previousOnly.map((e) => e.name).join(', ')}
        </AppText>
      ) : null}
    </View>
  );
}
/** Three numbers on top (days, sets, time); sessions and the duration note go underneath, small. */
function Summary({ data }: { data: ProgressTraining }) {
  const { colors } = useOwnlevelTheme();
  const { compareOn, compareText } = useProgressRange(), comparison = useComparisonText();
  const s = data.summary, c = s.comparisons.sets;
  const versus = compareOn
    ? c.previous === null ? comparison(c, null, 'integer') : `${compareText} ${fmt(c.previous, 0)} · ${arrowDelta(s.sets - c.previous, null, 'integer')}`
    : null;
  const stats = [
    { key: 'days', value: fmt(s.trainingDays, 0), label: s.trainingDays === 1 ? 'día entrenado' : 'días entrenados' },
    { key: 'sets', value: fmt(s.sets, 0), label: s.sets === 1 ? 'serie' : 'series', extra: versus },
    { key: 'time', value: formatValue(s.minutes, null, 'duration'), label: 'en total' },
  ];
  return (
    <View style={styles.section} testID="training-summary"
      accessible accessibilityLabel={`${plural(s.trainingDays, 'día', 'días')} · ${plural(s.sessions, 'sesión', 'sesiones')} · ${plural(s.sets, 'serie', 'series')}${versus ? `, ${versus}` : ''} · ${formatValue(s.minutes, null, 'duration')}`}>
      <View style={styles.stats}>
        {stats.map((x, i) => (
          <View key={x.key} style={[styles.stat, i > 0 && [styles.statDivider, { borderColor: colors.border }]]}>
            {/* A long time shrinks to fit; the slot keeps the three labels on one line. */}
            <View style={styles.statValue}><AppText numeric variant="title1" numberOfLines={1} adjustsFontSizeToFit>{x.value}</AppText></View>
            <AppText muted variant="footnote">{x.label}</AppText>
            {x.extra ? <AppText numeric variant="caption">{x.extra}</AppText> : null}
          </View>
        ))}
      </View>
      <AppText muted numeric variant="caption">
        {plural(s.sessions, 'sesión', 'sesiones')} · el tiempo va del inicio al fin de cada sesión, con descansos
      </AppText>
    </View>
  );
}
function Content({ data }: { data: ProgressTraining }) {
  const { colors } = useOwnlevelTheme();
  const router = useRouter(),
    { compareOn } = useProgressRange();
  const open = (id: string) => router.push({ pathname: '/(tabs)/progress/trends/exercise/[id]', params: { id } });
  const s = data.summary;
  return (
    <>
      {s.sessions > 0 ? (
        <>
          <Summary data={data} />
          <TrainingChart data={data} />
        </>
      ) : (
        <>
          <AppText muted>Sin entrenamientos en este período.</AppText>
          {compareOn && data.exercises.some((e) => e.sessions === 0) ? (
            <AppText muted variant="caption">
              Sólo en el período de comparación:{' '}
              {data.exercises
                .filter((e) => e.sessions === 0)
                .map((e) => e.name)
                .join(', ')}
            </AppText>
          ) : null}
        </>
      )}
      <View style={styles.section} testID="training-prs">
        <Heading level={2}>Récords</Heading>
        <View>
          {data.personalRecords.map((pr) => (
            <FlatRow key={pr.exerciseId} onPress={() => open(pr.exerciseId)} label={`${pr.name}: ${pr.description}`}>
              <AppIcon name="trophy" color={colors.primary} size={20} />
              <View style={styles.text}>
                <AppText variant="headline">{pr.name}</AppText>
                <AppText muted numeric variant="footnote">
                  {pr.description}
                </AppText>
              </View>
            </FlatRow>
          ))}
        </View>
        {!data.personalRecords.length ? <AppText muted>Sin récords nuevos en este período.</AppText> : null}
      </View>
      {s.sessions > 0 ? (
        <>
          <Performance data={data} open={open} />
          <Breakdown key={`${data.period.start}:${data.period.end}`} data={data} open={open} />
        </>
      ) : null}
      <View style={styles.section} testID="training-feelings">
        <Heading level={2}>Cómo te sentiste</Heading>
        <View>
          {data.feelings.map((f) => (
            <FlatRow key={f.key} compact label={`${f.label}: ${fmt(f.average)} de ${f.scaleMaximum}. ${f.registered} de ${f.eligible} sesiones con registro`}>
              <View style={styles.text}>
                <AppText>{f.label}</AppText>
                <AppText muted numeric variant="caption">
                  {f.registered} de {f.eligible} sesiones{f.ratio < 0.5 ? ' · pocas con registro' : ''}
                </AppText>
              </View>
              <AppText numeric variant="headline">
                {fmt(f.average)} de {f.scaleMaximum}
              </AppText>
            </FlatRow>
          ))}
        </View>
        {!data.feelings.length ? <AppText muted>Sin sensaciones registradas en este período.</AppText> : null}
      </View>
    </>
  );
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
  const { state, data, refresh } = useCachedProgressResource(client, 'training', progressRequestKey(query, compare), load);
  return (
    <ProgressScroll
      title="Entrenamiento"
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
          <Content data={data} />
        </>
      )}
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
  stats: { flexDirection: 'row', flexWrap: 'wrap', rowGap: spacing.md },
  stat: { flexGrow: 1, flexBasis: 90, gap: 2, paddingRight: spacing.sm },
  statValue: { minHeight: 40, justifyContent: 'flex-end' },
  statDivider: { borderLeftWidth: StyleSheet.hairlineWidth, paddingLeft: spacing.md },
  bars: { flexDirection: 'row', alignItems: 'flex-end' },
  barColumn: { flex: 1, gap: 6, minHeight: 44 },
  plot: { height: 136, justifyContent: 'flex-end', gap: 4 },
  center: { textAlign: 'center' },
  dateLabel: { alignSelf: 'center' },
  breakdownName: { flex: 1, gap: 4 },
  horizontalTrack: { flex: 1, justifyContent: 'center', minWidth: 32 },
});
