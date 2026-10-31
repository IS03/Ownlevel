import { useContext, useState, type PropsWithChildren, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  type ScrollViewProps,
  StyleSheet,
  Text,
  type TextProps,
  type TextStyle,
  type ViewProps,
  type ViewStyle,
  View,
} from 'react-native';
import {
  type Edge,
  SafeAreaView,
  SafeAreaInsetsContext,
} from 'react-native-safe-area-context';
import Animated, { type AnimatedRef } from 'react-native-reanimated';
import { ScrollEdgeBlur } from './scroll-edge';
import { NativeBottomEdge, ScrollBottomBackdrop, nativeBottomEdgeAvailable } from './scroll-bottom-backdrop';
import { HeaderHeightContext } from 'expo-router/build/react-navigation/elements/Header/HeaderHeightContext';

import { atmosphere, glowGradient } from './atmosphere';
import { layout } from './brand';
import { AppIcon, appIconSize, type AppIconName } from './icons';
import { pressedStyle, useReduceMotion } from './motion';
import { radius, sizes, spacing, typography } from './tokens';
import { useOwnlevelTheme } from './theme';

// Base components on the OWNLEVEL design system (IDENTIDAD.md § Sistema). Solid
// surfaces only (no glass on cards, rows, inputs or hero), one champagne accent,
// `danger` only for system failures and destructive actions.

export type AppTextVariant = keyof typeof typography;

type AppTextProps = TextProps & {
  muted?: boolean;
  /** Tabular figures so changing numbers do not jump (IDENTIDAD.md § Tipografía). */
  numeric?: boolean;
  variant?: AppTextVariant;
};

const numericStyle: TextStyle = { fontVariant: ['tabular-nums'] };

export function AppText({ muted = false, numeric = false, style, variant = 'body', ...props }: AppTextProps) {
  const { colors } = useOwnlevelTheme();

  return (
    <Text
      {...props}
      style={[typography[variant], { color: muted ? colors.textMuted : colors.text }, numeric && numericStyle, style]}
    />
  );
}

type HeadingProps = Omit<AppTextProps, 'variant'> & {
  /** 1 = Large Title (screen), 2 = Title 2 (section/card). */
  level?: 1 | 2;
};

export function Heading({ level = 1, ...props }: HeadingProps) {
  return <AppText accessibilityRole="header" variant={level === 1 ? 'largeTitle' : 'title2'} {...props} />;
}

/**
 * The screen's background glow (top-right radial gradient): fixed to the screen, behind
 * the content, static and never touchable. Screen and ScrollScreen render it, so every
 * screen built on them inherits it.
 *
 * Only on screens without a native header: an opaque stack header would cut the glow with
 * a hard edge. Extending it under headers needs transparent headers (follow-up PR).
 */
export function ScreenGlow() {
  const { isDark } = useOwnlevelTheme();
  const headerHeight = useContext(HeaderHeightContext) ?? 0;
  if (headerHeight > 0) return null;
  const rgb = atmosphere[isDark ? 'dark' : 'light'].glow;
  return <View pointerEvents="none" style={[StyleSheet.absoluteFill, { experimental_backgroundImage: glowGradient(rgb) }]} testID="screen-glow" />;
}

type ScreenProps = PropsWithChildren<{
  centered?: boolean;
  /** Background glow; off for focused flows (the active training session). */
  glow?: boolean;
  testID?: string;
}>;

export function Screen({ centered = false, children, glow = true, testID }: ScreenProps) {
  const { colors } = useOwnlevelTheme();

  return (
    <SafeAreaView
      edges={['left', 'right', 'bottom']}
      style={[styles.screen, { backgroundColor: colors.background }]}
      testID={testID}
    >
      {glow ? <ScreenGlow /> : null}
      <View style={[styles.screenContent, centered && styles.centered]}>{children}</View>
    </SafeAreaView>
  );
}

