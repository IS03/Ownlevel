import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppSheet, AppText, Button, brandTokens, spacing, useAppSheetDismiss, useOwnlevelTheme } from '@/design-system';
import { ExerciseSegmented } from '@/training/exercise-segmented';
import type { DayWriteController, DayWriteState } from './day-write-controller';
import { dayWriteDraft } from './day-write-model';
import type { DayContextField } from './day-details';
import { amount, number } from './day-format';
import { NutritionGlassButton } from './day-controls';

const FIELDS = ['target', 'expenditure'] as const;
const TITLE: Record<DayContextField, string> = { target: 'Objetivo', expenditure: 'Gasto estimado' };
const SHORT: Record<DayContextField, string> = { target: 'Objetivo', expenditure: 'Gasto' };

/** What the field shows: the raw draft digits with the on-screen grouping (2100 → 2.100). Anything else stays as typed. */
export function contextInputText(raw: string) {
  return /^\d+$/u.test(raw) ? number(Number(raw)) : raw;
}
/**
 * Back to the raw draft: the grouping dots never reach the model ("2.100" → "2100"). Dots are dropped only when
 * they are es-AR thousands separators, or the ones the field itself showed while the user typed or deleted digits.
 * Anything else ("2.5", "1..200", "2 100") stays as written, so the model rejects it instead of reading another number.
 */
