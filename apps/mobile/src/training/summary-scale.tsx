import { Pressable, StyleSheet, View } from 'react-native';
import { AppText, sizes, spacing, radius, useOwnlevelTheme } from '@/design-system';
import { SUMMARY_SCALES } from './active-session-model';
type ScaleKey = 'energyLevel' | 'performanceLevel';
const SCALE_LABELS: Record<ScaleKey, string> = { energyLevel: 'Energía', performanceLevel: 'Rendimiento' };

/** Tapping the selected value clears it: unanswered stays null, never 0. */
export function SummaryScale({ field, value, disabled, onChange }: {
  field: ScaleKey; value: number | null; disabled: boolean; onChange: (next: number | null) => void;
}) {
  const { colors } = useOwnlevelTheme();
  const [minimum, maximum] = SUMMARY_SCALES[field];
  const label = SCALE_LABELS[field];
  const options = Array.from({ length: maximum - minimum + 1 }, (_, index) => minimum + index);
  return <View style={styles.scale} accessibilityRole="radiogroup" accessibilityLabel={`${label}, de ${minimum} a ${maximum}`}>
    <View style={styles.scaleHeader}>
      <AppText variant="label">{label}</AppText>
      <AppText muted variant="caption">{value === null ? 'Sin responder' : `${value}/${maximum}`}</AppText>
    </View>
    <View style={styles.options}>
      {options.map(option => {
        const selected = value === option;
        return <Pressable key={option} testID={`summary-${field}-${option}`} accessibilityRole="radio" disabled={disabled}
          accessibilityLabel={`${label} ${option} de ${maximum}`} accessibilityState={{ selected, disabled }}
          onPress={() => onChange(selected ? null : option)}
          style={[styles.option, {
            borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? colors.primary : colors.surface, opacity: disabled ? 0.5 : 1,
          }]}>
          <AppText style={{ color: selected ? colors.onPrimary : colors.text }} variant="label">{option}</AppText>
        </Pressable>;
      })}
    </View>
  </View>;
}


const styles = StyleSheet.create({scale: {gap:spacing.sm}, scaleHeader:{flexDirection:'row',justifyContent:'space-between',alignItems:'baseline'},options:{flexDirection:'row',gap:spacing.xs},option:{flex:1,minHeight:sizes.touchTarget,borderWidth:1,borderRadius:radius.md,alignItems:'center',justifyContent:'center'}});
