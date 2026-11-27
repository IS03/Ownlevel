import { useState } from 'react';
import { Keyboard, Pressable, StyleSheet, View } from 'react-native';
import { DatePicker, Host } from '@expo/ui/swift-ui';
import { accessibilityLabel, datePickerStyle, environment, labelsHidden, tint } from '@expo/ui/swift-ui/modifiers';

import { AppIcon, AppSheet, AppText, GlassSurface, radius, sizes, spacing, useOwnlevelTheme } from '@/design-system';
import { inputNutritionDate, parseInputNutritionDate } from '@/nutrition/day-format';

import { formatBodyDate } from './body-model';
import type { BodyDateFieldProps } from './body-date-field.types';

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * The native compact date picker (up to today), writing back the same DD/MM/AAAA text the controller validates.
 * Spanish months whatever the device language ("28 oct 2026", not "28 Oct 2026"), like Nacimiento in Ajustes.
 */
export function BodyDateField({ value, today, editable, onChange, error, compactLabel = false }: BodyDateFieldProps) {
  const { colors, isDark } = useOwnlevelTheme();
  const date = parseInputNutritionDate(value) ?? today;
  const [open, setOpen] = useState(false);
  const full = formatBodyDate(date);
  const label = date === today ? 'Hoy' : date.slice(0, 4) === today.slice(0, 4) ? full.replace(/ \d{4}$/, '') : full;
  const picker = (graphical: boolean) => <Host colorScheme={isDark ? 'dark' : 'light'} matchContents testID="body-date-picker">
    <DatePicker selection={new Date(`${date}T12:00:00`)} range={{ end: new Date(`${today}T12:00:00`) }} displayedComponents={['date']}
      modifiers={[datePickerStyle(graphical ? 'graphical' : 'compact'), labelsHidden(), environment('locale', 'es_AR'), tint(colors.primary), accessibilityLabel('Fecha')]}
      onDateChange={d => { onChange(inputNutritionDate(iso(d))); if (graphical) setOpen(false); }} />
  </Host>;
  return <View style={styles.wrap}>
    <View style={styles.row}>
      <AppText variant="body" style={styles.grow}>Fecha</AppText>
      {editable ? compactLabel ? <Pressable accessibilityLabel={`Fecha: ${label}`} accessibilityRole="button"
        onPress={() => { Keyboard.dismiss(); setOpen(true); }}>
        <GlassSurface interactive style={styles.control}><AppText numeric>{label}</AppText><AppIcon name="chevronDown" color={colors.textMuted} size={17} /></GlassSurface>
      </Pressable> : picker(false)
      : <AppText muted numeric variant="body" accessibilityLabel={`Fecha: ${compactLabel ? label : full}`}>{compactLabel ? label : full}</AppText>}
    </View>
    {open && compactLabel && editable ? <AppSheet onClose={() => setOpen(false)} closeLabel="Cerrar fecha" style={{ backgroundColor: colors.background }}>
      <View style={styles.picker}>{picker(true)}</View>
    </AppSheet> : null}
    {error ? <AppText accessibilityRole="alert" style={{ color: colors.danger }} variant="footnote">{error}</AppText> : null}
  </View>;
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 44, gap: spacing.md },
  grow: { flex: 1 },
  control: { flexDirection: 'row', alignItems: 'center', minHeight: sizes.touchTarget, borderRadius: radius.chip, paddingHorizontal: spacing.md, gap: spacing.sm },
  picker: { alignItems: 'stretch', padding: spacing.lg },
});
