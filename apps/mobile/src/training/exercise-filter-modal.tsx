import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions, type StyleProp, type ViewStyle } from 'react-native';
import type { MobileTrainingExercise, MobileTrainingExerciseRoutine } from '@/api/exercises';
import { AppIcon, AppText, Button, GlassSurface, brandTokens, pressedStyle, radius, spacing, useOwnlevelTheme, useReduceMotion } from '@/design-system';
import { RoutineFormSheet } from './routine-form-sheet';
import { RoutineSheetButton } from './routine-sheet-button';
import { ExerciseSegmented } from './exercise-segmented';
import { cloneFilters, DEFAULT_EXERCISE_LIBRARY_FILTERS, EXERCISE_IMPLEMENT_OPTIONS, filterExercises, implementOptions, toggleValue, type ExerciseLibraryFilters } from './exercise-library-model';
type FilterProps = {
  filters: ExerciseLibraryFilters; exercises: MobileTrainingExercise[]; query: string; routines?: MobileTrainingExerciseRoutine[];
  onApply: (filters: ExerciseLibraryFilters) => void; onClose: () => void;
};
/** Stays mounted; the draft lives inside the sheet, so each presentation starts from the applied filters. */
export function ExerciseFilterModal({ open = true, ...props }: FilterProps & { open?: boolean }) {
  return <RoutineFormSheet open={open} pending={false} onClose={props.onClose}><ExerciseFilterForm {...props} /></RoutineFormSheet>;
}
function ExerciseFilterForm({ filters, exercises, query, onApply, onClose, style }: FilterProps & { style?: StyleProp<ViewStyle> }) {
  const [draft, setDraft] = useState(() => cloneFilters(filters));
  const { colors } = useOwnlevelTheme(), { height } = useWindowDimensions(), reduceMotion = useReduceMotion();
  const options = [...new Set([...EXERCISE_IMPLEMENT_OPTIONS, ...implementOptions(exercises)])];
  const count = filterExercises(exercises, query, draft).length;
  return <View style={[styles.root, style]} testID="exercise-filters">
    <View style={styles.header}><View style={styles.side}><GlassSurface interactive style={styles.clearShape}>
      <Pressable accessibilityRole="button" accessibilityLabel="Limpiar" onPress={() => setDraft({ ...cloneFilters(DEFAULT_EXERCISE_LIBRARY_FILTERS), muscleGroups: [...draft.muscleGroups] })}
        style={({ pressed }) => [styles.clear, pressedStyle(pressed, reduceMotion)]}><AppText variant="subheadline">Limpiar</AppText></Pressable></GlassSurface></View>
      <AppText variant="headline" style={{ flex: 1, textAlign: 'center' }}>Filtros</AppText><View style={[styles.side, { alignItems: 'flex-end' }]}><RoutineSheetButton label="Cerrar filtros" icon="close" onPress={onClose} /></View></View>
    <ScrollView style={{ maxHeight: height * 0.52 }} contentContainerStyle={styles.content}>
      <AppText variant="headline">Mostrar</AppText><ExerciseSegmented accessibilityLabel="Estado" value={draft.status} options={[{ value: 'active', label: 'Activos' }, { value: 'archived', label: 'Archivados' }, { value: 'all', label: 'Todos' }]} onChange={status => setDraft(previous => ({ ...previous, status }))} />
      <AppText variant="headline" style={styles.label}>En rutinas</AppText><ExerciseSegmented accessibilityLabel="Uso en rutinas" value={draft.usage} options={[{ value: 'any', label: 'Todos' }, { value: 'assigned', label: 'En alguna' }, { value: 'unassigned', label: 'En ninguna' }]} onChange={usage => setDraft(previous => ({ ...previous, usage, routineIds: [] }))} />
      <AppText variant="headline" style={styles.label}>Implemento</AppText>
      <View style={[styles.group, { backgroundColor: colors.surface }]}>{options.map((label, index) => {
        const selected = draft.implements.includes(label);
        return <Pressable key={label} accessibilityRole="button" accessibilityLabel={`${label}${selected ? ', seleccionado' : ''}`} onPress={() => setDraft(previous => ({ ...previous, implements: toggleValue(previous.implements, label) }))}
          style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surfaceRaised }]}>
          {index > 0 ? <View style={[styles.separator, { backgroundColor: colors.border }]} /> : null}
          <AppText variant="body" style={{ flex: 1 }}>{label}</AppText>{selected ? <AppIcon name="checkmark" size={15} color={colors.primary} /> : null}
        </Pressable>;
      })}</View>
    </ScrollView><View style={styles.footer}><Button numeric label={`Ver ${count} ${count === 1 ? 'ejercicio' : 'ejercicios'}`} onPress={() => onApply(draft)} /></View>
  </View>;
}
const styles = StyleSheet.create({ root: { paddingBottom: spacing.lg }, header: { flexDirection: 'row', alignItems: 'center', padding: spacing.lg, gap: spacing.sm }, side: { width: 96 },
  clearShape: { borderRadius: radius.full, alignSelf: 'flex-start' }, clear: { height: brandTokens.layout.minTouch, borderRadius: radius.full, paddingHorizontal: spacing.lg, alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-start' },
  content: { paddingHorizontal: spacing.lg, gap: spacing.sm, paddingBottom: spacing.sm }, label: { marginTop: spacing.sm },
  group: { borderRadius: radius.card, overflow: 'hidden' }, row: { minHeight: brandTokens.layout.minTouch, flexDirection: 'row', alignItems: 'center', paddingHorizontal: brandTokens.layout.cardPadding },
  separator: { position: 'absolute', top: 0, left: brandTokens.layout.cardPadding, right: 0, height: StyleSheet.hairlineWidth },
  footer: { paddingHorizontal: spacing.lg, paddingTop: spacing.md } });
