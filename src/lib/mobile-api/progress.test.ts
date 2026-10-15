import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const clock = vi.hoisted(() => ({ today: "2026-10-05" }));
vi.mock("server-only", () => ({}));
vi.mock("../phase2/cordoba-date", () => ({ todayInCordoba: () => clock.today }));
vi.mock("@/lib/phase2/cordoba-date", () => ({ todayInCordoba: () => clock.today }));
vi.mock("./supabase", () => ({ authenticateMobileAccessToken: vi.fn() }));
vi.mock("@/lib/phase1/profile", () => ({ getMyProfile: vi.fn() }));
vi.mock("@/lib/phase1/day-log", () => ({ listWeightHistory: vi.fn() }));
vi.mock("@/lib/body-measurements", () => ({ listBodyMeasurements: vi.fn() }));
vi.mock("@/lib/phase2/training-robust", () => ({ loadCompletedTrainingData: vi.fn() }));
vi.mock("@/lib/phase2/training", () => ({ listRoutines: vi.fn() }));
import { authenticateMobileAccessToken } from "./supabase";
import { getMyProfile } from "@/lib/phase1/profile";
import { listWeightHistory } from "@/lib/phase1/day-log";
import { listBodyMeasurements } from "@/lib/body-measurements";
import { loadCompletedTrainingData } from "@/lib/phase2/training-robust";
import { listRoutines } from "@/lib/phase2/training";
import { GET as habitsGET } from "@/app/api/mobile/v1/progress/habits/route";
import { GET as overviewGET } from "@/app/api/mobile/v1/progress/route";
import { GET as bodyGET } from "@/app/api/mobile/v1/progress/body/route";
import { GET as metricsGET } from "@/app/api/mobile/v1/progress/metrics/route";
import { addProgressIsoDays } from "@/lib/progress/analytics";
import { comparisonDto, progressQueryFromParams, resolveMobileProgressPeriod } from "./progress-server";
import { habitWeekRange, parseProgressHabitWeek, parseProgressBody, parseProgressComparison, parseProgressMetrics, parseProgressOverview, type ProgressBody, type ProgressMetrics, type ProgressOverview } from "./progress-contract";
import type { NutritionReportDayLogFact } from "../nutrition/reports-core";

const TODAY = "2026-10-05";
const d = (offset: number) => addProgressIsoDays(TODAY, offset);
const ids = { steps: "b1000000-0000-4000-8000-000000000001", water: "b1000000-0000-4000-8000-000000000002", sleep: "b1000000-0000-4000-8000-000000000003",
  custom: "b1000000-0000-4000-8000-000000000004", archived: "b1000000-0000-4000-8000-000000000005" };
type Value = { metric_id: string; metric_date: string; value: number };
let values: Value[] = [];
let dayLogs: NutritionReportDayLogFact[] = [];
let nutritionFails = false;
const rpcCalls: { name: string; args: unknown }[] = [];
const definitions = () => [
  { id: ids.steps, system_key: "steps", name: "Pasos", unit: "pasos", value_type: "integer", target_value: 10000, sort_order: 0, is_active: true, archived_at: null },
  { id: ids.water, system_key: "water", name: "Agua", unit: "L", value_type: "decimal", target_value: "2.5000", sort_order: 1, is_active: true, archived_at: null },
  { id: ids.sleep, system_key: "sleep", name: "Sueño", unit: "min", value_type: "duration", target_value: 480, sort_order: 2, is_active: true, archived_at: null },
  { id: ids.custom, system_key: null, name: "Lectura", unit: "páginas", value_type: "integer", target_value: null, sort_order: 3, is_active: true, archived_at: null },
  { id: ids.archived, system_key: "mate", name: "Mate", unit: "L", value_type: "decimal", target_value: null, sort_order: 4, is_active: false, archived_at: "2026-09-01T00:00:00Z" },
];
let metricDefinitions: ReturnType<typeof definitions> | null = null;
let metricsFail = false;
const readOwners: string[] = [];
const log = (date: string, over: Partial<NutritionReportDayLogFact> = {}): NutritionReportDayLogFact => ({ id: date, log_date: date, total_calories_consumed: 2000, total_protein_g: 120, total_carbs_g: 0, total_fat_g: 0,
  nutrition_target_kcal_snapshot: 2100, protein_target_g_snapshot: 130, estimated_expenditure_kcal_snapshot: 2400, delta_vs_nutrition_target: -100, energy_balance_kcal: -400,
  water_target_l_snapshot: null, water_l: null, mate_l: null, steps: null, work_effective_snapshot: null, gym_effective_snapshot: null, gym_source_snapshot: null,
  nutrition_goal_period_id: null, nutrition_plan_period_id: null, goal_type_snapshot: "lose", ...over });

function supabase() {
  return {
    async rpc(name: string, args: { p_start: string; p_end: string; p_expected_today: string }) {
      rpcCalls.push({ name, args });
      if (name === "ensure_user_metrics") return { data: null, error: null };
      if (name !== "mobile_read_nutrition_report") throw new Error(name);
      if (nutritionFails) return { data: null, error: { code: "XX000" } };
      const logs = dayLogs.filter(l => l.log_date >= args.p_start && l.log_date <= args.p_end);
      return { data: { status: "ok", today: TODAY, start: args.p_start, end: args.p_end, dayLogs: logs,
        meals: logs.map(l => ({ day_log_id: l.id, entry_kind: "meal", final_calories: l.total_calories_consumed, final_protein_g: l.total_protein_g, final_carbs_g: 0, final_fat_g: 0, source_type: "manual", deleted_at: null })),
        workouts: [], goalNames: [] }, error: null };
    },
    from(table: string) {
      const filters: ((r: Value) => boolean)[] = [];
      const builder = {
        select: () => builder,
        eq(c: string, v: string) { if (c === "user_id") readOwners.push(v); if (table === "user_metrics") return Promise.resolve({ data: metricsFail ? null : metricDefinitions ?? definitions(), error: metricsFail ? { code: "XX000" } : null }); if (c !== "user_id") filters.push(r => (r as never)[c] === v); return builder; },
        gte(c: keyof Value, v: string) { filters.push(r => String(r[c]) >= v); return builder; },
        lte(c: keyof Value, v: string) { filters.push(r => String(r[c]) <= v); return builder; },
        order: () => builder,
        range(from: number, to: number) {
          const rows = values.filter(r => filters.every(f => f(r))).sort((a, b) => a.metric_date.localeCompare(b.metric_date) || a.metric_id.localeCompare(b.metric_id));
          return Promise.resolve({ data: rows.slice(from, Math.min(to + 1, from + 1000)), error: null });
        },
      };
      return builder;
    },
  };
}
const measurement = (date: string, over: Record<string, unknown> = {}) => ({ id: `m-${date}`, user_id: "owner", measured_on: date, waist_cm: null, abdomen_cm: null, chest_cm: null, arm_cm: null,
  arm_right_cm: null, arm_left_cm: null, thigh_cm: null, thigh_right_cm: null, thigh_left_cm: null, calf_right_cm: null, calf_left_cm: null, hip_cm: null, condition: null, notes: null,
  legacy_import_source: null, legacy_import_id: null, import_run_id: null, quality_status: "verified", quality_note: null, source_payload: null, created_at: "", updated_at: "", ...over });
