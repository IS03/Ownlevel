import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
vi.mock("server-only", () => ({}));
vi.mock("./supabase", () => ({ authenticateMobileAccessToken: vi.fn() }));
vi.mock("./nutrition-report-server", async (orig) => ({ ...(await orig<typeof import("./nutrition-report-server")>()), readMobileNutritionFacts: vi.fn() }));
vi.mock("@/lib/phase1/day-log", () => ({ listWeightHistory: vi.fn() }));
vi.mock("@/lib/phase2/training-robust", () => ({ loadCompletedTrainingData: vi.fn() }));
vi.mock("@/lib/progress/training-performance", () => ({ trainingLoadSamples: vi.fn() }));
vi.mock("@/lib/phase2/cordoba-date", () => ({ todayInCordoba: () => "2026-10-16" }));
import { authenticateMobileAccessToken } from "./supabase";
import { readMobileNutritionFacts } from "./nutrition-report-server";
import { listWeightHistory } from "@/lib/phase1/day-log";
import { loadCompletedTrainingData } from "@/lib/phase2/training-robust";
import { trainingLoadSamples } from "@/lib/progress/training-performance";
import { GET } from "@/app/api/mobile/v1/progress/stages/route";
import { legacyStages, stageWindow, summarizeStage, weightPerWeek } from "./progress-stages";
import { parseProgressStages } from "./progress-stages-contract";
import type { NutritionStageV2 } from "./nutrition-stages-contract";
import type { NutritionReportDay } from "@/lib/nutrition/reports-core";

const week = (kcal: number, protein = 130) => [1, 2, 3, 4, 5, 6, 7].map(weekday => ({ weekday, calorieTargetKcal: kcal, proteinTargetG: protein }));
const stage = (o: Partial<NutritionStageV2>): NutritionStageV2 => ({
  id: "11111111-1111-4111-8111-111111111111", name: "Déficit", kind: "deficit", startsOn: "2026-09-29", endsOn: null,
  baseWaterL: 2.5, trainingCalorieDeltaKcal: 300, trainingWaterDeltaL: 0.5, trainingProteinDeltaG: 0, weekdays: week(1900),
  sequenceId: null, position: null, duration: null, status: "current", ...o,
});
const day = (date: string, o: Partial<NutritionReportDay> = {}) => ({ date, hasNutrition: true, isComplete: true, calories: 2000, proteinG: 120, ...o }) as NutritionReportDay;

describe("stage math", () => {
  it("measures from the start to the day before the next stage, never after today", () => {
    expect(stageWindow({ startsOn: "2026-09-29", endsOn: null }, "2026-10-16")).toEqual({ start: "2026-09-29", end: "2026-10-16" });
    expect(stageWindow({ startsOn: "2026-06-16", endsOn: "2026-09-29" }, "2026-10-16")).toEqual({ start: "2026-06-16", end: "2026-09-28" });
    expect(stageWindow({ startsOn: "2024-01-01", endsOn: null }, "2026-10-16").start).toBe("2025-10-16");
  });
  it("weight per week is a least-squares slope and needs 3 weigh-ins over 10+ days", () => {
    expect(weightPerWeek([{ date: "2026-10-01", value: 84 }, { date: "2026-10-08", value: 83.5 }])).toBeNull();
    expect(weightPerWeek([{ date: "2026-10-01", value: 84 }, { date: "2026-10-03", value: 83.9 }, { date: "2026-10-05", value: 83.8 }])).toBeNull();
    expect(weightPerWeek([{ date: "2026-10-01", value: 84 }, { date: "2026-10-08", value: 83.5 }, { date: "2026-10-15", value: 83 }])).toBeCloseTo(-0.5);
  });
  it("keeps missing apart from zero and uses only complete days for averages", () => {
    const s = summarizeStage(stage({}), "2026-10-16", {
      days: [day("2026-10-01", { calories: 1800 }), day("2026-10-02", { calories: 2000 }), day("2026-10-03", { isComplete: false, calories: 500 }), day("2026-10-04", { hasNutrition: false, calories: null })],
      weights: null, trainedDates: ["2026-09-30", "2026-10-02", "2026-10-02", "2026-08-01"],
    });
    expect(s).toMatchObject({ elapsedDays: 18, targetKcal: 1900, eatenKcal: 1900, daysWithMeals: 3, weightPerWeekKg: null, weighIns: 0, trainingDays: 2 });
    expect(s.trainingDaysPerWeek).toBeCloseTo(0.8, 1);
    const none = summarizeStage(stage({}), "2026-10-16", { days: null, weights: [], trainedDates: null });
    expect(none).toMatchObject({ eatenKcal: null, daysWithMeals: 0, trainingDaysPerWeek: null, weightPerWeekKg: null });
    expect(summarizeStage(stage({ startsOn: "2026-10-14" }), "2026-10-16", { days: [], weights: [], trainedDates: [] }).trainingDaysPerWeek).toBeNull();
  });
});

