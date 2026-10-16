import { DateTimePicker, Host } from '@expo/ui/jetpack-compose';
import { TextField, useOwnlevelTheme } from '@/design-system';
import type { BirthPickerProps, HeightWheelProps } from './physical-controls';
export function BirthPicker({ value, today, onChange }: BirthPickerProps) {
  const { colors } = useOwnlevelTheme();
  return (
    <Host matchContents>
      <DateTimePicker
        initialDate={value ? `${value}T12:00:00Z` : undefined}
        displayedComponents="date"
        color={colors.primary}
        selectableDates={{ end: new Date(`${today}T23:59:59Z`) }}
        onDateSelected={(date) => onChange(date.toISOString().slice(0, 10))}
      />
    </Host>
  );
}
export function HeightWheel({ value, onChange }: HeightWheelProps) {
  return (
    <TextField
      label="Altura (cm)"
      numeric
      keyboardType="number-pad"
      value={value}
      onChangeText={onChange}
    />
  );
}
