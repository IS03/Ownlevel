import { Host, Picker, Text } from "@expo/ui/swift-ui";
import {
  accessibilityLabel,
  disabled as nativeDisabled,
  foregroundStyle,
  pickerStyle,
  tag,
  tint,
} from "@expo/ui/swift-ui/modifiers";
import { useOwnlevelTheme } from "@/design-system";
import { kindOptions } from "./stages-model";
import type { KindPickerProps } from "./kind-picker";
export function KindPicker({
  value,
  disabled = false,
  onChange,
  suggested,
}: KindPickerProps) {
  const { colors, isDark } = useOwnlevelTheme();
  return (
    <Host
      colorScheme={isDark ? "dark" : "light"}
      matchContents={{ vertical: true }}
      style={{ minHeight: 44 }}
    >
      <Picker
        selection={value ?? ""}
        label="Tipo"
        modifiers={[
          pickerStyle("menu"),
          accessibilityLabel("Tipo de plan"),
          nativeDisabled(disabled),
          tint(colors.primary),
        ]}
        onSelectionChange={(next) => {
          const found = kindOptions.find((k) => k.value === next);
          if (!disabled && found) onChange(found.value);
        }}
      >
        <Text modifiers={[tag(""), foregroundStyle(colors.textMuted)]}>
          Elegí un tipo
        </Text>
        {kindOptions.map((k) => (
          <Text
            key={k.value}
            modifiers={[
              tag(k.value),
              foregroundStyle(
                suggested === k.value && value !== k.value
                  ? colors.textMuted
                  : colors.text,
              ),
            ]}
          >{`${k.label}${suggested === k.value ? " · sugerido" : ""}`}</Text>
        ))}
      </Picker>
    </Host>
  );
}
