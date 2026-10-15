import { useCallback, useState, type ReactNode } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
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
  SegmentedControl,
  SkeletonBlock,
  UnavailableState,
  spacing,
  useOwnlevelTheme,
} from '@/design-system';
import { ProgressScroll } from './progress-scroll';
import { useComparisonText, useProgressRange } from './progress-range-context';
import { periodHeading } from './progress-range';
import { arrowDelta, formatValue } from './progress-format';
import { useProgressResource } from './use-progress-resource';

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
      {onPress ? <AppIcon name="chevronRight" color={colors.textMuted} size={17} /> : null}
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
function TrainingChart({ data }: { data: ProgressTraining }) {
  const { colors } = useOwnlevelTheme(),
    router = useRouter();
  const [metric, setMetric] = useState<SeriesMetric>('sets'),
    [width, setWidth] = useState(300);
  const max = Math.max(1, ...data.series.map((p) => p[metric]));
  const bucket = { day: 'día', week: 'semana', month: 'mes' }[data.period.bucket];
  const live = data.series.at(-1),
    inCourse = !!live && live.start <= data.today && live.end >= data.today;
  return (
    <View style={styles.section}>
      <Heading level={2}>Evolución</Heading>
      <SegmentedControl
        accessibilityLabel="Medida del gráfico"
        value={metric}
        options={(Object.keys(SERIES_LABELS) as SeriesMetric[]).map((value) => ({
          value,
          label: SERIES_LABELS[value],
        }))}
        onChange={setMetric}
      />
      <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} testID="training-chart">
          <View style={[styles.bars, { width: Math.max(width, data.series.length * 44) }]}>
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
                      <AppText numeric muted variant="caption" style={styles.center}>
                        {metric === 'minutes' ? formatValue(value, null, 'duration') : fmt(value, 0)}
                      </AppText>
                    ) : null}
                    <View
                      testID={`training-bar-${p.start}${value === 0 ? '-zero' : ''}`}
                      style={{
                        height: value === 0 ? 1 : (144 * value) / max,
                        width: '100%',
                        backgroundColor: value === 0 ? colors.border : colors.primary,
                        opacity: value === 0 || current ? 1 : 0.38,
                      }}
                    />
                  </View>
                  <AppText muted numeric variant="caption" style={styles.center}>
                    {shortDate(p.start)}
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
        </ScrollView>
      </View>
      <AppText muted variant="caption">
        {SERIES_LABELS[metric]} por {bucket}
        {inCourse
          ? ` · ${data.period.bucket === 'day' ? 'este día' : data.period.bucket === 'week' ? 'esta semana' : 'este mes'} en curso`
          : ''}
      </AppText>
    </View>
  );
}
function Breakdown({ data, open }: { data: ProgressTraining; open: (id: string) => void }) {
  const { colors } = useOwnlevelTheme();
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
      <SegmentedControl
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
      <View>
        {(all ? items : items.slice(0, 6)).map((item, index) => (
          <FlatRow
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
                  height: item.sets === 0 ? 1 : 8,
                  width: item.sets === 0 ? '100%' : `${(item.sets / max) * 100}%`,
                  backgroundColor: item.sets === 0 ? colors.border : colors.primary,
                  opacity: index === 0 ? 1 : 0.38,
                }}
              />
            </View>
            <AppText numeric variant="footnote">
              {plural(item.sets, 'serie', 'series')}
            </AppText>
          </FlatRow>
        ))}
      </View>
      {!items.length ? <AppText muted>Sin datos para este desglose.</AppText> : null}
      {items.length > 6 ? (
        <Button
          label={all ? 'Ver menos' : `Ver todos (${items.length})`}
          variant="quiet"
          onPress={() => setAll(!all)}
        />
      ) : null}
    </View>
  );
}
function firstLastSignal(signal: TrainingSignal | null) {
  if (!signal) return null;
  return signal.referenceValue !== null && signal.currentValue !== null
    ? `${fmt(signal.referenceValue, 2)} → ${fmt(signal.currentValue, 2)} · ${signal.description}`
    : signal.description;
}
function Performance({ data, open }: { data: ProgressTraining; open: (id: string) => void }) {
  const { colors } = useOwnlevelTheme(),
    { compareOn, compareText, state, today } = useProgressRange();
  const names = new Map(data.exercises.map((e) => [e.id, e]));
  const order = { improved: 0, stable: 1, declined: 2, insufficient_data: 3 };
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
      <Heading level={2}>Mejoraron en el período</Heading>
      {data.inPeriod ? (
        <>
          <AppText variant="headline">
            {plural(data.inPeriod.improved, 'ejercicio mejoró', 'ejercicios mejoraron')} {when}
          </AppText>
          <AppText muted variant="caption">
            Entre su primera y su última sesión del período
          </AppText>
        </>
      ) : (
        <AppText muted>No pudimos consultar la comparación dentro del período.</AppText>
      )}
      <View>
        {rows?.map((e) => {
          const item = names.get(e.id),
            status = STATUS_LABELS[e.status],
            signal = firstLastSignal(e.signal);
          const comparison =
            compareOn && item
              ? `Frente a ${compareText}: ${STATUS_LABELS[item.status]} · ${item.signal?.description ?? REASON_LABELS[item.reason] ?? 'Datos insuficientes.'}`
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
                {!signal ? (
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
function Content({ data }: { data: ProgressTraining }) {
  const { colors } = useOwnlevelTheme();
  const router = useRouter(),
    { compareOn, compareText } = useProgressRange(),
    comparison = useComparisonText();
  const open = (id: string) => router.push({ pathname: '/(tabs)/progress/trends/exercise/[id]', params: { id } });
  const s = data.summary,
    c = s.comparisons.sets;
  const sets = compareOn
    ? `${fmt(s.sets, 0)} series · ${c.previous === null ? comparison(c, null, 'integer') : `${compareText} ${fmt(c.previous, 0)} · ${arrowDelta(s.sets - c.previous, null, 'integer')}`}`
    : plural(s.sets, 'serie', 'series');
  return (
    <>
      {s.sessions > 0 ? (
        <>
          <AppText numeric testID="training-summary">
            {plural(s.trainingDays, 'día', 'días')} · {plural(s.sessions, 'sesión', 'sesiones')} · {sets} ·{' '}
            {formatValue(s.minutes, null, 'duration')}
          </AppText>
          <AppText muted variant="caption">
            La duración va del inicio al fin de cada sesión e incluye descansos.
          </AppText>
          <TrainingChart data={data} />
          <Breakdown key={`${data.period.start}:${data.period.end}`} data={data} open={open} />
          <Performance data={data} open={open} />
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
      <View style={styles.section} testID="training-feelings">
        <Heading level={2}>Cómo te sentiste</Heading>
        <View>
          {data.feelings.map((f) => (
            <FlatRow key={f.key}>
              <View style={styles.text}>
                <AppText numeric>
                  {f.label} {fmt(f.average)}/{f.scaleMaximum}
                </AppText>
                <AppText muted numeric variant="caption">
                  {f.registered} de {f.eligible} sesiones con registro
                  {f.ratio < 0.5 ? ' · pocas sesiones con registro' : ''}
                </AppText>
              </View>
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
  const { state, data, refresh } = useProgressResource(client, progressRequestKey(query, compare), load);
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
      <FlatRow onPress={() => router.push('/(tabs)/train/history')} label="Abrir historial de entrenamiento">
        <AppText style={styles.text}>Abrir historial de entrenamiento</AppText>
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
  text: { flex: 1, gap: 4 },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  barColumn: { flex: 1, gap: 8, minWidth: 36, minHeight: 44 },
  plot: { height: 184, justifyContent: 'flex-end', gap: 4 },
  center: { textAlign: 'center' },
  breakdownName: { flex: 1, gap: 4 },
  horizontalTrack: { flex: 1, justifyContent: 'center', minWidth: 32 },
});
