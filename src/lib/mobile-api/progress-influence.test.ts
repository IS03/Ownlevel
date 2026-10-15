import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const clock = vi.hoisted(() => ({ today: "2026-10-15" }));
vi.mock("@/lib/phase2/cordoba-date", () => ({ todayInCordoba: () => clock.today }));
vi.mock("./supabase", () => ({ authenticateMobileAccessToken: vi.fn() }));
vi.mock("@/lib/phase2/training-robust", () => ({ loadCompletedTrainingData: vi.fn() }));
import { addProgressIsoDays } from "@/lib/progress/analytics";
import { loadCompletedTrainingData } from "@/lib/phase2/training-robust";
import type { NutritionReportDayLogFact } from "@/lib/nutrition/reports-core";
import { GET } from "@/app/api/mobile/v1/progress/influence/route";
import { GET as suggestedGET } from "@/app/api/mobile/v1/progress/influence/suggested/route";
import { MobileApiUnauthorizedError } from "./auth";
import { authenticateMobileAccessToken } from "./supabase";
import { parseProgressInfluence, parseProgressInfluenceSuggested, type InfluenceDefinition, type ProgressInfluence } from "./progress-influence-contract";
import { calculateInfluence } from "./progress-influence-model";
import { influenceReadRanges } from "./progress-influence";

const TODAY = "2026-10-15", START = "2026-09-01";
const date = (n: number) => addProgressIsoDays(START, n);
const range = (n: number) => ({ start: START, end: date(n - 1) });
const ids = { sleep: "b1000000-0000-4000-8000-000000000001", steps: "b1000000-0000-4000-8000-000000000002", water: "b1000000-0000-4000-8000-000000000003" };
const metric = (key: keyof typeof ids) => `metric.${ids[key]}`;
const definition: InfluenceDefinition = { split: metric("steps"), cut: "median", lag: 0, outcome: metric("sleep") };
const map = (xs: (number | boolean)[], offset = 0) => new Map(xs.map((v, i) => [date(i + offset), v]));
const sequence = (n: number) => Array.from({ length: n }, (_, i) => i);

describe("Influence pairing and evidence (pure)", () => {
  it("lag 1 pairs D with D+1 including the last day's tail, but never today's incomplete outcome", () => {
    const d = { ...definition, cut: "gte:7", lag: 1 as const };
    const result = calculateInfluence(range(14), TODAY, d, map(sequence(14)), map(sequence(15)));
    expect(result).toMatchObject({ status: "ok", pairs: 14, low: { average: 4 }, high: { average: 11 } });
    expect(result.high.days.at(-1)).toBe(date(13));
    const capped = calculateInfluence(range(14), date(14), d, map(sequence(14)), map(sequence(16)));
    expect(capped).toMatchObject({ status: "insufficient", pairs: 13 });
    expect(capped.high.days).not.toContain(date(13));
  });
  it("computes the median only on pairs and sends ties to the high group", () => {
    const xs = [0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1];
    const result = calculateInfluence(range(16), TODAY, definition, map([...xs, 1000]), map(sequence(15)));
    expect(result).toMatchObject({ status: "ok", pairs: 15, cut: 1 });
    expect(result.low.days).toHaveLength(7);
    expect(result.high.days).toEqual(sequence(8).map(i => date(i + 7)));
  });
  it("13 pairs have coverage without averages and identify the scarcer source in the unshifted period", () => {
    const xs = map(sequence(14)), ys = map(sequence(13));
    const result = calculateInfluence(range(14), TODAY, definition, xs, ys);
    expect(result).toMatchObject({ status: "insufficient", pairs: 13, needed: 14, perGroupNeeded: 5, missing: "outcome" });
    expect(result.low).not.toHaveProperty("average"); expect(result.high).not.toHaveProperty("average");
    expect(result).not.toHaveProperty("difference"); expect(result).not.toHaveProperty("evidence");
    expect(calculateInfluence(range(14), TODAY, definition, ys, xs)).toMatchObject({ missing: "split" });
  });
  it("requires five days in each group even when there are fourteen pairs", () => {
    expect(calculateInfluence(range(14), TODAY, { ...definition, cut: "gte:10" }, map(sequence(14)), map(sequence(14))))
      .toMatchObject({ status: "insufficient", pairs: 14, high: { days: [date(10), date(11), date(12), date(13)] } });
  });
  it.each([[2, "clear"], [1.2, "moderate"], [0, "low"]] as const)("Welch evidence: mean gap %s → %s", (gap, expected) => {
    const ys = sequence(32).map(i => 10 + (i >= 16 ? gap : 0) + (i % 2 ? 2 : -2));
    const result = calculateInfluence(range(32), TODAY, { ...definition, cut: "gte:16" }, map(sequence(32)), map(ys));
    expect(result).toMatchObject({ status: "ok", evidence: expected });
    expect(result).not.toHaveProperty("t"); expect(result).not.toHaveProperty("p");
  });
  it("constant equal groups are low; unequal constants below 30 pairs are moderate; zero baseline has no percent", () => {
    const d = { ...definition, cut: "gte:7" };
    expect(calculateInfluence(range(14), TODAY, d, map(sequence(14)), map(sequence(14).map(() => 0))))
      .toMatchObject({ status: "ok", evidence: "low", differencePercent: null });
    expect(calculateInfluence(range(14), TODAY, d, map(sequence(14)), map(sequence(14).map(i => i < 7 ? 0 : 10))))
      .toMatchObject({ status: "ok", evidence: "moderate", difference: 10, differencePercent: null });
  });
});

