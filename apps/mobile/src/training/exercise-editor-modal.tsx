import { useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type {
  MobileTrainingExercise,
  MobileTrainingExerciseMutation,
  MobileTrainingExerciseRoutine,
  MobileTrainingMuscleGroup,
} from '@/api/exercises';
import {
  AppIcon,
  AppText,
  Button,
  Heading,
  Surface,
  TextField,
  radius,
  sizes,
  spacing,
  useOwnlevelTheme,
} from '@/design-system';

import {
  emptyExerciseForm,
  exerciseFormFromDto,
  exerciseMutationFromForm,
  EXERCISE_IMPLEMENT_OPTIONS,
  EXERCISE_WEIGHT_MODE_OPTIONS,
  type ExerciseFormValues,
  MUSCLE_GROUP_OPTIONS,
  toggleValue,
} from './exercise-library-model';

type EditorTarget = { mode: 'create' } | { mode: 'edit'; exercise: MobileTrainingExercise };
type TaxonomyPicker = 'muscleGroup' | 'implement' | 'weightMode';
type TaxonomyOption = { value: string | null; label: string };

function SectionTitle({ number, subtitle, title }: { number: number; subtitle: string; title: string }) {
  const { colors } = useOwnlevelTheme();
  return (
    <View style={styles.sectionTitle}>
      <View style={[styles.sectionNumber, { backgroundColor: colors.brandSubtle }]}>
        <AppText style={{ color: colors.primary }} variant="label">{number}</AppText>
      </View>
      <View style={styles.sectionTitleCopy}>
        <AppText variant="label">{title}</AppText>
        <AppText muted variant="caption">{subtitle}</AppText>
      </View>
    </View>
  );
}

function Field({
  keyboardType,
  label,
  multiline,
  onChangeText,
  placeholder,
  value,
}: {
  keyboardType?: 'decimal-pad' | 'number-pad' | 'numbers-and-punctuation';
  label: string;
  multiline?: boolean;
  onChangeText: (value: string) => void;
  placeholder?: string;
  value: string;
}) {
  return (
    <TextField
      keyboardType={keyboardType}
      label={label}
      multiline={multiline}
      numeric={Boolean(keyboardType)}
      onChangeText={onChangeText}
      placeholder={placeholder}
      value={value}
    />
  );
}

function SelectField({
  label,
  onPress,
  valueLabel,
}: {
  label: string;
  onPress: () => void;
  valueLabel: string;
}) {
  const { colors } = useOwnlevelTheme();
  return (
    <View style={styles.field}>
      <AppText variant="caption">{label}</AppText>
      <Pressable
        accessibilityLabel={`${label}: ${valueLabel}`}
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed }) => [
          styles.selectField,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            opacity: pressed ? 0.7 : 1,
          },
        ]}
      >
        <AppText numberOfLines={1} style={styles.selectFieldValue}>{valueLabel}</AppText>
        <AppIcon color={colors.textMuted} name="chevronRight" size={18} />
      </Pressable>
    </View>
  );
}

