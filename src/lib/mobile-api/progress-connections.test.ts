import { beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
vi.mock("server-only", () => ({}));
const clock = vi.hoisted(() => ({ today: "2026-10-19" }));
vi.mock("@/lib/phase2/cordoba-date", () => ({ todayInCordoba: () => clock.today }));
vi.mock("./supabase", () => ({ authenticateMobileAccessToken: vi.fn() }));
vi.mock("./nutrition-report-server", async original => ({
  ...await original<typeof import("./nutrition-report-server")>(), readMobileNutritionFacts: vi.fn(),
}));
import { GET, OPTIONS } from "@/app/api/mobile/v1/progress/connections/route";
import { buildNutritionReportDays, type NutritionReportDayLogFact } from "@/lib/nutrition/reports-core";
import type { TrainingAnalysisSource } from "@/lib/phase2/training-analysis";
import { addProgressIsoDays } from "@/lib/progress/analytics";
import { MobileApiUnauthorizedError } from "./auth";
import { authenticateMobileAccessToken } from "./supabase";
import { NutritionReportDayChangedError, readMobileNutritionFacts } from "./nutrition-report-server";
import { resolveMobileProgressPeriod } from "./progress-server";
import { CONNECTION_KEYS, parseProgressConnections, type ProgressConnections } from "./progress-connections-contract";
import { calculateProgressConnections, connectionRank, connectionWeeks, type ConnectionSources } from "./progress-connections-model";
import { connectionTrainingEvidence } from "./progress-connections";

const TODAY = "2026-10-19";
const aStart = "2026-10-05", bStart = "2026-09-21";
const period = (start = aStart, days = 14, compare = bStart) => resolveMobileProgressPeriod({
  period: "custom", from: start, to: addProgressIsoDays(start, days - 1),
  compare: { start: compare, end: addProgressIsoDays(compare, days - 1) },
}, TODAY).period;
const a = period(), b = period(bStart, 14, "2026-09-07");
const offsets = (length: number) => Array.from({ length }, (_, i) => i);
const log = (date: string, kcal = 2000): NutritionReportDayLogFact => ({
  id: date, log_date: date, total_calories_consumed: kcal, total_protein_g: 120, total_carbs_g: 240, total_fat_g: 60,
  nutrition_target_kcal_snapshot: null, protein_target_g_snapshot: null, water_target_l_snapshot: null,
  estimated_expenditure_kcal_snapshot: null, delta_vs_nutrition_target: null, energy_balance_kcal: null,
  water_l: null, mate_l: null, steps: null, work_effective_snapshot: null, gym_effective_snapshot: null,
  gym_source_snapshot: null, nutrition_goal_period_id: null, nutrition_plan_period_id: null, goal_type_snapshot: null,
});
function facts(start: string, days = 14, omit: number[] = [], kcal = 2000) {
  const logs = offsets(days).map(i => log(addProgressIsoDays(start, i), kcal));
  return { dayLogs: logs, workouts: [], goalNames: new Map<string, string>(), meals: logs.filter((_, i) => !omit.includes(i)).map(d => ({
    day_log_id: d.id, entry_kind: "meal" as const, final_calories: kcal, final_protein_g: 120, final_carbs_g: 240,
    final_fat_g: 60, source_type: null, deleted_at: null,
  })) };
}
const days = (start: string, count = 14, omit: number[] = [], kcal = 2000) =>
  buildNutritionReportDays({ range: { start, end: addProgressIsoDays(start, count - 1) }, today: TODAY, ...facts(start, count, omit, kcal) });
const exercise = (id = "bench", currentE1rm = 110, previousE1rm = 100) => ({
  exerciseId: id, name: id, currentE1rm, previousE1rm, status: "improved" as const,
});
const sources = (): ConnectionSources => ({
  nutrition: [...days(aStart), ...days(bStart)], training: { exercises: [exercise()], energy: { current: 4, previous: 3, sessions: { current: 2, previous: 2 } } },
  weights: [aStart, bStart].flatMap(start => [0, 5, 10].map((n, i) => ({ date: addProgressIsoDays(start, n), value: [70, 72, 71][i] }))),
});
const calculate = (input = sources()) => calculateProgressConnections(a, b, TODAY, input);
const get = (dto: ProgressConnections, key: typeof CONNECTION_KEYS[number]) => dto.stories.find(s => s.key === key)!;

describe("connections facts and coverage", () => {
  it("averages only complete registered days, not empty days or today", () => {
    const s = sources(); s.nutrition = [...days(aStart, 14, [0, 4], 2400), ...days(bStart)];
    expect(get(calculate(s), "kcal_weight").food).toMatchObject({ current: 2400, previous: 2000, coverage: { current: { days: 12, eligible: 14 } } });
    const range = period("2026-10-13", 7, "2026-10-06");
    s.nutrition = [...days("2026-10-13", 7), ...days("2026-10-06", 7)];
    const result = calculateProgressConnections(range, period("2026-10-06", 7, "2026-09-29"), TODAY, s);
    expect(result.stories[0].food.coverage.current).toEqual({ days: 6, eligible: 6 });
  });
  it("3 of 7 fails with real have/need, while 4 of 7 is enough; checks both weeks and both periods", () => {
    const pa = period("2026-10-12", 7, aStart), pb = period(aStart, 7, "2026-09-28"), s = sources();
    s.nutrition = [...days("2026-10-12", 7, [3, 4, 5, 6]), ...days(aStart, 7)];
    let dto = calculateProgressConnections(pa, pb, TODAY, s);
    expect(dto.stories[0]).toMatchObject({ status: "insufficient", food: { current: null }, missing: { side: "food", reason: "food_days", have: 3, need: 4, period: "current" } });
    s.nutrition = [...days("2026-10-12", 7, [4, 5, 6]), ...days(aStart, 7)];
    expect(calculateProgressConnections(pa, pb, TODAY, s).stories[0].status).toBe("ready");
    s.nutrition = [...days("2026-10-12", 7), ...days(aStart, 7, [3, 4, 5, 6])];
    dto = calculateProgressConnections(pa, pb, TODAY, s);
    expect(dto.stories[0].missing).toMatchObject({ have: 3, need: 4, period: "previous" });
    s.nutrition = [...days(aStart, 14, [7, 8, 9, 10]), ...days(bStart)];
    expect(calculate(s).stories[0].status).toBe("insufficient"); // enough total days, but only 3 in week two
  });
  it("windows longer than two weeks need half their eligible days, not every week's quota", () => {
    const pa = period("2026-09-28", 21, "2026-09-07"), pb = period("2026-09-07", 21, "2026-08-17");
    const s = sources(); s.nutrition = [...days(pa.start, 21, offsets(10)), ...days(pb.start, 21)];
    expect(calculateProgressConnections(pa, pb, TODAY, s).stories[0].status).toBe("ready");
    s.nutrition = [...days(pa.start, 21, offsets(11)), ...days(pb.start, 21)];
    expect(calculateProgressConnections(pa, pb, TODAY, s).stories[0].missing).toMatchObject({ have: 10, need: 11 });
  });
  it("selects the long-window rule by period length, excludes today and does not require data in a today-only week", () => {
    const s = sources(), pa = period(aStart, 15, "2026-09-20"), pb = period("2026-09-20", 15, "2026-09-05");
    s.nutrition = [...days(aStart, 15, offsets(8).map(i => i + 7)), ...days(pb.start, 15)];
    expect(calculateProgressConnections(pa, pb, TODAY, s).stories[0]).toMatchObject({ status: "ready", food: { coverage: { current: { days: 7, eligible: 14 } } } });
    const short = period("2026-10-06", 14, "2026-09-22"), previous = period("2026-09-22", 14, "2026-09-08");
    s.nutrition = [...days(short.start, 14), ...days(previous.start, 14)];
    expect(calculateProgressConnections(short, previous, TODAY, s).stories[0].status).toBe("ready");
    const today = period(TODAY, 1, "2026-10-18"), yesterday = period("2026-10-18", 1, "2026-10-17");
    const result = calculateProgressConnections(today, yesterday, TODAY, s);
    expect(result.stories[0]).toMatchObject({ status: "insufficient", missing: { reason: "food_days", have: 0, need: 1 } });
    expect(parseProgressConnections(result)).toBeDefined();
  });
  it("weeks are Monday–Sunday clipped to each period, including the year boundary", () => {
    expect(connectionWeeks({ start: "2026-12-31", end: "2027-01-11" })).toEqual([
      { start: "2026-12-31", end: "2027-01-03" }, { start: "2027-01-04", end: "2027-01-10" }, { start: "2027-01-11", end: "2027-01-11" },
    ]);
    expect(calculate().stories[0].weeksPrevious[0]).toMatchObject({ start: bStart, end: "2026-09-27", days: 7, eligible: 7, food: 120 });
  });
  it("two weigh-ins fail; three spanning ten days use least squares and the fitted endpoint, not the last weight", () => {
    const s = sources(); s.weights = s.weights!.filter(p => p.date !== "2026-10-15");
    expect(get(calculate(s), "kcal_weight")).toMatchObject({ status: "insufficient", missing: { reason: "weigh_ins", have: 2, need: 3 } });
    const story = get(calculate(), "kcal_weight");
    expect(story.outcome.kind).toBe("weight");
    if (story.outcome.kind !== "weight") throw new Error("wrong outcome");
    expect(story.outcome.perWeekCurrent).toBeCloseTo(0.7);
    expect(story.outcome.current).toBeCloseTo(71.8); // mean 71 + 0.1 * (end day 13 - mean day 5)
    expect(story.outcome.current).not.toBe(71);
    s.weights = [aStart, bStart].flatMap(start => [0, 1, 2].map(n => ({ date: addProgressIsoDays(start, n), value: 70 + n })));
    expect(get(calculate(s), "kcal_weight").status).toBe("insufficient");
  });
  it("one energy session in B fails without publishing its average", () => {
    const s = sources(); s.training!.energy.sessions.previous = 1; s.training!.energy.previous = null;
    expect(get(calculate(s), "carbs_energy")).toMatchObject({ status: "insufficient", outcome: { previous: null }, missing: { reason: "energy_sessions", have: 1, need: 2, period: "previous" } });
  });
  it("ranking contains only ready stories and sorts total relative change, stable on ties", () => {
    expect(calculate().ranking).toEqual(["carbs_energy", "protein_strength", "carbs_strength", "kcal_weight"]);
    const s = sources(); s.training!.exercises = [];
    expect(calculate(s).ranking).toEqual(["carbs_energy", "kcal_weight"]);
    s.nutrition = s.nutrition!.map(d => ({ ...d, calories: 0 }));
    expect(connectionRank(get(calculate(s), "kcal_weight"))).toBe(0); // a real zero baseline never manufactures infinity
  });
  it("an unavailable source suppresses the affected stories' values without masking others", () => {
    const s = sources(); s.weights = null;
    const dto = calculate(s);
    expect(dto.stories.map(s => s.status)).toEqual(["ready", "ready", "ready", "unavailable"]);
    expect(get(dto, "kcal_weight")).toMatchObject({ food: { current: null, previous: null }, missing: { side: "outcome", reason: "weigh_ins", have: null } });
    expect(parseProgressConnections(dto)).toBeDefined();
    s.nutrition = null;
    expect(calculate(s).stories.every(s => s.status === "unavailable" && s.food.coverage.current.days === null)).toBe(true);
    expect(parseProgressConnections(calculate(s))).toBeDefined();
  });
  it("a training failure keeps weight available, and the largest absolute strength change may be a decline", () => {
    const s = sources(); s.training = null;
    const dto = calculate(s);
    expect(dto.stories.map(s => s.status)).toEqual(["unavailable", "unavailable", "unavailable", "ready"]);
    expect(parseProgressConnections(dto)).toBeDefined();
    s.training = sources().training;
    s.training!.exercises.push({ ...exercise("decline", 70, 100), status: "declined" });
    expect(calculate(s).stories[0].outcome).toMatchObject({ improved: 1, comparable: 2, top: { exerciseId: "decline", currentE1rm: 70, previousE1rm: 100 } });
  });
});

type Spec = { date: string; status?: string; energy?: number; id?: string; mode?: string; sets?: [number, number][] };
function training(specs: Spec[]): TrainingAnalysisSource {
  const sessions: unknown[] = [], sessionExercises: unknown[] = [], sets: unknown[] = [], dateByDayLog = new Map<string, string>();
  specs.forEach((s, i) => {
    const id = `session-${i}`, block = `block-${i}`; dateByDayLog.set(s.date, s.date);
    sessions.push({ id, user_id: "owner", day_log_id: s.date, status: s.status ?? "completed", started_at: `${s.date}T10:00:00Z`,
      ended_at: `${s.date}T11:00:00Z`, routine_id: null, routine_name_snapshot: null, session_name: null, energy_level: s.energy ?? null });
    sessionExercises.push({ id: block, user_id: "owner", workout_session_id: id, exercise_id: s.id ?? "bench", nombre_snapshot: s.id ?? "Banca",
      grupo_muscular_snapshot: "pecho", weight_mode_snapshot: s.mode ?? "Peso total", is_completed: true });
    (s.sets ?? [[10, 60]]).forEach(([reps, kg], j) => sets.push({ id: `set-${i}-${j}`, user_id: "owner",
      workout_session_exercise_id: block, set_number: j + 1, is_completed: true, actual_reps: reps, actual_weight_kg: kg }));
  });
  return { sessions, sessionExercises, sets, dateByDayLog } as TrainingAnalysisSource;
}
describe("shared training calculations", () => {
  it("excludes exercises only in A, unit modes, mismatched modes, and reps beyond 12; preserves comparison status and 0.5kg rounding", () => {
    const source = training([
      { date: bStart, energy: 2, sets: [[10, 50], [13, 200], [0, 500]] }, { date: aStart, energy: 4, sets: [[10, 60], [1, 65], [13, 300]] },
      { date: aStart, id: "new" }, { date: bStart, id: "units", mode: "Lingotes" }, { date: aStart, id: "units", mode: "Lingotes" },
      { date: bStart, id: "switch", mode: "Peso total" }, { date: aStart, id: "switch", mode: "Peso por lado" },
      { date: bStart, id: "heavy", sets: [[12, 100]] }, { date: aStart, id: "heavy", sets: [[12, 110]] },
      { date: bStart, energy: 4, id: "reps", sets: [[13, 100]] }, { date: aStart, energy: 5, id: "reps", sets: [[13, 110]] },
      { date: aStart, status: "discarded", energy: 1, sets: [[10, 1000]] },
    ]);
    const result = connectionTrainingEvidence(source, a, b, TODAY);
    expect(result.exercises.map(e => e.exerciseId).sort()).toEqual(["bench", "heavy"]);
    expect(result.exercises.find(e => e.exerciseId === "bench")).toMatchObject({ previousE1rm: 66.5, currentE1rm: 80, status: "improved" });
    expect(result.energy).toEqual({ current: 4.5, previous: 3, sessions: { current: 2, previous: 2 } });
    const s = sources(); s.training = result;
    expect(calculate(s).stories[0].outcome).toMatchObject({ improved: 2, comparable: 2, top: { exerciseId: "heavy", previousE1rm: 140, currentE1rm: 154 } });
  });
});

describe("strict shared contract", () => {
  it("accepts ready, insufficient and unavailable facts, and preserves real zero food", () => {
    expect(parseProgressConnections(calculate())).toBeDefined();
    const s = sources(); s.training!.exercises = [];
    expect(parseProgressConnections(calculate(s))).toBeDefined();
    s.nutrition = s.nutrition!.map(d => ({ ...d, calories: 0 }));
    expect(get(parseProgressConnections(calculate(s))!, "kcal_weight").food.current).toBe(0);
  });
  it.each([
    ["unknown story", (d: ProgressConnections) => { (d.stories[0] as unknown as { key: string }).key = "unknown"; }],
    ["duplicate story", (d: ProgressConnections) => { d.stories[1] = d.stories[0]; }],
    ["out of order", (d: ProgressConnections) => { d.stories.reverse(); }],
    ["ready with missing", (d: ProgressConnections) => { d.stories[0].missing = { side: "food", reason: "food_days", have: 1, need: 4, period: "current" }; }],
    ["ready with null average", (d: ProgressConnections) => { d.stories[0].food.current = null; }],
    ["insufficient without missing", (d: ProgressConnections) => { d.stories[0].status = "insufficient"; }],
    ["unavailable with values", (d: ProgressConnections) => { d.stories[0].status = "unavailable"; d.stories[0].missing = { side: "outcome", reason: "comparable_exercises", have: null, need: 1, period: "current" }; }],
    ["days exceed eligible", (d: ProgressConnections) => { d.stories[0].food.coverage.current.days = 15; }],
    ["out-of-range energy", (d: ProgressConnections) => { if (d.stories[2].outcome.kind === "energy") d.stories[2].outcome.current = 5.1; }],
    ["week outside period", (d: ProgressConnections) => { d.stories[0].weeks[0].start = "2026-10-04"; }],
    ["previous week outside B", (d: ProgressConnections) => { d.stories[0].weeksPrevious[0].start = "2026-09-20"; }],
    ["weight week outside period", (d: ProgressConnections) => { const s = d.stories[3]; if (s.key === "kcal_weight") s.weightWeeks[0].end = TODAY; }],
    ["ranking not ready", (d: ProgressConnections) => { d.stories[0].status = "insufficient"; d.stories[0].missing = { side: "food", reason: "food_days", have: 1, need: 4, period: "current" }; }],
    ["duplicate ranking", (d: ProgressConnections) => { d.ranking[1] = d.ranking[0]; }],
    ["extra root key", (d: ProgressConnections) => { Object.assign(d, { surprise: true }); }],
    ["extra nested key", (d: ProgressConnections) => { Object.assign(d.stories[0].food, { surprise: true }); }],
    ["unknown coverage in insufficient", (d: ProgressConnections) => {
      d.stories[0].status = "insufficient"; d.stories[0].missing = { side: "food", reason: "food_days", have: 0, need: 4, period: "current" };
      d.stories[0].food.coverage.current.days = null;
    }],
  ] as [string, (d: ProgressConnections) => void][] )("rejects %s", (_, mutate) => {
    const dto = structuredClone(calculate()); mutate(dto); expect(parseProgressConnections(dto)).toBeUndefined();
  });
});

describe("GET /api/mobile/v1/progress/connections", () => {
  let queries: URL[], source: TrainingAnalysisSource, weightFailure: boolean;
  const request = (query = `period=custom&from=${a.start}&to=${a.end}&compareFrom=${b.start}&compareTo=${b.end}`, token = "Bearer token") =>
    new Request(`https://www.ownlevel.fit/api/mobile/v1/progress/connections?${query}`, { headers: { authorization: token } });
  const expectedWindows = (url: URL) => [...url.searchParams].filter(([k]) => k === "or" || k.endsWith(".or")).flatMap(([, filter]) =>
    [...filter.matchAll(/log_date.gte.(\d{4}-\d{2}-\d{2}),log_date.lte.(\d{4}-\d{2}-\d{2})/g)].map(m => ({ start: m[1], end: m[2] })));
  beforeEach(() => {
    vi.clearAllMocks(); clock.today = TODAY; queries = []; weightFailure = false;
    vi.spyOn(console, "warn").mockImplementation(() => {});
    source = training([{ date: a.start, energy: 4 }, { date: a.end, energy: 5 }, { date: b.start, energy: 2 }, { date: b.end, energy: 3 }]);
    const client = createClient("https://test.supabase.co", "publishable-test-key", { auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: "Bearer owner-token" }, fetch: async input => {
        const url = new URL(String(input)); queries.push(url);
        const table = url.pathname.split("/").at(-1);
        const isWeight = table === "day_logs";
        if (isWeight && weightFailure) return new Response(JSON.stringify({ message: "down", code: "XX000" }), { status: 400 });
        const windows = expectedWindows(url);
        expect(windows.length).toBeGreaterThan(0);
        expect(windows.every(w => w.end <= clock.today)).toBe(true);
        expect(url.searchParams.get("user_id")).toBe("eq.owner");
        const dateOf = (sessionId: string) => source.dateByDayLog.get(source.sessions.find(s => s.id === sessionId)!.day_log_id)!;
        const entries: { row: object; date: string }[] = isWeight
          ? sources().weights!.map(p => ({ date: p.date, row: { id: p.date, log_date: p.date, weight_kg: p.value } }))
          : table === "workout_sessions" ? source.sessions.filter(s => s.status === "completed").map(s => {
            const date = dateOf(s.id); return { date, row: { ...s, day: { id: s.day_log_id, log_date: date } } };
          }) : table === "workout_session_exercises" ? source.sessionExercises.map(s => ({ date: dateOf(s.workout_session_id), row: s }))
            : source.sets.map(s => ({ date: dateOf(source.sessionExercises.find(e => e.id === s.workout_session_exercise_id)!.workout_session_id), row: s }));
        const all = entries.filter(e => windows.some(w => e.date >= w.start && e.date <= w.end)).map(e => e.row);
        const offset = Number(url.searchParams.get("offset") ?? 0), limit = Math.min(Number(url.searchParams.get("limit") ?? 1000), 2);
        return new Response(JSON.stringify(all.slice(offset, offset + limit)), { headers: { "content-type": "application/json" } });
      } } });
    vi.mocked(authenticateMobileAccessToken).mockResolvedValue({ userId: "owner", supabase: client } as never);
    vi.mocked(readMobileNutritionFacts).mockImplementation(async (_, range) => {
      const all = [facts(a.start), facts(b.start)];
      return { dayLogs: all.flatMap(f => f.dayLogs).filter(d => d.log_date >= range.start && d.log_date <= range.end),
        meals: all.flatMap(f => f.meals).filter(m => m.day_log_id >= range.start && m.day_log_id <= range.end), workouts: [], goalNames: new Map() };
    });
  });
  async function read(): Promise<ProgressConnections> {
    const response = await GET(request()); expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const dto = parseProgressConnections(await response.json()); expect(dto).toBeDefined(); return dto!;
  }
  it("authenticates the Bearer and shares paged, owner/range-scoped sources across all four stories", async () => {
    const dto = await read(); expect(dto.stories.map(s => s.key)).toEqual(CONNECTION_KEYS);
    expect(authenticateMobileAccessToken).toHaveBeenCalledWith("token");
    expect(readMobileNutritionFacts).toHaveBeenCalledTimes(1); // adjacent A+B fit a single snapshot
    expect(readMobileNutritionFacts).toHaveBeenCalledWith(expect.anything(), { start: b.start, end: a.end }, TODAY);
    const tables = ["workout_sessions", "workout_session_exercises", "workout_sets", "day_logs"];
    expect(queries).toHaveLength(13); // capped 2 rows/page, including empty terminating pages
    expect(new Set(queries.map(u => u.pathname.split("/").at(-1)))).toEqual(new Set(tables));
    expect(queries.some(u => u.searchParams.has("day.or"))).toBe(true);
    expect(queries.some(u => u.searchParams.has("session.day.or"))).toBe(true);
    expect(queries.some(u => u.searchParams.has("exercise.session.day.or"))).toBe(true);
  });
  it("a failed weight read leaves the three training stories available", async () => {
    weightFailure = true; const dto = await read();
    expect(dto.stories.map(s => s.status)).toEqual(["ready", "ready", "ready", "unavailable"]);
  });
  it("disjoint windows never read their gap; long adjacent windows obey the report's 366-day cap", async () => {
    let response = await GET(request("period=custom&from=2026-10-05&to=2026-10-18&compareFrom=2026-08-03&compareTo=2026-08-16"));
    expect(response.status).toBe(200); expect(parseProgressConnections(await response.json())).toBeDefined();
    expect(vi.mocked(readMobileNutritionFacts).mock.calls.map(([, range]) => range)).toEqual([
      { start: "2026-08-03", end: "2026-08-16" }, { start: a.start, end: a.end },
    ]);
    expect(queries.every(url => expectedWindows(url).every(w => w.start >= a.start || w.end <= "2026-08-16"))).toBe(true);
    vi.mocked(readMobileNutritionFacts).mockClear();
    response = await GET(request("period=custom&from=2025-01-01&to=2026-01-01&compareFrom=2024-01-01&compareTo=2024-12-31"));
    expect(response.status).toBe(200); expect(parseProgressConnections(await response.json())).toBeDefined();
    expect(vi.mocked(readMobileNutritionFacts).mock.calls.map(([, range]) => range)).toEqual([
      { start: "2024-01-01", end: "2024-12-31" }, { start: "2025-01-01", end: "2026-01-01" },
    ]);
  });
  it("a failed nutrition snapshot is unavailable, and an empty successful read is insufficient", async () => {
    vi.mocked(readMobileNutritionFacts).mockRejectedValueOnce(new Error("down"));
    expect((await read()).stories.every(s => s.status === "unavailable")).toBe(true);
    source = training([]);
    vi.mocked(readMobileNutritionFacts).mockResolvedValue({ dayLogs: [], meals: [], workouts: [], goalNames: new Map() });
    expect((await read()).stories.every(s => s.status === "insufficient")).toBe(true);
  });
  it.each(["", "period=30", "compareFrom=2026-09-01", "compareTo=2026-09-30", "userId=other", "period=7&period=14",
    "compareFrom=2026-09-01&compareTo=2026-09-30&surprise=1",
    "period=custom&from=2026-10-01&to=2026-10-18&compareFrom=2026-10-01&compareTo=2026-10-17"])("rejects missing B, unknown/repeated parameters and overlapping B: %s", async query => {
    const response = await GET(request(query)); expect(response.status).toBe(400);
    expect((await response.json()).message).toEqual(expect.any(String)); expect(queries).toHaveLength(0);
  });
  it("rejects a missing/invalid Bearer and exposes preflight", async () => {
    expect((await GET(request(undefined, ""))).status).toBe(401);
    vi.mocked(authenticateMobileAccessToken).mockRejectedValueOnce(new MobileApiUnauthorizedError());
    expect((await GET(request())).status).toBe(401);
    expect(OPTIONS(request()).status).toBe(204);
  });
  it("retries exactly once on Córdoba midnight without turning day_changed into an empty source", async () => {
    vi.mocked(readMobileNutritionFacts).mockImplementationOnce(async () => {
      clock.today = "2026-10-20"; throw new NutritionReportDayChangedError(clock.today);
    });
    const dto = await read(); expect(dto.today).toBe("2026-10-20"); expect(readMobileNutritionFacts).toHaveBeenCalledTimes(2);
    vi.mocked(readMobileNutritionFacts).mockRejectedValue(new NutritionReportDayChangedError("2026-10-21"));
    expect((await GET(request())).status).toBe(503);
  });
});
