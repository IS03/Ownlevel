import { StyleSheet, TextInput, View } from 'react-native';
import { AppText, useOwnlevelTheme } from '@/design-system';
import type { MetricInput } from './day-write-model';
export type MetricDurationProps = { value: MetricInput; disabled: boolean; onChange: (value: MetricInput) => void };
/** Numeric fallback outside iOS; canonical durations are always whole minutes. */
export function MetricDuration({ value, disabled, onChange }: MetricDurationProps) {
  const { colors } = useOwnlevelTheme();
  return <View style={styles.row}>{(['hours', 'minutes'] as const).map(field => <View key={field} style={styles.column}>
    <AppText muted variant="footnote">{field === 'hours' ? 'Horas' : 'Minutos'}</AppText>
    <TextInput accessibilityLabel={field === 'hours' ? 'Horas' : 'Minutos'} editable={!disabled} keyboardType="number-pad" value={value[field]}
      onChangeText={next => onChange({ ...value, [field]: next })} style={[styles.input, { color: colors.text, backgroundColor: colors.surfaceRaised }]} />
  </View>)}</View>;
}
const styles = StyleSheet.create({ row: { flexDirection: 'row', gap: 16 }, column: { flex: 1, gap: 8 }, input: { minHeight: 48, borderRadius: 12, textAlign: 'center', fontSize: 28, fontVariant: ['tabular-nums'] } });
