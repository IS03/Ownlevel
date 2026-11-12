import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import type { MobileTrainingExercise } from '@/api/exercises';
import { AppIcon, AppText, Chip, ListGroup, TextField, appIconSize, brandTokens, radius, spacing, useOwnlevelTheme, type AppIconName } from '@/design-system';
import { MUSCLE_GROUP_OPTIONS, exerciseSummary } from './exercise-library-model';
import type { RoutineExercisePickerBodyProps } from './routine-exercise-picker-body.types';

// Dynamic Type: from this scale the state moves under the text instead of squeezing the name.
const STACK_FONT_SCALE = 1.3;

/** «Crear…» as its own quiet group: the only champagne label in the list, so it is not mistaken for an exercise. */
function CreateRow({ label, icon, disabled, onPress }: { label: string; icon: AppIconName; disabled: boolean; onPress: () => void }) {
  const { colors } = useOwnlevelTheme();
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surfaceRaised }, disabled && styles.disabled]}>
    <AppIcon color={colors.primary} name={icon} size={appIconSize.row} />
    <AppText style={[styles.text, { color: colors.primary }]} variant="headline">{label}</AppText>
  </Pressable>;
}

function ExerciseRow({ exercise, props }: { exercise: MobileTrainingExercise; props: RoutineExercisePickerBodyProps }) {
  const { colors } = useOwnlevelTheme(), { fontScale } = useWindowDimensions();
  const existing = props.existing.has(exercise.id), selected = props.selected.includes(exercise.id), summary = exerciseSummary(exercise);
  const stateLabel = props.session ? 'En la sesión' : 'En la rutina';
  const adding = props.adding?.id === exercise.id ? props.adding : null;
  const off = props.disabled || existing;
  const trailing = adding ? adding.done ? <AppIcon name="check" size={appIconSize.row} color={colors.primary} /> : <ActivityIndicator color={colors.primary} />
    : existing ? <View style={styles.state}>
      <AppIcon name="check" size={14} color={colors.textMuted} /><AppText muted variant="footnote">{stateLabel}</AppText>
    </View>
      : selected ? <AppIcon name="check" size={appIconSize.row} color={colors.primary} />
        : props.session ? <AppIcon name="plus" size={appIconSize.inline} color={colors.textMuted} /> : null;
  return <Pressable accessibilityRole="button" accessibilityLabel={`${exercise.name}${existing ? `, ${stateLabel}` : selected ? ', seleccionado' : ''}`}
    accessibilityState={{ disabled: off }} disabled={off} onPress={() => props.onToggle(exercise.id)}
    style={({ pressed }) => [styles.row, fontScale > STACK_FONT_SCALE && styles.stacked, pressed && { backgroundColor: colors.surfaceRaised }, props.disabled && styles.disabled]}>
    {/* The full name always wraps; an exercise already in the list reads muted and keeps its label. */}
    <View style={styles.text}>
      <AppText muted={existing} variant="headline">{exercise.name}</AppText>
      {summary ? <AppText muted variant="footnote">{summary}</AppText> : null}
    </View>
    {trailing}
  </Pressable>;
}

export function RoutineExercisePickerBody(props: RoutineExercisePickerBodyProps) {
  const name = props.query.trim(), empty = props.rows.length === 0;
  // Same conditions as before: the session sheet always offers it; the routine picker only when a search found nothing.
  const createLabel = name ? `Crear “${name}”` : 'Crear ejercicio nuevo';
  const create = props.session && props.canCreate ? <CreateRow label={createLabel} icon="edit" disabled={props.disabled} onPress={props.onCreate} />
    : empty && props.canCreate && !props.session && name ? <CreateRow label={createLabel} icon="plus" disabled={props.disabled} onPress={props.onCreate} /> : null;
  const emptyText = empty ? !props.canCreate ? 'Actualizá la biblioteca para continuar.' : props.session || !name ? 'No hay ejercicios disponibles' : null : null;
  return <View style={styles.root}>
    <TextField label="Buscar ejercicio" hideLabel search disabled={props.disabled} placeholder="Buscar ejercicio" value={props.query} onChangeText={props.onQuery} />
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chips}><View style={{ flexDirection: 'row', gap: spacing.sm }}>
      {[{ value: null, label: 'Todos' }, ...MUSCLE_GROUP_OPTIONS].map(option => <Chip key={option.value ?? 'all'} label={option.label} selected={props.group === option.value} onPress={() => props.onGroup(option.value)} disabled={props.disabled} />)}
    </View></ScrollView>
    {/* Results: solid grouped cards (card radius, no glass) over the sheet background; hairlines sit inside the card padding, so they start at the text. */}
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.results}>
      {create ? <ListGroup bordered={false}>{create}</ListGroup> : null}
      {empty ? emptyText ? <ListGroup bordered={false}><View style={styles.row}><AppText muted style={styles.text}>{emptyText}</AppText></View></ListGroup> : null
        : <ListGroup bordered={false}>{props.rows.map(exercise => <ExerciseRow key={exercise.id} exercise={exercise} props={props} />)}</ListGroup>}
    </ScrollView>
  </View>;
}
const styles = StyleSheet.create({
  root: { flex: 1, gap: spacing.sm, paddingHorizontal: spacing.lg },
  chips: { flexGrow: 0 },
  results: { gap: spacing.md, paddingBottom: spacing.lg },
  row: { alignItems: 'center', borderRadius: radius.inner, flexDirection: 'row', gap: spacing.md, minHeight: brandTokens.layout.inputHeight, paddingVertical: spacing.sm },
  stacked: { alignItems: 'flex-start', flexDirection: 'column', gap: spacing.sm },
  text: { flexGrow: 1, flexShrink: 1, gap: 2 },
  state: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs },
  disabled: { opacity: 0.45 },
});