type Value = { user_id: string; metric_id: string; metric_date: string; value: number | string | null };
let values: Value[] = [];
let logs: NutritionReportDayLogFact[] = [];
let defs: ReturnType<typeof definitions>;
let fails: boolean;
let reads: { table: string; owner?: string }[];
let rpc: ReturnType<typeof vi.fn>;
const definitions = () => Object.entries(ids).map(([key, id]) => ({ id, user_id: "owner", system_key: key, name: key, unit: key === "sleep" ? "min" : key === "water" ? "L" : "pasos",
  value_type: key === "sleep" ? "duration" : key === "water" ? "decimal" : "integer", is_active: true, archived_at: null as string | null }));
const log = (d: string, work: boolean | null = null): NutritionReportDayLogFact => ({ id: d, log_date: d, total_calories_consumed: 2000, total_protein_g: 120, total_carbs_g: 200, total_fat_g: 70,
  nutrition_target_kcal_snapshot: 2100, protein_target_g_snapshot: 130, estimated_expenditure_kcal_snapshot: 2400, delta_vs_nutrition_target: -100, energy_balance_kcal: -400,
  water_target_l_snapshot: null, water_l: null, mate_l: null, steps: null, work_effective_snapshot: work, gym_effective_snapshot: null, gym_source_snapshot: null,
  nutrition_goal_period_id: null, nutrition_plan_period_id: null, goal_type_snapshot: "lose" });
