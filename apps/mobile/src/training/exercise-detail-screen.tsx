import { useCallback, useState } from 'react';
import { Platform, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useApiResource } from '@/api';
import type { MobileTrainingExercise } from '@/api/exercises';
import { AppText, InlineUnavailable, ListGroup, ListRow, SkeletonBlock, Surface, UnavailableState, radius, spacing, useOwnlevelTheme } from '@/design-system';
import { useExerciseLibrary, exerciseUnavailable } from './use-exercise-library';
import { ExerciseEditorModal } from './exercise-editor-modal';
import { ExerciseAddRoutineSheet } from './exercise-add-routine-sheet';
import { ExerciseNotice } from './exercise-notice';
import { TrainingContextMenu } from './routine-context-menu';
import { RoutineSheetButton } from './routine-sheet-button';
import { muscleGroupLabel } from './exercise-library-model';
import { exerciseSetLabel, fetchLastExercise } from './exercise-detail-model';
import { dayHeading } from './history-model';
import { trainingRoutineColor } from './routine-colors';
export function ExerciseDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>(), library = useExerciseLibrary(), router = useRouter(), { colors, isDark } = useOwnlevelTheme();
  const [editing, setEditing] = useState<MobileTrainingExercise | null>(null), [adding, setAdding] = useState(false);
  const exercise = library.exercises.find(item => item.id === id);
  const loadLast = useCallback((signal: AbortSignal) => library.client && id ? fetchLastExercise(library.client, id, signal) : Promise.resolve(exerciseUnavailable), [library.client, id]);
  const last = useApiResource(loadLast), { refresh, runRefresh } = library;
  useFocusEffect(runRefresh);
  const lastRead = last.state.status === 'ready' ? last.state.current : last.state.status === 'loading' ? undefined : last.state.previous;
  const locked = library.pending || Boolean(editing) || adding;
  const menu = exercise ? <Stack.Toolbar placement="right"><Stack.Toolbar.Menu icon="ellipsis" accessibilityLabel="Opciones del ejercicio" separateBackground disabled={locked}>
    <Stack.Toolbar.MenuAction icon="pencil" onPress={() => setEditing(exercise)}>Editar</Stack.Toolbar.MenuAction>
    <Stack.Toolbar.MenuAction icon="archivebox" onPress={() => void library.status(exercise)}>{exercise.isActive ? 'Archivar' : 'Restaurar'}</Stack.Toolbar.MenuAction>
  </Stack.Toolbar.Menu></Stack.Toolbar> : null;
  return <><Stack.Screen options={{ title: exercise?.name ?? 'Ejercicio', headerLargeTitleEnabled: Platform.OS === 'ios', headerLargeTitleStyle: { color: colors.text }, headerStyle: { backgroundColor: Platform.OS === 'ios' ? 'transparent' : colors.background }, headerLargeStyle: { backgroundColor: 'transparent' },
    headerRight: Platform.OS !== 'ios' && exercise ? () => <TrainingContextMenu width={44} name={exercise.name} onOpen={() => undefined} disabled={locked} openOnTap actions={[
      { label: 'Editar', symbol: 'pencil', onPress: () => setEditing(exercise) }, { label: exercise.isActive ? 'Archivar' : 'Restaurar', symbol: 'archivebox', onPress: () => void library.status(exercise) }]}>
      <RoutineSheetButton label="Opciones del ejercicio" icon="more" disabled={locked} onPress={() => undefined} />
    </TrainingContextMenu> : undefined }} />
    {Platform.OS === 'ios' ? menu : null}
    <ScrollView contentInsetAdjustmentBehavior="automatic" testID="exercise-detail" style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={library.state.status === 'ready' && library.state.refreshing} tintColor={colors.primary} onRefresh={() => { if (!locked) { void refresh(); void last.refresh(); } }} />}>
      {!exercise ? !library.current && library.state.status === 'loading' ? <SkeletonBlock height={200} /> : !library.catalog ? <InlineUnavailable message="No pudimos cargar el ejercicio." actionLabel="Reintentar" onAction={() => void refresh()} /> : <UnavailableState title="No encontramos el ejercicio" description="Ya no está disponible en tu biblioteca." /> : <>
        {Platform.OS !== 'ios' || exercise.name.length > 24 ? <AppText variant={Platform.OS === 'ios' ? 'title2' : 'largeTitle'} testID="exercise-full-name">{exercise.name}</AppText> : null}
        {library.stale ? <InlineUnavailable message="Mostramos la última lectura confirmada." actionLabel="Reintentar" onAction={() => void refresh()} /> : null}
        <View style={styles.chips}>{[exercise.muscleGroup ? muscleGroupLabel(exercise.muscleGroup) : null, exercise.implement, exercise.weightMode].filter(Boolean).map((label, index) => <View key={index} style={[styles.chip, { backgroundColor: colors.surfaceRaised }]}><AppText variant="footnote">{label}</AppText></View>)}</View>
        {!exercise.isActive ? <AppText muted variant="footnote">Ejercicio archivado. Restauralo desde ••• para volver a agregarlo. Tus rutinas y tu historial se conservan.</AppText> : null}
        <AppText variant="title2">En tus rutinas activas</AppText><ListGroup bordered={false}>
          {exercise.routineIds.map(routineId => { const routine = library.routines.find(item => item.id === routineId); return <View key={routineId} style={styles.routineRow}>
            {routine?.color ? <View style={[styles.strip, { backgroundColor: trainingRoutineColor(routine.color, isDark) }]} /> : null}
            <View style={{ flex: 1 }}><ListRow title={routine?.name ?? 'Rutina'} onPress={() => router.push({ pathname: '/(tabs)/train/routines/[id]', params: { id: routineId } })} /></View>
          </View>; })}
          {!exercise.routineIds.length ? <AppText muted variant="footnote" style={{ paddingVertical: spacing.md }}>No está en tus rutinas activas.</AppText> : null}
          {exercise.isActive ? <ListRow title="Agregar a una rutina" icon="plus" disabled={locked} onPress={() => setAdding(true)} /> : null}
        </ListGroup>
        <AppText variant="title2">Última vez</AppText><Surface>
          {!lastRead && last.state.status === 'loading' ? <SkeletonBlock height={80} /> : !lastRead ? <InlineUnavailable message="No pudimos cargar la última vez." actionLabel="Reintentar" onAction={() => void last.refresh()} /> : <>
            {last.state.status !== 'ready' ? <InlineUnavailable message="Mostramos la última lectura confirmada del historial." actionLabel="Reintentar" onAction={() => void last.refresh()} /> : null}
            {!lastRead.data.latest ? <AppText muted>Todavía no lo hiciste.</AppText> : <><AppText muted numeric variant="subheadline">{dayHeading(lastRead.data.latest.logDate)} · {lastRead.data.latest.routineName}</AppText>
              <View style={styles.chips}>{lastRead.data.sets.map(set => <View key={set.setNumber} style={[styles.chip, { backgroundColor: colors.surfaceRaised }]}><AppText numeric variant="headline">{exerciseSetLabel(set, lastRead.data.weightMode)}</AppText></View>)}</View>
              {!lastRead.data.sets.length ? <AppText muted variant="footnote">Sin series registradas en esa sesión.</AppText> : null}</>}
          </>}
          <ListRow title="Ver historial completo" onPress={() => router.push(`/(tabs)/train/history/exercise/${id}`)} />
        </Surface>
        {exercise.notes ? <><AppText variant="title2">Notas</AppText><Surface><AppText>{exercise.notes}</AppText></Surface></> : null}
      </>}
    </ScrollView>
    {exercise ? <ExerciseEditorModal open={Boolean(editing)} target={{ mode: 'edit', exercise: editing ?? exercise }} createIdempotencyKey={() => ''} pending={library.pending} onClose={() => setEditing(null)} onSave={async mutation => { const error = await library.save(editing ?? exercise, mutation); if (!error) setEditing(null); return error; }} /> : null}
    {exercise && adding ? <ExerciseAddRoutineSheet client={library.client} exercise={exercise} onClose={() => setAdding(false)} onChanged={refresh} onAdded={() => library.announce('Ejercicio agregado a la rutina')} /> : null}
    {library.notice ? <ExerciseNotice {...library.notice} disabled={library.pending} undo={library.notice.undo ? () => void library.status(library.notice!.undo!.exercise, library.notice!.undo!.active) : undefined} /> : null}
  </>;
}
const styles = StyleSheet.create({ content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxxl }, chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }, chip: { borderRadius: radius.chip, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs }, routineRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' }, strip: { width: 4, height: 44, borderRadius: radius.full } });
