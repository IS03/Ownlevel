import { describe, expect, it } from "vitest";
import { buildPerformanceInsightsV1, INSIGHTS_PERFORMANCE_METHOD, type HistoricalContext, type HistoryCoverage, type PerformanceExerciseBlock, type PerformanceSession } from "./index";

const press = "10000000-0000-4000-8000-000000000001";
const squat = "10000000-0000-4000-8000-000000000002";
const pull = "10000000-0000-4000-8000-000000000003";
const context: HistoricalContext = { weightMode: "Peso total", unit: "kg", implement: "barbell", configuration: "bench-flat" };

function block(id: string, values: Array<[number | null, number | null]>, options: Partial<PerformanceExerciseBlock> = {}): PerformanceExerciseBlock {
  return { id, exerciseId: press, completed: true, context: { ...context },
    sets: values.map(([load, amount], i) => ({ id: `${id}-set-${i}`, completed: true, load, amount })), ...options };
}
function session(id: string, day: string, exercises: PerformanceExerciseBlock[], options: Partial<PerformanceSession> = {}): PerformanceSession {
  return { id, date: day, routineId: "routine-a", status: "completed", startedAt: `${day}T10:00:00Z`, endedAt: `${day}T11:00:00Z`, chronology: "verified", exercises, ...options };
}
function run(sessions: PerformanceSession[], historyCoverage: HistoryCoverage = "complete") {
  return buildPerformanceInsightsV1({ sessions, historyCoverage });
}
function comparison(a: Array<[number | null, number | null]>, b: Array<[number | null, number | null]>, ctx: HistoricalContext = context) {
  return run([
    session("before", "2026-10-01", [block("before-block", b, { context: ctx })]),
    session("current", "2026-11-02", [block("current-block", a, { context: ctx })]),
  ]).sessions.find(row => row.sessionId === "current")!.exercises[0]!;
}
const old = () => session("before", "2026-10-01", [block("before-block", [[20, 10]])]);
const now = () => session("current", "2026-11-02", [block("current-block", [[20, 12]])]);
const currentResult = (sessions: PerformanceSession[], coverage: HistoryCoverage = "complete") => run(sessions, coverage).sessions.find(row => row.sessionId === "current")!.exercises[0]!;

describe("detalle de exclusiones", () => {
  it("summary drops only later sessions and keeps every status", () => {
    const session = (id: string, day: number, reps: number): PerformanceSession => ({ id, date: `2026-01-0${day}`, routineId: null, status: "completed", startedAt: `2026-01-0${day}T10:00:00Z`, endedAt: `2026-01-0${day}T11:00:00Z`, chronology: "verified",
      exercises: [{ id: `b${id}`, exerciseId: "93670000-0000-4000-8000-00000000000a", completed: true, context: { weightMode: "Peso total", unit: "kg", implement: "barra", configuration: "none" }, sets: [{ id: `s${id}`, completed: true, amount: reps, load: 50 }] }] });
    const sessions = [session("a", 1, 8), session("b", 2, 9), session("c", 3, 7)];
    const full = buildPerformanceInsightsV1({ sessions, historyCoverage: "complete" }), summary = buildPerformanceInsightsV1({ sessions, historyCoverage: "complete", exclusionDetail: "summary" });
    const statuses = (run: typeof full) => run.sessions.flatMap(row => row.exercises.map(exercise => [exercise.status, exercise.reference?.sessionId ?? null]));
    expect(statuses(summary)).toEqual(statuses(full));
    expect(full.sessions.flatMap(row => row.exclusions).some(row => row.reason === "not_before_start")).toBe(true);
    expect(summary.sessions.flatMap(row => row.exclusions).some(row => row.reason === "not_before_start")).toBe(false);
  });
});

