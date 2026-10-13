import { useState } from 'react';
import { Platform, Pressable, RefreshControl, ScrollView, SectionList, StyleSheet, View } from 'react-native';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import Swipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import { ReduceMotion } from 'react-native-reanimated';
import type { MobileTrainingExercise, MobileTrainingExerciseRoutine } from '@/api/exercises';
import { AppIcon, AppText, Chip, EmptyState, InlineUnavailable, SkeletonBlock, TextField, brandTokens, radius, spacing, useOwnlevelTheme } from '@/design-system';
import { ExerciseEditorModal, type ExerciseEditorTarget } from './exercise-editor-modal';
import { ExerciseFilterModal } from './exercise-filter-modal';
import { activeFilterCount, DEFAULT_EXERCISE_LIBRARY_FILTERS, exerciseSummary, filterExercises, groupExercises, MUSCLE_GROUP_OPTIONS, toggleValue, type ExerciseLibraryFilters } from './exercise-library-model';
import { TrainingContextMenu } from './routine-context-menu';
import { RoutineSheetButton } from './routine-sheet-button';
import { ExerciseAddRoutineSheet } from './exercise-add-routine-sheet';
import { ExerciseNotice } from './exercise-notice';
import { useExerciseLibrary } from './use-exercise-library';
import { trainingRoutineColor } from './routine-colors';
function ExerciseRow({ exercise, routines, disabled, onOpen, onEdit, onAdd, onStatus, first, last }: {
  exercise: MobileTrainingExercise; routines: MobileTrainingExerciseRoutine[]; disabled: boolean; onOpen: () => void; onEdit: () => void; onAdd: () => void; onStatus: () => void; first: boolean; last: boolean;
}) {
  const { colors, isDark } = useOwnlevelTheme(), [width, setWidth] = useState(0);
  const assigned = exercise.routineIds.map(id => routines.find(routine => routine.id === id)).filter((routine): routine is MobileTrainingExerciseRoutine => Boolean(routine));
  return <View onLayout={event => setWidth(event.nativeEvent.layout.width)} style={[styles.rowClip, { marginHorizontal: spacing.lg, backgroundColor: colors.surface, borderTopLeftRadius: first ? radius.card : 0, borderTopRightRadius: first ? radius.card : 0, borderBottomLeftRadius: last ? radius.card : 0, borderBottomRightRadius: last ? radius.card : 0 }]}>
    <Swipeable enabled={!disabled} overshootRight={false} animationOptions={{ ...brandTokens.motion.spring, reduceMotion: ReduceMotion.System }} childrenContainerStyle={{ backgroundColor: colors.surface }}
      renderRightActions={() => <Pressable accessibilityRole="button" accessibilityLabel={`${exercise.isActive ? 'Archivar' : 'Restaurar'} ${exercise.name}`} disabled={disabled} onPress={onStatus} style={[styles.swipe, { backgroundColor: colors.surfaceRaised }]}>
        <AppIcon name="archive" color={colors.text} size={20} /><AppText variant="footnote">{exercise.isActive ? 'Archivar' : 'Restaurar'}</AppText></Pressable>}>
      <TrainingContextMenu name={exercise.name} width={width} disabled={disabled} onOpen={onOpen} actions={[
        ...(exercise.isActive ? [{ label: 'Agregar a una rutina', symbol: 'plus' as const, onPress: onAdd }] : []), { label: 'Editar', symbol: 'pencil', onPress: onEdit },
        { label: exercise.isActive ? 'Archivar' : 'Restaurar', symbol: 'archivebox', onPress: onStatus, separated: true }]}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Abrir ${exercise.name}`} disabled={disabled} onPress={onOpen} testID={`exercise-row-${exercise.id}`}
          accessibilityActions={[{ name: 'edit', label: 'Editar' }, { name: 'status', label: exercise.isActive ? 'Archivar' : 'Restaurar' }, ...(exercise.isActive ? [{ name: 'add', label: 'Agregar a una rutina' }] : [])]}
          onAccessibilityAction={event => { if (disabled) return; if (event.nativeEvent.actionName === 'edit') onEdit(); else if (event.nativeEvent.actionName === 'status') onStatus(); else if (event.nativeEvent.actionName === 'add' && exercise.isActive) onAdd(); }}
          style={({ pressed }) => [styles.row, { backgroundColor: pressed ? colors.surfaceRaised : colors.surface, borderColor: colors.border, borderTopWidth: first ? 0 : StyleSheet.hairlineWidth }]}>
          <View style={{ flex: 1, gap: spacing.xs }}><AppText variant="headline" testID="exercise-name">{exercise.name}</AppText>{exerciseSummary(exercise) ? <AppText muted variant="footnote">{exerciseSummary(exercise)}</AppText> : null}</View>
          {assigned.length ? <View accessible accessibilityLabel={`En ${assigned.map(routine => routine.name).join(' y ')}`} style={styles.dots}>
            {assigned.slice(0, 3).map(routine => <View key={routine.id} style={[styles.dot, { backgroundColor: routine.color ? trainingRoutineColor(routine.color, isDark) : colors.textMuted }]} />)}
            {assigned.length > 3 ? <AppText numeric muted variant="caption">+{assigned.length - 3}</AppText> : null}</View> : null}
          <AppIcon name="chevronRight" color={colors.textMuted} size={20} />
        </Pressable>
      </TrainingContextMenu>
    </Swipeable>
  </View>;
}
export function ExerciseLibraryScreen({ createIdempotencyKey = () => globalThis.crypto?.randomUUID?.() ?? `exercise-${Date.now()}-${Math.random()}` }: { createIdempotencyKey?: () => string }) {
  const library = useExerciseLibrary(), router = useRouter(), { colors } = useOwnlevelTheme();
  const [query, setQuery] = useState(''), [filters, setFilters] = useState<ExerciseLibraryFilters>(DEFAULT_EXERCISE_LIBRARY_FILTERS), [filtersOpen, setFiltersOpen] = useState(false);
  const [editor, setEditor] = useState<ExerciseEditorTarget | null>(null), [adding, setAdding] = useState<MobileTrainingExercise | null>(null);
  const { refresh, runRefresh } = library;
  useFocusEffect(runRefresh);
  const visible = filterExercises(library.exercises, query, filters), sections = groupExercises(visible).map(group => ({ ...group, data: group.exercises }));
  const disabled = library.pending || Boolean(editor || filtersOpen || adding);
  const header = <><Stack.Screen options={{ title: 'Ejercicios', headerSearchBarOptions: Platform.OS === 'ios' ? { placeholder: 'Buscar ejercicio o músculo', hideWhenScrolling: false, hideNavigationBar: false, onChangeText: event => setQuery(event.nativeEvent.text), onCancelButtonPress: () => setQuery('') } : undefined, headerLargeTitleEnabled: Platform.OS === 'ios', headerLargeTitleStyle: { color: colors.text }, headerStyle: { backgroundColor: Platform.OS === 'ios' ? 'transparent' : colors.background }, headerLargeStyle: { backgroundColor: 'transparent' },
    headerRight: Platform.OS === 'ios' ? undefined : () => <RoutineSheetButton label="Nuevo ejercicio" icon="plus" accent disabled={disabled} onPress={() => setEditor({ mode: 'create' })} /> }} />
    {Platform.OS === 'ios' ? <Stack.Toolbar placement="right"><Stack.Toolbar.Button icon="line.3.horizontal.decrease" accessibilityLabel={`Filtros, ${activeFilterCount(filters)} activos`} separateBackground tintColor={activeFilterCount(filters) ? colors.primary : colors.textMuted} disabled={disabled} onPress={() => setFiltersOpen(true)}>{activeFilterCount(filters) ? <Stack.Toolbar.Badge style={{ color: colors.primary, backgroundColor: colors.brandSubtle }}>{String(activeFilterCount(filters))}</Stack.Toolbar.Badge> : null}</Stack.Toolbar.Button><Stack.Toolbar.Button icon="plus" accessibilityLabel="Nuevo ejercicio" separateBackground tintColor={colors.primary} disabled={disabled} onPress={() => setEditor({ mode: 'create' })} /></Stack.Toolbar> : null}</>;
  return <>{header}<SectionList sections={sections} stickySectionHeadersEnabled contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled" style={{ backgroundColor: colors.background, flex: 1 }}
    contentContainerStyle={{ paddingBottom: spacing.xxxl }} testID="exercise-library-screen" keyExtractor={exercise => exercise.id}
    refreshControl={<RefreshControl refreshing={library.state.status === 'ready' && library.state.refreshing} onRefresh={() => { if (!disabled) void refresh(); }} tintColor={colors.primary} />}
    ListHeaderComponent={<View style={styles.searchArea}>
      {Platform.OS !== 'ios' ? <AppText variant="largeTitle">Ejercicios</AppText> : null}
      {library.catalog ? <AppText numeric muted variant="subheadline" style={{ textAlign: 'right' }}>{visible.length} {visible.length === 1 ? 'ejercicio' : 'ejercicios'}</AppText> : null}
      {Platform.OS !== 'ios' ? <View style={styles.search}><TextField label="Buscar ejercicio o músculo" hideLabel search placeholder="Buscar ejercicio o músculo" value={query} onChangeText={setQuery} style={{ flex: 1 }} />
        <Pressable accessibilityRole="button" accessibilityLabel={`Filtros, ${activeFilterCount(filters)} activos`} onPress={() => setFiltersOpen(true)} disabled={disabled} style={[styles.filter, { backgroundColor: colors.surfaceRaised }]}>
          <AppIcon name="filter" size={20} color={colors.textMuted} />{activeFilterCount(filters) ? <AppText numeric variant="caption">{activeFilterCount(filters)}</AppText> : null}</Pressable></View> : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        <Chip kind="toggle" label="Todos" selected={!filters.muscleGroups.length} onPress={() => setFilters(previous => ({ ...previous, muscleGroups: [] }))} />
        {[...MUSCLE_GROUP_OPTIONS, { value: 'none' as const, label: 'Sin clasificar' }].map(group => <Chip kind="toggle" key={group.value} label={group.label} selected={filters.muscleGroups.includes(group.value)} onPress={() => setFilters(previous => ({ ...previous, muscleGroups: toggleValue(previous.muscleGroups, group.value) }))} />)}
      </ScrollView>
      {library.current && library.stale ? <InlineUnavailable message="Mostramos la última lectura confirmada." actionLabel="Reintentar" onAction={() => void refresh()} /> : null}
    </View>}
    ListEmptyComponent={<View style={{ padding: spacing.lg }}>{!library.current && library.state.status === 'loading' ? <View testID="exercise-library-loading"><SkeletonBlock height={100} /></View> : !library.catalog ? <InlineUnavailable message="Biblioteca no disponible" actionLabel="Reintentar" onAction={() => void refresh()} /> : <EmptyState title={library.exercises.length ? 'Sin resultados' : 'No tenés ejercicios'} description={library.exercises.length ? 'Probá otra búsqueda o cambiá los filtros.' : 'Creá un ejercicio para sumarlo a tus rutinas.'} />}</View>}
    renderSectionHeader={({ section }) => <View style={[styles.section, { backgroundColor: colors.background }]}><AppText variant="headline">{section.label}</AppText><AppText numeric muted variant="footnote">{section.data.length}</AppText></View>}
    renderItem={({ item, index, section }) => <ExerciseRow exercise={item} routines={library.routines} disabled={disabled} first={index === 0} last={index === section.data.length - 1}
      onOpen={() => router.push({ pathname: '/(tabs)/train/exercises/[id]', params: { id: item.id } })} onEdit={() => setEditor({ mode: 'edit', exercise: item })}
      onAdd={() => setAdding(item)} onStatus={() => void library.status(item)} />} />
    {filtersOpen ? <ExerciseFilterModal filters={filters} exercises={library.exercises} query={query} onClose={() => setFiltersOpen(false)} onApply={next => { setFilters(next); setFiltersOpen(false); }} /> : null}
    {editor ? <ExerciseEditorModal target={editor} pending={library.pending} createIdempotencyKey={createIdempotencyKey} onClose={() => setEditor(null)} onSave={async (mutation, _ids, key) => {
      const error = await library.save(editor.mode === 'edit' ? editor.exercise : undefined, mutation, key); if (!error) setEditor(null); return error;
    }} /> : null}
    {adding ? <ExerciseAddRoutineSheet client={library.client} exercise={library.exercises.find(exercise => exercise.id === adding.id) ?? adding} onClose={() => setAdding(null)} onChanged={refresh} onAdded={() => library.announce('Ejercicio agregado a la rutina')} /> : null}
    {library.notice ? <ExerciseNotice {...library.notice} disabled={library.pending} undo={library.notice.undo ? () => void library.status(library.notice!.undo!.exercise, library.notice!.undo!.active) : undefined} /> : null}
  </>;
}
const styles = StyleSheet.create({ searchArea: { padding: spacing.lg, gap: spacing.sm }, search: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, filter: { height: 48, minWidth: 44, borderRadius: radius.input, alignItems: 'center', justifyContent: 'center' }, chips: { gap: spacing.sm, paddingVertical: spacing.xs }, section: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.sm }, row: { minHeight: 64, flexDirection: 'row', alignItems: 'center', padding: spacing.md, gap: spacing.sm }, rowClip: { overflow: 'hidden' }, dots: { flexDirection: 'row', gap: spacing.xs, alignItems: 'center' }, dot: { width: 6, height: 6, borderRadius: radius.full }, swipe: { width: 88, alignItems: 'center', justifyContent: 'center', gap: spacing.xs } });
