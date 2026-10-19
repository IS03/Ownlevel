import { DatePicker, Host } from "@expo/ui/swift-ui";
import {
  accessibilityLabel,
  datePickerStyle,
  tint,
} from "@expo/ui/swift-ui/modifiers";
import { useOwnlevelTheme } from "@/design-system";
import type { StartDateProps } from "./start-date-picker";
export function StartDatePicker({ value, minimum, onChange }: StartDateProps) {
  const { colors, isDark } = useOwnlevelTheme();
  return (
    <Host
      colorScheme={isDark ? "dark" : "light"}
      ignoreSafeArea="all"
      style={{ width: "100%", height: 200 }}
    >
      <DatePicker
        title="Inicio"
        selection={new Date(`${value}T12:00:00`)}
        range={{ start: new Date(`${minimum}T00:00:00`) }}
        displayedComponents={["date"]}
        modifiers={[
          datePickerStyle("wheel"),
          tint(colors.primary),
          accessibilityLabel("Fecha de inicio"),
        ]}
        onDateChange={(d) =>
          onChange(
            `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
          )
        }
      />
    </Host>
  );
}
