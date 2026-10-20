import { useEffect, useState, type PropsWithChildren } from "react";
import { Alert, Platform, Pressable, StyleSheet, View, useWindowDimensions, type StyleProp, type ViewStyle } from "react-native";
import { useRouter } from "expo-router";
import Animated, { FadeIn, FadeOut, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import {
  AppIcon,
  AppText,
  Button,
  Heading,
  TextField,
  brandTokens,
  pressedStyle,
  useOwnlevelTheme,
  useReduceMotion,
} from "@/design-system";
import {
  CountingNumber,
  EditorialRow,
  EditorialScreen,
  formatNumber,
} from "@/settings/editorial";
import { NutritionGlassButton } from "@/nutrition/day-controls";
import { previousDate, shortDate } from "@/settings/settings-model";
import { SettingsSegmented } from "@/settings/native-segmented";
import {
  dayDistance,
  draftNumber,
  kindLabel,
  sequenceDates,
  stageDraft,
  validSequence,
  scheduledCollision,
  validStageDate,
} from "./stages-model";
import { KindPicker } from "./kind-picker";
import { StartDatePicker } from "./start-date-picker";
import { DurationControl } from "./duration-control";
import {
  isLocked,
  isDraftLocked,
  RefreshingStages,
  StageSave,
  StageStripe,
  StagesSkeleton,
  StagesStatus,
  StagesToast,
  stageStyles,
  useStagesLeaveGuard,
  useStagesRoute,
} from "./stages-ui";
export function StageSequenceScreen() {
  const shared = useStagesRoute();
  useStagesLeaveGuard(shared);
  const router = useRouter();
  // Name and type share a row; with large text (or the Android chips) the type goes under the name.
  const { fontScale } = useWindowDimensions();
  const stackHeader = Platform.OS !== "ios" || fontScale > 1.3;
  const { colors } = useOwnlevelTheme();
  const state = shared?.state,
    controller = shared?.controller,
    list = state?.list;
  const sequence =
    state?.draft?.mode === "sequence" ? state.draft.sequence : null;
  const [dateOpen, setDateOpen] = useState(false);
  const locked = !state || isDraftLocked(state);
  const dates = (() => {
    try {
      return sequence ? sequenceDates(sequence) : [];
    } catch {
      return [];
    }
  })();
  const end = dates.at(-1)?.endsOn;
  const collision =
    list && sequence ? scheduledCollision(list, sequence.startDate) : null;
  const setSequence = (next: NonNullable<typeof sequence>) =>
    controller?.changeSequence(next);
  const totals = sequence?.stages.reduce(
    (sum, item) => ({
      ...sum,
      [item.duration.unit]: sum[item.duration.unit] + item.duration.value,
    }),
    { months: 0, weeks: 0 },
  );
  const valid = !!sequence && !!list && validSequence(sequence, list);
  const mean = (stage: ReturnType<typeof stageDraft>) =>
    stage.weekdays.some((d) => draftNumber(d.kcal) === null)
      ? null
      : Math.round(
          stage.weekdays.reduce((sum, d) => sum + draftNumber(d.kcal)!, 0) / 7,
        );
  return (
    <View style={{ flex: 1 }}>
      <EditorialScreen>
        <View style={{ gap: 4 }}>
          <Heading>Programar etapas</Heading>
          {/* Its own line under the title, always present: months, weeks and the end date never push the title. */}
          <AppText muted numeric testID="sequence-totals">
            {totals && end ? (
              <>
                {totals.months ? <><CountingNumber value={totals.months} /> {totals.months === 1 ? "mes" : "meses"}</> : null}
                {totals.months && totals.weeks ? " · " : null}
                {totals.weeks ? <><CountingNumber value={totals.weeks} /> {totals.weeks === 1 ? "semana" : "semanas"}</> : null}
                {` · hasta ${shortDate(end)}`}
              </>
            ) : " "}
          </AppText>
        </View>
        {state ? <RefreshingStages state={state} /> : null}
        {!sequence || !list ? (
          state?.notice || (list && state?.phase !== "loading") ? (
            <View style={{ gap: 12 }}>
              {state?.notice && shared ? (
                <StageSave shared={shared} disabled />
              ) : null}
              <Button
                label="Ver etapas"
                onPress={() => router.replace("/settings/stages")}
              />
            </View>
          ) : (
            <StagesSkeleton />
          )
        ) : (
          <>
            <TextField
              label="Nombre de la secuencia"
              value={sequence.name}
              maxLength={80}
              disabled={locked}
              onChangeText={(name) => setSequence({ ...sequence, name })}
            />
            <EditorialRow
              title="Inicio"
              disabled={locked}
              expanded={dateOpen}
              arrow="right"
              onPress={() => setDateOpen(!dateOpen)}
            >
              {sequence.startDate === list.today
                ? "Empezar hoy"
                : validStageDate(sequence.startDate)
                  ? shortDate(sequence.startDate)
                  : "Elegí una fecha válida"}
            </EditorialRow>
            {dateOpen ? (
              <StartDatePicker
                value={sequence.startDate}
                minimum={list.today}
                onChange={(startDate) =>
                  setSequence({ ...sequence, startDate })
                }
              />
            ) : null}
            {!list.suggestions ? (
              <View>
                <AppText muted>
                  Para sugerirte calorías necesitamos tus datos físicos.
                </AppText>
                <Button
                  label="Ir a Datos físicos"
                  variant="quiet"
                  onPress={() => router.push("/settings/physical")}
                />
              </View>
            ) : null}
            {collision ? (
              <View accessibilityLiveRegion="polite" style={{ gap: 12 }}>
                <AppText>
                  Ya tenés etapas programadas desde el{" "}
                  {shortDate(collision.startsOn)}: «{collision.name}». Revisalas
                  antes de programar.
                </AppText>
                <Button
                  label={
                    collision.sequenceId
                      ? "Cortar esa secuencia"
                      : "Borrar esa etapa programada"
                  }
                  disabled={!state || isLocked(state)}
                  variant="secondary"
                  onPress={() =>
                    Alert.alert(
                      collision.sequenceId
                        ? "¿Cortar la secuencia programada?"
                        : "¿Borrar la etapa programada?",
                      "La actual y lo vivido quedan. Lo que estás armando sigue acá; después elegís si lo guardás.",
                      [
                        { text: "Volver", style: "cancel" },
                        {
                          text: collision.sequenceId
                            ? "Cortar secuencia"
                            : "Borrar etapa",
                          style: "destructive",
                          onPress: () => {
                            if (collision.sequenceId)
                              void controller?.cancelSequence(
                                collision.sequenceId,
                              );
                            else void controller?.removeStage(collision.id);
                          },
                        },
                      ],
                    )
                  }
                />
              </View>
            ) : null}
            <View>
              {sequence.stages.map((item, i) => (
                <StageRow
                  key={item.stage.key}
                  style={[stageStyles.row, { borderColor: colors.border }]}
                  testID={`sequence-stage-${i}`}
                >
                  <StageStripe kind={item.stage.kind} />
                  <View style={{ flex: 1, gap: 12 }}>
                    {/* Name on the left, its type on the right: the menu says "Tipo" until one is chosen. */}
                    <View style={[styles.header, stackHeader && styles.stacked]}>
                      <AppText variant="headline" style={styles.name}>
                        {item.stage.name || kindLabel(item.stage.kind)}
                      </AppText>
                      <View style={stackHeader ? undefined : styles.kind}>
                        <KindPicker
                          value={item.stage.kind}
                          suggested={null}
                          placeholder="Tipo"
                          disabled={locked}
                          onChange={(kind) => {
                            controller?.editStage(i);
                            controller?.kind(kind);
                          }}
                        />
                      </View>
                    </View>
                    <View style={styles.dates}>
                      <StageRow key={`${dates[i]?.startsOn}-${dates[i]?.endsOn}`} style={{ flex: 1 }}>
                        <AppText muted>
                          {dates[i]
                            ? `${shortDate(dates[i].startsOn)} → ${shortDate(previousDate(dates[i].endsOn))}`
                            : "Elegí una fecha de inicio válida"}
                        </AppText>
                      </StageRow>
                      <NutritionGlassButton
                        icon="trash"
                        label={`Quitar etapa ${i + 1}`}
                        onPress={locked ? undefined : () =>
                          Alert.alert(
                            "¿Quitar esta etapa?",
                            `Sale «${item.stage.name || kindLabel(item.stage.kind)}» de la secuencia que estás armando. Las fechas de las demás se reacomodan.`,
                            [
                              { text: "Volver", style: "cancel" },
                              {
                                text: "Quitar",
                                style: "destructive",
                                onPress: () =>
                                  setSequence({
                                    ...sequence,
                                    stages: sequence.stages.filter((_, n) => n !== i),
                                  }),
                              },
                            ],
                          )
                        }
                      />
                    </View>
                    <DurationControl
                      duration={item.duration}
                      disabled={locked}
                      onChange={(duration) =>
                        setSequence({
                          ...sequence,
                          stages: sequence.stages.map((s, n) =>
                            n === i ? { ...s, duration } : s,
                          ),
                        })
                      }
                    />
                    <TargetsRow
                      name={item.stage.name || kindLabel(item.stage.kind)}
                      kcal={mean(item.stage)}
                      suggested={item.stage.suggested}
                      disabled={locked}
                      onPress={() => {
                        controller?.editStage(i);
                        router.push("/settings/stage-plan");
                      }}
                    />
                  </View>
                </StageRow>
              ))}
            </View>
            <Button
              label="Agregar etapa"
              icon="plus"
              variant="quiet"
              disabled={locked || sequence.stages.length >= 24}
              onPress={() =>
                setSequence({
                  ...sequence,
                  stages: [
                    ...sequence.stages,
                    {
                      stage: stageDraft(list),
                      duration: { unit: "months", value: 1 },
                    },
                  ],
                })
              }
            />
            <AppText muted variant="caption">
              AL TERMINAR
            </AppText>
            <SettingsSegmented
              accessibilityLabel="Al terminar"
              value={sequence.afterEnd}
              disabled={locked}
              options={[
                { value: "keep_last", label: "Sigo en la última" },
                { value: "maintenance", label: "Vuelvo a mantenimiento" },
              ]}
              onChange={(afterEnd) => setSequence({ ...sequence, afterEnd })}
            />
            {sequence.afterEnd === "maintenance" ? (
              <Animated.View entering={FadeIn.duration(brandTokens.motion.duration.fast)} exiting={FadeOut.duration(brandTokens.motion.duration.fast)}
                style={[stageStyles.row, { borderColor: colors.border }]} testID="sequence-maintenance">
                <StageStripe kind="maintenance" />
                <View style={{ flex: 1, gap: 12 }}>
                  <AppText variant="headline">Mantenimiento</AppText>
                  <AppText muted>
                    {end
                      ? `Desde ${shortDate(end)} · sin fecha de fin`
                      : "Se agrega al terminar los tramos anteriores"}
                  </AppText>
                  <TargetsRow
                    name="Mantenimiento final"
                    kcal={mean(sequence.maintenanceStage)}
                    suggested={sequence.maintenanceStage.suggested}
                    disabled={locked}
                    onPress={() => {
                      controller?.editStage("maintenance");
                      router.push("/settings/stage-plan");
                    }}
                  />
                </View>
              </Animated.View>
            ) : null}
            {/* Only what blocks saving and is not visible above: no stage yet, or past the ten-year limit. */}
            {!valid && !collision && (sequence.stages.length === 0 || (end && dayDistance(sequence.startDate, end) > 3660)) ? (
              <AppText muted>
                {sequence.stages.length === 0
                  ? "Agregá tu primera etapa."
                  : "La secuencia puede abarcar hasta diez años."}
              </AppText>
            ) : null}
            {shared ? (
              <StageSave
                shared={shared}
                disabled={!valid}
                label="Guardar secuencia"
              />
            ) : null}
          </>
        )}
        {shared ? <StagesStatus {...shared} /> : null}
      </EditorialScreen>
      <StagesToast shared={shared} />
    </View>
  );
}

/**
 * A stage holds native views (the type menu and Semanas/Meses) that size themselves after mounting. A Reanimated
 * layout animation (entering, exiting or layout) on an ancestor takes over their frames and leaves them drawn away
 * from their slot, so a stage only fades in with a plain opacity style (it never moves or resizes anything).
 */
function StageRow({ children, style, testID }: PropsWithChildren<{ style?: StyleProp<ViewStyle>; testID?: string }>) {
  const shown = useSharedValue(0);
  useEffect(() => { shown.set(withTiming(1, { duration: brandTokens.motion.duration.fast })); }, [shown]);
  const fade = useAnimatedStyle(() => ({ opacity: shown.get() }));
  return <Animated.View style={[style, fade]} testID={testID}>{children}</Animated.View>;
}

/** The stage's targets as one row: average kcal (or what is missing) and a chevron that opens the plan editor. */
function TargetsRow({ name, kcal, suggested, disabled, onPress }: {
  name: string; kcal: number | null; suggested: boolean; disabled: boolean; onPress: () => void;
}) {
  const { colors } = useOwnlevelTheme();
  const reduced = useReduceMotion();
  const value = kcal === null ? "Sin completar" : `${formatNumber(kcal)} kcal promedio${suggested ? " · sugerido" : ""}`;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Objetivos de ${name}`}
      accessibilityValue={{ text: value }}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.targets, pressedStyle(pressed, reduced), disabled && { opacity: 0.5 }]}
    >
      <View style={{ flex: 1, gap: 4 }}>
        <AppText variant="headline">Objetivos</AppText>
        <AppText numeric muted={suggested || kcal === null} style={suggested || kcal === null ? undefined : { color: colors.primary }}>
          {value}
        </AppText>
      </View>
      <AppIcon name="chevronRight" size={20} color={colors.textMuted} />
    </Pressable>
  );
}
const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: brandTokens.space.md, minHeight: brandTokens.layout.minTouch },
  stacked: { flexDirection: "column", alignItems: "stretch", gap: brandTokens.space.xs },
  name: { flex: 1, minWidth: 0 },
  kind: { flexShrink: 0, maxWidth: "55%" },
  dates: { flexDirection: "row", alignItems: "center", gap: brandTokens.space.md },
  targets: { flexDirection: "row", alignItems: "center", gap: brandTokens.space.md, minHeight: brandTokens.layout.minTouch },
});
