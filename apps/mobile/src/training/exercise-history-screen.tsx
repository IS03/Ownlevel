import { useCallback, useState } from 'react';
import { Platform, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useMobileApi } from '@/api';
import { fetchTrainingExerciseHistory, type TrainingExerciseHistorySession, type TrainingHistoryMark } from '@/api/training-history';
import { AppIcon, AppText, Button, EmptyState, ScrollScreen, Surface, brandTokens, radius, spacing, useOwnlevelTheme } from '@/design-system';
import { exerciseSetLabel } from './exercise-detail-model';
import { GroupChip } from './group-chip';
import { ListCard, ReadStateScreen, StaleNotice } from './history-components';
import { bestSetBars, dayHeading, plural, sameMark, shortDate, weightModeUnit } from './history-model';
import { useRead } from './use-read';

const CHART_HEIGHT = 96;
const number = (value: number) => new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 }).format(value);

/** HI4: one exercise's full history — routine chips, latest/best card, small best-set chart and sessions. */
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
  // A fresh scope never presents old highlights as if they belonged to the new filter.
  return <ExerciseHistoryContent key={routineId ?? 'all'} exerciseId={exerciseId} routineId={routineId} options={options} overallBest={overallBest}
    onRead={(routines, best) => { setOptions(routines); if (routineId === null) setOverallBest(best); }} onRoutineChange={setRoutineId} />;
}

function Mark({ title, item, label, record }: { title: string; item: TrainingExerciseHistorySession; label: string; record: boolean }) {
  const { colors } = useOwnlevelTheme();
  return <View style={styles.mark}>
    <View style={styles.markTitle}><AppText muted variant="footnote" numberOfLines={1}>{title}</AppText>
      {record ? <View style={[styles.record, { backgroundColor: colors.brandSubtle }]}><AppText variant="caption" style={{ color: colors.primary, fontWeight: '600' }}>Récord</AppText></View> : null}</View>
    <AppText numeric variant="title2">{label}</AppText>
    <AppText muted numeric variant="footnote">{shortDate(item.logDate)}</AppText>
  </View>;
}

/** Small on purpose (the full analysis goes to Progreso): bars from 0, missing = gap, latest in the accent. */
function BestSetChart({ sessions, unit }: { sessions: TrainingExerciseHistorySession[]; unit: string }) {
  const { colors, isDark } = useOwnlevelTheme();
  const bars = bestSetBars(sessions);
  const values = bars.map(bar => bar.value).filter((value): value is number => value !== null);
  if (bars.length < 2 || !values.length) return null;
  const max = Math.max(...values, 0) || 1, light = brandTokens.intensity[isDark ? 'dark' : 'light'][2];
  return <Surface style={styles.chart} accessible accessibilityLabel={`Mejor serie por sesión en ${unit}: ${bars.map(bar => `${shortDate(bar.date)} ${bar.value === null ? 'sin dato' : number(bar.value)}`).join(', ')}`}>
    <AppText muted variant="footnote">Mejor serie por sesión · {unit}</AppText>
    <View style={styles.bars}>{bars.map((bar, index) => <View key={bar.sessionId} style={styles.barSlot}>
      {bar.value === null ? <AppText muted variant="caption">—</AppText> : <>
        <AppText muted numeric variant="caption">{number(bar.value)}</AppText>
        <View style={[styles.bar, { height: Math.max(2, bar.value / max * CHART_HEIGHT), backgroundColor: index === bars.length - 1 ? colors.primary : light }]} />
      </>}
    </View>)}</View>
    <View style={styles.axis}><AppText muted numeric variant="caption">{shortDate(bars[0]!.date)}</AppText><AppText muted numeric variant="caption">{shortDate(bars.at(-1)!.date)}</AppText></View>
  </Surface>;
}

