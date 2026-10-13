import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Swipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import { ReduceMotion } from 'react-native-reanimated';
import type { RoutineDetail } from '@/api/routine-editor';
import { AppIcon, AppText, Button, GlassSurface, ListRow, TextField, brandTokens, radius, spacing, useOwnlevelTheme } from '@/design-system';
import { addSet, exerciseIdentity, removeSet, toggleAdjustment, type TargetsDraft } from './routine-editor-model';
import { RoutineEditorSheet } from './routine-editor-sheet';
import { RoutineRestPicker } from './routine-rest-picker';
import { RoutineSheetButton } from './routine-sheet-button';

export function RoutineTargetsSheet({ item, draft, dirty, pending, errors, onChange, onSave, onClose, onHistory, open, onDismissed }: {
  open: boolean; onDismissed: () => void; item: RoutineDetail['items'][number]; draft: TargetsDraft; dirty: boolean; pending: boolean; errors: Record<string, string>;
  onChange: (draft: TargetsDraft) => void; onSave: () => void; onClose: () => void; onHistory: () => void;
}) {
  const { colors } = useOwnlevelTheme();
  const [restOpen, setRestOpen] = useState(false);
  const updateSet = (index: number, field: 'targetWeightKg' | 'targetReps' | 'targetRir', value: string) =>
    onChange({ ...draft, sets: draft.sets.map((set, position) => position === index ? { ...set, [field]: value } : set) });
  return <RoutineEditorSheet open={open} onDismissed={onDismissed} pending={pending} dirty={dirty} onClose={onClose}>
    <View style={styles.root} testID="routine-targets-sheet">
      <View style={styles.header}>
        <RoutineSheetButton label="Cerrar ejercicio" icon="close" onPress={onClose} disabled={pending} />
        <GlassSurface interactive style={styles.history}>
          <Pressable accessibilityLabel="Historial del ejercicio" accessibilityRole="button" disabled={pending} onPress={onHistory} style={styles.history}>
            <AppIcon name="clock" color={colors.textMuted} size={20} /><AppText variant="body">Historial</AppText>
          </Pressable>
        </GlassSurface>
        <RoutineSheetButton label={pending ? 'Guardando…' : 'Guardar objetivos'} icon="checkmark" accent pending={pending} disabled={pending || !dirty} onPress={onSave} />
      </View>
      <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" contentContainerStyle={styles.content}>
        <View style={styles.identity}><AppText accessibilityRole="header" variant="title2">{item.exercise.name}</AppText>
          {exerciseIdentity(item.exercise) ? <AppText muted variant="subheadline">{exerciseIdentity(item.exercise)}</AppText> : null}</View>
        <View style={styles.table}>
          <View style={styles.setRow} accessibilityElementsHidden>
            <AppText muted style={styles.number} variant="caption">#</AppText>
            {['KG', 'REPS', 'RIR'].map(label => <AppText key={label} muted style={styles.cell} variant="caption">{label}</AppText>)}
          </View>
          {draft.sets.map((set, index) => <Swipeable key={`set-${index}`} enabled={!pending && draft.sets.length > 1} overshootRight={false}
            animationOptions={{ ...brandTokens.motion.spring, reduceMotion: ReduceMotion.System }} childrenContainerStyle={{ backgroundColor: colors.background }}
            renderRightActions={() => <Pressable accessibilityLabel={`Quitar serie ${index + 1}`} accessibilityRole="button" disabled={pending || draft.sets.length <= 1}
              onPress={() => onChange(removeSet(draft, index))} style={[styles.remove, { backgroundColor: colors.danger }]}><AppIcon name="trash" color={colors.onPrimary} size={20} /></Pressable>}>
            <View style={styles.setRow} testID={`routine-set-${index + 1}`}>
              <AppText muted numeric style={styles.number} variant="footnote">{index + 1}</AppText>
              {(['targetWeightKg', 'targetReps', 'targetRir'] as const).map(field => <TextField key={field} label={`Serie ${index + 1}, ${field === 'targetWeightKg' ? 'peso' : field === 'targetReps' ? 'reps' : 'RIR'}`}
                hideLabel numeric disabled={pending} keyboardType={field === 'targetWeightKg' ? 'decimal-pad' : 'number-pad'} selectTextOnFocus placeholder="—"
                value={set[field]} onChangeText={value => updateSet(index, field, value)} error={errors[`sets.${index}.${field}`]}
                style={styles.cell} inputStyle={styles.input} />)}
            </View>
          </Swipeable>)}
          <Button variant="secondary" label="Agregar serie" icon="plus" disabled={pending || draft.sets.length >= 50} onPress={() => onChange(addSet(draft))} />
        </View>
        <View style={[styles.rest, { backgroundColor: colors.surface }]}>
          <ListRow title="Descanso" icon="clock" accessibilityLabel="Cambiar descanso" numericValue value={draft.restMin || draft.restMax ? `${draft.restMin || '—'} – ${draft.restMax || '—'}` : 'Sin descanso'} disabled={pending} onPress={() => setRestOpen(value => !value)}
            trailing={restOpen ? <AppIcon name="chevronDown" color={colors.textMuted} size={17} /> : undefined} chevron={!restOpen} />
          {restOpen ? <RoutineRestPicker draft={draft} disabled={pending} onChange={onChange} /> : null}
          {errors.rest ? <AppText accessibilityRole="alert" variant="footnote" style={{ color: colors.danger }}>{errors.rest}</AppText> : null}
        </View>
        <View style={styles.group}>
          <AppText variant="headline">Próxima vez</AppText>
          <View style={styles.adjustments}>
            {([['increase_weight', 'Más peso'], ['increase_reps', 'Más reps']] as const).map(([value, label]) => <Pressable key={value} accessibilityRole="button" accessibilityLabel={label}
              accessibilityState={{ selected: draft.nextAdjustment === value, disabled: pending }} disabled={pending}
              onPress={() => onChange({ ...draft, nextAdjustment: toggleAdjustment(draft.nextAdjustment, value) })}
              style={[styles.adjustment, { backgroundColor: draft.nextAdjustment === value ? colors.brandSubtle : colors.surface, borderColor: draft.nextAdjustment === value ? colors.primary : colors.border }]}>
              <AppIcon name={draft.nextAdjustment === value ? 'checkmark' : 'plus'} size={17} color={draft.nextAdjustment === value ? colors.primary : colors.textMuted} />
              <AppText style={{ color: draft.nextAdjustment === value ? colors.primary : colors.text }} variant="headline">{label}</AppText>
            </Pressable>)}
          </View>
          {draft.nextAdjustment === 'custom' ? <AppText muted variant="footnote">Ajuste personalizado anterior conservado.</AppText> : null}
          <AppText muted variant="footnote">{draft.nextAdjustment === 'increase_reps'
            ? 'En la próxima sesión te aparece “Subir repeticiones” como recordatorio. No cambia los objetivos automáticamente.'
            : draft.nextAdjustment === 'increase_weight' ? 'En la próxima sesión te aparece “Subir peso” como recordatorio. No cambia los objetivos automáticamente.'
              : 'Sin marcar, se mantiene igual. Más peso o Más reps agrega un recordatorio para la próxima sesión.'}</AppText>
        </View>
        <TextField label="Notas" hideLabel accessibilityLabel="Observaciones del ejercicio" placeholder="Notas: técnica, agarre o posición" multiline disabled={pending}
          value={draft.notes} onChangeText={value => onChange({ ...draft, notes: value })} error={errors.notes} />
        {errors.write ? <AppText accessibilityRole="alert" style={{ color: colors.danger }} variant="footnote">{errors.write}</AppText> : null}
      </ScrollView>
    </View>
  </RoutineEditorSheet>;
}
const styles = StyleSheet.create({
  root: { flex: 1 }, header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, padding: spacing.lg },
  history: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, minHeight: 44, borderRadius: radius.full, paddingHorizontal: spacing.sm },
  content: { gap: spacing.xl, paddingHorizontal: spacing.lg, paddingBottom: spacing.xxxl }, identity: { gap: spacing.xs }, table: { gap: spacing.xs },
  setRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs, paddingVertical: spacing.xs }, number: { width: 20, textAlign: 'center', paddingTop: spacing.sm },
  cell: { flex: 1, minWidth: 0, textAlign: 'center' }, input: { ...brandTokens.typeScale.title2, textAlign: 'center', paddingHorizontal: spacing.xs, borderWidth: 0 },
  remove: { alignItems: 'center', justifyContent: 'center', minWidth: 64, borderRadius: radius.input }, rest: { borderRadius: radius.card, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  group: { gap: spacing.sm }, adjustments: { flexDirection: 'row', gap: spacing.xs }, adjustment: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, minHeight: 48, borderRadius: radius.button, borderWidth: 1 },
});
