import { useState } from "react";
import { Alert, Keyboard, Switch, View } from "react-native";
import Animated, { FadeIn, FadeOut, LinearTransition } from "react-native-reanimated";
import { useRouter } from "expo-router";
import {
  AppText,
  Button,
  Heading,
  TextField,
  brandTokens,
  useOwnlevelTheme,
  useReduceMotion,
} from "@/design-system";
import { EditorialRow, EditorialScreen, EditorialSpread, formatNumber } from "@/settings/editorial";
import { shortDate } from "@/settings/settings-model";
import {
  stageFields,
  draftNumber,
  weekdayFor,
  repeatedDay,
  applyDays,
  suggestedKind,
  validStageDate,
} from "./stages-model";
import { PlanWeek } from "./plan-week";
import { StageKindField } from './stage-kind-field';
import { StartDatePicker } from "./start-date-picker";
import { DurationControl } from "./duration-control";
import {
  isLocked,
  isDraftLocked,
  RefreshingStages,
  StagesSkeleton,
  StagesStatus,
  StagesToast,
  StageSave,
  useStagesLeaveGuard,
  useStagesRoute,
} from "./stages-ui";
export function StagePlanScreen() {
  const shared = useStagesRoute();
  return (
    <StagePlanBody
      key={shared?.controller.stage()?.key ?? "empty"}
      shared={shared}
    />
  );
}
function StagePlanBody({
  shared,
}: {
  shared: ReturnType<typeof useStagesRoute>;
}) {
  const router = useRouter();
  const { colors } = useOwnlevelTheme();
  const state = shared?.state,
    controller = shared?.controller,
    list = state?.list,
    draft = state?.draft,
    stage = controller?.stage();
  const localOnly = draft?.mode === "sequence";
  useStagesLeaveGuard(shared, localOnly);
  const [same, setSame] = useState(false),
    [daySheetOpen, setDaySheetOpen] = useState(false),
    [uniformNotice, setUniformNotice] = useState<string | null>(null),
    [extras, setExtras] = useState<"water" | "training" | "date" | null>(null);
  const reduced = useReduceMotion();
  // One block open at a time. Its fields fade in/out (200 ms) while what follows slides to its new place (300 ms);
  // Reduce Motion: fades only. Closing a block with the keyboard up takes the keyboard down with it.
  const toggle = (block: "water" | "training" | "date") => {
    const next = extras === block ? null : block;
    if (extras && extras !== "date" && Keyboard.isVisible()) Keyboard.dismiss();
    setExtras(next);
  };
  const move = reduced ? undefined : LinearTransition.duration(brandTokens.motion.duration.base);
  const appear = FadeIn.duration(brandTokens.motion.duration.fast);
  const leave = FadeOut.duration(brandTokens.motion.duration.fast);
  const locked = !state || isDraftLocked(state);
  const valid =
    !!stage &&
    !!stageFields(stage) &&
    (draft?.mode !== "update" ||
      (!!list &&
        validStageDate(draft.startsOn) &&
        draft.startsOn > list.today &&
        list.upcoming.some((s) => s.id === draft.stageId)));
  const change = (
    field:
      | "name"
      | "baseWaterL"
      | "trainingCalorieDeltaKcal"
      | "trainingWaterDeltaL",
    value: string,
  ) => {
    if (stage) controller?.changeStage({ ...stage, [field]: value });
  };
  const save = () => {
    if (!shared || !draft || !stage || !list) return;
    if (localOnly) {
      controller?.changeStage({ ...stage, suggested: false });
      router.back();
      return;
    }
    if (draft.mode === "replace" && list.upcoming.length) {
      const first = [...list.upcoming].sort((a, b) =>
        a.startsOn.localeCompare(b.startsOn),
      )[0];
      Alert.alert(
        "Etapas programadas",
        `Tenés etapas programadas desde el ${shortDate(first.startsOn)}. ¿Las mantenés?`,
        [
          { text: "Volver", style: "cancel" },
          {
            text: "Mantener",
            onPress: () => {
              controller!.chooseFuture("keep");
              void controller!.save();
            },
          },
          {
            text: "Cancelarlas",
            style: "destructive",
            onPress: () => {
              controller!.chooseFuture("cancel");
              void controller!.save();
            },
          },
        ],
      );
    } else void controller?.save();
  };
  const future =
    draft?.mode === "update"
      ? list?.upcoming.find((s) => s.id === draft.stageId)
      : null;
  return (
    <View style={{ flex: 1 }}>
      <EditorialScreen adjustKeyboardInsets={!daySheetOpen}>
        <Heading>{future ? future.name : "Plan nutricional"}</Heading>
        <AppText muted>
          {localOnly
            ? "Ajustá los objetivos de este tramo. La secuencia se guarda toda junta."
            : future
              ? "Esta etapa todavía no empezó. Lo vivido no cambia."
              : "Rige desde hoy. Los días anteriores conservan el plan que tenían."}
        </AppText>
        {state ? <RefreshingStages state={state} /> : null}
        {!stage || !list ? (
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
            <StageKindField
              reserveHint
              readOnly={!!((draft?.mode === "replace" &&
                draft.origin === "current" &&
                stage.kind &&
                !stage.sourceWasUntyped) ||
                (localOnly && state?.editing === "maintenance"))}
              value={stage.kind}
              suggested={stage.kind === null ? suggestedKind(stage, list) : null}
              disabled={locked}
              onChange={kind => controller?.kind(kind)}
            />
            {draft?.mode === "replace" && draft.origin === "current" ? (
              <EditorialRow title="Nombre">{stage.name}</EditorialRow>
            ) : (
              <TextField
                label="Nombre del plan"
                value={stage.name}
                maxLength={80}
                disabled={locked}
                onChangeText={(v) => change("name", v)}
              />
            )}
            {stage.suggested ? (
              <AppText muted variant="footnote">
                Calorías sugeridas. Podés ajustarlas antes de guardar.
              </AppText>
            ) : null}
            {!list.suggestions ? (
              <View style={{ gap: 8 }}>
                <AppText muted variant="footnote">
                  Para sugerirte calorías necesitamos tus datos físicos.
                </AppText>
                <Button
                  label="Ir a Datos físicos"
                  variant="quiet"
                  onPress={() => router.push("/settings/physical")}
                />
              </View>
            ) : null}
            {draft?.mode === "update" ? (
              <>
                <EditorialRow
                  title="Empieza"
                  disabled={locked}
                  expanded={extras === "date"}
                  onPress={() => toggle("date")}
                >
                  {validStageDate(draft.startsOn)
                    ? shortDate(draft.startsOn)
                    : "Elegí una fecha futura"}
                </EditorialRow>
                {extras === "date" ? (
                  <StartDatePicker
                    value={draft.startsOn}
                    minimum={new Date(
                      Date.parse(`${list.today}T12:00:00Z`) + 86400000,
                    )
                      .toISOString()
                      .slice(0, 10)}
                    onChange={(date) => controller?.changeFutureDate(date)}
                  />
                ) : null}
                {draft.duration ? (
                  <DurationControl
                    duration={draft.duration}
                    disabled={locked}
                    onChange={(duration) => {
                      /* Preserve the same period and sequence; only its explicit metadata changes. */ controller?.changeFutureDuration(
                        duration,
                      );
                    }}
                  />
                ) : null}
              </>
            ) : null}
            <EditorialSpread>
              <AppText>Igual todos los días</AppText>
              <Switch
                accessibilityLabel="Igual todos los días"
                value={same}
                disabled={locked}
                trackColor={{ true: colors.primary }}
                onValueChange={(next) => {
                  setSame(next);
                  if (next) {
                    const repeated = repeatedDay(stage);
                    const uniform = applyDays(stage, [1, 2, 3, 4, 5, 6, 7], repeated.kcal, repeated.protein);
                    const matches = (field: "kcal" | "protein") =>
                      stage.weekdays.every((d) => d[field] === repeated[field]);
                    // A week that already matches changes nothing: suggested calories stay suggested (their note
                    // above keeps its place, so nothing jumps) and there is no "most repeated value" to explain.
                    controller?.changeStage(matches("kcal") ? { ...uniform, suggested: stage.suggested } : uniform);
                    setUniformNotice(matches("kcal") && matches("protein") ? null :
                      `Tomamos el valor más repetido: ${draftNumber(repeated.kcal) === null ? "—" : formatNumber(draftNumber(repeated.kcal)!)} kcal · ${draftNumber(repeated.protein) === null ? "—" : formatNumber(draftNumber(repeated.protein)!)} g.`,
                    );
                  } else setUniformNotice(null);
                }}
              />
            </EditorialSpread>
            <PlanWeek
              stage={stage}
              today={weekdayFor(list.today)}
              same={same}
              disabled={locked}
              onChange={(s) => controller?.changeStage(s)}
              onSheetVisibilityChange={setDaySheetOpen}
              notice={same ? uniformNotice : null}
            />
            <Animated.View layout={move}>
              <EditorialRow
                title="Agua por día"
                disabled={locked}
                expanded={extras === "water"}
                onPress={() => toggle("water")}
              >
                {draftNumber(stage.baseWaterL) === null
                  ? "Sin dato"
                  : `${formatNumber(draftNumber(stage.baseWaterL)!)} L`}
              </EditorialRow>
              {extras === "water" ? (
                <Animated.View entering={appear} exiting={leave} style={{ paddingTop: 12 }}>
                  <TextField
                    label="Agua por día (L)"
                    numeric
                    keyboardType="decimal-pad"
                    value={stage.baseWaterL}
                    disabled={locked}
                    onChangeText={(v) => change("baseWaterL", v)}
                  />
                </Animated.View>
              ) : null}
            </Animated.View>
            <Animated.View layout={move}>
              <EditorialRow
                title="Si entrenás"
                disabled={locked}
                expanded={extras === "training"}
                onPress={() => toggle("training")}
              >{`${draftNumber(stage.trainingCalorieDeltaKcal) === null ? "Calorías sin dato" : `+${formatNumber(draftNumber(stage.trainingCalorieDeltaKcal)!)} kcal`} · ${draftNumber(stage.trainingWaterDeltaL) === null ? "agua sin dato" : `+${formatNumber(draftNumber(stage.trainingWaterDeltaL)!)} L`}`}</EditorialRow>
              {extras === "training" ? (
                <Animated.View entering={appear} exiting={leave} style={{ gap: 12, paddingTop: 12 }}>
                  <TextField
                    label="Extra de calorías (kcal)"
                    numeric
                    keyboardType="number-pad"
                    value={stage.trainingCalorieDeltaKcal}
                    disabled={locked}
                    onChangeText={(v) => change("trainingCalorieDeltaKcal", v)}
                  />
                  <TextField
                    label="Extra de agua (L)"
                    numeric
                    keyboardType="decimal-pad"
                    value={stage.trainingWaterDeltaL}
                    disabled={locked}
                    onChangeText={(v) => change("trainingWaterDeltaL", v)}
                  />
                </Animated.View>
              ) : null}
            </Animated.View>
            <Animated.View layout={move} style={{ gap: 24 }}>
            {draft?.mode === "update" && !valid ? (
              <AppText muted>
                {future
                  ? "Elegí una fecha futura y completá los objetivos antes de guardar."
                  : "Esta etapa ya no está programada. Volvé a Etapas para revisar cómo quedó."}
              </AppText>
            ) : null}
            {!valid && stage.kind && (draft?.mode !== "update" || !!future) ? (
              <AppText muted>
                Completá el nombre, las calorías y la proteína de los siete
                días, el agua y los extras. Si no usás un extra, poné 0.
              </AppText>
            ) : null}
            {shared ? (
              <StageSave
                shared={shared}
                disabled={!valid}
                onPress={save}
                label={localOnly ? "Volver a la secuencia" : "Guardar"}
              />
            ) : null}
            {future ? (
              <>
                <Button
                  label="Borrar etapa"
                  variant="quiet"
                  disabled={!state || isLocked(state)}
                  onPress={() =>
                    Alert.alert(
                      "¿Borrar esta etapa?",
                      "Solo se borra la etapa que todavía no empezó. Si está en el medio de una secuencia, puede ser necesario cortar la secuencia o borrar desde la última.",
                      [
                        { text: "Volver", style: "cancel" },
                        {
                          text: "Borrar",
                          style: "destructive",
                          onPress: () =>
                            void controller?.removeStage(future.id),
                        },
                      ],
                    )
                  }
                />
                {future.sequenceId ? (
                  <Button
                    label="Cortar secuencia"
                    variant="quiet"
                    disabled={!state || isLocked(state)}
                    onPress={() =>
                      Alert.alert(
                        "¿Cortar la secuencia?",
                        "Se quitan solo las etapas que todavía no empezaron. La actual y lo vivido quedan.",
                        [
                          { text: "Volver", style: "cancel" },
                          {
                            text: "Cortar secuencia",
                            style: "destructive",
                            onPress: () =>
                              void controller?.cancelSequence(
                                future.sequenceId!,
                              ),
                          },
                        ],
                      )
                    }
                  />
                ) : null}
              </>
            ) : null}
            </Animated.View>
          </>
        )}
        {shared ? <StagesStatus {...shared} /> : null}
      </EditorialScreen>
      <StagesToast shared={shared} />
    </View>
  );
}
