import { describe, expect, it } from "vitest";
import { parsePerformanceInsights } from "../../mobile-api/performance-insights-contract";
import { createInsightsSnapshot, insightsRoutineOrder } from "./read-model";
import { routineOrder, type OrderBlock } from "./routine-order";
import type { InsightsSource } from "./types";

/** Synthetic history only: one routine done eight times, four exercises in order, two sets each. */
const id = (n: number) => `60000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ROUTINE = id(900), OTHER = id(901);
const A = id(801), B = id(802), C = id(803), D = id(804);
const NAMES: Record<string, string> = { [A]: "Jalón", [B]: "Remo", [C]: "Face pull", [D]: "Curl" };
type Spec = { exerciseId: string; load: number; reps: number; target: number | null };
type Session = { date: string; routine?: string; specs: Spec[] };
const DATES = ["2026-10-01", "2026-10-05", "2026-10-09", "2026-10-13", "2026-10-17", "2026-10-21", "2026-10-25", "2026-10-29"];

/**
 * A and B (positions 1–2) add one rep at 20 kg every time (~+7.7 % median). C (3°) adds one rep from 20 (~+4.3 %), D (4°) never
 * changes. Targets: A, B and D reach theirs, C never does.
 */
function plan(options: { swapAt?: number; flatStart?: boolean; sessions?: number } = {}): Session[] {
  return DATES.slice(0, options.sessions ?? DATES.length).map((date, i) => {
    const specs: Spec[] = [
      { exerciseId: A, load: 20, reps: options.flatStart ? 10 : 10 + i, target: 10 },
      { exerciseId: B, load: 20, reps: options.flatStart ? 10 : 10 + i, target: 10 },
      { exerciseId: C, load: 20, reps: 20 + i, target: 40 },
      { exerciseId: D, load: 10, reps: 10, target: 10 },
    ];
    if (options.swapAt === i) [specs[1], specs[2]] = [specs[2]!, specs[1]!];
    return { date, specs };
  });
}

function build(sessions: Session[]) {
  const source: InsightsSource = { sessions: [], exercises: [], sets: [], feelings: [], meals: [], metricDefinitions: [], metricValues: [] };
  const blocks: OrderBlock[] = [];
  sessions.forEach((session, i) => {
    const sessionId = id(i + 1);
    (source.sessions as InsightsSource["sessions"][number][]).push({ id: sessionId, date: session.date, routineId: session.routine ?? ROUTINE, routineName: session.routine ? "LEGS" : "PULL", name: null,
      status: "completed", startedAt: `${session.date}T18:00:00-03:00`, endedAt: `${session.date}T19:00:00-03:00`, performanceLevel: null, painLevel: null, legacyEnergyLevel: null, dayWeightKg: null });
    session.specs.forEach((spec, order) => {
      const blockId = `${sessionId}-${order}`;
      (source.exercises as InsightsSource["exercises"][number][]).push({ id: blockId, sessionId, exerciseId: spec.exerciseId, name: NAMES[spec.exerciseId]!, implement: "maquina", weightMode: "Peso total", isCompleted: true, configuration: "recorded:prueba" });
      const sets = [0, 1].map(n => ({ id: `${blockId}-${n}`, sessionExerciseId: blockId, actualReps: spec.reps, actualLoad: spec.load, isCompleted: true, completedAt: `${session.date}T18:${10 + order * 5 + n}:00-03:00` }));
      (source.sets as InsightsSource["sets"][number][]).push(...sets);
      blocks.push({ sessionId, exerciseId: spec.exerciseId, name: NAMES[spec.exerciseId]!, order: (order + 1) * 10,
        sets: sets.map(set => ({ targetReps: spec.target, actualReps: set.actualReps, actualLoad: set.actualLoad, isCompleted: true })) });
    });
  });
  const snapshot = createInsightsSnapshot(source, { today: "2026-11-17", method: 2, revision: "r1" });
  return { snapshot, blocks };
}
const model = (sessions = plan()) => { const { snapshot, blocks } = build(sessions); return routineOrder(snapshot, blocks, ROUTINE); };

describe("orden de la rutina", () => {
  it("names two cuts in progress when they hold in both halves: from the 3rd it drops, from the 4th it drops much more", () => {
    const order = model();
    expect(order.sessions).toBe(8);
    expect(order.positions.map(p => p.exercises[0]!.name)).toEqual(["Jalón", "Remo", "Face pull", "Curl"]);
    expect(order.lenses.progress.status).toBe("ready");
    expect(order.lenses.progress.cuts.map(cut => cut.position)).toEqual([3, 4]);
    const [first, second] = order.lenses.progress.cuts;
    expect(first!.loss).toBeGreaterThan(0.3); expect(first!.loss).toBeLessThan(0.6);
    expect(second!.loss).toBe(1);
    // Level is relative to positions 1–2: D never progresses, so its level is 0, a real zero.
    expect(order.positions[3]!.progress).toMatchObject({ changes: 7, sessions: 7, median: 0, level: 0 });
    expect(order.positions[0]!.progress.level).toBeCloseTo(1, 1);
  });

  it("a drop that comes back up is not a cut: C never reaches its target but D always does", () => {
    const target = model().lenses.target;
    expect(target.status).toBe("no_cut");
    expect(target.baseline).toBe(1);
    expect(model().positions.map(p => p.target.rate)).toEqual([1, 1, 0, 1]);
  });

  it("counts each session in the order it was done: a moved exercise is marked and compared at its usual load", () => {
    const order = model(plan({ swapAt: 5 }));
    const face = order.exercises.find(row => row.exerciseId === C.toLowerCase())!;
    expect(face.usualPosition).toBe(3);
    expect(face.sessions.filter(row => row.moved).map(row => [row.date, row.position])).toEqual([["2026-10-21", 2]]);
    expect(face.compare).toMatchObject({ load: 20, groups: [{ position: 2, sessions: 1, reps: 25 }, { position: 3, sessions: 7 }] });
    expect(order.positions[1]!.exercises.map(row => row.name)).toEqual(["Remo", "Face pull"]);
  });

  it("with few sessions the lenses say so instead of naming a cut", () => {
    const order = model(plan({ sessions: 2 }));
    expect(order.lenses.progress).toMatchObject({ status: "insufficient", cuts: [] });
    expect(order.lenses.target).toMatchObject({ status: "insufficient", cuts: [] });
  });

  it("without progress at the start there is nothing to drop from", () => {
    expect(model(plan({ flatStart: true })).lenses.progress).toMatchObject({ status: "no_baseline", baseline: 0, cuts: [] });
  });

  it("lists the other routines, never mixes their sessions and passes the contract", () => {
    const sessions = [...plan(), { date: "2026-11-02", routine: OTHER, specs: [{ exerciseId: A, load: 20, reps: 5, target: 10 }] }];
    const { snapshot, blocks } = build(sessions);
    const view = insightsRoutineOrder(snapshot, blocks, ROUTINE.toUpperCase());
    expect(view.routines.map(r => [r.id, r.sessions])).toEqual([[OTHER, 1], [ROUTINE, 8]]);
    expect(view.sessions).toBe(8);
    expect(parsePerformanceInsights(view)).toBeTruthy();
    const broken = { ...view, lenses: { ...view.lenses, progress: { ...view.lenses.progress, cuts: [{ position: 2, loss: 0.2 }] } } };
    expect(parsePerformanceInsights(broken)).toBeUndefined();
    expect(parsePerformanceInsights({ ...view, positions: view.positions.slice(1) })).toBeUndefined();
  });
});
