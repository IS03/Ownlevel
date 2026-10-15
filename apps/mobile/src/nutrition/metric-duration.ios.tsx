import { Host, HStack, Picker, Text } from '@expo/ui/swift-ui';
import { disabled as disable, font, foregroundStyle, frame, monospacedDigit, pickerStyle, tag } from '@expo/ui/swift-ui/modifiers';
import { useOwnlevelTheme } from '@/design-system';
import { triggerHaptic } from '@/platform/haptics';
import type { MetricDurationProps } from './metric-duration';

export function durationHours(current: string) {
  const saved = Number(current);
  // Keep every existing duration exact, even when it exceeds the ordinary wheel range.
  return [...new Set([...Array.from({ length: 169 }, (_, i) => i), ...(Number.isSafeInteger(saved) && saved > 168 ? [saved] : [])])].sort((a, b) => a - b);
}
export function MetricDuration({ value, disabled, onChange }: MetricDurationProps) {
  const { colors, isDark } = useOwnlevelTheme();
  return <Host colorScheme={isDark ? 'dark' : 'light'} matchContents={{ vertical: true }} style={{ width: '100%' }}>
    <HStack spacing={8} modifiers={[frame({ maxWidth: Infinity }), disable(disabled)]}>
      {(['hours', 'minutes'] as const).map(field => <Picker key={field} label={field === 'hours' ? 'Horas' : 'Minutos'} selection={Number(value[field])}
        modifiers={[pickerStyle('wheel'), frame({ maxWidth: Infinity })]} onSelectionChange={(next: number) => {
          if (next === Number(value[field])) return;
          onChange({ ...value, [field]: String(next) }); triggerHaptic('stepperChange');
        }}>
        {(field === 'hours' ? durationHours(value.hours) : Array.from({ length: 60 }, (_, i) => i)).map(n => <Text key={n}
          modifiers={[tag(n), font({ textStyle: 'title2' }), foregroundStyle(colors.text), monospacedDigit()]}>{`${n} ${field === 'hours' ? 'h' : 'min'}`}</Text>)}
      </Picker>)}
    </HStack>
  </Host>;
}
