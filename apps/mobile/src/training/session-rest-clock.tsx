import { useState, useSyncExternalStore } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppIcon, AppText, Button, Chip, GlassSurface, radius, sizes, spacing, useOwnlevelTheme } from '@/design-system';
import { haptics } from '@/platform/haptics';
import type { ActiveSessionController } from './active-session-controller';
import { restSeconds } from './active-session-model';
import { RoutineFormSheet } from './routine-form-sheet';
import { RoutineSheetButton } from './routine-sheet-button';
import { SessionRestDuration } from './session-rest-duration';
import { RestAlertOption } from './session-rest-alert-option';
import { useSessionPresenceStore } from './session-presence-provider';
import { restCountdownLabel, useRestClock } from './use-rest-countdown';

const presets = [{ seconds: 60, label: '1 min' }, { seconds: 90, label: '1:30' }, { seconds: 120, label: '2 min' }];

export function SessionRestClock({ controller, exerciseId, hidden, onHeightChange }: {
  controller: ActiveSessionController; exerciseId?: string; hidden: boolean; onHeightChange: (height: number) => void;
}) {
  const { colors } = useOwnlevelTheme();
  const presence = useSessionPresenceStore();
  const timer = useSyncExternalStore(controller.subscribeTimer, controller.getTimer, controller.getTimer);
  const automatic = useSyncExternalStore(controller.subscribeTimer, controller.getAutomaticRest, controller.getAutomaticRest);
  const { seconds, recentlyFinished, ready } = useRestClock(timer, !presence);
  const [sheet, setSheet] = useState<'timer' | 'setup' | null>(null);
  const expanded = sheet !== null;
  const [customExercise, setCustomExercise] = useState<string | null>(null);
  const [customRequested, setCustomRequested] = useState(false);
  const targetId = timer && (seconds > 0 || recentlyFinished || sheet === 'timer') ? timer.exerciseId : exerciseId;
  const target = targetId ? controller.getExercise(targetId) : undefined;
  const configured = target ? restSeconds(target.exercise) : null;
  const pending = target?.draft.sets.findIndex(set => !set.isCompleted) ?? -1;
  const running = seconds > 0;
  const showTimer = !!timer && ready && (running || recentlyFinished || sheet === 'timer');
  const label = running ? restCountdownLabel(seconds) : showTimer ? 'Descanso terminado' : 'Descanso';

  const adjust = (delta: number) => { haptics.selection(); controller.adjustRest(delta); };
  const start = (duration?: number) => {
    if (!targetId) return;
    haptics.selection(); controller.startRest(targetId, duration); setSheet(null);
  };
  // The native sheet hands off to the custom picker only after its dismissal animation.
  const openCustom = () => {
    if (!targetId) return;
    if (Platform.OS === 'ios') setCustomRequested(true);
    else setCustomExercise(targetId);
    setSheet(null);
  };
  const finishCustomTransition = () => {
    if (customRequested && targetId && !hidden) setCustomExercise(targetId);
    setCustomRequested(false);
  };

  return <>
    <View pointerEvents={expanded ? 'none' : 'box-none'} accessibilityElementsHidden={expanded} importantForAccessibility={expanded ? 'no-hide-descendants' : 'auto'} style={styles.overlay} onLayout={event => onHeightChange(event.nativeEvent.layout.height)}>
      {!hidden && (target || timer) ? <SafeAreaView edges={['bottom']} pointerEvents="box-none" style={styles.safe}>
        <GlassSurface interactive style={styles.capsule}>
          <Pressable accessibilityRole="button" accessibilityLabel={`Abrir reloj de descanso. ${label}${running && timer ? ` · ${timer.exerciseName}` : ''}`}
            onPress={() => { haptics.selection(); setSheet(showTimer ? 'timer' : 'setup'); }} style={styles.trigger}>
            <AppIcon name="clock" color={colors.primary} size={20} />
            <AppText numeric variant="headline" style={{ flexShrink: 1 }}>{label}</AppText>
            {running && timer ? <AppText muted variant="caption" numberOfLines={1} style={styles.exercise}>{timer.exerciseName}</AppText> : null}
          </Pressable>
          {running || recentlyFinished ? <Pressable accessibilityRole="button" accessibilityLabel="Sumar 15 segundos"
            onPress={() => adjust(15)} style={styles.action}><AppText numeric variant="footnote" style={{ color: colors.primary }}>+15 s</AppText></Pressable> : null}
        </GlassSurface>
      </SafeAreaView> : null}
    </View>
    <RoutineFormSheet open={expanded && !hidden} pending={false} onClose={() => setSheet(null)} onDismissed={finishCustomTransition}>
      <View style={styles.sheet}>
        <View style={styles.heading}>
          <View style={styles.exercise}>
            <AppText accessibilityRole="header" variant="title2">Descanso</AppText>
            {target ? <AppText muted variant="footnote">{target.exercise.nameSnapshot}</AppText> : null}
          </View>
          <RoutineSheetButton label="Minimizar reloj" icon="chevronDown" onPress={() => setSheet(null)} />
        </View>
        {showTimer ? <>
          <AppText numeric variant="heroNumber" style={styles.center}>{running ? restCountdownLabel(seconds) : '00:00'}</AppText>
          {!running ? <AppText accessibilityLiveRegion="polite" style={styles.center}>Descanso terminado</AppText> : null}
          {pending >= 0 && target ? <AppText numeric muted style={styles.center}>Sigue: serie {pending + 1} de {target.draft.sets.length}</AppText> : null}
          <View style={styles.controls}>
            <Button label="−15 s" accessibilityLabel="Restar 15 segundos" variant="secondary" disabled={!running} onPress={() => adjust(-15)} />
            <Button label="+15 s" accessibilityLabel="Sumar 15 segundos" variant="secondary" onPress={() => adjust(15)} />
            <Button label={running ? 'Saltar descanso' : 'Listo'} accessibilityLabel={running ? 'Saltar este descanso' : undefined} variant="quiet" onPress={() => { haptics.selection(); controller.skipRest(); setSheet(null); }} />
          </View>
        </> : <>
          {configured !== null ? <Button label={`Iniciar · ${restCountdownLabel(configured)}`} onPress={() => start()} /> : null}
          <View style={styles.controls}>
            {presets.map(preset => <Button key={preset.seconds} label={preset.label} numeric variant="secondary" onPress={() => start(preset.seconds)} />)}
            <Button label="Personalizar" variant="quiet" onPress={openCustom} />
          </View>
          <Chip kind="toggle" label="Inicio automático en esta sesión" selected={automatic}
            onPress={() => { haptics.selection(); controller.setAutomaticRest(!automatic); }} />
        </>}
        {expanded ? <RestAlertOption /> : null}
      </View>
    </RoutineFormSheet>
    {customExercise && !hidden ? <SessionRestDuration onClose={() => setCustomExercise(null)} onStart={duration => controller.startRest(customExercise, duration)} /> : null}
  </>;
}

const styles = StyleSheet.create({
  overlay: { position: 'absolute', bottom: 0, left: 0, right: 0 },
  safe: { alignItems: 'center', paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  capsule: { flexDirection: 'row', alignItems: 'center', borderRadius: radius.full, maxWidth: '100%' },
  trigger: { flexShrink: 1, flexDirection: 'row', alignItems: 'center', minHeight: sizes.touchTarget, gap: spacing.sm, paddingHorizontal: spacing.md },
  action: { minWidth: sizes.touchTarget, minHeight: sizes.touchTarget, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.sm },
  exercise: { flex: 1 },
  sheet: { padding: spacing.lg, gap: spacing.md },
  heading: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  center: { textAlign: 'center' },
  controls: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, justifyContent: 'center', alignItems: 'center' },
});