export function contextRawInput(text: string, previousRaw = '') {
  const value = text.trim();
  if (/^\d*$/u.test(value)) return value;
  if (/^\d{1,3}(?:\.\d{3})+$/u.test(value)) return value.replace(/\./gu, '');
  // A single keystroke on the grouping the field itself showed (the draft was digits): exactly one digit typed, or
  // exactly one character deleted, nothing else changed. A deleted digit can leave the remaining dots out of place,
  // e.g. "2.100" → "2.10" is 210. A replacement, a selection deleted or a paste over the shown text ("2.100" → "2.5")
  // is ambiguous and stays as written.
  if (!/^\d+$/u.test(previousRaw) || !/^[\d.]+$/u.test(value)) return value;
  const shown = contextInputText(previousRaw);
  let start = 0;
  while (start < shown.length && start < value.length && shown[start] === value[start]) start += 1;
  let end = 0;
  while (end < shown.length - start && end < value.length - start && shown[shown.length - 1 - end] === value[value.length - 1 - end]) end += 1;
  const removed = shown.slice(start, shown.length - end), inserted = value.slice(start, value.length - end);
  const oneDigitTyped = removed === '' && /^\d$/u.test(inserted), oneCharDeleted = inserted === '' && removed.length === 1;
  return oneDigitTyped || oneCharDeleted ? value.replace(/\./gu, '') : value;
}
export function contextDateLabel(date: string, today: string) {
  const format = new Intl.DateTimeFormat('es-AR', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long', ...(date.slice(0, 4) === today.slice(0, 4) ? {} : { year: 'numeric' }) });
  return format.format(new Date(`${date}T12:00:00Z`)).replace(/,/gu, '').replace(/^./u, c => c.toLocaleUpperCase('es-AR'));
}

export function DayContextEditor({ controller, state, initialField }: { controller: DayWriteController; state: DayWriteState; initialField?: DayContextField }) {
  const { colors } = useOwnlevelTheme(), insets = useSafeAreaInsets();
  const running = state.phase === 'pending' || state.phase === 'confirmed' && state.message === null;
  const beforeDismiss = (proceed: () => void) => {
    if (!state.intent && controller.dirty()) Alert.alert('¿Descartar cambios?', 'Tu borrador no se guardará.', [
      { text: 'Seguir editando', style: 'cancel' }, { text: 'Descartar', style: 'destructive', onPress: proceed },
    ]); else proceed();
  };
  // Same keyboard geometry as the other keyboard sheets (#463): the sheet's safe-area padding hides behind the keyboard.
  return <AppSheet onClose={() => controller.close()} closeLabel="Cerrar el ajuste del día desde el fondo" locked={running} beforeDismiss={beforeDismiss}
    nativeKeyboard={Platform.OS === 'ios'} keyboardViewport keyboardTopInset={insets.top + spacing.md}
    keyboardInset={Math.max(insets.bottom, spacing.lg) - spacing.sm} dismissKeyboardOnClose
    style={{ backgroundColor: colors.background, maxHeight: '100%', flexShrink: 1 }} testID="nutrition-context-sheet">
    <ContextForm controller={controller} state={state} running={running} initialField={initialField} />
  </AppSheet>;
}
function ContextForm({ controller, state, running, initialField }: { controller: DayWriteController; state: DayWriteState; running: boolean; initialField?: DayContextField }) {
  const { colors } = useOwnlevelTheme(), insets = useSafeAreaInsets(), dismiss = useAppSheetDismiss(), d = state.draft!;
  const original = dayWriteDraft(d.kind, d.baseline);
  const changed = FIELDS.filter(f => d[f] !== original[f]);
  const [field, setField] = useState<DayContextField>(() => initialField ?? changed[0] ?? 'target');
  // A validation error on the other value brings that value into view (render-time adjustment, no effect).
  const errorField = FIELDS.find(f => state.errors[f]);
  const [shownError, setShownError] = useState(errorField);
  if (errorField !== shownError) {
    setShownError(errorField);
    if (errorField) setField(errorField);
  }
  const c = d.baseline.nutrition.status === 'ok' && d.baseline.nutrition.data.dayState === 'recorded' ? d.baseline.nutrition.data.context : null;
  const truth = state.truth?.nutrition.status === 'ok' && state.truth.nutrition.data.dayState === 'recorded' ? state.truth.nutrition.data.context : null;
  const editable = state.phase === 'idle' && !state.intent;
  const automatic = (f: DayContextField) => c ? f === 'target' ? c.targetAutomaticKcal : c.expenditureAutomaticKcal : null;
  // The number each value would have after Guardar: its own draft, or the automatic one when the draft is empty.
  const shown = (f: DayContextField) => {
    const raw = d[f].trim();
    if (!raw) { const auto = automatic(f); return auto === null ? '—' : number(auto); }
    return contextInputText(raw);
  };
  const raw = d[field].trim(), auto = automatic(field);
  return <KeyboardAvoidingView enabled={Platform.OS === 'android'} behavior="height" style={styles.shrink}>
    <View style={styles.header}>
      {/* Locked while saving or recovering: switching value must not look like it changes anything. */}
      <View style={styles.segment} pointerEvents={editable ? 'auto' : 'none'} accessibilityElementsHidden={!editable} importantForAccessibility={editable ? 'auto' : 'no-hide-descendants'}>
        <ExerciseSegmented accessibilityLabel="Valor del día" value={field} onChange={setField}
          options={FIELDS.map(f => ({ value: f, label: `${SHORT[f]} ${shown(f)}` }))} />
      </View>
      <NutritionGlassButton icon="close" label="Cerrar el ajuste del día" onPress={running ? undefined : () => dismiss()} />
    </View>
    <ScrollView testID="nutrition-day-write-editor" style={styles.shrink} contentContainerStyle={styles.content} keyboardShouldPersistTaps="always">
      <AppText accessibilityRole="header" muted variant="footnote">{contextDateLabel(d.baseline.date, d.baseline.today)} · solo este día</AppText>
      {c ? <>
        <View style={styles.numberRow}>
          {/* iOS clips a native placeholder at this size, so the automatic value is drawn behind the field instead.
              The same text, invisible, sizes the field while typing. */}
          <View style={styles.numberBox}>
            <AppText numeric variant="heroNumber" muted={!raw} style={[styles.ghost, raw ? styles.hidden : null]} testID="nutrition-context-ghost"
              accessibilityElementsHidden importantForAccessibility="no-hide-descendants">{raw ? contextInputText(d[field]) : auto === null ? '—' : number(auto)}</AppText>
            <TextInput testID="nutrition-context-input" accessibilityLabel={`${TITLE[field]} de este día, en kilocalorías`}
              accessibilityHint={auto === null ? 'Vacío usa el valor automático' : `Vacío usa el automático: ${amount(auto, 'kilocalorías')}`}
              autoFocus={Platform.OS !== 'ios'} editable={editable} keyboardType="number-pad" maxLength={6}
              value={contextInputText(d[field])} onChangeText={text => controller.changeContext(field, contextRawInput(text, d[field]))}
              style={[StyleSheet.absoluteFill, styles.number, { color: colors.text }]} />
          </View>
          <AppText muted variant="title2">kcal</AppText>
        </View>
        <View style={styles.origin}>
          {/* The origin follows the draft: a value written equal to the automatic one is still personal. */}
          {raw ? <AppText variant="subheadline" style={styles.originText}>Personalizado{auto === null ? '' : <AppText muted numeric variant="subheadline"> · automático {amount(auto, 'kcal')}</AppText>}</AppText>
            : <AppText muted variant="subheadline" style={styles.originText}>Automático · según tu plan</AppText>}
          {editable && raw ? <Pressable accessibilityRole="button" accessibilityLabel={`Volver al automático: ${SHORT[field].toLowerCase()}`} onPress={() => controller.changeContext(field, '')} style={styles.link}>
            <AppText variant="subheadline" style={{ color: colors.primary }}>Volver al automático</AppText>
          </Pressable> : null}
        </View>
        {state.errors[field] ? <AppText accessibilityRole="alert" variant="footnote" style={{ color: colors.danger }}>{state.errors[field]}</AppText> : null}
      </> : <AppText accessibilityRole="alert">No hay una lectura confirmada del contexto. Conservamos el borrador.</AppText>}
      {state.phase === 'conflict' ? <View style={styles.conflict}>
        <AppText variant="headline" accessibilityRole="header">Este día cambió</AppText>
        {truth ? <AppText numeric variant="subheadline">Ahora: objetivo {amount(truth.calorieTarget, 'kcal')} · gasto {amount(truth.expenditureKcal, 'kcal')}</AppText> : <AppText variant="subheadline">No pudimos leer los valores actuales. Tu borrador sigue intacto.</AppText>}
        <Button label="Actualizar versión del servidor" variant="secondary" onPress={() => void controller.refreshConflict()} />
        {truth ? <Button label="Revisar mi borrador sobre esta versión" variant="secondary" onPress={() => controller.reviewWithServerVersion()} /> : null}
      </View> : null}
    </ScrollView>
    {/* Pinned under the scroll: the action stays right above the keyboard. */}
    <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.lg) + spacing.xs }]}>
      {state.errors.form ? <AppText accessibilityRole="alert" variant="footnote" style={{ color: colors.danger }}>{state.errors.form}</AppText> : null}
      {state.message ? <AppText accessibilityLiveRegion="polite" accessibilityRole={state.phase === 'idle' ? undefined : 'alert'} variant="footnote" muted={state.phase === 'idle'}>{state.message}</AppText> : null}
      {editable ? <Button label={changed.length === 2 ? 'Guardar los dos' : 'Guardar'} disabled={!c || changed.length === 0} onPress={() => void controller.save()} testID="nutrition-context-save" /> : null}
      {running ? <Button loading label={state.phase === 'confirmed' ? 'Actualizando fecha…' : 'Guardando…'} onPress={() => {}} /> : null}
      {!running && ['uncertain', 'confirmed', 'blocked'].includes(state.phase) ? <Button label={state.intent?.receipt ? 'Actualizar fecha confirmada' : 'Comprobar intento guardado'} onPress={() => void controller.recover()} /> : null}
      {state.intent && !running ? <Button variant="quiet" label="Volver al día · conservar intento" onPress={() => dismiss()} /> : null}
    </View>
  </KeyboardAvoidingView>;
}
const styles = StyleSheet.create({
  shrink: { flexShrink: 1 },
  header: { paddingHorizontal: brandTokens.layout.screenPadding, paddingTop: spacing.xs, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  segment: { flex: 1, minWidth: 0 },
  content: { paddingHorizontal: brandTokens.layout.screenPadding, paddingTop: spacing.md, paddingBottom: spacing.sm, gap: spacing.xs },
  numberRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm },
  numberBox: { minWidth: 48, flexShrink: 1 },
  ghost: { paddingRight: spacing.xs },
  hidden: { opacity: 0 },
  number: { fontSize: brandTokens.typeScale.heroNumber.fontSize, fontWeight: '700', letterSpacing: brandTokens.typeScale.heroNumber.letterSpacing, fontVariant: ['tabular-nums'], padding: 0 },
  origin: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: spacing.sm, minHeight: brandTokens.layout.minTouch },
  originText: { flexShrink: 1 },
  link: { minHeight: brandTokens.layout.minTouch, justifyContent: 'center' },
  conflict: { gap: spacing.sm, paddingTop: spacing.md },
  footer: { paddingHorizontal: brandTokens.layout.screenPadding, paddingTop: spacing.sm, gap: spacing.sm },
});
