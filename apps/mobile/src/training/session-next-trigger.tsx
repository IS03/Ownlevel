import { Pressable, StyleSheet, View } from 'react-native';
import { AppIcon, AppText, GlassSurface, radius, sizes, spacing, useOwnlevelTheme } from '@/design-system';

/** The popover owns open state; the neutral surface changes without moving its anchor. */
export function SessionNextTrigger({ label, open, disabled, onPress, testID }: {
  label: string; open: boolean; disabled: boolean; onPress: () => void; testID?: string;
}) {
  const { colors } = useOwnlevelTheme();
  return <Pressable accessibilityRole="button" accessibilityLabel="Próxima vez" accessibilityState={{ expanded: open, disabled }}
    disabled={disabled} onPress={onPress} testID={testID} style={disabled ? styles.disabled : undefined}>
    {({ pressed }) => <GlassSurface style={[styles.control, { borderColor: open || pressed ? colors.textMuted : colors.border }]}>
      <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
        style={[StyleSheet.absoluteFill, { backgroundColor: colors.textMuted, opacity: open || pressed ? 0.08 : 0 }]} />
      <AppText variant="caption" style={styles.label}>{label}</AppText>
      <AppIcon name="chevronDown" size={17} color={colors.textMuted} />
    </GlassSurface>}
  </Pressable>;
}
const styles = StyleSheet.create({
  control: { minHeight: sizes.touchTarget, borderRadius: radius.button, borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.xs, overflow: 'hidden' },
  label: { flexShrink: 1 }, disabled: { opacity: 0.45 },
});
