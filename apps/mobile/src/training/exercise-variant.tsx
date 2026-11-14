import { useEffect, useMemo, useState, useSyncExternalStore, type Ref } from 'react';
import { Keyboard, Platform, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn } from 'react-native-reanimated';
import { AppIcon, AppSheet, AppText, brandTokens, Button, Chip, Surface, TextField, spacing, useAppSheetDismiss, useOwnlevelTheme, useReduceMotion } from '@/design-system';
import type { MobileApiClient } from '@/api/client';
import { CONFIGURATION_AFTER_NOTE, CONFIGURATION_HINT, CONFIGURATION_LABEL_MAX, CONFIGURATION_MIXED_NOTE, ExerciseConfigurationJournal, exerciseConfigurationApi, normalizeConfigurationLabel, sameConfiguration,
  type ConfigurationValue, type ConfigurationView, type PreviousConfiguration } from '@/api/training-exercise-configuration';
import { haptics } from '@/platform/haptics';
import { activeSessionStorage } from './active-session-native-storage';
import { sessionIntentKey } from './active-session-controller';
import { RoutineSheetButton } from './routine-sheet-button';

/** #367: one journal per session. Optional: a failure here never blocks training. */
export function useExerciseConfigurations(client: MobileApiClient, userId: string, sessionId: string) {
  const journal = useMemo(() => new ExerciseConfigurationJournal(activeSessionStorage, exerciseConfigurationApi(client, sessionId), userId, sessionId, sessionIntentKey),
    [client, sessionId, userId]);
  useEffect(() => { void journal.refresh(); }, [journal]);
  return journal;
}

export function variantText(value: { kind: string; label: string | null } | null) {
  return value === null ? 'Sin registrar' : value.kind === 'not_applicable' ? 'No aplica' : value.label!;
}

/** A row in the open exercise: what was recorded for this session, and a way to change it. */
export function ExerciseVariantRow({ journal, sessionExerciseId, name, editable }: { journal: ExerciseConfigurationJournal; sessionExerciseId: string; name: string; editable: boolean }) {
  const { colors } = useOwnlevelTheme();
  const snapshot = useSyncExternalStore(journal.subscribe, journal.getSnapshot, journal.getSnapshot);
  const view = journal.view(sessionExerciseId);
  const [open, setOpen] = useState(false);
  // Without a read there is nothing to write against; the row says so and training goes on.
  if (!view.item) return snapshot.ready && snapshot.error && !snapshot.busy ? <View style={styles.row} testID={`exercise-variant-${sessionExerciseId}`}>
    <AppIcon name="filter" color={colors.textMuted} size={17} />
    <AppText muted variant="caption" style={styles.flex}>Variante no disponible por ahora</AppText>
    <Button label="Reintentar" onPress={() => void journal.refresh()} variant="quiet" />
  </View> : null;
  const unconfirmed = view.state === 'unconfirmed';
  const after = view.state === 'saved' && view.item?.value?.recordedPhase === 'after_session';
  const mixed = journal.mixed(sessionExerciseId);
  return <View testID={`exercise-variant-${sessionExerciseId}`}>
    <View style={styles.row}>
      <AppIcon name="filter" color={colors.textMuted} size={17} />
      <AppText muted={view.value === null} numberOfLines={2} variant="caption" style={styles.flex}
        accessibilityLabel={`Variante de ${name}: ${variantText(view.value)}${after ? ', registrada después de la sesión' : ''}${unconfirmed ? ', sin confirmar' : ''}`}>Variante · {variantText(view.value)}{after ? ' · registrada después' : ''}</AppText>
      {unconfirmed ? <Button disabled={snapshot.busy} label="Reintentar" onPress={() => void journal.retry()} variant="quiet" />
        : <Button disabled={!editable || snapshot.busy || !!snapshot.pending} label={view.value === null ? 'Registrar' : 'Cambiar'} onPress={() => { Keyboard.dismiss(); haptics.selection(); setOpen(true); }} variant="quiet" />}
    </View>
    {mixed ? <AppText muted variant="caption">{CONFIGURATION_MIXED_NOTE}</AppText> : null}
    {unconfirmed || (snapshot.error && view.state === 'saved' && !snapshot.pending) ? <AppText accessibilityLiveRegion="polite" muted variant="caption">{snapshot.error ?? 'Variante sin confirmar.'}</AppText> : null}
    {open ? <ExerciseVariantSheet name={name} view={view} onClose={() => setOpen(false)}
      onSave={value => journal.choose(sessionExerciseId, value).then(result => result === true)} /> : null}
  </View>;
}