const seedValues = (n: number) => { values = sequence(n).flatMap(i => Object.values(ids).map(metric_id => ({ user_id: "owner", metric_id, metric_date: date(i), value: i }))); };
function training(days: number[]) {
  const sessions = days.map(i => ({ id: `s${i}`, day_log_id: date(i), status: "completed", started_at: `${date(i)}T12:00:00Z`, ended_at: `${date(i)}T13:00:00Z`, routine_id: null, routine_name_snapshot: null, session_name: null }));
  const sessionExercises = days.map(i => ({ id: `e${i}`, workout_session_id: `s${i}`, exercise_id: "exercise", nombre_snapshot: "Remo", grupo_muscular_snapshot: "espalda" }));
  const sets = days.flatMap(i => sequence(i + 1).map(n => ({ id: `set${i}-${n}`, workout_session_exercise_id: `e${i}`, is_completed: true, actual_reps: 10, actual_weight_kg: 50 })));
  vi.mocked(loadCompletedTrainingData).mockResolvedValue({ sessions, sessionExercises, sets, dateByDayLog: new Map(days.map(i => [date(i), date(i)])) } as never);
}
function supabase() {
  rpc = vi.fn(async (_name, args: { p_start: string; p_end: string; p_expected_today: string }) => {
    if (fails) return { error: { code: "XX000" }, data: null };
    const dayLogs = logs.filter(l => l.log_date >= args.p_start && l.log_date <= args.p_end);
    return { error: null, data: { status: "ok", today: args.p_expected_today, start: args.p_start, end: args.p_end, dayLogs,
      meals: dayLogs.map(l => ({ day_log_id: l.id, entry_kind: "meal", final_calories: l.total_calories_consumed, final_protein_g: l.total_protein_g, final_carbs_g: l.total_carbs_g, final_fat_g: l.total_fat_g, source_type: "manual", deleted_at: null })), workouts: [], goalNames: [] } };
  });
  return { rpc, from(table: string) {
    const read = { table, owner: undefined as string | undefined }; reads.push(read);
    let start = "", end = "9999-12-31";
    const builder = {
      select: () => builder,
      eq(_key: string, owner: string) { read.owner = owner; return table === "user_metrics" ? Promise.resolve({ data: defs.filter(d => d.user_id === owner), error: null }) : builder; },
      gte(_key: string, v: string) { start = v; return builder; }, lte(_key: string, v: string) { end = v; return builder; }, order: () => builder,
      range(from: number, to: number) { return Promise.resolve({ error: null, data: values.filter(v => v.user_id === read.owner && v.metric_date >= start && v.metric_date <= end).slice(from, to + 1) }); },
    };
    return builder;
  } };
}
const request = (params = "", suggested = false) => new Request(`https://www.ownlevel.fit/api/mobile/v1/progress/influence${suggested ? "/suggested" : ""}?${params}`, { headers: { authorization: "Bearer token" } });
const params = (override: Record<string, string> = {}) => new URLSearchParams({ period: "custom", from: START, to: date(13), ...definition, lag: "0", ...override }).toString();
async function read(override: Record<string, string> = {}): Promise<ProgressInfluence> {
  const response = await GET(request(params(override)));
  expect(response.status).toBe(200);
  const body = parseProgressInfluence(await response.json()); expect(body).toBeDefined(); return body!;
}
beforeEach(() => {
  vi.clearAllMocks(); clock.today = TODAY; values = []; logs = []; defs = definitions(); fails = false; reads = [];
  vi.mocked(authenticateMobileAccessToken).mockResolvedValue({ userId: "owner", supabase: supabase() } as never);
  training([]);
});

