import { useSyncExternalStore } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { AppText, Button, brandTokens, useOwnlevelTheme } from '@/design-system';
import { FEELING_LABELS, feelingKeysFor, type TrainingFeelingsJournal } from '@/api/training-feelings';
import type { ActiveSessionController } from './active-session-controller';

export function TrainingFeelings({ journal, phase, disabled = false, controller }: {
  journal: TrainingFeelingsJournal; phase: 'pre' | 'post'; disabled?: boolean; controller: ActiveSessionController;
}) {
  const state = useSyncExternalStore(journal.subscribe, journal.getSnapshot, journal.getSnapshot);
  const { colors } = useOwnlevelTheme();
  const locked = disabled || !state.ready || state.busy || !!state.pending || state.blocked;
  return <View style={styles.block} testID={`feelings-${phase}`}>
    <AppText variant="headline">{phase === 'pre' ? 'Cómo estás ahora' : 'Cómo terminaste'}</AppText>
    <AppText muted variant="caption">Opcional. {phase === 'pre' ? 'La hora de tu respuesta queda registrada, aunque ya empezaste.' : 'Energía y fatiga son respuestas independientes.'}</AppText>
    {state.readError || !state.server ? <AppText accessibilityLiveRegion="polite" variant="footnote">Sin lectura confirmada de sensaciones. Tus respuestas locales se conservan.</AppText> : null}
    {feelingKeysFor(phase).map(key => {
      const label = key.startsWith('energy') ? 'Energía' : 'Fatiga';
      const anchors = FEELING_LABELS[key.startsWith('energy') ? 'energy' : 'fatigue'];
      const value = journal.value(key);
      return <View key={key} style={styles.scale} accessibilityRole="radiogroup" accessibilityLabel={`${label}, ${phase === 'pre' ? 'al registrar ahora' : 'cómo terminaste'}, opcional`}>
        <AppText variant="subheadline">{label}{value !== null ? ` · ${anchors[value - 1]}` : ''}</AppText>
        <View style={styles.options}>{anchors.map((anchor, index) => <Pressable key={anchor} accessibilityRole="radio"
          accessibilityLabel={`${label}: ${anchor}, ${index + 1} de 5`} accessibilityHint="Tocá de nuevo para quitar la respuesta"
          accessibilityState={{ selected: value === index + 1, disabled: locked }} disabled={locked}
          onPress={() => void journal.change(key, value === index + 1 ? null : index + 1)}
          style={[styles.option, { borderColor: value === index + 1 ? colors.primary : colors.border, backgroundColor: colors.surface }]}>
          <AppText numeric style={{ color: value === index + 1 ? colors.primary : colors.text }} variant="headline">{index + 1}</AppText>
        </Pressable>)}</View>
        <View style={styles.ends}><AppText muted variant="caption" style={styles.flex}>{anchors[0]}</AppText><AppText muted variant="caption" style={[styles.flex, styles.end]}>{anchors[4]}</AppText></View>
        {value !== null ? <Button label={`Quitar ${label.toLowerCase()}`} variant="quiet" disabled={locked} onPress={() => void journal.change(key, null)} /> : null}
      </View>;
    })}
    <AppText muted accessibilityLiveRegion="polite" variant="footnote">{state.busy ? 'Comprobando sensaciones…' : state.localError ? 'Borrador local sin confirmar' : state.blocked ? 'Necesita revisión' : journal.hasWork() ? 'Respuestas pendientes de confirmación' : state.server ? 'Sin respuestas pendientes' : 'Lectura pendiente'}</AppText>
    {state.error ? <AppText accessibilityLiveRegion="polite" variant="footnote">{state.error}</AppText> : null}
    {state.localError ? <AppText variant="footnote">No se confirmó el borrador local. Revisá y volvé a elegir tus respuestas antes de finalizar.</AppText> : null}
    {state.blocked ? <View style={styles.block}>
      <AppText variant="footnote">Guardado: {Object.entries(state.server?.values ?? {}).map(([key, fact]) => `${key.startsWith('energy') ? 'Energía' : 'Fatiga'} ${key.endsWith('Pre') ? 'pre' : 'post'}: ${fact?.value}`).join(' · ') || 'Sin respuestas confirmadas'}</AppText>
      <Button label="Conservar lo guardado" variant="secondary" disabled={state.busy} onPress={() => void controller.resolveFeelings('server')} />
      <Button label="Revisar mis respuestas para reenviar" variant="quiet" disabled={state.busy} onPress={() => void controller.resolveFeelings('mine')} />
    </View> : state.pending ? <Button label="Comprobar operación pendiente" variant="secondary" disabled={state.busy || disabled}
      onPress={() => void (state.pending?.operation === 'finish' ? controller.getSnapshot().intent ? controller.retryIntent() : controller.finish() : journal.retry())} />
      : phase === 'pre' && journal.hasWork() ? <Button label="Guardar sensaciones" variant="secondary" disabled={locked} onPress={() => void journal.save()} /> : null}
    {state.readError && !state.pending ? <Button label="Volver a leer sensaciones" variant="quiet" disabled={state.busy} onPress={() => void journal.refresh()} /> : null}
  </View>;
}
const styles = StyleSheet.create({
  block: { gap: brandTokens.space.xs }, scale: { gap: brandTokens.space.xxs }, options: { flexDirection: 'row', gap: brandTokens.space.xs },
  option: { flex: 1, minHeight: brandTokens.layout.minTouch, borderWidth: 1, borderRadius: brandTokens.radius.chip, alignItems: 'center', justifyContent: 'center', padding: brandTokens.space.xxs },
  ends: { flexDirection: 'row', gap: brandTokens.space.xs }, flex: { flex: 1 }, end: { textAlign: 'right' },
});
