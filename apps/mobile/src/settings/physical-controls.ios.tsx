import { Host, Picker, Text, DatePicker } from '@expo/ui/swift-ui';
import {
  accessibilityLabel,
  datePickerStyle,
  environment,
  font,
  foregroundStyle,
  frame,
  labelsHidden,
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
    // The row above already names the field: no second «Nacimiento» beside the wheel, which centers its columns.
    // Months in Spanish like the rest of the app (the device language may differ). Inside a scroll view the host ignores
    // the bars' safe area, so the wheel is drawn exactly in its slot.
    <Host colorScheme={isDark ? 'dark' : 'light'} ignoreSafeArea="all" style={{ width: '100%', height: 200 }}>
      <DatePicker
        title="Nacimiento"
        selection={date}
        range={{ end: new Date(`${today}T23:59:59`) }}
        displayedComponents={['date']}
        modifiers={[
          datePickerStyle('wheel'),
          labelsHidden(),
          environment('locale', 'es_AR'),
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
    // A fixed height like the birth wheel: sized from the first frame, no jump while SwiftUI measures it.
    <Host colorScheme={isDark ? 'dark' : 'light'} ignoreSafeArea="all" style={{ width: '100%', height: 200 }}>
      <Picker
        label="Altura"
        selection={value ? Number(value) : 0}
        onSelectionChange={(n: number) => onChange(n === 0 ? '' : String(n))}
        modifiers={[
          pickerStyle('wheel'),
          labelsHidden(),
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
