import { describe, expect, it } from "vitest";
import type { SessionSetDto } from "../mobile-api/training-session";
import { parseLoadPattern, parseSessionLoadPatterns } from "../mobile-api/training-load-pattern-contract";
import { detectLoadPattern, type LoadPatternCurrent, type LoadPatternExecution } from "./load-pattern";

/** Synthetic history only: one bench press in routine PUSH, sessions every 4 days before 2026-11-24. */
const EXERCISE = "11111111-1111-4111-8111-111111111111";
const ROUTINE = "22222222-2222-4222-8222-222222222222";
const OTHER_ROUTINE = "33333333-3333-4333-8333-333333333333";
const today: LoadPatternCurrent = { exerciseId: EXERCISE, routineId: ROUTINE, weightMode: "Peso total", implement: "Barra", configuration: null,
  logDate: "2026-11-24", nextAdjustment: "maintain" };
const set = (n: number, reps: number | null, kg: number | null, target: number | null = 10, done = true): SessionSetDto =>
  ({ setNumber: n, targetReps: target, targetWeightKg: kg, targetRir: 2, actualReps: reps, actualWeightKg: kg, isCompleted: done, notes: null });
const three = (reps = 10, kg = 60) => [set(1, reps, kg), set(2, reps, kg), set(3, reps, kg)];
let id = 0;
const run = (daysAgo: number, sets: SessionSetDto[], patch: Partial<LoadPatternExecution> = {}): LoadPatternExecution => {
  const date = new Date(Date.UTC(2026, 10, 24 - daysAgo)).toISOString().slice(0, 10);
  return { exerciseId: EXERCISE, routineId: ROUTINE, weightMode: "Peso total", implement: "Barra", configuration: null,
    sessionId: `44444444-4444-4444-8444-${String(++id).padStart(12, "0")}`, logDate: date, routineName: "PUSH", sets, ...patch };
};
const four = () => [run(4, three()), run(8, three()), run(12, three()), run(16, three())];

describe("#537 · esquema repetido", () => {
  it("4 previous executions with the same 3×10 · 60 kg give a repeated pattern with its evidence", () => {
    const pattern = detectLoadPattern(today, four());
    expect(pattern).toMatchObject({ signal: "repeated", count: 4, scheme: [{ reps: 10, weightKg: 60 }, { reps: 10, weightKg: 60 }, { reps: 10, weightKg: 60 }] });
    expect(pattern!.sessions.map(s => s.logDate)).toEqual(["2026-11-20", "2026-11-16", "2026-11-12", "2026-11-08"]);
    expect(pattern!.key).toBe(`repeated|${EXERCISE}|${ROUTINE}|10x60,10x60,10x60`);
    expect(parseLoadPattern(JSON.parse(JSON.stringify(pattern)))).toEqual(pattern);
  });
  it("3 are not enough, and the count follows the whole run", () => {
    expect(detectLoadPattern(today, four().slice(0, 3))).toBeNull();
    expect(detectLoadPattern(today, [...four(), run(20, three())])?.count).toBe(5);
  });
  it("3×10 is not 2×15 (same volume), and changing load, reps or set count breaks the run", () => {
    const broken = (sets: SessionSetDto[]) => detectLoadPattern(today, [run(4, three()), run(8, three()), run(12, sets), run(16, three()), run(20, three())]);
    expect(broken([set(1, 15, 60), set(2, 15, 60)])).toBeNull();
    expect(broken(three(10, 62.5))).toBeNull();
    expect(broken(three(9))).toBeNull();
    expect(broken([...three(), set(4, 10, 60)])).toBeNull();
  });
  it("only the same routine counts; another routine in between is skipped, not counted", () => {
    expect(detectLoadPattern(today, [run(2, three(8, 80), { routineId: OTHER_ROUTINE }), ...four()])?.count).toBe(4);
    expect(detectLoadPattern(today, four().map(r => ({ ...r, routineId: OTHER_ROUTINE })))).toBeNull();
    expect(detectLoadPattern({ ...today, routineId: null }, four())).toBeNull();
  });
  it("only within the last 8 weeks", () => {
    expect(detectLoadPattern(today, [run(4, three()), run(30, three()), run(50, three()), run(57, three())])).toBeNull();
    expect(detectLoadPattern(today, [run(4, three()), run(30, three()), run(50, three()), run(56, three())])?.count).toBe(4);
  });
  it("context: another weight mode, implement or known variant breaks; two unknown variants are the same unknown", () => {
    const with4th = (patch: Partial<LoadPatternExecution>) => detectLoadPattern(today, [...four().slice(0, 3), { ...four()[3]!, ...patch }]);
    expect(with4th({ weightMode: "Por mancuerna" })).toBeNull();
    expect(with4th({ implement: "Máquina" })).toBeNull();
    expect(with4th({ configuration: "recorded:agarre abierto" })).toBeNull();
    expect(detectLoadPattern({ ...today, configuration: "recorded:agarre abierto" }, four().map(r => ({ ...r, configuration: "recorded:agarre abierto" })))?.count).toBe(4);
    expect(with4th({ implement: " barra " })?.count).toBe(4);
  });
  it("a missing value is never equal: a completed set without reps or kg ends the run", () => {
    expect(detectLoadPattern(today, [...four().slice(0, 3), run(16, [set(1, 10, 60), set(2, null, 60), set(3, 10, 60)])])).toBeNull();
    expect(detectLoadPattern(today, [...four().slice(0, 3), run(16, [set(1, 10, 60), set(2, 10, null), set(3, 10, 60)])])).toBeNull();
  });
  it("only completed sets form the scheme; an execution without completed sets ends the run", () => {
    expect(detectLoadPattern(today, [run(4, [...three(), set(4, 10, 60, 10, false)]), ...four().slice(1)])?.count).toBe(4);
    expect(detectLoadPattern(today, [...four().slice(0, 3), run(16, three().map(s => ({ ...s, isCompleted: false })))])).toBeNull();
  });
  it("a pending «Próxima vez» adjustment and non-load modes give nothing", () => {
    expect(detectLoadPattern({ ...today, nextAdjustment: "increase_weight" }, four())).toBeNull();
    for (const weightMode of ["Peso corporal", "Tiempo (segundos)", "Lingotes (no kg)", null]) {
      expect(detectLoadPattern({ ...today, weightMode }, four().map(r => ({ ...r, weightMode })))).toBeNull();
    }
  });
});

