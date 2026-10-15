import { useCallback, useState, type ReactNode } from 'react';
import { Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMobileApi } from '@/api';
import {
  fetchProgressTrainingExercise,
  progressRequestKey,
  type ProgressTrainingExerciseDetail,
  type ProgressExerciseCharts,
  type ProgressExercisePoint,
} from '@/api/progress';
import {
  AppIcon,
  AppText,
  Button,
  Heading,
  InlineUnavailable,
  SegmentedControl,
  SkeletonBlock,
  UnavailableState,
  radius,
  spacing,
  useOwnlevelTheme,
} from '@/design-system';
import { ProgressScroll } from './progress-scroll';
import { useComparisonText, useProgressRange } from './progress-range-context';
import { periodHeading } from './progress-range';
import { arrowDelta, formatValue } from './progress-format';
import { REASON_LABELS, STATUS_LABELS } from './training-trends-screen';
import { useProgressResource } from './use-progress-resource';

type Measure = ProgressExerciseCharts['measures'][number];
const shortDate = (date: string, weekday = false) => {
  const text = new Intl.DateTimeFormat('es-AR', {
    timeZone: 'UTC',
    ...(weekday ? { weekday: 'short' as const } : {}),
    day: 'numeric',
    month: 'short',
  })
    .format(new Date(`${date}T12:00:00Z`))
    .replaceAll('.', '')
    .replace(',', '')
    .replace('sept', 'sep');
  return weekday ? text.charAt(0).toLocaleUpperCase('es-AR') + text.slice(1) : text;
};
const measureUnit = (m: Measure) => (m.key === 'volume' ? `${m.unit} × reps` : m.unit);
const pointText = (m: Measure, p: ProgressExercisePoint) => {
  const value = formatValue(p.value, measureUnit(m));
  return m.key === 'best_set' && p.best && (m.unit === 'kg' || m.unit === 'lingotes')
    ? `${value} × ${formatValue(p.best.reps, 'reps')}`
    : value;
};
function FlatRow({
  children,
  onPress,
  label,
  testID,
}: {
  children: ReactNode;
  onPress?: () => void;
  label?: string;
  testID?: string;
}) {
  const { colors } = useOwnlevelTheme();
  const content = (
    <>
      {children}
      {onPress ? <AppIcon name="chevronRight" size={17} color={colors.textMuted} /> : null}
    </>
  );
  return onPress ? (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.row, { borderColor: colors.border }, pressed && { opacity: 0.6 }]}
    >
      {content}
    </Pressable>
  ) : (
    <View
      testID={testID}
      accessible={!!label}
      accessibilityLabel={label}
      style={[styles.row, { borderColor: colors.border }]}
    >
      {content}
    </View>
  );
}