describe("Insights performance/1: factual classification", () => {
  it.each([
    { label: "more reps", a: [[20, 12]], b: [[20, 10]], status: "improved" },
    { label: "more load", a: [[25, 10]], b: [[20, 10]], status: "improved" },
    { label: "fewer reps", a: [[20, 8]], b: [[20, 10]], status: "declined" },
    { label: "less load / possible deload", a: [[15, 10]], b: [[20, 10]], status: "declined" },
    { label: "direct equality", a: [[20, 10]], b: [[20, 10]], status: "observed_stable" },
    { label: "heavier for fewer reps", a: [[25, 8]], b: [[20, 10]], status: "ambiguous_evidence" },
    { label: "lighter for more reps", a: [[15, 12]], b: [[20, 10]], status: "ambiguous_evidence" },
    { label: "both dimensions changed without anchor", a: [[25, 12]], b: [[20, 10]], status: "ambiguous_evidence" },
    { label: "opposing reps at different loads", a: [[20, 12], [30, 5]], b: [[20, 10], [30, 8]], status: "ambiguous_evidence" },
    { label: "opposing rep/load anchors", a: [[20, 12], [25, 8]], b: [[20, 10], [30, 8]], status: "ambiguous_evidence" },
    { label: "equality plus unanchored tradeoff", a: [[20, 10], [35, 3]], b: [[20, 10], [30, 5]], status: "ambiguous_evidence" },
    { label: "improvement plus unanchored tradeoff", a: [[20, 12], [35, 3]], b: [[20, 10], [30, 5]], status: "ambiguous_evidence" },
    { label: "all anchors agree", a: [[20, 12], [30, 8]], b: [[20, 10], [30, 6]], status: "improved" },
  ])("$label", ({ a, b, status }) => {
    const result = comparison(a as Array<[number, number]>, b as Array<[number, number]>);
    expect(result.status).toBe(status);
    expect(result.methodVersion).toBe(INSIGHTS_PERFORMANCE_METHOD);
  });

  it("retains both directions and all set IDs instead of selecting the best conclusion", () => {
    const result = comparison([[20, 12], [30, 5]], [[20, 10], [30, 8]]);
    expect(result.reason).toBe("crossed_signals");
    expect(result.evidence).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "reps_at_load", anchor: 20, current: 12, reference: 10, delta: 2, currentSetIds: ["current-block-set-0"] }),
      expect.objectContaining({ kind: "reps_at_load", anchor: 30, current: 5, reference: 8, delta: -3, referenceSetIds: ["before-block-set-1"] }),
    ]));
  });

  it("keeps a load record separate from ambiguous contextual performance", () => {
    const result = comparison([[25, 8]], [[20, 10]]);
    expect(result).toMatchObject({ status: "ambiguous_evidence", reason: "unanchored_evidence" });
    expect(result.records.facts).toContainEqual({ kind: "load", anchor: null, current: 25, previousMaximum: 20, isNewHigh: true });
    expect(result.volume).toEqual({ current: { unit: "kg_reps", value: 200 }, reference: { unit: "kg_reps", value: 200 } });
  });

  it("does not use volume or extra identical sets as a performance tiebreaker", () => {
    const result = comparison([[20, 10], [20, 10]], [[20, 10]]);
    expect(result.status).toBe("observed_stable");
    expect(result.volume.current?.value).toBe(400);
    expect(result.volume.reference?.value).toBe(200);
  });

  it.each([
    ["Peso corporal", "reps", null, 9, 6, "bodyweight_reps", "reps"],
    ["Tiempo (segundos)", "seconds", null, 45, 30, "time", "seconds"],
    ["Lingotes (no kg)", "lingotes", 5, 12, 10, "reps_at_load", "lingote_reps"],
    ["Por mancuerna", "kg", 20, 12, 10, "reps_at_load", "kg_reps"],
    ["Por brazo", "kg", 20, 12, 10, "reps_at_load", "kg_reps"],
    ["Total con barra", "kg", 20, 12, 10, "reps_at_load", "kg_reps"],
  ] as const)("uses the declared %s strategy", (mode, unit, load, a, b, kind, volumeUnit) => {
    const result = comparison([[load, a]], [[load, b]], { ...context, weightMode: mode, unit });
    expect(result.status).toBe("improved");
    expect(result.evidence[0]?.kind).toBe(kind);
    expect(result.volume.current).toEqual({ unit: volumeUnit, value: (load ?? 1) * a });
  });

  it("preserves explicit zero and never imputes missing load or reps", () => {
    expect(comparison([[0, 10]], [[0, 8]]).status).toBe("improved");
    expect(comparison([[20, 0]], [[20, 8]]).status).toBe("declined");
    expect(comparison([[null, 10]], [[0, 8]])).toMatchObject({ status: "insufficient_comparison", reason: "invalid_completed_set", volume: { current: null } });
    expect(comparison([[20, null]], [[20, 10]]).status).toBe("insufficient_comparison");
    const unrealizedLoad = comparison([[100, 0]], [[20, 0]]);
    expect(unrealizedLoad.status).toBe("ambiguous_evidence");
    expect(unrealizedLoad.records.facts.some(row => row.kind === "load")).toBe(false);
  });

  it.each([NaN, Infinity, -1, 1.5])("rejects invalid recorded reps: %s", amount => {
    expect(comparison([[20, amount]], [[20, 10]]).reason).toBe("invalid_completed_set");
  });

  it("rejects loaded bodyweight/time and fractional lingotes without inventing a conversion", () => {
    expect(comparison([[5, 10]], [[0, 10]], { ...context, weightMode: "Peso corporal", unit: "reps" }).reason).toBe("invalid_completed_set");
    expect(comparison([[5, 10]], [[0, 10]], { ...context, weightMode: "Tiempo (segundos)", unit: "seconds" }).reason).toBe("invalid_completed_set");
    expect(comparison([[5.5, 10]], [[5, 10]], { ...context, weightMode: "Lingotes (no kg)", unit: "lingotes" }).reason).toBe("invalid_completed_set");
  });
});

