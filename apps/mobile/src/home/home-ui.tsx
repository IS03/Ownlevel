import { useContext, type PropsWithChildren } from 'react';
import { Pressable, StyleSheet, View, type ViewProps, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';

import {
  AppIcon,
  AppText,
  GlassSurface,
  brandTokens,
  pressedStyle,
  radius,
  spacing,
  useOwnlevelTheme,
  useReduceMotion,
  type AppIconName,
} from '@/design-system';

import { HEADER_SLACK, homeLayout } from './home-layout';

/** Horizontal padding of a Home block: the gutter plus the side safe-area insets (landscape, rounded corners). */
export function useHomeGutter() {
  // Context (not the hook) so a tree without a provider, like unit tests, gets 0 insets.
  const insets = useContext(SafeAreaInsetsContext);
  return { paddingLeft: homeLayout.gutter + (insets?.left ?? 0), paddingRight: homeLayout.gutter + (insets?.right ?? 0) };
}

/** A Home block inside the gutter. */
export function HomeGutter({ children, style, ...props }: PropsWithChildren<ViewProps>) {
  return <View {...props} style={[useHomeGutter(), style]}>{children}</View>;
}

/** Section header: 44 pt row with the Title 2 heading and an optional accent link. */
export function HomeSectionTitle({ action, accessibilityLabel, children, onAction, title }: PropsWithChildren<{
  action?: string; accessibilityLabel?: string; onAction?: () => void; title: string;
}>) {
  return (
    <View style={styles.sectionHeader}>
      <AppText accessibilityRole="header" style={styles.flex} variant={title === 'Métricas' || title === 'Progreso' ? 'headline' : 'title2'}>{title}</AppText>
      {children ?? (action && onAction ? <HomeLink accessibilityLabel={accessibilityLabel} label={action} onPress={onAction} /> : null)}
    </View>
  );
}

/**
 * Home V3: no cards. Each block sits on the screen background; hierarchy comes from the
 * type scale, spacing and hairlines (iOS-style).
 */
export function HomeSection({ action, accessibilityLabel, children, onAction, testID, title }: PropsWithChildren<{
  action?: string; accessibilityLabel?: string; onAction?: () => void; testID?: string; title: string;
}>) {
  return (
    <HomeGutter testID={testID}>
      <HomeSectionTitle accessibilityLabel={accessibilityLabel} action={action} onAction={onAction} title={title} />
      <View style={styles.sectionContent}>{children}</View>
    </HomeGutter>
  );
}

/** Plain accent link ("+ Comida", "Progreso →", "Ver todo"), 44 pt touch area. */
export function HomeLink({ accessibilityLabel, label, onPress, testID }: { accessibilityLabel?: string; label: string; onPress: () => void; testID?: string }) {
  const { colors } = useOwnlevelTheme();
  return (
    <Pressable accessibilityLabel={accessibilityLabel ?? label} accessibilityRole="button" hitSlop={{ bottom: 12, left: 12, right: 12, top: 12 }}
      onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.55 : 1 })} testID={testID}>
      <AppText style={[styles.link, { color: colors.primary }]}>{label}</AppText>
    </Pressable>
  );
}

/** Raised champagne material shared by Home's session and food controls. */
export function HomeActionSurface({ children, style, testID }: PropsWithChildren<{ style?: StyleProp<ViewStyle>; testID?: string }>) {
  const { colors } = useOwnlevelTheme();
  const reduced = useReduceMotion();
  return <View style={styles.actionShadow}>
    <GlassSurface interactive={!reduced} tint={colors.brandSubtle} style={[styles.actionSurface, style]} testID={testID}>{children}</GlassSurface>
  </View>;
}

/** Full-width action: `solid` = the one primary action; `soft` = champagne Liquid Glass. */
export function HomeButton({ accessibilityHint, label, onPress, testID, tone }: {
  accessibilityHint?: string; label: string; onPress: () => void; testID?: string; tone: 'solid' | 'soft';
}) {
  const { colors } = useOwnlevelTheme();
  const reduceMotion = useReduceMotion();
  const palette = tone === 'solid'
    ? { background: colors.primary, text: colors.onPrimary }
    : { background: colors.brandSubtle, text: colors.primary };
  return (
    <Pressable accessibilityHint={accessibilityHint} accessibilityLabel={label} accessibilityRole="button" onPress={onPress}
      style={({ pressed }) => [tone === 'solid' && [styles.button, { backgroundColor: palette.background }], pressedStyle(pressed, reduceMotion)]} testID={testID}>
      {tone === 'soft' ? <HomeActionSurface style={styles.button} testID={testID ? `${testID}-glass` : undefined}>
        <AppText style={{ color: palette.text }} variant="headline">{label}</AppText>
      </HomeActionSurface> : <AppText style={{ color: palette.text }} variant="headline">{label}</AppText>}
    </Pressable>
  );
}

/**
 * A capsule filled to the actual `fraction` (0–1) on the first render. Binary training
 * markers and consumed ratios must never depend on a mount animation to show truth.
 */