function ExerciseChart({ data, measure }: { data: ProgressTrainingExerciseDetail; measure: Measure }) {
  const { colors } = useOwnlevelTheme(),
    router = useRouter();
  const { compareOn, compareText } = useProgressRange();
  const [width, setWidth] = useState(300);
  const level = ['estimated_1rm', 'best_set', 'best_time'].includes(measure.key);
  const reference = compareOn ? measure.reference : null;
  const values = [...measure.points, ...(reference ?? [])].map((p) => p.value);
  const high = Math.max(0, ...values),
    low = level && values.length ? Math.min(...values) : 0;
  const currentById = new Map(measure.points.map((p) => [p.sessionId, p]));
  const currentSlots = [
    ...new Map(
      [...data.sessions]
        .reverse()
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((s) => [s.sessionId, { date: s.date, sessionId: s.sessionId }]),
    ).values(),
  ];
  // Other measures preserve reference sessions with a gap in this measure (e.g. >12 reps for the estimate).
  const referenceSlots = [
    ...new Map(
      (data.charts?.measures.flatMap((m) => m.reference ?? []) ?? [])
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((p) => [p.sessionId, p]),
    ).values(),
  ];
  const referenceById = new Map((reference ?? []).map((p) => [p.sessionId, p]));
  const slots = [
    ...(compareOn ? referenceSlots.map((s) => ({ ...s, point: referenceById.get(s.sessionId), reference: true })) : []),
    ...currentSlots.map((s) => ({ ...s, point: currentById.get(s.sessionId), reference: false })),
  ];
  const n = slots.length,
    step = Math.ceil(n / 5);
  const labeled = (index: number) => n <= 6 || index === n - 1 || (index % step === 0 && n - 1 - index >= step / 2);
  const last = measure.points.at(-1)?.sessionId;
  if (!values.length)
    return (
      <AppText muted>
        Sin valores válidos para {measure.label.toLocaleLowerCase('es-AR')} en los períodos elegidos.
      </AppText>
    );
  return (
    <View style={styles.section}>
      <AppText muted variant="caption">
        {measure.label} por sesión{measure.key === 'volume' ? ` · ${measureUnit(measure)}` : ''}
        {compareOn ? ` · ${compareText} en gris` : ''}
      </AppText>
      <View testID="exercise-trend-chart" style={styles.plot} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {slots.map((slot, index) => {
          const p = slot.point;
          const height = p ? (level ? (high === low ? 0.5 : (p.value - low) / (high - low)) : p.value / high) : 0;
          const color = slot.reference ? colors.textMuted : colors.primary;
          const opacity = slot.reference ? 0.4 : slot.sessionId === last ? 1 : 0.38;
          const key = `${slot.reference ? 'reference' : 'current'}-${slot.sessionId}`;
          const mark = (
            <>
              <View style={styles.column} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                {p ? (
                  level ? (
                    <View
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: radius.full,
                        backgroundColor: color,
                        opacity,
                        marginBottom: height * 136,
                      }}
                    />
                  ) : (
                    <View
                      style={{
                        width: '60%',
                        maxWidth: 32,
                        height: height * 144,
                        backgroundColor: color,
                        opacity,
                        borderTopLeftRadius: 2,
                        borderTopRightRadius: 2,
                      }}
                    />
                  )
                ) : null}
              </View>
              <AppText
                numeric
                muted
                variant="caption"
                numberOfLines={1}
                style={[styles.date, { width: Math.max(44, width / 5) }]}
              >
                {labeled(index) ? shortDate(slot.date) : ' '}
              </AppText>
            </>
          );
          return p ? (
            <Pressable
              key={key}
              testID={`exercise-point-${key}`}
              style={styles.chartSlot}
              accessibilityRole="button"
              accessibilityLabel={`${shortDate(slot.date)}, ${measure.label}, ${pointText(measure, p)}${slot.reference ? `, período de comparación ${compareText}` : ''}`}
              accessibilityHint="Abre la sesión"
              onPress={() => router.push({ pathname: '/(tabs)/train/history/[id]', params: { id: p.sessionId } })}
            >
              {mark}
            </Pressable>
          ) : (
            <View
              key={key}
              testID={`exercise-gap-${key}`}
              style={styles.chartSlot}
              accessible
              accessibilityLabel={`${shortDate(slot.date)}, sin dato para ${measure.label.toLocaleLowerCase('es-AR')}`}
            >
              {mark}
            </View>
          );
        })}
      </View>
      {measure.points.length === 1 ? (
        <AppText muted variant="caption">
          Una sola sesión: todavía no hay tendencia.
        </AppText>
      ) : null}
    </View>
  );
}