describe("earlier plans", () => {
  it("only cover the dates before the first stage and end where the next one starts", () => {
    const plans = [{ id: "a", name: "Fase 1", effective_from: "2026-03-01", goal_type: "deficit" }, { id: "b", name: " ", effective_from: "2026-06-01", goal_type: null },
      { id: "c", name: "Tarde", effective_from: "2026-10-01", goal_type: null }];
    const list = { today: "2026-10-16", listVersion: 1, current: stage({ startsOn: "2026-09-29" }), upcoming: [], past: [], sequences: [], suggestions: null };
    expect(legacyStages(plans, list, "2026-10-16").map(s => [s.id, s.name, s.kind, s.startsOn, s.endsOn, s.status])).toEqual([
      ["b", "Plan anterior", null, "2026-06-01", "2026-09-29", "past"], ["a", "Fase 1", "deficit", "2026-03-01", "2026-06-01", "past"]]);
  });
  it("take the target from the days when the plan has no weekdays", () => {
    const s = summarizeStage({ ...stage({}), weekdays: [] }, "2026-10-16", { days: [day("2026-10-01", { targetCalories: 1800 }), day("2026-10-02", { targetCalories: 2100 })], weights: [], trainedDates: [] });
    expect(s.targetKcal).toBe(1950);
  });
});

describe("GET /api/mobile/v1/progress/stages", () => {
  const rpc = vi.fn();
  let legacyRows: unknown[] = [];
  const from = vi.fn(() => ({ select: () => ({ order: async () => ({ data: legacyRows, error: null }) }) }));
  const request = (q = "") => new NextRequest(`https://www.ownlevel.fit/api/mobile/v1/progress/stages${q}`, { headers: { authorization: "Bearer token" } });
  const list = {
    today: "2026-10-16", listVersion: 3, sequences: [], suggestions: null,
    current: { ...stage({ endsOn: "2026-12-22" }), id: "11111111-1111-4111-8111-111111111111" },
    upcoming: [{ ...stage({ startsOn: "2026-12-22", kind: "surplus", status: "upcoming" }), id: "33333333-3333-4333-8333-333333333333" }],
    past: [{ ...stage({ startsOn: "2026-06-16", endsOn: "2026-09-29", kind: null, name: "Plan", status: "past", weekdays: week(2300) }), id: "22222222-2222-4222-8222-222222222222" }],
  };
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.mocked(authenticateMobileAccessToken).mockResolvedValue({ userId: "owner", supabase: { rpc, from } } as never);
    legacyRows = [];
    rpc.mockResolvedValue({ data: list, error: null });
    vi.mocked(readMobileNutritionFacts).mockResolvedValue({ dayLogs: [], meals: [], workouts: [] } as never);
    vi.mocked(listWeightHistory).mockResolvedValue([{ id: "w", log_date: "2026-10-01", weight_kg: 84 }] as never);
    vi.mocked(loadCompletedTrainingData).mockResolvedValue({} as never);
    vi.mocked(trainingLoadSamples).mockReturnValue(new Map([["training.load.sessions", [{ date: "2026-10-02", value: 1 }]]]) as never);
  });
  it("summarizes the current and past stages with the owner-scoped reads", async () => {
    const res = await GET(request());
    expect(res.status).toBe(200);
    const body = parseProgressStages(await res.json())!;
    expect(body.stages.map(s => [s.status, s.kind, s.targetKcal])).toEqual([["current", "deficit", 1900], ["past", null, 2300]]);
    expect(body).toMatchObject({ hasUpcoming: true, sources: { nutrition: "ok", body: "ok", training: "ok" } });
    expect(rpc).toHaveBeenCalledWith("mobile_read_nutrition_stages_v2", {}, { get: true });
    expect(readMobileNutritionFacts).toHaveBeenCalledWith(expect.anything(), { start: "2026-06-16", end: "2026-09-28" }, "2026-10-16");
  });
  it("reports an unreadable source as unavailable instead of empty stages", async () => {
    vi.mocked(listWeightHistory).mockRejectedValue(new Error("down"));
    const body = parseProgressStages(await (await GET(request())).json())!;
    expect(body.sources.body).toBe("unavailable");
    expect(body.stages[0].weightPerWeekKg).toBeNull();
  });
  it("shows plans saved before the stages model as read-only stages, with the targets their days applied", async () => {
    rpc.mockResolvedValue({ data: { ...list, current: null, past: [], upcoming: [] }, error: null });
    legacyRows = [{ id: "44444444-4444-4444-8444-444444444444", name: "Fase 2 original", effective_from: "2026-06-29", goal_type: null },
      { id: "55555555-5555-4555-8555-555555555555", name: "Recomposición suave", effective_from: "2026-07-30", goal_type: null }];
    const body = parseProgressStages(await (await GET(request())).json())!;
    expect(body.stages.map(s => [s.name, s.status, s.kind, s.endsOn])).toEqual([["Recomposición suave", "current", null, null], ["Fase 2 original", "past", null, "2026-07-30"]]);
    expect(from).toHaveBeenCalledWith("nutrition_goal_periods");
  });
  it("rejects parameters and is unavailable when the stages list cannot be read", async () => {
    expect((await GET(request("?period=30d"))).status).toBe(400);
    rpc.mockResolvedValue({ data: null, error: { code: "XX000" } });
    expect((await GET(request())).status).toBe(503);
  });
});
