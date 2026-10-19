import { useEffect, useState, type PropsWithChildren } from "react";
import { Alert, View, type StyleProp, type ViewStyle } from "react-native";
import { useRouter } from "expo-router";
import Animated, { FadeIn, FadeOut, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import {
  AppText,
  Button,
  Heading,
  TextField,
  brandTokens,
  useOwnlevelTheme,
} from "@/design-system";
import {
  CountingNumber,
  EditorialRow,
  EditorialScreen,
  EditorialSpread,
  useEditorialLayout,
} from "@/settings/editorial";
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
import { PlanNumber } from "./plan-week";
import { StageKindField } from './stage-kind-field';
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
  const { largeInputStyle } = useEditorialLayout();
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
              inputStyle={largeInputStyle}
            />
            <EditorialRow
              title="Inicio"
              disabled={locked}
              onPress={() => setDateOpen(!dateOpen)}
            >
              {sequence.startDate === list.today
                ? "Empezar hoy"
                : validStageDate(sequence.startDate)
                  ? shortDate(sequence.startDate)
                  : "Elegí una fecha válida"}
            </EditorialRow>
            {dateOpen ? (
              <>
                <Button
                  label="Empezar hoy"
                  variant="quiet"
                  disabled={locked}
                  onPress={() =>
                    setSequence({ ...sequence, startDate: list.today })
                  }
                />
                <StartDatePicker
                  value={sequence.startDate}
                  minimum={list.today}
                  onChange={(startDate) =>
                    setSequence({ ...sequence, startDate })
                  }
                />
              </>
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
                    <StageKindField
                      value={item.stage.kind}
                      suggested={null}
                      disabled={locked}
                      onChange={(kind) => {
                        controller?.editStage(i);
                        controller?.kind(kind);
                      }}
                    />
                    <AppText variant="headline">
                      {item.stage.name || kindLabel(item.stage.kind)}
                    </AppText>
                    <View>
                      <PlanNumber
                        value={mean(item.stage)}
                        suggested={item.stage.suggested}
                      />
                      <AppText muted variant="caption">
                        kcal promedio
                        {item.stage.suggested ? " · sugerido" : ""}
                      </AppText>
                    </View>
                    <StageRow key={`${dates[i]?.startsOn}-${dates[i]?.endsOn}`}>
                      <AppText muted>
                        {dates[i]
                          ? `${shortDate(dates[i].startsOn)} → ${shortDate(previousDate(dates[i].endsOn))}`
                          : "Elegí una fecha de inicio válida"}
                      </AppText>
                    </StageRow>
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
                    <EditorialSpread>
                      <Button
                        label={`Ajustar ${kindLabel(item.stage.kind).toLocaleLowerCase("es-AR")}`}
                        disabled={locked}
                        variant="quiet"
                        onPress={() => {
                          controller?.editStage(i);
                          router.push("/settings/stage-plan");
                        }}
                      />
                      <Button
                        label="Quitar"
                        accessibilityLabel={`Quitar etapa ${i + 1}`}
                        variant="quiet"
                        disabled={locked}
                        onPress={() =>
                          setSequence({
                            ...sequence,
                            stages: sequence.stages.filter((_, n) => n !== i),
                          })
                        }
                      />
                    </EditorialSpread>
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
                  <Heading level={2}>Mantenimiento</Heading>
                  <AppText muted>
                    {end
                      ? `Desde ${shortDate(end)} · sin fecha de fin`
                      : "Se agrega al terminar los tramos anteriores"}
                  </AppText>
                  <PlanNumber
                    value={mean(sequence.maintenanceStage)}
                    suggested={sequence.maintenanceStage.suggested}
                  />
                  <AppText muted variant="footnote">
                    Objetivos propios para esta etapa
                    {sequence.maintenanceStage.suggested ? " · sugerido" : ""}.
                  </AppText>
                  <Button
                    label="Ajustar mantenimiento final"
                    disabled={locked}
                    variant="quiet"
                    onPress={() => {
                      controller?.editStage("maintenance");
                      router.push("/settings/stage-plan");
                    }}
                  />
                </View>
              </Animated.View>
            ) : null}
            {!valid && !collision ? (
              <AppText muted>
                {sequence.stages.length === 0
                  ? "Agregá tu primera etapa."
                  : end && dayDistance(sequence.startDate, end) > 3660
                    ? "La secuencia puede abarcar hasta diez años."
                    : "Completá el nombre, el tipo y los objetivos de cada etapa antes de guardar."}
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