function TaxonomyPickerView({
  onClose,
  onSelect,
  options,
  selected,
  title,
}: {
  onClose: () => void;
  onSelect: (value: string | null) => void;
  options: readonly TaxonomyOption[];
  selected: string | null;
  title: string;
}) {
  const { colors } = useOwnlevelTheme();
  return (
    <View style={styles.screen} testID="taxonomy-picker">
      <View style={styles.pickerHeader}>
        <Heading level={2}>{title}</Heading>
        <Pressable
          accessibilityLabel="Cerrar selector sin cambiar"
          accessibilityRole="button"
          onPress={onClose}
          style={styles.closeButton}
        >
          <AppText style={styles.closeLabel}>×</AppText>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.pickerContent}>
        {options.map((option) => {
          const checked = option.value === selected;
          return (
            <Pressable
              accessibilityRole="radio"
              accessibilityState={{ checked }}
              key={option.value ?? 'none'}
              onPress={() => onSelect(option.value)}
              style={({ pressed }) => [
                styles.pickerOption,
                {
                  backgroundColor: checked ? colors.brandSubtle : colors.surface,
                  borderColor: checked ? colors.primary : colors.border,
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
            >
              <AppText style={checked ? { color: colors.primary } : undefined} variant="label">
                {option.label}
              </AppText>
              {checked ? <AppIcon color={colors.primary} name="check" size={20} /> : null}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

function RoutineChoices({
  editing,
  onChange,
  routines,
  selected,
}: {
  editing: boolean;
  onChange: (ids: string[]) => void;
  routines: MobileTrainingExerciseRoutine[];
  selected: string[];
}) {
  const { colors } = useOwnlevelTheme();
  return (
    <View accessibilityLabel={editing ? 'Usado en rutinas' : 'Agregar a rutina'} style={styles.choiceGrid}>
      {!editing ? (
        <Pressable
          accessibilityRole="radio"
          accessibilityState={{ checked: selected.length === 0 }}
          onPress={() => onChange([])}
          style={[
            styles.choice,
            {
              backgroundColor: selected.length === 0 ? colors.brandSubtle : colors.surface,
              borderColor: selected.length === 0 ? colors.primary : colors.border,
            },
          ]}
        >
          <AppText variant="caption">Ninguna</AppText>
        </Pressable>
      ) : null}
      {routines.map((routine) => {
        const checked = selected.includes(routine.id);
        return (
          <Pressable
            accessibilityRole={editing ? 'checkbox' : 'radio'}
            accessibilityState={{ checked }}
            key={routine.id}
            onPress={() => onChange(
              editing ? toggleValue(selected, routine.id) : checked ? [] : [routine.id],
            )}
            style={[
              styles.choice,
              {
                backgroundColor: checked ? colors.brandSubtle : colors.surface,
                borderColor: checked ? colors.primary : colors.border,
              },
            ]}
          >
            <AppText numberOfLines={2} variant="caption">{routine.name}</AppText>
          </Pressable>
        );
      })}
      {routines.length === 0 ? (
        <AppText muted variant="caption">No hay rutinas activas.</AppText>
      ) : null}
    </View>
  );
}

function textChoices(values: readonly string[], current: string) {
  const all = current && !values.includes(current) ? [current, ...values] : [...values];
  return [{ value: '', label: 'Sin especificar' }, ...all.map((value) => ({ value, label: value }))];
}

export function ExerciseEditorModal({
  createIdempotencyKey,
  onClose,
  onSave,
  onSetStatus,
  pending,
  routines,
  target,
  purpose = 'library',
  initialName = '',
}: {
  createIdempotencyKey: () => string;
  onClose: () => void;
  onSave: (
    exercise: MobileTrainingExerciseMutation,
    routineIds: string[],
    idempotencyKey?: string,
  ) => Promise<string | null>;
  onSetStatus: (exercise: MobileTrainingExercise) => void;
  pending: boolean;
  routines: MobileTrainingExerciseRoutine[];
  target: EditorTarget;
  purpose?: 'library' | 'session' | 'routine';
  initialName?: string;
}) {
  const editing = target.mode === 'edit';
  const exercise = editing ? target.exercise : null;
  const { colors } = useOwnlevelTheme();
  const [values, setValues] = useState<ExerciseFormValues>(() =>
    exercise ? exerciseFormFromDto(exercise) : { ...emptyExerciseForm(), name: initialName },
  );
  const [routineIds, setRoutineIds] = useState<string[]>(() => exercise?.routineIds ?? []);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [activePicker, setActivePicker] = useState<TaxonomyPicker | null>(null);
  const [error, setError] = useState<string | null>(null);
  const submissionKey = useRef<string | null>(null);

  const changeValues = (next: ExerciseFormValues) => {
    setValues(next);
    setError(null);
    submissionKey.current = null;
  };
  const changeRoutineIds = (next: string[]) => {
    setRoutineIds(next);
    setError(null);
    submissionKey.current = null;
  };

  const save = async () => {
    if (pending) return;
    let mutation: MobileTrainingExerciseMutation;
    try {
      mutation = exerciseMutationFromForm(values);
      if (purpose === 'session' && (mutation.suggestedSets ?? 1) > 50) throw new Error('La sesión admite hasta 50 series por ejercicio.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Revisá los valores del ejercicio.');
      return;
    }
    const key = editing ? undefined : submissionKey.current ?? createIdempotencyKey();
    if (purpose === 'session') Keyboard.dismiss();
    if (!editing) submissionKey.current = key ?? null;
    const saveError = await onSave(mutation, routineIds, key);
    if (saveError) setError(saveError);
  };

  const implementChoices = textChoices(EXERCISE_IMPLEMENT_OPTIONS, values.implement);
  const weightChoices = textChoices(EXERCISE_WEIGHT_MODE_OPTIONS, values.weightMode);
  const muscleChoices: TaxonomyOption[] = [
    { value: null, label: 'Sin grupo' },
    ...MUSCLE_GROUP_OPTIONS,
  ];
  const muscleLabel = muscleChoices.find((option) => option.value === values.muscleGroup)?.label
    ?? 'Sin grupo';
  const activePickerConfig = activePicker === 'muscleGroup'
    ? {
        title: 'Grupo muscular',
        selected: values.muscleGroup,
        options: muscleChoices,
      }
    : activePicker === 'implement'
      ? {
          title: 'Implemento',
          selected: values.implement,
          options: implementChoices,
        }
      : activePicker === 'weightMode'
        ? {
            title: 'Registro de carga',
            selected: values.weightMode,
            options: weightChoices,
          }
        : null;

  const selectTaxonomy = (value: string | null) => {
    if (activePicker === 'muscleGroup') {
      changeValues({ ...values, muscleGroup: value as MobileTrainingMuscleGroup | null });
    } else if (activePicker === 'implement') {
      changeValues({ ...values, implement: value ?? '' });
    } else if (activePicker === 'weightMode') {
      changeValues({ ...values, weightMode: value ?? '' });
    }
    setActivePicker(null);
  };

  return (
    <Modal
      animationType="slide"
      onRequestClose={pending ? undefined : onClose}
      presentationStyle="pageSheet"
    >
      <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]}>
        {activePickerConfig ? (
          <TaxonomyPickerView
            onClose={() => setActivePicker(null)}
            onSelect={selectTaxonomy}
            options={activePickerConfig.options}
            selected={activePickerConfig.selected}
            title={activePickerConfig.title}
          />
        ) : (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.screen}
        >
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <Heading level={2}>{editing ? 'Editar ejercicio' : 'Nuevo ejercicio'}</Heading>
              <AppText muted variant="caption">
                {editing
                  ? 'Actualizá la configuración del ejercicio.'
                  : purpose === 'session' ? 'Se agregará a tu biblioteca y a esta sesión.' : 'Agregalo a tu biblioteca para usarlo cuando lo necesites.'}
              </AppText>
            </View>
            <Pressable
              accessibilityLabel="Cerrar formulario de ejercicio"
              accessibilityRole="button"
              disabled={pending}
              onPress={onClose}
              style={styles.closeButton}
            >
              <AppText style={styles.closeLabel}>×</AppText>
            </Pressable>
          </View>

          <ScrollView
            pointerEvents={purpose === 'session' && pending ? 'none' : 'auto'}
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
          >
            <View style={[styles.section, styles.numberedSection, { borderBottomColor: colors.border }]}>
              <SectionTitle number={1} subtitle="Datos básicos del ejercicio." title="Información" />
              <Field
                label="Nombre"
                onChangeText={(name) => changeValues({ ...values, name })}
                placeholder="Ej: Press banca"
                value={values.name}
              />
              <SelectField
                label="Grupo muscular"
                onPress={() => setActivePicker('muscleGroup')}
                valueLabel={muscleLabel}
              />
            </View>

            <View style={[styles.section, styles.numberedSection, { borderBottomColor: colors.border }]}>
              <SectionTitle number={2} subtitle="Definí los detalles del ejercicio." title="Configuración" />
              <Field
                label="Músculo específico"
                onChangeText={(muscleGroupLabel) => changeValues({ ...values, muscleGroupLabel })}
                placeholder="Ej: Pectoral mayor"
                value={values.muscleGroupLabel}
              />
              <SelectField
                label="Implemento"
                onPress={() => setActivePicker('implement')}
                valueLabel={values.implement || 'Sin especificar'}
              />
              <SelectField
                label="Registro de carga"
                onPress={() => setActivePicker('weightMode')}
                valueLabel={values.weightMode || 'Sin especificar'}
              />
            </View>

            <View style={[styles.section, styles.numberedSection, { borderBottomColor: colors.border }]}>
              <SectionTitle
                number={3}
                subtitle={purpose === 'session' ? 'Se usarán al agregarlo a esta sesión.' : 'Se usarán al agregar este ejercicio a una rutina.'}
                title="Valores por defecto"
              />
              <View style={styles.inputGrid}>
                <Field label="Series" keyboardType="number-pad" onChangeText={(suggestedSets) => changeValues({ ...values, suggestedSets })} placeholder="Ej: 3" value={values.suggestedSets} />
                <Field label="Reps" keyboardType="number-pad" onChangeText={(suggestedReps) => changeValues({ ...values, suggestedReps })} placeholder="Ej: 10" value={values.suggestedReps} />
                <Field label="Peso" keyboardType="decimal-pad" onChangeText={(suggestedWeight) => changeValues({ ...values, suggestedWeight })} placeholder="Ej: 60" value={values.suggestedWeight} />
                <Field label="RIR" keyboardType="number-pad" onChangeText={(suggestedRir) => changeValues({ ...values, suggestedRir })} placeholder="Ej: 2" value={values.suggestedRir} />
                <Field keyboardType="numbers-and-punctuation" label="Descanso mínimo" onChangeText={(suggestedRestMin) => changeValues({ ...values, suggestedRestMin })} placeholder="Ej: 1:30" value={values.suggestedRestMin} />
                <Field keyboardType="numbers-and-punctuation" label="Descanso máximo" onChangeText={(suggestedRestMax) => changeValues({ ...values, suggestedRestMax })} placeholder="Ej: 2:00" value={values.suggestedRestMax} />
              </View>
            </View>

            {purpose === 'library' ? <View style={[styles.section, styles.numberedSection, { borderBottomColor: colors.border }]}>
              <SectionTitle
                number={4}
                subtitle={editing ? 'Gestioná dónde se utiliza actualmente.' : 'Seleccioná una rutina para tenerlo más a mano.'}
                title={editing ? 'Usado en rutinas' : 'Agregar a rutina (opcional)'}
              />
              <RoutineChoices
                editing={editing}
                onChange={changeRoutineIds}
                routines={routines}
                selected={routineIds}
              />
            </View> : null}

            <View style={styles.section}>
              <Pressable
                accessibilityLabel={`${advancedOpen ? 'Contraer' : 'Expandir'} Opciones avanzadas`}
                accessibilityRole="button"
                accessibilityState={{ expanded: advancedOpen }}
                onPress={() => setAdvancedOpen((value) => !value)}
                style={styles.advancedHeader}
              >
                <AppText variant="label">Opciones avanzadas</AppText>
                <AppText muted>{advancedOpen ? '−' : '+'}</AppText>
              </Pressable>
              {advancedOpen ? (
                <Field
                  label="Notas"
                  multiline
                  onChangeText={(notes) => changeValues({ ...values, notes })}
                  placeholder="Notas opcionales"
                  value={values.notes}
                />
              ) : null}
            </View>

            {exercise ? (
              <View style={styles.section}>
                <Button
                  disabled={pending}
                  label={exercise.isActive ? 'Archivar ejercicio' : 'Restaurar ejercicio'}
                  onPress={() => onSetStatus(exercise)}
                  variant="secondary"
                />
                <AppText muted style={styles.centerText} variant="caption">
                  Las sesiones y registros anteriores siempre se conservan.
                </AppText>
              </View>
            ) : null}

            {error ? (
              <AppText accessibilityRole="alert" style={{ color: colors.danger }} variant="caption">
                {error}
              </AppText>
            ) : null}
          </ScrollView>

          <Surface style={styles.footer}>
            <Button
              disabled={pending}
              label={pending ? (editing ? 'Guardando…' : 'Creando…') : editing ? 'Guardar cambios' : purpose === 'session' ? 'Crear y agregar' : 'Crear ejercicio'}
              onPress={() => void save()}
            />
          </Surface>
        </KeyboardAvoidingView>
        )}
      </SafeAreaView>
    </Modal>
  );
}

export type { EditorTarget as ExerciseEditorTarget };

const styles = StyleSheet.create({
  advancedHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: sizes.touchTarget,
  },
  centerText: { textAlign: 'center' },
  choice: {
    alignItems: 'center',
    borderRadius: radius.pill,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: sizes.touchTarget,
    paddingHorizontal: spacing.md,
    width: '48.5%',
  },
  choiceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  closeButton: {
    alignItems: 'center',
    height: sizes.touchTarget,
    justifyContent: 'center',
    width: sizes.touchTarget,
  },
  closeLabel: { fontSize: 28, fontWeight: '300', lineHeight: 30 },
  content: { gap: spacing.xl, padding: spacing.lg },
  field: { flex: 1, gap: spacing.xs, minWidth: '46%' },
  footer: {
    borderBottomWidth: 0,
    borderLeftWidth: 0,
    borderRadius: 0,
    borderRightWidth: 0,
    padding: spacing.md,
  },
  header: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.lg,
    paddingBottom: spacing.sm,
  },
  headerCopy: { flex: 1, gap: spacing.xs, minWidth: 0 },
  input: {
    borderRadius: radius.md,
    borderWidth: 1,
    fontSize: 16,
    minHeight: 48,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  inputGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  numberedSection: { borderBottomWidth: 1, paddingBottom: spacing.xl },
  pickerContent: { gap: spacing.sm, padding: spacing.lg },
  pickerHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: spacing.lg,
    paddingBottom: spacing.sm,
  },
  pickerOption: {
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: sizes.touchTarget,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  screen: { flex: 1 },
  selectField: {
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 48,
    paddingHorizontal: spacing.md,
  },
  selectFieldValue: { flex: 1 },
  section: { gap: spacing.md },
  sectionNumber: {
    alignItems: 'center',
    borderRadius: radius.pill,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  sectionTitle: { alignItems: 'center', flexDirection: 'row', gap: spacing.md },
  sectionTitleCopy: { flex: 1, gap: spacing.xs },
});
