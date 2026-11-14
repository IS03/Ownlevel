import { createContext, useCallback, useContext, useEffect, useRef, type PropsWithChildren } from 'react';
import { AccessibilityInfo, ActivityIndicator, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { SlideInDown, SlideOutDown, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import { layout, motion } from './brand';
import { GlassSurface } from './glass';
import { AppIcon } from './icons';
import type { AppIconName } from './icons';
import { useReduceMotion } from './motion';
import { AppText } from './primitives';
import { useOwnlevelTheme } from './theme';
import { radius, spacing } from './tokens';

export type NoticeState = 'info' | 'pending' | 'done';
export type NoticeAction = { label: string; accessibilityLabel: string; disabled?: boolean; onPress: () => void };
/** `screen`: above the bottom safe area. `tab`: never below the floating tab bar, even if the safe area does not include it. */
export type NoticePlacement = 'screen' | 'tab';

/** The widest a notice grows on a large screen; on a phone the screen padding bounds it first. */
const NOTICE_MAX_WIDTH = 420;

function useNoticeBottom(placement: NoticePlacement, bottomOffset: number) {
  const { bottom } = useSafeAreaInsets();
  const floor = placement === 'tab' ? Math.max(bottom, layout.tabBarHeight + layout.tabBarInset) : bottom;
  return floor + spacing.sm + bottomOffset;
}

const InStack = createContext(false);

/**
 * A local, layout-only column for a host that can show more than one notice at once (Home, Nutrition day):
 * its notices stack above the bottom bar instead of sitting on top of each other. It owns no state and no timers.
 */
export function NoticeStack({ children, placement = 'screen', bottomOffset = 0, testID }: PropsWithChildren<{ placement?: NoticePlacement; bottomOffset?: number; testID?: string }>) {
  const bottom = useNoticeBottom(placement, bottomOffset);
  return <InStack.Provider value><View pointerEvents="box-none" testID={testID} style={[styles.dock, styles.stack, { bottom }]}>{children}</View></InStack.Provider>;
}

/**
 * Compact transient notice: a centred capsule above the bottom bar. Presentation only; the owner of the notice decides
 * its text, timers and undo. Material: Liquid Glass (iOS 26) over a fixed brand backing, the same rule as the "Hoy" pill, so the
 * glass never magnifies the scrolling content beneath it; the brand surface elsewhere. It slides, never fades, so the glass keeps
 * rendering; with Reduce Motion it does not move at all.
 *
 * `onDismiss` is the ONLY thing that makes it dismissible (swipe down, VoiceOver "Descartar" action and escape). A pending notice
 * is never dismissible and never shows actions. Dismissing calls `onDismiss` and nothing else, never an action.
 */
export function TransientNotice({
  message, state = 'info', icon, action, secondaryAction, close, onDismiss, dismissLabel = 'Descartar aviso', dismissTestID = 'transient-notice-dismiss', disabled = false,
  alert = false, announce = false, announceKey, placement = 'screen', bottomOffset = 0, testID,
}: {
  message: string; state?: NoticeState; icon?: AppIconName; action?: NoticeAction; secondaryAction?: NoticeAction;
  /** Explicit close button, for a notice that keeps one instead of the swipe. */
  close?: { label: string; onPress: () => void };
  onDismiss?: () => void; dismissLabel?: string; dismissTestID?: string;
  /** Locks the swipe and the VoiceOver dismissal; the actions carry their own `disabled`. */
  disabled?: boolean; alert?: boolean; announce?: boolean; announceKey?: string | number; placement?: NoticePlacement; bottomOffset?: number; testID?: string;
}) {
  const { colors } = useOwnlevelTheme(), reduced = useReduceMotion(), { fontScale, width } = useWindowDimensions();
  const stacked = useContext(InStack), bottom = useNoticeBottom(placement, bottomOffset);
  const pending = state === 'pending', large = fontScale > 1.3, duration = motion.duration.fast;
  const hasActions = !pending && !!(action || secondaryAction || close);
  const dismissible = !!onDismiss && !pending, canDismiss = dismissible && !disabled;
  const offset = useSharedValue(0);
  // The gesture callback may outlive the render that built it; it always dismisses through the owner's latest handler, and only while allowed.
  const dismissRef = useRef<(() => void) | undefined>(undefined);
  useEffect(() => { dismissRef.current = canDismiss ? onDismiss : undefined; });
  const fire = useCallback(() => { dismissRef.current?.(); }, []);
  useEffect(() => { offset.set(0); }, [announceKey, message, offset]);
  useEffect(() => { if (announce) AccessibilityInfo.announceForAccessibility(message); }, [announce, announceKey, message]);
  const drag = useAnimatedStyle(() => ({ transform: [{ translateY: reduced ? 0 : offset.get() }] }));
  const pan = Gesture.Pan().withTestId(dismissTestID).enabled(canDismiss).activeOffsetY(spacing.md).failOffsetX([-spacing.md, spacing.md]).failOffsetY(-spacing.sm)
    .onUpdate(event => { offset.set(Math.max(0, event.translationY)); })
    // eslint-disable-next-line react-hooks/refs -- `fire` reads the latest handler only when the gesture ends, never during render
    .onEnd(event => {
      if (event.translationY >= layout.minTouch && Math.abs(event.translationX) <= spacing.md) runOnJS(fire)();
      else offset.set(reduced ? 0 : withTiming(0, { duration }));
    }).onFinalize((_event, success) => { if (!success) offset.set(0); });
  const capsule = <Animated.View testID={testID ? `${testID}-capsule` : undefined} style={[styles.capsule, { borderColor: colors.border, maxWidth: Math.min(NOTICE_MAX_WIDTH, width - 2 * layout.tabBarInset) }, drag]}>
    {/* The glass reads a fixed backing, never magnified letters from the content scrolling beneath it. */}
    <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" testID={testID ? `${testID}-backing` : undefined}
      style={[StyleSheet.absoluteFill, { backgroundColor: colors.surfaceRaised }]} />
    <GlassSurface interactive testID={testID ? `${testID}-surface` : undefined} style={[styles.surface, large ? styles.surfaceLarge : styles.surfaceInline, !hasActions && styles.surfacePlain]}>
      <View style={styles.lead}>
        {pending ? <ActivityIndicator color={colors.textMuted} /> : null}
        {!pending && (icon || state === 'done') ? <View testID={testID ? `${testID}-icon` : undefined}><AppIcon name={icon ?? 'checkmark'} size={17} color={colors.primary} /></View> : null}
        <AppText numeric variant="subheadline" numberOfLines={large ? undefined : 2} style={styles.message} accessibilityLiveRegion="polite" accessibilityLabel={message}
          accessibilityRole={alert ? 'alert' : undefined}
          accessibilityHint={canDismiss ? `Deslizá hacia abajo o usá la acción ${dismissLabel}.` : undefined}
          accessibilityActions={canDismiss ? [{ name: 'dismiss', label: dismissLabel }] : undefined}
          onAccessibilityAction={canDismiss ? event => { if (event.nativeEvent.actionName === 'dismiss') onDismiss!(); } : undefined}
          onAccessibilityEscape={canDismiss ? () => onDismiss!() : undefined}>{message}</AppText>
      </View>
      {hasActions ? <View style={[styles.actions, large && styles.actionsLarge]}>
        {action ? <Pressable accessibilityRole="button" accessibilityLabel={action.accessibilityLabel} accessibilityState={{ disabled: !!action.disabled }} disabled={action.disabled}
          onPress={action.onPress} style={[styles.action, action.disabled && styles.disabled]}>
          <AppText variant="subheadline" style={{ color: colors.primary, fontWeight: '600' }}>{action.label}</AppText>
        </Pressable> : null}
        {secondaryAction ? <Pressable accessibilityRole="button" accessibilityLabel={secondaryAction.accessibilityLabel} accessibilityState={{ disabled: !!secondaryAction.disabled }}
          disabled={secondaryAction.disabled} onPress={secondaryAction.onPress} style={[styles.action, secondaryAction.disabled && styles.disabled]}>
          <AppText variant="footnote" muted numeric>{secondaryAction.label}</AppText>
        </Pressable> : null}
        {close ? <Pressable accessibilityRole="button" accessibilityLabel={close.label} onPress={close.onPress} style={styles.close}>
          <AppIcon name="close" color={colors.textMuted} size={17} />
        </Pressable> : null}
      </View> : null}
    </GlassSurface>
  </Animated.View>;
  return <Animated.View pointerEvents="box-none" testID={testID}
    entering={reduced ? undefined : SlideInDown.duration(duration)} exiting={reduced ? undefined : SlideOutDown.duration(duration)}
    style={stacked ? styles.flow : [styles.dock, { bottom }]}>
    {dismissible ? <GestureDetector gesture={pan}>{capsule}</GestureDetector> : capsule}
  </Animated.View>;
}

const styles = StyleSheet.create({
  dock: { position: 'absolute', left: layout.tabBarInset, right: layout.tabBarInset, alignItems: 'center' },
  stack: { gap: spacing.xs },
  flow: { alignSelf: 'stretch', alignItems: 'center' },
  capsule: { minHeight: layout.minTouch, borderRadius: radius.tabBar, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  surface: { minHeight: layout.minTouch, paddingLeft: spacing.md, paddingRight: spacing.xs, paddingVertical: spacing.xs, gap: spacing.xs },
  // Without actions nothing carries the right padding (an action brings its own), so the text gets the same margin as on the left.
  surfacePlain: { paddingRight: spacing.md },
  surfaceInline: { flexDirection: 'row', alignItems: 'center' },
  surfaceLarge: { flexDirection: 'column', alignItems: 'stretch' },
  lead: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexShrink: 1 },
  message: { flexShrink: 1 },
  actions: { flexDirection: 'row', alignItems: 'center' },
  actionsLarge: { flexWrap: 'wrap', justifyContent: 'flex-end' },
  action: { minHeight: layout.minTouch, justifyContent: 'center', paddingHorizontal: spacing.sm },
  disabled: { opacity: 0.4 },
  close: { width: layout.minTouch, height: layout.minTouch, alignItems: 'center', justifyContent: 'center' },
});
