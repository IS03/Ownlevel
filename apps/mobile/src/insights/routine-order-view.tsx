import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, { Easing, FadeIn, FadeInDown, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import type { MobileApiClient } from '@/api/client';
import { fetchRoutineOrder, type InsightsRoutineOrderView, type OrderExercise, type OrderPosition } from '@/api/performance-insights';
import { AppSheet, AppText, Chip, ExampleFrame, Heading, InlineUnavailable, LinkRow, SkeletonBlock, spacing, useOwnlevelTheme, useReduceMotion } from '@/design-system';
import { haptics } from '@/platform/haptics';
import { useProgressResource } from '@/progress/use-progress-resource';
import { ExerciseSegmented } from '@/training/exercise-segmented';
import { changeArrow, formatPct } from './comparison-change';
import { shortDate } from './comparison-parts';
import { useInProgressStack } from './insights-router';

/**
 * Orden de la rutina: the routine in the order it was really done and from which exercise performance drops. Every number comes
 * from the server (`view=routine-order`); here it is laid out. Missing is «—», never 0, and the drop is described, never a cause.
 */
type Lens = 'progress' | 'target';
const LENSES = [{ value: 'progress', label: 'Progreso' }, { value: 'target', label: 'Objetivo' }] as const;
const integer = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 });
const orderKey = (routine: string) => `performance-insights|routine-order|${routine.toLowerCase()}`;

/** One read per routine, shared by the view, its prefetch and the routine editor: whoever asks first warms the others. */
export function useRoutineOrder(client: MobileApiClient | null, routine: string | null) {
  const load = useCallback((c: MobileApiClient, signal: AbortSignal) => fetchRoutineOrder(c, routine!, signal), [routine]);
  return useProgressResource<InsightsRoutineOrderView>(routine ? client : null, orderKey(routine ?? 'none'), load);
}
/** How long Comparaciones has to stay open before «Orden» is warmed: a quick look in and out costs no second read. */
export const ORDER_PREFETCH_DELAY_MS = 1500;
/**
 * Renders nothing: once the screen has stayed open a moment, warms the order of the routine in focus, so «Orden» opens already
 * read. Opening Comparaciones still makes one read; this one comes later and only once per routine and day (shared cache).
 */
export function RoutineOrderPrefetch({ client, routine }: { client: MobileApiClient | null; routine: string | null }) {
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(true), ORDER_PREFETCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);
  useRoutineOrder(client, settled ? routine : null);
  return null;
}

const ordinal = (position: number) => `${position}°`;
const lossText = (lens: Lens, loss: number) => lens === 'progress' ? `−${integer.format(Math.round(loss * 100))} %` : `−${integer.format(Math.round(loss * 100))} puntos`;

/** The sentence on top: the first cut, or what the lens can honestly say without one. */
export function orderHeadline(model: InsightsRoutineOrderView, lens: Lens): string {
  const reading = model.lenses[lens], [first, second] = reading.cuts;
  if (reading.status === 'ready' && first) {
    const base = lens === 'progress' ? `Desde el ${ordinal(first.position)} subís un ${integer.format(Math.round(first.loss * 100))} % menos seguido`
      : `Desde el ${ordinal(first.position)} llegás menos a tus reps`;
    return second ? `${base}, y desde el ${ordinal(second.position)}, ${lossText(lens, second.loss).replace('−', '')} menos` : base;
  }
  if (reading.status === 'no_baseline') return 'Al principio casi no estás subiendo: todavía no hay desde dónde medir una baja';
  if (reading.status === 'insufficient') return 'Todavía faltan sesiones para ver dónde baja';
  return lens === 'progress' ? 'Subís parecido en toda la rutina' : 'Llegás a tus reps parecido en toda la rutina';
}