/**
 * #463: the field and Guardar stay together, side by side, unless they would be cramped: with large text (Dynamic Type
 * above 1.3) or when the field would be left narrower than a comfortable typing width, Guardar goes under it.
 */
const COMPOSER_MIN_FIELD = 200, COMPOSER_SAVE_WIDTH = 100;
export function variantComposerStacked(width: number, fontScale: number) {
  return fontScale > 1.3 || width - 2 * spacing.lg - spacing.sm - COMPOSER_SAVE_WIDTH * fontScale < COMPOSER_MIN_FIELD;
}

function ExerciseVariantSheet({ name, view, onSave, onClose }: { name: string; view: ConfigurationView; onSave: (value: ConfigurationValue | null) => Promise<boolean>; onClose: () => void }) {
  const { colors } = useOwnlevelTheme(), insets = useSafeAreaInsets();
  const ios = Platform.OS === 'ios';
  // #463: the same keyboard geometry as the body sheets. The edge hides behind the keyboard by the home-indicator padding
  // (no plain band above it), and the sheet is bounded to the free area so the composer is never pushed off screen.
  return <AppSheet onClose={onClose} closeLabel="Cerrar variante" dismissKeyboardOnClose nativeKeyboard={ios} keyboardViewport={ios}
    keyboardTopInset={insets.top + spacing.md} keyboardInset={Math.max(insets.bottom, spacing.lg) - spacing.sm}
    style={{ backgroundColor: colors.background, maxHeight: ios ? '100%' : '90%', flexShrink: 1 }} testID="exercise-variant-sheet">
    <VariantForm name={name} view={view} onSave={onSave} />
  </AppSheet>;
}

function VariantForm({ name, view, onSave }: { name: string; view: ConfigurationView; onSave: (value: ConfigurationValue | null) => Promise<boolean> }) {
  const { colors } = useOwnlevelTheme(), insets = useSafeAreaInsets(), dismiss = useAppSheetDismiss(), { width, fontScale } = useWindowDimensions();
  const current = view.value;
  const previous: PreviousConfiguration | null = view.item?.previous ?? null;
  const [text, setText] = useState(current?.kind === 'recorded' ? current.label : '');
  const [saving, setSaving] = useState(false), [error, setError] = useState<string | null>(null);
  const [help, setHelp] = useState(false);
  const stacked = variantComposerStacked(width, fontScale);
  const label = normalizeConfigurationLabel(text);
  const save = async (value: ConfigurationValue | null) => {
    if (saving) return;
    setSaving(true); setError(null);
    try {
      if (await onSave(value)) { haptics.selection(); dismiss(); return; }
      setError('No pudimos confirmar la variante. Revisala en el ejercicio; entrenar no depende de esto.');
    } finally { setSaving(false); }
  };
  // "Same as last time" is the person's choice, kept with where it came from: never filled in for them.
  const repeat = previous && !sameConfiguration(current, previous.value) ? previous : null;
  const typed: ConfigurationValue | null = label ? { kind: 'recorded', label, source: 'entered', repeatedFrom: null } : null;
  // #463: the options scroll if space runs out; the error, the field and Guardar stay pinned on the keyboard. The bottom
  // padding pairs with the sheet's keyboardInset: only a small gap shows above the keyboard, the home indicator without it.
  return <View style={styles.shrink} testID="exercise-variant-form">
    <ScrollView style={styles.shrink} keyboardShouldPersistTaps="always" contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View style={styles.flex}>
          <AppText accessibilityRole="header" variant="headline">Variante · {name}</AppText>
          <AppText muted variant="footnote" testID="exercise-variant-current">Ahora: {variantText(current)}</AppText>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Qué es una variante" accessibilityState={{ expanded: help }} hitSlop={spacing.xs}
          onPress={() => { haptics.selection(); setHelp(open => !open); }} style={({ pressed }) => [styles.icon, pressed && { opacity: 0.6 }]} testID="exercise-variant-help">
          <AppIcon name="info" color={help ? colors.primary : colors.textMuted} size={20} />
        </Pressable>
        <RoutineSheetButton label="Cerrar variante" icon="close" disabled={saving} onPress={() => dismiss()} />
      </View>
      {help ? <AppText accessibilityLiveRegion="polite" muted variant="footnote" testID="exercise-variant-hint">{CONFIGURATION_HINT}</AppText> : null}
      <View style={styles.chips}>
        {repeat ? <Chip kind="toggle" disabled={saving} selected={false} label={`Como la última vez · ${variantText(repeat.value)}`}
          onPress={() => void save({ ...repeat.value, source: 'repeated_previous', repeatedFrom: repeat.sessionExerciseId } as ConfigurationValue)} /> : null}
        {current?.kind === 'not_applicable' ? null : <Chip kind="toggle" disabled={saving} selected={false} label="No aplica"
          onPress={() => void save({ kind: 'not_applicable', label: null, source: 'entered', repeatedFrom: null })} />}
        {current ? <Button disabled={saving} label="Dejar sin registrar" onPress={() => void save(null)} variant="quiet" /> : null}
      </View>
    </ScrollView>
    <View style={[styles.composerArea, { paddingBottom: Math.max(insets.bottom, spacing.lg) + spacing.xs }]}>
      {error ? <AppText accessibilityRole="alert" variant="footnote" style={{ color: colors.danger }}>{error}</AppText> : null}
      <View style={stacked ? styles.stacked : styles.composer} testID="exercise-variant-composer">
        <TextField hideLabel label="¿Cómo la hiciste hoy?" placeholder="Ej.: agarre neutro" value={text} onChangeText={setText} maxLength={CONFIGURATION_LABEL_MAX}
          disabled={saving} autoCapitalize="sentences" returnKeyType="done" onSubmitEditing={() => { if (typed && !sameConfiguration(current, typed)) void save(typed); }}
          style={stacked ? undefined : styles.flex} testID="exercise-variant-input" />
        <Button disabled={saving || !typed || sameConfiguration(current, typed) && current?.label === typed.label} loading={saving} label="Guardar" onPress={() => { if (typed) void save(typed); }} />
      </View>
    </View>
  </View>;
}