describe("historical compatibility without catalog reconstruction", () => {
  it.each(["weightMode", "unit", "implement", "configuration"] as const)("requires historical %s even when missing in both exposures", key => {
    const result = comparison([[20, 12]], [[20, 10]], { ...context, [key]: null });
    expect(result).toMatchObject({ status: "insufficient_comparison", reason: "missing_context", reference: null });
  });

  it.each([
    { weightMode: "Por mancuerna" }, { unit: "lingotes", weightMode: "Lingotes (no kg)" },
    { implement: "dumbbell" }, { configuration: "bench-incline" },
  ] satisfies Partial<HistoricalContext>[])("does not compare known incompatible contexts: %j", change => {
    const previous = old();
    previous.exercises[0]!.context = { ...context, ...change };
    const result = currentResult([previous, now()]);
    expect(result.status).toBe("insufficient_comparison");
    expect(result.exclusions).toContainEqual(expect.objectContaining({ reason: "different_context", sessionId: "before" }));
    expect(result.records.facts).toEqual([]);
  });

  it("rejects unknown modes and inconsistent units", () => {
    expect(comparison([[20, 12]], [[20, 10]], { ...context, weightMode: "unknown" }).reason).toBe("unsupported_mode");
    expect(comparison([[20, 12]], [[20, 10]], { ...context, unit: "lingotes" }).reason).toBe("mode_unit_mismatch");
  });

  it("normalizes mode spelling but never aliases configuration or exercise identities", () => {
    const current = now();
    current.exercises[0]!.context.weightMode = "  PESO   TOTAL ";
    expect(currentResult([old(), current]).status).toBe("improved");
    current.exercises[0]!.exerciseId = squat;
    expect(currentResult([old(), current]).reason).toBe("no_compatible_reference");
    current.exercises[0]!.exerciseId = "press";
    expect(currentResult([old(), current]).reason).toBe("invalid_exercise_id");
  });

  it("resolves mixed configurations explicitly rather than counting them separately", () => {
    const current = now();
    current.exercises = [...current.exercises, block("incline", [[20, 12]], { context: { ...context, configuration: "incline" } })];
    const result = run([old(), current]).sessions.find(row => row.sessionId === "current")!;
    expect(result.counts).toMatchObject({ total: 1, insufficient: 1, comparable: 0 });
    expect(result.exercises[0]?.reason).toBe("mixed_context");
  });
});

