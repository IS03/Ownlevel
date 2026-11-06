import { describe, expect, it } from "vitest";
import { buildPerformanceInsightsPartialV1, buildPerformanceInsightsV1 } from ".";
import { compareSessions } from "./kernel";
import { messyHistory } from "./messy-history.fixture";
import type { ExercisePerformance, PerformanceSession } from "./types";

/** What the compact output promises: the full output with the exposures, evidence and volumes taken away, and nothing else. */
const projectExercise = ({ methodVersion, exerciseId, status, reason, reference, records, exclusions }: ExercisePerformance) => ({ methodVersion, exerciseId, status, reason,
  reference: reference ? { sessionId: reference.sessionId, endedAt: reference.endedAt, ageMs: reference.ageMs } : null, records: records.facts, exclusions });
const projectPartialExercise = ({ reading, contextCompleteness, ...exercise }: ExercisePerformance & { reading: string; contextCompleteness: string }) => {
  const projected: Partial<ReturnType<typeof projectExercise>> = projectExercise({ ...exercise, status: "insufficient_comparison" });
  delete projected.status;
  return { ...projected, contextCompleteness, reading };
};
type Comparison<E> = { sessions: { exercises: E[] }[]; days: { sessions: { exercises: E[] }[] }[] };
function project<E, P>(full: Comparison<E>, map: (exercise: E) => P) {
  const session = <S extends { exercises: E[] }>(row: S) => ({ ...row, exercises: row.exercises.map(map) });
  return { ...full, sessions: full.sessions.map(session), days: full.days.map(day => ({ ...day, sessions: day.sessions.map(session) })) };
}
const fields = (row: object) => Object.keys(row).sort();

const histories: [string, () => PerformanceSession[]][] = Array.from({ length: 30 }, (_, seed) => [`semilla ${seed + 1}`, () => messyHistory(seed + 1)]);

describe("salida compacta del comparador (#367)", () => {
  describe.each(["configuration_required", "configuration_unknown"] as const)("%s", rule => {
    it.each(histories)("%s: la compacta es la proyección exacta de la completa, en cada nivel de detalle, con y sin índice", (_name, history) => {
      const sessions = history();
      for (const exclusionDetail of ["summary", "full"] as const) for (const indexed of [true, false]) for (const historyCoverage of ["complete", "unavailable"] as const) {
        const input = { sessions, historyCoverage, exclusionDetail };
        const full = compareSessions(input, rule, indexed), compact = compareSessions({ ...input, output: "compact" }, rule, indexed);
        expect(compact).toEqual(project(full, projectExercise));
        // Same order of sessions, days and exercises: the projection above compares arrays in order.
        expect(compact.sessions.map(row => row.sessionId)).toEqual(full.sessions.map(row => row.sessionId));
      }
    });
  });
  it.each(histories.slice(0, 10))("%s: el método parcial publica lo mismo en las dos salidas", (_name, history) => {
    const input = { sessions: history(), historyCoverage: "complete" as const, exclusionDetail: "summary" as const };
    const full = buildPerformanceInsightsPartialV1(input), compact = buildPerformanceInsightsPartialV1({ ...input, output: "compact" });
    expect(compact).toEqual(project(full, projectPartialExercise as never));
    expect(compact.partition).toEqual(full.partition);
  });
  it("the default is still the full output, for every current consumer", () => {
    const input = { sessions: messyHistory(3), historyCoverage: "complete" as const, exclusionDetail: "summary" as const };
    const exercise = buildPerformanceInsightsV1(input).sessions.flatMap(session => session.exercises)[0]!;
    expect(fields(exercise)).toEqual(["current", "evidence", "exclusions", "exerciseId", "methodVersion", "reason", "records", "reference", "status", "volume"]);
    const compact = buildPerformanceInsightsV1({ ...input, output: "compact" }).sessions.flatMap(session => session.exercises).find(row => row.reference)!;
    expect(fields(compact)).toEqual(["exclusions", "exerciseId", "methodVersion", "reason", "records", "reference", "status"]);
    expect(fields(compact.reference!)).toEqual(["ageMs", "endedAt", "sessionId"]);
  });
  it("the histories reach every case the projection must hold: readings, ties, records, unknown configuration and every mode", () => {
    const rows = histories.flatMap(([, history]) => compareSessions({ sessions: history(), historyCoverage: "complete", exclusionDetail: "summary" }, "configuration_unknown").sessions.flatMap(session => session.exercises));
    const strict = histories.flatMap(([, history]) => compareSessions({ sessions: history(), historyCoverage: "complete", exclusionDetail: "summary" }, "configuration_required").sessions.flatMap(session => session.exercises));
    for (const status of ["improved", "observed_stable", "declined", "ambiguous_evidence", "insufficient_comparison"] as const) expect(rows.some(row => row.status === status), status).toBe(true);
    for (const reason of ["crossed_signals", "unanchored_evidence", "reference_order_uncertain", "missing_context", "no_compatible_reference"]) expect([...rows, ...strict].some(row => row.reason === reason), reason).toBe(true);
    expect(rows.some(row => row.records.facts.some(fact => fact.isNewHigh))).toBe(true);
    expect(rows.some(row => row.reference?.exposure.issue)).toBe(true);
    expect(rows.some(row => row.exclusions.some(item => item.reason === "different_context"))).toBe(true);
    for (const mode of ["Peso total", "lingotes (no kg)", "Peso corporal", "Tiempo (segundos)"]) expect(rows.some(row => row.current.context?.weightMode === mode && row.reference), mode).toBe(true);
    expect(strict.some(row => row.status === "improved" || row.status === "declined")).toBe(true);
  });
});