describe("Influence authenticated GETs", () => {
  it("uses complete nutrition days, real metric zeros, and reads the lag tail", async () => {
    seedValues(15); logs = sequence(15).map(i => ({ ...log(date(i)), total_calories_consumed: 1000 + i }));
    const body = await read({ split: metric("steps"), outcome: "nutrition.kcal", cut: "gte:7", lag: "1" });
    expect(body.current).toMatchObject({ status: "ok", pairs: 14, low: { average: 1004 }, high: { average: 1011 } });
    expect(body.current.low.days[0]).toBe(START);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("mobile_read_nutrition_report", { p_start: START, p_end: date(14), p_expected_today: TODAY }, { get: true });
    expect(body.reference).toBeNull();
  });
  it("training as outcome ignores rest days; as split those same days have a real zero", async () => {
    seedValues(14); training([0, 2, 4, 6, 8, 10, 12]);
    expect((await read({ outcome: "training.sets" })).current).toMatchObject({ status: "insufficient", pairs: 7, missing: "outcome" });
    const body = await read({ split: "training.sets", outcome: metric("steps"), cut: "gte:1" });
    expect(body.current).toMatchObject({ status: "ok", pairs: 14 });
    expect(body.current.low.days).toEqual([1, 3, 5, 7, 9, 11, 13].map(date));
    expect(vi.mocked(loadCompletedTrainingData).mock.calls[0][0]).toMatchObject({ userId: "owner" });
  });
  it("day.work excludes missing snapshots from both groups and boolean metadata uses yes", async () => {
    seedValues(15); logs = sequence(15).map(i => log(date(i), i === 14 ? null : i % 2 === 0));
    const body = await read({ split: "day.work", outcome: metric("steps"), cut: "yes", to: date(14) });
    expect(body.measure.split).toMatchObject({ valueType: "boolean" });
    expect(body.current).toMatchObject({ status: "ok", pairs: 14, cut: null });
    expect([...body.current.low.days, ...body.current.high.days]).not.toContain(date(14));
  });
  it("reads reference only with explicit comparison and keeps each group's dates inside its period", async () => {
    seedValues(32);
    const body = await read({ from: date(16), to: date(29), compareFrom: START, compareTo: date(13) });
    expect(body.reference).toMatchObject({ status: "ok", pairs: 14 });
    expect(body.reference!.low.days.every(d => d >= START && d <= date(13))).toBe(true);
    expect(body.current.low.days.every(d => d >= date(16))).toBe(true);
    expect((await read()).reference).toBeNull();
  });
  it("suggested resolves active system keys and shares each source across all five questions", async () => {
    seedValues(15); training([0, 2, 4, 6, 8, 10, 12, 14]); logs = sequence(15).map(i => log(date(i)));
    const res = await suggestedGET(request("period=custom&from=2026-09-01&to=2026-09-14", true));
    expect(res.status).toBe(200);
    const body = parseProgressInfluenceSuggested(await res.json())!;
    expect(body.questions.map(q => q.key)).toEqual(["sleep_sets", "carbs_sets", "training_kcal", "steps_sleep", "training_water"]);
    expect(body.questions[0].definition).toEqual({ split: metric("sleep"), cut: "median", lag: 1, outcome: "training.sets" });
    expect(body.questions.every(q => q.reference === null)).toBe(true);
    expect(loadCompletedTrainingData).toHaveBeenCalledTimes(1); expect(rpc).toHaveBeenCalledTimes(1);
    expect(reads.filter(r => r.table === "user_metrics")).toHaveLength(1);
    // Canonical metric pagination: one populated page plus the terminal empty page, shared by every question.
    expect(reads.filter(r => r.table === "daily_metric_values")).toHaveLength(2);
  });
  it.each(["inactive", "archived", "absent"])("suggested omits sleep questions when sleep is %s", async state => {
    if (state === "absent") defs = defs.filter(d => d.system_key !== "sleep");
    else defs = defs.map(d => d.system_key === "sleep" ? { ...d, is_active: state !== "inactive", archived_at: state === "archived" ? "2026-09-01" : null } : d);
    const res = await suggestedGET(request("period=30", true)); expect(res.status).toBe(200);
    expect(parseProgressInfluenceSuggested(await res.json())!.questions.map(q => q.key)).toEqual(["carbs_sets", "training_kcal", "training_water"]);
  });
  it("preserves Bearer identity and owner predicates, rejects arbitrary identity and foreign metric IDs", async () => {
    seedValues(14); values.push({ user_id: "other", metric_id: ids.steps, metric_date: date(0), value: 999999 });
    expect((await read()).current).toMatchObject({ status: "ok", pairs: 14 });
    expect(authenticateMobileAccessToken).toHaveBeenCalledWith("token");
    expect(reads.every(r => r.owner === "owner")).toBe(true);
    expect((await GET(request(`${params()}&userId=other`))).status).toBe(400);
    expect((await GET(request(params({ split: "metric.a1000000-0000-4000-8000-000000000001" })))).status).toBe(400);
    vi.mocked(authenticateMobileAccessToken).mockRejectedValue(new MobileApiUnauthorizedError());
    expect((await GET(request(params()))).status).toBe(401);
  });
  it.each<Record<string, string>>([
    { cut: "yes" }, { split: "day.work", cut: "median" }, { split: "day.training", cut: "gte:1" },
    { outcome: metric("steps") }, { split: "body.weight" }, { outcome: "day.training" }, { split: "nutrition.unknown" },
    { lag: "3" }, { lag: "-1" }, { lag: "0.0" }, { cut: "gte:Infinity" }, { cut: "gte:" }, { cut: "gte:1e999" },
  ])("invalid combinations are 400: %j", async override => {
    const response = await GET(request(params(override)));
    expect(response.status).toBe(400); expect(await response.json()).toMatchObject({ error: "VALIDATION_ERROR", message: expect.any(String) });
    expect(rpc).not.toHaveBeenCalled(); expect(loadCompletedTrainingData).not.toHaveBeenCalled();
  });
  it("rejects missing, unknown and repeated parameters on both endpoints", async () => {
    for (const key of ["split", "cut", "lag", "outcome"]) {
      const q = new URLSearchParams(params()); q.delete(key);
      expect((await GET(request(q.toString()))).status).toBe(400);
      expect((await GET(request(`${params()}&${key}=0`))).status).toBe(400);
    }
    expect((await suggestedGET(request("period=30&split=day.training", true))).status).toBe(400);
    expect((await suggestedGET(request("period=30&period=7", true))).status).toBe(400);
    expect((await GET(request(params({ from: "bad" })))).status).toBe(400);
  });
  it("source failures remain unavailable, never an insufficient-data success", async () => {
    fails = true;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try { expect((await GET(request(params({ split: "day.work", cut: "yes" })))).status).toBe(503); }
    finally { warn.mockRestore(); }
  });
  it("retries a read once across Córdoba midnight", async () => {
    const next = addProgressIsoDays(TODAY, 1);
    const normal = rpc.getMockImplementation()!;
    rpc.mockImplementationOnce(async () => { clock.today = next; return { error: null, data: { status: "day_changed", today: next } } as never; }).mockImplementation(normal);
    const body = await read({ split: "day.work", cut: "yes" });
    expect(body.today).toBe(next); expect(rpc).toHaveBeenCalledTimes(2);
  });
  it("unions overlapping read windows, caps at today and chunks only at the facts RPC limit", () => {
    const windows = influenceReadRanges([{ start: "2025-09-01", end: "2026-09-01" }, { start: "2026-08-01", end: TODAY }], 2, TODAY);
    expect(windows).toEqual([{ start: "2025-09-01", end: "2026-09-01" }, { start: "2026-09-02", end: TODAY }]);
  });
});

