import { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import Animated, {
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import {
  AppSheet,
  AppText,
  Button,
  Chip,
  Heading,
  TextField,
  useAppSheetDismiss,
  useOwnlevelTheme,
  useReduceMotion,
  pressedStyle,
} from "@/design-system";
import { useTweenedNumber } from "@/nutrition/use-tweened-number";
import {
  applyDays,
  dayNames,
  dayLetters,
  draftNumber,
  type DayDraft,
  type StageDraft,
} from "./stages-model";
import { formatNumber } from "@/settings/editorial";
export function PlanNumber({
  value,
  suggested = false,
  large = false,
  unit = "",
}: {
  value: number | null;
  suggested?: boolean;
  large?: boolean;
  unit?: string;
}) {
  const shown = useTweenedNumber(value, 300);
  const { colors } = useOwnlevelTheme();
  return (
    <AppText
      numeric
      variant={large ? "title1" : "footnote"}
      muted={suggested}
      style={suggested ? undefined : { color: colors.primary }}
    >
      {shown === null ? "—" : `${formatNumber(shown)}${unit}`}
    </AppText>
  );
}
function DayColumn({
  day,
  maximum,
  today,
  suggested,
  onPress,
  disabled,
}: {
  day: DayDraft;
  maximum: number;
  today: boolean;
  suggested: boolean;
  onPress: () => void;
  disabled: boolean;
}) {
  const { colors } = useOwnlevelTheme();
  const reduced = useReduceMotion();
  const value = draftNumber(day.kcal);
  const target = value === null ? 0 : (value / maximum) * 100;
  const height = useSharedValue(target);
  useEffect(() => {
    height.set(reduced ? target : withTiming(target, { duration: 300 }));
  }, [height, target, reduced]);
  const bar = useAnimatedStyle(() => ({ height: height.value }));
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${dayNames[day.weekday - 1]}: ${value === null ? "calorías sin dato" : `${formatNumber(value)} kcal`}, ${draftNumber(day.protein) === null ? "proteína sin dato" : `${day.protein} g de proteína`}${today ? ", hoy" : ""}`}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        { flex: 1, minWidth: 44, alignItems: "center", gap: 8 },
        pressedStyle(pressed, reduced),
      ]}
    >
      <PlanNumber value={value} suggested={suggested} />
      <View style={{ height: 100, width: "100%", justifyContent: "flex-end" }}>
        {value !== null ? (
          <Animated.View
            testID={`stage-day-bar-${day.weekday}`}
            style={[
              {
                backgroundColor:
                  today && !suggested ? colors.primary : colors.border,
                borderTopLeftRadius: 10,
                borderTopRightRadius: 10,
              },
              bar,
            ]}
          />
        ) : null}
      </View>
      <AppText
        variant="caption"
        style={today ? { color: colors.primary } : undefined}
      >
        {dayLetters[day.weekday - 1]}
        {today ? " ·" : ""}
      </AppText>
      <PlanNumber value={draftNumber(day.protein)} suggested unit=" g" />
    </Pressable>
  );
}
export function PlanWeek({
  stage,
  today,
  same,
  onChange,
  disabled,
}: {
  stage: StageDraft;
  today: number;
  same: boolean;
  onChange: (stage: StageDraft) => void;
  disabled: boolean;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const maximum = Math.max(
    1,
    ...stage.weekdays.map((d) => draftNumber(d.kcal) ?? 0),
  );
  return (
    <View style={{ gap: 12 }}>
      {same ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Ajustar todos los días"
          disabled={disabled}
          onPress={() => setSelected(1)}
          style={{
            minHeight: 100,
            gap: 12,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <PlanNumber
            large
            value={draftNumber(stage.weekdays[0].kcal)}
            suggested={stage.suggested}
          />
          <AppText muted numeric>
            {draftNumber(stage.weekdays[0].protein) === null
              ? "Proteína sin dato"
              : `${stage.weekdays[0].protein} g de proteína`}{" "}
            · Todos los días
          </AppText>
        </Pressable>
      ) : (
        <ScrollView
          horizontal
          contentContainerStyle={{ flexGrow: 1, gap: 4 }}
          showsHorizontalScrollIndicator={false}
        >
          {stage.weekdays.map((day) => (
            <DayColumn
              key={day.weekday}
              day={day}
              maximum={maximum}
              today={day.weekday === today}
              suggested={stage.suggested}
              disabled={disabled}
              onPress={() => setSelected(day.weekday)}
            />
          ))}
        </ScrollView>
      )}
      <AppText muted variant="footnote">
        kcal arriba · proteína abajo{stage.suggested ? " · sugerido" : ""}
      </AppText>
      {selected !== null ? (
        <PlanDaySheet
          stage={stage}
          day={selected}
          same={same}
          onClose={() => setSelected(null)}
          onApply={(days, kcal, protein) => {
            onChange(applyDays(stage, days, kcal, protein));
            setSelected(null);
          }}
        />
      ) : null}
    </View>
  );
}
export function applySentence(days: number[], kcal: string, protein: string) {
  const names = [...days]
    .sort((a, b) => a - b)
    .map((d, i) =>
      i === 0 ? dayNames[d - 1] : dayNames[d - 1].toLocaleLowerCase("es-AR"),
    );
  const subject =
    names.length < 2
      ? (names[0] ?? "")
      : `${names.slice(0, -1).join(", ")} y ${names.at(-1)}`;
  return `${subject} ${days.length > 1 ? "quedan" : "queda"} en ${draftNumber(kcal) === null ? "—" : formatNumber(draftNumber(kcal)!)} kcal · ${draftNumber(protein) === null ? "—" : formatNumber(draftNumber(protein)!)} g.`;
}
function PlanDaySheet({
  stage,
  day,
  same,
  onClose,
  onApply,
}: {
  stage: StageDraft;
  day: number;
  same: boolean;
  onClose: () => void;
  onApply: (days: number[], kcal: string, protein: string) => void;
}) {
  const { colors } = useOwnlevelTheme();
  return (
    <AppSheet
      onClose={onClose}
      closeLabel="Cerrar ajuste del día"
      style={{ backgroundColor: colors.background }}
      testID="stage-day-sheet"
    >
      <DaySheetBody stage={stage} day={day} same={same} onApply={onApply} />
    </AppSheet>
  );
}
function DaySheetBody({
  stage,
  day,
  same,
  onApply,
}: {
  stage: StageDraft;
  day: number;
  same: boolean;
  onApply: (days: number[], kcal: string, protein: string) => void;
}) {
  const dismiss = useAppSheetDismiss();
  const original = stage.weekdays.find((d) => d.weekday === day)!;
  const [kcal, setKcal] = useState(original.kcal),
    [protein, setProtein] = useState(original.protein),
    [days, setDays] = useState(same ? [1, 2, 3, 4, 5, 6, 7] : [day]);
  const calories = draftNumber(kcal),
    grams = draftNumber(protein);
  const valid =
    calories !== null &&
    Number.isInteger(calories) &&
    calories >= 1 &&
    calories <= 20000 &&
    grams !== null &&
    grams >= 0 &&
    grams <= 2000;
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.sheet}
      >
        <View style={styles.header}>
          <Button label="Cancelar" variant="quiet" onPress={() => dismiss()} />
          <Heading level={2}>
            {same ? "Todos los días" : dayNames[day - 1]}
          </Heading>
          <Button
            label="Listo"
            icon="checkmark"
            disabled={!valid || !days.length}
            onPress={() => dismiss(() => onApply(days, kcal, protein))}
          />
        </View>
        <View style={{ flexDirection: "row", gap: 12 }}>
          <View style={{ flex: 1 }}>
            <TextField
              label="Calorías (kcal)"
              numeric
              keyboardType="number-pad"
              value={kcal}
              onChangeText={setKcal}
              autoFocus
              inputStyle={{ fontSize: 28, fontWeight: "700" }}
            />
          </View>
          <View style={{ flex: 1 }}>
            <TextField
              label="Proteína (g)"
              numeric
              keyboardType="decimal-pad"
              value={protein}
              onChangeText={setProtein}
              inputStyle={{ fontSize: 28, fontWeight: "700" }}
            />
          </View>
        </View>
        {!same ? (
          <>
            <AppText muted variant="caption">
              APLICAR TAMBIÉN A
            </AppText>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {dayNames.map((name, i) => (
                <Chip
                  key={name}
                  kind="toggle"
                  label={dayLetters[i]}
                  accessibilityLabel={`Aplicar a ${name.toLocaleLowerCase("es-AR")}`}
                  selected={days.includes(i + 1)}
                  onPress={() =>
                    setDays((old) =>
                      i + 1 === day
                        ? old
                        : old.includes(i + 1)
                          ? old.filter((d) => d !== i + 1)
                          : [...old, i + 1],
                    )
                  }
                />
              ))}
            </View>
          </>
        ) : null}
        <Animated.View entering={FadeIn.duration(200)}>
          <AppText muted accessibilityLiveRegion="polite">
            {applySentence(days, kcal, protein)}
          </AppText>
        </Animated.View>
        <AppText muted variant="footnote">
          Volvés al plan con estos valores. Se guardan juntos al tocar Guardar.
        </AppText>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
const styles = StyleSheet.create({
  sheet: { padding: 16, paddingBottom: 40, gap: 24 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
});
