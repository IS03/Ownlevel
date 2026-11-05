import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { AppIcon, AppText, pressedStyle, spacing, useOwnlevelTheme, useReduceMotion } from '@/design-system';

/** A row that opens something. With large text its label and value stack and wrap instead of squeezing (IDENTIDAD.md, Dynamic Type). */
export function InsightRow({ label, detail, value, spoken, expanded, onPress, heading = false, muted = false }: {
  label: string; detail?: string; value?: string | number; spoken: string; expanded?: boolean; onPress: () => void; heading?: boolean; muted?: boolean;
}) {
  const { colors } = useOwnlevelTheme();
  const { fontScale } = useWindowDimensions();
  const reduced = useReduceMotion();
  const stacked = fontScale > 1.3;
  return <Pressable accessibilityRole="button" accessibilityLabel={spoken} accessibilityState={expanded === undefined ? undefined : { expanded }} onPress={onPress}
    style={({ pressed }) => [styles.row, { borderColor: colors.border }, pressedStyle(pressed, reduced)]}>
    <View style={[styles.content, stacked && styles.stacked]}>
      <View style={!stacked ? styles.text : undefined}>
        <AppText muted={muted} variant={heading ? 'headline' : 'body'}>{label}</AppText>
        {detail ? <AppText muted numeric variant="footnote">{detail}</AppText> : null}
      </View>
      {value === undefined ? null : <AppText muted numeric variant="subheadline" style={!stacked ? styles.value : undefined}>{value}</AppText>}
    </View>
    <AppIcon color={colors.textMuted} name={expanded === undefined ? 'chevronRight' : expanded ? 'chevronDown' : 'chevronRight'} size={15} />
  </Pressable>;
}

const styles = StyleSheet.create({
  row: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth },
  content: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  stacked: { alignItems: 'flex-start', flexDirection: 'column', gap: 2 },
  text: { flex: 1, flexShrink: 1 },
  value: { flexShrink: 1, textAlign: 'right' },
});
