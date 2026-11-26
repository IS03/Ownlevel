import { useCallback, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, G, Line, Rect, Text as SvgText } from 'react-native-svg';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useMobileApi } from '@/api';
import { fetchTrainingExerciseHistory, type TrainingExerciseHistorySession, type TrainingHistoryMark } from '@/api/training-history';
import { PullRefreshControl, LinkRow, AppIcon, AppText, EmptyState, pressedStyle, radius, spacing, useOwnlevelTheme, useReduceMotion } from '@/design-system';
import { exerciseSetLabel } from './exercise-detail-model';
import { GroupChip } from './group-chip';
import { HistoryScroll, ReadStateScreen, StaleNotice } from './history-components';
import { dayHeading, plural, repsOverWeights, sameMark, setChips, shortDate, weightModeUnit } from './history-model';
import { useFocusedRead } from './use-read';

const number = (value: number) => new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 }).format(value);

/** HI4 · Ejercicios más claros: one exercise's history — routine chips, the last time as the big number, reps over weights and sessions. */
export function ExerciseHistoryScreen() {
  const params = useLocalSearchParams<{ id: string; routineId?: string }>();
  const exerciseId = typeof params.id === 'string' ? params.id : '';
  return <ExerciseHistoryScope key={exerciseId} exerciseId={exerciseId} initialRoutineId={typeof params.routineId === 'string' ? params.routineId : null} />;
}
function ExerciseHistoryScope({ exerciseId, initialRoutineId }: { exerciseId: string; initialRoutineId: string | null }) {
  const [routineId, setRoutineId] = useState(initialRoutineId);
  const [options, setOptions] = useState<{ id: string; name: string }[]>([]);
  // The unfiltered best, once read, is what makes a routine's best a real "Récord".
  const [overallBest, setOverallBest] = useState<TrainingHistoryMark | null>(null);
  // Kept across routine scopes so the large title doesn't flip back to "Ejercicio" while a scope loads.
  const [name, setName] = useState('Ejercicio');
  // A fresh scope never presents old highlights as if they belonged to the new filter.
  return <ExerciseHistoryContent key={routineId ?? 'all'} exerciseId={exerciseId} routineId={routineId} options={options} overallBest={overallBest} name={name}
    onRead={(routines, best, exerciseName) => { setOptions(routines); setName(exerciseName); if (routineId === null) setOverallBest(best); }} onRoutineChange={setRoutineId} />;
}

/** «Última vez» as the screen's one big number, with «Récord» beside it when it is. */
function LastTime({ item, label, record }: { item: TrainingExerciseHistorySession; label: string; record: boolean }) {
  const { colors } = useOwnlevelTheme();
  return <View style={styles.last} testID="exercise-history-marks">
    <AppText muted variant="caption" style={styles.kicker}>Última vez · {dayHeading(item.logDate).replace(',', '').split(' de ')[0]}</AppText>
    <View style={styles.lastRow}>
      <AppText numeric variant="heroNumber" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5} style={styles.flexShrink}>{label}</AppText>
      {record ? <View style={[styles.record, { backgroundColor: colors.brandSubtle }]}><AppText variant="caption" style={{ color: colors.primary, fontWeight: '600' }}>Récord</AppText></View> : null}
    </View>
  </View>;
}

const CHART_H = 150, TOP = 18, BOTTOM = 34, DOT = 3.5;
/**
 * The reps of each session's best set, over a band per weight: a slope inside a band is reps at the same weight, a new band is a
 * weight change. Small on purpose (the full analysis goes to Progreso). The latest point is in the accent; a gap is a missing value.
 */