/** Width from 0 to 1 that grows in with the brand's 300 ms ease and moves to its new value when the lens changes. */
function Meter({ ratio, tone, delay }: { ratio: number | null; tone: string; delay: number }) {
  const { colors } = useOwnlevelTheme();
  const reduced = useReduceMotion();
  const target = Math.max(0, Math.min(1, ratio ?? 0));
  const width = useSharedValue(reduced ? target : 0);
  useEffect(() => {
    width.value = reduced ? withTiming(target, { duration: 0 }) : withDelay(delay, withTiming(target, { duration: 300, easing: Easing.out(Easing.cubic) }));
  }, [target, delay, reduced, width]);
  const fill = useAnimatedStyle(() => ({ width: `${width.value * 100}%` }));
  return <View style={[styles.track, { backgroundColor: colors.surfaceRaised }]}><Animated.View style={[styles.fill, { backgroundColor: tone }, fill]} /></View>;
}

/** Bars against the highest value of the routine in that lens: the differences between positions are what has to be seen. */
function scaleOf(positions: readonly OrderPosition[], lens: Lens): number {
  const values = positions.map(row => lens === 'progress' ? row.progress.rate : row.target.rate).filter((value): value is number => value !== null && value > 0);
  return values.length ? Math.max(...values) : 1;
}
function valueOf(position: OrderPosition, lens: Lens, scale: number): { text: string; spoken: string; ratio: number | null } {
  if (lens === 'progress') {
    const { rate, up, compared } = position.progress;
    if (rate === null) return { text: '—', spoken: 'sin comparaciones', ratio: null };
    return { text: `${integer.format(Math.round(rate * 100))} %`, spoken: `subiste ${up} de ${compared} veces`, ratio: rate / scale };
  }
  const rate = position.target.rate;
  if (rate === null) return { text: '—', spoken: 'sin reps objetivo', ratio: null };
  return { text: `${integer.format(Math.round(rate * 100))} %`, spoken: `${integer.format(Math.round(rate * 100))} por ciento de las series llegaron a sus reps`, ratio: rate / scale };
}

function Step({ position, lens, low, index, scale, onOpen }: { position: OrderPosition; lens: Lens; low: boolean; index: number; scale: number; onOpen: () => void }) {
  const { colors } = useOwnlevelTheme();
  const { fontScale } = useWindowDimensions();
  const reduced = useReduceMotion();
  const main = position.exercises[0];
  const value = valueOf(position, lens, scale);
  const others = position.exercises.length - 1;
  const detail = lens === 'progress' ? `↑ ${position.progress.up} de ${position.progress.compared}` : `${position.target.reached} de ${position.target.sets} series`;
  const stacked = fontScale > 1.3;
  return <Animated.View entering={reduced ? FadeIn.duration(200) : FadeInDown.delay(index * 40).duration(300)}>
    <LinkRowLike label={`${ordinal(position.position)}, ${main?.name ?? 'Ejercicio'}${others ? ` y ${others} más` : ''}, ${value.spoken}`} onPress={onOpen}>
      <View style={[styles.step, stacked && styles.stepStacked, { borderBottomColor: colors.border }]} testID={`order-step-${position.position}`}>
        <View style={[styles.position, { borderColor: colors.border }]}><AppText muted numeric variant="caption">{position.position}</AppText></View>
        <View style={styles.name}>
          <AppText numberOfLines={stacked ? undefined : 1} variant="label">{main?.name ?? '—'}</AppText>
          <AppText muted numeric variant="caption">{others ? `+${others} · ` : ''}{detail}</AppText>
        </View>
        <View style={[styles.meter, stacked && styles.meterStacked]}>
          <Meter ratio={value.ratio} tone={low ? colors.brandSubtle : colors.brandSurface} delay={reduced ? 0 : 120 + index * 40} />
          <AppText muted={value.ratio === null} numeric variant="footnote" style={styles.value}>{value.text}</AppText>
        </View>
      </View>
    </LinkRowLike>
  </Animated.View>;
}
/** A whole row as one button with its own spoken summary: the bar and numbers are read once, not piece by piece. */
function LinkRowLike({ label, onPress, children }: { label: string; onPress: () => void; children: React.ReactNode }) {
  const { colors } = useOwnlevelTheme();
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityHint="Abre el ejercicio" onPress={onPress}
    style={({ pressed }) => pressed ? { backgroundColor: colors.surfaceRaised, borderRadius: 12 } : null}>{children}</Pressable>;
}

