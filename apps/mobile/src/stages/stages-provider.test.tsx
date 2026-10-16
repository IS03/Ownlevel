import { act, render, waitFor } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Text } from "react-native";
import { useEffect } from "react";
import type { MobileApiClient } from "@/api/client";
import { OwnlevelThemeProvider } from "@/design-system";
import { NutritionConfigurationProvider } from "@/nutrition/config-provider";
import { NutritionStagesProvider, useNutritionStages } from "./stages-provider";
import { rememberStages } from "./stages-cache";
import { stagesFixture } from "./stages-fixture.test-helper";
const mockRead = jest.fn<MobileApiClient["read"]>(),
  mockRequest = jest.fn<MobileApiClient["request"]>();
let mockClient = { read: mockRead, request: mockRequest },
  mockUser = "owner";
jest.mock("@/api", () => ({ useMobileApi: () => ({ client: mockClient }) }));
jest.mock("@/auth", () => ({
  useMobileAuth: () => ({ session: { user: { id: mockUser } } }),
}));
jest.mock("expo-symbols", () => ({ SymbolView: () => null }));
jest.mock("@react-native-async-storage/async-storage", () =>
  jest.requireActual(
    "@react-native-async-storage/async-storage/jest/async-storage-mock",
  ),
);
let shared: ReturnType<typeof useNutritionStages>;
function Probe() {
  const value = useNutritionStages();
  useEffect(() => {
    shared = value;
  });
  return (
    <Text testID="stage-scope">
      {value
        ? `${value.state.phase}:${value.state.list?.current?.name ?? "sin datos"}`
        : "ninguno"}
    </Text>
  );
}
const element = () => (
  <OwnlevelThemeProvider initialMode="light">
    <NutritionConfigurationProvider>
      <NutritionStagesProvider>
        <Probe />
      </NutritionStagesProvider>
    </NutritionConfigurationProvider>
  </OwnlevelThemeProvider>
);
beforeEach(async () => {
  await AsyncStorage.clear();
  jest.clearAllMocks();
  mockUser = "owner";
  mockClient = { read: mockRead, request: mockRequest };
  shared = null;
});
describe("Shared stage provider", () => {
  it("adopts the Settings memory reading before any network request, and hides it synchronously for another user", async () => {
    const view = render(element());
    await waitFor(() => expect(shared?.state.phase).toBe("idle"));
    await act(async () =>
      rememberStages(mockClient as MobileApiClient, "owner", stagesFixture()),
    );
    expect(view.getByText("idle:Déficit de primavera")).toBeTruthy();
    expect(mockRead).not.toHaveBeenCalled();
    mockUser = "other";
    view.rerender(element());
    expect(view.queryByText("idle:Déficit de primavera")).toBeNull();
    await waitFor(() => expect(view.getByText("idle:sin datos")).toBeTruthy());
    expect(shared?.state.intent).toBeNull();
  });
  it("restores only the owner pending intent without transmitting it automatically", async () => {
    rememberStages(mockClient as MobileApiClient, "owner", stagesFixture());
    const view = render(element());
    await waitFor(() => expect(shared?.state.phase).toBe("idle"));
    mockRequest.mockResolvedValueOnce({
      status: "unavailable",
      reason: "network",
      meta: { durationMs: 1, httpStatus: null, outcome: "unavailable" },
    } as never);
    await act(async () => {
      shared!.controller.sequence(0);
      await shared!.controller.save();
    });
    expect(shared?.state.phase).toBe("uncertain");
    const key = shared!.state.intent!.intent.idempotencyKey;
    mockUser = "other";
    view.rerender(element());
    await waitFor(() => expect(shared?.state.phase).toBe("idle"));
    expect(shared?.state.intent).toBeNull();
    expect(mockRequest).toHaveBeenCalledTimes(1);
    mockUser = "owner";
    view.rerender(element());
    await waitFor(() => expect(shared?.state.phase).toBe("uncertain"));
    expect(shared?.state.intent?.intent.idempotencyKey).toBe(key);
    expect(mockRequest).toHaveBeenCalledTimes(1);
  });
});