describe("strict chronological reference selection", () => {
  it("selects the latest compatible completed exposure, retaining age with no 28-day expiry", () => {
    const previous = old(), current = now();
    const incompatible = session("incompatible", "2026-11-01", [block("other", [[20, 20]], { context: { ...context, implement: "machine" } })]);
    const result = currentResult([current, incompatible, previous]);
    expect(result.reference).toMatchObject({ sessionId: "before", endedAt: previous.endedAt,
      ageMs: Date.parse(current.startedAt!) - Date.parse(previous.endedAt!) });
    expect(result.reference!.ageMs).toBeGreaterThan(28 * 86_400_000);
  });

  it("allows same-day references only when they ended strictly before the current start", () => {
    const previous = session("before", "2026-11-02", [block("before-block", [[20, 10]])], { startedAt: "2026-11-02T08:00:00-03:00", endedAt: "2026-11-02T09:00:00-03:00" });
    const current = { ...now(), startedAt: "2026-11-02T12:00:00-03:00", endedAt: "2026-11-02T13:00:00-03:00" };
    expect(currentResult([current, previous]).reference).toMatchObject({ sessionId: "before", ageMs: 3 * 3_600_000 });
  });

  it("preserves PostgreSQL sub-millisecond ordering rather than truncating chronology", () => {
    const current = { ...now(), startedAt: "2026-11-02T10:00:00.000002Z" };
    const earlier = { ...old(), endedAt: "2026-11-02T10:00:00.000001Z" };
    const simultaneous = { ...old(), id: "same-instant", endedAt: "2026-11-02T10:00:00.000002Z" };
    const result = currentResult([current, earlier, simultaneous]);
    expect(result.reference).toMatchObject({ sessionId: "before", ageMs: 0.001 });
    expect(() => JSON.stringify(run([current, earlier, simultaneous]))).not.toThrow();
  });

  it.each([
    { id: "future", startedAt: "2026-11-03T08:00:00Z", endedAt: "2026-11-03T09:00:00Z" },
    { id: "touching", startedAt: "2026-11-02T08:00:00Z", endedAt: "2026-11-02T10:00:00Z" },
    { id: "overlap", startedAt: "2026-11-02T09:00:00Z", endedAt: "2026-11-02T10:30:00Z" },
    { id: "simultaneous", startedAt: "2026-11-02T10:00:00Z", endedAt: "2026-11-02T11:00:00Z" },
  ])("excludes $id even if it has a favorable record", options => {
    const candidate = { ...old(), ...options };
    candidate.exercises = [block("candidate", [[200, 10]])];
    const result = currentResult([old(), now(), candidate]);
    expect(result.reference?.sessionId).toBe("before");
    expect(result.exclusions).toContainEqual(expect.objectContaining({ reason: "not_before_start", sessionId: options.id }));
    expect(result.records.facts.find(row => row.kind === "load")?.previousMaximum).toBe(20);
  });

  it.each([
    { chronology: "uncertain" }, { startedAt: null }, { endedAt: null },
    { startedAt: "2026-10-01T10:00:00" }, { endedAt: "2026-10-01" },
    { endedAt: "2026-10-01T09:00:00Z" }, { endedAt: "2026-10-01T10:00:00Z" },
    { endedAt: "2026-02-30T11:00:00Z" }, { endedAt: "2026-10-01T24:00:00Z" },
  ] satisfies Partial<PerformanceSession>[])("excludes uncertain reference chronology: %j", options => {
    const result = currentResult([{ ...old(), ...options }, now()]);
    expect(result.reference).toBeNull();
    expect(result.exclusions).toContainEqual(expect.objectContaining({ reason: "uncertain_chronology", sessionId: "before" }));
  });

  it("abstains on uncertain current chronology or tied latest reference times", () => {
    expect(currentResult([old(), { ...now(), chronology: "uncertain" }]).reason).toBe("uncertain_chronology");
    const result = currentResult([old(), { ...old(), id: "tied" }, now()]);
    expect(result).toMatchObject({ reference: null, reason: "reference_order_uncertain" });
  });

  it("does not skip the latest compatible incomplete exposure to cherry-pick older sets", () => {
    const incomplete = session("incomplete", "2026-11-01", [block("missing-sets", [[null, 10]])]);
    const result = currentResult([old(), incomplete, now()]);
    expect(result).toMatchObject({ status: "insufficient_comparison", reason: "invalid_completed_set", reference: { sessionId: "incomplete" } });
  });

  it("excludes active and discarded sessions, without interpreting unavailable history as empty", () => {
    for (const status of ["active", "discarded"] as const) {
      const report = run([{ ...old(), status }, now()]);
      expect(report.sessions).toHaveLength(1);
      expect(report.exclusions).toContainEqual({ reason: "session_not_completed", sessionId: "before" });
      expect(report.sessions[0]!.exercises[0]!.reference).toBeNull();
    }
    expect(currentResult([old(), now()], "unavailable")).toMatchObject({ reason: "history_unavailable", reference: null, records: { historyCoverage: "unavailable", facts: [] } });
    expect(currentResult([old(), now()], "partial").records.historyCoverage).toBe("partial");
  });
});

