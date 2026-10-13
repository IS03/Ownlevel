import { useState } from 'react';
import { ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import type { MobileTrainingExercise, MobileTrainingExerciseRoutine } from '@/api/exercises';
import { AppIcon, AppText, Button, ListGroup, ListRow, SegmentedControl, spacing, useOwnlevelTheme } from '@/design-system';
import { RoutineFormSheet } from './routine-form-sheet';
import { RoutineSheetButton } from './routine-sheet-button';
import { cloneFilters, DEFAULT_EXERCISE_LIBRARY_FILTERS, EXERCISE_IMPLEMENT_OPTIONS, filterExercises, implementOptions, toggleValue, type ExerciseLibraryFilters } from './exercise-library-model';
export function ExerciseFilterModal({ filters, exercises, query, onApply, onClose }: {
  filters: ExerciseLibraryFilters; exercises: MobileTrainingExercise[]; query: string; routines?: MobileTrainingExerciseRoutine[];
  onApply: (filters: ExerciseLibraryFilters) => void; onClose: () => void;
}) {
  const [draft, setDraft] = useState(() => cloneFilters(filters));
  const { colors } = useOwnlevelTheme(), { height } = useWindowDimensions();
  const options = [...new Set([...EXERCISE_IMPLEMENT_OPTIONS, ...implementOptions(exercises)])];
  const count = filterExercises(exercises, query, draft).length;
  return <RoutineFormSheet open pending={false} onClose={onClose}><View style={styles.root} testID="exercise-filters">
    <View style={styles.header}><View style={{ width: 88 }}><Button variant="quiet" label="Limpiar" onPress={() => setDraft({ ...cloneFilters(DEFAULT_EXERCISE_LIBRARY_FILTERS), muscleGroups: [...draft.muscleGroups] })} /></View>
      <AppText variant="headline" style={{ flex: 1, textAlign: 'center' }}>Filtros</AppText><View style={{ width: 88, alignItems: 'flex-end' }}><RoutineSheetButton label="Cerrar filtros" icon="close" onPress={onClose} /></View></View>
    <ScrollView style={{ maxHeight: height * 0.52 }} contentContainerStyle={styles.content}>
      <AppText variant="headline">Mostrar</AppText><SegmentedControl accessibilityLabel="Estado" value={draft.status} options={[{ value: 'active', label: 'Activos' }, { value: 'archived', label: 'Archivados' }, { value: 'all', label: 'Todos' }]} onChange={status => setDraft(previous => ({ ...previous, status }))} />
      <AppText variant="headline">En rutinas</AppText><SegmentedControl accessibilityLabel="Uso en rutinas" value={draft.usage} options={[{ value: 'any', label: 'Todos' }, { value: 'assigned', label: 'En alguna' }, { value: 'unassigned', label: 'En ninguna' }]} onChange={usage => setDraft(previous => ({ ...previous, usage, routineIds: [] }))} />
      <AppText variant="headline">Implemento</AppText><ListGroup bordered={false} compact>{options.map(label => <ListRow compact key={label} title={label} chevron={false} trailing={draft.implements.includes(label) ? <AppIcon name="checkmark" size={20} color={colors.primary} /> : undefined}
        accessibilityLabel={`${label}${draft.implements.includes(label) ? ', seleccionado' : ''}`} onPress={() => setDraft(previous => ({ ...previous, implements: toggleValue(previous.implements, label) }))} />)}</ListGroup>
    </ScrollView><View style={styles.footer}><Button numeric label={`Ver ${count} ${count === 1 ? 'ejercicio' : 'ejercicios'}`} onPress={() => onApply(draft)} /></View>
  </View></RoutineFormSheet>;
}
const styles = StyleSheet.create({ root: { paddingBottom: spacing.lg }, header: { flexDirection: 'row', alignItems: 'center', padding: spacing.lg, gap: spacing.sm }, content: { paddingHorizontal: spacing.lg, gap: spacing.sm, paddingBottom: spacing.sm }, footer: { paddingHorizontal: spacing.lg, paddingTop: spacing.md } });
