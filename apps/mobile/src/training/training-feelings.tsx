import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { AppText, Button, brandTokens, useOwnlevelTheme, useReduceMotion } from '@/design-system';
import { FEELING_LABELS, feelingKeysFor, type FeelingKey, type FeelingsSnapshot, type TrainingFeelingsJournal } from '@/api/training-feelings';
import type { ActiveSessionController } from './active-session-controller';
import { FinishScaleControl } from './finish-controls';
import { ScaleHeader, scaleStyles } from './scale-header';

type Phase = 'pre' | 'post';
const MOMENT: Record<Phase, { title: string; spoken: string; hint: string }> = {
  pre: { title: 'Al empezar', spoken: 'al empezar', hint: 'Opcional. Queda la hora en que respondés, aunque ya hayas empezado.' },
  post: { title: 'Al terminar', spoken: 'al terminar', hint: 'Opcional' },
};
const scaleOf = (key: FeelingKey) => key.startsWith('energy') ? 'energy' as const : 'fatigue' as const;
const labelOf = (key: FeelingKey) => key.startsWith('energy') ? 'Energía' : 'Fatiga';
const inPhase = (phase: Phase, keys: Iterable<string>) => [...keys].some(key => feelingKeysFor(phase).includes(key as FeelingKey));
const UNREAD = 'Sin lectura confirmada de sensaciones. Tus respuestas locales se conservan.';

/**
 * What this moment's status line says. Drafts and pending operations belong to the moment (or operation) that owns them.
 * A plain answer briefly marks the journal busy: that is not a check, so it never flashes a line under the scales.
 */
function phaseStatus(state: FeelingsSnapshot, phase: Phase): string | null {
  if (state.busy && (state.pending || state.readError || state.blocked)) return 'Comprobando sensaciones…';
  if (state.localError) return 'Borrador local sin confirmar';
  if (state.blocked) return 'Necesita revisión';
  if (state.pending) {
    if (state.pending.operation === 'finish') return 'Finalización pendiente de confirmación';
    if (inPhase(phase, Object.keys(state.pending.patch))) return 'Respuestas pendientes de confirmación';
    return `Hay respuestas de ${MOMENT[phase === 'pre' ? 'post' : 'pre'].spoken} pendientes de confirmación`;
  }
  return phase === 'pre' && inPhase('pre', Object.keys(state.patch)) ? 'Sin guardar' : null;
}

/**
 * Local expansion (#462): only this panel's height and opacity move, about 300 ms on the UI thread, so the exercises below
 * follow it frame by frame instead of jumping, and the scroll offset is never touched. No global LayoutAnimation: it would
 * also animate the session's scroll view, its reorderable list and their measured heights. Reduce Motion: a fade only.
 * Folded, the scales stay mounted (already measured, so opening never starts from a guess) but hidden from VoiceOver and touch.
 */
function Reveal({ open, children, testID }: { open: boolean; children: ReactNode; testID: string }) {
  const reduceMotion = useReduceMotion();
  const progress = useSharedValue(open ? 1 : 0), target = useSharedValue(open ? 1 : 0), height = useSharedValue(-1);
  useEffect(() => {
    target.set(open ? 1 : 0);
    progress.set(withTiming(open ? 1 : 0, { duration: reduceMotion ? brandTokens.motion.duration.fast : brandTokens.motion.duration.base, easing: Easing.bezier(...brandTokens.motion.easing) }));
  }, [open, reduceMotion, progress, target]);
  // Until the content reports its height (one layout pass) the panel takes none, open or not: never a guessed height.
  const style = useAnimatedStyle(() => ({ height: Math.max(0, height.get()) * (reduceMotion ? target.get() : progress.get()), opacity: progress.get() }), [reduceMotion]);
  return <Animated.View style={[styles.reveal, style]} pointerEvents={open ? 'auto' : 'none'} accessibilityElementsHidden={!open}
    importantForAccessibility={open ? 'auto' : 'no-hide-descendants'} testID={testID}>
    {/* Measured out of flow, so its natural height never depends on the panel's current one. A line appearing inside
        (Guardar, a status) grows the panel smoothly too, instead of pushing the list in one frame. */}
    <View style={styles.measure} onLayout={event => {
      const next = event.nativeEvent.layout.height;
      height.set(height.get() < 0 || reduceMotion ? next : withTiming(next, { duration: brandTokens.motion.duration.fast }));
    }}>{children}</View>
  </Animated.View>;
}

