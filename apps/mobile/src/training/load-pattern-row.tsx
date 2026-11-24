import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import type { LoadPattern } from '@/api/active-session';
import { AppIcon, AppText, sizes, spacing, useOwnlevelTheme } from '@/design-system';
import { haptics } from '@/platform/haptics';
import { patternDetail, patternTitle } from './load-pattern-model';

/**
 * #537 · A quiet row inside the expanded exercise, only when a pattern is confirmed: on the background (no card), secondary
 * type and one champagne detail. It reads previous executions only, so logging today's sets never moves it.
 */
export function LoadPatternRow({ pattern, disabled, onPress }: { pattern: LoadPattern; disabled: boolean; onPress: () => void }) {
  const { colors } = useOwnlevelTheme();
  const { fontScale } = useWindowDimensions();
  const title = patternTitle(pattern), detail = patternDetail(pattern);
  return <Pressable accessibilityRole="button" accessibilityLabel={`${title}. ${detail}`} accessibilityHint="Abre las sesiones que lo muestran"
    disabled={disabled} testID={`load-pattern-${pattern.signal}`}
    onPress={() => { haptics.selection(); onPress(); }}
    style={({ pressed }) => [styles.row, { opacity: disabled ? 0.45 : pressed ? 0.6 : 1 }]}>
    <AppIcon name="repeat" color={colors.primary} size={17} />
    <View style={[styles.text, fontScale > 1.3 && styles.stacked]}>
      <AppText variant="subheadline">{title}</AppText>
      <AppText muted numeric variant="footnote">{detail}</AppText>
    </View>
    <AppIcon name="chevronRight" color={colors.textMuted} size={15} />
  </Pressable>;
}
const styles = StyleSheet.create({
  row: { minHeight: sizes.touchTarget, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xs },
  text: { flex: 1, gap: 2 }, stacked: { gap: spacing.xs },
});