type SessionExercises = readonly { id: string; nameSnapshot: string }[];

function VariantRows({ journal, exercises, editable }: { journal: ExerciseConfigurationJournal; exercises: SessionExercises; editable: boolean }) {
  return <>
    <AppText muted variant="footnote">{CONFIGURATION_HINT} {CONFIGURATION_AFTER_NOTE}</AppText>
    {exercises.map(exercise => <View key={exercise.id}>
      <AppText variant="subheadline">{exercise.nameSnapshot}</AppText>
      <ExerciseVariantRow journal={journal} sessionExerciseId={exercise.id} name={exercise.nameSnapshot} editable={editable} />
    </View>)}
  </>;
}

/** Completed session: the same rows, to add or fix a variant afterwards. It says so, and it is never read as captured live. */
export function SessionVariants({ journal, exercises, editable }: { journal: ExerciseConfigurationJournal; exercises: SessionExercises; editable: boolean }) {
  useSyncExternalStore(journal.subscribe, journal.getSnapshot, journal.getSnapshot);
  if (!exercises.length) return null;
  return <View style={styles.section} testID="session-variants">
    <AppText accessibilityRole="header" variant="headline">Variantes</AppText>
    <VariantRows journal={journal} exercises={exercises} editable={editable} />
  </View>;
}

type JournalSnapshot = ReturnType<ExerciseConfigurationJournal['getSnapshot']>;
/** What a folded section must never hide (#475): a write waiting for confirmation, a failed read, a conflict or a refused write. */
export type VariantsAttention = { message: string; retry: boolean; reread: boolean; review: boolean };

/**
 * Only the journal's own states, and only the recovery each one already has: the same replay for an unconfirmed write
 * (same key, never a second attempt), a read for a failed one, the saved value for a conflict. Nothing while a read or write is
 * in flight: it settles into one of these or into a confirmed value.
 */
export function variantsAttention(snapshot: JournalSnapshot): VariantsAttention | null {
  if (!snapshot.ready || snapshot.busy) return null;
  if (snapshot.pending) return { message: snapshot.error ?? 'Variante sin confirmar.', retry: true, reread: false, review: true };
  if (snapshot.error) return { message: snapshot.error, retry: false, reread: true, review: snapshot.server !== null };
  return null;
}

