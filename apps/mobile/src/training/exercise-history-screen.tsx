import { useCallback, useLayoutEffect, useState } from 'react';
import { RefreshControl, StyleSheet, View, Pressable, ScrollView } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useMobileApi } from '@/api';
import { fetchTrainingExerciseHistory, type TrainingExerciseHistorySession } from '@/api/training-history';
import { AppIcon, AppText, Button, Chip, EmptyState, IconCircle, ScrollScreen, Surface, spacing, useOwnlevelTheme } from '@/design-system';
import { markLabel, markMetadata, shortDate } from './history-model';
import { ListCard, ReadStateScreen, StaleNotice } from './history-components';
import { useRead } from './use-read';

function Highlight({ title, item, record }: { title: string; item: TrainingExerciseHistorySession | null; record?: boolean }) {
  const { colors } = useOwnlevelTheme();
  return <Surface style={styles.highlight} testID={record ? 'exercise-history-best' : 'exercise-history-latest'}>
    <IconCircle icon={record ? 'progress' : 'calendar'} size="small" />
    <View style={styles.flex}>
      <AppText muted variant="caption">{title}{item ? ` · ${shortDate(item.logDate)}` : ''}</AppText>
      {item ? <>
        <AppText variant="label" style={styles.mark}>{markLabel(item.mark)}</AppText>
        <AppText muted variant="caption">{markMetadata(item.completedSets, item.rirValues)}</AppText>
      </> : <AppText muted variant="caption">Todavía no hay una marca comparable.</AppText>}
    </View>
    {record && item ? <AppText style={{ color: colors.primary }} variant="caption">Récord</AppText> : null}
  </Surface>;
}

/** One exercise's completed history (Web parity): latest, best mark and sessions. */
export function ExerciseHistoryScreen() {
  const params = useLocalSearchParams<{ id: string; routineId?: string }>();
  const exerciseId = typeof params.id === 'string' ? params.id : '';
  return <ExerciseHistoryScope key={exerciseId} exerciseId={exerciseId} initialRoutineId={typeof params.routineId === 'string' ? params.routineId : null} />;
}
function ExerciseHistoryScope({ exerciseId, initialRoutineId }: { exerciseId: string; initialRoutineId: string | null }) {
  const [routineId, setRoutineId] = useState(initialRoutineId);
  const [options, setOptions] = useState<{ id: string; name: string }[]>([]);
  // A fresh scope never presents old highlights as if they belonged to the new filter.
  return <ExerciseHistoryContent key={routineId ?? 'all'} exerciseId={exerciseId} routineId={routineId} options={options} onOptions={setOptions} onRoutineChange={setRoutineId} />;
}
function ExerciseHistoryContent({ exerciseId, routineId, options, onOptions, onRoutineChange }: {
  exerciseId: string; routineId: string | null; options: { id: string; name: string }[];
  onOptions: (options: { id: string; name: string }[]) => void; onRoutineChange: (id: string | null) => void;
}) {
  const { client } = useMobileApi();
  const router = useRouter();
  const navigation = useNavigation();
  const { colors } = useOwnlevelTheme();
  const [limit, setLimit] = useState(20);
  const load = useCallback((signal: AbortSignal) => client && exerciseId ? fetchTrainingExerciseHistory(client, exerciseId, limit, signal, routineId).then(result => {
    if (result.status === 'ok' && !signal.aborted) onOptions(result.data.routines ?? []);
    return result;
  })
    : Promise.resolve({ status: 'unavailable' as const, reason: 'invalid_response' as const, meta: { durationMs: 0, httpStatus: null, outcome: 'unavailable' as const } }), [client, exerciseId, limit, routineId, onOptions]);
  const { state, reload } = useRead(load);
  useFocusEffect(useCallback(() => { void reload(); }, [reload]));
  const name = state.status === 'ready' ? state.data.exercise.name : null;
  useLayoutEffect(() => { if (name) navigation.setOptions({ title: name }); }, [name, navigation]);
  const filters = options.length ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters} accessibilityLabel="Filtrar historial por rutina">
      <Chip label="Todas" selected={routineId === null} onPress={() => onRoutineChange(null)} />
      {options.map(option => <Chip key={option.id} label={option.name} selected={routineId === option.id} onPress={() => onRoutineChange(option.id)} />)}
    </ScrollView> : null;
  if (state.status !== 'ready') return <ReadStateScreen header={filters} state={state} onRetry={() => void reload()} testID="exercise-history" notFoundTitle="Ejercicio no disponible" />;
  const { exercise, latest, best, sessions, hasMore } = state.data;
  const selectedName = options.find(option => option.id === routineId)?.name ?? 'esta rutina';
  const identity = [exercise.muscleLabel ?? exercise.muscleGroup, exercise.implement, exercise.weightMode].filter(Boolean).join(' · ');
  return <ScrollScreen testID="exercise-history" refreshControl={<RefreshControl refreshing={state.refreshing} onRefresh={() => void reload()} tintColor={colors.primary} />}>
    {state.stale ? <StaleNotice onRetry={() => void reload()} /> : null}
    <View style={styles.header}>
      <AppText variant="label" style={styles.title}>{exercise.name}</AppText>
      {identity ? <AppText muted variant="caption">{identity}</AppText> : null}
    </View>
    {filters}
    <Highlight title="Última vez" item={latest} />
    <Highlight title={routineId ? `Mejor en ${selectedName}` : "Mejor marca"} item={best} record />
    <AppText muted variant="label">Sesiones</AppText>
    {sessions.length === 0 ? <EmptyState title={routineId ? `Todavía no lo hiciste en ${selectedName}` : "Todavía no lo hiciste"} description="Las sesiones terminadas aparecen acá." action={routineId ? <Button label="Ver todas" variant="secondary" onPress={() => onRoutineChange(null)} /> : undefined} />
      : <ListCard>{sessions.map((session, index) => <Pressable key={session.sessionId} accessibilityRole="button"
        accessibilityLabel={`${shortDate(session.logDate)}, ${session.routineName}. ${markLabel(session.mark)}. ${markMetadata(session.completedSets, session.rirValues)}`}
        testID={`exercise-history-session-${session.sessionId}`} onPress={() => router.push(`/(tabs)/train/history/${session.sessionId}`)}
        style={({ pressed }) => [styles.row, index > 0 ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border } : null,
          pressed ? { backgroundColor: colors.surfaceRaised } : null]}>
        <View style={styles.flex}>
          <AppText muted numberOfLines={1} variant="caption">{shortDate(session.logDate)} · {session.routineName}</AppText>
          <AppText numberOfLines={1} variant="label">{markLabel(session.mark)}</AppText>
          <AppText muted numberOfLines={1} variant="caption">{markMetadata(session.completedSets, session.rirValues)}</AppText>
        </View>
        <AppIcon color={colors.textMuted} name="chevronRight" size={14} />
      </Pressable>)}</ListCard>}
    {hasMore && limit < 100 ? <Button label={state.refreshing ? 'Cargando…' : 'Ver más'} variant="secondary" disabled={state.refreshing}
      onPress={() => setLimit(current => Math.min(current + 20, 100))} /> : null}
  </ScrollScreen>;
}
const styles = StyleSheet.create({
  filters: { gap: spacing.sm, paddingVertical: spacing.xs },
  flex: { flex: 1, gap: 2 },
  header: { gap: 2 },
  title: { fontSize: 22, lineHeight: 28 },
  mark: { fontSize: 18, lineHeight: 24 },
  highlight: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  row: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
});
