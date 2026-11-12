import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BODY_MEASUREMENT_LABELS } from '@/api/body';
import { AppIcon, AppSheet, AppText, Button, GlassSurface, TextField, brandTokens, pressedStyle, spacing, useAppSheetDismiss, useOwnlevelTheme, useReduceMotion } from '@/design-system';
import { triggerHaptic } from '@/platform/haptics';
import type { BodyController, BodyState } from './body-controller';
import { BodyDateField } from './body-date-field';
import { MeasurementFields } from './body-measurement-form';
import { formatBodyDate, formatCm, formatKg, measurementBadges } from './body-model';
import type { MeasurementEditor, WeightEditor } from './body-storage';
import { WEIGHT_REFERENCE_TEXT, weightFieldWidth, type MeasuredReference } from './weight-field-width';

/** Close (✕) and save (✓) glass controls, the same as every other editor sheet in the app. */
function SheetControl({ label, icon, disabled, accent, pending, onPress }: {
  label: string; icon: 'close' | 'checkmark'; disabled: boolean; accent?: boolean; pending?: boolean; onPress: () => void;
}) {
  const { colors } = useOwnlevelTheme(), reduced = useReduceMotion();
  return <Pressable accessibilityLabel={label} accessibilityRole="button" accessibilityState={{ disabled, busy: pending }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => pressedStyle(pressed, reduced)}>
    <GlassSurface interactive style={[styles.control, accent && { backgroundColor: colors.primary }, disabled && !pending && { opacity: 0.4 }]}>
      {pending ? <ActivityIndicator color={accent ? colors.onPrimary : colors.text} /> : <AppIcon name={icon} color={accent ? colors.onPrimary : colors.text} size={20} />}
    </GlassSurface>
  </Pressable>;
}
function Header({ title, subtitle, close, save }: {
  title: string; subtitle?: string; close: { onPress: () => void; disabled: boolean };
  save: { label: string; onPress: () => void; disabled: boolean; pending: boolean };
}) {
  return <View style={styles.header}>
    <SheetControl label="Cerrar" icon="close" disabled={close.disabled} onPress={close.onPress} />
    <View style={styles.title}>
      <AppText accessibilityRole="header" variant="headline" style={styles.center}>{title}</AppText>
      {subtitle ? <AppText muted numeric variant="caption" style={styles.center}>{subtitle}</AppText> : null}
    </View>
    <SheetControl label={save.label} icon="checkmark" accent disabled={save.disabled} pending={save.pending} onPress={save.onPress} />
  </View>;
}

/** Explicit write states: what happened and the one way forward. Nothing here dismisses the sheet. */
function Status({ state, controller }: { state: BodyState; controller: BodyController }) {
  const { colors } = useOwnlevelTheme();
  const { phase, message, errors } = state;
  useEffect(() => { if (phase === 'uncertain' || phase === 'blocked') triggerHaptic('systemError'); }, [phase]);
  return <>
    {errors.form ? <AppText accessibilityRole="alert" style={{ color: colors.danger }} variant="footnote">{errors.form}</AppText> : null}
    {message ? <AppText accessibilityLiveRegion="polite" style={{ color: phase === 'conflict' || phase === 'blocked' ? colors.danger : colors.text }} variant="footnote">{message}</AppText> : null}
    {phase === 'uncertain' ? <Button label="Comprobar" onPress={() => void controller.recover()} />
      : phase === 'confirmed' ? <Button label="Actualizar lectura" onPress={() => void controller.recover()} />
      : phase === 'conflict' ? <Button label="Revisar valores actuales" variant="secondary" onPress={() => controller.reviewTruth()} /> : null}
  </>;
}
function DeleteLink({ label, confirm, onPress }: { label: string; confirm: string; onPress: () => void }) {
  const { colors } = useOwnlevelTheme();
  return <Pressable accessibilityRole="button" accessibilityLabel={label} style={styles.delete}
    onPress={() => Alert.alert(confirm, undefined, [{ text: 'Cancelar', style: 'cancel' }, { text: 'Eliminar', style: 'destructive', onPress }])}>
    <AppIcon name="trash" color={colors.danger} size={17} /><AppText variant="body" style={{ color: colors.danger }}>{label}</AppText>
  </Pressable>;
}
/** Leaving with unsaved changes always asks first; while a write is in flight or unresolved it cannot be dismissed. */
function useClose(state: BodyState, controller: BodyController) {
  const locked = state.phase === 'pending' || !!state.intent;
  const beforeDismiss = (proceed: () => void) => {
    if (!controller.dirty()) { proceed(); return; }
    Alert.alert('¿Descartar cambios?', 'Todavía no guardaste este registro.', [
      { text: 'Seguir editando', style: 'cancel' }, { text: 'Descartar', style: 'destructive', onPress: proceed },
    ]);
  };
  return { locked, beforeDismiss };
}

