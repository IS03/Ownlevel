import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, SlideInDown, useAnimatedKeyboard, useAnimatedStyle } from 'react-native-reanimated';
import { AppIcon, AppText, Button, GlassSurface, SheetHandle, pressedStyle, useOwnlevelTheme, useReduceMotion } from '@/design-system';
import { triggerHaptic } from '@/platform/haptics';
import { ExerciseSegmented } from '@/training/exercise-segmented';
import type { DayWriteController, DayWriteState } from './day-write-controller';
import { metricValue } from './day-details';
import { findDayMetric, metricEntryCandidate, metricRaw, type MetricEntryMode } from './metric-entry-model';
import type { MetricInput } from './day-write-model';
import { MetricDuration } from './metric-duration';

function SheetControl({ label, icon, disabled, accent, pending, onPress }: {
  label: string; icon: 'close' | 'checkmark'; disabled: boolean; accent?: boolean; pending?: boolean; onPress: () => void;
}) {
  const { colors } = useOwnlevelTheme(), reduced = useReduceMotion();
  return <Pressable accessibilityLabel={label} accessibilityRole="button" accessibilityState={{ disabled, busy: pending }} disabled={disabled} onPress={onPress} style={({ pressed }) => pressedStyle(pressed, reduced)}>
    <GlassSurface interactive style={[styles.control, accent && { backgroundColor: colors.primary }, disabled && { opacity: 0.4 }]}>
      <AppIcon name={icon} color={accent ? colors.onPrimary : colors.text} size={20} />
    </GlassSurface>
  </Pressable>;
}
/**
 * iOS: the sheet sits on the keyboard, frame by frame, so both rise in one motion. KeyboardAvoidingView
 * and the Modal's own fade let the keyboard arrive first and the value end up under it.
 */
