import { Host, Picker, Text, DatePicker } from '@expo/ui/swift-ui';
import {
  accessibilityLabel,
  datePickerStyle,
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
/**
 * Inside the scrolling settings list a SwiftUI host would apply the bars' safe area and draw the wheel away from
 * its slot (it jumps while it opens): ignoreSafeArea. The row above names the value, so the wheel hides its label.
 * These rows sit flush (no block gap), so the wheel's own transparent room is the spacing around it.
 */
const wheelHost = { ignoreSafeArea: 'all' as const, matchContents: { vertical: true }, style: { width: '100%' as const } };
export function BirthPicker({ value, today, onChange }: BirthPickerProps) {
  const { colors, isDark } = useOwnlevelTheme();
  // Native pickers use the device zone, but birth dates are plain calendar dates.
  const date = value ? new Date(`${value}T12:00:00`) : undefined;
  return (
    <Host colorScheme={isDark ? 'dark' : 'light'} {...wheelHost}>
      <DatePicker
        title="Nacimiento"
        selection={date}
        range={{ end: new Date(`${today}T23:59:59`) }}
        displayedComponents={['date']}
        modifiers={[
          datePickerStyle('wheel'),
          labelsHidden(),
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
    <Host colorScheme={isDark ? 'dark' : 'light'} {...wheelHost}>
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