function Cut({ lens, position, loss, delay }: { lens: Lens; position: number; loss: number; delay: number }) {
  const { colors } = useOwnlevelTheme();
  const reduced = useReduceMotion();
  return <Animated.View entering={reduced ? FadeIn.duration(200) : FadeIn.delay(delay).duration(300)} style={styles.cut} testID={`order-cut-${position}`}
    accessible accessibilityLabel={`Desde el ${ordinal(position)}, ${lossText(lens, loss).replace('−', 'menos ')}`}>
    <AppText numeric variant="caption" style={{ color: colors.primary, fontWeight: '600' }}>Desde el {ordinal(position)} · {lossText(lens, loss)}</AppText>
    <View style={[styles.dash, { borderColor: colors.primary }]} />
  </Animated.View>;
}

function Ladder({ model, lens, onOpen }: { model: InsightsRoutineOrderView; lens: Lens; onOpen: (exerciseId: string) => void }) {
  const cuts = model.lenses[lens].cuts;
  const first = cuts[0]?.position ?? Infinity, scale = scaleOf(model.positions, lens);
  return <View testID="order-ladder">
    {model.positions.map((position, index) => <View key={position.position}>
      {cuts.filter(cut => cut.position === position.position).map(cut => <Cut key={cut.position} lens={lens} position={cut.position} loss={cut.loss} delay={420 + index * 40} />)}
      <Step position={position} lens={lens} low={position.position >= first} index={index} scale={scale} onOpen={() => { const id = position.exercises[0]?.exerciseId; if (id) { haptics.selection(); onOpen(id); } }} />
    </View>)}
  </View>;
}

/** An exercise's place, the sessions where it moved and the only comparison that separates order from exercise. */
function ExerciseSheet({ exercise, onClose }: { exercise: OrderExercise; onClose: () => void }) {
  const { colors } = useOwnlevelTheme();
  const reduced = useReduceMotion();
  const inProgress = useInProgressStack();
  const compare = exercise.compare;
  const recent = [...exercise.sessions].reverse().slice(0, 8);
  return <AppSheet onClose={onClose} closeLabel={`Cerrar ${exercise.name}`} testID="order-exercise-sheet" style={{ backgroundColor: colors.background, maxHeight: '88%' }}>
    <ScrollView contentContainerStyle={styles.sheet} showsVerticalScrollIndicator={false}>
      <Heading level={2}>{exercise.name}</Heading>
      <AppText muted>Va {ordinal(exercise.usualPosition)}</AppText>
      {compare ? <Animated.View entering={reduced ? FadeIn.duration(200) : FadeInDown.duration(300)} style={styles.block} testID="order-compare">
        <AppText muted variant="caption" style={styles.kicker}>Cuando cambió de lugar</AppText>
        <View style={styles.groups}>{compare.groups.map(group => <View key={group.position} style={styles.group}>
          <AppText muted variant="caption">{ordinal(group.position)} · {group.sessions} {group.sessions === 1 ? 'vez' : 'veces'}</AppText>
          <AppText numeric variant="title2">{decimal.format(group.reps)} <AppText muted variant="footnote">reps</AppText></AppText>
        </View>)}</View>
        <AppText numeric variant="heroNumber" accessibilityLabel={compare.pct === 0 ? 'Más tarde, igual' : `Más tarde, ${compare.pct < 0 ? 'menos' : 'más'} ${decimal.format(Math.abs(compare.pct))} por ciento`}>{compare.pct === 0 ? 'Igual' : formatPct(compare.pct)}</AppText>
        <AppText muted numeric variant="footnote">Mejores reps con {decimal.format(compare.load)} kg.{compare.groups.some(group => group.sessions < 3) ? ' Con pocas veces es una pista, no una regla.' : ''}</AppText>
      </Animated.View> : <AppText muted variant="footnote">Siempre lo hiciste {ordinal(exercise.usualPosition)}. Si algún día va en otro lugar, acá ves la diferencia.</AppText>}
      <AppText muted variant="caption" style={styles.kicker}>Sesiones</AppText>
      <View>{recent.map(row => <View key={row.sessionId} style={[styles.session, { borderBottomColor: colors.border }]} accessible
        accessibilityLabel={`${shortDate(row.date)}, ${ordinal(row.position)}${row.moved ? ', lo moviste' : ''}${row.best ? `, ${decimal.format(row.best.load)} kilos por ${row.best.reps}` : ''}${row.pct === null ? '' : `, ${formatPct(row.pct)}`}`}>
        <View style={[styles.pill, row.moved ? { backgroundColor: colors.brandSubtle } : { borderColor: colors.border, borderWidth: 1 }]}>
          <AppText numeric variant="caption" style={row.moved ? { color: colors.primary, fontWeight: '600' } : { color: colors.textMuted }}>{ordinal(row.position)}</AppText></View>
        <AppText numeric variant="subheadline" style={styles.flex}>{shortDate(row.date)}</AppText>
        <AppText muted numeric variant="footnote">{row.best ? `${decimal.format(row.best.load)} kg · ${row.best.reps}` : '—'}</AppText>
        <AppText numeric variant="footnote" style={styles.change}>{row.pct !== null && row.pct !== 0 ? `${changeArrow(row.pct)} ${formatPct(row.pct).replace(/^[+−]/, '')}` : row.direction === 'up' ? '↑ Peso' : row.direction === 'down' ? '↓ Peso' : row.direction === 'same' ? '=' : '—'}</AppText>
      </View>)}</View>
      {!inProgress ? <ExerciseHistoryLink exerciseId={exercise.exerciseId} onClose={onClose} /> : null}
    </ScrollView>
  </AppSheet>;
}
function ExerciseHistoryLink({ exerciseId, onClose }: { exerciseId: string; onClose: () => void }) {
  const router = useRouter();
  return <LinkRow label="Ver su historial" onPress={() => { onClose(); router.push(`/(tabs)/train/history/exercise/${exerciseId}`); }} />;
}

