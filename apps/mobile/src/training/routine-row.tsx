import { useCallback, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Swipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import { ReduceMotion, runOnJS, useAnimatedReaction, type SharedValue } from 'react-native-reanimated';

import type { MobileTrainingRoutine } from '@/api/routines';
import { AppIcon, AppText, brandTokens, spacing, useOwnlevelTheme, useReduceMotion } from '@/design-system';
import { RoutineContextMenu } from './routine-context-menu';
import { trainingRoutineColor } from './routine-colors';
import { StartConfirm } from './start-confirm';

export const routineMetadata = (routine: Pick<MobileTrainingRoutine, 'exerciseCount' | 'setCount'>) =>
  `${routine.exerciseCount} ${routine.exerciseCount === 1 ? 'ejercicio' : 'ejercicios'} · ${routine.setCount} ${routine.setCount === 1 ? 'serie' : 'series'}`;

// Partial swipes reveal a button; only dragging most of the row commits the action on release.
export function isFullRoutineSwipe(distance: number, width: number): boolean {
  'worklet';
  return Math.abs(distance) >= Math.max(144, width * 0.65);
}

function SwipeAction({ full, label, onPress, start, translation, width }: {
  full: (value: boolean) => void; label: string; onPress: () => void; start?: boolean;
  translation: SharedValue<number>; width: number;
}) {
  const { colors } = useOwnlevelTheme();
  useAnimatedReaction(() => isFullRoutineSwipe(translation.value, width), value => { runOnJS(full)(value); }, [full, width]);
  return (
    <Pressable accessibilityLabel={label} accessibilityRole="button" onPress={onPress}
      style={[styles.action, { backgroundColor: start ? colors.primary : colors.surfaceRaised }]}>
      <AppIcon color={start ? colors.onPrimary : colors.text} name={start ? 'playFilled' : 'archive'} size={20} />
      <AppText style={{ color: start ? colors.onPrimary : colors.text }} variant="footnote">{label}</AppText>
    </Pressable>
  );
}

export function RoutineRow({ routine, disabled, onOpen, onColor, onDuplicate, onStart, onStatus }: {
  routine: MobileTrainingRoutine; disabled: boolean;
  onOpen: () => void; onColor: () => void; onDuplicate: () => void; onStart: () => void; onStatus: () => void;
}) {
  const { colors, isDark } = useOwnlevelTheme();
  const reduceMotion = useReduceMotion();
  const swipe = useRef<SwipeableMethods>(null);
  const full = useRef(false);
  const trackFullSwipe = useCallback((value: boolean) => { full.current = value; }, []);
  const [width, setWidth] = useState(0);
  const [confirm, setConfirm] = useState(false);
  const closeSwipe = () => { if (reduceMotion) swipe.current?.reset(); else swipe.current?.close(); };
  const start = () => { if (!disabled && routine.isActive) { closeSwipe(); setConfirm(true); } };
  const status = () => { if (!disabled) { closeSwipe(); onStatus(); } };
  const open = () => { if (!disabled) { closeSwipe(); onOpen(); } };
  const color = () => { if (!disabled) { closeSwipe(); onColor(); } };
  const duplicate = () => { if (!disabled) { closeSwipe(); onDuplicate(); } };
  const statusLabel = routine.isActive ? 'Archivar' : 'Restaurar';
  return (
    <View onLayout={event => setWidth(event.nativeEvent.layout.width)} testID={`routine-row-${routine.id}`}>
      <Swipeable ref={swipe} enabled={!disabled && !confirm} friction={1} overshootFriction={1}
        childrenContainerStyle={{ backgroundColor: colors.surface }}
        animationOptions={{ ...brandTokens.motion.spring, reduceMotion: ReduceMotion.System }}
        onSwipeableWillOpen={direction => {
          if (!full.current) return;
          if (direction === 'right') start(); else status();
        }}
        renderLeftActions={routine.isActive ? (_progress, translation) => <SwipeAction full={trackFullSwipe} label="Empezar" onPress={start} start translation={translation} width={width} /> : undefined}
        renderRightActions={(_progress, translation) => <SwipeAction full={trackFullSwipe} label={statusLabel} onPress={status} translation={translation} width={width} />}
        testID={`routine-swipe-${routine.id}`}>
        <RoutineContextMenu width={width} disabled={disabled || confirm} onColor={color} onEdit={open} onDuplicate={duplicate} onStart={start} onStatus={status} routine={routine}>
          <Pressable accessibilityActions={[
            ...(routine.isActive ? [{ name: 'start', label: 'Empezar entrenamiento' }, { name: 'color', label: 'Cambiar color' }] : []),
            { name: 'edit', label: 'Editar rutina' }, { name: 'duplicate', label: 'Duplicar' }, { name: 'status', label: statusLabel },
          ]} accessibilityHint="Tocá para editar. Mantené apretado para ver acciones."
            accessibilityLabel={`Abrir rutina ${routine.name}, ${routineMetadata(routine)}`} accessibilityRole="button"
            accessibilityState={{ disabled }} disabled={disabled} onAccessibilityAction={event => {
              const action = event.nativeEvent.actionName;
              if (action === 'start') start(); else if (action === 'color') color(); else if (action === 'status') status(); else if (action === 'edit') open(); else if (action === 'duplicate') duplicate();
            }} onPress={open} style={({ pressed }) => [styles.row, { width: width > 0 ? width : undefined, backgroundColor: pressed ? colors.surfaceRaised : colors.surface }]}>
            {routine.color ? <View accessibilityElementsHidden style={[styles.strip, { backgroundColor: trainingRoutineColor(routine.color, isDark), opacity: routine.isActive ? 1 : 0.45 }]}
              testID={`routine-color-${routine.id}-${routine.color}`} /> : null}
            <View style={styles.copy}>
              <AppText numberOfLines={2} testID="routine-name" variant="headline">{routine.name}</AppText>
              <AppText muted numeric variant="subheadline">{routineMetadata(routine)}</AppText>
            </View>
            <AppIcon color={colors.textMuted} name="chevronRight" size={20} />
          </Pressable>
        </RoutineContextMenu>
      </Swipeable>
      <StartConfirm onCancel={() => setConfirm(false)} onConfirm={() => { setConfirm(false); if (!disabled) onStart(); }} open={confirm} routineName={routine.name} />
    </View>
  );
}

const styles = StyleSheet.create({
  action: { alignItems: 'center', gap: spacing.xs, justifyContent: 'center', minWidth: 96, paddingHorizontal: spacing.md },
  copy: { flex: 1, gap: spacing.xs, minWidth: 0 },
  row: { alignItems: 'center', flexDirection: 'row', gap: spacing.md, minHeight: 76, padding: brandTokens.layout.cardPadding },
  strip: { borderRadius: brandTokens.radius.full, height: brandTokens.layout.rowHeight, width: 4 },
});
