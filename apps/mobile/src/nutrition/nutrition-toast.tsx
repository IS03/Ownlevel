import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppIcon, AppText, GlassSurface, TransientNotice, brandTokens, pressedStyle, spacing, useOwnlevelTheme, useReduceMotion, type NoticePlacement } from '@/design-system';

export type ToastState = 'info' | 'pending' | 'done';

/**
 * Thin wrapper over the shared transient notice (a centred capsule above the bottom bar): "Guardado · Deshacer", a pending spinner or a brief
 * confirmation. Its action and ✕ show only as "info"; it is never swipe-dismissible (a pending, brief or recovery notice has no dismissal).
 */
export function NutritionToast({ message, state = 'info', action, onClose, closeLabel = 'Cerrar aviso', testID, placement, bottomOffset }: {
  message: string; state?: ToastState; action?: { label: string; accessibilityLabel: string; disabled?: boolean; onPress: () => void };
  onClose?: () => void; closeLabel?: string; testID?: string; placement?: NoticePlacement; bottomOffset?: number;
}) {
  return <TransientNotice testID={testID} message={message} state={state} placement={placement} bottomOffset={bottomOffset}
    action={state === 'info' ? action : undefined} close={onClose && state === 'info' ? { label: closeLabel, onPress: onClose } : undefined} />;
}

const styles = StyleSheet.create({
  pillDock: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  pill: { minHeight: brandTokens.layout.minTouch, borderRadius: brandTokens.radius.full, overflow: 'hidden', flexDirection: 'row', alignItems: 'center',
    gap: spacing.sm, paddingHorizontal: spacing.lg },
});

/** Discreet glass pill above the tab bar, only while another day is shown: back to today in one tap. */
export function TodayPill({ onPress, onHeight }: { onPress: () => void; onHeight?: (height: number) => void }) {
  const { colors } = useOwnlevelTheme(), insets = useSafeAreaInsets(), reduced = useReduceMotion();
  return <View pointerEvents="box-none" testID="nutrition-today-dock" onLayout={event => onHeight?.(event.nativeEvent.layout.height)}
    style={[styles.pillDock, { bottom: insets.bottom + spacing.sm }]}>
    <Pressable accessibilityRole="button" accessibilityLabel="Volver a hoy" onPress={onPress} testID="nutrition-today-pill"
      style={({ pressed }) => pressedStyle(pressed, reduced)}>
      {/* The glass reads a fixed backing, never magnified letters from the scrolling meal beneath it. */}
      <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" testID="nutrition-today-backing"
        style={[StyleSheet.absoluteFill, { borderRadius: brandTokens.radius.full, backgroundColor: colors.background }]} />
      <GlassSurface style={styles.pill}>
        <AppIcon name="calendar" color={colors.primary} size={17} />
        <AppText variant="subheadline" style={{ color: colors.primary, fontWeight: '600' }}>Hoy</AppText>
      </GlassSurface>
    </Pressable>
  </View>;
}
