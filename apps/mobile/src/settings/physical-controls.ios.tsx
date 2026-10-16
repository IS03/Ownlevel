import { Host, Picker, Text, DatePicker } from '@expo/ui/swift-ui';
import {
  accessibilityLabel,
  datePickerStyle,
  font,
  foregroundStyle,
  frame,
  monospacedDigit,
  pickerStyle,
  tag,
  tint,
} from '@expo/ui/swift-ui/modifiers';
import { useOwnlevelTheme } from '@/design-system';
import type { BirthPickerProps, HeightWheelProps } from './physical-controls';
export function BirthPicker({ value, today, onChange }: BirthPickerProps) {
  const { colors, isDark } = useOwnlevelTheme();
  // Native pickers use the device zone, but birth dates are plain calendar dates.
  const date = value ? new Date(`${value}T12:00:00`) : undefined;
  return (
    <Host colorScheme={isDark ? 'dark' : 'light'} style={{ width: '100%', height: 200 }}>
      <DatePicker
        title="Nacimiento"
        selection={date}
        range={{ end: new Date(`${today}T23:59:59`) }}
        displayedComponents={['date']}
        modifiers={[
          datePickerStyle('wheel'),
          tint(colors.primary),
          accessibilityLabel('Nacimiento'),
        ]}
        onDateChange={(d) =>
          onChange(
            `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
          )
        }
      />
    </Host>
  );
}
export function HeightWheel({ value, onChange }: HeightWheelProps) {
  const { colors, isDark } = useOwnlevelTheme();
  return (
    <Host
      colorScheme={isDark ? 'dark' : 'light'}
      matchContents={{ vertical: true }}
      style={{ width: '100%' }}
    >
      <Picker
        label="Altura"
        selection={value ? Number(value) : 0}
        onSelectionChange={(n: number) => onChange(n === 0 ? '' : String(n))}
        modifiers={[
          pickerStyle('wheel'),
          frame({ maxWidth: Infinity }),
          accessibilityLabel('Altura'),
        ]}
      >
        <Text modifiers={[tag(0)]}>Sin dato</Text>
        {Array.from({ length: 201 }, (_, i) => i + 50).map((n) => (
          <Text
            key={n}
            modifiers={[
              tag(n),
              font({ textStyle: 'title3' }),
              foregroundStyle(colors.text),
              monospacedDigit(),
            ]}
          >{`${n} cm`}</Text>
        ))}
      </Picker>
    </Host>
  );
}