function Measures({ data }: { data: ProgressTrainingExerciseDetail }) {
  const { colors } = useOwnlevelTheme();
  const { compareOn, compareText, state, today } = useProgressRange();
  const [selected, setSelected] = useState(data.charts?.measures[0]?.key ?? 'best_set');
  const measure = data.charts?.measures.find((m) => m.key === selected) ?? data.charts?.measures[0];
  if (!data.charts) return <AppText muted>No pudimos consultar las medidas del ejercicio.</AppText>;
  if (data.charts.strategy === 'unsupported')
    return (
      <AppText muted>
        Este modo de carga no tiene una métrica de rendimiento comparable. Revisá las sesiones abajo.
      </AppText>
    );
  if (!measure) return null;
  const latestSession = [...data.sessions].sort((a, b) => b.date.localeCompare(a.date))[0];
  const latest = measure.points.find((p) => p.sessionId === latestSession?.sessionId);
  const lastReferenceSession = data.charts.measures
    .find((m) => m.key === 'best_set' || m.key === 'best_time')
    ?.reference?.at(-1);
  const first = measure.points[0],
    last = measure.points.at(-1),
    ref = compareOn ? measure.reference?.find((p) => p.sessionId === lastReferenceSession?.sessionId) : null;
  const within = state.unit === 'month' ? periodHeading(state, today).replace(/^Tu /, 'en ') : 'en el período';
  const change = compareOn
    ? latest && ref
      ? `${compareText} ${formatValue(ref.value, null)} · ${arrowDelta(latest.value - ref.value, null)}`
      : `Sin comparación: ${compareText} sin valor comparable.`
    : first && last && measure.points.length >= 2
      ? `${arrowDelta(last.value - first.value, measureUnit(measure))} ${within}`
      : null;
  const caption = latest
    ? measure.derived
      ? `1RM estimado de tu mejor serie del ${shortDate(latest.date)} (${formatValue(latest.best!.weightKg, 'kg')} × ${formatValue(latest.best!.reps, null)})`
      : `${measure.label} del ${shortDate(latest.date)}${measure.key === 'best_set' && latest.best && measure.unit !== 'reps' ? ` · ${pointText(measure, latest)}` : ''}`
    : `Sin valor válido para ${measure.label.toLocaleLowerCase('es-AR')} en la última sesión.`;
  return (
    <View style={styles.section} testID="exercise-trend-summary">
      <SegmentedControl
        accessibilityLabel="Medida del ejercicio"
        value={measure.key}
        options={data.charts.measures.map((m) => ({ value: m.key, label: m.label }))}
        onChange={setSelected}
      />
      <ExerciseChart data={data} measure={measure} />
      <View style={styles.valueLine}>
        <AppText
          numeric
          variant="largeTitle"
          accessibilityLabel={`${measure.label}, ${latest ? pointText(measure, latest) : 'sin dato'}`}
        >
          {latest ? formatValue(latest.value, measureUnit(measure)) : '—'}
        </AppText>
        {measure.derived ? (
          <AppText
            testID="exercise-estimated-chip"
            variant="caption"
            style={[styles.chip, { backgroundColor: colors.brandSubtle, color: colors.primary }]}
          >
            estimado
          </AppText>
        ) : null}
      </View>
      <AppText numeric muted variant="caption">
        {caption}
        {change ? ` · ${change}` : ''}
      </AppText>
    </View>
  );
}

function Content({ data }: { data: ProgressTrainingExerciseDetail }) {
  const router = useRouter(),
    { colors } = useOwnlevelTheme();
  const { compareOn, compareText } = useProgressRange(),
    comparisonText = useComparisonText();
  const p = data.performance;
  const bestMeasure = data.charts?.measures.find((m) => m.key === 'best_set' || m.key === 'best_time');
  const bestBySession = new Map(bestMeasure?.points.map((pt) => [pt.sessionId, pt]));
  const estimates = new Map(
    data.charts?.measures.find((m) => m.key === 'estimated_1rm')?.points.map((pt) => [pt.sessionId, pt]),
  );
  const sessions = [...data.sessions].sort((a, b) => b.date.localeCompare(a.date));
  return (
    <>
      <AppText muted variant="caption">
        {data.exercise.muscleLabel} · {data.exercise.weightMode ?? 'Sin modo de carga'}
      </AppText>
      <Measures data={data} />
      <View style={styles.section} testID="exercise-trend-sessions">
        <Heading level={2}>Sesiones del período</Heading>
        {sessions.length ? (
          sessions.map((s, index) => {
            const best = bestBySession.get(s.sessionId),
              estimate = estimates.get(s.sessionId);
            const title = `${shortDate(s.date, true)} · ${s.routineName}`;
            const detail = `${best && bestMeasure ? pointText(bestMeasure, best) : 'Sin serie comparable'}${estimate ? ` · 1RM est. ${formatValue(estimate.value, 'kg')}` : ''}`;
            return (
              <FlatRow
                key={`${s.sessionId}-${index}`}
                testID={`exercise-session-${s.sessionId}`}
                label={`${title}, ${detail}`}
                onPress={() => router.push({ pathname: '/(tabs)/train/history/[id]', params: { id: s.sessionId } })}
              >
                <View style={styles.grow}>
                  <AppText variant="label">{title}</AppText>
                  <AppText numeric muted variant="caption">
                    {detail}
                  </AppText>
                </View>
              </FlatRow>
            );
          })
        ) : (
          <AppText muted>Sin sesiones de este ejercicio en este período.</AppText>
        )}
      </View>
      {data.marks.length ? (
        <View style={styles.section} testID="exercise-trend-marks">
          <Heading level={2}>Mejores marcas (todo tu historial)</Heading>
          {data.marks.map((m) => (
            <FlatRow
              key={m.kind}
              label={`${m.label}, ${formatValue(m.value, m.unit)}${m.context ? `, ${m.context}` : ''}, ${shortDate(m.date)} ${m.date.slice(0, 4)}`}
            >
              <AppIcon name="trophy" color={colors.primary} />
              <View style={styles.grow}>
                <AppText variant="label">{m.label}</AppText>
                <AppText numeric muted variant="caption">
                  {formatValue(m.value, m.unit)}
                  {m.context ? ` · ${m.context}` : ''} · {`${shortDate(m.date)} ${m.date.slice(0, 4)}`}
                </AppText>
              </View>
            </FlatRow>
          ))}
        </View>
      ) : null}
      {compareOn ? (
        <View style={styles.section} testID="exercise-performance-comparison">
          <Heading level={2}>Comparación de rendimiento</Heading>
          <AppText muted variant="caption">
            Frente a {compareText}: {STATUS_LABELS[p.status]} ·{' '}
            {p.signal?.description ?? REASON_LABELS[p.reason] ?? 'Datos insuficientes.'}
          </AppText>
          <AppText muted variant="caption">
            {p.primarySamples} series comparables en este período · {p.referenceSamples} en el período de comparación
          </AppText>
          <AppText muted variant="caption">
            Sesiones: {comparisonText(data.comparisons.sessions, 'sesiones', 'integer')}
          </AppText>
          <AppText muted variant="caption">
            Series: {comparisonText(data.comparisons.sets, 'series', 'integer')}
          </AppText>
        </View>
      ) : null}
    </>
  );
}

