import { Host, HStack, Picker, Text } from '@expo/ui/swift-ui';
import { font, foregroundStyle, frame, monospacedDigit, pickerStyle, tag } from '@expo/ui/swift-ui/modifiers';
import { useOwnlevelTheme } from '@/design-system';
import type { MonthWheelProps } from './month-wheel';

const NAMES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const FIRST_YEAR = 2020;

/** The system month/year wheels. A month after today snaps back to today's month. */
export function MonthWheel({ month, today, onChange }: MonthWheelProps) {
  const { colors, isDark } = useOwnlevelTheme();
  const year = Number(month.slice(0, 4)), index = Number(month.slice(5, 7));
  const lastYear = Number(today.slice(0, 4)), lastMonth = Number(today.slice(5, 7));
  const years = Array.from({ length: lastYear - Math.min(FIRST_YEAR, year) + 1 }, (_, i) => Math.min(FIRST_YEAR, year) + i);
  const pick = (nextYear: number, nextMonth: number) => {
    const clamped = nextYear === lastYear && nextMonth > lastMonth ? lastMonth : nextMonth;
    onChange(`${nextYear}-${String(clamped).padStart(2, '0')}-01`);
  };
  const label = [font({ textStyle: 'title3' }), foregroundStyle(colors.text)];
  return <Host colorScheme={isDark ? 'dark' : 'light'} matchContents={{ vertical: true }} style={{ width: '100%' }} testID="nutrition-month-picker">
    <HStack spacing={0} modifiers={[frame({ maxWidth: Infinity })]}>
      <Picker label="Mes" selection={index} modifiers={[pickerStyle('wheel'), frame({ maxWidth: Infinity })]} onSelectionChange={(next: number) => { if (next !== index) pick(year, next); }}>
        {NAMES.map((name, i) => <Text key={name} modifiers={[tag(i + 1), ...label, ...(year === lastYear && i + 1 > lastMonth ? [foregroundStyle(colors.textMuted)] : [])]}>{name}</Text>)}
      </Picker>
      <Picker label="Año" selection={year} modifiers={[pickerStyle('wheel'), frame({ maxWidth: 140 })]} onSelectionChange={(next: number) => { if (next !== year) pick(next, index); }}>
        {years.map(y => <Text key={y} modifiers={[tag(y), ...label, monospacedDigit()]}>{String(y)}</Text>)}
      </Picker>
    </HStack>
  </Host>;
}