function RepsChart({ sessions, unit }: { sessions: TrainingExerciseHistorySession[]; unit: string }) {
  const { colors } = useOwnlevelTheme();
  const [width, setWidth] = useState(0);
  const { points, bands } = repsOverWeights(sessions);
  const reps = points.map(point => point.reps).filter((value): value is number => value !== null);
  if (points.length < 2 || reps.length < 2) return null;
  const min = Math.min(...reps) - 1, max = Math.max(...reps) + 1, slot = width / points.length;
  const x = (index: number) => slot * index + slot / 2, y = (value: number) => TOP + (1 - (value - min) / (max - min)) * (CHART_H - TOP - BOTTOM);
  const weightText = (weight: number | null) => weight === null ? 'sin peso' : `${number(weight)} ${unit}`;
  const spoken = `Reps de tu mejor serie en cada sesión, sobre su peso. ${bands.map(band => `${weightText(band.weight)}: ${points.slice(band.start, band.end + 1).map(point => point.reps === null ? 'sin dato' : number(point.reps)).join(', ')}`).join('. ')}.`;
  return <View style={styles.chart} accessible accessibilityRole="image" accessibilityLabel={spoken} testID="exercise-history-reps">
    <AppText muted variant="footnote">Reps de tu mejor serie</AppText>
    <View style={{ height: CHART_H }} onLayout={event => setWidth(event.nativeEvent.layout.width)}>
      {width ? <Svg width={width} height={CHART_H}>
        {bands.map((band, index) => {
          const last = index === bands.length - 1, left = slot * band.start + 1, w = slot * (band.end - band.start + 1) - 2;
          return <G key={band.start}>
            <Rect x={left} y={0} width={w} height={CHART_H - BOTTOM + 14} rx={8} fill={last ? colors.primary : colors.textMuted} fillOpacity={last ? 0.14 : 0.08} />
            {w >= 44 ? <SvgText x={left + 6} y={CHART_H - BOTTOM + 8} fontSize={11} fill={last ? colors.primary : colors.textMuted} fontWeight={last ? '600' : '400'}>{weightText(band.weight)}</SvgText> : null}
            {points.slice(band.start, band.end + 1).map((point, offset) => {
              const index = band.start + offset, next = points[index + 1];
              return point.reps !== null && next && index < band.end && next.reps !== null
                ? <Line key={`l${index}`} x1={x(index)} y1={y(point.reps)} x2={x(index + 1)} y2={y(next.reps)} stroke={colors.primary} strokeOpacity={0.55} strokeWidth={2} /> : null;
            })}
          </G>;
        })}
        {points.map((point, index) => point.reps === null ? null : <Circle key={point.sessionId} cx={x(index)} cy={y(point.reps)} r={index === points.length - 1 ? DOT + 1.5 : DOT}
          fill={colors.primary} fillOpacity={index === points.length - 1 ? 1 : 0.55} />)}
        {points.map((point, index) => point.reps !== null && (index === points.length - 1 || bands.some(band => band.start === index))
          ? <SvgText key={`t${point.sessionId}`} x={x(index)} y={y(point.reps) - 8} fontSize={11} textAnchor="middle" fill={colors.text}>{number(point.reps)}</SvgText> : null)}
      </Svg> : null}
    </View>
    <View style={styles.axis}><AppText muted numeric variant="caption">{shortDate(points[0]!.date)}</AppText><AppText muted numeric variant="caption">{shortDate(points.at(-1)!.date)}</AppText></View>
  </View>;
}

/** One session: date and routine, the reps of each set (the mark's set highlighted) and the weight when all sets share it. */
function SessionLine({ session, label, unit, first, onPress }: { session: TrainingExerciseHistorySession; label: string; unit: string | null; first: boolean; onPress: () => void }) {
  const { colors } = useOwnlevelTheme();
  const reduced = useReduceMotion();
  const { fontScale } = useWindowDimensions();
  const chips = setChips(session.sets, session.mark);
  const weight = chips?.oneWeight && chips.chips[0]?.weight !== null && chips.chips[0]?.weight !== undefined && unit ? `${number(chips.chips[0].weight)} ${unit}` : null;
  const spokenSets = chips ? `Series: ${chips.chips.map(chip => chip.reps === null ? 'sin reps' : number(chip.reps)).join(', ')}${weight ? `, todas con ${weight}` : ''}` : plural(session.completedSets, 'serie');
  return <Pressable accessibilityRole="button" accessibilityLabel={`${dayHeading(session.logDate)}, ${session.routineName}. Mejor serie ${label}. ${spokenSets}`}
    testID={`exercise-history-session-${session.sessionId}`} onPress={onPress}
    style={({ pressed }) => [styles.session, !first && { borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border }, pressedStyle(pressed, reduced)]}>
    <View style={styles.flex}>
      <AppText muted numberOfLines={1} variant="footnote">{dayHeading(session.logDate).replace(',', '').split(' de ')[0]} · {session.routineName}</AppText>
      {chips && fontScale <= 1.3 ? <View style={styles.chips}>{chips.chips.map((chip, index) => <View key={index}
        style={[styles.chip, { backgroundColor: chip.best ? colors.brandSubtle : colors.surfaceRaised }]}>
        <AppText numeric variant="caption" style={chip.best ? { color: colors.primary, fontWeight: '700' } : undefined}>{chip.reps === null ? '—' : number(chip.reps)}</AppText>
      </View>)}</View> : <AppText numeric variant="headline">{label} · {plural(session.completedSets, 'serie')}</AppText>}
    </View>
    {chips && fontScale <= 1.3 ? <AppText numeric variant="headline">{weight ?? label}</AppText> : null}
    <AppIcon color={colors.textMuted} name="chevronRight" size={15} />
  </Pressable>;
}