export function HomeBar({ color, fraction, height, testID, track }: { color: string; fraction: number; height: number; testID?: string; track?: string }) {
  const { colors } = useOwnlevelTheme();
  const target = Math.min(1, Math.max(0, fraction));
  return (
    <View style={[styles.track, { backgroundColor: track ?? colors.surfaceRaised, height }]} testID={testID}>
      {target > 0 ? <View style={[styles.fill, { backgroundColor: color, width: `${target * 100}%` }]} testID={testID ? `${testID}-fill` : undefined} /> : null}
    </View>
  );
}

/** One flat row: optional leading icon (or custom leading view), title + subtitle, trailing value, chevron. */
export function HomeRow({ accessibilityHint, accessibilityLabel, chevron = false, children, icon, leading, onPress, subtitle, testID, title, trailing }: {
  accessibilityHint?: string; accessibilityLabel?: string; chevron?: boolean; children?: React.ReactNode; icon?: AppIconName; leading?: React.ReactNode;
  onPress?: () => void; subtitle?: string; testID?: string; title: string; trailing?: React.ReactNode;
}) {
  const { colors } = useOwnlevelTheme();
  const body = (
    <>
      <View style={styles.row}>
        {leading ?? (icon ? <View style={styles.rowIcon}><AppIcon color={colors.textMuted} name={icon} size={20} /></View> : null)}
        <View style={styles.flex}>
          <AppText style={styles.rowTitle}>{title}</AppText>
          {subtitle ? <AppText muted numeric variant="subheadline">{subtitle}</AppText> : null}
        </View>
        {trailing}
        {chevron ? <AppIcon color={colors.textMuted} name="chevronRight" size={15} /> : null}
      </View>
      {children}
    </>
  );
  if (!onPress) {
    return <View accessible={!!accessibilityLabel} accessibilityLabel={accessibilityLabel} style={styles.rowWrap} testID={testID}>{body}</View>;
  }
  return (
    <Pressable accessibilityHint={accessibilityHint} accessibilityLabel={accessibilityLabel ?? title} accessibilityRole="button" onPress={onPress}
      style={({ pressed }) => [styles.rowWrap, { opacity: pressed ? 0.55 : 1 }]} testID={testID}>
      {body}
    </Pressable>
  );
}

/** Hairline between rows; `inset` aligns it with the text column of icon rows. */
export function HomeRowSeparator({ inset = false }: { inset?: boolean }) {
  const { colors } = useOwnlevelTheme();
  return <View style={[styles.separator, inset && styles.separatorInset, { backgroundColor: colors.border }]} />;
}

/** Section title used by the Training hub (kept as is; Home V3 uses HomeSection). */
export function HomeSectionHeader({ action, onAction, title }: { action?: string; onAction?: () => void; title: string }) {
  const { colors } = useOwnlevelTheme();
  return (
    <View style={styles.legacyHeader}>
      <AppText accessibilityRole="header" style={styles.legacyTitle}>{title}</AppText>
      {action && onAction ? (
        <Pressable accessibilityLabel={action} accessibilityRole="button" hitSlop={10} onPress={onAction}
          style={({ pressed }) => ({ opacity: pressed ? 0.55 : 1 })}>
          <AppText style={{ color: colors.primary }} variant="subheadline">{action}</AppText>
        </Pressable>
      ) : null}
    </View>
  );
}

const ICON_COLUMN = 36;

const styles = StyleSheet.create({
  actionShadow: { borderRadius: radius.full, shadowColor: '#000000', shadowOpacity: 0.12, shadowOffset: { width: 0, height: 4 }, shadowRadius: 10, elevation: 3 },
  actionSurface: { borderRadius: radius.full, minHeight: 44, justifyContent: 'center' },
  button: { alignItems: 'center', borderRadius: radius.full, minHeight: brandTokens.layout.buttonHeight, justifyContent: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  fill: { borderRadius: radius.full, height: '100%' },
  flex: { flex: 1, minWidth: 0 },
  legacyHeader: { alignItems: 'baseline', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  legacyTitle: { fontSize: 20, fontWeight: '700', letterSpacing: -0.2, lineHeight: 25 },
  link: { fontSize: 15, fontWeight: '500', letterSpacing: -0.2, lineHeight: 20 },
  row: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, minHeight: 44 },
  rowIcon: { alignItems: 'flex-start', width: ICON_COLUMN - spacing.sm },
  rowTitle: { fontSize: 17, fontWeight: '500', letterSpacing: -0.4, lineHeight: 22 },
  rowWrap: { paddingVertical: spacing.sm },
  sectionContent: { marginTop: homeLayout.titleToContent - HEADER_SLACK },
  sectionHeader: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, minHeight: brandTokens.layout.minTouch },
  separator: { height: StyleSheet.hairlineWidth },
  separatorInset: { marginLeft: ICON_COLUMN },
  track: { borderRadius: radius.full, overflow: 'hidden' },
});