// The fade runs a little past the status bar, so content blurs in rather than being cut at a line.
const EDGE_EXTRA = 28;

type ScrollScreenProps = PropsWithChildren<
  Omit<ScrollViewProps, 'children'> & {
    /** Background glow; off for focused flows (the active training session). */
    glow?: boolean;
    /** On iOS the bottom protection belongs to the scroll inset, not a fixed strip outside the viewport. */
    safeAreaEdges?: Edge[];
    /**
     * For screens without a navigation header whose content scrolls under the status bar: once content passes
     * below it, it blurs progressively (IDENTIDAD.md § Vidrio: "top bar on scroll"). `edgeExtra` lengthens the
     * fade below the status bar (a screen with a floating header passes content under it too).
     */
    scrollEdge?: boolean;
    /** Keep scrolling text out of a floating native tab bar, with a fixed soft transition. iOS only. */
    bottomBackdrop?: boolean;
    edgeExtra?: number;
    /** Length of the blur's soft bottom edge (see ScrollEdgeBlur). */
    edgeFade?: number;
    /** Reanimated ref, for screens that follow the scroll on the UI thread (useScrollViewOffset). */
    scrollRef?: AnimatedRef<Animated.ScrollView>;
    /**
     * "manual": no automatic top inset (the screen pads its own content under the status bar), so the offset is 0 at
     * rest and never shifts when a hidden navigation bar is measured on the way back.
     */
    topInset?: 'automatic' | 'manual';
    testID?: string;
  }
>;

export function ScrollScreen({
  children,
  contentContainerStyle,
  glow = true,
  safeAreaEdges = ['left', 'right', 'bottom'],
  scrollEdge = false,
  bottomBackdrop = false,
  edgeExtra = EDGE_EXTRA,
  edgeFade,
  scrollRef,
  topInset = 'automatic',
  testID,
  onScroll,
  ...scrollViewProps
}: ScrollScreenProps) {
  const { colors } = useOwnlevelTheme();
  const insets = useContext(SafeAreaInsetsContext);
  const top = insets?.top ?? 0; // Optional: screens rendered without a provider just skip the bar.
  const scrollsUnderBottom = Platform.OS === 'ios' && safeAreaEdges.includes('bottom');
  // UIKit owns automatic insets. A manual header opts out, so use the measured safe area
  // (including a native tab/accessory when present) once, inside the scrollable viewport.
  const manualBottom = scrollsUnderBottom && topInset === 'manual' ? insets?.bottom ?? 0 : 0;
  const [scrolled, setScrolled] = useState(false);
  // #348: on iOS 26+ the native tab bar fades and blurs the list under it (Liquid Glass keeps its depth); older
  // systems keep the fixed backdrop of #342.
  const nativeEdge = bottomBackdrop && scrollsUnderBottom && nativeBottomEdgeAvailable();

  return (
    <SafeAreaView
      edges={scrollsUnderBottom ? safeAreaEdges.filter(edge => edge !== 'bottom') : safeAreaEdges}
      style={[styles.screen, { backgroundColor: colors.background }]}
      testID={testID}
    >
      {glow ? <ScreenGlow /> : null}
      <NativeBottomEdge enabled={nativeEdge}>
      <Animated.ScrollView
        ref={scrollRef}
        {...scrollViewProps}
        onScroll={event => {
          // Only crossing the threshold re-renders; the glass animates its own appearance.
          if (scrollEdge) { const next = event.nativeEvent.contentOffset.y + (topInset === 'manual' ? 0 : top) > 4; if (next !== scrolled) setScrolled(next); }
          onScroll?.(event);
        }}
        scrollEventThrottle={scrollEdge ? 16 : scrollViewProps.scrollEventThrottle}
        contentContainerStyle={[styles.scrollContent, contentContainerStyle]}
        contentInsetAdjustmentBehavior={topInset === 'manual' ? 'never' : 'automatic'}
        contentInset={manualBottom ? { ...scrollViewProps.contentInset, bottom: (scrollViewProps.contentInset?.bottom ?? 0) + manualBottom } : scrollViewProps.contentInset}
        scrollIndicatorInsets={manualBottom ? { ...scrollViewProps.scrollIndicatorInsets, bottom: (scrollViewProps.scrollIndicatorInsets?.bottom ?? 0) + manualBottom } : scrollViewProps.scrollIndicatorInsets}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </Animated.ScrollView>
      </NativeBottomEdge>
      {bottomBackdrop && scrollsUnderBottom && !nativeEdge ? <ScrollBottomBackdrop inset={insets?.bottom ?? 0} /> : null}
      {scrollEdge && top > 0 ? <ScrollEdgeBlur visible={scrolled} height={top + edgeExtra} fade={edgeFade} testID="scroll-edge-blur" /> : null}
    </SafeAreaView>
  );
}