describe("session composition, duplicate rows and daily candidate aggregation", () => {
  it("deduplicates session/block/set reads and merges repeated compatible blocks once", () => {
    const current = now(), first = current.exercises[0]!;
    current.exercises = [first, structuredClone(first), block("repeated-block", [[20, 12]])];
    first.sets = [...first.sets, structuredClone(first.sets[0]!)];
    // Recreate the duplicate after changing its sets, so the duplicated block is exact.
    current.exercises = [first, structuredClone(first), current.exercises[2]!];
    const report = run([old(), current, structuredClone(current)]);
    const row = report.sessions.find(item => item.sessionId === "current")!;
    expect(report.deduplicatedSessions).toBe(1);
    expect(row.counts).toMatchObject({ total: 1, comparable: 1, improved: 1 });
    expect(row.exercises[0]!.current).toMatchObject({ deduplicatedRows: 2, blockIds: ["current-block", "repeated-block"] });
    expect(row.exercises[0]!.volume.current?.value).toBe(480);
  });

  it("rejects contradictory duplicates without accepting the first/last row", () => {
    const current = now(), first = current.exercises[0]!;
    first.sets = [...first.sets, { ...first.sets[0]!, amount: 100 }];
    expect(currentResult([old(), current]).reason).toBe("duplicate_conflict");
    const changed = { ...now(), endedAt: "2026-11-02T12:00:00Z" };
    const report = run([old(), now(), changed]);
    expect(report.integrity).toBe("conflicting_duplicates");
    expect(report.days).toEqual([]);
    expect(report.sessions.some(row => row.sessionId === "current")).toBe(false);
    expect(report.exclusions).toContainEqual({ reason: "duplicate_conflict", sessionId: "current" });
    // A conflicting reference must not be silently removed in favor of an older exposure either.
    expect(run([old(), { ...old(), endedAt: "2026-10-01T12:00:00Z" }, now()]).integrity).toBe("conflicting_duplicates");
  });

  it("does not count identical row IDs owned by different exercises", () => {
    const current = now();
    current.exercises = [current.exercises[0]!, { ...current.exercises[0]!, id: "another-block", exerciseId: squat }];
    const result = run([old(), current]).sessions.find(row => row.sessionId === "current")!;
    expect(result.counts).toMatchObject({ total: 2, insufficient: 2, comparable: 0 });
    expect(result.exercises.every(row => row.reason === "duplicate_conflict")).toBe(true);
  });

  it("keeps incomplete exercises and unfinished sets explicit", () => {
    const current = now();
    current.exercises[0]!.completed = false;
    expect(currentResult([old(), current]).reason).toBe("incomplete_exercise");
    current.exercises[0]!.completed = true;
    current.exercises[0]!.sets = [{ ...current.exercises[0]!.sets[0]!, completed: false }];
    expect(currentResult([old(), current])).toMatchObject({ reason: "no_completed_sets", current: { excludedSetIds: ["current-block-set-0"] } });
  });

  it("retains counts, coverage and different exercise/routine composition across real same-day sessions", () => {
    const previous = session("previous", "2026-11-01", [
      block("p", [[20, 10]]), block("s", [[20, 10]], { exerciseId: squat }), block("u", [[20, 10]], { exerciseId: pull }),
    ]);
    const morning = session("morning", "2026-11-02", [block("am", [[20, 8]])], { startedAt: "2026-11-02T08:00:00Z", endedAt: "2026-11-02T09:00:00Z" });
    const evening = session("evening", "2026-11-02", [
      block("pm-p", [[20, 9]]), // same exercise again is a genuine second comparison
      block("pm-s", [[20, 10]], { exerciseId: squat }),
      block("pm-u", [[20, 12]], { exerciseId: pull }),
      block("pm-new", [[20, 10]], { exerciseId: "10000000-0000-4000-8000-000000000004" }),
    ], { routineId: "routine-b", startedAt: "2026-11-02T18:00:00Z", endedAt: "2026-11-02T19:00:00Z" });
    const report = run([evening, morning, previous, structuredClone(morning)]);
    const day = report.days.find(row => row.date === "2026-11-02")!;
    expect(day.sessions).toHaveLength(2);
    expect(day.counts).toEqual({ total: 5, comparable: 4, improved: 2, observedStable: 1, declined: 1, ambiguous: 0, insufficient: 1, coverage: 4 / 5 });
    expect(day.candidateDeclineProportion).toBe(1 / 4);
    expect(day.equalSessionWeightSensitivity).toBe(1 / 2);
    expect(day.evaluableSessions).toBe(2);
    expect(day.sessions.find(row => row.sessionId === "evening")!.exercises.find(row => row.exerciseId === press)!.reference!.sessionId).toBe("morning");
    expect(day.sessions.map(row => row.routineId).sort()).toEqual(["routine-a", "routine-b"]);
  });

  it("keeps ambiguity and insufficiency out of C, and distinguishes absent from a genuine zero", () => {
    const day = run([old(), now()]).days.find(row => row.date === "2026-11-02")!;
    expect(day.candidateDeclineProportion).toBe(0);
    const insufficient = run([now()]).days[0]!;
    expect(insufficient.counts).toMatchObject({ insufficient: 1, comparable: 0, coverage: 0 });
    expect(insufficient.candidateDeclineProportion).toBeNull();
    expect(insufficient.equalSessionWeightSensitivity).toBeNull();
    const ambiguous = now();
    ambiguous.exercises = [block("tradeoff", [[25, 8]])];
    const noComparable = run([old(), ambiguous]).days.find(row => row.date === "2026-11-02")!;
    expect(noComparable.counts).toMatchObject({ ambiguous: 1, comparable: 0, coverage: 0 });
    expect(noComparable.candidateDeclineProportion).toBeNull();
    expect(run([]).days).toEqual([]);
  });

  it("uses the supplied logical day across midnight and excludes missing/impossible day assignments", () => {
    const current = { ...now(), date: "2026-11-01", startedAt: "2026-11-02T01:30:00Z", endedAt: "2026-11-02T02:30:00Z" };
    expect(run([old(), current]).days.map(row => row.date)).toEqual(["2026-10-01", "2026-11-01"]);
    for (const date of [null, "2026-02-30"]) {
      const report = run([old(), { ...current, date }]);
      expect(report.days).toHaveLength(1);
      expect(report.sessions.find(row => row.sessionId === "current")!.exclusions).toContainEqual({ reason: "invalid_logical_date", sessionId: "current" });
    }
  });

  it("is deterministic, does not mutate inputs and does not pick an outcome using source order", () => {
    const sessions = [now(), old()];
    const snapshot = structuredClone(sessions);
    const a = run(sessions), b = run([...sessions].reverse());
    expect(a).toEqual(b);
    expect(sessions).toEqual(snapshot);
    expect(a).not.toHaveProperty("patterns");
  });
});