const request = (path: string, token = "Bearer token") => new NextRequest(`https://www.ownlevel.fit/api/mobile/v1/${path}`, { headers: { authorization: token } });
async function json<T>(response: Response, parse: (v: unknown) => T | undefined): Promise<T> {
  expect(response.status).toBe(200);
  const body = parse(await response.json());
  expect(body).toBeDefined();
  return body!;
}

beforeEach(() => {
  vi.clearAllMocks(); rpcCalls.length = 0; nutritionFails = false; clock.today = TODAY; metricDefinitions = null; metricsFail = false; readOwners.length = 0;
  values = []; dayLogs = [];
  vi.mocked(authenticateMobileAccessToken).mockResolvedValue({ userId: "owner", supabase: supabase() } as never);
  vi.mocked(getMyProfile).mockResolvedValue({ current_weight_kg: 80 } as never);
  vi.mocked(listWeightHistory).mockResolvedValue([]);
  vi.mocked(listBodyMeasurements).mockResolvedValue([]);
  vi.mocked(loadCompletedTrainingData).mockResolvedValue({ sessions: [], sessionExercises: [], sets: [], dateByDayLog: new Map() });
  vi.mocked(listRoutines).mockResolvedValue([]);
});

describe("Progress period model (canonical resolver)", () => {
  it.each([["7", 7], ["14", 14], ["30", 30]] as const)("%s días ends today and compares with the equivalent previous window", (period, days) => {
    const { period: p } = resolveMobileProgressPeriod({ period }, TODAY);
    expect(p).toMatchObject({ start: d(1 - days), end: TODAY, days, previousEnd: d(-days), previousStart: d(1 - 2 * days), includesToday: true });
  });
  it("3m/6m/1y use calendar months and the engine buckets (day ≤21, week ≤183, month after)", () => {
    expect(resolveMobileProgressPeriod({ period: "3m" }, TODAY).period).toMatchObject({ start: "2026-07-06", bucket: "week" });
    expect(resolveMobileProgressPeriod({ period: "6m" }, TODAY).period).toMatchObject({ start: "2026-04-06", days: 183, bucket: "week" });
    expect(resolveMobileProgressPeriod({ period: "1y" }, TODAY).period).toMatchObject({ start: "2025-10-06", days: 365, bucket: "month" });
    expect(resolveMobileProgressPeriod({ period: "14" }, TODAY).period.bucket).toBe("day");
  });
  it("custom: up to 366 days, trimmed to today; longer or fully future ranges are rejected", () => {
    expect(resolveMobileProgressPeriod({ period: "custom", from: "2026-09-01", to: "2026-12-31" }, TODAY).period).toMatchObject({ start: "2026-09-01", end: TODAY, includesToday: true });
    expect(resolveMobileProgressPeriod({ period: "custom", from: "2025-10-05", to: TODAY }, TODAY).period.days).toBe(366);
    expect(() => resolveMobileProgressPeriod({ period: "custom", from: "2025-10-04", to: TODAY }, TODAY)).toThrow(/366/);
    expect(() => resolveMobileProgressPeriod({ period: "custom", from: "2026-11-01", to: "2026-11-05" }, TODAY)).toThrow();
  });
  it("explicit comparison range (EXPAND): replaces the reference; absent keeps the previous equivalent window", () => {
    const q = progressQueryFromParams(new URLSearchParams("period=custom&from=2026-10-01&to=2026-10-05&compareFrom=2025-10-01&compareTo=2025-10-05"));
    expect(q).toEqual({ period: "custom", from: "2026-10-01", to: "2026-10-05", compare: { start: "2025-10-01", end: "2025-10-05" } });
    expect(resolveMobileProgressPeriod(q, TODAY).period).toMatchObject({ start: "2026-10-01", end: TODAY, previousStart: "2025-10-01", previousEnd: "2025-10-05" });
    // A reference of a different length is allowed (March vs August); averages compare, the client labels totals.
    expect(resolveMobileProgressPeriod({ period: "30", compare: { start: "2026-03-01", end: "2026-03-31" } }, TODAY).period).toMatchObject({ previousStart: "2026-03-01", previousEnd: "2026-03-31" });
    expect(progressQueryFromParams(new URLSearchParams("period=30"))).toEqual({ period: "30" });
  });
  it("rejects incomplete, inverted, future or too long comparison ranges", () => {
    expect(() => progressQueryFromParams(new URLSearchParams("period=30&compareFrom=2026-09-01"))).toThrow();
    expect(() => progressQueryFromParams(new URLSearchParams("period=30&compareFrom=2026-09-10&compareTo=2026-09-01"))).toThrow();
    expect(() => progressQueryFromParams(new URLSearchParams("period=30&compareFrom=2026-09-01&compareTo=2026-09-01&compareTo=2026-09-02"))).toThrow(/repetido/);
    expect(() => resolveMobileProgressPeriod({ period: "30", compare: { start: "2026-10-01", end: "2026-10-09" } }, TODAY)).toThrow();
    expect(() => resolveMobileProgressPeriod({ period: "30", compare: { start: "2024-01-01", end: "2025-01-02" } }, TODAY)).toThrow(/366/);
  });
  it("comparison semantics: no percent over a zero baseline, no deltas when not comparable", () => {
    const base = { eligibility: { status: "comparable", reason: "eligible" }, valueA: 5, valueB: 0, deltaAbsolute: 5, deltaPercent: Infinity, change: "increased" } as never;
    expect(comparisonDto(base)).toMatchObject({ deltaAbsolute: 5, deltaPercent: null });
    expect(comparisonDto({ ...(base as object), eligibility: { status: "insufficient_data", reason: "previous_period_empty" }, valueB: null } as never))
      .toMatchObject({ status: "insufficient_data", deltaAbsolute: null, deltaPercent: null });
    expect(parseProgressComparison({ status: "comparable", reason: "eligible", current: 1, previous: 0, deltaAbsolute: 1, deltaPercent: 10, change: "increased" })).toBeUndefined();
  });
});