type SurfaceProps = ViewProps & { elevated?: boolean };

/** Card: radius 20, padding 18, solid surface. */
export function Surface({
  children,
  elevated = false,
  style,
  ...props
}: SurfaceProps) {
  const { colors } = useOwnlevelTheme();

  return (
    <View
      {...props}
      style={[
        styles.surface,
        elevated && styles.elevated,
        { backgroundColor: colors.surface, borderColor: colors.border },
        style,
      ]}
    >
      {children}
    </View>
  );
}

/** Inner block inside a card (radius 12, brand "elevated" background). */
export function InnerSurface({ children, style, ...props }: ViewProps) {
  const { colors } = useOwnlevelTheme();
  return (
    <View {...props} style={[styles.inner, { backgroundColor: colors.surfaceRaised }, style]}>
      {children}
    </View>
  );
}

export function Row({ children, style, ...props }: ViewProps) {
  return (
    <View {...props} style={[styles.row, style]}>
      {children}
    </View>
  );
}

export type ButtonVariant = 'primary' | 'secondary' | 'quiet' | 'destructive';

type ButtonProps = {
  accessibilityHint?: string;
  accessibilityLabel?: string;
  disabled?: boolean;
  /** Leading icon (AppIcon), 20 pt as the brand sets for buttons. */
  icon?: AppIconName;
  label: string;
  /** Tabular figures when the label includes a count. */
  numeric?: boolean;
  /** Shows progress and blocks presses (the action is in flight). */
  loading?: boolean;
  onPress: () => void;
  testID?: string;
  /**
   * primary = the one champagne action; secondary = neutral; quiet = low-emphasis text
   * action; destructive = real destructive actions only (brand error).
   */
  variant?: ButtonVariant;
};

/** Height 50 (quiet: 44 min touch), radius 14, no decorative shadows, no haptics. */
export function Button({
  accessibilityHint,
  accessibilityLabel,
  disabled = false,
  icon,
  label,
  numeric = false,
  loading = false,
  onPress,
  testID,
  variant = 'primary',
}: ButtonProps) {
  const { colors } = useOwnlevelTheme();
  const reduceMotion = useReduceMotion();
  const blocked = disabled || loading;
  const tone = {
    primary: { background: colors.primary, border: colors.primary, text: colors.onPrimary },
    secondary: { background: colors.surfaceRaised, border: colors.border, text: colors.text },
    quiet: { background: 'transparent', border: 'transparent', text: colors.text },
    destructive: { background: colors.dangerSoft, border: 'transparent', text: colors.danger },
  }[variant];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint={accessibilityHint}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ busy: loading, disabled: blocked }}
      disabled={blocked}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.button,
        variant === 'quiet' && styles.buttonQuiet,
        { backgroundColor: tone.background, borderColor: tone.border },
        blocked && styles.disabled,
        pressedStyle(pressed && !blocked, reduceMotion),
      ]}
    >
      {loading ? <ActivityIndicator color={tone.text} size="small" /> : icon ? <AppIcon color={tone.text} name={icon} size={appIconSize.row} /> : null}
      <AppText numeric={numeric} style={{ color: tone.text }} variant="label">
        {label}
      </AppText>
    </Pressable>
  );
}

