import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { AppIcon, AppText, GlassSurface, brandTokens, radius, spacing, useOwnlevelTheme, useReduceMotion } from '@/design-system';

export type SessionHeaderScroll = { y: number; anchor: number; direction: number; compact: boolean; controls: boolean };
export const INITIAL_SESSION_HEADER: SessionHeaderScroll = { y: 0, anchor: 0, direction: 0, compact: false, controls: true };
export function advanceSessionHeader(previous: SessionHeaderScroll, rawY: number, titleBottom: number, maxY = Infinity): SessionHeaderScroll {
  'worklet';
  const y = Math.min(Math.max(0, maxY), Math.max(0, rawY));
  if (y <= titleBottom) return { y, anchor: y, direction: 0, compact: false, controls: true };
  if (!previous.compact) return { y, anchor: y, direction: 1, compact: true, controls: false };
  const delta = y - previous.y, direction = delta === 0 ? previous.direction : delta > 0 ? 1 : -1;
  const anchor = direction === previous.direction ? previous.anchor : previous.y;
  const controls = Math.abs(y - anchor) >= 8 ? direction < 0 : previous.controls;
  return { y, anchor, direction, compact: true, controls };
}
export function SessionScrollHeader({ title, clock, compact, controls, pinned, disabled, top, completed, total, onBack, onCancel, onFinish, onHeight }: {
  title: string; clock: ReactNode; compact: boolean; controls: boolean; pinned: boolean; disabled: boolean; top: number; completed: number; total: number;
  onBack: () => void; onCancel: () => void; onFinish: () => void; onHeight: (height: number) => void;
}) {
  const { colors } = useOwnlevelTheme(), reduce = useReduceMotion();
  const visible = !compact || controls || pinned || reduce;
  const fade = useAnimatedStyle(() => ({ opacity: withTiming(visible ? 1 : 0, { duration: reduce ? 0 : brandTokens.motion.duration.fast }) }), [visible, reduce]);
  const back = <Pressable accessibilityRole="button" accessibilityLabel="Volver a Entrenar" onPress={onBack} style={styles.button}>
    <AppIcon name="chevronLeft" size={20} color={colors.textMuted} /><AppText variant={compact ? 'footnote' : 'body'}>Entrenar</AppText>
  </Pressable>;
  const finish = <View style={styles.actions}>
    <Pressable accessibilityRole="button" accessibilityLabel="Cancelar entrenamiento" accessibilityState={{ disabled }} disabled={disabled} onPress={onCancel} style={styles.trash}><AppIcon name="trash" size={20} color={disabled ? colors.textMuted : colors.danger} /></Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel="Finalizar entrenamiento" accessibilityState={{ disabled }} disabled={disabled} onPress={onFinish} style={styles.button}><AppText variant={compact ? 'footnote' : 'label'} style={{ color: disabled ? colors.textMuted : colors.primary }}>Finalizar</AppText></Pressable>
  </View>;
  const row = <View style={[styles.row, !compact && styles.expandedRow]}>
    <Animated.View testID="session-header-back" pointerEvents={visible ? 'auto' : 'none'} accessibilityElementsHidden={!visible} importantForAccessibility={visible ? 'auto' : 'no-hide-descendants'} style={[compact ? styles.left : styles.expandedLeft, fade]}>
      {compact ? back : <GlassSurface interactive style={styles.pill}>{back}</GlassSurface>}
    </Animated.View>
    <View style={styles.title}>{compact ? <><AppText numberOfLines={1} variant="headline">{title}</AppText>{clock}</> : null}</View>
    <Animated.View testID="session-header-actions" pointerEvents={visible ? 'auto' : 'none'} accessibilityElementsHidden={!visible} importantForAccessibility={visible ? 'auto' : 'no-hide-descendants'} style={[compact ? styles.right : styles.expandedRight, fade]}>
      {compact ? finish : <GlassSurface interactive style={styles.pill}>{finish}</GlassSurface>}
    </Animated.View>
  </View>;
  return <View testID="session-scroll-header" style={[styles.overlay, { paddingTop: top, backgroundColor: compact ? 'transparent' : colors.background }]} onLayout={event => onHeight(event.nativeEvent.layout.height)}>
    {compact ? <GlassSurface style={styles.bar}>{row}<View accessible accessibilityRole="progressbar" accessibilityLabel="Progreso del entrenamiento compacto" accessibilityValue={{ min: 0, max: Math.max(1, total), now: completed }} style={[styles.track, { backgroundColor: colors.surfaceRaised }]}><View style={{ height: '100%', width: `${Math.min(100, Math.max(0, completed / Math.max(1, total) * 100))}%`, backgroundColor: colors.primary }} /></View></GlassSurface> : <>{row}<View style={styles.track} /></>}
  </View>;
}
const styles = StyleSheet.create({
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 5 }, bar: { overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 56, paddingHorizontal: spacing.xs }, expandedRow: { paddingHorizontal: spacing.lg },
  left: { width: 96 }, right: { width: 96 }, expandedLeft: { width: 112 }, expandedRight: { width: 152 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center' }, title: { flex: 1, minWidth: 0, alignItems: 'center' },
  button: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', minHeight: 44, gap: spacing.xs, paddingHorizontal: spacing.xs },
  trash: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }, pill: { borderRadius: radius.full, overflow: 'hidden' }, track: { height: 3 },
});
