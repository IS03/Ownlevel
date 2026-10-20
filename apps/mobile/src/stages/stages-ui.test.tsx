import { act, fireEvent, render } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { Alert } from "react-native";
import { SafeAreaInsetsContext } from "react-native-safe-area-context";
import { OwnlevelThemeProvider } from "@/design-system";
import { StagesController, type StagesApi } from "./stages-controller";
import { StagesIntentRepository } from "./stages-storage";
import { stagesFixture, stageId } from "./stages-fixture.test-helper";
import { StagePlanScreen } from "./stage-plan-screen";
import { StagesListScreen } from "./stages-list-screen";
import { StageSequenceScreen } from "./stage-sequence-screen";
import { StageActionScreen } from "./stage-action-screen";
import { PlanWeek, applySentence } from "./plan-week";
import { stageDraft, applyDays } from "./stages-model";
import type { NutritionStages } from "@/api/nutrition-stages";
let mockController: StagesController;
const mockPush = jest.fn(),
  mockBack = jest.fn(),
  mockReplace = jest.fn();
let mockParams: Record<string, string> = {};
let mockConfig: unknown = null;
jest.mock("@/nutrition/config-provider", () => ({ useNutritionConfiguration: () => mockConfig }));
jest.mock("./stages-provider", () => ({
  useNutritionStages: () => {
    const React = jest.requireActual<typeof import("react")>("react");
    const state = React.useSyncExternalStore(
      mockController.subscribe,
      mockController.getSnapshot,
    );
    return { state, controller: mockController };
  },
}));
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, back: mockBack, replace: mockReplace }),
  useLocalSearchParams: () => mockParams,
  useNavigation: () => ({ dispatch: jest.fn() }),
  useFocusEffect: () => {},
}));
jest.mock("expo-router/react-navigation", () => ({
  usePreventRemove: () => {},
}));
jest.mock("./kind-picker", () => jest.requireActual("./kind-picker.tsx"));
jest.mock("./start-date-picker", () =>
  jest.requireActual("./start-date-picker.tsx"),
);
jest.mock("@/settings/native-segmented", () =>
  jest.requireActual("@/settings/native-segmented.tsx"),
);
jest.mock("expo-symbols", () => ({ SymbolView: () => null }));
const mockHaptic = jest.fn();
jest.mock("@/platform/haptics", () => ({ triggerHaptic: (event: string) => mockHaptic(event) }));
jest.mock("react-native-gesture-handler/ReanimatedSwipeable", () => {
  const { View } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return {
    __esModule: true,
    default: ({
      children,
      renderRightActions,
    }: {
      children: React.ReactNode;
      renderRightActions: () => React.ReactNode;
    }) => (
      <View>
        {children}
        {renderRightActions()}
      </View>
    ),
  };
});
// Exercise the sheet's local commit/dismiss boundary without relying on native Modal animation callbacks.
jest.mock("@/design-system/app-sheet", () => {
  const { View } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return {
    AppSheet: ({ children }: { children: React.ReactNode }) => (
      <View testID="test-app-sheet">{children}</View>
    ),
    useAppSheetDismiss: () => (after?: () => void) => after?.(),
  };
});
const meta = { durationMs: 1, httpStatus: 200, outcome: "ok" as const };
const ok = <T,>(data: T) => ({ status: "ok" as const, data, meta });
let list: NutritionStages, api: StagesApi;
const element = (children: React.ReactNode) => (
  <SafeAreaInsetsContext.Provider
    value={{ top: 0, bottom: 0, left: 0, right: 0 }}
  >
    <OwnlevelThemeProvider initialMode="light">
      {children}
    </OwnlevelThemeProvider>
  </SafeAreaInsetsContext.Provider>
);
beforeEach(async () => {
  jest.clearAllMocks();
  mockParams = {};
  mockConfig = null;
  list = stagesFixture({ untyped: true });
  const memory = new Map<string, string>();
  api = {
    read: jest.fn<StagesApi["read"]>().mockImplementation(async () => ok(list)),
    write: jest
      .fn<StagesApi["write"]>()
      .mockImplementation(async (i) =>
        ok({ status: "confirmed", operation: i.operation, date: i.date, list }),
      ),
    refreshToday: async () => true,
  };
  mockController = new StagesController(
    api,
    new StagesIntentRepository(
      {
        getItem: async (k) => memory.get(k) ?? null,
        setItem: async (k, v) => {
          memory.set(k, v);
        },
        removeItem: async (k) => {
          memory.delete(k);
        },
      },
      "owner",
    ),
    () => {},
    list,
  );
  await mockController.initialize();
});
describe("Plan week, summary and extras stay in place", () => {
  it("both presentations stay mounted; only the visible one is touchable and read; the notice lives in the summary", async () => {
    mockController.replace(list.current!, "current");
    mockController.changeStage(applyDays(mockController.stage()!, [6, 7], "2200", "120"));
    const view = render(element(<StagePlanScreen />));
    const week = () => view.getByTestId("stage-week", { includeHiddenElements: true });
    const summary = () => view.getByTestId("stage-week-summary", { includeHiddenElements: true });
    expect(week().props.pointerEvents).toBe("auto");
    expect(summary().props).toMatchObject({ pointerEvents: "none", accessibilityElementsHidden: true, importantForAccessibility: "no-hide-descendants" });
    expect(view.getByText(/kcal arriba/)).toBeTruthy();
    await act(async () => fireEvent(view.getByLabelText("Igual todos los días"), "valueChange", true));
    expect(week().props).toMatchObject({ pointerEvents: "none", accessibilityElementsHidden: true });
    expect(summary().props).toMatchObject({ pointerEvents: "box-none", accessibilityElementsHidden: false });
    expect(view.queryByText(/kcal arriba/)).toBeNull();
    expect(view.getByText(/^Tomamos el valor más repetido: /)).toBeTruthy();
    expect(view.getByText(/^Tomamos el valor más repetido: [\d.]+ kcal/).props.children).not.toMatch(/\d{4} kcal/);
    expect(view.getAllByTestId(/^stage-day-bar-/, { includeHiddenElements: true }).length).toBeGreaterThan(0);
    await act(async () => fireEvent(view.getByLabelText("Igual todos los días"), "valueChange", false));
    expect(view.queryByText(/^Tomamos el valor más repetido/)).toBeNull();
    expect(api.write).not.toHaveBeenCalled();
  });
  it("a suggested week that is already uniform keeps its suggested note: the first toggle moves nothing", async () => {
    mockController.replace();
    const view = render(element(<StagePlanScreen />));
    // The intro and hints live in onboarding now: nothing above the week can appear or vanish.
    expect(view.queryByText(/^Calorías sugeridas/)).toBeNull();
    expect(view.queryByText(/^Rige desde hoy/)).toBeNull();
    expect(view.queryByText(/^Elegí qué tipo de plan/)).toBeNull();
    expect(view.getByText(/^kcal arriba · proteína abajo · sugerido$/)).toBeTruthy();
    await act(async () => fireEvent(view.getByLabelText("Igual todos los días"), "valueChange", true));
    expect(mockController.stage()?.suggested).toBe(true);
    expect(view.queryByText(/^Tomamos el valor más repetido/)).toBeNull();
    expect(api.write).not.toHaveBeenCalled();
  });
  it("no water in the plan; Si entrenás shows only the goals the plan has and writes nothing", async () => {
    mockController.replace(list.current!, "current");
    const view = render(element(<StagePlanScreen />));
    expect(view.queryByLabelText("Agua por día")).toBeNull();
    const training = () => view.getByLabelText("Si entrenás");
    expect(training().props.accessibilityState).toMatchObject({ expanded: false });
    expect(training().props.accessibilityValue).toEqual({ text: "+300 kcal · +20 g de proteína" });
    fireEvent.press(training());
    expect(training().props.accessibilityState).toMatchObject({ expanded: true });
    fireEvent.changeText(view.getByLabelText("Extra de proteína (g)"), "25");
    expect(training().props.accessibilityValue).toEqual({ text: "+300 kcal · +25 g de proteína" });
    expect(view.queryByLabelText(/Extra de agua/)).toBeNull();
    // Without a protein goal there is nothing to raise: the field and its summary go away.
    mockController.changeStage(applyDays(mockController.stage()!, [1, 2, 3, 4, 5, 6, 7], "2000", "0"));
    await act(async () => {});
    expect(view.queryByLabelText("Extra de proteína (g)")).toBeNull();
    expect(training().props.accessibilityValue).toEqual({ text: "+300 kcal" });
    expect(api.write).not.toHaveBeenCalled();
  });
});
describe("Editorial stages and day editor", () => {
  it("untyped current plan requires a tap, keeps name/targets and never sends the hint on its own", async () => {
    mockController.replace(list.current!, "current");
    const view = render(element(<StagePlanScreen />));
    expect(view.queryByText("Elegí qué tipo de plan es para guardarlo.")).toBeNull();
    expect(
      view.getByLabelText("Déficit · sugerido").props.accessibilityState
        ?.checked ?? false,
    ).toBe(false);
    expect(
      view.getByLabelText("Guardar").props.accessibilityState.disabled,
    ).toBe(true);
    expect(api.write).not.toHaveBeenCalled();
    fireEvent.press(view.getByText("Recomposición"));
    expect(
      view.getByLabelText("Guardar").props.accessibilityState.disabled,
    ).toBe(false);
    await act(async () => fireEvent.press(view.getByText("Guardar")));
    expect(api.write).toHaveBeenCalledWith(
      expect.objectContaining({
        stage: expect.objectContaining({
          kind: "recomposition",
          name: "Déficit de primavera",
          weekdays: list.current!.weekdays,
        }),
      }),
    );
    expect(view.getByLabelText("Guardado")).toBeTruthy();
    expect(view.getByText("Plan guardado desde hoy.")).toBeTruthy();
  });
  it.each(["Mantener", "Cancelarlas"])(
    "asks about upcoming stages before saving: %s",
    async (button) => {
      list = stagesFixture({ future: true });
      const x = new StagesController(
        api,
        new StagesIntentRepository(
          {
            getItem: async () => null,
            setItem: async () => {},
            removeItem: async () => {},
          },
          "future",
        ),
        () => {},
        list,
      );
      await x.initialize();
      mockController = x;
      mockController.replace(list.current!, "current");
      const alert = jest.spyOn(Alert, "alert");
      const view = render(element(<StagePlanScreen />));
      fireEvent.press(view.getByText("Guardar"));
      expect(api.write).not.toHaveBeenCalled();
      expect(alert.mock.calls.at(-1)?.[1]).toBe(
        "Tenés etapas programadas desde el 22 dic. ¿Las mantenés?",
      );
      await act(async () =>
        alert.mock.calls
          .at(-1)?.[2]
          ?.find((b) => b.text === button)
          ?.onPress?.(),
      );
      expect(api.write).toHaveBeenCalledWith(
        expect.objectContaining({
          future_stages: button === "Mantener" ? "keep" : "cancel",
        }),
      );
      alert.mockRestore();
    },
  );
  it("read-only legacy stages say Plan and retain real names; past duplicate opens a choice, never edits history", () => {
    list.past = [
      {
        ...list.current!,
        id: stageId(3),
        name: "Primer plan",
        startsOn: "2026-06-01",
        endsOn: list.current!.startsOn,
        status: "past",
      },
    ];
    const view = render(element(<StagesListScreen />));
    expect(view.getByText("Déficit de primavera")).toBeTruthy();
    expect(view.getAllByText(/Plan ·/).length).toBeGreaterThan(0);
    fireEvent.press(view.getByText("Duplicar"));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/settings/stage-action",
      params: { source: stageId(3) },
    });
    expect(api.write).not.toHaveBeenCalled();
  });
  it("a plan saved before stages shows as the current plan and turns into a stage from today with the same numbers", () => {
    list.current = null;
    const weekdays = Array.from({ length: 7 }, (_, i) => ({ weekday: i + 1, calorieTargetKcal: 1900, proteinTargetG: 130 }));
    mockConfig = { state: { config: { plan: { status: "ok", data: { source: "legacy", name: "Recomposición suave", baseWaterL: 3,
      trainingCalorieDeltaKcal: 0, trainingWaterDeltaL: 0, weekdays, id: null, effectiveFrom: null, version: "1" } } } } };
    const view = render(element(<StagesListScreen />));
    expect(view.getByText("Tu plan actual")).toBeTruthy();
    expect(view.queryByText(/Todavía no tenés una etapa/)).toBeNull();
    fireEvent.press(view.getByRole("button", { name: "Pasarlo a etapa" }));
    expect(mockPush).toHaveBeenCalledWith("/settings/stage-plan");
    const stage = mockController.stage()!;
    expect(stage).toMatchObject({ name: "Recomposición suave", kind: null, sourceWasUntyped: true, trainingCalorieDeltaKcal: "0", trainingProteinDeltaG: "0" });
    expect(stage.weekdays.every((d) => d.kcal === "1900" && d.protein === "130")).toBe(true);
    expect(api.write).not.toHaveBeenCalled();
  });
  it("without a legacy plan (default or already a stage) nothing extra is shown", () => {
    list.current = null;
    mockConfig = { state: { config: { plan: { status: "ok", data: { source: "default", name: "Plan", baseWaterL: null,
      trainingCalorieDeltaKcal: 0, trainingWaterDeltaL: 0, weekdays: [], id: null, effectiveFrom: null, version: "1" } } } } };
    const view = render(element(<StagesListScreen />));
    expect(view.queryByText("Tu plan actual")).toBeNull();
    expect(view.getByText(/Todavía no tenés una etapa/)).toBeTruthy();
  });
  it("empty loading never becomes a false empty or unavailable state", () => {
    mockController = new StagesController(
      api,
      new StagesIntentRepository(
        {
          getItem: async () => null,
          setItem: async () => {},
          removeItem: async () => {},
        },
        "empty",
      ),
      () => {},
    );
    const view = render(element(<StagesListScreen />));
    expect(view.getByTestId("stages-skeleton")).toBeTruthy();
    expect(view.queryByText(/Todavía no tenés/)).toBeNull();
  });
  it("failed read shows neutral retry, not a false empty", async () => {
    jest
      .mocked(api.read)
      .mockResolvedValueOnce({
        status: "unavailable",
        reason: "network",
        meta,
      });
    await mockController.load();
    const view = render(element(<StagesListScreen />));
    expect(view.getByText(/No pudimos actualizar tus etapas/)).toBeTruthy();
    expect(view.getByText("Reintentar")).toBeTruthy();
    expect(view.queryByText("No hay etapas programadas.")).toBeNull();
  });
  it("a day without targets has dashes and no fake bar; the real zero protein stays visible", () => {
    const stage = stageDraft(list, null, list.current!);
    stage.weekdays[0] = { weekday: 1, kcal: "", protein: "" };
    stage.weekdays[1].protein = "0";
    const view = render(
      element(
        <PlanWeek
          stage={stage}
          today={5}
          same={false}
          disabled={false}
          onChange={() => {}}
        />,
      ),
    );
    expect(view.queryByTestId("stage-day-bar-1")).toBeNull();
    expect(view.getByTestId("stage-day-bar-2")).toBeTruthy();
    expect(view.getByText("0 g")).toBeTruthy();
    expect(view.getAllByText("—").length).toBeGreaterThan(0);
  });
  it("the AppSheet applies chosen weekdays locally only; result sentence uses the same values", () => {
    const stage = stageDraft(list, null, list.current!),
      change = jest.fn();
    const view = render(
      element(
        <PlanWeek
          stage={stage}
          today={5}
          same={false}
          disabled={false}
          onChange={change}
        />,
      ),
    );
    fireEvent.press(view.getByLabelText(/Sábado: /));
    fireEvent.changeText(view.getByLabelText("Calorías (kcal)"), "2200");
    fireEvent.changeText(view.getByLabelText("Proteína (g)"), "120");
    fireEvent.press(view.getByLabelText("Aplicar a domingo"));
    expect(
      view.getByText("Sábado y domingo quedan en 2.200 kcal · 120 g."),
    ).toBeTruthy();
    expect(change).not.toHaveBeenCalled();
    fireEvent.press(view.getByLabelText("Listo"));
    expect(change).toHaveBeenCalledWith(
      applyDays(stage, [6, 7], "2200", "120"),
    );
    expect(api.write).not.toHaveBeenCalled();
    expect(applySentence([6, 7], "2200", "120")).toBe(
      "Sábado y domingo quedan en 2.200 kcal · 120 g.",
    );
  });
  it("ET4 layout: totals on their own line, stages never under a layout animation, stepper in its own row", () => {
    mockController.sequence(0);
    const view = render(element(<StageSequenceScreen />));
    expect(view.getByTestId("sequence-totals").props.children).toBeTruthy();
    for (const stage of view.getAllByTestId(/^sequence-stage-\d+$/)) {
      // Native type menu and Semanas/Meses live inside: no entering/exiting/layout animation may own their frames.
      expect(stage.props.entering).toBeUndefined();
      expect(stage.props.exiting).toBeUndefined();
      expect(stage.props.layout).toBeUndefined();
    }
    expect(view.getAllByTestId("duration-stepper").length).toBe(view.getAllByTestId(/^sequence-stage-\d+$/).length);
    expect(api.write).not.toHaveBeenCalled();
  });
  it("ET4 controls: Inicio opens in place without a separate today button, steps vibrate, Quitar asks first", () => {
    mockController.sequence(0);
    const view = render(element(<StageSequenceScreen />));
    const start = () => view.getByLabelText("Inicio");
    expect(start().props.accessibilityState).toMatchObject({ expanded: false });
    fireEvent.press(start());
    expect(start().props.accessibilityState).toMatchObject({ expanded: true });
    expect(view.queryByText("Empezar hoy", { exact: true })).toBeTruthy(); // the row value, not a button
    expect(view.queryByLabelText("Empezar hoy")).toBeNull();
    mockHaptic.mockClear();
    fireEvent.press(view.getAllByLabelText("Alargar etapa")[0]);
    expect(mockHaptic).toHaveBeenCalledWith("stepperChange");
    const count = view.getAllByTestId(/^sequence-stage-\d+$/).length;
    const alert = jest.spyOn(Alert, "alert");
    fireEvent.press(view.getByLabelText("Quitar etapa 1"));
    expect(alert).toHaveBeenCalledWith("¿Quitar esta etapa?", expect.any(String), expect.any(Array));
    expect(view.getAllByTestId(/^sequence-stage-\d+$/).length).toBe(count);
    act(() => alert.mock.calls.at(-1)?.[2]?.find((b) => b.text === "Quitar")?.onPress?.());
    expect(view.queryAllByTestId(/^sequence-stage-\d+$/).length).toBe(count - 1);
    // Targets are one row per stage that opens the plan editor; no trailing "complete everything" text.
    fireEvent.press(view.getAllByLabelText(/^Objetivos de /)[0]);
    expect(mockPush).toHaveBeenCalledWith("/settings/stage-plan");
    expect(view.queryByText(/^Completá el nombre, el tipo/)).toBeNull();
    expect(api.write).not.toHaveBeenCalled();
  });
  it("ET4 detects existing schedule before POST, exposes cutting as a separate explicit action", () => {
    list.upcoming = stagesFixture({ future: true }).upcoming;
    mockController.sequence(0);
    const view = render(element(<StageSequenceScreen />));
    expect(
      view.getByText(/Ya tenés etapas programadas desde el 22 dic/),
    ).toBeTruthy();
    expect(
      view.getByLabelText("Guardar secuencia").props.accessibilityState
        .disabled,
    ).toBe(true);
    expect(view.getByText("Cortar esa secuencia")).toBeTruthy();
    expect(api.write).not.toHaveBeenCalled();
  });
  it("a typical plan preloads a sequence, not a write; recomposition is clearly only suggested", () => {
    const view = render(element(<StageActionScreen />));
    fireEvent.press(view.getByLabelText("Recomposición"));
    expect(mockController.getSnapshot().draft).toMatchObject({
      mode: "sequence",
      sequence: {
        stages: [
          {
            stage: { kind: "recomposition", suggested: true },
            duration: { unit: "months", value: 6 },
          },
        ],
      },
    });
    expect(api.write).not.toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith("/settings/stage-sequence");
  });
  it("deleting a middle stage shows the server message unchanged", async () => {
    const future = stagesFixture({ future: true }).upcoming[0];
    list.upcoming = [future];
    mockController.future(future);
    jest.mocked(api.write).mockResolvedValueOnce({
      status: "validation",
      message: "Borrá desde la última etapa o cortá la secuencia.",
      meta,
    });
    const view = render(element(<StagePlanScreen />));
    const alert = jest.spyOn(Alert, "alert");
    fireEvent.press(view.getByText("Borrar etapa"));
    await act(async () =>
      alert.mock.calls
        .at(-1)?.[2]
        ?.find((b) => b.text === "Borrar")
        ?.onPress?.(),
    );
    expect(
      view.getByText("Borrá desde la última etapa o cortá la secuencia."),
    ).toBeTruthy();
    alert.mockRestore();
  });
});
