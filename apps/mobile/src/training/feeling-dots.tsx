import { StyleSheet, View } from 'react-native';
import { AppText, spacing, useOwnlevelTheme } from '@/design-system';
import type { RevisitFeeling } from './session-revisit-model';

/** One answered feeling as dots: energy and performance over 5, pain over 10. */
export function FeelingDots({ feeling }: { feeling: RevisitFeeling }) {
  const { colors } = useOwnlevelTheme();
  const size = feeling.scale === 10 ? 8 : 10;
  return <View style={styles.feeling} accessible accessibilityLabel={`${feeling.label}: ${feeling.value} de ${feeling.scale}`} testID={`revisit-feeling-${feeling.key}`}>
    <AppText muted variant="footnote">{feeling.label}</AppText>
    <View style={styles.dots}>{Array.from({ length: feeling.scale }, (_, index) => <View key={index}
      style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: index < feeling.value ? colors.text : colors.border }} />)}</View>
  </View>;
}
const styles = StyleSheet.create({ feeling: { gap: spacing.sm }, dots: { flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 12 } });
