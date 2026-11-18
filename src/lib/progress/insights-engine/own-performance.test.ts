import { describe, expect, it, vi } from "vitest";
import { parsePerformanceInsights } from "../../mobile-api/performance-insights-contract";
import { parseInsightsParams } from "../../mobile-api/performance-insights-server";
import { createInsightsSnapshot, insightsOwnPerformance, insightsSummary } from "./read-model";
import { ownSessions } from "./own-performance";
import type { InsightsSource } from "./types";

vi.mock("server-only", () => ({}));

/** «Rendimiento frente a lo tuyo». Synthetic history only. */
const id = (n: number) => `70000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ROUTINE = id(900), OTHER = id(901), PRESS = id(800), DIPS = id(801), SLEEP = id(700), STEPS = id(701);
type Plan = { date: string; press?: Array<[number, number]>; dips?: number[]; routine?: string; sleep?: number; hour?: number };
const shift = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

function source(plans: Plan[], extra: Partial<InsightsSource> = {}): InsightsSource {
  const sessions: InsightsSource["sessions"][number][] = [], exercises: InsightsSource["exercises"][number][] = [], sets: InsightsSource["sets"][number][] = [];
  const metricValues: InsightsSource["metricValues"][number][] = [];
  plans.forEach((plan, index) => {
    const sessionId = id(index + 1), hour = String(plan.hour ?? 18).padStart(2, "0");
    sessions.push({ id: sessionId, date: plan.date, routineId: plan.routine ?? ROUTINE, routineName: plan.routine ? "PIERNAS" : "ESPALDA", name: null, status: "completed",
      startedAt: `${plan.date}T${hour}:00:00-03:00`, endedAt: `${plan.date}T${hour}:50:00-03:00`, performanceLevel: null, painLevel: null, legacyEnergyLevel: null, dayWeightKg: null });
    const add = (key: string, exerciseId: string, rows: Array<[number | null, number]>) => {
      const blockId = `${sessionId}-${key}`;
      exercises.push({ id: blockId, sessionId, exerciseId, name: key === "p" ? "Remo" : "Fondos", implement: key === "p" ? "maquina" : null, weightMode: key === "p" ? "Peso total" : null, isCompleted: true, configuration: null });
      rows.forEach(([load, reps], set) => sets.push({ id: `${blockId}-${set}`, sessionExerciseId: blockId, actualReps: reps, actualLoad: load, isCompleted: true, completedAt: `${plan.date}T${hour}:1${set}:00-03:00` }));
    };
    if (plan.press) add("p", PRESS, plan.press);
    if (plan.dips) add("d", DIPS, plan.dips.map(reps => [null, reps]));
    if (plan.sleep !== undefined) metricValues.push({ metricId: SLEEP, date: plan.date, value: plan.sleep, sleepNight: "declared" });
  });
  return { sessions, exercises, sets, meals: [], feelings: [], metricValues,
    metricDefinitions: [{ id: SLEEP, name: "Sueño", unit: "min", valueType: "decimal", archived: false, systemKey: "sleep", order: 1 }, { id: STEPS, name: "Pasos", unit: "pasos", valueType: "integer", archived: false, systemKey: null, order: 2 }], ...extra };
}

describe("lo tuyo de cada ejercicio", () => {
  it("compares the best set as estimated strength against the median of the previous five, from the third time on", () => {
    const plans: Plan[] = [[60, 10], [60, 10], [60, 10], [55, 12], [60, 12]].map(([load, reps], index) => ({ date: shift("2026-10-01", index * 2), press: [[load!, reps!], [40, 15]], dips: [10 + index] }));
    const own = ownSessions(source(plans));
    expect(own.map(row => row.exercises[0]!.pct)).toEqual([null, null, null, -3.7, 5]); // 55×12 = 77 vs 80; 60×12 = 84 vs the lower middle of 77, 80, 80, 80
    expect(own[3]!.exercises[0]).toMatchObject({ kind: "load", today: { load: 55, reps: 12 }, base: { load: 60, reps: 10 }, bases: 3 });
    // Without load the reps count, never mixed with the loaded reading.
    expect(own[3]!.exercises[1]).toMatchObject({ kind: "reps", today: { load: null, reps: 13 }, base: { load: null, reps: 11 } });
    // The session needs two exercises with «lo tuyo»: the median of both.
    expect(own[3]!.exercises.map(row => row.pct)).toEqual([-3.7, 18.2]);
    expect(own[3]!.pct).toBe(round((-3.7 + 18.2) / 2)); // from the exercises' published values
    expect(own[2]!.pct).toBeNull();
  });
  it("keeps only the last five previous times, and an exercise without completed sets out of the session", () => {
    const reps = [8, 8, 8, 8, 8, 12, 12, 12, 12];
    const plans: Plan[] = reps.map((r, index) => ({ date: shift("2026-09-01", index), dips: [r] }));
    const own = ownSessions(source(plans));
    expect(own.at(-1)!.exercises[0]).toMatchObject({ bases: 5, base: { reps: 12 }, pct: 0 });
    expect(own.at(-1)!.total).toBe(1);
    expect(own.at(-1)!.pct).toBeNull(); // one exercise only
  });
});

function round(value: number) { return Math.round(value * 10) / 10; }

/** Thirty sessions: five to build «lo tuyo», then sleep in three levels, and more reps the nights with more sleep. */
function sleepy(count = 30): Plan[] {
  const levels = [300, 420, 540];
  return Array.from({ length: count }, (_, index) => {
    const sleep = levels[index % 3]!, reps = index < 5 ? 10 : 10 + levels.indexOf(sleep);
    return { date: shift("2026-08-01", index * 3), press: [[50, reps]], dips: [reps], sleep, hour: index % 2 ? 8 : 19 };
  });
}

describe("tramos de Cómo llegaste", () => {
  const view = (plans: Plan[], routine: string | null = null) => {
    const snapshot = createInsightsSnapshot(source(plans), { today: "2026-11-17", method: 2, revision: "r1" });
    return JSON.parse(JSON.stringify(insightsOwnPerformance(snapshot, routine)));
  };
  it("splits sleep in thirds of the person's own values and calls the difference clear only when it beats its error", () => {
    const model = view(sleepy());
    const sleep = model.factors.day.find((row: { key: string }) => row.key === "sleep_night_before");
    expect(sleep.bins.map((bin: { from: number | null; to: number | null }) => [bin.from, bin.to])).toEqual([[null, 420], [420, 540], [540, null]]);
    expect(sleep.bins.every((bin: { n: number; mean: number | null }) => bin.n >= 6 && bin.mean !== null)).toBe(true);
    expect(sleep.difference).toBeGreaterThan(0);
    expect(sleep.clear).toBe(true);
    expect(sleep.byRoutine).toEqual([{ routineId: ROUTINE, name: "ESPALDA", direction: "up" }]);
    expect(parsePerformanceInsights(model)).toBeTruthy();
  });
  it("gives no mean to a tramo with fewer than six sessions, and nothing is clear then", () => {
    const model = view(sleepy(14));
    const sleep = model.factors.day.find((row: { key: string }) => row.key === "sleep_night_before");
    expect(sleep.bins.some((bin: { n: number; mean: number | null }) => bin.n < 6 && bin.mean === null)).toBe(true);
    expect(sleep.clear).toBe(false);
    expect(parsePerformanceInsights(model)).toBeTruthy();
  });
  it("has the hour of the session and the days since the last one of the routine as fixed categories", () => {
    const model = view(sleepy());
    const hour = model.factors.day.find((row: { key: string }) => row.key === "training_hour");
    expect(hour.bins.map((bin: { label: string }) => bin.label)).toEqual(["mañana", "tarde", "noche"]);
    expect(hour.bins[1].n).toBe(0);
    const since = model.factors.day.find((row: { key: string }) => row.key === "days_since_previous");
    expect(since.bins.map((bin: { label: string; n: number }) => [bin.label, bin.n])).toEqual([["1–2 días", 0], ["3–4 días", since.valid], ["5 o más", 0]]);
  });
  it("reads the week before: average sleep with four nights, and the sets trained, where a week without training is a real zero", () => {
    const model = view(sleepy());
    const week = model.factors.week.find((row: { key: string }) => row.key === "sleep_week");
    // Sleep recorded only on training days (every three days): never four nights in a week, so no value, and it says why.
    expect(week.valid).toBe(0);
    expect(week.missing.few_days).toBe(model.sessions.filter((row: { pct: number | null }) => row.pct !== null).length);
    const volume = model.factors.week.find((row: { key: string }) => row.key === "volume_week");
    expect(volume.values.filter((value: number | null) => value !== null).every((value: number) => value >= 2)).toBe(true);
    expect(model.factors.week.find((row: { key: string }) => row.key === "calories_week").missing).toEqual({ not_recorded: expect.any(Number) });
  });
  it("filters one routine without changing «lo tuyo», and publishes twelve weeks and the routines with ten measured sessions", () => {
    const plans = [...sleepy(), { date: "2026-11-16", routine: OTHER, dips: [20] }];
    const all = view(plans), one = view(plans, ROUTINE);
    expect(one.routine).toBe(ROUTINE);
    expect(one.sessions.every((row: { routineId: string }) => row.routineId === ROUTINE)).toBe(true);
    expect(one.sessions.map((row: { pct: number | null }) => row.pct)).toEqual(all.sessions.filter((row: { routineId: string }) => row.routineId === ROUTINE).map((row: { pct: number | null }) => row.pct));
    expect(all.weeks).toHaveLength(12);
    expect(all.routines.find((row: { id: string }) => row.id === OTHER)).toMatchObject({ sessions: 1, measured: 0, mean: null });
    expect(all.routines.find((row: { id: string }) => row.id === ROUTINE).mean).not.toBeNull();
  });
  it("the contract rejects a tramo mean on fewer than six sessions, and the route takes only method 2 and a uuid routine", () => {
    const model = view(sleepy());
    const broken = structuredClone(model);
    broken.factors.day[0].bins[0] = { ...broken.factors.day[0].bins[0], n: 5, mean: 1 };
    expect(parsePerformanceInsights(broken)).toBeUndefined();
    expect(parseInsightsParams(new URLSearchParams("view=own&method=2"))).toEqual({ view: "own", routine: null, method: 2 });
    expect(parseInsightsParams(new URLSearchParams(`view=own&method=2&routine=${ROUTINE.toUpperCase()}`))).toEqual({ view: "own", routine: ROUTINE, method: 2 });
    expect(() => parseInsightsParams(new URLSearchParams("view=own"))).toThrow();
    expect(() => parseInsightsParams(new URLSearchParams("view=own&method=2&routine=x"))).toThrow();
    expect(() => parseInsightsParams(new URLSearchParams("view=own&method=2&limit=3"))).toThrow();
  });
});

describe("lo tuyo en el resumen", () => {
  it("each session of the summary carries its value and how many exercises entered, never the exercises themselves", () => {
    const snapshot = createInsightsSnapshot(source(sleepy()), { today: "2026-11-17", method: 2, revision: "r1" });
    const summary = JSON.parse(JSON.stringify(insightsSummary(snapshot)));
    const session = summary.facts.days[0].sessions[0];
    const own = insightsOwnPerformance(snapshot, null).sessions.find(row => row.sessionId === session.sessionId)!;
    expect(session.own).toEqual({ pct: own.pct, compared: own.compared, total: own.total });
    expect(parsePerformanceInsights(summary)).toBeTruthy();
    const broken = structuredClone(summary);
    broken.facts.days[0].sessions[0].own = { pct: 2, compared: 1, total: 2 };
    expect(parsePerformanceInsights(broken)).toBeUndefined();
  });
});