function ExerciseHistoryContent({ exerciseId, routineId, options, overallBest, onRead, onRoutineChange }: {
  exerciseId: string; routineId: string | null; options: { id: string; name: string }[]; overallBest: TrainingHistoryMark | null;
  onRead: (routines: { id: string; name: string }[], best: TrainingHistoryMark | null) => void; onRoutineChange: (id: string | null) => void;
}) {
  const { client } = useMobileApi();
  const router = useRouter();
  const { colors } = useOwnlevelTheme();
  const [limit, setLimit] = useState(20);
  const load = useCallback((signal: AbortSignal) => client && exerciseId ? fetchTrainingExerciseHistory(client, exerciseId, limit, signal, routineId).then(result => {
    if (result.status === 'ok' && !signal.aborted) onRead(result.data.routines ?? [], result.data.best?.mark ?? null);
    return result;
  }) : Promise.resolve({ status: 'unavailable' as const, reason: 'invalid_response' as const, meta: { durationMs: 0, httpStatus: null, outcome: 'unavailable' as const } }),
  // eslint-disable-next-line react-hooks/exhaustive-deps -- onRead is a fresh closure each render; reading again for it would loop.
  [client, exerciseId, limit, routineId]);
  const { state, reload } = useRead(load);
  useFocusEffect(useCallback(() => { void reload(); }, [reload]));
  const name = state.status === 'ready' ? state.data.exercise.name : 'Ejercicio';
  const screen = <Stack.Screen options={{ title: name, headerLargeTitleEnabled: Platform.OS === 'ios', headerLargeTitleStyle: { color: colors.text },
    headerStyle: { backgroundColor: Platform.OS === 'ios' ? 'transparent' : colors.background }, headerLargeStyle: { backgroundColor: 'transparent' } }} />;
  const filters = options.length ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters} style={styles.filterScroll} accessibilityLabel="Filtrar historial por rutina">
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
  return <>{screen}<ScrollScreen testID="exercise-history" refreshControl={<RefreshControl refreshing={state.refreshing} onRefresh={() => void reload()} tintColor={colors.primary} />}>
    <AppText muted variant="subheadline">{identity}</AppText>
    {filters}
    {state.stale ? <StaleNotice onRetry={() => void reload()} /> : null}
    {latest ? <Surface style={styles.marks} testID="exercise-history-marks">
      <Mark title="Última vez" item={latest} label={markText(latest.mark)} record={single && record} />
      {best && !single ? <Mark title={routineId ? `Mejor en ${selectedName}` : 'Mejor marca'} item={best} label={markText(best.mark)} record={record} /> : null}
    </Surface> : null}
    {unit ? <BestSetChart sessions={sessions} unit={unit} /> : null}
    <AppText variant="title2" style={styles.section}>Sesiones</AppText>
    {sessions.length === 0 ? <EmptyState title={routineId ? `Todavía no lo hiciste en ${selectedName}` : 'Todavía no lo hiciste'} description="Las sesiones terminadas aparecen acá."
      action={routineId ? <Button label="Ver todas" variant="secondary" onPress={() => onRoutineChange(null)} /> : undefined} />
      : <ListCard>{sessions.map((session, index) => <Pressable key={session.sessionId} accessibilityRole="button"
        accessibilityLabel={`${dayHeading(session.logDate)}, ${session.routineName}. ${markText(session.mark)}. ${plural(session.completedSets, 'serie')}`}
        testID={`exercise-history-session-${session.sessionId}`} onPress={() => router.push(`/(tabs)/train/history/${session.sessionId}`)}
        style={({ pressed }) => [styles.row, pressed ? { backgroundColor: colors.surfaceRaised } : null]}>
        {index > 0 ? <View style={[styles.divider, { backgroundColor: colors.border }]} /> : null}
        <View style={styles.flex}>
          <AppText muted numberOfLines={1} variant="footnote">{dayHeading(session.logDate).replace(',', '')} · {session.routineName}</AppText>
          <AppText numeric numberOfLines={1} variant="headline">{markText(session.mark)} · {plural(session.completedSets, 'serie')}</AppText>
        </View>
        <AppIcon color={colors.textMuted} name="chevronRight" size={15} />
      </Pressable>)}</ListCard>}
    {hasMore && limit < 100 ? <Button label={state.refreshing ? 'Cargando…' : 'Ver más'} variant="secondary" disabled={state.refreshing}
      onPress={() => setLimit(current => Math.min(current + 20, 100))} /> : null}
  </ScrollScreen></>;
}
const styles = StyleSheet.create({
  filterScroll: { marginHorizontal: -spacing.lg, overflow: 'visible' },
  filters: { gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.xs },
  flex: { flex: 1, gap: 2 },
  marks: { flexDirection: 'row', gap: spacing.md },
  mark: { flex: 1, gap: 2 },
  markTitle: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, minHeight: 22 },
  record: { borderRadius: radius.chip, paddingHorizontal: spacing.sm, paddingVertical: 1 },
  chart: { gap: spacing.sm },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, height: CHART_HEIGHT + 22 },
  barSlot: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 4 },
  bar: { width: '100%', borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  axis: { flexDirection: 'row', justifyContent: 'space-between' },
  section: { paddingTop: spacing.sm },
  row: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  divider: { position: 'absolute', top: 0, left: spacing.md, right: 0, height: StyleSheet.hairlineWidth },
});