describe("GET /progress/body", () => {
  it("sparse data stays insufficient; profile weight is never an observation; 2 obs = limited; ≥3 consistent = direction", async () => {
    let body = await json(await bodyGET(request("progress/body")), parseProgressBody);
    expect(body.metrics).toEqual([]); // profile weight only: no dated observation
    vi.mocked(listWeightHistory).mockResolvedValue([{ id: "w1", log_date: d(-3), weight_kg: 81 }]);
    body = await json(await bodyGET(request("progress/body")), parseProgressBody);
    expect(body.metrics[0]).toMatchObject({ key: "body.weight", change: null, trend: "unavailable", confidence: "unavailable", observations: [{ date: d(-3), value: 81 }] });
    vi.mocked(listWeightHistory).mockResolvedValue([{ id: "w1", log_date: d(-10), weight_kg: 81 }, { id: "w2", log_date: d(-3), weight_kg: 80 }]);
    body = await json(await bodyGET(request("progress/body")), parseProgressBody);
    expect(body.metrics[0]).toMatchObject({ change: -1, trend: "decreased", confidence: "limited" });
    vi.mocked(listWeightHistory).mockResolvedValue([81, 80.5, 80.5, 79.8].map((w, i) => ({ id: `w${i}`, log_date: d(-20 + i * 5), weight_kg: w })));
    body = await json(await bodyGET(request("progress/body")), parseProgressBody);
    expect(body.metrics[0]).toMatchObject({ trend: "decreased", confidence: "supported", first: { value: 81 }, last: { value: 79.8 } });
    expect(body.metrics[0].change).toBeCloseTo(-1.2);
    vi.mocked(listWeightHistory).mockResolvedValue([80, 79, 78, 81].map((w, i) => ({ id: `w${i}`, log_date: d(-20 + i * 5), weight_kg: w })));
    body = await json(await bodyGET(request("progress/body")), parseProgressBody);
    expect(body.metrics[0]).toMatchObject({ trend: "variable", confidence: "supported", change: 1 });
  });
  it("suspect measurements are excluded and counted; imported ones count and are flagged; previous period change comes from the engine", async () => {
    vi.mocked(listBodyMeasurements).mockResolvedValue([
      measurement(d(-40), { waist_cm: 90 }), measurement(d(-35), { waist_cm: 89 }),
      measurement(d(-20), { waist_cm: 88, legacy_import_source: "sheet" }), measurement(d(-10), { waist_cm: 70, quality_status: "suspect" }), measurement(d(-2), { waist_cm: 87 }),
    ] as never);
    const body: ProgressBody = await json(await bodyGET(request("progress/body")), parseProgressBody);
    const waist = body.metrics.find(m => m.key === "body.waist")!;
    expect(body.excludedSuspect).toBe(1);
    expect(waist.observations.map(o => o.value)).toEqual([88, 87]);
    expect(waist.observations[0]).toMatchObject({ imported: true, provenanceLabel: "Importado · sheet" });
    expect(waist).toMatchObject({ change: -1, referenceChange: -1, referenceCount: 2, unit: "cm" });
    expect(JSON.stringify(body)).not.toContain("percent");
  });
});

describe("GET /progress/metrics", () => {
  it("generic safe analytics for every type: zero is a value, missing is excluded, archived is analyzable, target is current", async () => {
    for (let i = 0; i < 30; i += 1) {
      if (i % 3 !== 1) values.push({ metric_id: ids.steps, metric_date: d(-i), value: i === 0 ? 4000 : i % 5 === 0 ? 0 : 8000 });
      values.push({ metric_id: ids.sleep, metric_date: d(-i), value: 420 + i });
    }
    values.push({ metric_id: ids.archived, metric_date: d(-5), value: 0.5 }, { metric_id: ids.archived, metric_date: d(-6), value: 1 });
    const steps: ProgressMetrics = await json(await metricsGET(request(`progress/metrics?metric=${ids.steps}`)), parseProgressMetrics);
    expect(steps.metric).toMatchObject({ id: ids.steps, currentTarget: 10000, valueType: "integer" });
    expect(steps.summary).toMatchObject({ minimum: 0, maximum: 8000, eligibleDays: 29 }); // today in progress is excluded
    expect(steps.summary!.registeredDays).toBe(19);
    expect(steps.series).toHaveLength(5); // 30 days → weekly buckets
    expect(steps.comparison).toMatchObject({ status: "insufficient_data", deltaAbsolute: null, deltaPercent: null }); // empty previous
    const water: ProgressMetrics = await json(await metricsGET(request(`progress/metrics?period=7&metric=${ids.water}`)), parseProgressMetrics);
    expect(water.metric!.currentTarget).toBe(2.5);
    expect(water.summary).toMatchObject({ average: null, registeredDays: 0, coverageRatio: 0 });
    expect(water.series.every(p => p.value === null && p.samples === 0)).toBe(true); // gaps, never 0
    const archived: ProgressMetrics = await json(await metricsGET(request(`progress/metrics?metric=${ids.archived}`)), parseProgressMetrics);
    expect(archived.metric).toMatchObject({ isActive: false, name: "Mate" });
    expect(archived.summary).toMatchObject({ average: 0.75, registeredDays: 2 });
  });
  it("baseline zero gives no percent; 1 year reads > 1000 rows and buckets by month", async () => {
    for (let i = 0; i < 730; i += 1) {
      values.push({ metric_id: ids.custom, metric_date: d(-i), value: i >= 365 ? 0 : 10 });
      values.push({ metric_id: ids.steps, metric_date: d(-i), value: 5000 });
    }
    const custom: ProgressMetrics = await json(await metricsGET(request(`progress/metrics?period=1y&metric=${ids.custom}`)), parseProgressMetrics);
    expect(values.length).toBeGreaterThan(1000);
    expect(custom.summary).toMatchObject({ average: 10, registeredDays: 364 });
    expect(custom.previous).toMatchObject({ average: 0, registeredDays: 365 });
    expect(custom.comparison).toMatchObject({ status: "comparable", current: 10, previous: 0, deltaAbsolute: 10, deltaPercent: null });
    expect(custom.series.length).toBeGreaterThanOrEqual(12);
    expect(custom.period.bucket).toBe("month");
  });
  it("rejects invalid params and unauthenticated calls", async () => {
    expect((await metricsGET(request("progress/metrics?period=3w"))).status).toBe(400);
    expect((await metricsGET(request("progress/metrics?metric=x"))).status).toBe(400);
    expect((await metricsGET(request("progress/metrics?user_id=other"))).status).toBe(400);
    expect((await overviewGET(request("progress", ""))).status).toBe(401);
  });
});

