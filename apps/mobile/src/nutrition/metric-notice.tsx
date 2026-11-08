import { useEffect } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeOut, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { AppIcon, AppText, brandTokens, spacing, useOwnlevelTheme, useReduceMotion } from '@/design-system';
import { NutritionToast } from './nutrition-toast';
import type { MetricNotice } from './use-metric-entry';

export function MetricSavedNotice({ notice, disabled, onUndo, onClose, onPrevious, pending = false }: {
  notice: MetricNotice; disabled: boolean; pending?: boolean; onUndo: () => void; onClose: () => void; onPrevious?: () => void;
}) {
  // Recovery in progress keeps its existing non-dismissible presentation.
  return pending ? <NutritionToast testID="nutrition-metric-notice" message={notice.message} state="pending" />
    : <ConfirmedMetric notice={notice} disabled={disabled} onUndo={onUndo} onClose={onClose} onPrevious={onPrevious} />;
}
function ConfirmedMetric({ notice, disabled, onUndo, onClose, onPrevious }: {
  notice: MetricNotice; disabled: boolean; onUndo: () => void; onClose: () => void; onPrevious?: () => void;
}) {
  const { colors } = useOwnlevelTheme(), insets = useSafeAreaInsets(), reduced = useReduceMotion(), { fontScale } = useWindowDimensions();
  const offset = useSharedValue(0);
  useEffect(() => { offset.set(0); }, [notice.id, notice.message, offset]);
  useEffect(() => { AccessibilityInfo.announceForAccessibility(notice.message); }, [notice.id, notice.message]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: reduced ? 0 : offset.get() }] }));
  const dismiss = Gesture.Pan().withTestId('metric-notice-dismiss').enabled(!disabled).activeOffsetY(spacing.md).failOffsetX([-spacing.md, spacing.md]).failOffsetY(-spacing.sm)
    .onUpdate(event => { offset.set(Math.max(0, event.translationY)); })
    .onEnd(event => {
      if (!disabled && event.translationY >= brandTokens.layout.minTouch && Math.abs(event.translationX) <= spacing.md) runOnJS(onClose)();
      else offset.set(reduced ? 0 : withTiming(0, { duration: brandTokens.motion.duration.fast }));
    }).onFinalize((_event, success) => { if (!success) offset.set(0); });
  return <View pointerEvents="box-none" testID="nutrition-metric-notice" style={[styles.dock, { bottom: Math.max(insets.bottom, brandTokens.layout.tabBarHeight + brandTokens.layout.tabBarInset) + spacing.sm }]}>
    <GestureDetector gesture={dismiss}>
      <Animated.View entering={FadeIn.duration(brandTokens.motion.duration.fast)} exiting={FadeOut.duration(brandTokens.motion.duration.fast)}
        style={[styles.capsule, { backgroundColor: colors.surfaceRaised, borderColor: colors.border, flexDirection: fontScale > 1.3 ? 'column' : 'row' }, style]}>
        <AppIcon name="checkmark" size={17} color={colors.primary} />
        <AppText numeric variant="subheadline" style={styles.message} accessibilityLiveRegion="polite" accessibilityLabel={notice.message}
          accessibilityHint="Deslizá hacia abajo o usá la acción Descartar confirmación."
          accessibilityActions={disabled ? [] : [{ name: 'dismiss', label: 'Descartar confirmación' }]}
          onAccessibilityAction={event => { if (!disabled && event.nativeEvent.actionName === 'dismiss') onClose(); }}
          onAccessibilityEscape={() => { if (!disabled) onClose(); }}>{notice.message}</AppText>
        {notice.undo ? <Pressable accessibilityRole="button" accessibilityLabel="Deshacer cambio de métrica" disabled={disabled} accessibilityState={{ disabled }} style={styles.action} onPress={onUndo}>
          <AppText variant="subheadline" style={{ color: colors.primary }}>Deshacer</AppText>
        </Pressable> : null}
        {notice.queuedCount && onPrevious ? <Pressable accessibilityRole="button" accessibilityLabel={`Ver confirmación anterior, ${notice.queuedCount} disponibles`} disabled={disabled} accessibilityState={{ disabled }} onPress={onPrevious} style={styles.action}>
          <AppText variant="footnote" muted numeric>Anterior · {notice.queuedCount}</AppText>
        </Pressable> : null}
      </Animated.View>
    </GestureDetector>
  </View>;
}
const styles = StyleSheet.create({
  dock: { position: 'absolute', left: brandTokens.layout.tabBarInset, right: brandTokens.layout.tabBarInset, alignItems: 'center' },
  capsule: { maxWidth: '100%', minHeight: brandTokens.layout.minTouch, borderWidth: StyleSheet.hairlineWidth, borderRadius: brandTokens.radius.inner, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, gap: spacing.xs, flexWrap: 'wrap', alignItems: 'center' },
  message: { flexShrink: 1 }, action: { minHeight: brandTokens.layout.minTouch, justifyContent: 'center', paddingHorizontal: spacing.xs },
});
