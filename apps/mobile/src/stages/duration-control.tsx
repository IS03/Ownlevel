import { View } from "react-native";
import { AppText } from "@/design-system";
import { NutritionGlassButton } from "@/nutrition/day-controls";
import { CountingNumber } from "@/settings/editorial";
import { SettingsSegmented } from "@/settings/native-segmented";
import type { StageDuration } from "@/api/nutrition-stages";
export function DurationControl({
  duration,
  onChange,
  disabled = false,
}: {
  duration: StageDuration;
  onChange: (value: StageDuration) => void;
  disabled?: boolean;
}) {
  const maximum = duration.unit === "weeks" ? 104 : 24;
  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: "row", gap: 16, alignItems: "center" }}>
        <NutritionGlassButton
          icon="minus"
          label="Acortar etapa"
          onPress={
            disabled || duration.value <= 1
              ? undefined
              : () => onChange({ ...duration, value: duration.value - 1 })
          }
        />
        <CountingNumber value={duration.value} />
        <AppText muted>
          {duration.unit === "weeks"
            ? duration.value === 1
              ? "semana"
              : "semanas"
            : duration.value === 1
              ? "mes"
              : "meses"}
        </AppText>
        <NutritionGlassButton
          icon="plus"
          label="Alargar etapa"
          onPress={
            disabled || duration.value >= maximum
              ? undefined
              : () => onChange({ ...duration, value: duration.value + 1 })
          }
        />
      </View>
      <SettingsSegmented
        accessibilityLabel="Duración en"
        value={duration.unit}
        disabled={disabled}
        options={[
          { value: "weeks", label: "Semanas" },
          { value: "months", label: "Meses" },
        ]}
        onChange={(unit) =>
          onChange({
            unit,
            value: Math.min(duration.value, unit === "weeks" ? 104 : 24),
          })
        }
      />
    </View>
  );
}
