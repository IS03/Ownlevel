import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { AppIcon, AppText, useOwnlevelTheme } from '@/design-system';

export type MonthWheelProps = {
  month: string; today: string;
  /** iOS wheels report every change while turning. */
  onChange: (month: string) => void;
  /** The grid picks a month and is done. */
  onDone?: (month: string) => void;
};
const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const longName = (month: string) => new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric', timeZone: 'UTC' })
  .format(new Date(`${month}T12:00:00Z`)).replace(/^./u, c => c.toLocaleUpperCase('es-AR'));

/** Outside iOS: a year with arrows and its twelve months; months after today are not offered. */
export function MonthWheel({ month, today, onChange, onDone }: MonthWheelProps) {
  const { colors } = useOwnlevelTheme();
  const [year, setYear] = useState(Number(month.slice(0, 4)));
  const lastYear = Number(today.slice(0, 4));
  return <View style={styles.picker} testID="nutrition-month-picker">
    <View style={styles.header}>
      <Pressable accessibilityLabel="Año anterior" accessibilityRole="button" onPress={() => setYear(y => y - 1)} style={styles.arrow}><AppIcon name="chevronLeft" size={20} color={colors.primary} /></Pressable>
      <AppText numeric variant="headline">{year}</AppText>
      <Pressable accessibilityLabel="Año siguiente" accessibilityRole="button" accessibilityState={{ disabled: year >= lastYear }} disabled={year >= lastYear} onPress={() => setYear(y => y + 1)}
        style={[styles.arrow, year >= lastYear && { opacity: 0.3 }]}><AppIcon name="chevronRight" size={20} color={colors.primary} /></Pressable>
    </View>
    <View style={styles.months}>{MONTHS.map((label, i) => {
      const value = `${year}-${String(i + 1).padStart(2, '0')}-01`, future = value > today, current = value === month;
      return <Pressable key={label} accessibilityRole="button" accessibilityLabel={longName(value)} accessibilityState={{ disabled: future, selected: current }} disabled={future}
        onPress={() => (onDone ?? onChange)(value)} style={[styles.cell, { backgroundColor: current ? colors.brandSubtle : colors.surface }, future && { opacity: 0.35 }]} testID={`nutrition-pick-${value.slice(0, 7)}`}>
        <AppText variant="subheadline" style={current && { color: colors.primary, fontWeight: '600' }}>{label}</AppText>
      </Pressable>;
    })}</View>
  </View>;
}
const styles = StyleSheet.create({
  picker: { gap: 12 }, header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  arrow: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  months: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  cell: { width: '31.5%', minHeight: 52, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});
