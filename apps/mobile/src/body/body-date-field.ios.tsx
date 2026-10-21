import { StyleSheet, View } from 'react-native';
import { DatePicker, Host } from '@expo/ui/swift-ui';
import { accessibilityLabel, datePickerStyle, labelsHidden, tint } from '@expo/ui/swift-ui/modifiers';

import { AppText, spacing, useOwnlevelTheme } from '@/design-system';
import { inputNutritionDate, parseInputNutritionDate } from '@/nutrition/day-format';

import { formatBodyDate } from './body-model';
import type { BodyDateFieldProps } from './body-date-field.types';

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** The native compact date picker (up to today), writing back the same DD/MM/AAAA text the controller validates. */
export function BodyDateField({ value, today, editable, onChange, error }: BodyDateFieldProps) {
  const { colors, isDark } = useOwnlevelTheme();
  const date = parseInputNutritionDate(value) ?? today;
  return <View style={styles.wrap}>
    <View style={styles.row}>
      <AppText variant="body" style={styles.grow}>Fecha</AppText>
      {editable ? <Host colorScheme={isDark ? 'dark' : 'light'} matchContents testID="body-date-picker">
        <DatePicker selection={new Date(`${date}T12:00:00`)} range={{ end: new Date(`${today}T12:00:00`) }} displayedComponents={['date']}
          modifiers={[datePickerStyle('compact'), labelsHidden(), tint(colors.primary), accessibilityLabel('Fecha')]}
          onDateChange={d => onChange(inputNutritionDate(iso(d)))} />
      </Host> : <AppText muted numeric variant="body" accessibilityLabel={`Fecha: ${formatBodyDate(date)}`}>{formatBodyDate(date)}</AppText>}
    </View>
    {error ? <AppText accessibilityRole="alert" style={{ color: colors.danger }} variant="footnote">{error}</AppText> : null}
  </View>;
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 44, gap: spacing.md },
  grow: { flex: 1 },
});