describe("GET /progress (overview)", () => {
  it("composes body, nutrition and metrics with the shared Progress Home selection; Training is pending", async () => {
    for (let i = 1; i <= 60; i += 1) dayLogs.push(log(d(-i), { total_calories_consumed: i < 30 ? 2200 : 2000, total_protein_g: i < 30 ? 130 : 110 }));
    for (let i = 0; i < 60; i += 1) values.push({ metric_id: ids.steps, metric_date: d(-i), value: i < 30 ? 9000 : 6000 });
    for (let i = 0; i < 10; i += 1) values.push({ metric_id: ids.custom, metric_date: d(-i), value: 5 });
    vi.mocked(listWeightHistory).mockResolvedValue([{ id: "w1", log_date: d(-25), weight_kg: 82 }, { id: "w2", log_date: d(-5), weight_kg: 80.5 }]);
    const o: ProgressOverview = await json(await overviewGET(request("progress")), parseProgressOverview);
    expect(o.period).toMatchObject({ preset: "30", days: 30, end: TODAY });
    expect(o.training.status === "ok" && o.training.data).toMatchObject({ sessions: 0, trainingDays: 0, sets: 0, minutes: 0 });
    expect(o.evolution[0]).toMatchObject({ id: "body.weight", destination: { kind: "body" } });
    expect(o.nutrition.status === "ok" && o.nutrition.data).toMatchObject({ averageKcal: 2200, averageProteinG: 130, averageTargetKcal: 2100,
      calories: { status: "comparable", current: 2200, previous: 2000, deltaAbsolute: 200, deltaPercent: 10 } });
    // Nutrition reuses the SAME report RPC, once per period.
    const reports = rpcCalls.filter(c => c.name === "mobile_read_nutrition_report").map(c => c.args);
    expect(reports).toEqual([{ p_start: d(-29), p_end: TODAY, p_expected_today: TODAY }, { p_start: d(-59), p_end: d(-30), p_expected_today: TODAY }]);
    const items = o.metrics.status === "ok" ? o.metrics.data.items : [];
    expect(items.map(i => i.name)).toEqual(["Pasos", "Lectura"]);
    expect(items[0]).toMatchObject({ average: 9000, comparison: { previous: 6000, deltaAbsolute: 3000, deltaPercent: 50 } });
    expect(items[1].coverage.ratio).toBeLessThan(0.5);
    expect(o.changes.length).toBeLessThanOrEqual(3);
    expect(JSON.stringify(o)).not.toMatch(/user_id|day_log_id|href/);
  });
  it("each domain is independently available: a failing source is unavailable, never zero or empty", async () => {
    nutritionFails = true;
    vi.mocked(listWeightHistory).mockRejectedValue(new Error("db"));
    vi.mocked(loadCompletedTrainingData).mockRejectedValue(new Error("db"));
    const o: ProgressOverview = await json(await overviewGET(request("progress?period=7")), parseProgressOverview);
    expect(o.nutrition).toEqual({ status: "unavailable" });
    expect(o.body).toEqual({ status: "unavailable" });
    expect(o.training).toEqual({ status: "unavailable" });
    expect(o.metrics.status).toBe("ok");
  });
  it("sparks only on request (EXPAND): per-bucket gaps stay null, comparison buckets only while comparing", async () => {
    for (const i of [1, 2, 4, 10]) dayLogs.push(log(d(-i), { total_calories_consumed: 1800 + i * 10 }));
    vi.mocked(listWeightHistory).mockResolvedValue([{ id: "w0", log_date: d(-10), weight_kg: 81 }, { id: "w1", log_date: d(-6), weight_kg: 82 }, { id: "w2", log_date: d(-2), weight_kg: 80.5 }]);
    const plain = await overviewGET(request(`progress?period=custom&from=${d(-6)}&to=${TODAY}`));
    expect("sparks" in (await plain.json())).toBe(false);
    const o: ProgressOverview = await json(await overviewGET(request(`progress?period=custom&from=${d(-6)}&to=${TODAY}&spark=1`)), parseProgressOverview);
    // 7 day buckets: a day without a complete log or a weighing is null, never 0; training zero is real.
    expect(o.sparks!.nutrition!.current.map(p => p.value)).toEqual([null, null, 1840, null, 1820, 1810, null]);
    expect(o.sparks!.weight).toMatchObject({ first: 82, last: 80.5, referenceLast: null, reference: null });
    expect(o.sparks!.weight!.current.map(p => p.value)).toEqual([82, null, null, null, 80.5, null, null]);
    expect(o.sparks!.training!.current.every(p => p.value === 0)).toBe(true);
    const c: ProgressOverview = await json(await overviewGET(request(`progress?period=custom&from=${d(-6)}&to=${TODAY}&compareFrom=${d(-13)}&compareTo=${d(-7)}&spark=1`)), parseProgressOverview);
    expect(c.sparks!.nutrition!.reference!.map(p => p.value)).toEqual([null, null, null, 1900, null, null, null]);
    expect(c.sparks!.weight).toMatchObject({ referenceLast: 81 });
    expect((await overviewGET(request("progress?spark=yes"))).status).toBe(400);
    expect((await overviewGET(request("progress?spark=1&spark=1"))).status).toBe(400);
  });
});

describe("GET /progress/habits (additive calendar-week read)", () => {
  it("returns all active metrics in user order, including missing and zero, against the actual previous week", async () => {
    clock.today = "2026-10-14";
    const extra = { ...definitions()[3], id: "b1000000-0000-4000-8000-000000000006", sort_order: 5, name: "Extra" };
    const extra2 = { ...extra, id: "b1000000-0000-4000-8000-000000000007", sort_order: 6, name: "Otra" };
    metricDefinitions = [...definitions().reverse(), extra, extra2];
    values = [
      { metric_id: ids.water, metric_date: "2026-10-12", value: 2 }, { metric_id: ids.water, metric_date: "2026-10-13", value: 3 },
      { metric_id: ids.water, metric_date: "2026-10-05", value: 1 }, { metric_id: ids.water, metric_date: "2026-10-06", value: 1 },
      { metric_id: ids.water, metric_date: "2026-10-14", value: 999 }, // today is excluded
      { metric_id: ids.water, metric_date: "2026-10-15", value: 999 }, // future is excluded
      { metric_id: ids.steps, metric_date: "2026-10-12", value: 0 },
    ];
    const data = await json(await habitsGET(request("progress/habits")), parseProgressHabitWeek);
    expect(data).toMatchObject({ weekStart: "2026-10-12", weekEnd: "2026-10-18", previousWeekStart: "2026-10-05", previousWeekEnd: "2026-10-11", completedDays: 2 });
    expect(data.items.map(item => item.id)).toEqual([ids.steps, ids.water, ids.sleep, ids.custom, extra.id, extra2.id]);
    expect(data.items[1]).toMatchObject({ average: 2.5, coverage: { registered: 2, eligible: 2, ratio: 1 }, comparison: { status: "comparable", previous: 1, change: "increased" } });
    expect(data.items[0]).toMatchObject({ average: 0, coverage: { registered: 1 }, comparison: { status: "insufficient_data" } });
    expect(data.items[2]).toMatchObject({ average: null, coverage: { registered: 0 }, comparison: { status: "insufficient_data" } });
    expect(readOwners.length).toBeGreaterThanOrEqual(2);
    expect(new Set(readOwners)).toEqual(new Set(["owner"]));
    expect(parseProgressHabitWeek({ ...data, previousWeekStart: "2026-10-09" })).toBeUndefined();
    expect(parseProgressHabitWeek({ ...data, items: [...data.items, data.items[0]] })).toBeUndefined();
  });

  it("Monday does not reuse Sunday or count today's values; empty differs from a failed read", async () => {
    values = [{ metric_id: ids.water, metric_date: TODAY, value: 99 }];
    const data = await json(await habitsGET(request("progress/habits")), parseProgressHabitWeek);
    expect(data.completedDays).toBe(0);
    expect(data.items.every(item => item.average === null && item.coverage.registered === 0 && item.coverage.eligible === 0)).toBe(true);
    metricDefinitions = definitions().map(item => ({ ...item, is_active: false }));
    expect((await json(await habitsGET(request("progress/habits")), parseProgressHabitWeek)).items).toEqual([]);
    metricsFail = true;
    const failed = await habitsGET(request("progress/habits"));
    expect(failed.status).toBe(503);
    expect(await failed.json()).toEqual({ error: "DATA_UNAVAILABLE" });
    expect(habitWeekRange("2026-10-11")).toMatchObject({ weekStart: "2026-10-05", weekEnd: "2026-10-11", completedDays: 6 });
    expect(habitWeekRange("2026-10-12")).toMatchObject({ weekStart: "2026-10-12", previousWeekStart: "2026-10-05", completedDays: 0 });
  });

  it("requires bearer identity and rejects arbitrary identity or range parameters", async () => {
    expect((await habitsGET(request("progress/habits", ""))).status).toBe(401);
    expect(authenticateMobileAccessToken).not.toHaveBeenCalled();
    expect((await habitsGET(request("progress/habits?userId=another"))).status).toBe(400);
    expect((await habitsGET(request("progress/habits?weekStart=2026-10-05"))).status).toBe(400);
    expect(readOwners).toEqual([]);
  });
});

