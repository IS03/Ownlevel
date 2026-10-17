import type { PropsWithChildren } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { AppIcon, AppText, GlassSurface, pressedStyle, useOwnlevelTheme, useReduceMotion, type AppIconName } from '@/design-system';

export function NutritionGlassButton({ icon, label, onPress, wide = false }: { icon: AppIconName; label: string; onPress?: () => void; wide?: boolean }) {
  const reduced = useReduceMotion();
  return <Pressable accessibilityLabel={label} accessibilityRole="button" disabled={!onPress} accessibilityState={{ disabled: !onPress }} onPress={onPress}
    style={({ pressed }) => [wide && styles.wide, !onPress && styles.disabled, pressedStyle(pressed, reduced)]}>
    <NutritionGlassFace icon={icon} label={label} wide={wide} />
  </Pressable>;
}
/** The button's glass and content without the touch: native menus (iOS) draw over it and take the tap themselves. */
export function NutritionGlassFace({ icon, label, wide = false }: { icon: AppIconName; label: string; wide?: boolean }) {
  const { colors } = useOwnlevelTheme();
  return <GlassSurface interactive style={[styles.glass, wide && styles.wideGlass]}>
    <AppIcon name={icon} color={wide ? colors.primary : colors.text} size={20} />
    {wide ? <AppText style={{ color: colors.primary }} variant="headline">{label}</AppText> : null}
  </GlassSurface>;
}
export function NutritionSectionHeading({ children, action, onAction }: PropsWithChildren<{ action?: string; onAction?: () => void }>) {
  const { colors } = useOwnlevelTheme();
  return <View style={styles.heading}>
    <AppText accessibilityRole="header" variant="headline">{children}</AppText>
    {onAction ? <Pressable accessibilityLabel={action} accessibilityRole="button" onPress={onAction} style={styles.link}>
      <AppText muted variant="footnote">{action}</AppText><AppIcon name="chevronRight" size={17} color={colors.textMuted} />
    </Pressable> : null}
  </View>;
}
const styles = StyleSheet.create({
  glass: { width: 44, height: 44, borderRadius: 999, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  wide: { width: '100%' }, wideGlass: { flexDirection: 'row', gap: 8, height: 50, width: '100%', borderRadius: 14 },
  disabled: { opacity: 0.45 }, heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 44 },
  link: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44 },
});
