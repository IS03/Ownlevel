import { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText, Button, spacing } from '@/design-system';
import type { MealController, MealEditorState } from './meal-controller';

/**
 * The recovery UI of a delete that started from the day (undo, swipe, detail trash): the controller keeps its editor
 * `headless`, so `MealEditor` never shows it and the day's own banner stays quiet. Without this the day would stay locked
 * with no visible state and no action (#499).
 *
 * Presentation only. It reads the controller's state and calls the same explicit actions the editor's recovery uses
 * (`recover`, `refreshConflict`, `close`): the stored intent, its idempotency key and the CAS token are never touched here,
 * nothing is sent twice and the server version is never adopted (`reviewWithServerVersion` is deliberately not offered: it
 * would keep the editor headless and take the new `updatedAt`). Success is told by the day's notice, never by this panel.
 */
export function MealRecoveryPanel({ controller, state, undoing = false }: {
  controller: MealController; state: MealEditorState;
  /** A delete/undo of this day is running: its own toast already says so. */
  undoing?: boolean;
}) {
  // `recover()` guards a re-send with its own busy flag, but not the storage check: one flight at a time, from the first tap.
  const [checking, setChecking] = useState(false);
  const inFlight = useRef(false);
  const { editor, phase, message, intent, truth, truthDate } = state;
  if (!editor?.headless || undoing) return null;
  const run = async (action: () => Promise<void>) => {
    if (inFlight.current) return;
    inFlight.current = true; setChecking(true);
    try { await action(); } finally { inFlight.current = false; setChecking(false); }
  };
  const check = () => run(async () => {
    await controller.recover();
    const next = controller.getSnapshot();
    // The storage was readable and held nothing: no delete was ever sent, so no hidden editor may stay behind and lock the day.
    if (next.editor?.headless && next.phase === 'idle' && !next.intent) controller.close();
  });
  const close = <Button label="Cerrar" variant={phase === 'conflict' && truthDate ? 'secondary' : 'primary'} onPress={() => controller.close()} />;

  if (checking || phase === 'pending') return <View accessibilityState={{ busy: true }} style={styles.panel} testID="meal-recovery-panel"><AppText muted>Comprobando…</AppText></View>;
  if (phase === 'uncertain' || phase === 'confirmed' || phase === 'blocked') {
    // A confirmed delete whose days are still being re-read has no message yet: the toast is still the one speaking.
    if (!message) return null;
    const label = intent ? intent.receipt ? 'Actualizar días confirmados' : 'Comprobar intento guardado' : 'Comprobar almacenamiento';
    return <View style={styles.panel} testID="meal-recovery-panel"><AppText accessibilityRole="alert">{message}</AppText><Button label={label} onPress={() => void check()} /></View>;
  }
  if (phase === 'conflict' && truthDate) {
    // MEAL_CHANGED always carries the day where the meal lives now (the API contract rejects it otherwise).
    return <View style={styles.panel} testID="meal-recovery-panel">
      <AppText accessibilityRole="alert">La comida cambió. No la eliminamos.</AppText>
      {truth ? <AppText muted numeric>{`Ahora: ${truth.title || truth.description || 'Comida'} · ${truth.calories ?? 'sin dato'} kcal`}</AppText> : null}
      <Button label="Actualizar" variant="quiet" onPress={() => void run(() => controller.refreshConflict())} />
      {close}
    </View>;
  }
  if (phase === 'conflict' || phase === 'duplicate' || (phase === 'idle' && message)) {
    return <View style={styles.panel} testID="meal-recovery-panel"><AppText accessibilityRole="alert">{message || 'No pudimos eliminar la comida.'}</AppText>{close}</View>;
  }
  return null;
}
const styles = StyleSheet.create({ panel: { gap: spacing.md } });