export function Separator() {
  const { colors } = useOwnlevelTheme();
  return <View accessibilityElementsHidden style={[styles.separator, { backgroundColor: colors.border }]} />;
}

type ProgressBarProps = {
  accessibilityLabel: string;
  color?: string;
  maximumValue?: number;
  trackColor?: string;
  value: number;
};

export function ProgressBar({
  accessibilityLabel,
  color,
  maximumValue = 100,
  trackColor,
  value,
}: ProgressBarProps) {
  const { colors } = useOwnlevelTheme();
  const safeMaximum = maximumValue > 0 ? maximumValue : 100;
  const safeValue = Math.min(safeMaximum, Math.max(0, value));
  const percentage = (safeValue / safeMaximum) * 100;

  return (
    <View
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="progressbar"
      accessibilityValue={{
        max: safeMaximum,
        min: 0,
        now: safeValue,
      }}
      accessible
      style={[
        styles.progressTrack,
        { backgroundColor: trackColor ?? colors.surfaceRaised },
      ]}
    >
      <View
        style={[
          styles.progressFill,
          { backgroundColor: color ?? colors.primary, width: `${percentage}%` },
        ]}
      />
    </View>
  );
}

type IconCircleProps = {
  backgroundColor?: string;
  color?: string;
  icon: AppIconName;
  size?: 'medium' | 'small';
};

export function IconCircle({
  backgroundColor,
  color,
  icon,
  size = 'medium',
}: IconCircleProps) {
  const { colors } = useOwnlevelTheme();
  const compact = size === 'small';
  return (
    <View
      accessibilityElementsHidden
      style={[
        styles.iconCircle,
        compact && styles.iconCircleSmall,
        { backgroundColor: backgroundColor ?? colors.brandSubtle },
      ]}
    >
      <AppIcon
        color={color ?? colors.primary}
        name={icon}
        size={compact ? appIconSize.inline : appIconSize.row}
      />
    </View>
  );
}

type SectionHeaderProps = {
  actionLabel?: string;
  onAction?: () => void;
  subtitle?: string;
  title: string;
};

/** Section title (Title 2) with an optional subtitle and trailing action. */
export function SectionHeader({
  actionLabel,
  onAction,
  subtitle,
  title,
}: SectionHeaderProps) {
  const { colors } = useOwnlevelTheme();
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.headerText}>
        <AppText accessibilityRole="header" variant="title2">
          {title}
        </AppText>
        {subtitle ? <AppText muted variant="subheadline">{subtitle}</AppText> : null}
      </View>
      {actionLabel && onAction ? (
        <Pressable
          accessibilityLabel={actionLabel}
          accessibilityRole="button"
          hitSlop={6}
          onPress={onAction}
          style={({ pressed }) => [
            styles.sectionAction,
            { opacity: pressed ? 0.55 : 1 },
          ]}
        >
          <AppText style={{ color: colors.primary }} variant="subheadline">
            {actionLabel}
          </AppText>
          <AppIcon color={colors.primary} name="chevronRight" size={appIconSize.inline} />
        </Pressable>
      ) : null}
    </View>
  );
}

type ScreenHeaderProps = {
  subtitle?: string;
  title: string;
  trailing?: ReactNode;
};

/** In-content screen header (Large Title) for screens without a native header title. */
export function ScreenHeader({ subtitle, title, trailing }: ScreenHeaderProps) {
  return (
    <View style={styles.screenHeader}>
      <View style={styles.headerText}>
        <AppText accessibilityRole="header" variant="largeTitle">{title}</AppText>
        {subtitle ? <AppText muted variant="subheadline">{subtitle}</AppText> : null}
      </View>
      {trailing}
    </View>
  );
}