describe("#537 · reps de sobra («2 por 2»)", () => {
  const surplus = (reps: number, kg = 60) => [set(1, 10, kg), set(2, 10, kg), set(3, reps, kg)];
  it("last set 2+ over target at the same load in the last two executions wins over repeated", () => {
    const pattern = detectLoadPattern(today, [run(4, surplus(12)), run(8, surplus(13)), run(12, surplus(12)), run(16, surplus(12))]);
    expect(pattern).toMatchObject({ signal: "surplus", count: 2 });
    expect(pattern!.sessions).toHaveLength(2);
  });
  it("+1, a different load or only one execution is not enough", () => {
    expect(detectLoadPattern(today, [run(4, surplus(12)), run(8, surplus(11))])).toBeNull();
    expect(detectLoadPattern(today, [run(4, surplus(12)), run(8, surplus(12, 57.5))])).toBeNull();
    expect(detectLoadPattern(today, [run(4, surplus(12))])).toBeNull();
    expect(detectLoadPattern(today, [run(4, [set(1, 12, 60, null)]), run(8, [set(1, 12, 60, null)])])).toBeNull();
  });
});

describe("#537 · contrato", () => {
  it("a malformed answer is unavailable, never «no pattern»; null per exercise is a valid «nothing to show»", () => {
    expect(parseSessionLoadPatterns({ status: "unavailable" })).toEqual({ status: "unavailable" });
    expect(parseSessionLoadPatterns({ status: "ok", data: { [EXERCISE]: null } })).toEqual({ status: "ok", data: { [EXERCISE]: null } });
    expect(parseSessionLoadPatterns({ status: "ok", data: { [EXERCISE]: { signal: "repeated" } } })).toEqual({ status: "unavailable" });
    expect(parseSessionLoadPatterns({ status: "ok", data: { "no-es-uuid": null } })).toEqual({ status: "unavailable" });
    expect(parseSessionLoadPatterns(undefined)).toEqual({ status: "unavailable" });
    const pattern = detectLoadPattern(today, four())!;
    expect(parseLoadPattern({ ...pattern, count: 3 })).toBeUndefined();
    expect(parseLoadPattern({ ...pattern, extra: true })).toBeUndefined();
  });
});
