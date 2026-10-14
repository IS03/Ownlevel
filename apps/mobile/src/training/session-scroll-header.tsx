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
  // Same glass pills expanded and compact (SS1/SS2); they size to their content so nothing clips.
  const back = <GlassSurface interactive visible={visible} style={styles.pill}><Animated.View style={fade}><Pressable accessibilityRole="button" accessibilityLabel="Volver a Entrenar" onPress={onBack} style={[styles.button, styles.backButton]}>
    <AppIcon name="chevronLeft" size={20} color={colors.textMuted} /><AppText variant="body">Entrenar</AppText>
  </Pressable></Animated.View></GlassSurface>;
  const finish = <GlassSurface interactive visible={visible} style={styles.pill}><Animated.View style={[styles.actions, fade]}>
    <Pressable accessibilityRole="button" accessibilityLabel="Cancelar entrenamiento" accessibilityState={{ disabled }} disabled={disabled} onPress={onCancel} style={styles.trash}><AppIcon name="trash" size={20} color={disabled ? colors.textMuted : colors.danger} /></Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel="Finalizar entrenamiento" accessibilityState={{ disabled }} disabled={disabled} onPress={onFinish} style={[styles.button, styles.finishButton]}><AppText variant="label" style={{ color: disabled ? colors.textMuted : colors.primary }}>Finalizar</AppText></Pressable>
  </Animated.View></GlassSurface>;
  const hidden = { pointerEvents: visible ? 'auto' as const : 'none' as const, accessibilityElementsHidden: !visible, importantForAccessibility: visible ? 'auto' as const : 'no-hide-descendants' as const };
  const row = <View style={styles.row}>
    <View testID="session-header-back" {...hidden}>{back}</View>
    <View style={styles.spacer} />
    <View testID="session-header-actions" {...hidden}>{finish}</View>
    {compact ? <View pointerEvents="none" style={[styles.title, { paddingHorizontal: visible ? 128 : spacing.lg }]}><AppText numberOfLines={1} variant="headline">{title}</AppText>{clock}</View> : null}
  </View>;
  const ratio = Math.min(1, Math.max(0, completed / Math.max(1, total)));
  return <View testID="session-scroll-header" style={[styles.overlay, { paddingTop: top, backgroundColor: colors.background }, compact && { borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border }]} onLayout={event => onHeight(event.nativeEvent.layout.height)}>
    {row}
    {compact ? <View accessible accessibilityRole="progressbar" accessibilityLabel="Progreso del entrenamiento compacto" accessibilityValue={{ min: 0, max: Math.max(1, total), now: completed }} style={[styles.track, { backgroundColor: colors.surfaceRaised }]}><View style={{ height: '100%', width: `${ratio * 100}%`, backgroundColor: colors.primary }} /></View> : <View style={styles.track} />}
  </View>;
}
const styles = StyleSheet.create({
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 5 },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 60, paddingHorizontal: spacing.lg }, spacer: { flex: 1 },
  title: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, alignItems: 'center', justifyContent: 'center' },
  actions: { flexDirection: 'row', alignItems: 'center' },
  button: { flexDirection: 'row', alignItems: 'center', minHeight: 44, gap: spacing.xs }, backButton: { paddingLeft: spacing.sm, paddingRight: spacing.md }, finishButton: { paddingRight: spacing.md },
  trash: { width: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }, pill: { borderRadius: radius.full, overflow: 'hidden' }, track: { height: 3 },
});
