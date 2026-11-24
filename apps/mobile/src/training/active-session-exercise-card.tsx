import { memo, type ReactNode, useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Alert, Keyboard, Pressable, Platform, StyleSheet, TextInput, View } from 'react-native';
import { AppIcon, AppText, Button, radius, sizes, spacing, useOwnlevelTheme, useReduceMotion, brandTokens } from '@/design-system';
import Animated, { FadeIn, FadeInUp, LinearTransition, ZoomIn, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { SessionNextOptions } from './session-next-options';
import { SessionNextTrigger } from './session-next-trigger';
import type { NextSessionDecision } from './session-next-options.types';
import { SessionGlassButton } from './session-glass-button';
import { haptics, triggerHaptic } from '@/platform/haptics';
import type { ActiveSessionController, ExercisePhase } from './active-session-controller';
import { appendSessionSet, compactActual, draftIncomplete, nextReminder, removeSessionSet, resetSessionSet, setProgress, type SessionExerciseDraft } from './active-session-model';
import { SessionRestDuration } from './session-rest-duration';
import { restSeconds } from './active-session-model';
import { LoadPatternRow } from './load-pattern-row';
import type { LoadPattern } from '@/api/active-session';
import { formatRest, muscleGroupLabel } from './exercise-library-model';
import { SessionNoteSheet } from './active-session-sheets';
import { NativeDragHandle, NativeReorderItem, NativeReorderList, NativeSwipeActions } from './session-native-interactions';

const statusLabels: Partial<Record<ExercisePhase, string>> = {
  validation: 'Revisá los valores', conflict: 'Cambio en otro dispositivo', retryable: 'No se pudo guardar', unconfirmed: 'Pendiente de conexión · Guardado sin confirmar',
   stale: 'Cambios pendientes de revisar', closed: 'Solo lectura', removed: 'Ejercicio quitado',
};
// Brand `error` only for real failures (a save that failed, invalid values). A conflict,
// a pending/unconfirmed write, a read-only or removed exercise are states to know about.
export function phaseIsFailure(phase: ExercisePhase): boolean {
  return phase === 'retryable' || phase === 'validation';
}
// Header and data rows share these exact five cells. Do not put flex styles on
// Text in the header and View in rows: Text measurement can change the columns.
function SeriesColumns({ ordinal, kg, reps, rir, completed, header = false }: {
  ordinal: ReactNode; kg: ReactNode; reps: ReactNode; rir: ReactNode; completed: ReactNode; header?: boolean;
}) {
  return <View style={styles.columns} accessibilityElementsHidden={header} testID={header ? 'series-column-header' : 'series-column-row'}>
    <View style={styles.ordinalColumn}>{ordinal}</View>
    <View style={styles.numericColumn}>{kg}</View>
    <View style={styles.numericColumn}>{reps}</View>
    <View style={styles.numericColumn}>{rir}</View>
    <View style={styles.completedColumn}>{completed}</View>
  </View>;
}
export const ActiveExerciseCard = memo(function ActiveExerciseCard({ controller, id, expanded, locked, refreshing = false, sessionStorageError = false, reorderDisabled = false, addToRoutineName, onToggle, onHistory, onRemove, historyCard, variant, onSheetChange, onReveal, reveal = 0, loadPattern = null, onLoadPattern }: {
  /** Bumped after "Usar": the set rows remount and cascade in with the copied values. */
  reveal?: number;
  controller: ActiveSessionController; id: string; expanded: boolean; locked: boolean; refreshing?: boolean; sessionStorageError?: boolean; reorderDisabled?: boolean; addToRoutineName?: string | null; historyCard?: ReactNode;
  /** #367: the optional variant row of this session exercise. */
  variant?: ReactNode; onSheetChange?: (id: string, open: boolean) => void; onReveal?: (top: number) => void;
  /** #537: a confirmed load pattern of the previous executions (already filtered for silenced or «Más adelante»). */
  loadPattern?: LoadPattern | null; onLoadPattern?: (id: string) => void;
  onToggle: (id: string) => void; onHistory: (id: string) => void; onRemove: (id: string, name: string) => void;
}) {
  const subscribe = useCallback((listener: () => void) => controller.subscribeExercise(id, listener), [controller, id]);
  const get = useCallback(() => controller.getExercise(id), [controller, id]);
  const state = useSyncExternalStore(subscribe, get, get);
  const { colors } = useOwnlevelTheme();
  const [noteOpen, setNoteOpen] = useState(false), [durationOpen, setDurationOpen] = useState(false), [dialogOpen, setDialogOpen] = useState(false);
  const card = useRef<View>(null);
  const [nextOpen, setNextOpen] = useState(false);
  const [nextRequest, setNextRequest] = useState(0);
  useEffect(() => { onSheetChange?.(id, noteOpen || nextOpen || durationOpen || dialogOpen); return () => onSheetChange?.(id, false); }, [id, noteOpen, nextOpen, durationOpen, dialogOpen, onSheetChange]);
  const [addedSet, setAddedSet] = useState<string | null>(null);
  const reducedMotion = useReduceMotion();
  const pendingSet = state?.draft.sets.find(set => !set.isCompleted)?.localId;
  const chevron = useAnimatedStyle(() => ({ transform: [{ rotate: withTiming(expanded ? '90deg' : '0deg', { duration: reducedMotion ? 0 : 220 }) }] }), [expanded, reducedMotion]);
  const enabled = expanded && !locked && !!state && state.phase !== 'closed' && state.phase !== 'removed';
  const [previousEnabled, setPreviousEnabled] = useState(enabled);
  if (previousEnabled !== enabled) {
    setPreviousEnabled(enabled);
    if (!enabled) { setNextOpen(false); setAddedSet(null); }
  }
  const timer = useSyncExternalStore(controller.subscribeTimer, controller.getTimer, controller.getTimer);
  const tapHeader = useCallback(() => { Keyboard.dismiss(); haptics.selection(); onToggle(id); }, [id, onToggle]);
  if (!state) return null;
  const { exercise, draft } = state;
  const editable = !locked && controller.canEdit(id);
  const contextual = !locked && state.storageReady && state.phase !== 'closed' && state.phase !== 'removed';
  const canDiscard = state.dirty || state.stale;
  // A value cleared while typing (an empty rep in a ticked set) is not an error yet: it is only said once the exercise is
  // folded, and finishing names it. A rejection from the server is always shown.
  const editingIncomplete = expanded && state.phase === 'validation' && draftIncomplete(draft);
  const completion = setProgress(draft);
  const reminder = nextReminder(exercise);
  const identity = [exercise.muscleGroupLabelSnapshot || muscleGroupLabel(exercise.muscleGroupSnapshot), exercise.implementSnapshot, exercise.weightModeSnapshot].filter(Boolean).join(' · ');
  const discardChanges = () => {
    if (!contextual || !canDiscard || refreshing) return;
    setDialogOpen(true);
    Alert.alert('¿Descartar cambios?', 'Se descartarán los cambios de este ejercicio que todavía no están guardados.', [
         { text: 'Seguir editando', style: 'cancel', onPress: () => setDialogOpen(false) }, { text: 'Descartar cambios', style: 'destructive', onPress: () => { setDialogOpen(false); void controller.useSaved(id); } },
      ]);
  };
  const moveExercise = (direction: number) => {
    if (reorderDisabled) return;
    const ids = controller.getSnapshot().detail?.exercises.map(row => row.id) ?? [], index = ids.indexOf(id), to = index + direction;
    if (to < 0 || to >= ids.length || !controller.beginExerciseDrag()) return;
    ids.splice(index, 1); ids.splice(to, 0, id);
    void controller.dropExercises(ids).then(confirmed => { if (confirmed) haptics.selection(); });
  };
  return <View ref={card} onLayout={() => { if (expanded && onReveal) requestAnimationFrame(() => card.current?.measureInWindow((_x, top) => onReveal(top))); }} style={[styles.card, { borderBottomColor: colors.border }]} testID={`session-exercise-${id}`}>
    <NativeSwipeActions backgroundColor={colors.background} label={exercise.nameSnapshot} disabled={!contextual} actions={[
      { label: draft.notes.trim() ? 'Editar nota' : 'Agregar nota', disabled: !editable, onPress: () => { Keyboard.dismiss(); setNoteOpen(true); } },
       ...(canDiscard ? [{ label: 'Descartar cambios', disabled: refreshing, onPress: discardChanges }] : []),
      { label: 'Quitar', destructive: true, disabled: !editable || refreshing, onPress: () => onRemove(id, exercise.nameSnapshot) },
    ]}>
    <NativeDragHandle testID={`exercise-header-${id}`} disabled={locked} accessibilityRole="button" accessibilityLabel={`${expanded ? 'Contraer' : 'Expandir'} ${exercise.nameSnapshot}`} accessibilityState={{ expanded }}
      accessibilityHint={`${reminder ? `Próxima sesión: ${reminder}. ` : ''}Mantené presionado para mover. Deslizá a la izquierda para más acciones.`}
      accessibilityActions={contextual ? [...(reorderDisabled ? [] : [{ name: 'moveUp', label: 'Mover arriba' }, { name: 'moveDown', label: 'Mover abajo' }]),
         { name: 'note', label: draft.notes.trim() ? 'Editar nota' : 'Agregar nota' }, ...(canDiscard && !refreshing ? [{ name: 'discard', label: 'Descartar cambios' }] : []), ...(refreshing ? [] : [{ name: 'remove', label: 'Quitar de la sesión' }])] : undefined}
      onAccessibilityAction={event => {
        const action = event.nativeEvent.actionName;
        if (action === 'moveUp') moveExercise(-1); else if (action === 'moveDown') moveExercise(1);
         else if (action === 'note' && editable) setNoteOpen(true); else if (action === 'discard' && !refreshing) discardChanges(); else if (action === 'remove' && editable && !refreshing) onRemove(id, exercise.nameSnapshot);
      }}
      onTap={tapHeader} style={styles.header}>
      <View style={styles.flex}>
        <AppText numberOfLines={2} variant="label" style={styles.exerciseName}>{exercise.nameSnapshot}</AppText>
        <AppText muted numberOfLines={2} variant="caption">{identity}</AppText>
        {reminder ? <View style={[styles.reminder, { backgroundColor: colors.surfaceRaised }]} accessibilityLabel={`Próxima sesión · ${reminder}`}>
          <AppText muted variant="caption">↑</AppText><AppText muted variant="caption" style={styles.flex}>Próxima sesión · {reminder}</AppText>
        </View> : null}
        {draft.notes.trim() ? <View style={styles.noteIndicator} accessibilityLabel="Este ejercicio tiene una nota">
          <AppIcon name="note" color={colors.textMuted} size={13} /><AppText muted variant="caption">Nota</AppText></View> : null}
      </View>
      {/* Done reads at a glance: a champagne pill with a check. Pending stays a quiet number on the background, never the same pill. */}
      {completion.complete ? <View testID={`exercise-progress-done-${id}`} accessibilityLabel={`Completo, ${completion.completed} de ${completion.total} series`} style={[styles.badge, styles.badgeDone, { backgroundColor: colors.brandSubtle }]}>
        <AppIcon name="checkmark" color={colors.primary} size={13} /><AppText numeric style={{ color: colors.primary, fontWeight: '600' }} variant="caption">{completion.completed}/{completion.total}</AppText></View>
        : <View testID={`exercise-progress-${id}`} accessibilityLabel={`${completion.completed} de ${completion.total} series`} style={styles.badge}><AppText numeric muted variant="caption">{completion.completed}/{completion.total}</AppText></View>}
      {/* Saving shows as «Sincronizando» in the session header: the counter and chevron never move. Failures stay below. */}
      <Animated.View style={chevron}><AppIcon name="chevronRight" color={colors.textMuted} size={15} /></Animated.View>
    </NativeDragHandle></NativeSwipeActions>
    {!(sessionStorageError && !state.storageReady) && (state.error || statusLabels[state.phase]) && !editingIncomplete ? <View style={styles.recovery}>
      <AppText accessibilityLiveRegion="polite" style={{ color: phaseIsFailure(state.phase) || !statusLabels[state.phase] ? colors.danger : colors.text }} variant="caption">{statusLabels[state.phase] ?? state.error}</AppText>
      {state.error && statusLabels[state.phase] ? <AppText accessibilityRole="alert" style={{ color: colors.danger }} variant="caption">{state.error}</AppText> : null}
      {['conflict', 'stale', 'retryable', 'unconfirmed'].includes(state.phase) ? <>
        <Button disabled={locked || refreshing} label="Comprobar cambios" onPress={() => void controller.checkExercise(id)} variant="secondary" />
         {canDiscard ? <Button disabled={locked || refreshing} label="Descartar cambios" onPress={discardChanges} variant="quiet" /> : null}
      </> : state.error && (!state.storageReady || state.phase === 'scheduled') ? <Button label="Reintentar lectura" onPress={() => void controller.refresh()} variant="secondary" /> : null}
    </View> : null}
    {expanded ? <Animated.View entering={FadeIn.duration(reducedMotion ? 200 : 220)} style={styles.body}>
      <View style={styles.row}><AppText muted style={styles.flex} variant="caption">
        {pendingSet ? `Serie ${draft.sets.findIndex(set => set.localId === pendingSet) + 1} de ${draft.sets.length}` : 'Series completadas'}
      </AppText>
        <Pressable accessibilityRole="button" accessibilityLabel={`Historial de ${exercise.nameSnapshot}`} disabled={locked}
          onPress={() => { Keyboard.dismiss(); onHistory(id); }} style={[styles.historyTrigger, { opacity: locked ? 0.45 : 1 }]}>
          <AppIcon name="clock" color={colors.textMuted} size={17} /><AppText muted variant="caption">Historial</AppText>
        </Pressable></View>
      {variant}
      {historyCard}
      {loadPattern && onLoadPattern && contextual && draft.decision === 'maintain' ? <LoadPatternRow pattern={loadPattern} disabled={locked}
        onPress={() => { Keyboard.dismiss(); onLoadPattern(id); }} /> : null}
      <SeriesColumns header ordinal={<AppText muted style={styles.columnTitle} variant="footnote">#</AppText>}
        kg={<AppText muted style={styles.columnTitle} variant="footnote">KG</AppText>} reps={<AppText muted style={styles.columnTitle} variant="footnote">REPS</AppText>}
        rir={<AppText muted style={styles.columnTitle} variant="footnote">RIR</AppText>} completed={<AppText muted style={styles.columnTitle} variant="footnote">✓</AppText>} />
      <NativeReorderList ids={draft.sets.map(set => set.localId)} onLift={() => { const accepted = controller.beginSetDrag(id); if (accepted) Keyboard.dismiss(); return accepted; }}
        onDrop={ids => controller.dropSets(id, ids)} onCancel={() => controller.cancelDrag()}>
        {draft.sets.map((set, index) => <NativeReorderItem key={set.localId} id={set.localId}>
          <ActiveSetRow key={reveal} controller={controller} id={id} name={exercise.nameSnapshot} set={set} index={index} count={draft.sets.length} editable={editable} entering={addedSet === set.localId ? 0 : Math.min(index, 8) * 55} reducedMotion={reducedMotion} onDialogChange={setDialogOpen} />
        </NativeReorderItem>)}
      </NativeReorderList>
      {state.phase !== 'closed' && state.phase !== 'removed' ? <Animated.View layout={reducedMotion ? undefined : LinearTransition.duration(300)} style={styles.row}>
        <SessionGlassButton style={styles.flex} disabled={!editable || draft.sets.length >= 50} label="+ Agregar serie" onPress={() => {
          if (controller.getSnapshot().interaction || !controller.canEdit(id)) return;
          haptics.selection();
          controller.change(id, appendSessionSet, true);
          const appended = controller.getExercise(id)?.draft.sets.at(-1);
          if (appended) setAddedSet(appended.localId);
        }} />
        {/* UIKit's passthrough region must remain this trigger's native container. */}
        <View collapsable={false} style={styles.nextAnchor}>
          <SessionNextTrigger open={nextOpen} disabled={!editable}
            label={draft.decision === 'increase_weight' ? 'Más peso' : draft.decision === 'increase_reps' ? 'Más reps' : draft.decision === 'custom' ? 'Recordatorio' : 'Próxima vez'}
            onPress={() => { if (controller.getSnapshot().interaction) return; Keyboard.dismiss(); haptics.selection(); setNextRequest(value => value + 1); if (Platform.OS !== 'ios') setNextOpen(value => !value); }}
            testID={`exercise-next-${id}`} />
          <SessionNextOptions open={nextOpen} toggleRequest={nextRequest} onOpen={() => setNextOpen(true)} editable={editable} name={exercise.nameSnapshot} decision={draft.decision} decisionNote={draft.decisionNote}
            applyToRoutine={draft.applyToRoutine} routineLinked={!!exercise.routineExerciseId} addToRoutineName={addToRoutineName} onClose={() => setNextOpen(false)}
            onDecision={(decision: NextSessionDecision) => {
              if (!controller.canEdit(id) || controller.getSnapshot().interaction) return;
              haptics.selection(); controller.change(id, current => ({ ...current, decision: current.decision === decision ? 'maintain' : decision, decisionNote: '' }), true);
            }}
            onApply={value => {
              if (!controller.canEdit(id) || controller.getSnapshot().interaction) return;
              haptics.selection(); controller.change(id, current => ({ ...current, applyToRoutine: value }), true);
            }} />
        </View>
      </Animated.View> : null}
      <View style={styles.restRow} testID={`exercise-rest-${id}`}>
        <AppIcon name="clock" color={colors.textMuted} size={17} />
        <AppText numeric muted variant="caption" style={styles.flex}>Descanso · {[exercise.restMinSecondsSnapshot, exercise.restMaxSecondsSnapshot].filter((value, i, array) => value !== null && (i === 0 || value !== array[0])).map(formatRest).join(' – ') || 'sin rango'}</AppText>
        <Button disabled={!editable} label={timer?.exerciseId === id ? 'Saltar descanso' : 'Iniciar descanso'} onPress={() => { haptics.selection(); if (timer?.exerciseId === id) controller.skipRest(); else if (restSeconds(exercise) === null) setDurationOpen(true); else controller.startRest(id); }} variant="quiet" />
      </View>
    </Animated.View> : null}
     {durationOpen ? <SessionRestDuration onClose={() => setDurationOpen(false)} onStart={seconds => controller.startRest(id, seconds)} /> : null}
     {noteOpen ? <SessionNoteSheet name={exercise.nameSnapshot} value={draft.notes} editable={editable}
       onSave={async notes => {
         if (!controller.canEdit(id)) return false;
         controller.change(id, current => ({ ...current, notes }), true); await controller.flush(id);
         const latest = controller.getExercise(id);
         return latest?.phase === 'saved' && !latest.dirty && latest.draft.notes === notes;
       }}
       onClose={() => { Keyboard.dismiss(); setNoteOpen(false); }} /> : null}
  </View>;
});
/**
 * The tick pops in with a soft spring when a set is completed and the empty ring fades back when it is undone. It animates only on a
 * change: rows that mount already completed show their tick still. Reduce Motion keeps a 200 ms fade, never a scale.
 */
function SetCheck({ checked, animate, reducedMotion }: { checked: boolean; animate: boolean; reducedMotion: boolean }) {
  const { colors } = useOwnlevelTheme();
  const entering = !animate ? undefined : reducedMotion ? FadeIn.duration(200) : checked ? ZoomIn.springify().damping(13).stiffness(260) : FadeIn.duration(200);
  return checked
    ? <Animated.View key="done" testID="set-check-done" entering={entering}><AppIcon name="check" color={colors.textMuted} size={26} /></Animated.View>
    : <Animated.View key="open" testID="set-check-open" entering={entering} style={[styles.unchecked, { borderColor: colors.textMuted }]} />;
}
function ActiveSetRow({ controller, id, name, set, index, count, editable, entering, reducedMotion, onDialogChange }: {
  controller: ActiveSessionController; id: string; name: string; set: SessionExerciseDraft['sets'][number]; index: number; count: number; editable: boolean; /** Entering delay in ms: rows cascade in one under the other. */ entering: number; reducedMotion: boolean; onDialogChange: (open: boolean) => void;
}) {
  const { colors } = useOwnlevelTheme();
  // Only a tap here animates the tick; a row that arrives completed (reload, other device) shows it still.
  const [tapped, setTapped] = useState(false);
  const tapCompleted = useCallback(() => {
    setTapped(true);
    // Brand event only when a set gets completed; un-completing is silent.
    if (controller.toggleSetCompleted(id, set.localId)) triggerHaptic('setComplete');
  }, [controller, id, set.localId]);
  const mutate = (operation: (draft: SessionExerciseDraft, position: number) => SessionExerciseDraft) => controller.change(id, current => operation(current, current.sets.findIndex(row => row.localId === set.localId)), true);
  const reset = () => mutate(resetSessionSet);
  const remove = () => {
    if (count <= 1) return;
    onDialogChange(true);
    Alert.alert(`¿Eliminar serie ${index + 1}?`, 'Se quitará sólo de este ejercicio en la sesión actual.', [
      { text: 'Conservar serie', style: 'cancel', onPress: () => onDialogChange(false) }, { text: 'Eliminar', style: 'destructive', onPress: () => { onDialogChange(false); mutate(removeSessionSet); } },
    ]);
  };
  const move = (direction: number) => {
    const ids = controller.getExercise(id)?.draft.sets.map(row => row.localId) ?? [], from = ids.indexOf(set.localId), to = from + direction;
    if (from < 0 || to < 0 || to >= ids.length || !controller.beginSetDrag(id)) return;
    ids.splice(from, 1); ids.splice(to, 0, set.localId); void controller.dropSets(id, ids).then(confirmed => { if (confirmed) haptics.selection(); });
  };
  const actions = [{ name: 'moveUp', label: 'Mover arriba' }, { name: 'moveDown', label: 'Mover abajo' }, { name: 'reset', label: 'Resetear serie' },
    ...(count > 1 ? [{ name: 'delete', label: 'Eliminar serie' }] : [])];
  const accessibilityAction: View['props']['onAccessibilityAction'] = event => {
    const action = event.nativeEvent.actionName;
    if (action === 'moveUp') move(-1); else if (action === 'moveDown') move(1); else if (action === 'reset') reset(); else if (action === 'delete') remove();
  };
  const updateActual = (key: 'actualReps' | 'actualWeightKg', value: string) => controller.change(id, current => ({ ...current,
    sets: current.sets.map(row => row.localId === set.localId ? { ...row, [key]: value } : row) }));
  // The gap between rows lives outside the swipe area, so the swiped row and its buttons line up.
  return <View style={styles.setGap}><NativeSwipeActions backgroundColor={colors.background} label={`Serie ${index + 1}`} disabled={!editable} actions={[{ label: 'Resetear', onPress: reset }, { label: 'Eliminar', destructive: true, disabled: count <= 1, onPress: remove }]}>
    <Animated.View testID={`session-set-${set.localId}`} entering={reducedMotion ? FadeIn.duration(200) : FadeInUp.delay(entering).duration(260)}
      style={[styles.setBlock, { backgroundColor: colors.background }]}>
      <SeriesColumns ordinal={<NativeDragHandle testID={`set-handle-${set.localId}`} disabled={!editable} accessibilityRole="button" accessibilityLabel={`Mover serie ${index + 1}`}
        accessibilityHint="Mantené presionado para arrastrar. Deslizá a la izquierda para resetear o eliminar." accessibilityActions={actions} onAccessibilityAction={accessibilityAction} style={styles.controlTrack}>
        <AppText numeric muted variant="caption">{index + 1}</AppText></NativeDragHandle>}
        kg={<TextInput accessibilityLabel={`Peso serie ${index + 1} de ${name}`} editable={editable} keyboardType="decimal-pad" selectTextOnFocus
          placeholder="—" placeholderTextColor={colors.textMuted} value={set.actualWeightKg} onChangeText={value => updateActual('actualWeightKg', value)}
          onEndEditing={() => void controller.flush(id)} style={[styles.numberInput, { borderColor: colors.border, color: colors.text }]} />}
        reps={<TextInput accessibilityLabel={`Reps serie ${index + 1} de ${name}`} editable={editable} keyboardType="number-pad" selectTextOnFocus
          placeholder="—" placeholderTextColor={colors.textMuted} value={set.actualReps} onChangeText={value => updateActual('actualReps', value)}
          onEndEditing={() => void controller.flush(id)} style={[styles.numberInput, { borderColor: colors.border, color: colors.text }]} />}
        rir={<NativeDragHandle testID={`set-rir-${set.localId}`} disabled={!editable} accessibilityRole="button" accessibilityLabel={`RIR objetivo serie ${index + 1}: ${compactActual(set.targetRir)}`}
          accessibilityActions={actions} onAccessibilityAction={accessibilityAction} style={[styles.controlTrack, styles.rirField]}><AppText muted numeric variant="label">{compactActual(set.targetRir)}</AppText></NativeDragHandle>}
        completed={<NativeDragHandle testID={`set-check-${set.localId}`} accessibilityRole="checkbox" accessibilityLabel={`Serie ${index + 1} completada`} accessibilityState={{ checked: set.isCompleted, disabled: !editable }} disabled={!editable}
          accessibilityActions={actions} onAccessibilityAction={accessibilityAction}
          onTap={tapCompleted} style={styles.controlTrack}>
          <SetCheck checked={set.isCompleted} animate={tapped} reducedMotion={reducedMotion} /></NativeDragHandle>} />
    </Animated.View>
  </NativeSwipeActions></View>;
}
const styles = StyleSheet.create({
  card: { paddingVertical: spacing.md, gap: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth }, flex: { flex: 1 },
  header: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center', minHeight: 64 }, exerciseName: {},
  badge: { borderRadius: 10, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, minWidth: 40, alignItems: 'center' },
  badgeDone: { flexDirection: 'row', gap: 3 },
  reminder: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: 10, marginTop: spacing.xs },
  noteIndicator: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs }, body: { gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  columns: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs }, ordinalColumn: { width: sizes.touchTarget }, numericColumn: { flex: 1, minWidth: 0 },
  completedColumn: { width: sizes.touchTarget }, columnTitle: { textAlign: 'center' },
  controlTrack: { minHeight: 48, width: sizes.touchTarget, justifyContent: 'center', alignItems: 'center' },
  rirField: { width: '100%', borderRadius: 12 }, unchecked: { borderWidth: 1.5, borderRadius: radius.pill, height: 26, width: 26 },
  numberInput: { borderRadius: 12, borderWidth: 1, minHeight: 48, fontSize: brandTokens.typeScale.headline.fontSize, fontWeight: '600', textAlign: 'center', paddingHorizontal: spacing.xs, fontVariant: ['tabular-nums'] },
  setBlock: { borderRadius: 12, paddingVertical: spacing.xs }, setGap: { marginBottom: spacing.sm },
  restRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 50 }, recovery: { gap: spacing.sm },
  // Fixed width: the label changes with the choice and must not move the popover's anchor.
  nextAnchor: { width: 148 },
  historyTrigger: { minHeight: sizes.touchTarget, paddingHorizontal: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
});