export function WeightEditorSheet({ editor, state, controller, closing = false, onDismissed }: {
  editor: WeightEditor; state: BodyState; controller: BodyController; closing?: boolean; onDismissed: () => void;
}) {
  const { colors } = useOwnlevelTheme(), insets = useSafeAreaInsets();
  const { locked, beforeDismiss } = useClose(state, controller);
  // iOS: UIKit focuses the field and moves the sheet with the keyboard in one transaction, so the number is never covered.
  const ios = Platform.OS === 'ios';
  return <AppSheet onClose={onDismissed} closeLabel="Cerrar carga de peso" locked={locked} beforeDismiss={beforeDismiss} dismissKeyboardOnClose
    nativeKeyboard={ios} keyboardInset={Math.max(insets.bottom, 16) - 8} style={{ backgroundColor: colors.background, maxHeight: '90%' }} testID="body-weight-sheet">
    <WeightForm editor={editor} state={state} controller={controller} closing={closing} />
  </AppSheet>;
}
/**
 * The big number. Its width is a function of the font only, never of the typed text: the native field takes each keystroke
 * before JS can resize it, so a content-sized width would leave one frame with the new text in the old width and the
 * leading digit scrolled out of view (#468). It is sized for the widest valid weight ("999,99"), measured once from a
 * hidden copy that never changes, and re-measured only when the font scale does (Dynamic Type). Until then (and for the
 * frame after a scale change) a synchronous upper-bound estimate applies, so it is never narrower than its content.
 */
