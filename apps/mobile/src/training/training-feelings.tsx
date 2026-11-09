import { useState, useSyncExternalStore } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { AppText, Button, brandTokens, useOwnlevelTheme } from '@/design-system';
import { FEELING_LABELS, feelingKeysFor, type FeelingKey, type FeelingsSnapshot, type TrainingFeelingsJournal } from '@/api/training-feelings';
import type { ActiveSessionController } from './active-session-controller';

type Phase = 'pre' | 'post';
const MOMENT: Record<Phase, { title: string; spoken: string; hint: string }> = {
  pre: { title: 'Al empezar', spoken: 'al empezar', hint: 'Opcional. Queda la hora en que respondés, aunque ya hayas empezado.' },
  post: { title: 'Al terminar', spoken: 'al terminar', hint: 'Opcional. Energía y fatiga, cada una por separado. Se guardan con el entrenamiento.' },
};
const scaleOf = (key: FeelingKey) => key.startsWith('energy') ? 'energy' as const : 'fatigue' as const;
const labelOf = (key: FeelingKey) => key.startsWith('energy') ? 'Energía' : 'Fatiga';
const inPhase = (phase: Phase, keys: Iterable<string>) => [...keys].some(key => feelingKeysFor(phase).includes(key as FeelingKey));

/** What this moment's status line says. Drafts and pending operations belong to the moment (or operation) that owns them. */
function phaseStatus(state: FeelingsSnapshot, phase: Phase): string | null {
  if (state.busy) return 'Comprobando sensaciones…';
  if (state.localError) return 'Borrador local sin confirmar';
  if (state.blocked) return 'Necesita revisión';
  if (state.pending) {
    if (state.pending.operation === 'finish') return 'Finalización pendiente de confirmación';
    if (inPhase(phase, Object.keys(state.pending.patch))) return 'Respuestas pendientes de confirmación';
    return `Hay respuestas de ${MOMENT[phase === 'pre' ? 'post' : 'pre'].spoken} pendientes de confirmación`;
  }
  return phase === 'pre' && inPhase('pre', Object.keys(state.patch)) ? 'Sin guardar' : null;
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
  // Only the pre capture folds: it stays above the exercises for the whole session. Anything unconfirmed keeps it open.
  const attention = draft || !!state.pending || state.blocked || state.localError || !!state.error || state.readError;
  const open = phase === 'post' || editing || attention;
  const status = phaseStatus(state, phase);
  const answered = keys.flatMap(key => { const value = journal.value(key); return value === null ? [] : [`${labelOf(key)} ${FEELING_LABELS[scaleOf(key)][value - 1].toLowerCase()}`]; });

  if (!open) {
    return <View style={styles.summary} testID={`feelings-${phase}`}>
      <View style={styles.flex}>
        <AppText variant="headline">{moment.title}</AppText>
        <AppText muted variant="footnote">{answered.length ? answered.join(' · ') : 'Opcional · energía y fatiga'}</AppText>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel={`${answered.length ? 'Editar' : 'Responder'} sensaciones ${moment.spoken}`}
        accessibilityState={{ disabled: locked }} disabled={locked} onPress={() => setEditing(true)} style={styles.link} testID={`feelings-${phase}-edit`}>
        <AppText variant="subheadline" style={{ color: locked ? colors.textMuted : colors.primary, fontWeight: '600' }}>{answered.length ? 'Editar' : 'Responder'}</AppText>
      </Pressable>
    </View>;
  }
  return <View style={styles.block} testID={`feelings-${phase}`}>
    <View style={styles.titleRow}>
      <AppText accessibilityRole="header" variant="headline" style={styles.flex}>{moment.title}</AppText>
      {phase === 'pre' && !attention ? <Pressable accessibilityRole="button" accessibilityLabel={`Listo con las sensaciones ${moment.spoken}`}
        onPress={() => setEditing(false)} style={styles.link}>
        <AppText variant="subheadline" style={{ color: colors.primary, fontWeight: '600' }}>Listo</AppText>
      </Pressable> : null}
    </View>
    <AppText muted variant="caption">{moment.hint}</AppText>
    {state.readError || !state.server ? <AppText accessibilityLiveRegion="polite" variant="footnote">Sin lectura confirmada de sensaciones. Tus respuestas locales se conservan.</AppText> : null}
    {keys.map(key => {
      const label = labelOf(key), anchors = FEELING_LABELS[scaleOf(key)];
      const value = journal.value(key);
      // No separate "Quitar" button: tapping the chosen value again leaves it unanswered (announced in the hint).
      return <View key={key} style={styles.scale} accessibilityRole="radiogroup" accessibilityLabel={`${label}, ${moment.spoken}, opcional`}>
        <AppText variant="subheadline">{label}{value !== null ? ` · ${anchors[value - 1]}` : ''}</AppText>
        <View style={styles.options}>{anchors.map((anchor, index) => <Pressable key={anchor} accessibilityRole="radio"
          accessibilityLabel={`${label}: ${anchor}, ${index + 1} de 5`} accessibilityHint="Tocá de nuevo para quitar la respuesta"
          accessibilityState={{ selected: value === index + 1, disabled: locked }} disabled={locked}
          onPress={() => void journal.change(key, value === index + 1 ? null : index + 1)}
          style={[styles.option, { borderColor: value === index + 1 ? colors.primary : colors.border, backgroundColor: colors.surface }]}>
          <AppText numeric style={{ color: value === index + 1 ? colors.primary : colors.text }} variant="headline">{index + 1}</AppText>
        </Pressable>)}</View>
        <View style={styles.ends}><AppText muted variant="caption" style={styles.flex}>{anchors[0]}</AppText><AppText muted variant="caption" style={[styles.flex, styles.end]}>{anchors[4]}</AppText></View>
      </View>;
    })}
    {status ? <AppText muted accessibilityLiveRegion="polite" variant="footnote">{status}</AppText> : null}
    {/* The journal sends every unsent answer with the next operation: say so where it happens, never as this moment's answer. */}
    {otherDraft && !state.pending ? <AppText muted variant="footnote">{phase === 'post'
      ? 'Tus respuestas de al empezar sin guardar también se guardan con el entrenamiento.'
      : 'Guardar también envía tus respuestas de al terminar sin guardar.'}</AppText> : null}
    {state.error ? <AppText accessibilityLiveRegion="polite" variant="footnote">{state.error}</AppText> : null}
    {state.localError ? <AppText variant="footnote">No se confirmó el borrador local. Revisá y volvé a elegir tus respuestas antes de finalizar.</AppText> : null}
    {state.blocked ? <View style={styles.block}>
      <AppText variant="footnote">Guardado: {Object.entries(state.server?.values ?? {}).map(([key, fact]) => `${labelOf(key as FeelingKey)} ${key.endsWith('Pre') ? MOMENT.pre.spoken : MOMENT.post.spoken}: ${fact?.value}`).join(' · ') || 'Sin respuestas confirmadas'}</AppText>
      <Button label="Conservar lo guardado" variant="secondary" disabled={state.busy} onPress={() => void controller.resolveFeelings('server')} />
      <Button label="Revisar mis respuestas para reenviar" variant="quiet" disabled={state.busy} onPress={() => void controller.resolveFeelings('mine')} />
    </View> : state.pending ? <Button label="Comprobar operación pendiente" variant="secondary" disabled={state.busy || disabled}
      onPress={() => void (state.pending?.operation === 'finish' ? controller.getSnapshot().intent ? controller.retryIntent() : controller.finish() : journal.retry())} />
      : phase === 'pre' && draft ? <Button label="Guardar sensaciones" variant="secondary" disabled={locked}
        onPress={() => void journal.save().then(saved => { if (saved) setEditing(false); })} /> : null}
    {state.readError && !state.pending ? <Button label="Volver a leer sensaciones" variant="quiet" disabled={state.busy} onPress={() => void journal.refresh()} /> : null}
  </View>;
}
const styles = StyleSheet.create({
  block: { gap: brandTokens.space.xs }, scale: { gap: brandTokens.space.xxs }, options: { flexDirection: 'row', gap: brandTokens.space.xs },
  summary: { flexDirection: 'row', alignItems: 'center', gap: brandTokens.space.sm, minHeight: brandTokens.layout.minTouch },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: brandTokens.space.sm },
  link: { minHeight: brandTokens.layout.minTouch, minWidth: brandTokens.layout.minTouch, justifyContent: 'center', alignItems: 'flex-end' },
  option: { flex: 1, minHeight: brandTokens.layout.minTouch, borderWidth: 1, borderRadius: brandTokens.radius.chip, alignItems: 'center', justifyContent: 'center', padding: brandTokens.space.xxs },
  ends: { flexDirection: 'row', gap: brandTokens.space.xs }, flex: { flex: 1 }, end: { textAlign: 'right' },
});