describe('Progress inPeriod read EXPAND', () => {
  const eid = 'e1000000-0000-4000-8000-000000000001';
  function history(last: number, firstMode = 'Peso total', lastMode = firstMode) {
    const dates = ['2026-10-05', '2026-10-03', '2026-10-01']; // Deliberately newest first; middle is a peak, never the baseline.
    const source = { sessions: dates.map((date, i) => ({ id: `session-${i}`, user_id: 'owner', day_log_id: date, status: 'completed', started_at: `${date}T10:00:00Z`, ended_at: `${date}T11:00:00Z`, routine_id: null, routine_name_snapshot: null, session_name: null, energy_level: null, pain_level: null, performance_level: null })),
      sessionExercises: dates.map((_, i) => ({ id: `exercise-${i}`, exercise_id: eid, workout_session_id: `session-${i}`, nombre_snapshot: 'Press', grupo_muscular_snapshot: 'pecho', muscle_group_label_snapshot: null, weight_mode_snapshot: i === 0 ? lastMode : firstMode, is_completed: true })),
      sets: dates.map((_, i) => ({ id: `set-${i}`, workout_session_exercise_id: `exercise-${i}`, set_number: 1, is_completed: true, actual_reps: 8, actual_weight_kg: i === 0 ? last : i === 1 ? 100 : 50 })), dateByDayLog: new Map(dates.map(date => [date, date])) };
    // An exercise with just one session must stay outside the new comparison list.
    source.sessionExercises.push({ ...source.sessionExercises[0], id: 'single', exercise_id: 'single', nombre_snapshot: 'Una sesión' });
    source.sets.push({ ...source.sets[0], id: 'single-set', workout_session_exercise_id: 'single' });
    return source as unknown as Awaited<ReturnType<typeof loadCompletedTrainingData>>;
  }
  it.each([[60, 'improved'], [40, 'declined'], [50, 'stable']] as const)('compares first against last (%s → %s), never the peak or the previous period', async (last, status) => {
    const { GET: trainingGET } = await import('@/app/api/mobile/v1/progress/training/route');
    const { parseProgressTraining } = await import('./progress-contract');
    vi.mocked(loadCompletedTrainingData).mockResolvedValue(history(last));
    const response = await trainingGET(request('progress/training?period=custom&from=2026-10-01&to=2026-10-05&inPeriod=1'));
    const raw = await response.json(), t = parseProgressTraining(raw)!;
    expect(response.status).toBe(200); expect(t).toBeDefined();
    expect(t.inPeriod!.exercises).toHaveLength(1);
    expect(t.inPeriod!.exercises[0]).toMatchObject({ id: eid, status, sessions: 3, firstDate: '2026-10-01', lastDate: '2026-10-05', signal: { referenceValue: 50, currentValue: last } });
    expect(t.exercises.find(e => e.id === 'single')?.sessions).toBe(1);
    expect(loadCompletedTrainingData).toHaveBeenCalledTimes(1);
    expect(vi.mocked(loadCompletedTrainingData).mock.calls[0][0]).toMatchObject({ userId: 'owner' });
    expect(t.inPeriod!.improved + t.inPeriod!.stable + t.inPeriod!.declined + t.inPeriod!.insufficient).toBe(1);
    expect(parseProgressTraining({ ...raw, inPeriod: { ...raw.inPeriod, improved: 99 } })).toBeUndefined();
    const o = await json(await overviewGET(request('progress?period=custom&from=2026-10-01&to=2026-10-05&spark=1&inPeriod=1')), parseProgressOverview);
    expect(o.inPeriod).toEqual({ improved: status === 'improved' ? 1 : 0, comparable: 1 }); expect(o.sparks).toBeDefined();
  });
  it('keeps old responses identical and rejects invalid/repeated inPeriod on both endpoints', async () => {
    const { GET: trainingGET } = await import('@/app/api/mobile/v1/progress/training/route');
    for (const [get, path] of [[overviewGET, 'progress'], [trainingGET, 'progress/training']] as const) {
      const plain = await get(request(path)); expect(plain.status).toBe(200); expect(await plain.json()).not.toHaveProperty('inPeriod');
      expect((await get(request(`${path}?inPeriod=2`))).status).toBe(400);
      expect((await get(request(`${path}?inPeriod=1&inPeriod=1`))).status).toBe(400);
    }
  });
  it('counts that differ from the summary never break the read; blocks without valid sets are not first or last', async () => {
    const { GET: trainingGET } = await import('@/app/api/mobile/v1/progress/training/route');
    const source = history(60);
    // Newest session: exercise not flagged completed (the summary still counts its completed set).
    (source.sessionExercises[0] as { is_completed: boolean }).is_completed = false;
    // Oldest session: the block exists but its only set has no reps.
    (source.sets[2] as { actual_reps: number | null }).actual_reps = null;
    vi.mocked(loadCompletedTrainingData).mockResolvedValue(source);
    const response = await trainingGET(request('progress/training?period=custom&from=2026-10-01&to=2026-10-05&inPeriod=1'));
    expect(response.status).toBe(200);
    const t = await response.json();
    expect(t.exercises.find((e: { id: string }) => e.id === eid).sessions).toBe(3);
    // Only the middle session is usable: one session, so it stays out of the list.
    expect(t.inPeriod.exercises).toEqual([]);
  });
  it('a changed mode is non-comparable and unavailable Training gives overview null', async () => {
    const { GET: trainingGET } = await import('@/app/api/mobile/v1/progress/training/route');
    vi.mocked(loadCompletedTrainingData).mockResolvedValue(history(60, 'Peso total', 'Por mancuerna'));
    const response = await trainingGET(request('progress/training?inPeriod=1'));
    expect(response.status).toBe(200); const t = await response.json();
    expect(t.inPeriod).toMatchObject({ improved: 0, stable: 0, declined: 0, insufficient: 1, exercises: [{ status: 'insufficient_data', reason: 'different_weight_mode', signal: null }] });
    vi.mocked(loadCompletedTrainingData).mockRejectedValue(new Error('offline'));
    const o = await json(await overviewGET(request('progress?inPeriod=1')), parseProgressOverview);
    expect(o.inPeriod).toBeNull(); expect(o.training.status).toBe('unavailable');
  });
});

