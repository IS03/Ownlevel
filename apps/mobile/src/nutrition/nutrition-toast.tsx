import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { AppIcon, AppText, GlassSurface, brandTokens, spacing, useOwnlevelTheme, useReduceMotion } from '@/design-system';

export type ToastState = 'info' | 'pending' | 'done';

/**
 * Floating glass notice docked just above the tab bar (Nutrición): "Guardado · Deshacer", a pending
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
    style={[styles.dock, { bottom: insets.bottom + brandTokens.layout.tabBarHeight + spacing.sm }]}>
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
});