function KeyboardSpacer({ rest }: { rest: number }) {
  const keyboard = useAnimatedKeyboard();
  const style = useAnimatedStyle(() => ({ height: Math.max(keyboard.height.value + 8 - rest, 0) }));
  return <Animated.View style={style} />;
}
export function MetricEntrySheet({ id, controller, state, onClose }: { id: string; controller: DayWriteController; state: DayWriteState; onClose: () => void }) {
  const draft = state.draft;
  const metric = draft ? findDayMetric(draft.baseline, id) : undefined;
  return draft?.kind === 'metrics' && metric ? <MetricForm key={`${draft.baseline.date}:${id}`} id={id} controller={controller} state={state} onClose={onClose} /> : null;
}
function MetricForm({ id, controller, state, onClose }: { id: string; controller: DayWriteController; state: DayWriteState; onClose: () => void }) {
  const draft = state.draft!, data = draft.baseline, metric = findDayMetric(data, id)!;
  const { colors } = useOwnlevelTheme(), insets = useSafeAreaInsets(), reduced = useReduceMotion();
  const [mode, setMode] = useState<MetricEntryMode>(metric.value === null ? 'replace' : 'add');
  const duration = metric.valueType === 'duration';
  // A typed number starts empty with a grey "0" behind it: typing 500 gives 500, never 0500.
  // Durations keep their wheels at 0 h 0 min when there is something to add to.
  const [raw, setRaw] = useState<MetricInput>(() => metricRaw(duration && metric.value !== null ? 0 : null, duration));
  const input = useRef<TextInput>(null);
  const [removing, setRemoving] = useState(false);
  const restInset = Math.max(insets.bottom, 16);
  const running = state.phase === 'pending';
  const locked = !!state.intent || !['idle', 'conflict'].includes(state.phase);
  const candidate = metricEntryCandidate(data, id, mode, raw);
  const invalid = !candidate || !!candidate.error;
  const dayLabel = new Intl.DateTimeFormat('es-AR', { timeZone: 'UTC', weekday: 'long', day: 'numeric' }).format(new Date(`${data.date}T12:00:00Z`))
    .replace(/,/gu, '').replace(/^./u, c => c.toLocaleUpperCase('es-AR'));
  const relative = data.date === data.today ? 'hoy' : 'este día';
  const subtitle = `${dayLabel} · ${metric.value === null ? `sin dato ${relative}` : `llevás ${metricValue(metric, metric.value)}${metric.target === null ? '' : ` de ${metricValue(metric, metric.target)}`}`}`;
  useEffect(() => { if (state.phase === 'uncertain' || state.phase === 'blocked') triggerHaptic('systemError'); }, [state.phase]);
  const apply = (next: MetricInput, nextMode: MetricEntryMode, baseline = data) => {
    const nextCandidate = metricEntryCandidate(baseline, id, nextMode, next);
    const current = findDayMetric(baseline, id);
    // An invalid entry never changes the canonical draft to null or zero.
    const value = nextCandidate?.value;
    if (current && value !== undefined) {
      const canonical = metricRaw(value, current.valueType === 'duration');
      for (const field of ['value', 'hours', 'minutes'] as const) controller.changeMetric(id, field, canonical[field]);
    }
    setRaw(next); setRemoving(false);
  };
  const changeMode = (next: MetricEntryMode) => {
    if (locked) return;
    setMode(next);
    // Replace starts empty too (the current value stays visible as the grey placeholder); the keyboard stays up.
    apply(metricRaw(duration ? next === 'replace' ? metric.value : 0 : null, duration), next);
    if (!duration) input.current?.focus();
  };
  const review = () => {
    controller.reviewWithServerVersion();
    const next = controller.getSnapshot();
    if (next.phase !== 'idle' || !next.draft) return;
    if (removing) for (const field of ['value', 'hours', 'minutes'] as const) controller.changeMetric(id, field, '');
    else apply(raw, mode, next.draft.baseline);
  };
  const remove = () => {
    if (locked || state.phase !== 'idle' || metric.value === null) return;
    setRemoving(true);
    for (const field of ['value', 'hours', 'minutes'] as const) controller.changeMetric(id, field, '');
    void controller.save();
  };
  const truth = state.truth ? findDayMetric(state.truth, id) : undefined;
  const saveDisabled = locked || state.phase !== 'idle' || (!removing && (invalid || !candidate?.valid));
  return <Modal transparent statusBarTranslucent visible animationType="none" onRequestClose={() => { if (!running) onClose(); }}>
    <KeyboardAvoidingView enabled={Platform.OS === 'android'} behavior="height" style={styles.fill}>
      <Animated.View entering={FadeIn.duration(200)} style={StyleSheet.absoluteFill}>
        <Pressable accessibilityLabel="Cerrar carga de métrica" disabled={running} onPress={onClose} style={[StyleSheet.absoluteFill, styles.scrim]} />
      </Animated.View>
      <Animated.View entering={reduced ? FadeIn.duration(200) : SlideInDown.duration(300)} accessibilityViewIsModal style={[styles.sheet, { backgroundColor: colors.background, paddingBottom: restInset }]} testID="nutrition-metric-sheet">
        <SheetHandle />
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
          <View style={styles.header}>
            <SheetControl label={`Cerrar ${metric.label} sin guardar`} icon="close" disabled={running} onPress={onClose} />
            <View style={styles.title}><AppText accessibilityRole="header" variant="headline" style={styles.center}>{metric.label}</AppText>
              <AppText muted numeric variant="caption" style={styles.center}>{subtitle}</AppText></View>
            <SheetControl label={`Guardar ${metric.label}`} icon="checkmark" disabled={saveDisabled} accent pending={running} onPress={() => void controller.save()} />
          </View>
          {metric.value !== null ? <View pointerEvents={locked ? 'none' : 'auto'} accessibilityElementsHidden={locked}>
            <ExerciseSegmented accessibilityLabel="Cómo cargar la métrica" value={mode} options={[{ value: 'add', label: `Sumar a ${relative}` }, { value: 'replace', label: 'Reemplazar' }]} onChange={changeMode} />
          </View> : null}
          {metric.valueType === 'duration' ? <MetricDuration value={raw} disabled={locked} onChange={next => apply(next, mode)} />
            : <View style={styles.numberRow}><TextInput ref={input} accessibilityLabel={`Valor de ${metric.label}`} autoFocus editable={!locked} keyboardType={metric.valueType === 'decimal' ? 'decimal-pad' : 'number-pad'}
              value={raw.value} placeholder={mode === 'replace' && metric.value !== null ? metricRaw(metric.value, false).value : '0'} placeholderTextColor={colors.textMuted} onChangeText={value => apply({ ...raw, value }, mode)}
              style={[styles.number, { color: colors.text }]} /><AppText muted variant="title2">{metric.unit}</AppText></View>}
          <AppText accessibilityLiveRegion="polite" muted numeric variant="footnote" style={styles.center} testID="nutrition-metric-preview">
            {removing ? 'Quedaría sin dato' : !duration && raw.value.trim() === '' ? mode === 'add' ? 'Escribí cuánto sumar' : metric.value === null ? `Escribí el valor de ${relative}` : 'Escribí el nuevo valor'
              : invalid ? 'Ingresá un valor válido' : `Quedaría en ${metricValue(metric, candidate!.value)}`}
          </AppText>
          {state.errors[id] || state.errors.form ? <AppText accessibilityRole="alert">{state.errors[id] ?? state.errors.form}</AppText> : null}
          {state.message ? <AppText accessibilityRole="alert">{state.message}</AppText> : null}
          {state.phase === 'conflict' ? <View style={styles.status}>
            <AppText variant="headline">El valor cambió</AppText>
            <AppText numeric>{truth ? `Ahora: ${metricValue(truth, truth.value)}` : 'No pudimos confirmar el valor actual. Tu entrada sigue guardada.'}</AppText>
            <Button label="Actualizar versión del servidor" variant="quiet" onPress={() => void controller.refreshConflict()} />
            {truth ? <Button label="Revisar mi entrada sobre esta versión" variant="secondary" onPress={review} /> : null}
          </View> : null}
          {running ? <AppText accessibilityRole="alert" muted style={styles.center}>Guardando…</AppText> : null}
          {['uncertain', 'confirmed', 'blocked'].includes(state.phase) ? <Button label={state.intent?.receipt ? 'Actualizar fecha confirmada' : 'Comprobar intento guardado'} onPress={() => void controller.recover()} /> : null}
          {metric.value !== null ? <Pressable accessibilityRole="button" accessibilityLabel={`Quitar el valor de ${relative}`} accessibilityState={{ disabled: locked || state.phase !== 'idle' }} disabled={locked || state.phase !== 'idle'} onPress={remove} style={styles.remove}>
            <AppText muted variant="footnote">{`Quitar el valor de ${relative}`}</AppText>
          </Pressable> : null}
        </ScrollView>
        {Platform.OS === 'ios' ? <KeyboardSpacer rest={restInset} /> : null}
      </Animated.View>
    </KeyboardAvoidingView>
  </Modal>;
}
const styles = StyleSheet.create({
  fill: { flex: 1, justifyContent: 'flex-end' }, scrim: { backgroundColor: 'rgba(0,0,0,0.3)' },
  sheet: { maxHeight: '90%', borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingTop: 8 },
  content: { padding: 16, gap: 16 }, header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { flex: 1, gap: 4 }, center: { textAlign: 'center' }, control: { width: 44, height: 44, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  numberRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: 8, paddingTop: 8 },
  number: { fontSize: 48, fontWeight: '700', fontVariant: ['tabular-nums'], textAlign: 'center', minWidth: 32, minHeight: 64, padding: 0 }, status: { gap: 12 }, remove: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
});