type PressableSurfaceProps = PropsWithChildren<{
  accessibilityHint?: string;
  accessibilityLabel: string;
  disabled?: boolean;
  onPress: () => void;
  style?: ViewStyle;
}>;

export function PressableSurface({
  accessibilityHint,
  accessibilityLabel,
  children,
  disabled = false,
  onPress,
  style,
}: PressableSurfaceProps) {
  const { colors } = useOwnlevelTheme();
  return (
    <Pressable
      accessibilityHint={accessibilityHint}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.surface,
        styles.elevated,
        {
          backgroundColor: pressed ? colors.surfaceRaised : colors.surface,
          borderColor: colors.border,
        },
        disabled ? styles.disabled : null,
        style,
      ]}
    >
      {children}
    </Pressable>
  );
}

type InlineUnavailableProps = {
  actionLabel?: string;
  message: string;
  onAction?: () => void;
};

export function InlineUnavailable({
  actionLabel,
  message,
  onAction,
}: InlineUnavailableProps) {
  const { colors } = useOwnlevelTheme();
  return (
    <View accessibilityRole="alert" style={styles.inlineUnavailable}>
      <AppIcon color={colors.textMuted} name="warning" size={appIconSize.inline} />
      <AppText muted style={styles.flex} variant="footnote">
        {message}
      </AppText>
      {actionLabel && onAction ? (
        <Pressable
          accessibilityLabel={actionLabel}
          accessibilityRole="button"
          hitSlop={8}
          onPress={onAction}
        >
          <AppText style={{ color: colors.primary }} variant="footnote">
            {actionLabel}
          </AppText>
        </Pressable>
      ) : null}
    </View>
  );
}

type InlineNoticeProps = PropsWithChildren<{
  message: string;
  /**
   * neutral = state to know about (e.g. an intent kept for explicit recovery);
   * busy = something in flight; error = a real system failure.
   */
  tone?: 'neutral' | 'busy' | 'error';
}>;

/**
 * Inline status message. Actions are passed by the caller as children so each flow
 * keeps its exact semantics ("Comprobar", "Revisar intento", ...), never a generic retry.
 */
export function InlineNotice({ children, message, tone = 'neutral' }: InlineNoticeProps) {
  const { colors } = useOwnlevelTheme();
  const color = tone === 'error' ? colors.danger : colors.text;
  return (
    <InnerSurface accessibilityLiveRegion="polite" accessibilityRole={tone === 'busy' ? 'progressbar' : 'alert'} style={styles.notice}>
      <View style={styles.noticeLine}>
        {tone === 'busy'
          ? <ActivityIndicator color={colors.textMuted} size="small" />
          : <AppIcon color={tone === 'error' ? colors.danger : colors.textMuted} name="warning" size={appIconSize.inline} />}
        <AppText style={[styles.flex, { color }]} variant="subheadline">{message}</AppText>
      </View>
      {children}
    </InnerSurface>
  );
}

export function SkeletonBlock({
  height,
  style,
  width = '100%',
}: {
  height: number;
  style?: ViewStyle;
  width?: ViewStyle['width'];
}) {
  const { colors } = useOwnlevelTheme();
  return (
    <View
      accessibilityElementsHidden
      style={[
        styles.skeleton,
        { backgroundColor: colors.surfaceRaised, height, width },
        style,
      ]}
    />
  );
}

type StateProps = {
  action?: ReactNode;
  description: string;
  title: string;
};

function StateMessage({ action, children, description, icon, title }: StateProps & PropsWithChildren<{ icon?: ReactNode }>) {
  return (
    <Surface accessibilityRole="summary" style={styles.state}>
      {icon}
      <AppText variant="headline">{title}</AppText>
      <AppText muted variant="subheadline">{description}</AppText>
      {children}
      {action}
    </Surface>
  );
}

