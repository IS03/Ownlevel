import { DatePicker, Host } from "@expo/ui/swift-ui";
import {
  accessibilityLabel,
  datePickerStyle,
  labelsHidden,
  tint,
} from "@expo/ui/swift-ui/modifiers";
import { brandTokens, useOwnlevelTheme } from "@/design-system";
import type { StartDateProps } from "./start-date-picker";
export function StartDatePicker({ value, minimum, onChange }: StartDateProps) {
  const { colors, isDark } = useOwnlevelTheme();
  return (
    <Host
      colorScheme={isDark ? "dark" : "light"}
      ignoreSafeArea="all"
      // The wheel's own height; the row above already says "Inicio". The native wheel adds transparent room around
      // its rows (more below than above), on top of the screen's block gap: pull it in so the gaps look even.
      matchContents={{ vertical: true }}
      style={{ width: "100%", marginTop: -brandTokens.space.md, marginBottom: -brandTokens.space.xxxl }}
    >
      <DatePicker
        title="Inicio"
        selection={new Date(`${value}T12:00:00`)}
        range={{ start: new Date(`${minimum}T00:00:00`) }}
        displayedComponents={["date"]}
        modifiers={[
          datePickerStyle("wheel"),
          labelsHidden(),
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
