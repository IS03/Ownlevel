import { useCallback, useEffect } from "react";
import { ActivityIndicator, Alert, StyleSheet, View } from "react-native";
import { useFocusEffect, useNavigation } from "expo-router";
import { usePreventRemove } from "expo-router/react-navigation";
import Animated, {
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import {
  AppText,
  Button,
  SkeletonBlock,
  brandTokens,
  useOwnlevelTheme,
  useReduceMotion,
} from "@/design-system";
import { NutritionToast } from "@/nutrition/nutrition-toast";
import { SaveButton } from "@/nutrition/save-button";
import { previousDate, shortDate } from "@/settings/settings-model";
import { useNutritionStages } from "./stages-provider";
import type { StagesState, StagesController } from "./stages-controller";
import type { StageKind } from "@/api/nutrition-stages";
export function useStagesRoute(refresh = false) {
  const shared = useNutritionStages();
  const controller = shared?.controller;
  useFocusEffect(
    useCallback(() => {
      if (controller && (refresh || !controller.getSnapshot().list))
        void controller.load();
    }, [controller, refresh]),
  );
  return shared;
}
export const isPending = (state: StagesState) =>
  state.phase === "pending" || (state.phase === "confirmed" && !state.message);
export const isDraftLocked = (state: StagesState) =>
  state.phase !== "idle" || !!state.intent;
export const isLocked = (state: StagesState) =>
  state.phase !== "idle" || !!state.intent || state.readError || state.loading;
export function useStagesLeaveGuard(
  shared: ReturnType<typeof useStagesRoute>,
  localOnly = false,
) {
  const navigation = useNavigation();
  const state = shared?.state,
    controller = shared?.controller;
  usePreventRemove(
    !!state &&
      (isPending(state) ||
        (!localOnly && !!state.draft && !state.intent && controller!.dirty())),
    ({ data }) => {
      if (!state || isPending(state)) return;
      Alert.alert(
        "¿Descartar cambios?",
        "Lo que armaste todavía no está guardado.",
        [
          { text: "Seguir editando", style: "cancel" },
          {
            text: "Descartar",
            style: "destructive",
            onPress: () => {
              controller?.discard();
              navigation.dispatch(data.action);
            },
          },
        ],
      );
    },
  );
}
export function useStageColor() {
  const { colors } = useOwnlevelTheme();
  return (kind: StageKind | null) =>
    kind === "surplus"
      ? brandTokens.palette.dark.heroFrom
      : kind === "deficit"
        ? brandTokens.palette.light.accent
        : kind === "maintenance" || !kind
          ? brandTokens.palette.light.elevated
          : colors.textMuted;
}
export function StageStripe({ kind }: { kind: StageKind | null }) {
  const color = useStageColor();
  return (
    <View
      accessible={false}
      style={{
        width: 4,
        alignSelf: "stretch",
        borderRadius: 4,
        backgroundColor: color(kind),
      }}
    />
  );
}
export function StageProgressBar({ value }: { value: number }) {
  const { colors } = useOwnlevelTheme();
  const reduced = useReduceMotion();
  const progress = useSharedValue(reduced ? value : 0);
  useEffect(() => {
    progress.set(reduced ? value : withTiming(value, { duration: 300 }));
  }, [value, reduced, progress]);
  const style = useAnimatedStyle(() => ({
    width: `${Math.max(0, Math.min(1, progress.value)) * 100}%`,
  }));
  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      accessibilityRole="progressbar"
      accessibilityLabel="Avance de tu etapa"
      accessibilityValue={{ min: 0, max: 1, now: value }}
      style={{
        height: 4,
        backgroundColor: colors.border,
        borderRadius: 4,
        overflow: "hidden",
      }}
    >
      <Animated.View
        style={[{ height: 4, backgroundColor: colors.primary }, style]}
      />
    </Animated.View>
  );
}
export function StagesSkeleton() {
  return (
    <View
      accessibilityLabel="Actualizando etapas"
      accessibilityState={{ busy: true }}
      testID="stages-skeleton"
      style={{ gap: 24 }}
    >
      {["AHORA", "PRÓXIMAS", "ANTES"].map((name, i) => (
        <View key={name} style={{ gap: 12 }}>
          <AppText muted variant="caption">
            {name}
          </AppText>
          {Array.from({ length: i === 2 ? 2 : 1 }, (_, n) => (
            <View key={n} style={{ gap: 8 }}>
              <SkeletonBlock height={28} width="80%" />
              <SkeletonBlock height={18} width="65%" />
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}
export function StagesStatus({
  state,
  controller,
}: {
  state: StagesState;
  controller: StagesController;
}) {
  if (isPending(state)) return null;
  if (state.phase === "conflict")
    return (
      <View accessibilityLiveRegion="polite" style={{ gap: 12 }}>
        <AppText>{state.message}</AppText>
        <AppText muted>
          Lo que armaste sigue acá. Así quedaron tus etapas:
        </AppText>
        {state.list?.current ? (
          <AppText>
            {state.list.current.name} · desde{" "}
            {shortDate(state.list.current.startsOn)}
          </AppText>
        ) : (
          <AppText>Sin etapa actual</AppText>
        )}
        {state.list?.upcoming.map((s) => (
          <AppText key={s.id}>
            {s.name} · {shortDate(s.startsOn)}
            {s.endsOn ? ` → ${shortDate(previousDate(s.endsOn))}` : ""}
          </AppText>
        ))}
        <Button
          label={state.readError ? "Actualizar etapas" : "Revisar mi cambio"}
          onPress={() =>
            state.readError ? void controller.load() : controller.reviewTruth()
          }
          disabled={state.loading}
        />
      </View>
    );
  if (["uncertain", "confirmed", "blocked"].includes(state.phase))
    return (
      <View accessibilityLiveRegion="polite" style={{ gap: 12 }}>
        <AppText>{state.message}</AppText>
        <Button
          label="Comprobar cambio"
          onPress={() => void controller.recover()}
        />
      </View>
    );
  return (
    <>
      {state.readError ? (
        <View accessibilityLiveRegion="polite" style={{ gap: 12 }}>
          <AppText>
            No pudimos actualizar tus etapas.
            {state.list ? " Mostramos lo último que teníamos." : ""}
          </AppText>
          <Button label="Reintentar" onPress={() => void controller.load()} />
        </View>
      ) : null}
      {state.message ? (
        <AppText accessibilityLiveRegion="polite">{state.message}</AppText>
      ) : null}
    </>
  );
}
export function StageSave({
  shared,
  disabled = false,
  onPress,
  label = "Guardar",
}: {
  shared: NonNullable<ReturnType<typeof useStagesRoute>>;
  disabled?: boolean;
  onPress?: () => void;
  label?: string;
}) {
  const { state, controller } = shared;
  return state.phase === "idle" || isPending(state) ? (
    <SaveButton
      label={label}
      state={isPending(state) ? "saving" : state.notice ? "done" : "idle"}
      disabled={disabled || isLocked(state)}
      onPress={onPress ?? (() => void controller.save())}
      testID="stages-save"
    />
  ) : null;
}
export function StagesToast({
  shared,
}: {
  shared: ReturnType<typeof useStagesRoute>;
}) {
  const notice = shared?.state.notice;
  const controller = shared?.controller;
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => controller?.dismissNotice(), 2400);
    return () => clearTimeout(timer);
  }, [notice, controller]);
  return notice ? <NutritionToast message={notice} state="done" /> : null;
}
export function RefreshingStages({ state }: { state: StagesState }) {
  return state.loading && state.list ? (
    <ActivityIndicator
      size="small"
      accessibilityLabel="Actualizando etapas"
      style={{ alignSelf: "flex-start" }}
    />
  ) : null;
}
export const stageStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: 16,
    paddingVertical: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  spread: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  gap: { gap: 12 },
});
