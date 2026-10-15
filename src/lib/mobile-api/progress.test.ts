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
