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
describe("Editorial stages and day editor", () => {
  it("untyped current plan requires a tap, keeps name/targets and never sends the hint on its own", async () => {
    mockController.replace(list.current!, "current");
    const view = render(element(<StagePlanScreen />));
    expect(
      view.getByText("Elegí qué tipo de plan es para guardarlo."),
    ).toBeTruthy();
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