export function LoadingState({ label = 'Cargando' }: { label?: string }) {
  const { colors } = useOwnlevelTheme();

  return (
    <Surface accessibilityLabel={label} accessibilityRole="progressbar" style={styles.loadingState}>
      <ActivityIndicator color={colors.textMuted} />
      <AppText muted variant="subheadline">{label}</AppText>
    </Surface>
  );
}

type EmptyStateProps = StateProps & {
  /**
   * Optional preview of what the screen will look like (IDENTIDAD.md § Estados vacíos):
   * rendered greyed under a visible EJEMPLO label. Content must use neutral colors and
   * never look like the user's real numbers.
   */
  example?: ReactNode;
};

/** Truly empty (the data exists and there is nothing yet). Not for unavailable reads. */
export function EmptyState({ example, ...props }: EmptyStateProps) {
  return (
    <StateMessage {...props}>
      {example ? <ExampleFrame>{example}</ExampleFrame> : null}
    </StateMessage>
  );
}

/** Greyed sample content with an always-visible EJEMPLO label. */
export function ExampleFrame({ children }: PropsWithChildren) {
  const { colors } = useOwnlevelTheme();
  return (
    <View accessibilityLabel="Ejemplo" style={[styles.example, { borderColor: colors.border }]}>
      <AppText muted style={styles.exampleLabel} variant="caption">EJEMPLO</AppText>
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.exampleContent}>
        {children}
      </View>
    </View>
  );
}

/** The read failed: data may exist but could not be confirmed. Never shown as empty. */
export function UnavailableState(props: StateProps) {
  const { colors } = useOwnlevelTheme();
  return <StateMessage {...props} icon={<AppIcon color={colors.textMuted} name="warning" size={appIconSize.row} />} />;
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  screenContent: {
    alignSelf: 'center',
    flex: 1,
    gap: layout.blockGap,
    maxWidth: sizes.contentMaxWidth,
    padding: layout.screenPadding,
    width: '100%',
  },
  scrollContent: {
    alignSelf: 'center',
    flexGrow: 1,
    gap: layout.blockGap,
    maxWidth: sizes.contentMaxWidth,
    padding: layout.screenPadding,
    width: '100%',
  },
  centered: {
    justifyContent: 'center',
  },
  flex: {
    flex: 1,
  },
  surface: {
    borderRadius: radius.card,
    borderWidth: 1,
    gap: spacing.md,
    padding: layout.cardPadding,
  },
  elevated: {
    elevation: 2,
    shadowColor: '#000000',
    shadowOffset: { height: 2, width: 0 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
  },
  inner: {
    borderRadius: radius.inner,
    gap: spacing.sm,
    padding: spacing.md,
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  button: {
    alignItems: 'center',
    borderRadius: radius.button,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'center',
    minHeight: layout.buttonHeight,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  buttonQuiet: {
    minHeight: layout.minTouch,
  },
  disabled: {
    opacity: 0.45,
  },
  separator: {
    height: sizes.separator,
    width: '100%',
  },
  progressTrack: {
    borderRadius: radius.full,
    height: 8,
    overflow: 'hidden',
    width: '100%',
  },
  progressFill: {
    borderRadius: radius.full,
    height: '100%',
  },
  iconCircle: {
    alignItems: 'center',
    borderRadius: radius.full,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  iconCircleSmall: {
    height: 32,
    width: 32,
  },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
    minHeight: layout.minTouch,
  },
  screenHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
  },
  headerText: {
    flex: 1,
    gap: spacing.xs,
  },
  sectionAction: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
    minHeight: layout.minTouch,
  },
  inlineUnavailable: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: layout.minTouch,
  },
  notice: {
    gap: spacing.md,
  },
  noticeLine: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  skeleton: {
    borderRadius: radius.inner,
  },
  state: {
    gap: spacing.sm,
  },
  loadingState: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
  },
  example: {
    borderRadius: radius.inner,
    borderStyle: 'dashed',
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md,
  },
  exampleLabel: {
    letterSpacing: 0.6,
  },
  exampleContent: {
    opacity: 0.45,
  },
});
