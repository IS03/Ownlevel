import { HStack, Host, Picker, Text } from '@expo/ui/swift-ui';
import { frame, pickerStyle, tag } from '@expo/ui/swift-ui/modifiers';
import { useOwnlevelTheme } from '@/design-system';
import { MONTH_NAMES, monthKey } from './training-week-calendar.types';
import type { HistoryMonthWheelProps } from './history-month-wheel';
export const HAS_MONTH_WHEEL = true;
/** Native month/year wheels (same as Entrenar); a future month snaps back to the current one. */
export function HistoryMonthWheel({ month, maxMonth, years, height, onMonth }: HistoryMonthWheelProps) {
  const { isDark } = useOwnlevelTheme();
  const year = Number(month.slice(0, 4)), monthNumber = Number(month.slice(5, 7));
  const pick = (next: string) => onMonth(next > maxMonth ? maxMonth : next);
  return <Host colorScheme={isDark ? 'dark' : 'light'} style={{ width: '100%', height }}>
    <HStack spacing={0} modifiers={[frame({ height })]}>
      <Picker modifiers={[pickerStyle('wheel'), frame({ maxWidth: 10_000 })]} selection={monthNumber} onSelectionChange={(value: number) => pick(monthKey(year, value))}>
        {MONTH_NAMES.map((name, index) => <Text key={name} modifiers={[tag(index + 1)]}>{name}</Text>)}
      </Picker>
      <Picker modifiers={[pickerStyle('wheel'), frame({ maxWidth: 10_000 })]} selection={year} onSelectionChange={(value: number) => pick(monthKey(value, monthNumber))}>
        {years.map(value => <Text key={value} modifiers={[tag(value)]}>{String(value)}</Text>)}
      </Picker>
    </HStack>
  </Host>;
}
