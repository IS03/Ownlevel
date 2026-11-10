import { useState, type PropsWithChildren } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { AppIcon, appIconSize, AppText, brandTokens, Heading, spacing, useOwnlevelTheme } from '@/design-system';
import { historyDomainLabels, type HistoryFact } from '@/api/history';

// Presentation only: the historical date never inherits a Progress reporting period.
export const historyAreaLabels = (fact: HistoryFact) => historyDomainLabels(fact).map(label => label === 'Training' ? 'Entrenamiento' : label);

export function HistoryLink({ label, accessibilityLabel, onPress }: { label: string; accessibilityLabel?: string; onPress: () => void }) {
  const { colors } = useOwnlevelTheme();
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label} onPress={onPress}
    style={({ pressed }) => [styles.link, pressed && { backgroundColor: colors.surfaceRaised }]}>
    <AppText variant="subheadline" style={styles.linkText}>{label}</AppText>
    <AppIcon name="chevronRight" color={colors.textMuted} size={appIconSize.inline} />
  </Pressable>;
}

export function HistorySection({ title, actionLabel, actionText, onPress, children }: PropsWithChildren<{ title: string; actionLabel: string; actionText: string; onPress: () => void }>) {
  const { colors } = useOwnlevelTheme(), { fontScale } = useWindowDimensions();
  return <View style={[styles.section, { borderColor: colors.border }]}>
    <View style={[styles.header, fontScale > 1.3 && styles.stack]}>
      <Heading level={2} style={styles.title}>{title}</Heading>
      <HistoryLink label={actionText} accessibilityLabel={actionLabel} onPress={onPress} />
    </View>
    {children}
  </View>;
}

export function HistoryDetails({ label, children }: PropsWithChildren<{ label: string }>) {
  const [expanded, setExpanded] = useState(false), { colors } = useOwnlevelTheme();
  return <View style={styles.details}>
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ expanded }}
      onPress={() => setExpanded(value => !value)} style={({ pressed }) => [styles.link, pressed && { backgroundColor: colors.surfaceRaised }]}>
      <AppText variant="subheadline" style={styles.linkText}>{label}</AppText>
      <AppIcon name={expanded ? 'chevronDown' : 'chevronRight'} color={colors.textMuted} size={appIconSize.inline} />
    </Pressable>
    {expanded ? children : null}
  </View>;
}

export const historyStyles = StyleSheet.create({
  controls: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
  grow: { flex: 1 },
  caption: { gap: spacing.xs },
});
const styles = StyleSheet.create({
  section: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: spacing.lg, marginTop: spacing.sm, gap: spacing.sm },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: { flex: 1 },
  stack: { flexDirection: 'column', alignItems: 'stretch' },
  link: { minHeight: brandTokens.layout.minTouch, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
  linkText: { flexShrink: 1 },
  details: { gap: spacing.sm },
});