describe('Exercise charts read EXPAND', () => {
  const eid = 'e1000000-0000-4000-8000-000000000001';
  const path = 'progress/training/exercises/' + eid + '?period=custom&from=2026-10-01&to=2026-10-05';
  async function get(query = '') {
    const { GET } = await import('@/app/api/mobile/v1/progress/training/exercises/[id]/route');
    return GET(request(path + query), { params: Promise.resolve({ id: eid }) });
  }
  function fixture(mode = 'Peso total') {
    const dates = ['2026-10-05', '2026-10-03', '2026-10-01', '2026-09-05'];
    const source = { sessions: dates.map((date, i) => ({ id: `session-${i}`, day_log_id: date, status: 'completed', started_at: `${date}T10:00:00Z`, ended_at: `${date}T11:00:00Z`, routine_id: null, routine_name_snapshot: 'PULL', session_name: null })),
      sessionExercises: dates.map((_, i) => ({ id: `exercise-${i}`, exercise_id: eid, workout_session_id: `session-${i}`, nombre_snapshot: 'Press', grupo_muscular_snapshot: 'pecho', muscle_group_label_snapshot: null, weight_mode_snapshot: mode, is_completed: true })),
      sets: dates.map((_, i) => ({ id: `set-${i}`, workout_session_exercise_id: `exercise-${i}`, set_number: 1, is_completed: true, actual_reps: i === 1 ? 15 : i === 2 ? 7 : 10, actual_weight_kg: i === 3 ? 54 : i === 2 ? 57 : 60 })), dateByDayLog: new Map(dates.map(date => [date, date])) };
    vi.mocked(loadCompletedTrainingData).mockResolvedValue(source as never);
    return source;
  }
  it('keeps the old shape without charts and rejects invalid/repeated flags', async () => {
    fixture(); const plain = await get(); expect(plain.status).toBe(200); expect(await plain.json()).not.toHaveProperty('charts');
    expect((await get('&charts=2')).status).toBe(400); expect((await get('&charts=1&charts=1')).status).toBe(400);
  });
  it('computes Epley per session, rounds to 0.5 kg, leaves >12 reps as a gap and only includes reference when requested', async () => {
    const source = fixture();
    source.sets.push({ ...source.sets[0], id: 'heavier-single', set_number: 2, actual_reps: 1, actual_weight_kg: 70 });
    const { parseProgressTrainingExercise } = await import('./progress-contract');
    const data = await json(await get('&charts=1'), parseProgressTrainingExercise);
    const rm = data.charts!.measures[0];
    expect(data.charts!.strategy).toBe('load_reps'); expect(rm).toMatchObject({ key: 'estimated_1rm', derived: true, unit: 'kg', reference: null });
    expect(rm.points.map(p => [p.date, p.value])).toEqual([['2026-10-01', 70.5], ['2026-10-05', 80]]);
    expect(rm.points.at(-1)!.best).toEqual({ reps: 10, weightKg: 60 });
    expect(data.charts!.measures[1].points).toHaveLength(3);
    expect(data.charts!.measures[1].points.at(-1)).toMatchObject({ value: 70, best: { reps: 1, weightKg: 70 } });
    expect(loadCompletedTrainingData).toHaveBeenCalledTimes(1);
    expect(loadCompletedTrainingData).toHaveBeenCalledWith(expect.objectContaining({ userId: 'owner' }));
    expect(authenticateMobileAccessToken).toHaveBeenCalledWith('token');
    const compared = await json(await get('&charts=1&compareFrom=2026-09-01&compareTo=2026-09-05'), parseProgressTrainingExercise);
    expect(compared.charts!.measures[0].reference).toEqual([{ date: '2026-09-05', sessionId: 'session-3', value: 72, best: { reps: 10, weightKg: 54 } }]);
    // Derived labels, range, ordering and the kg-only rule are contract boundaries.
    for (const charts of [
      { ...data.charts!, strategy: 'unit_reps' },
      { ...data.charts!, measures: data.charts!.measures.map(m => ({ ...m, derived: false })) },
      { ...data.charts!, measures: data.charts!.measures.map(m => ({ ...m, points: [...m.points].reverse() })) },
      { ...data.charts!, measures: data.charts!.measures.map(m => ({ ...m, points: m.points.map(p => ({ ...p, date: '2020-01-01' })) })) },
    ]) expect(parseProgressTrainingExercise({ ...data, charts })).toBeUndefined();
  });
  it.each([
    ['Lingotes (no kg)', 'unit_reps', ['best_set', 'volume'], [60, 600]],
    ['Peso corporal', 'bodyweight_reps', ['best_set', 'total_reps'], [10, 10]],
    ['Tiempo (segundos)', 'time', ['best_time', 'total_time'], [10, 10]],
    ['Carga manual', 'unsupported', [], []],
  ] as const)('%s uses its own measures, without 1RM', async (mode, strategy, keys, lastValues) => {
    const source = fixture(mode);
    if (strategy === 'bodyweight_reps') source.sets.forEach(s => { s.actual_weight_kg = null as never; });
    const { parseProgressTrainingExercise } = await import('./progress-contract');
    const data = await json(await get('&charts=1'), parseProgressTrainingExercise);
    expect(data.charts!.strategy).toBe(strategy);
    expect(data.charts!.measures.map(m => m.key)).toEqual(keys);
    expect(data.charts!.measures.map(m => m.points.at(-1)!.value)).toEqual(lastValues);
    expect(data.charts!.measures.every(m => !m.derived && m.reference === null)).toBe(true);
  });
});