function WeightNumberField({ value, placeholder, editable, onChangeText }: { value: string; placeholder: string; editable: boolean; onChangeText: (value: string) => void }) {
  const { colors } = useOwnlevelTheme(), { fontScale } = useWindowDimensions();
  const [measured, setMeasured] = useState<MeasuredReference | null>(null);
  const width = weightFieldWidth(brandTokens.typeScale.heroNumber.fontSize, fontScale, measured);
  return <>
    {/* Hidden and out of the row layout. Never wider than the row (a wider absolute child would grow the ScrollView's content width and let the sheet scroll sideways): one line that shrinks to the row, so at a huge font scale the measure is clamped to what the field can use anyway. */}
    <View pointerEvents="none" aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.measureHost} testID="body-weight-measure-host">
      <AppText aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants" numberOfLines={1} testID="body-weight-measure"
        onLayout={e => { const next = e.nativeEvent.layout.width; if (next > 0) setMeasured(prev => prev?.fontScale === fontScale && prev.width === next ? prev : { fontScale, width: next }); }}
        style={[styles.number, styles.measure]}>{WEIGHT_REFERENCE_TEXT}</AppText>
    </View>
    <TextInput accessibilityLabel="Peso" autoFocus={Platform.OS !== 'ios'} editable={editable} keyboardType="decimal-pad" value={value}
      placeholder={placeholder} placeholderTextColor={colors.textMuted}
      onChangeText={onChangeText} style={[styles.number, styles.field, { color: colors.text, width }]} testID="body-weight-input" />
  </>;
}
function WeightForm({ editor, state, controller, closing }: { editor: WeightEditor; state: BodyState; controller: BodyController; closing: boolean }) {
  const { colors } = useOwnlevelTheme(), insets = useSafeAreaInsets(), dismiss = useAppSheetDismiss();
  const today = state.read.overview?.today ?? '';
  const editable = state.phase === 'idle' && !state.intent && !closing;
  const editing = editor.mode === 'edit';
  const busy = state.phase === 'pending' || state.phase === 'reconciling' || closing;
  useEffect(() => { if (closing) dismiss(); }, [closing, dismiss]);
  // The last known weight is the grey hint behind an empty field: typing starts from nothing, never from "0".
  const hint = editor.baseline ?? state.read.overview?.current?.weightKg ?? null;
  const placeholder = hint === null ? '0' : String(hint).replace('.', ',');
  return <KeyboardAvoidingView enabled={Platform.OS === 'android'} behavior="height">
    <View style={{ paddingBottom: Math.max(insets.bottom, 16) }} testID="body-editor">
    <ScrollView keyboardShouldPersistTaps="always" contentContainerStyle={styles.content}>
      <Header title={editing ? 'Editar peso' : 'Registrar peso'} subtitle={editing ? `${formatBodyDate(editor.draft.date.split('/').reverse().join('-'))} · guardado ${formatKg(editor.baseline)}` : 'Si la fecha ya tiene peso, se reemplaza'}
        close={{ onPress: () => dismiss(), disabled: busy || !!state.intent }}
        save={{ label: 'Guardar', onPress: () => void controller.saveWeight(), disabled: !editable, pending: busy }} />
      <View style={styles.numberRow}>
        <WeightNumberField value={editor.draft.weight} placeholder={placeholder} editable={editable} onChangeText={v => controller.change('weight', v)} />
        <AppText muted variant="title2" style={styles.unit}>kg</AppText>
      </View>
      {state.errors.weight ? <AppText accessibilityRole="alert" style={[styles.center, { color: colors.danger }]} variant="footnote">{state.errors.weight}</AppText> : null}
      {editing ? null : <BodyDateField value={editor.draft.date} today={today} editable={editable} onChange={v => controller.change('date', v)} error={state.errors.date} />}
      <Status state={state} controller={controller} />
      {editing && editable ? <DeleteLink label="Eliminar peso" confirm="¿Eliminar el peso de esta fecha? El resto del día se conserva." onPress={() => void controller.deleteWeight()} /> : null}
    </ScrollView>
    </View>
  </KeyboardAvoidingView>;
}

/**
 * Many fields: the app sheet bounded above the keyboard (the same as "Cambiar un día" in Etapas). The ✕ / ✓ header
 * stays pinned and only the form scrolls; dragging it down with changes asks first and never bounces back.
 */
function LongSheet({ state, controller, children, header, testID }: { state: BodyState; controller: BodyController; children: ReactNode; header: (close: () => void) => ReactNode; testID: string }) {
  const { colors } = useOwnlevelTheme(), insets = useSafeAreaInsets();
  const { locked, beforeDismiss } = useClose(state, controller);
  const ios = Platform.OS === 'ios';
  return <AppSheet onClose={() => controller.close()} closeLabel="Cerrar carga de medidas" locked={locked} beforeDismiss={beforeDismiss} dismissKeyboardOnClose
    nativeKeyboard={ios} keyboardViewport={ios} keyboardTopInset={insets.top + spacing.md} keyboardInset={Math.max(insets.bottom, 16) - 8}
    style={{ backgroundColor: colors.background, maxHeight: ios ? '100%' : '92%', flexShrink: 1 }} testID={testID}>
    <LongSheetBody header={header}>{children}</LongSheetBody>
  </AppSheet>;
}
function LongSheetBody({ header, children }: { header: (close: () => void) => ReactNode; children: ReactNode }) {
  const dismiss = useAppSheetDismiss(), insets = useSafeAreaInsets();
  return <KeyboardAvoidingView enabled={Platform.OS === 'android'} behavior="height" style={styles.shrink}>
    <View style={styles.pageHeader}>{header(() => dismiss())}</View>
    <ScrollView style={styles.shrink} contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 16) + spacing.md }]}
      keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" testID="body-editor">{children}</ScrollView>
  </KeyboardAvoidingView>;
}

