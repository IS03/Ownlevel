import { Children, Fragment, isValidElement, type PropsWithChildren, type ReactNode } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';

import { layout } from './brand';
import { AppIcon, appIconSize, type AppIconName } from './icons';
import { AppText, Separator } from './primitives';
import { radius, spacing } from './tokens';
import { useOwnlevelTheme } from './theme';

type ListRowProps = {
  title: string;
  subtitle?: string;
  icon?: AppIconName;
  /** Trailing value text (muted, tabular when numeric). */
  value?: string;
  numericValue?: boolean;
  /** A 44 pt minimum row for dense native lists; still grows with Dynamic Type. */
  compact?: boolean;
  /** Trailing control (switch, badge) instead of a value. */
  trailing?: ReactNode;
  /** Defaults to true for pressable rows. */
  chevron?: boolean;
  onPress?: () => void;
  disabled?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  testID?: string;
};

/** Row: icon + title + subtitle + trailing value/control/chevron. Min touch 44. */
export function ListRow({
  accessibilityHint, accessibilityLabel, chevron, compact = false, disabled = false, icon, numericValue = false, onPress, subtitle,
  testID, title, trailing, value,
}: ListRowProps) {
  const { colors } = useOwnlevelTheme();
  const content = (
    <>
      {icon ? <AppIcon color={colors.textMuted} name={icon} size={appIconSize.row} /> : null}
      <View style={styles.text}>
        <AppText variant="body">{title}</AppText>
        {subtitle ? <AppText muted variant="footnote">{subtitle}</AppText> : null}
      </View>
      {value ? <AppText muted numeric={numericValue} variant="subheadline">{value}</AppText> : null}
      {trailing}
      {(chevron ?? Boolean(onPress)) ? <AppIcon color={colors.textMuted} name="chevronRight" size={appIconSize.inline} /> : null}
    </>
  );
  if (!onPress) {
    return <View accessible={Boolean(accessibilityLabel)} accessibilityLabel={accessibilityLabel} style={[styles.row, compact && styles.compact]} testID={testID}>{content}</View>;
  }
  return (
    <Pressable
      accessibilityHint={accessibilityHint}
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [styles.row, compact && styles.compact, pressed && { backgroundColor: colors.surfaceRaised }, disabled && styles.disabled]}
    >
      {content}
    </Pressable>
  );
}

type LinkRowProps = {
  label: string;
  /** Current value of a picker row ("Medida · Cintura"): muted, on the right. */
  value?: string;
  numeric?: boolean;
  /** navigate = chevron right; disclosure = chevron down/up; back = leading chevron left. */
  kind?: 'navigate' | 'disclosure' | 'back';
  expanded?: boolean;
  onPress: () => void;
  disabled?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  testID?: string;
};

/**
 * Navigation, disclosure or a picker as a plain row: no fill, no border, never a full-width banner button. Buttons are for real
 * actions (save, cancel, add, retry); everything that only moves, opens or chooses is a row. Min touch 44, grows with Dynamic Type.
 */
export function LinkRow({
  accessibilityHint, accessibilityLabel, disabled = false, expanded, kind = 'navigate', label, numeric = false, onPress, testID, value,
}: LinkRowProps) {
  const { colors } = useOwnlevelTheme();
  const { fontScale } = useWindowDimensions();
  const stacked = Boolean(value) && fontScale > 1.3;
  const chevron = kind === 'back' ? null : kind === 'disclosure'
    ? <View style={expanded ? styles.flipped : undefined}><AppIcon color={colors.textMuted} name="chevronDown" size={appIconSize.inline} /></View>
    : <AppIcon color={colors.textMuted} name="chevronRight" size={appIconSize.inline} />;
  return (
    <Pressable
      accessibilityHint={accessibilityHint}
      accessibilityLabel={accessibilityLabel ?? (value ? `${label}, ${value}` : label)}
      accessibilityRole="button"
      accessibilityState={{ disabled, ...(kind === 'disclosure' ? { expanded: Boolean(expanded) } : {}) }}
      disabled={disabled}
      hitSlop={{ left: spacing.xs, right: spacing.xs }}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [styles.link, pressed && { backgroundColor: colors.surfaceRaised }, disabled && styles.disabled]}
    >
      {kind === 'back' ? <AppIcon color={colors.textMuted} name="chevronLeft" size={appIconSize.inline} /> : null}
      <View style={[styles.linkText, !stacked && styles.linkInline]}>
        <AppText numeric={numeric && !value} style={styles.linkLabel} variant="body">{label}</AppText>
        {value ? <AppText muted numeric={numeric} style={!stacked && styles.linkValue} variant="body">{value}</AppText> : null}
      </View>
      {chevron}
    </Pressable>
  );
}

/** Grouped list on a card with hairline separators between rows (no glass). */
export function ListGroup({ children, bordered = true, compact = false, elevated = false }: PropsWithChildren<{ bordered?: boolean; compact?: boolean; elevated?: boolean }>) {
  const { colors } = useOwnlevelTheme();
  const rows = Children.toArray(children).filter(isValidElement);
  return (
    <View style={[styles.group, compact && { paddingVertical: 0 }, { backgroundColor: elevated ? colors.surfaceRaised : colors.surface, borderColor: colors.border, borderWidth: bordered ? 1 : 0 }]}>
      {rows.map((row, index) => (
        <Fragment key={row.key ?? index}>
          {index > 0 ? <Separator /> : null}
          {row}
        </Fragment>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  compact: { minHeight: 44, paddingVertical: spacing.xs },
  row: {
    alignItems: 'center',
    borderRadius: radius.inner,
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: layout.rowHeight,
    paddingVertical: spacing.sm,
  },
  text: { flex: 1, gap: 2 },
  group: {
    borderRadius: radius.card,
    borderWidth: 1,
    paddingHorizontal: layout.cardPadding,
    paddingVertical: spacing.xs,
  },
  disabled: { opacity: 0.45 },
  link: { alignItems: 'center', borderRadius: radius.inner, flexDirection: 'row', gap: spacing.sm, minHeight: layout.minTouch, paddingVertical: spacing.sm },
  linkText: { flex: 1, gap: 2 },
  linkInline: { alignItems: 'baseline', flexDirection: 'row', gap: spacing.md },
  linkLabel: { flexShrink: 1 },
  linkValue: { flexShrink: 1, marginLeft: 'auto', textAlign: 'right' },
  flipped: { transform: [{ rotate: '180deg' }] },
});