describe("Influence strict contracts", () => {
  it("rejects undersized ok groups, averages on insufficient, bad evidence, inconsistent totals and dates outside the split period", async () => {
    seedValues(14); const body = await read();
    expect(parseProgressInfluence(body)).toBeDefined();
    for (const change of [
      (b: ProgressInfluence) => { b.current.high.days = b.current.high.days.slice(0, 4); },
      (b: ProgressInfluence) => { if (b.current.status === "ok") b.current.evidence = "certain" as never; },
      (b: ProgressInfluence) => { b.current.low.days[0] = date(-1); },
      (b: ProgressInfluence) => { if (b.current.status === "ok") b.current.difference += 1; },
    ]) { const copy = structuredClone(body); change(copy); expect(parseProgressInfluence(copy)).toBeUndefined(); }
    const insufficient = { ...body, current: calculateInfluence(range(13), TODAY, definition, map(sequence(13)), map(sequence(13))) };
    expect(parseProgressInfluence(insufficient)).toBeDefined();
    expect(parseProgressInfluence({ ...insufficient, current: { ...insufficient.current, low: { ...insufficient.current.low, average: 0 } } })).toBeUndefined();
    const suggested = { today: body.today, period: body.period, questions: [{ key: "steps_sleep", definition: body.definition, measure: body.measure, current: body.current, reference: null }] };
    expect(parseProgressInfluenceSuggested(suggested)).toBeDefined();
    expect(parseProgressInfluenceSuggested({ ...suggested, questions: [...suggested.questions, ...suggested.questions] })).toBeUndefined();
  });
});