describe('Progress nutrition timing read', () => {
  const path = 'progress/nutrition/timing?period=custom&from=2026-10-01&to=2026-10-05';
  type Meal = { id: string; user_id: string; consumed_at: string | null; raw_input: string | null; entry_kind: string; deleted_at: string | null; final_calories: number | null; final_protein_g: number | null; day_logs: { user_id: string; log_date: string } };
  const meal = (id: string, time: string | null, kcal: number | null, protein: number | null, extra: Partial<Meal> = {}): Meal => ({ id, user_id: 'owner', consumed_at: time ? `2026-10-05T${time}:00-03:00` : null, raw_input: null, entry_kind: 'meal', deleted_at: null, final_calories: kcal, final_protein_g: protein, day_logs: { user_id: 'owner', log_date: '2026-10-05' }, ...extra });
  const get = async (suffix = '') => (await import('@/app/api/mobile/v1/progress/nutrition/timing/route')).GET(request(path + suffix));
  function repository(rows: Meal[], failed = false, owner = 'owner') {
    const pages: number[] = [], owners: string[] = [];
    vi.mocked(authenticateMobileAccessToken).mockResolvedValue({ userId: owner, supabase: { from: (table: string) => {
      expect(table).toBe('meal_entries'); const filters: ((r: Meal) => boolean)[] = [];
      const value = (r: Meal, key: string) => key.startsWith('day_logs.') ? r.day_logs[key.slice(9) as keyof Meal['day_logs']] : r[key as keyof Meal];
      const builder = { select: () => builder, order: () => builder,
        eq: (key: string, v: string) => { if (key.endsWith('user_id')) owners.push(v); filters.push(r => value(r, key) === v); return builder; },
        is: (key: string, v: null) => { filters.push(r => value(r, key) === v); return builder; },
        gte: (key: string, v: string) => { filters.push(r => String(value(r, key)) >= v); return builder; },
        lte: (key: string, v: string) => { filters.push(r => String(value(r, key)) <= v); return builder; },
        range: (from: number) => { pages.push(from); return Promise.resolve({ data: failed ? null : rows.filter(r => filters.every(f => f(r))).sort((a, b) => a.id.localeCompare(b.id)).slice(from, from + 2), error: failed ? { code: '42501' } : null }); },
      }; return builder;
    } } } as never);
    return { pages, owners };
  }
  it('uses Córdoba boundaries, the day date and shared time provenance; pages every row and excludes other owners / deleted / legacy', async () => {
    const rows = [meal('a', '00:30', 100, 10), meal('b', '04:59', 200, 20), meal('c', '05:00', 300, 30), meal('d', '11:00', 400, null), meal('e', '15:00', null, 40), meal('f', '20:00', 500, 50),
      meal('g', '09:00', 999, 999, { raw_input: '{"originalTimeKnown":false}' }), meal('h', null, 999, 999), meal('i', '09:00', 999, 999, { entry_kind: 'legacy_daily_summary' }),
      meal('j', '09:00', 999, 999, { deleted_at: '2026-10-05T12:00:00Z' }), meal('k', '09:00', 999, 999, { user_id: 'another' }),
      meal('l', '09:00', 999, 999, { day_logs: { user_id: 'another', log_date: '2026-10-05' } }),
      meal('m', '20:00', 100, 5, { day_logs: { user_id: 'owner', log_date: '2026-09-05' } }),
    ];
    const { pages, owners } = repository(rows);
    const { parseProgressNutritionTiming } = await import('./progress-contract');
    const dto = await json(await get(), parseProgressNutritionTiming);
    expect(dto.current).toMatchObject({ meals: 8, mealsWithTime: 6, kcal: 1500, proteinG: 150 });
    expect(dto.current.bands.map(b => [b.key, b.kcal, b.proteinG])).toEqual([['morning', 300, 30], ['midday', 400, 0], ['afternoon', 0, 40], ['night', 800, 80]]);
    expect(dto.reference).toBeNull(); expect(pages).toEqual([0, 2, 4, 6, 8, 9]); expect(new Set(owners)).toEqual(new Set(['owner']));
    expect(authenticateMobileAccessToken).toHaveBeenCalledWith('token');
    const compared = await json(await get('&compareFrom=2026-09-01&compareTo=2026-09-05'), parseProgressNutritionTiming);
    expect(compared.reference).toMatchObject({ meals: 1, mealsWithTime: 1, kcal: 100, proteinG: 5 });
    expect(compared.reference!.bands[3].kcalShare).toBe(1); // consumed_at is October, log_date is September.
    for (const current of [
      { ...dto.current, mealsWithTime: 99 }, { ...dto.current, kcal: 1 }, { ...dto.current, bands: [...dto.current.bands].reverse() },
      { ...dto.current, bands: dto.current.bands.map(b => ({ ...b, kcalShare: 1.2 })) },
    ]) expect(parseProgressNutritionTiming({ ...dto, current })).toBeUndefined();
  });
  it('zero/unknown totals have null shares, and a failed read is unavailable rather than empty', async () => {
    repository([meal('a', '05:00', 0, null), meal('b', '20:00', null, 0)]);
    const { parseProgressNutritionTiming } = await import('./progress-contract');
    const dto = await json(await get(), parseProgressNutritionTiming);
    expect(dto.current).toMatchObject({ meals: 2, mealsWithTime: 2, kcal: 0, proteinG: 0 });
    expect(dto.current.bands.every(b => b.kcalShare === null && b.proteinShare === null)).toBe(true);
    repository([], true); const failed = await get(); expect(failed.status).toBe(503); expect(await failed.json()).toEqual({ error: 'DATA_UNAVAILABLE' });
  });
  it('requires Bearer identity and rejects invalid, repeated and arbitrary identity parameters before reading', async () => {
    const { pages } = repository([]);
    const { GET } = await import('@/app/api/mobile/v1/progress/nutrition/timing/route');
    expect((await GET(request(path, ''))).status).toBe(401);
    for (const suffix of ['&userId=another', '&period=7', '&compareFrom=2026-09-01', '&compareFrom=2026-09-05&compareTo=2026-09-01', '&compareFrom=2026-11-01&compareTo=2026-11-05']) expect((await get(suffix)).status).toBe(400);
    expect(pages).toEqual([]);
    repository([meal('owner-meal', '12:00', 500, 30)], false, 'another');
    const { parseProgressNutritionTiming } = await import('./progress-contract');
    const other = await json(await get(), parseProgressNutritionTiming);
    expect(other.current).toMatchObject({ meals: 0, mealsWithTime: 0, kcal: 0, proteinG: 0 });
  });
});