function ExerciseHistoryContent({ exerciseId, routineId, options, overallBest, name, onRead, onRoutineChange }: {
  exerciseId: string; routineId: string | null; options: { id: string; name: string }[]; overallBest: TrainingHistoryMark | null; name: string;
  onRead: (routines: { id: string; name: string }[], best: TrainingHistoryMark | null, name: string) => void; onRoutineChange: (id: string | null) => void;
}) {
  const { client } = useMobileApi();
  const router = useRouter();
  const { colors } = useOwnlevelTheme();
  const [limit, setLimit] = useState(20);
  const load = useCallback((signal: AbortSignal) => client && exerciseId ? fetchTrainingExerciseHistory(client, exerciseId, limit, signal, routineId).then(result => {
    if (result.status === 'ok' && !signal.aborted) onRead(result.data.routines ?? [], result.data.best?.mark ?? null, result.data.exercise.name);
    return result;
  }) : Promise.resolve({ status: 'unavailable' as const, reason: 'invalid_response' as const, meta: { durationMs: 0, httpStatus: null, outcome: 'unavailable' as const } }),
  // eslint-disable-next-line react-hooks/exhaustive-deps -- onRead is a fresh closure each render; reading again for it would loop.
  [client, exerciseId, limit, routineId]);
  const { state, reload } = useFocusedRead(load);
  const screen = <Stack.Screen options={{ title: name, headerLargeTitleEnabled: Platform.OS === 'ios', headerLargeTitleStyle: { color: colors.text },
    headerStyle: { backgroundColor: Platform.OS === 'ios' ? 'transparent' : colors.background }, headerLargeStyle: { backgroundColor: 'transparent' } }} />;
  const filters = options.length ? <ScrollView showsVerticalScrollIndicator={false} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters} style={styles.filterScroll} accessibilityLabel="Filtrar historial por rutina">
    <GroupChip label="Todas" selected={routineId === null} onPress={() => onRoutineChange(null)} />
    {options.map(option => <GroupChip key={option.id} label={option.name} selected={routineId === option.id} onPress={() => onRoutineChange(option.id)} />)}
  </ScrollView> : null;
  if (state.status !== 'ready') return <>{screen}<ReadStateScreen header={filters} state={state} onRetry={() => void reload()} testID="exercise-history" notFoundTitle="Ejercicio no disponible" /></>;
  const { exercise, latest, best, sessions, hasMore } = state.data;
  const mode = exercise.weightMode ?? 'Peso total', unit = weightModeUnit(exercise.weightMode);
  const markText = (mark: TrainingHistoryMark | null) => mark ? exerciseSetLabel({ actualWeightKg: mark.weightKg, actualReps: mark.reps }, mode) : '—';
  const selectedName = options.find(option => option.id === routineId)?.name ?? 'esta rutina';
  const record = !!best && (routineId === null || sameMark(best.mark, overallBest));
  const identity = ['Historial', exercise.implement, exercise.weightMode].filter(Boolean).join(' · ');
  const single = !!latest && !!best && latest.sessionId === best.sessionId;
  return <>{screen}<HistoryScroll testID="exercise-history" refreshControl={<PullRefreshControl onRefresh={() => reload()} tintColor={colors.primary} />}>
    <AppText muted variant="subheadline">{identity}</AppText>
    {filters}
    {state.stale ? <StaleNotice onRetry={() => void reload()} /> : null}
    {latest ? <LastTime item={latest} label={markText(latest.mark)} record={single && record} /> : null}
    {best && latest && !single ? <AppText muted numeric variant="footnote" testID="exercise-history-best">{routineId ? `Mejor en ${selectedName}` : 'Mejor marca'}: {markText(best.mark)} · {shortDate(best.logDate)}{record ? ' · Récord' : ''}</AppText> : null}
    {unit ? <RepsChart sessions={sessions} unit={unit} /> : null}
    <AppText muted variant="caption" style={[styles.kicker, styles.section]} accessibilityRole="header">Sesiones</AppText>
    {sessions.length === 0 ? <EmptyState title={routineId ? `Todavía no lo hiciste en ${selectedName}` : 'Todavía no lo hiciste'} description="Las sesiones terminadas aparecen acá."
      action={routineId ? <LinkRow label="Ver todas" onPress={() => onRoutineChange(null)} /> : undefined} />
      : <View>{sessions.map((session, index) => <SessionLine key={session.sessionId} session={session} label={markText(session.mark)} unit={unit} first={index === 0}
        onPress={() => router.push(`/(tabs)/train/history/${session.sessionId}`)} />)}</View>}
    {hasMore && limit < 100 ? <LinkRow kind="disclosure" label={state.refreshing ? 'Cargando…' : 'Ver más'} disabled={state.refreshing}
      onPress={() => setLimit(current => Math.min(current + 20, 100))} /> : null}
  </HistoryScroll></>;
}
const styles = StyleSheet.create({
  // flexGrow 0: a horizontal ScrollView grows by default and stretched the chips while loading.
  filterScroll: { flexGrow: 0, marginHorizontal: -spacing.lg, overflow: 'visible' },
  filters: { gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.xs },
  flex: { flex: 1, gap: 4 },
  flexShrink: { flexShrink: 1 },
  kicker: { letterSpacing: 0.6, textTransform: 'uppercase' },
  last: { gap: 2 },
  lastRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  record: { borderRadius: radius.chip, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  chart: { gap: spacing.xs },
  axis: { flexDirection: 'row', justifyContent: 'space-between' },
  section: { paddingTop: spacing.md },
  session: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  chip: { minWidth: 28, alignItems: 'center', borderRadius: 6, paddingHorizontal: 5, paddingVertical: 2 },
});
