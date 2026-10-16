import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { AppIcon, AppText, GlassSurface, brandTokens, pressedStyle, spacing, useOwnlevelTheme, useReduceMotion } from '@/design-system';

export type ToastState = 'info' | 'pending' | 'done';

/**
 * Floating glass notice docked just above the tab bar (inside a tab, the bottom safe area already includes the bar): "Guardado · Deshacer", a pending
 * spinner or a brief confirmation. It slides (never fades) so its Liquid Glass keeps rendering.
 */
export function NutritionToast({ message, state = 'info', action, onClose, closeLabel = 'Cerrar aviso', testID }: {
  message: string; state?: ToastState; action?: { label: string; accessibilityLabel: string; disabled?: boolean; onPress: () => void };
  onClose?: () => void; closeLabel?: string; testID?: string;
}) {
  const { colors } = useOwnlevelTheme(), insets = useSafeAreaInsets(), reduced = useReduceMotion();
  const motion = brandTokens.motion.duration.fast;
  return <Animated.View accessibilityLiveRegion="polite" pointerEvents="box-none" testID={testID}
    entering={reduced ? undefined : SlideInDown.duration(motion)} exiting={reduced ? undefined : SlideOutDown.duration(motion)}
    style={[styles.dock, { bottom: insets.bottom + spacing.sm }]}>
    <GlassSurface interactive style={styles.glass}>
      {state === 'pending' ? <ActivityIndicator color={colors.textMuted} /> : null}
      {state === 'done' ? <AppIcon name="checkmark" color={colors.primary} size={17} /> : null}
      <AppText numeric variant="subheadline" numberOfLines={2} style={styles.text}>{message}</AppText>
      {action && state === 'info' ? <Pressable accessibilityRole="button" accessibilityLabel={action.accessibilityLabel} accessibilityState={{ disabled: !!action.disabled }}
        disabled={action.disabled} onPress={action.onPress} hitSlop={4} style={[styles.action, action.disabled && { opacity: 0.4 }]}>
        <AppText variant="subheadline" style={{ color: colors.primary, fontWeight: '600' }}>{action.label}</AppText>
      </Pressable> : null}
      {onClose && state === 'info' ? <Pressable accessibilityRole="button" accessibilityLabel={closeLabel} onPress={onClose} style={styles.close}>
        <AppIcon name="close" color={colors.textMuted} size={17} />
      </Pressable> : <View style={styles.end} />}
    </GlassSurface>
  </Animated.View>;
}

const styles = StyleSheet.create({
  dock: { position: 'absolute', left: brandTokens.layout.tabBarInset, right: brandTokens.layout.tabBarInset },
  glass: { minHeight: brandTokens.layout.buttonHeight, borderRadius: brandTokens.radius.tabBar, overflow: 'hidden', flexDirection: 'row', alignItems: 'center',
    gap: spacing.sm, paddingLeft: spacing.lg, paddingRight: spacing.xs },
  text: { flex: 1 },
  action: { minHeight: brandTokens.layout.minTouch, justifyContent: 'center', paddingHorizontal: spacing.md },
  close: { width: brandTokens.layout.minTouch, height: brandTokens.layout.minTouch, alignItems: 'center', justifyContent: 'center' },
  end: { width: spacing.sm },
  pillDock: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  pill: { minHeight: brandTokens.layout.minTouch, borderRadius: brandTokens.radius.full, overflow: 'hidden', flexDirection: 'row', alignItems: 'center',
    gap: spacing.sm, paddingHorizontal: spacing.lg },
});

/** Discreet glass pill above the tab bar, only while another day is shown: back to today in one tap. */
export function TodayPill({ onPress }: { onPress: () => void }) {
  const { colors } = useOwnlevelTheme(), insets = useSafeAreaInsets(), reduced = useReduceMotion();
  const motion = brandTokens.motion.duration.fast;
  return <Animated.View pointerEvents="box-none" entering={reduced ? undefined : SlideInDown.duration(motion)} exiting={reduced ? undefined : SlideOutDown.duration(motion)}
    style={[styles.pillDock, { bottom: insets.bottom + spacing.sm }]}>
    <Pressable accessibilityRole="button" accessibilityLabel="Volver a hoy" onPress={onPress} testID="nutrition-today-pill"
      style={({ pressed }) => pressedStyle(pressed, reduced)}>
      <GlassSurface interactive style={styles.pill}>
        <AppIcon name="calendar" color={colors.primary} size={17} />
        <AppText variant="subheadline" style={{ color: colors.primary, fontWeight: '600' }}>Hoy</AppText>
      </GlassSurface>
    </Pressable>
  </Animated.View>;
}
