import { DateTimePicker, Host } from "@expo/ui/jetpack-compose";
import { useOwnlevelTheme } from "@/design-system";
import type { StartDateProps } from "./start-date-picker";
export function StartDatePicker({ value, minimum, onChange }: StartDateProps) {
  const { colors } = useOwnlevelTheme();
  return (
    <Host matchContents>
      <DateTimePicker
        initialDate={`${value}T12:00:00Z`}
        displayedComponents="date"
        color={colors.primary}
        selectableDates={{ start: new Date(`${minimum}T00:00:00Z`) }}
        onDateSelected={(d) => onChange(d.toISOString().slice(0, 10))}
      />
    </Host>
  );
}
