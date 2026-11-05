import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { Keyboard, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppIcon, AppSheet, AppText, Button, Chip, TextField, spacing, useAppSheetDismiss, useOwnlevelTheme } from '@/design-system';
import type { MobileApiClient } from '@/api/client';
import { CONFIGURATION_LABEL_MAX, ExerciseConfigurationJournal, exerciseConfigurationApi, normalizeConfigurationLabel, sameConfiguration,
  type ConfigurationValue, type ConfigurationView, type PreviousConfiguration } from '@/api/training-exercise-configuration';
import { haptics } from '@/platform/haptics';
import { activeSessionStorage } from './active-session-native-storage';
import { sessionIntentKey } from './active-session-controller';

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
  return <View testID={`exercise-variant-${sessionExerciseId}`}>
    <View style={styles.row}>
      <AppIcon name="filter" color={colors.textMuted} size={17} />
      <AppText muted={view.value === null} numberOfLines={2} variant="caption" style={styles.flex}
        accessibilityLabel={`Variante de ${name}: ${variantText(view.value)}${unconfirmed ? ', sin confirmar' : ''}`}>Variante · {variantText(view.value)}</AppText>
      {unconfirmed ? <Button disabled={snapshot.busy} label="Reintentar" onPress={() => void journal.retry()} variant="quiet" />
        : <Button disabled={!editable || snapshot.busy || !!snapshot.pending} label={view.value === null ? 'Registrar' : 'Cambiar'} onPress={() => { Keyboard.dismiss(); haptics.selection(); setOpen(true); }} variant="quiet" />}
    </View>
    {unconfirmed || (snapshot.error && view.state === 'saved' && !snapshot.pending) ? <AppText accessibilityLiveRegion="polite" muted variant="caption">{snapshot.error ?? 'Variante sin confirmar.'}</AppText> : null}
    {open ? <ExerciseVariantSheet name={name} view={view} onClose={() => setOpen(false)}
      onSave={value => journal.choose(sessionExerciseId, value).then(result => result === true)} /> : null}
  </View>;
}

function ExerciseVariantSheet({ name, view, onSave, onClose }: { name: string; view: ConfigurationView; onSave: (value: ConfigurationValue | null) => Promise<boolean>; onClose: () => void }) {
  const { colors } = useOwnlevelTheme();
  return <AppSheet onClose={onClose} closeLabel="Cerrar variante" dismissKeyboardOnClose nativeKeyboard={Platform.OS === 'ios'} style={{ backgroundColor: colors.background, maxHeight: '90%' }} testID="exercise-variant-sheet">
    <VariantForm name={name} view={view} onSave={onSave} />
  </AppSheet>;
}

function VariantForm({ name, view, onSave }: { name: string; view: ConfigurationView; onSave: (value: ConfigurationValue | null) => Promise<boolean> }) {
  const { colors } = useOwnlevelTheme(), insets = useSafeAreaInsets(), dismiss = useAppSheetDismiss();
  const current = view.value;
  const previous: PreviousConfiguration | null = view.item?.previous ?? null;
  const [text, setText] = useState(current?.kind === 'recorded' ? current.label : '');
  const [saving, setSaving] = useState(false), [error, setError] = useState<string | null>(null);
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
  return <View style={{ paddingBottom: Math.max(insets.bottom, spacing.lg) }} testID="exercise-variant-form">
    <ScrollView keyboardShouldPersistTaps="always" contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View style={styles.flex}><AppText accessibilityRole="header" variant="headline">Variante</AppText><AppText muted variant="footnote">{name}</AppText></View>
        <Button disabled={saving} label="Cancelar" onPress={() => dismiss()} variant="quiet" />
      </View>
      <AppText muted variant="footnote">Opcional. Sirve para comparar solo las sesiones que hiciste igual: agarre, banco, posición o accesorio.</AppText>
      <TextField label="¿Cómo la hiciste hoy?" placeholder="Ej.: agarre neutro, banco a 30°" value={text} onChangeText={setText} maxLength={CONFIGURATION_LABEL_MAX}
        disabled={saving} autoCapitalize="sentences" returnKeyType="done" onSubmitEditing={() => { if (typed && !sameConfiguration(current, typed)) void save(typed); }} testID="exercise-variant-input" />
      <View style={styles.chips}>
        {repeat ? <Chip kind="toggle" disabled={saving} selected={false} label={`Como la última vez · ${variantText(repeat.value)}`}
          onPress={() => void save({ ...repeat.value, source: 'repeated_previous', repeatedFrom: repeat.sessionExerciseId } as ConfigurationValue)} /> : null}
        {current?.kind === 'not_applicable' ? null : <Chip kind="toggle" disabled={saving} selected={false} label="No aplica"
          onPress={() => void save({ kind: 'not_applicable', label: null, source: 'entered', repeatedFrom: null })} />}
      </View>
      <Button disabled={saving || !typed || sameConfiguration(current, typed) && current?.label === typed.label} loading={saving} label="Guardar" onPress={() => { if (typed) void save(typed); }} />
      {current ? <Button disabled={saving} label="Dejar sin registrar" onPress={() => void save(null)} variant="quiet" /> : null}
      {error ? <AppText accessibilityRole="alert" variant="footnote" style={{ color: colors.danger }}>{error}</AppText> : null}
    </ScrollView>
  </View>;
}

const styles = StyleSheet.create({
  flex: { flex: 1 }, row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 50 },
  content: { padding: spacing.lg, gap: spacing.md }, header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