export function TrainingFeelings({ journal, phase, disabled = false, controller }: {
  journal: TrainingFeelingsJournal; phase: Phase; disabled?: boolean; controller: ActiveSessionController;
}) {
  const state = useSyncExternalStore(journal.subscribe, journal.getSnapshot, journal.getSnapshot);
  const { colors } = useOwnlevelTheme();
  const [editing, setEditing] = useState(false);
  const keys = feelingKeysFor(phase), moment = MOMENT[phase];
  const locked = disabled || !state.ready || state.busy || !!state.pending || state.blocked;
  const draft = inPhase(phase, Object.keys(state.patch));
  const otherDraft = inPhase(phase === 'pre' ? 'post' : 'pre', Object.keys(state.patch));
  // Only the pre capture folds: it stays above the exercises for the whole session. Its scales stay open while they hold
  // something unsent (a draft, or a local draft that was not confirmed). Pending writes, conflicts and failed reads keep their
  // notice and action visible below, folded or not, without unfolding the scales on their own (nor for the other moment's work).
  const pinned = phase === 'post' || draft || state.localError;
  const open = pinned || editing;
  const status = phaseStatus(state, phase);
  const readNotice = state.readError ? state.error ?? UNREAD : null;
  const answered = keys.flatMap(key => { const value = journal.value(key); return value === null ? [] : [`${labelOf(key)} ${FEELING_LABELS[scaleOf(key)][value - 1].toLowerCase()}`]; });
  const toggleLabel = open ? 'Listo' : answered.length ? 'Editar' : 'Responder';

  return <View style={styles.block} testID={`feelings-${phase}`}>
    <View style={styles.titleRow}>
      <View style={styles.flex}>
        <AppText accessibilityRole="header" variant="headline">{moment.title}</AppText>
        <AppText muted variant="footnote">{open ? moment.hint : answered.length ? answered.join(' · ') : 'Opcional · energía y fatiga'}</AppText>
      </View>
      {/* One button that changes its words, so VoiceOver focus stays on it when the panel opens or folds. */}
      {phase === 'pre' && !pinned ? <Pressable accessibilityRole="button"
        accessibilityLabel={open ? `Listo con las sensaciones ${moment.spoken}` : `${toggleLabel} sensaciones ${moment.spoken}`}
        accessibilityState={{ expanded: open, disabled: !open && locked }} disabled={!open && locked} onPress={() => setEditing(value => !value)}
        style={styles.link} testID={`feelings-${phase}-edit`}>
        <AppText variant="subheadline" style={{ color: !open && locked ? colors.textMuted : colors.primary, fontWeight: '600' }}>{toggleLabel}</AppText>
      </Pressable> : null}
    </View>
    <Reveal open={open} testID={`feelings-${phase}-panel`}>
      <View style={styles.panel}>
        {!state.server && !state.readError ? <AppText accessibilityLiveRegion="polite" variant="footnote">{UNREAD}</AppText> : null}
        {keys.map(key => {
          const label = labelOf(key), anchors = FEELING_LABELS[scaleOf(key)];
          const value = journal.value(key);
          return <View key={key} style={scaleStyles.scale}>
            <ScaleHeader label={label} state={value !== null ? anchors[value - 1] : null} />
            {/* The finish sheet's control: Liquid Glass pill, drag to settle, a second tap clears, one tick per accepted change. */}
            <FinishScaleControl field={key} label={label} anchors={anchors} groupLabel={`${label}, ${moment.spoken}, opcional`} value={value}
              disabled={locked} onChange={next => void journal.change(key, next)} />
            <View style={scaleStyles.ends}><AppText muted variant="caption" style={styles.flex}>{anchors[0]}</AppText><AppText muted variant="caption" style={[styles.flex, styles.end]}>{anchors[4]}</AppText></View>
          </View>;
        })}
        {phase === 'pre' && draft && !state.pending && !state.blocked ? <>
          {otherDraft ? <AppText muted variant="footnote">Guardar también envía tus respuestas de al terminar sin guardar.</AppText> : null}
          <Button label="Guardar sensaciones" variant="secondary" disabled={locked} onPress={() => void journal.save().then(saved => { if (saved) setEditing(false); })} />
        </> : null}
      </View>
    </Reveal>
    {/* Recovery stays outside the folding panel: whatever is unsent, uncertain or unread is always said, with its action. */}
    {status ? <AppText muted accessibilityLiveRegion="polite" variant="footnote">{status}</AppText> : null}
    {/* The journal sends every unsent answer with the next operation: say so where it happens, never as this moment's answer. */}
    {phase === 'post' && otherDraft && !state.pending ? <AppText muted variant="footnote">Tus respuestas de al empezar sin guardar también se guardan con el entrenamiento.</AppText> : null}
    {readNotice ? <AppText accessibilityLiveRegion="polite" variant="footnote">{readNotice}</AppText> : null}
    {state.error && !state.readError ? <AppText accessibilityLiveRegion="polite" variant="footnote">{state.error}</AppText> : null}
    {state.localError ? <AppText variant="footnote">No se confirmó el borrador local. Revisá y volvé a elegir tus respuestas antes de finalizar.</AppText> : null}
    {state.blocked ? <View style={styles.block}>
      <AppText variant="footnote">Guardado: {Object.entries(state.server?.values ?? {}).map(([key, fact]) => `${labelOf(key as FeelingKey)} ${key.endsWith('Pre') ? MOMENT.pre.spoken : MOMENT.post.spoken}: ${fact?.value}`).join(' · ') || 'Sin respuestas confirmadas'}</AppText>
      <Button label="Conservar lo guardado" variant="secondary" disabled={state.busy} onPress={() => void controller.resolveFeelings('server')} />
      <Button label="Revisar mis respuestas para reenviar" variant="quiet" disabled={state.busy} onPress={() => void controller.resolveFeelings('mine')} />
    </View> : state.pending ? <Button label="Comprobar operación pendiente" variant="secondary" disabled={state.busy || disabled}
      onPress={() => void (state.pending?.operation === 'finish' ? controller.getSnapshot().intent ? controller.retryIntent() : controller.finish() : journal.retry())} /> : null}
    {state.readError && !state.pending ? <Button label="Volver a leer sensaciones" variant="quiet" disabled={state.busy} onPress={() => void journal.refresh()} /> : null}
  </View>;
}
const styles = StyleSheet.create({
  block: { gap: brandTokens.space.xs }, panel: { gap: brandTokens.space.lg, paddingTop: brandTokens.space.xxs },
  reveal: { overflow: 'hidden' }, measure: { position: 'absolute', top: 0, left: 0, right: 0 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: brandTokens.space.sm, minHeight: brandTokens.layout.minTouch },
  link: { minHeight: brandTokens.layout.minTouch, minWidth: brandTokens.layout.minTouch, justifyContent: 'center', alignItems: 'flex-end' },
  flex: { flex: 1 }, end: { textAlign: 'right' },
});