/** Comparaciones › Orden. */
export function RoutineOrderView({ client, initialRoutine, routines }: { client: MobileApiClient | null; initialRoutine: string | null; routines: readonly { value: string; label: string }[] }) {
  const [routine, setRoutine] = useState<string | null>(initialRoutine?.toLowerCase() ?? null);
  const [lens, setLens] = useState<Lens>('progress');
  const [open, setOpen] = useState<string | null>(null);
  const reduced = useReduceMotion();
  const { state, data, refresh } = useRoutineOrder(client, routine);
  if (!routine) return <View style={styles.block} testID="order-empty"><Heading level={2}>Todavía sin rutinas</Heading>
    <AppText muted>Cuando termines sesiones de una rutina, acá ves su orden.</AppText></View>;
  // The chips come from the routines Comparaciones already read: they stay put while another routine loads.
  const chips = routines.length > 1 ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} accessibilityLabel="Elegir rutina">
    {routines.map(option => <Chip key={option.value} label={option.label} selected={option.value.toLowerCase() === routine}
      onPress={() => { haptics.selection(); setOpen(null); setRoutine(option.value.toLowerCase()); }} />)}
  </ScrollView> : null;
  if (!data && state.status === 'loading') return <View style={styles.block} testID="order-loading">
    {chips}<SkeletonBlock height={56} /><SkeletonBlock height={34} />{[0, 1, 2, 3, 4].map(n => <SkeletonBlock key={n} height={46} />)}</View>;
  if (!data) return <View style={styles.block}>{chips}<InlineUnavailable message="No pudimos traer el orden de la rutina. No significa que no haya datos." actionLabel="Reintentar" onAction={() => void refresh()} /></View>;
  const reading = data.lenses[lens];
  const exercise = data.exercises.find(row => row.exerciseId === open);
  return <View style={styles.block} testID="routine-order">
    {chips}
    {state.status !== 'ready' && state.status !== 'loading' ? <InlineUnavailable message="No pudimos actualizar. Mostramos la última lectura." actionLabel="Reintentar" onAction={() => void refresh()} /> : null}
    <Animated.View key={`${data.routine.id}|${lens}|${reading.status}`} entering={reduced ? FadeIn.duration(200) : FadeIn.duration(300)} style={styles.head}>
      <AppText muted numeric variant="caption" style={styles.kicker}>{data.routine.name ?? 'Rutina'} · últimos 3 meses · {data.sessions} {data.sessions === 1 ? 'sesión' : 'sesiones'}</AppText>
      <AppText accessibilityRole="header" variant="title2" testID="order-headline">{orderHeadline(data, lens)}</AppText>
    </Animated.View>
    <ExerciseSegmented accessibilityLabel="Medir por progreso o por reps objetivo" value={lens} options={LENSES} onChange={value => { haptics.selection(); setLens(value); }} />
    {reading.status === 'insufficient' ? <ExampleFrame><ExampleLadder /></ExampleFrame>
      : <Ladder model={data} lens={lens} onOpen={setOpen} />}
    <AppText muted variant="footnote">{lens === 'progress' ? 'Veces que subiste reps o peso frente a la vez anterior.' : 'Series que llegaron a sus reps objetivo.'} Coincide con el orden; no prueba la causa.</AppText>
    {exercise ? <ExerciseSheet exercise={exercise} onClose={() => setOpen(null)} /> : null}
  </View>;
}

