import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Keyboard, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Swipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, { FadeIn, FadeInUp, FadeOut, LinearTransition, ReduceMotion, interpolateColor, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import type { RoutineDetail } from '@/api/routine-editor';
import { AppIcon, AppText, GlassSurface, TextField, brandTokens, motionDurations, pressedStyle, radius, spacing, useOwnlevelTheme, useReduceMotion } from '@/design-system';
import { addSet, exerciseIdentity, removeSet, toggleAdjustment, type TargetsDraft } from './routine-editor-model';
import { RoutineEditorSheet } from './routine-editor-sheet';
import { RoutineRestPicker } from './routine-rest-picker';
import { RoutineSheetButton } from './routine-sheet-button';
import { SessionGlassButton } from './session-glass-button';

const PreparedRestPicker = memo(RoutineRestPicker, (before, after) => before.disabled === after.disabled && before.onChange === after.onChange
  && before.draft.restMin === after.draft.restMin && before.draft.restMax === after.draft.restMax);

export function RoutineTargetsSheet({ item, draft, dirty, pending, errors, onChange, onSave, onClose, onHistory, open, onDismissed }: {
  open: boolean; onDismissed: () => void; item: RoutineDetail['items'][number]; draft: TargetsDraft; dirty: boolean; pending: boolean; errors: Record<string, string>;
  onChange: (draft: TargetsDraft) => void; onSave: () => void; onClose: () => void; onHistory: () => void;
}) {
  const { colors } = useOwnlevelTheme();
  const reduceMotion = useReduceMotion();
  const scroll = useRef<ScrollView>(null), notesFocused = useRef(false);
  const revealNotes = useCallback(() => { if (notesFocused.current) scroll.current?.scrollToEnd({ animated: !reduceMotion }); }, [reduceMotion]);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', revealNotes);
    return () => show.remove();
  }, [revealNotes]);
  // Local presentation IDs survive deleting a middle row; they never enter the payload.
  const [setKeys, setSetKeys] = useState(() => draft.sets.map((_, index) => index));
  const nextSetKey = useRef(draft.sets.length);
  const [addedSet, setAddedSet] = useState<number | null>(null);
  const append = () => {
    if (pending || draft.sets.length >= 50) return;
    const key = nextSetKey.current++;
    setSetKeys(keys => [...keys, key]); setAddedSet(key); onChange(addSet(draft));
  };
  const remove = (index: number) => {
    if (pending || draft.sets.length <= 1) return;
    setSetKeys(keys => keys.filter((_, position) => position !== index)); onChange(removeSet(draft, index));
  };
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
      <ScrollView ref={scroll} automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" contentContainerStyle={styles.content}>
        <View style={styles.identity}><AppText accessibilityRole="header" variant="title2">{item.exercise.name}</AppText>
          {exerciseIdentity(item.exercise) ? <AppText muted variant="subheadline">{exerciseIdentity(item.exercise)}</AppText> : null}</View>
        <View style={styles.table}>
          <View style={styles.setRow} accessibilityElementsHidden>
            <AppText muted style={styles.number} variant="caption">#</AppText>
            {['KG', 'REPS', 'RIR'].map(label => <AppText key={label} muted style={styles.cell} variant="caption">{label}</AppText>)}
          </View>
          {draft.sets.map((set, index) => <Animated.View key={setKeys[index]} style={styles.setGap}
            entering={addedSet === setKeys[index] ? (reduceMotion ? FadeIn.duration(motionDurations.fast) : FadeInUp.duration(motionDurations.base)) : undefined}
            exiting={FadeOut.duration(motionDurations.fast)} layout={reduceMotion ? undefined : LinearTransition.duration(motionDurations.base)}>
            <Swipeable enabled={!pending && draft.sets.length > 1} overshootRight={false}
            animationOptions={{ ...brandTokens.motion.spring, reduceMotion: ReduceMotion.System }} childrenContainerStyle={{ backgroundColor: colors.background }}
            renderRightActions={() => <Pressable accessibilityLabel={`Quitar serie ${index + 1}`} accessibilityRole="button" disabled={pending || draft.sets.length <= 1}
              onPress={() => remove(index)} style={({ pressed }) => [styles.remove, { backgroundColor: colors.danger }, pressedStyle(pressed, reduceMotion)]}>
              <AppIcon name="trash" color={colors.onPrimary} size={17} /><AppText variant="footnote" style={{ color: colors.onPrimary }}>Quitar</AppText></Pressable>}>
            <View style={styles.setRow} testID={`routine-set-${index + 1}`}>
              <AppText muted numeric style={styles.number} variant="footnote">{index + 1}</AppText>
              {(['targetWeightKg', 'targetReps', 'targetRir'] as const).map(field => <TextField key={field} label={`Serie ${index + 1}, ${field === 'targetWeightKg' ? 'peso' : field === 'targetReps' ? 'reps' : 'RIR'}`}
                hideLabel numeric disabled={pending} keyboardType={field === 'targetWeightKg' ? 'decimal-pad' : 'number-pad'} selectTextOnFocus placeholder="—"
                value={set[field]} onChangeText={value => updateSet(index, field, value)} error={errors[`sets.${index}.${field}`]}
                style={styles.cell} inputStyle={styles.input} />)}
            </View>
          </Swipeable></Animated.View>)}
          <Animated.View layout={reduceMotion ? undefined : LinearTransition.duration(motionDurations.base)}>
            <SessionGlassButton label="+ Agregar serie" accessibilityLabel="Agregar serie" disabled={pending || draft.sets.length >= 50} onPress={append} />
          </Animated.View>
        </View>
        <RestSection draft={draft} pending={pending} onChange={onChange} error={errors.rest} />
        <View style={styles.group}>
          <AppText variant="headline" accessibilityLabel={draft.nextAdjustment === 'custom' ? 'Próxima vez. Ajuste personalizado anterior conservado.' : undefined}>Próxima vez</AppText>
          <View style={styles.adjustments}>
            {([['increase_weight', 'Más peso'], ['increase_reps', 'Más reps']] as const).map(([value, label]) => <AdjustmentButton key={value} label={label}
              selected={draft.nextAdjustment === value} pending={pending} onPress={() => onChange({ ...draft, nextAdjustment: toggleAdjustment(draft.nextAdjustment, value) })} />)}
          </View>
        </View>
        <TextField label="Notas" hideLabel accessibilityLabel="Observaciones del ejercicio" placeholder="Notas: técnica, agarre o posición" multiline disabled={pending}
          onFocus={() => { notesFocused.current = true; if (Keyboard.isVisible()) revealNotes(); }} onBlur={() => { notesFocused.current = false; }}
          value={draft.notes} onChangeText={value => onChange({ ...draft, notes: value })} error={errors.notes} />
        {errors.write ? <AppText accessibilityRole="alert" style={{ color: colors.danger }} variant="footnote">{errors.write}</AppText> : null}
      </ScrollView>
    </View>
  </RoutineEditorSheet>;
}
function AdjustmentButton({ label, selected, pending, onPress }: { label: string; selected: boolean; pending: boolean; onPress: () => void }) {
  const { colors } = useOwnlevelTheme();
  const reduceMotion = useReduceMotion(), selection = useSharedValue(selected ? 1 : 0);
  useEffect(() => { selection.value = withTiming(selected ? 1 : 0, { duration: motionDurations.fast }); }, [selected, selection]);
  const animatedStyle = useAnimatedStyle(() => ({ backgroundColor: interpolateColor(selection.value, [0, 1], [colors.surface, colors.brandSubtle]),
    borderColor: interpolateColor(selection.value, [0, 1], [colors.border, colors.primary]) }));
  return <Animated.View style={[styles.adjustment, animatedStyle]}><Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected, disabled: pending }} disabled={pending}
    onPress={onPress} style={({ pressed }) => [styles.adjustmentContent, pressedStyle(pressed, reduceMotion)]}>
    <Animated.View key={selected ? 'selected' : 'clear'} entering={FadeIn.duration(motionDurations.fast)} exiting={FadeOut.duration(motionDurations.fast)}>
      <AppIcon name={selected ? 'checkmark' : 'plus'} size={17} color={selected ? colors.primary : colors.textMuted} />
    </Animated.View>
    <AppText style={{ color: selected ? colors.primary : colors.text }} variant="headline">{label}</AppText>
  </Pressable></Animated.View>;
}
function RestSection({ draft, pending, onChange, error }: { draft: TargetsDraft; pending: boolean; onChange: (draft: TargetsDraft) => void; error?: string }) {
  const { colors } = useOwnlevelTheme();
  const reduceMotion = useReduceMotion(), [expanded, setExpanded] = useState(false), [height, setHeight] = useState(0);
  const latest = useRef({ draft, onChange }); useLayoutEffect(() => { latest.current = { draft, onChange }; });
  const changeRest = useCallback((next: TargetsDraft) => latest.current.onChange({ ...latest.current.draft, restMin: next.restMin, restMax: next.restMax }), []);
  const reveal = useSharedValue(0), angle = useSharedValue(0);
  useEffect(() => {
    reveal.value = withTiming(expanded ? 1 : 0, { duration: motionDurations.fast });
    angle.value = reduceMotion ? (expanded ? 90 : 0) : withTiming(expanded ? 90 : 0, { duration: motionDurations.fast });
  }, [expanded, reduceMotion, reveal, angle]);
  const bodyStyle = useAnimatedStyle(() => ({ height: reduceMotion ? (expanded ? height : 0) : height * reveal.value, opacity: reveal.value }));
  const arrowStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${angle.value}deg` }] }));
  return <View style={[styles.rest, { backgroundColor: colors.surface }]}>
    <Pressable accessibilityRole="button" accessibilityLabel="Cambiar descanso" accessibilityState={{ expanded, disabled: pending }} disabled={pending}
      onPress={() => { Keyboard.dismiss(); setExpanded(value => !value); }} style={({ pressed }) => [styles.restRow, pressed && { opacity: 0.7 }]}>
      <AppIcon name="clock" color={colors.textMuted} size={20} /><AppText style={styles.restTitle} variant="body">Descanso</AppText>
      <AppText muted numeric variant="subheadline">{draft.restMin || draft.restMax ? `${draft.restMin || '—'} – ${draft.restMax || '—'}` : 'Sin descanso'}</AppText>
      <Animated.View style={arrowStyle}><AppIcon name="chevronRight" color={colors.textMuted} size={17} /></Animated.View>
    </Pressable>
    <Animated.View style={[styles.restWindow, bodyStyle]} pointerEvents={expanded ? 'auto' : 'none'} accessibilityElementsHidden={!expanded} importantForAccessibility={expanded ? 'auto' : 'no-hide-descendants'}>
      <View style={styles.preparedRest} onLayout={event => setHeight(event.nativeEvent.layout.height)}>
        <PreparedRestPicker draft={draft} disabled={pending} onChange={changeRest} />
      </View>
    </Animated.View>
    {error ? <AppText accessibilityRole="alert" variant="footnote" style={{ color: colors.danger }}>{error}</AppText> : null}
  </View>;
}
const styles = StyleSheet.create({
  root: { flex: 1 }, header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, padding: spacing.lg },
  history: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, minHeight: brandTokens.layout.minTouch, borderRadius: radius.full, paddingHorizontal: spacing.sm },
  content: { gap: spacing.xl, paddingHorizontal: spacing.lg, paddingBottom: spacing.xxxl }, identity: { gap: spacing.xs }, table: { gap: spacing.xs },
  setGap: { paddingVertical: spacing.xs }, setRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs }, number: { width: brandTokens.space.lg, textAlign: 'center', paddingTop: spacing.sm },
  cell: { flex: 1, minWidth: 0, textAlign: 'center' }, input: { ...brandTokens.typeScale.title2, textAlign: 'center', paddingHorizontal: spacing.xs, borderWidth: 0 },
  remove: { alignSelf: 'center', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: spacing.xs, paddingHorizontal: spacing.md, marginLeft: spacing.sm, minHeight: brandTokens.layout.inputHeight, borderRadius: radius.button },
  rest: { borderRadius: radius.card, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  restRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: brandTokens.layout.minTouch, paddingVertical: spacing.sm },
  restTitle: { flex: 1 },
  restWindow: { overflow: 'hidden' }, preparedRest: { position: 'absolute', top: 0, left: 0, right: 0 },
  group: { gap: spacing.sm }, adjustments: { flexDirection: 'row', gap: spacing.xs }, adjustment: { flex: 1, borderRadius: radius.button, borderWidth: 1 },
  adjustmentContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, minHeight: brandTokens.layout.inputHeight },
});
