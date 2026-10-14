import { Platform, Pressable, StyleSheet } from 'react-native';
import { AppText, Chip, GlassSurface, brandTokens, pressedStyle, radius, spacing, useOwnlevelTheme, useReduceMotion } from '@/design-system';
/** iOS: interactive Liquid Glass chip (a control, IDENTIDAD.md § Vidrio); elsewhere the brand chip. */
export function GroupChip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const { colors } = useOwnlevelTheme(), reduceMotion = useReduceMotion();
  if (Platform.OS !== 'ios') return <Chip kind="toggle" label={label} selected={selected} onPress={onPress} />;
  return <GlassSurface interactive tint={selected ? colors.brandSubtle : undefined} style={styles.glassShape}>
    <Pressable accessibilityRole="checkbox" accessibilityLabel={label} accessibilityState={{ checked: selected }} hitSlop={(brandTokens.layout.minTouch - brandTokens.layout.chipHeight) / 2} onPress={onPress}
      style={({ pressed }) => [styles.glassChip, pressedStyle(pressed, reduceMotion)]}>
      <AppText variant="subheadline" style={selected ? { color: colors.primary, fontWeight: '600' } : null}>{label}</AppText>
    </Pressable>
  </GlassSurface>;
}
const styles = StyleSheet.create({
  glassShape: { borderRadius: radius.chip },
  glassChip: { minHeight: brandTokens.layout.chipHeight, borderRadius: radius.chip, paddingHorizontal: spacing.md, alignItems: 'center', justifyContent: 'center' },
});
