import { View } from "react-native";
import { AppText, Chip } from "@/design-system";
import { kindOptions } from "./stages-model";
import type { KindPickerProps } from './kind-picker.types';
export type { KindPickerProps } from './kind-picker.types';
export function KindPicker({
  value,
  disabled,
  onChange,
  suggested,
}: KindPickerProps) {
  return (
    <View
      accessibilityLabel="Tipo de plan"
      accessibilityRole="radiogroup"
      style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}
    >
      {kindOptions.map((k) => (
        <View key={k.value} style={{ gap: 4, alignItems: "center" }}>
          <Chip
            label={k.label}
            accessibilityLabel={`${k.label}${suggested === k.value ? " · sugerido" : ""}`}
            selected={value === k.value}
            disabled={disabled}
            onPress={() => onChange(k.value)}
          />
          {suggested === k.value ? (
            <AppText muted variant="caption">
              sugerido
            </AppText>
          ) : null}
        </View>
      ))}
    </View>
  );
}