export function MeasurementEditorSheet({ editor, state, controller }: { editor: MeasurementEditor; state: BodyState; controller: BodyController }) {
  const { colors } = useOwnlevelTheme();
  const editable = state.phase === 'idle' && !state.intent;
  const busy = state.phase === 'pending' || state.phase === 'reconciling';
  const baseline = editor.baseline;
  const suspect = baseline?.qualityStatus === 'suspect';
  const legacy = baseline ? (['armCm', 'thighCm'] as const).filter(f => baseline[f] !== null) : [];
  const today = state.read.overview?.today ?? '';
  const saveLabel = suspect ? 'Guardar y verificar' : 'Guardar';
  return <LongSheet state={state} controller={controller} testID="body-measurement-sheet" header={close => <Header title={baseline ? 'Editar medición' : 'Registrar medidas'}
    subtitle="Completá solo lo que mediste" close={{ onPress: close, disabled: busy || !!state.intent }}
    save={{ label: saveLabel, onPress: () => void controller.saveMeasurement(), disabled: !editable || (!!baseline && !suspect && !controller.dirty()), pending: busy }} />}>
    {baseline ? measurementBadges(baseline).map(badge => <AppText key={badge.text} variant="footnote" style={{ color: badge.tone === 'warning' ? colors.text : colors.textMuted }}>{badge.text}</AppText>) : null}
    {suspect ? <AppText muted variant="footnote">Al guardar la corrección, la medición se marca como verificada y vuelve a contar en el análisis.</AppText> : null}
    <BodyDateField value={editor.draft.date} today={today} editable={editable} onChange={v => controller.change('date', v)} error={state.errors.date} />
    <MeasurementFields editor={editor} state={state} controller={controller} editable={editable} />
    {legacy.length ? <AppText muted variant="footnote">
      {legacy.map(f => `${BODY_MEASUREMENT_LABELS[f]} (histórico): ${formatCm(baseline![f])}`).join(' · ')} · se conserva al guardar.
    </AppText> : null}
    <TextField label="Condición" value={editor.draft.condition} onChangeText={v => controller.change('condition', v)} error={state.errors.condition}
      disabled={!editable} placeholder="Ej.: en ayunas" autoCorrect={false} />
    <TextField label="Notas" value={editor.draft.notes} onChangeText={v => controller.change('notes', v)} error={state.errors.notes}
      disabled={!editable} placeholder="Opcional" multiline autoCorrect={false} />
    <Status state={state} controller={controller} />
    {baseline && state.phase === 'idle' ? <DeleteLink label="Eliminar medición" confirm="¿Eliminar esta medición?" onPress={() => void controller.deleteMeasurement()} /> : null}
  </LongSheet>;
}

const styles = StyleSheet.create({
  shrink: { flexShrink: 1 },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xl },
  pageHeader: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xs },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { flex: 1, gap: 4 },
  center: { textAlign: 'center' },
  control: { width: 44, height: 44, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  numberRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: 8, paddingTop: 8 },
  number: { fontSize: brandTokens.typeScale.heroNumber.fontSize, fontWeight: '700', fontVariant: ['tabular-nums'], textAlign: 'center', minWidth: 32, minHeight: 64, padding: 0 },
  // Same font as the field (no letter spacing: the field has none); only its width is read.
  measure: { letterSpacing: 0, flexShrink: 1 },
  measureHost: { position: 'absolute', left: 0, right: 0, top: 0, flexDirection: 'row', opacity: 0 },
  // Fixed width from the font; it may shrink (never the unit) so a huge Dynamic Type size scrolls inside the field instead of overflowing the sheet.
  field: { flexShrink: 1, minWidth: 0 },
  unit: { flexShrink: 0 },
  delete: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, minHeight: 44, marginTop: spacing.sm },
});
