import { Pressable, View } from "react-native";
import Swipeable from "react-native-gesture-handler/ReanimatedSwipeable";
import { useRouter } from "expo-router";
import {
  AppText,
  Button,
  Heading,
  pressedStyle,
  useOwnlevelTheme,
  useReduceMotion,
} from "@/design-system";
import { NutritionGlassButton } from "@/nutrition/day-controls";
import { CountingNumber, EditorialScreen, EditorialSpread, Reveal } from "@/settings/editorial";
import {
  previousDate,
  shortDate,
  stageProgress,
} from "@/settings/settings-model";
import type { NutritionStage } from "@/api/nutrition-stages";
import { dayDistance, kindLabel, weekdayFor } from "./stages-model";
import {
  isLocked,
  StageProgressBar,
  StageStripe,
  StagesSkeleton,
  StagesStatus,
  StagesToast,
  RefreshingStages,
  stageStyles,
  useStagesRoute,
} from "./stages-ui";
export function StagesListScreen() {
  const shared = useStagesRoute(true);
  const router = useRouter();
  const { colors } = useOwnlevelTheme();
  const reduced = useReduceMotion();
  const state = shared?.state,
    list = state?.list;
  const locked = !state || isLocked(state);
  const duplicate = (stage: NutritionStage) =>
    router.push({
      pathname: "/settings/stage-action",
      params: { source: stage.id },
    });
  const row = (stage: NutritionStage) => (
    <View style={[stageStyles.row, { borderColor: colors.border }]}>
      <StageStripe kind={stage.kind} />
      <View style={{ flex: 1, gap: 8 }}>
        <AppText variant="headline">{stage.name}</AppText>
        <AppText muted variant="footnote">
          {kindLabel(stage.kind)} · {shortDate(stage.startsOn)}
          {stage.endsOn
            ? ` → ${shortDate(previousDate(stage.endsOn))} · ${Math.ceil(dayDistance(stage.startsOn, stage.endsOn) / 7)} semanas`
            : " · sin fecha de fin"}
        </AppText>
      </View>
    </View>
  );
  const progress =
    list?.current && list ? stageProgress(list.current, list.today) : null;
  const today = list ? weekdayFor(list.today) : 1;
  const target = list?.current?.weekdays.find((d) => d.weekday === today);
  return (
    <View style={{ flex: 1 }}>
      <EditorialScreen>
        <EditorialSpread>
          <Heading style={{ flexShrink: 1 }}>Etapas</Heading>
          <NutritionGlassButton
            icon="plus"
            label="Agregar etapa"
            onPress={
              locked ? undefined : () => router.push("/settings/stage-action")
            }
          />
        </EditorialSpread>
        <AppText muted>
          Cada etapa con su objetivo. Las pasadas quedan como estaban.
        </AppText>
        {!list ||
        (state?.loading &&
          !list.current &&
          !list.upcoming.length &&
          !list.past.length) ? (
          state?.readError ? null : (
            <StagesSkeleton />
          )
        ) : (
          <>
            <RefreshingStages state={state!} />
            <Reveal>
              <AppText muted variant="caption">
                AHORA
              </AppText>
              {list.current ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Ajustar ${list.current.name}`}
                  disabled={locked}
                  onPress={() => {
                    if (shared?.controller.replace(list.current!, "current"))
                      router.push("/settings/stage-plan");
                  }}
                  style={({ pressed }) => [
                    { paddingVertical: 20, gap: 12 },
                    pressedStyle(pressed, reduced),
                  ]}
                >
                  <EditorialSpread>
                    <Heading level={2} style={{ flexShrink: 1 }}>{list.current.name}</Heading>
                    <View>
                      <CountingNumber
                        variant="title1"
                        value={target?.calorieTargetKcal ?? null}
                      />
                      <AppText muted variant="caption">
                        kcal hoy
                      </AppText>
                    </View>
                  </EditorialSpread>
                  <AppText muted numeric>
                    {kindLabel(list.current.kind)} ·{" "}
                    {shortDate(list.current.startsOn)}
                    {list.current.endsOn
                      ? ` → ${shortDate(previousDate(list.current.endsOn))}`
                      : " · sin fecha de fin"}
                    {progress
                      ? ` · semana ${progress.week} de ${progress.weeks}`
                      : ""}
                    {target?.proteinTargetG == null
                      ? ""
                      : ` · ${target.proteinTargetG.toLocaleString("es-AR")} g proteína`}
                  </AppText>
                  {progress ? (
                    <StageProgressBar value={progress.progress} />
                  ) : null}
                </Pressable>
              ) : !state?.loading && !state?.readError ? (
                <AppText muted>Todavía no tenés una etapa en curso.</AppText>
              ) : null}
            </Reveal>
            <Reveal index={1}>
              <AppText muted variant="caption">
                PRÓXIMAS
              </AppText>
              {[...list.upcoming]
                .sort(
                  (a, b) =>
                    a.startsOn.localeCompare(b.startsOn) ||
                    a.id.localeCompare(b.id),
                )
                .map((stage) => (
                  <Pressable
                    key={stage.id}
                    style={({ pressed }) => pressedStyle(pressed, reduced)}
                    accessibilityRole="button"
                    accessibilityLabel={`Editar ${stage.name}`}
                    disabled={locked}
                    onPress={() => {
                      if (shared?.controller.future(stage))
                        router.push("/settings/stage-plan");
                    }}
                  >
                    {row(stage)}
                  </Pressable>
                ))}
              {!list.upcoming.length && !state?.loading && !state?.readError ? (
                <AppText muted>No hay etapas programadas.</AppText>
              ) : null}
            </Reveal>
            <Reveal index={2}>
              <AppText muted variant="caption">
                ANTES
              </AppText>
              {list.past.slice(0, 24).map((stage) => (
                <Swipeable
                  key={stage.id}
                  enabled={!locked}
                  overshootRight={false}
                  renderRightActions={() => (
                    <Button
                      label="Duplicar"
                      variant="secondary"
                      onPress={() => duplicate(stage)}
                    />
                  )}
                >
                  <View
                    accessible
                    accessibilityLabel={`${stage.name}, ${kindLabel(stage.kind)}, ${shortDate(stage.startsOn)}${stage.endsOn ? ` a ${shortDate(previousDate(stage.endsOn))}` : ""}`}
                    accessibilityActions={[
                      { name: "duplicate", label: "Duplicar etapa" },
                    ]}
                    onAccessibilityAction={(e) => {
                      if (e.nativeEvent.actionName === "duplicate" && !locked)
                        duplicate(stage);
                    }}
                  >
                    {row(stage)}
                  </View>
                </Swipeable>
              ))}
              {list.past.length ? (
                <AppText muted variant="footnote">
                  Deslizá una etapa pasada para duplicarla.
                </AppText>
              ) : !state?.loading && !state?.readError ? <AppText muted>Tus etapas anteriores van a aparecer acá.</AppText> : null}
            </Reveal>
          </>
        )}
        {shared ? <StagesStatus {...shared} /> : null}
        {state?.intent || state?.draft ? (
          <Button
            label={
              state.intent ? "Ver cambio pendiente" : "Retomar lo que armaste"
            }
            variant="secondary"
            onPress={() =>
              router.push(
                state.draft?.mode === "sequence"
                  ? "/settings/stage-sequence"
                  : "/settings/stage-plan",
              )
            }
          />
        ) : null}
      </EditorialScreen>
      <StagesToast shared={shared} />
    </View>
  );
}