/** Outside the folded section: what needs the person's attention, with the existing action to resolve it. */
export function SessionVariantsNotice({ journal, onReview }: { journal: ExerciseConfigurationJournal; onReview: () => void }) {
  const { colors } = useOwnlevelTheme();
  const snapshot = useSyncExternalStore(journal.subscribe, journal.getSnapshot, journal.getSnapshot);
  const attention = variantsAttention(snapshot);
  if (!attention) return null;
  return <Surface testID="session-variants-notice" style={styles.notice}>
    <View style={styles.noticeText}>
      <AppIcon name="filter" color={colors.textMuted} size={17} />
      <AppText accessibilityLiveRegion="polite" variant="footnote" style={styles.flex}>{attention.message}</AppText>
    </View>
    {attention.retry || attention.reread || attention.review ? <View style={styles.noticeActions}>
      {attention.retry ? <Button disabled={snapshot.busy} label="Reintentar" onPress={() => void journal.retry()} variant="quiet" /> : null}
      {attention.reread ? <Button disabled={snapshot.busy} label="Volver a leer" onPress={() => void journal.refresh()} variant="quiet" /> : null}
      {attention.review ? <Button label="Ver variantes" onPress={onReview} variant="quiet" /> : null}
    </View> : null}
  </Surface>;
}

/**
 * #475: variants are an optional, secondary adjustment. Folded by default with what is already recorded counted, never
 * what is missing (an unrecorded variant is not a pending task). Opening only shows rows of the journal already read.
 */
export function SessionVariantsSection({ journal, exercises, editable, open, onToggle, headerRef }: {
  journal: ExerciseConfigurationJournal; exercises: SessionExercises; editable: boolean; open: boolean; onToggle: () => void; headerRef?: Ref<View>;
}) {
  const { colors } = useOwnlevelTheme(), reduced = useReduceMotion();
  const snapshot = useSyncExternalStore(journal.subscribe, journal.getSnapshot, journal.getSnapshot);
  if (!exercises.length) return null;
  const recorded = snapshot.server ? exercises.filter(exercise => journal.view(exercise.id).value !== null).length : 0;
  const status = recorded ? `${recorded} ${recorded === 1 ? 'registrada' : 'registradas'}` : 'Opcional';
  return <View style={styles.section} testID="session-variants">
    <Pressable ref={headerRef} accessibilityRole="button" accessibilityState={{ expanded: open }} accessibilityLabel={`Variantes de ejercicios. ${status}`}
      onPress={() => { haptics.selection(); onToggle(); }} style={({ pressed }) => [styles.toggle, pressed && { opacity: 0.6 }]} testID="session-variants-toggle">
      <View style={styles.flex}>
        <AppText variant="headline">Variantes de ejercicios</AppText>
        <AppText muted numeric variant="footnote" testID="session-variants-status">{status}</AppText>
      </View>
      <View style={open ? styles.flipped : null}><AppIcon name="chevronDown" color={colors.textMuted} size={17} /></View>
    </Pressable>
    {open ? <Animated.View entering={FadeIn.duration(reduced ? brandTokens.motion.duration.fast : brandTokens.motion.duration.base)} style={styles.section} testID="session-variants-rows">
      <VariantRows journal={journal} exercises={exercises} editable={editable} />
    </Animated.View> : null}
  </View>;
}

const styles = StyleSheet.create({
  notice: { gap: spacing.xs }, noticeText: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, noticeActions: { flexDirection: 'row', flexWrap: 'wrap', columnGap: spacing.sm },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 44 }, flipped: { transform: [{ rotate: '180deg' }] },
  flex: { flex: 1 }, row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 50 },
  shrink: { flexShrink: 1 },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.xs, paddingBottom: spacing.md, gap: spacing.md }, header: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  icon: { width: brandTokens.layout.minTouch, height: brandTokens.layout.minTouch, alignItems: 'center', justifyContent: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm }, section: { gap: spacing.sm },
  composerArea: { paddingHorizontal: spacing.lg, gap: spacing.sm },
  composer: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, stacked: { gap: spacing.sm },
});