export function ExerciseTrendsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const id = String(params.id ?? '');
  const { client } = useMobileApi(),
    { colors } = useOwnlevelTheme();
  const { query, compare } = useProgressRange();
  const load = useCallback(
    (c: NonNullable<typeof client>, signal: AbortSignal) =>
      fetchProgressTrainingExercise(c, query, id, signal, compare),
    [query, id, compare],
  );
  const key = `${progressRequestKey(query, compare)}|${id}`;
  const { state, data, refresh } = useProgressResource(client, key, load);
  const notFound = state.status === 'unavailable' && state.result.meta.httpStatus === 404;
  return (
    <ProgressScroll
      title={data?.exercise.name ?? 'Ejercicio'}
      testID="exercise-trends-screen"
      refreshControl={
        <RefreshControl
          refreshing={state.status === 'ready' && state.refreshing}
          onRefresh={() => void refresh()}
          tintColor={colors.primary}
        />
      }
    >
      {state.status === 'loading' ? (
        <SkeletonBlock height={200} />
      ) : !data ? (
        notFound ? (
          <AppText muted>No hay registros completados de este ejercicio.</AppText>
        ) : (
          <UnavailableState
            title="No pudimos cargar el ejercicio"
            description="Tus datos siguen seguros. Revisá la conexión e intentá nuevamente."
            action={<Button label="Reintentar" onPress={() => void refresh()} />}
          />
        )
      ) : (
        <>
          {state.status !== 'ready' ? (
            <InlineUnavailable
              actionLabel="Reintentar"
              message="No se pudo actualizar. Mostramos la última lectura confirmada."
              onAction={() => void refresh()}
            />
          ) : null}
          <Content key={key} data={data} />
        </>
      )}
      <FlatRow
        label="Abrir historial del ejercicio"
        onPress={() => router.push({ pathname: '/(tabs)/train/history/exercise/[id]', params: { id } })}
      >
        <AppText style={styles.grow}>Abrir historial del ejercicio</AppText>
      </FlatRow>
    </ProgressScroll>
  );
}
const styles = StyleSheet.create({
  section: { gap: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    minHeight: 44,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  grow: { flex: 1, gap: spacing.xs },
  valueLine: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.xs },
  chip: { borderRadius: radius.chip, paddingHorizontal: spacing.xs, paddingVertical: spacing.xs },
  plot: { flexDirection: 'row', alignItems: 'flex-end', minHeight: 176 },
  chartSlot: { flex: 1, minWidth: 0, minHeight: 176 },
  column: { height: 144, alignItems: 'center', justifyContent: 'flex-end' },
  date: { position: 'absolute', top: 144, marginTop: spacing.xs, alignSelf: 'center', textAlign: 'center' },
});