describe('Progress explore read (stage 2, step 1)', () => {
  const get = async (q: string) => (await import('@/app/api/mobile/v1/progress/explore/route')).GET(request(`progress/explore?period=custom&from=${d(-4)}&to=${TODAY}&${q}`));
  const read = async (q: string) => json(await get(q), (await import('./progress-explore-contract')).parseProgressExplore);
  const ex = (id: string, sessionId: string, muscle: string, name = id) => ({ id: `${sessionId}-${id}`, exercise_id: id, workout_session_id: sessionId, nombre_snapshot: name, grupo_muscular_snapshot: muscle, muscle_group_label_snapshot: null, weight_mode_snapshot: 'Peso total', is_completed: true });
  const sets = (exerciseRow: string, n: number) => Array.from({ length: n }, (_, i) => ({ id: `${exerciseRow}-s${i}`, workout_session_exercise_id: exerciseRow, set_number: i + 1, is_completed: true, actual_reps: 10, actual_weight_kg: 50 }));
  // 1 oct (work): pecho 3 + piernas 2 · 3 oct (off): pecho 4 · 5 oct (work): piernas 5. 4 oct is a work day without training (a real 0).
  function training() {
    const sessions = [[d(-4), 'r1', 'PUSH'], [d(-2), 'r1', 'PUSH'], [d(0), null, null]].map(([date, routine, name], i) => ({ id: `ses${i}`, user_id: 'owner', day_log_id: date, status: 'completed',
      started_at: `${date}T10:00:00Z`, ended_at: `${date}T11:00:00Z`, routine_id: routine, routine_name_snapshot: name, session_name: null, energy_level: null, pain_level: null, performance_level: null }));
    const exercises = [ex('chest', 'ses0', 'pecho'), ex('legs', 'ses0', 'piernas'), ex('chest', 'ses1', 'pecho'), ex('legs', 'ses2', 'piernas')];
    const allSets = [...sets('ses0-chest', 3), ...sets('ses0-legs', 2), ...sets('ses1-chest', 4), ...sets('ses2-legs', 5)];
    vi.mocked(loadCompletedTrainingData).mockResolvedValue({ sessions, sessionExercises: exercises, sets: allSets, dateByDayLog: new Map([d(-4), d(-2), d(0)].map(x => [x, x])) } as never);
    dayLogs = [log(d(-4), { work_effective_snapshot: true }), log(d(-2), { work_effective_snapshot: false }), log(d(-1), { work_effective_snapshot: true }), log(d(0), { work_effective_snapshot: true })];
  }
  it('training: a sum where 0 is real, filtered to work days, broken down by muscle and in time', async () => {
    training();
    const e = await read('measure=training.sets&breakdown=muscle&days=work&series=1');
    expect(e.measure).toMatchObject({ key: 'training.sets', unit: 'series', aggregation: 'sum', derived: false });
    expect(e.current.value).toBe(10); // 3 + 2 + 5; the off day (3 oct) is out
    expect(e.current.coverage).toEqual({ days: 2, eligible: 3 }); // work days: 1, 4 and 5 oct (2 oct has no day log: in neither group)
    expect(e.current.groups.map(g => [g.key, g.value])).toEqual([['piernas', 7], ['pecho', 3]]);
    expect(e.current.series!.map(b => b.value)).toEqual([5, null, null, 0, 5]); // 4 oct = worked, did not train = 0
    expect(e.reference).toBeNull();
    const w = await read('measure=training.sessions&breakdown=weekday');
    expect(w.current.groups.map(g => g.value)).toEqual([1, null, null, 1, 0, 1, 0]); // Mon 5, Thu 1 and Sat 3 trained; Fri 2 and Sun 4 are real zeros; Tue/Wed are not in the period
  });
  it('nutrition: average per complete day; by moment a missing moment is 0 that day; unlabeled meals counted apart; today never counts', async () => {
    training();
    for (const l of dayLogs) l.total_protein_g = l.log_date === d(-4) ? 100 : 140;
    const mealsFixture = [['m1', d(-4), 'breakfast', 40], ['m2', d(-4), 'dinner', 60], ['m3', d(-2), 'lunch', 120], ['m4', d(-2), null, 20], ['m5', d(0), 'dinner', 999]];
    const base = supabase();
    vi.mocked(authenticateMobileAccessToken).mockResolvedValue({ userId: 'owner', supabase: { ...base, from: (table: string) => table !== 'meal_entries' ? base.from(table) : (() => {
      const b = { select: () => b, eq: () => b, is: () => b, order: () => b, gte: () => b, lte: () => b,
        range: (from: number) => Promise.resolve({ data: from ? [] : mealsFixture.map(([id, date, label, p]) => ({ id, user_id: 'owner', consumed_at: null, raw_input: null, entry_kind: 'meal', deleted_at: null, meal_label: label,
          final_calories: 500, final_protein_g: p, final_carbs_g: null, final_fat_g: null, day_logs: { user_id: 'owner', log_date: date } })), error: null }) };
      return b; })() } } as never);
    const e = await read('measure=nutrition.protein&breakdown=meal_moment&days=training');
    expect(e.measure).toMatchObject({ unit: 'g', aggregation: 'average' });
    expect(e.current.coverage).toEqual({ days: 2, eligible: 2 }); // training days 1 and 3 oct; 5 oct (today) never counts
    expect(e.current.value).toBe(120); // (100 + 140) / 2
    expect(Object.fromEntries(e.current.groups.map(g => [g.key, g.value]))).toEqual({ breakfast: 20, lunch: 60, snack: 0, dinner: 30, extra: 0 });
    expect(e.current.unassigned).toBe(1);
  });
  it('metrics: a recorded 0 counts and a missing day does not; comparison reads the chosen range', async () => {
    values = [{ metric_id: ids.steps, metric_date: d(-4), value: 0 }, { metric_id: ids.steps, metric_date: d(-3), value: 8000 }, { metric_id: ids.steps, metric_date: d(0), value: 9999 },
      { metric_id: ids.steps, metric_date: d(-10), value: 5000 }];
    const e = await read(`measure=metric.${ids.steps}&compareFrom=${d(-11)}&compareTo=${d(-5)}`);
    expect(e.measure).toMatchObject({ label: 'Pasos', unit: 'pasos', valueType: 'integer', aggregation: 'average' });
    expect(e.current).toMatchObject({ value: 4000, coverage: { days: 2, eligible: 4 } });
    expect(e.reference).toMatchObject({ value: 5000, coverage: { days: 1, eligible: 7 } });
  });
  it('body: last record and first-to-last change, never a breakdown', async () => {
    vi.mocked(listWeightHistory).mockResolvedValue([{ id: 'w1', log_date: d(-4), weight_kg: 82 }, { id: 'w2', log_date: d(-1), weight_kg: 80.5 }]);
    const e = await read('measure=body.weight');
    expect(e.current).toMatchObject({ value: 80.5, change: -1.5, groups: [], unassigned: 0 });
    expect((await get('measure=body.weight&breakdown=weekday')).status).toBe(400);
  });
  it('rejects unknown measures and combinations the measure does not admit', async () => {
    for (const q of ['', 'measure=training.volume', 'measure=metric.not-a-uuid', 'measure=training.minutes&breakdown=muscle', 'measure=training.sets&days=training',
      'measure=nutrition.kcal&breakdown=weekday&series=1', 'measure=nutrition.kcal&series=2', 'measure=nutrition.kcal&breakdown=routine', 'measure=training.sets&measure=training.sets'])
      expect((await get(q)).status).toBe(400);
    expect((await get(`measure=metric.${ids.archived.replace('5', '9')}`)).status).toBe(400);
  });
});