/** Example rows in grey under the EJEMPLO label: never numbers that look like the person's. */
function ExampleLadder() {
  const { colors } = useOwnlevelTheme();
  return <View>{[['1', 1], ['2', 0.93], ['3', 0.72]].map(([position, ratio]) => <View key={position} style={[styles.step, { borderBottomColor: colors.border }]}>
    <View style={[styles.position, { borderColor: colors.border }]}><AppText muted numeric variant="caption">{position}</AppText></View>
    <View style={styles.name}><AppText muted variant="label">Ejercicio {position}</AppText></View>
    <View style={styles.meter}><View style={[styles.track, { backgroundColor: colors.surfaceRaised }]}><View style={[styles.fill, { width: `${Number(ratio) * 100}%`, backgroundColor: colors.border }]} /></View></View>
  </View>)}</View>;
}

/** Routine editor: one quiet row when the routine has a cut that holds, to the order of that routine. Nothing is reordered. */
export function RoutineOrderHint({ client, routineId, onOpen }: { client: MobileApiClient | null; routineId: string; onOpen: () => void }) {
  const { data } = useRoutineOrder(client, routineId);
  const cut = data?.lenses.progress.status === 'ready' ? data.lenses.progress.cuts[0] : undefined;
  if (!data || !cut) return null;
  return <Animated.View entering={FadeIn.duration(300)} testID="routine-order-hint">
    <LinkRow label={`Desde el ${ordinal(cut.position)} subís menos seguido`} value={lossText('progress', cut.loss)} numeric onPress={() => { haptics.selection(); onOpen(); }} />
  </Animated.View>;
}

const styles = StyleSheet.create({
  block: { gap: spacing.md },
  head: { gap: spacing.xs },
  kicker: { textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: '600' },
  chips: { gap: spacing.sm, paddingRight: spacing.sm },
  step: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 56, paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth },
  stepStacked: { flexWrap: 'wrap' },
  position: { width: 26, height: 26, borderRadius: 13, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  name: { flex: 1, minWidth: 0, gap: 2 },
  meter: { width: 104, alignItems: 'flex-end', gap: 4 },
  meterStacked: { width: '100%', alignItems: 'stretch' },
  track: { width: '100%', height: 6, borderRadius: 3, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
  value: { textAlign: 'right' },
  cut: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingTop: spacing.sm, paddingBottom: spacing.xs },
  dash: { flex: 1, height: 0, borderTopWidth: 1, borderStyle: 'dashed', opacity: 0.6 },
  sheet: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  groups: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg },
  group: { gap: 2, minWidth: 110 },
  session: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 44, borderBottomWidth: StyleSheet.hairlineWidth },
  pill: { minWidth: 34, paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: 8, alignItems: 'center' },
  flex: { flex: 1 },
  change: { minWidth: 56, textAlign: 'right' },
});
