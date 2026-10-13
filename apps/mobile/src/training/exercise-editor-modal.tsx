import { useEffect, useRef, useState } from 'react';
import { Alert, Keyboard, ScrollView, StyleSheet, View, useWindowDimensions, type StyleProp, type ViewStyle } from 'react-native';
import type { MobileTrainingExercise, MobileTrainingExerciseMutation, MobileTrainingExerciseRoutine, MobileTrainingMuscleGroup } from '@/api/exercises';
import { AppText, ListGroup, TextField, spacing } from '@/design-system';
import { RoutineFormSheet } from './routine-form-sheet';
import { RoutineSheetButton } from './routine-sheet-button';
import { ExerciseChoiceMenu } from './exercise-choice-menu';
import { emptyExerciseForm, exerciseFormFromDto, exerciseIdentityMutation, EXERCISE_IMPLEMENT_OPTIONS, EXERCISE_WEIGHT_MODE_OPTIONS, MUSCLE_GROUP_OPTIONS, weightModeHint } from './exercise-library-model';
export type ExerciseEditorTarget = { mode: 'create' } | { mode: 'edit'; exercise: MobileTrainingExercise };
function choices(values: readonly string[], current: string) {
  return [{ value: '', label: 'Sin especificar' }, ...[...new Set(current ? [current, ...values] : values)].map(value => ({ value, label: value }))];
}
type EditorProps = {
  createIdempotencyKey: () => string; onClose: () => void; pending: boolean; target: ExerciseEditorTarget; initialName?: string;
  onSave: (exercise: MobileTrainingExerciseMutation, routineIds: string[], idempotencyKey?: string) => Promise<string | null>;
  onSetStatus?: (exercise: MobileTrainingExercise) => void; routines?: MobileTrainingExerciseRoutine[]; purpose?: 'library' | 'session' | 'routine';
};
/** Keep it mounted and drive `open`: the native sheet then animates out instead of vanishing on unmount.
 * The form lives inside the sheet, so it remounts (fresh values) on every presentation. */
export function ExerciseEditorModal({ open = true, ...props }: EditorProps & { open?: boolean }) {
  const [dirty, setDirty] = useState(false);
  return <RoutineFormSheet open={open} pending={props.pending || dirty} onClose={props.onClose}><ExerciseEditorForm {...props} onDirty={setDirty} /></RoutineFormSheet>;
}
function ExerciseEditorForm({ createIdempotencyKey, onClose, onSave, pending, target, initialName = '', onDirty, style }: EditorProps & { onDirty: (dirty: boolean) => void; style?: StyleProp<ViewStyle> }) {
  const original = target.mode === 'edit' ? target.exercise : undefined;
  const [initial] = useState(() => original ? exerciseFormFromDto(original) : { ...emptyExerciseForm(), name: initialName });
  const [values, setValues] = useState(initial), [error, setError] = useState<string | null>(null);
  const key = useRef<string | undefined>(undefined), sending = useRef(false);
  const { height } = useWindowDimensions();
  const dirty = JSON.stringify(values) !== JSON.stringify(initial);
  useEffect(() => { onDirty(dirty); }, [dirty, onDirty]);
  const change = (field: keyof typeof values, value: string | null) => { setValues(previous => ({ ...previous, [field]: value })); key.current = undefined; setError(null); };
  const close = () => { if (pending || sending.current) return; if (!dirty) { onClose(); return; }
    Alert.alert('Tenés cambios sin guardar', 'Salir ahora descarta los cambios del ejercicio.', [{ text: 'Seguir editando', style: 'cancel' }, { text: 'Salir sin guardar', style: 'destructive', onPress: onClose }]);
  };
  const save = async () => {
    if (pending || sending.current || !values.name.trim()) return;
    sending.current = true;
    try { const mutation = exerciseIdentityMutation(values, original); if (!original) key.current ??= createIdempotencyKey(); Keyboard.dismiss();
      const message = await onSave(mutation, original?.routineIds ?? [], key.current); if (message) setError(message);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No pudimos confirmar el cambio. Reintentá con los mismos datos.'); }
    finally { sending.current = false; }
  };
  return <View style={[styles.sheet, style]} testID="exercise-editor">
    <View style={styles.header}><RoutineSheetButton label="Cerrar ejercicio" icon="close" disabled={pending} onPress={close} />
      <AppText variant="headline" style={styles.title}>{original ? 'Editar ejercicio' : 'Nuevo ejercicio'}</AppText>
      <RoutineSheetButton label={pending ? 'Guardando…' : original ? 'Guardar ejercicio' : 'Crear ejercicio'} icon="checkmark" accent pending={pending} disabled={pending || !values.name.trim() || Boolean(original && !dirty)} onPress={() => void save()} />
    </View>
    <ScrollView automaticallyAdjustKeyboardInsets keyboardShouldPersistTaps="handled" style={{ maxHeight: height * 0.62 }} contentContainerStyle={styles.content}>
      <TextField label="Nombre del ejercicio" hideLabel placeholder="Nombre del ejercicio" autoFocus={!original} value={values.name} disabled={pending} maxLength={120} onChangeText={value => change('name', value)} />
      <ListGroup bordered={false} compact><ExerciseChoiceMenu title="Grupo muscular" value={values.muscleGroup ?? ''} disabled={pending} onChange={value => change('muscleGroup', value as MobileTrainingMuscleGroup || null)}
        options={[{ value: '', label: 'Sin grupo' }, ...MUSCLE_GROUP_OPTIONS]} />
        <View style={styles.muscle}><AppText variant="body">Músculo</AppText><TextField label="Músculo específico" hideLabel placeholder="Opcional" value={values.muscleGroupLabel} disabled={pending} maxLength={120} style={{ flex: 1 }} inputStyle={styles.inline} onChangeText={value => change('muscleGroupLabel', value)} /></View>
        <ExerciseChoiceMenu title="Implemento" value={values.implement} options={choices(EXERCISE_IMPLEMENT_OPTIONS, values.implement)} disabled={pending} onChange={value => change('implement', value)} />
        <ExerciseChoiceMenu title="Peso que anotás" value={values.weightMode} options={choices(EXERCISE_WEIGHT_MODE_OPTIONS, values.weightMode)} disabled={pending} onChange={value => change('weightMode', value)} />
      </ListGroup>
      {weightModeHint(values.weightMode) ? <AppText muted variant="footnote">{weightModeHint(values.weightMode)}</AppText> : null}
      <TextField label="Notas" hideLabel placeholder="Notas: técnica, agarre o posición" multiline maxLength={1000} value={values.notes} disabled={pending} onChangeText={value => change('notes', value)} />
      {error ? <AppText accessibilityRole="alert" variant="footnote">{error}</AppText> : null}
    </ScrollView>
  </View>;
}
const styles = StyleSheet.create({ sheet: { paddingBottom: spacing.lg }, header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg }, title: { flex: 1, textAlign: 'center' }, content: { paddingHorizontal: spacing.lg, gap: spacing.md }, muscle: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 48 },
  inline: { backgroundColor: 'transparent', borderWidth: 0, paddingHorizontal: 0, textAlign: 'right' } });
