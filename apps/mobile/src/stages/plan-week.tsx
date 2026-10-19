import { useEffect, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import {
  AppSheet,
  AppText,
  Chip,
  Heading,
  TextField,
  useAppSheetDismiss,
  useOwnlevelTheme,
  useReduceMotion,
  pressedStyle,
  brandTokens,
} from "@/design-system";
import { useTweenedNumber } from "@/nutrition/use-tweened-number";
import { NutritionGlassButton } from "@/nutrition/day-controls";
import {
  applyDays,
  dayNames,
  dayLetters,
  draftNumber,
  type DayDraft,
  type StageDraft,
} from "./stages-model";
import { EditorialSpread, formatNumber, useEditorialLayout } from "@/settings/editorial";
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
  const { largeText } = useEditorialLayout();
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
        { flex: 1, minWidth: largeText ? 128 : 44, alignItems: "center", gap: 8 },
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
  onSheetVisibilityChange,
  notice = null,
}: {
  stage: StageDraft;
  today: number;
  same: boolean;
  onChange: (stage: StageDraft) => void;
  disabled: boolean;
  onSheetVisibilityChange?: (visible: boolean) => void;
  /** "Tomamos el valor más repetido…": lives in the summary, so its space is reserved with it. */
  notice?: string | null;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const [summaryHeight, setSummaryHeight] = useState(0);
  const openDay = (day: number) => { onSheetVisibilityChange?.(true); setSelected(day); };
  const closeDay = () => { setSelected(null); onSheetVisibilityChange?.(false); };
  const maximum = Math.max(
    1,
    ...stage.weekdays.map((d) => draftNumber(d.kcal) ?? 0),
  );
  // Week and summary share one reserved height and cross-fade (200 ms, a fade also with Reduce Motion), so Agua,
  // extras and Guardar never move. The week stays mounted: switching never restarts its bars. Only the visible layer
  // takes touches and is read by VoiceOver.
  const shown = useSharedValue(same ? 1 : 0);
  useEffect(() => { shown.set(withTiming(same ? 1 : 0, { duration: brandTokens.motion.duration.fast })); }, [same, shown]);
  const weekLayer = useAnimatedStyle(() => ({ opacity: 1 - shown.get() }));
  const summaryLayer = useAnimatedStyle(() => ({ opacity: shown.get() }));
  return (
    <View style={{ minHeight: summaryHeight }} testID="stage-week-area">
      <Animated.View
        style={[{ gap: 12 }, weekLayer]}
        pointerEvents={same ? "none" : "auto"}
        accessibilityElementsHidden={same}
        importantForAccessibility={same ? "no-hide-descendants" : "auto"}
        testID="stage-week"
      >
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
              disabled={disabled || same}
              onPress={() => openDay(day.weekday)}
            />
          ))}
        </ScrollView>
        <AppText muted variant="footnote">
          kcal arriba · proteína abajo{stage.suggested ? " · sugerido" : ""}
        </AppText>
      </Animated.View>
      <Animated.View
        style={[StyleSheet.absoluteFill, { bottom: undefined }, summaryLayer]}
        pointerEvents={same ? "box-none" : "none"}
        accessibilityElementsHidden={!same}
        importantForAccessibility={same ? "auto" : "no-hide-descendants"}
        onLayout={(event) => setSummaryHeight(Math.ceil(event.nativeEvent.layout.height))}
        testID="stage-week-summary"
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Ajustar todos los días"
          disabled={disabled || !same}
          onPress={() => openDay(1)}
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
          <AppText muted numeric style={{ textAlign: "center" }}>
            {draftNumber(stage.weekdays[0].protein) === null
              ? "Proteína sin dato"
              : `${stage.weekdays[0].protein} g de proteína`}{" "}
            · Todos los días
          </AppText>
        </Pressable>
        {notice ? (
          <AppText muted variant="footnote" accessibilityLiveRegion="polite" style={{ marginTop: 12, textAlign: "center" }}>
            {notice}
          </AppText>
        ) : null}
      </Animated.View>
      {selected !== null ? (
        <PlanDaySheet
          stage={stage}
          day={selected}
          same={same}
          onClose={closeDay}
          onApply={(days, kcal, protein) => {
            onChange(applyDays(stage, days, kcal, protein));
            closeDay();
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
  const insets = useSafeAreaInsets();
  const nativeKeyboard = Platform.OS === 'ios';
  return (
    <AppSheet
      onClose={onClose}
      dismissKeyboardOnClose
      nativeKeyboard={nativeKeyboard}
      keyboardViewport={nativeKeyboard}
      keyboardTopInset={insets.top + brandTokens.space.md}
      closeLabel="Cerrar ajuste del día"
      style={{ backgroundColor: colors.background, maxHeight: nativeKeyboard ? '100%' : '92%', flexShrink: 1 }}
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
  const { largeText, largeInputStyle } = useEditorialLayout();
  const insets = useSafeAreaInsets();
  const scroll = useRef<ScrollView>(null);
  const focused = useRef<'kcal' | 'protein'>('kcal');
  const positions = useRef({ pair: 0, kcal: 0, protein: 0 });
  const revealFocused = () => scroll.current?.scrollTo({
    y: Math.max(0, positions.current.pair + positions.current[focused.current] - brandTokens.space.md),
    animated: false,
  });
  const focus = (field: 'kcal' | 'protein') => { focused.current = field; revealFocused(); };
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
      enabled={Platform.OS === 'android'}
      behavior="height"
      style={{ flexShrink: 1 }}
    >
      <View style={styles.header} testID="stage-day-header">
          <NutritionGlassButton label="Cancelar" icon="close" onPress={() => dismiss()} />
          <Heading level={2} style={{ flex: 1 }}>
            {same ? "Todos los días" : dayNames[day - 1]}
          </Heading>
          <NutritionGlassButton
            label="Listo"
            icon="checkmark"
            onPress={valid && days.length ? () => dismiss(() => onApply(days, kcal, protein)) : undefined}
          />
      </View>
      <ScrollView
        ref={scroll}
        testID="stage-day-scroll"
        onLayout={revealFocused}
        automaticallyAdjustKeyboardInsets={false}
        keyboardShouldPersistTaps="always"
        style={{ flexShrink: 1 }}
        contentContainerStyle={[styles.sheet, { paddingBottom: Math.max(insets.bottom, brandTokens.space.md) }]}
      >
        <View testID="stage-day-fields" onLayout={event => { positions.current.pair = event.nativeEvent.layout.y; }}>
        <EditorialSpread style={{ alignItems: 'stretch' }}>
          <View testID="stage-day-kcal-container" style={largeText ? { width: '100%' } : { flex: 1 }}
            onLayout={event => { positions.current.kcal = event.nativeEvent.layout.y; }}>
            <TextField
              label="Calorías (kcal)"
              numeric
              keyboardType="number-pad"
              value={kcal}
              onChangeText={setKcal}
              autoFocus={Platform.OS !== 'ios'}
              onFocus={() => focus('kcal')}
              inputStyle={largeInputStyle}
            />
          </View>
          <View testID="stage-day-protein-container" style={largeText ? { width: '100%' } : { flex: 1 }}
            onLayout={event => { positions.current.protein = event.nativeEvent.layout.y; }}>
            <TextField
              label="Proteína (g)"
              numeric
              keyboardType="decimal-pad"
              value={protein}
              onChangeText={setProtein}
              onFocus={() => focus('protein')}
              inputStyle={largeInputStyle}
            />
          </View>
        </EditorialSpread>
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
  header: { padding: brandTokens.space.md, flexDirection: 'row', alignItems: 'center', gap: brandTokens.space.sm },
  sheet: { padding: brandTokens.space.md, gap: brandTokens.space.xl },
});
