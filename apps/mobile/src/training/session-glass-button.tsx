import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { AppText, GlassSurface, pressedStyle, spacing, useOwnlevelTheme, useReduceMotion } from '@/design-system';

export function SessionGlassButton({ label, onPress, disabled, style }: { label: string; onPress: () => void; disabled?: boolean; style?: StyleProp<ViewStyle> }) {
  const { colors } = useOwnlevelTheme();
  const reduceMotion = useReduceMotion();
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: !!disabled }} disabled={disabled}
    onPress={onPress} style={({ pressed }) => [style, disabled && styles.disabled, pressedStyle(pressed, reduceMotion)]}>
    <GlassSurface interactive style={[styles.control, { borderColor: colors.border }]}>
      <AppText variant="label" style={{ color: colors.text, textAlign: 'center' }}>{label}</AppText>
    </GlassSurface>
  </Pressable>;
}
const styles = StyleSheet.create({
  control: { minHeight: 44, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, justifyContent: 'center', alignItems: 'center', paddingHorizontal: spacing.md, overflow: 'hidden' },
  disabled: { opacity: 0.45 },
});
