import { describe, expect, it } from "vitest";
import { nutritionMealTimeSource } from "../../mobile-api/nutrition-meal-time";
import { parseCompleteInsights } from "../../mobile-api/performance-insights-contract";
import { buildPerformanceInsightsV1 } from "../performance-insights";
import { descriptiveGroups, evaluateAssociations } from "./associations";
import { buildExposureTable, strictOutcomeDays } from "./exposures";
import { buildInsightsReadModel } from "./read-model";
import { mealTimeEvidence, parseSessionFeelings, toPerformanceSessions, unitOfHistoricalMode } from "./source-adapter";
import { blockPermutation, ranks, seededRandom, spearman } from "./stats";
import type { Candidate, InsightsSource, ObservationRow } from "./types";

const EX_A = "93670000-0000-4000-8000-00000000000a", EX_B = "93670000-0000-4000-8000-00000000000b", METRIC = "93670000-0000-4000-8000-0000000000aa", ARCHIVED = "93670000-0000-4000-8000-0000000000ab";
const dateAt = (day: number) => new Date(Date.UTC(2026, 0, 1 + day)).toISOString().slice(0, 10);

/** Trains exercise A every day: reps follow the given series, so each day's outcome is decided by the fixture. Its verified configuration models a future capture; the real loader reads null. */
function history(reps: readonly number[], extra: Partial<InsightsSource> = {}, configuration: string | null = "none"): InsightsSource {
  const sessions: InsightsSource["sessions"][number][] = [], exercises: InsightsSource["exercises"][number][] = [], sets: InsightsSource["sets"][number][] = [];
  reps.forEach((value, day) => {
    const date = dateAt(day), id = `s${day}`;
    sessions.push({ id, date, routineId: "r1", routineName: "Rutina", name: null, status: "completed", startedAt: `${date}T18:00:00.000Z`, endedAt: `${date}T19:00:00.000Z`, performanceLevel: null, painLevel: null, legacyEnergyLevel: null });
    exercises.push({ id: `e${day}`, sessionId: id, exerciseId: EX_A, name: "Press", implement: "barra", weightMode: "Peso total", isCompleted: true, configuration });
    sets.push({ id: `set${day}`, sessionExerciseId: `e${day}`, actualReps: value, actualLoad: 100, isCompleted: true, completedAt: `${date}T18:10:00.000Z` });
  });
  return { sessions, exercises, sets, feelings: [], metricDefinitions: [], metricValues: [], meals: [], ...extra };
}
const PROVEN = '{"originalTimeKnown":true}', REGISTRATION = '{"originalTimeKnown":false,"timeSource":"registration"}';
const meal = (over: Partial<InsightsSource["meals"][number]> & { id: string; date: string }): InsightsSource["meals"][number] => ({
  consumedAt: `${over.date}T16:00:00.000Z`, consumedAtSource: null, rawInput: PROVEN, entryKind: "meal", sourceType: "sheet_import", importRunId: "run", calories: 500, proteinG: 30, carbsG: 60, fatG: 10, ...over });
const candidateOf = (source: InsightsSource, id: string, today = "2027-01-01") => {
  const performance = buildPerformanceInsightsV1({ sessions: toPerformanceSessions(source).sessions, historyCoverage: "complete" });
  return buildExposureTable(source, strictOutcomeDays(performance.days), today).candidates.find(row => row.definition.id === id)!;
};
const oscillating = (n: number) => Array.from({ length: n }, (_, day) => 8 + (day % 2 ? 1 : -1) * (day % 5 + 1));

describe("hechos", () => {
  it("classifies through the shared comparator and keeps reference, denominators and method version", () => {
    const model = buildInsightsReadModel(history([8, 10, 9]), { today: "2027-01-01", permutations: 19 });
    expect(model.methodVersion).toBe("insights-engine/1"); expect(model.performanceMethodVersion).toBe("insights-performance/1");
    expect(model.facts.totals).toMatchObject({ improved: 1, declined: 1, insufficient: 1, total: 3, comparable: 2 });
    const [latest, middle] = model.facts.days;
    expect(latest!.declineProportion).toBe(1); expect(middle!.declineProportion).toBe(0);
    expect(latest!.sessions[0]!.exercises[0]).toMatchObject({ status: "declined", referenceSessionId: "s1", referenceAgeDays: 0 });
    expect(model.exclusions.performance.no_compatible_reference).toBe(1);
    expect(model.limits).toMatchObject({ configurationSnapshots: { known: 3, total: 3 }, ingestionCompleteKnown: false, clockVerified: false });
    expect(parseCompleteInsights(JSON.parse(JSON.stringify(model)))).toBeTruthy();
  });
  it("derives the unit only from the historical mode and leaves a missing snapshot insufficient", () => {
    expect(unitOfHistoricalMode("Peso total")).toBe("kg"); expect(unitOfHistoricalMode("lingotes (no kg)")).toBe("lingotes"); expect(unitOfHistoricalMode(null)).toBeNull();
    const source = history([8, 9]);
    const exercises = source.exercises.map(row => ({ ...row, implement: null }));
    const model = buildInsightsReadModel({ ...source, exercises }, { today: "2027-01-01", permutations: 19 });
    expect(model.facts.totals).toMatchObject({ insufficient: 2, comparable: 0 }); expect(model.exclusions.performance.missing_context).toBe(2);
    expect(model.facts.days[0]!.declineProportion).toBeNull();
  });
  it("pages the output without losing the history behind it", () => {
    const first = buildInsightsReadModel(history(oscillating(12)), { today: "2027-01-01", limit: 5, permutations: 19 });
    expect(first.facts.days.map(day => day.date)).toEqual([11, 10, 9, 8, 7].map(dateAt));
    expect(first.facts.page).toEqual({ limit: 5, totalDays: 12, nextBefore: dateAt(7) });
    expect(first.history).toMatchObject({ trainingDays: 12, sessions: 12, firstDate: dateAt(0), lastDate: dateAt(11) });
    const next = buildInsightsReadModel(history(oscillating(12)), { today: "2027-01-01", limit: 5, before: first.facts.page.nextBefore!, permutations: 19 });
    expect(next.facts.days[0]!.date).toBe(dateAt(6)); expect(next.facts.page.totalDays).toBe(7);
  });
  it("marks contradictory duplicates as unavailable instead of an empty history", () => {
    const source = history([8, 9]);
    const model = buildInsightsReadModel({ ...source, sessions: [...source.sessions, { ...source.sessions[0]!, endedAt: `${dateAt(0)}T20:00:00.000Z` }] }, { today: "2027-01-01", permutations: 19 });
    expect(model.integrity).toBe("conflicting_duplicates"); expect(model.facts.days).toEqual([]); expect(model.associations.items).toEqual([]);
    expect(parseCompleteInsights(JSON.parse(JSON.stringify(model)))).toBeTruthy();
  });
});

describe("configuración desconocida", () => {
  const reps = oscillating(30);
  it("stays unknown on both sides: nothing is compared and the denominators say why", () => {
    const model = buildInsightsReadModel(history(reps, {}, null), { today: "2027-01-01", permutations: 19 });
    expect(model.facts.totals).toMatchObject({ comparable: 0, insufficient: 30, total: 30, coverage: 0 });
    expect(model.exclusions.performance.missing_context).toBe(30);
    expect(model.facts.days[0]).toMatchObject({ declineProportion: null });
    expect(model.facts.days[0]!.sessions[0]!.exercises[0]).toMatchObject({ status: "insufficient_comparison", reason: "missing_context", referenceSessionId: null, newHigh: false });
    expect(model.history).toMatchObject({ sessions: 30, outcomeDays: 0 });
    expect(model.limits.configurationSnapshots).toEqual({ known: 0, total: 30 });
    expect(parseCompleteInsights(JSON.parse(JSON.stringify(model)))).toBeTruthy();
  });
  it("does not compare a known configuration with an unknown one", () => {
    const source = history(reps.slice(0, 3));
    const model = buildInsightsReadModel({ ...source, exercises: source.exercises.map((row, i) => i === 2 ? { ...row, configuration: null } : row) }, { today: "2027-01-01", limit: 3, permutations: 19 });
    expect(model.facts.days[0]!.sessions[0]!.exercises[0]).toMatchObject({ status: "insufficient_comparison", reason: "missing_context" });
    expect(model.limits.configurationSnapshots).toEqual({ known: 2, total: 3 });
  });
  it("gives the same results in summary without one exclusion per earlier session", () => {
    const sessions = toPerformanceSessions(history(reps, {}, null)).sessions;
    const full = buildPerformanceInsightsV1({ sessions, historyCoverage: "complete" }), summary = buildPerformanceInsightsV1({ sessions, historyCoverage: "complete", exclusionDetail: "summary" });
    const shape = (result: typeof full) => result.sessions.flatMap(row => row.exercises.map(({ status, reason, reference, evidence, records }) => ({ status, reason, reference, evidence, records })));
    expect(shape(summary)).toEqual(shape(full));
    const rows = (result: typeof full) => result.sessions.flatMap(row => row.exercises.flatMap(exercise => exercise.exclusions)).length;
    expect(rows(full)).toBeGreaterThan(400); expect(rows(summary)).toBe(30);
  });
});

describe("contexto y exposiciones", () => {
  it("accepts every numeric metric by UUID, archived and zero included, without reading its name or unit", () => {
    const source = history(oscillating(30), { metricDefinitions: [{ id: METRIC, name: "Cualquier nombre", unit: null, valueType: "decimal", archived: false }, { id: ARCHIVED, name: "Vieja", unit: "kg", valueType: "integer", archived: true }],
      metricValues: [{ metricId: METRIC, date: dateAt(1), value: "0" }, { metricId: ARCHIVED, date: dateAt(1), value: 3 }, { metricId: METRIC, date: dateAt(2), value: "x" }, { metricId: "93670000-0000-4000-8000-0000000000ff", date: dateAt(2), value: 3 }] });
    const same = candidateOf(source, `metric:${METRIC}:same_day`), previous = candidateOf(source, `metric:${METRIC}:previous_day`);
    expect(same.values.get(dateAt(1))).toBe(0); expect(same.values.has(dateAt(3))).toBe(false); expect(same.exclusions.metric_not_recorded).toBeGreaterThan(0);
    expect(previous.values.get(dateAt(2))).toBe(0);
    expect(candidateOf(source, `metric:${ARCHIVED}:same_day`).values.get(dateAt(1))).toBe(3);
    const model = buildInsightsReadModel(source, { today: "2027-01-01", permutations: 19 });
    expect(model.exclusions.source).toMatchObject({ metric_invalid_value: 1, metric_without_definition: 1 });
    expect(model.metrics.find(metric => metric.id === ARCHIVED)?.archived).toBe(true);
  });
  it("repeats a daily metric once per day however many exercises were trained", () => {
    const source = history(oscillating(4), { metricDefinitions: [{ id: METRIC, name: "M", unit: null, valueType: "integer", archived: false }], metricValues: [0, 1, 2, 3].map(day => ({ metricId: METRIC, date: dateAt(day), value: day })) });
    const more = { ...source, exercises: [...source.exercises, ...source.exercises.map(row => ({ ...row, id: `${row.id}b`, exerciseId: EX_B }))],
      sets: [...source.sets, ...source.sets.map(row => ({ ...row, id: `${row.id}b`, sessionExerciseId: `${row.sessionExerciseId}b` }))] };
    const performance = buildPerformanceInsightsV1({ sessions: toPerformanceSessions(more).sessions, historyCoverage: "complete" });
    const table = buildExposureTable(more, strictOutcomeDays(performance.days), "2027-01-01");
    expect(table.rows.length).toBeLessThanOrEqual(4); expect(new Set(table.rows.map(row => row.date)).size).toBe(table.rows.length);
  });
  it("keeps missing nutrition away from zero and a partial macro away from a total", () => {
    const source = history(oscillating(5), { meals: [meal({ id: "a", date: dateAt(1), proteinG: null }), meal({ id: "b", date: dateAt(1), carbsG: 40 }), meal({ id: "c", date: dateAt(3), carbsG: 0 })] });
    const carbs = candidateOf(source, "nutrition:carbsG:same_day"), protein = candidateOf(source, "nutrition:proteinG:same_day");
    expect(carbs.values.get(dateAt(1))).toBe(100); expect(protein.values.has(dateAt(1))).toBe(false); expect(protein.exclusions.partial_macro).toBe(1);
    expect(carbs.values.get(dateAt(3))).toBe(0); expect(carbs.values.has(dateAt(2))).toBe(false); expect(carbs.exclusions.no_active_meals).toBeGreaterThan(0);
  });
  it("admits a meal time only with a positive marker: distinct timestamps prove nothing", () => {
    const base = { consumedAtSource: null, consumedAt: "2026-01-02T16:00:00.000Z", createdAt: "2026-01-02T20:00:00.000Z", rawInput: null as unknown, entryKind: "meal", sourceType: "sheet_import", importRunId: "run" };
    expect(mealTimeEvidence(base)).toBe("unverified");
    expect(mealTimeEvidence({ ...base, rawInput: PROVEN })).toBe("explicit");
    for (const rawInput of ["not json", "{}", "[1]", '"x"', "null", '{"timeSource":"registration"}', '{"originalTimeKnown":"true"}', '{"originalTimeKnown":true,"timeSource":"registration"}', { originalTimeKnown: true }]) {
      expect(mealTimeEvidence({ ...base, rawInput }), JSON.stringify(rawInput)).toBe("unverified");
    }
    // The legacy helper and its consumers keep their reading.
    expect(nutritionMealTimeSource(null, "meal")).toBe("explicit");
    expect(mealTimeEvidence({ ...base, rawInput: REGISTRATION })).toBe("registration");
    expect(mealTimeEvidence({ ...base, rawInput: '{"originalTimeKnown":false}' })).toBe("unknown");
    expect(mealTimeEvidence({ ...base, entryKind: "legacy_daily_summary" })).toBe("unknown");
    expect(mealTimeEvidence({ ...base, consumedAt: "2026-01-02 16:00" })).toBe("unknown");
  });
  it("reads the recorded source first: only a statement or an import counts as a known time", () => {
    const fromImport = { sourceType: "sheet_import", importRunId: "run" };
    const row = (consumedAtSource: string | null, rawInput: unknown = null, origin: { sourceType: string; importRunId: string | null } = fromImport) => mealTimeEvidence({ consumedAt: "2026-01-02T16:00:00.000Z", consumedAtSource, rawInput, entryKind: "meal", ...origin });
    expect(row("user_declared")).toBe("explicit");
    expect(row("imported")).toBe("explicit");
    expect(row("registration_now")).toBe("registration");
    expect(row("default_clock")).toBe("unknown");
    // A clock stays a clock, whatever an old marker says; an older row falls back to its marker.
    expect(row("default_clock", PROVEN)).toBe("unknown");
    expect(row(null)).toBe("unverified");
    expect(row(null, PROVEN)).toBe("explicit");
    expect(row(null, PROVEN, { sourceType: "manual", importRunId: null })).toBe("unverified");
    expect(row(null, REGISTRATION)).toBe("registration");
    expect(mealTimeEvidence({ consumedAt: "not a time", consumedAtSource: "user_declared", rawInput: null, entryKind: "meal", ...fromImport })).toBe("unknown");
    expect(mealTimeEvidence({ consumedAt: "2026-01-02T16:00:00.000Z", consumedAtSource: "user_declared", rawInput: null, entryKind: "legacy_daily_summary", ...fromImport })).toBe("unknown");
  });
  it("counts a declared meal in the window and keeps a clock meal out of it, without zero", () => {
    const d = dateAt(1);
    const carbs = (over: Partial<InsightsSource["meals"][number]>) => buildInsightsReadModel(history(oscillating(3), { meals: [meal({ id: "m", date: d, rawInput: null, carbsG: 70, ...over })] }), { today: "2027-01-01", permutations: 19 })
      .facts.days.find(day => day.date === d)!.sessions[0]!.context.carbsPre3h;
    expect(carbs({ consumedAtSource: "user_declared" })).toEqual({ value: 70, state: "recorded" });
    expect(carbs({ consumedAtSource: "default_clock" })).toEqual({ value: null, state: "untimed_meal_in_scope" });
    expect(carbs({ consumedAtSource: null })).toEqual({ value: null, state: "unverified_meal_time_in_scope" });
  });
  it("believes the positive marker only on a row an import run wrote: a token can write that text on its own rows", () => {
    const row = { consumedAt: "2026-01-02T16:00:00.000Z", consumedAtSource: null, rawInput: PROVEN, entryKind: "meal" };
    expect(mealTimeEvidence({ ...row, sourceType: "sheet_import", importRunId: "run" })).toBe("explicit");
    expect(mealTimeEvidence({ ...row, sourceType: "manual", importRunId: null })).toBe("unverified");
    expect(mealTimeEvidence({ ...row, sourceType: "chatgpt", importRunId: null })).toBe("unverified");
    expect(mealTimeEvidence({ ...row, sourceType: "manual", importRunId: "run" })).toBe("unverified");
    expect(mealTimeEvidence({ ...row, sourceType: "sheet_import", importRunId: null })).toBe("unverified");
    const d = dateAt(4);
    const carbs = (over: Partial<InsightsSource["meals"][number]>) => buildInsightsReadModel(history(oscillating(6), { meals: [meal({ id: "m", date: d, carbsG: 70, ...over })] }), { today: "2027-01-01", permutations: 19 })
      .facts.days.find(day => day.date === d)!.sessions[0]!.context.carbsPre3h;
    expect(carbs({})).toEqual({ value: 70, state: "recorded" });
    expect(carbs({ sourceType: "manual", importRunId: null })).toEqual({ value: null, state: "unverified_meal_time_in_scope" });
  });
  it("counts only explicit meals before the start, across midnight, and never turns absence into zero", () => {
    const d = dateAt(4), early = dateAt(3);
    const cases: [string, InsightsSource["meals"], number | undefined, string?][] = [
      ["inside", [meal({ id: "m", date: d, consumedAt: `${d}T16:00:00.000Z`, carbsG: 70 })], 70],
      ["after start", [meal({ id: "m", date: d, consumedAt: `${d}T18:30:00.000Z` })], undefined, "no_registered_meal_in_window"],
      ["exactly at start", [meal({ id: "m", date: d, consumedAt: `${d}T18:00:00.000Z` })], undefined, "no_registered_meal_in_window"],
      ["older than 3h", [meal({ id: "m", date: d, consumedAt: `${d}T14:59:00.000Z` })], undefined, "no_registered_meal_in_window"],
      ["null macro", [meal({ id: "m", date: d, carbsG: null })], undefined, "partial_macro"],
      ["recorded zero", [meal({ id: "m", date: d, carbsG: 0 })], 0],
      ["no provenance", [meal({ id: "m", date: d, rawInput: null })], undefined, "unverified_meal_time_in_scope"],
      ["invalid metadata", [meal({ id: "m", date: d, rawInput: "not json" })], undefined, "unverified_meal_time_in_scope"],
      ["registration time", [meal({ id: "m", date: d, rawInput: REGISTRATION })], undefined, "untimed_meal_in_scope"],
      ["legacy summary", [meal({ id: "m", date: d, entryKind: "legacy_daily_summary" })], undefined, "untimed_meal_in_scope"],
    ];
    for (const [name, meals, expected, reason] of cases) {
      const candidate = candidateOf(history(oscillating(6), { meals }), "meal_window:carbsG:pre_3h");
      expect(candidate.values.get(d), name).toBe(expected);
      if (reason) expect(candidate.exclusions[reason], name).toBeGreaterThan(0);
    }
    const midnight = history(oscillating(6), { meals: [meal({ id: "m", date: early, consumedAt: `${early}T23:30:00.000Z`, carbsG: 55 })] });
    const sessions = midnight.sessions.map(row => row.date === d ? { ...row, startedAt: `${d}T01:00:00.000Z`, endedAt: `${d}T02:00:00.000Z` } : row);
    expect(candidateOf({ ...midnight, sessions }, "meal_window:carbsG:pre_3h").values.get(d)).toBe(55);
  });
  it("keeps other windows and approximate times as sensitivities that do not replace the primary value", () => {
    const d = dateAt(4);
    const candidate = candidateOf(history(oscillating(6), { meals: [meal({ id: "x", date: d, consumedAt: `${d}T14:30:00.000Z`, carbsG: 30 })] }), "meal_window:carbsG:pre_3h");
    expect(candidate.values.has(d)).toBe(false); expect(candidate.sensitivities!.window_4h!.get(d)).toBe(30); expect(candidate.sensitivities!.window_2h!.has(d)).toBe(false);
    const approximate = candidateOf(history(oscillating(6), { meals: [meal({ id: "x", date: d, rawInput: REGISTRATION, carbsG: 30 })] }), "meal_window:carbsG:pre_3h");
    expect(approximate.values.has(d)).toBe(false); expect(approximate.sensitivities!.with_registration_time!.get(d)).toBe(30);
    const unproven = candidateOf(history(oscillating(6), { meals: [meal({ id: "x", date: d, rawInput: null, carbsG: 30 })] }), "meal_window:carbsG:pre_3h");
    expect(unproven.values.has(d)).toBe(false); expect(unproven.sensitivities!.with_registration_time!.has(d)).toBe(false); expect(unproven.sensitivities!.with_unverified_time!.get(d)).toBe(30);
    expect(unproven.exclusions.unverified_meal_time_in_scope).toBeGreaterThan(0);
    const sameDay = candidateOf(history(oscillating(6), { meals: [meal({ id: "x", date: d, rawInput: null })] }), "meal_window:carbsG:same_day_before_start");
    expect(sameDay.values.has(d)).toBe(false); expect(sameDay.exclusions.unverified_meal_time_in_scope).toBe(1);
    const model = buildInsightsReadModel(history(oscillating(6), { meals: [meal({ id: "x", date: d, rawInput: null }), meal({ id: "y", date: dateAt(1) })] }), { today: "2027-01-01", limit: 10, permutations: 19 });
    expect(model.limits.mealTimeEvidence).toEqual({ explicit: 1, registration: 0, unverified: 1, unknown: 0 });
    expect(model.facts.days.find(day => day.date === d)!.sessions[0]!.context.carbsPre3h).toEqual({ value: null, state: "unverified_meal_time_in_scope" });
  });
  it("uses pre feelings only when captured before the first set, and post feelings never as an exposure", () => {
    const d = dateAt(3), fact = (value: number, capturedAt: string | null, declaredMoment = "pre") => ({ value, instrumentVersion: "energy-fatigue/1", declaredMoment, declaredAt: capturedAt, capturedAt, source: "mobile", receivedAt: capturedAt ?? `${d}T19:00:00Z`, temporalQuality: capturedAt ? "unverified_client_clock" : "unknown" });
    const source = (facts: unknown) => history(oscillating(6), { feelings: [{ sessionId: "s3", revision: 1, facts }] });
    expect(candidateOf(source({ energyPre: fact(4, `${d}T17:59:00Z`) }), "feeling:energyPre:session").values.get(d)).toBe(4);
    expect(candidateOf(source({ energyPre: fact(4, `${d}T18:05:00Z`) }), "feeling:energyPre:session").values.get(d)).toBe(4);
    // #492: a receipt after the first set does not prove a late capture (offline use, a clock ahead): unknown. Only a legacy fact with no receipt reads late.
    const received = candidateOf(source({ energyPre: fact(4, `${d}T18:30:00Z`) }), "feeling:energyPre:session");
    expect(received.values.has(d)).toBe(false); expect(received.exclusions.feeling_capture_unknown).toBe(1); expect(received.exclusions.feeling_after_first_set).toBeUndefined();
    const late = candidateOf(source({ energyPre: { ...fact(4, `${d}T18:30:00Z`), receivedAt: undefined } }), "feeling:energyPre:session");
    expect(late.values.has(d)).toBe(false); expect(late.exclusions.feeling_after_first_set).toBe(1);
    expect(candidateOf(source({ energyPre: fact(4, null) }), "feeling:energyPre:session").exclusions.feeling_capture_unknown).toBe(1);
    const model = buildInsightsReadModel(source({ energyPost: fact(2, `${d}T19:01:00Z`, "post") }), { today: "2027-01-01", limit: 10, permutations: 19 });
    const ids = model.associations.items.map(item => item.id);
    expect(ids).toContain("feeling:fatiguePre:session"); expect(ids.some(id => id.includes("Post"))).toBe(false);
    expect(parseSessionFeelings({ energyPre: { value: 9, capturedAt: null, declaredMoment: "pre" } }, { startedAt: null, endedAt: null }, null)).toMatchObject({ invalid: 1 });
    expect(model.facts.days.find(day => day.date === d)!.sessions[0]!.context.feelings.energyPost).toMatchObject({ value: 2, timing: "post_declared", temporalQuality: "unverified_client_clock" });
  });
  it("leaves today's open day out of associations, and multi-session days out of session exposures", () => {
    const source = history(oscillating(5));
    const performance = buildPerformanceInsightsV1({ sessions: toPerformanceSessions(source).sessions, historyCoverage: "complete" });
    const table = buildExposureTable(source, strictOutcomeDays(performance.days), dateAt(4));
    expect(table.rows.some(row => row.date === dateAt(4))).toBe(false); expect(table.sourceExclusions.day_still_open).toBe(1);
    const twice = { ...source, sessions: [...source.sessions, { ...source.sessions[3]!, id: "again", startedAt: `${dateAt(3)}T20:00:00.000Z`, endedAt: `${dateAt(3)}T21:00:00.000Z` }],
      exercises: [...source.exercises, { ...source.exercises[3]!, id: "eagain", sessionId: "again" }], sets: [...source.sets, { ...source.sets[3]!, id: "setagain", sessionExerciseId: "eagain", completedAt: `${dateAt(3)}T20:10:00.000Z` }] };
    expect(candidateOf(twice, "meal_window:carbsG:pre_3h").exclusions.multiple_sessions_day).toBe(1);
    expect(candidateOf(twice, "feeling:energyPre:session").exclusions.multiple_sessions_day).toBe(1);
  });
});

describe("asociaciones", () => {
  const rows = (ys: readonly number[], routine = "r"): ObservationRow[] => ys.map((y, i) => ({ date: dateAt(i), y, ySensitivity: y, routineKey: routine }));
  const candidate = (id: string, xs: readonly (number | null)[]): Candidate => ({ exclusions: {}, definition: { id, family: "metric", window: "same_day", subject: id, temporalBasis: "same_day_unordered" },
    values: new Map(xs.flatMap((x, i) => x === null ? [] : [[dateAt(i), x] as const])) });
  const random = seededRandom(7);
  const noise = Array.from({ length: 120 }, () => random());
  it("reports ties by average rank and Spearman exactly", () => {
    expect([...ranks([3, 1, 3, 0])]).toEqual([3.5, 2, 3.5, 1]); expect(spearman([1, 2, 3], [10, 20, 30])).toBeCloseTo(1); expect(spearman([1, 1], [1, 2])).toBeNull();
  });
  it("is deterministic, and a block permutation is a real permutation", () => {
    const a = evaluateAssociations(rows(noise), [candidate("x", noise.map(v => 1 - v))], { permutations: 49 });
    expect(evaluateAssociations(rows(noise), [candidate("x", noise.map(v => 1 - v))], { permutations: 49 })).toEqual(a);
    expect([...blockPermutation(50, 14, seededRandom(1))].sort((x, y) => x - y)).toEqual(Array.from({ length: 50 }, (_, i) => i));
  });
  it("abstains below the minimum, without variation and with too little variation", () => {
    expect(evaluateAssociations(rows(noise.slice(0, 19)), [candidate("few", noise.slice(0, 19))], { permutations: 19 }).items[0]).toMatchObject({ state: "insufficient_data", reason: "too_few_pairs", rho: null, pairs: 19 });
    expect(evaluateAssociations(rows(noise), [candidate("flat", noise.map(() => 4))], { permutations: 19 }).items[0]).toMatchObject({ state: "insufficient_data", reason: "no_variation" });
    expect(evaluateAssociations(rows(noise), [candidate("rare", noise.map((_, i) => i >= 50 && i < 53 ? 0 : 1))], { permutations: 19 }).items[0]).toMatchObject({ state: "insufficient_data", reason: "sparse_variation", groups: null });
    expect(evaluateAssociations(rows(noise), [candidate("binary", noise.map((_, i) => i % 2))], { permutations: 19 }).items[0]!.reason).not.toBe("no_variation");
  });
  describe("valores repetidos", () => {
    const n = 60, x = Array.from({ length: n }, (_, i) => i % 3 === 0 ? 1 : 0);
    it("keeps both real values of a binary exposure, even when the median is the minimum", () => {
      const [item] = evaluateAssociations(rows(x.map(v => v ? 0.8 : 0.1)), [candidate("binary", x)], { permutations: 199 }).items;
      expect(item!.reason).not.toBe("sparse_variation"); expect(item!.rho).toBeCloseTo(1);
      expect(item!.groups).toEqual({ rule: "median_balanced_ties", cut: 0, lowIncludesCut: true, low: { days: 40, min: 0, max: 0, meanOutcome: expect.closeTo(0.1) }, high: { days: 20, min: 1, max: 1, meanOutcome: expect.closeTo(0.8) } });
      expect(item!.stability.withoutExtremesRho).toBeCloseTo(1);
      const mirrored = evaluateAssociations(rows(x.map(v => v ? 0.8 : 0.1)), [candidate("mirrored", x.map(v => 1 - v))], { permutations: 19 }).items[0]!;
      expect(mirrored.groups).toMatchObject({ cut: 1, lowIncludesCut: false, low: { days: 20, min: 0, max: 0 }, high: { days: 40, min: 1, max: 1 } });
    });
    it("does not force a significant result on an unrelated binary exposure", () => {
      const results = Array.from({ length: 30 }, (_, seed) => {
        const own = seededRandom(5000 + seed), ys = x.map(() => own());
        return evaluateAssociations(rows(ys), [candidate("binary", x)], { permutations: 99, seed }).items[0]!;
      });
      expect(results.every(item => item.groups !== null && item.groups.high.days === 20)).toBe(true);
      expect(results.filter(item => item.strictGate)).toHaveLength(0);
      expect(results.filter(item => item.state === "exploratory").length).toBeLessThanOrEqual(4);
    });
    it("never separates equal values, and the outcome cannot move the split", () => {
      const tied = [1, 1, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3];
      const groups = descriptiveGroups(tied, tied.map(() => 0.5))!;
      expect(groups).toMatchObject({ cut: 2, lowIncludesCut: true, low: { days: 13, min: 1, max: 2 }, high: { days: 7, min: 3, max: 3 } });
      const other = descriptiveGroups(tied, tied.map((_, i) => i / 20))!;
      expect([other.cut, other.lowIncludesCut, other.low.days, other.high.days]).toEqual([groups.cut, groups.lowIncludesCut, groups.low.days, groups.high.days]);
    });
    it("separates eligibility from the groups: small sides hide the groups without deciding the state", () => {
      const lopsided = Array.from({ length: 56 }, (_, i) => [10, 30, 50].includes(i) ? 1 : [5, 25, 45].includes(i) ? 3 : 2);
      const [item] = evaluateAssociations(rows(lopsided.map((_, i) => (i * 7 % 10) / 10)), [candidate("lopsided", lopsided)], { permutations: 19 }).items;
      expect(item!.groups).toBeNull(); expect(item!.reason).not.toBe("sparse_variation"); expect(item!.rho).not.toBeNull();
    });
    it("reaches the contract through the read model", () => {
      const source = history(oscillating(30), { metricDefinitions: [{ id: METRIC, name: "M", unit: null, valueType: "integer", archived: false }], metricValues: oscillating(30).map((_, day) => ({ metricId: METRIC, date: dateAt(day), value: day % 3 ? 0 : 1 })) });
      const model = buildInsightsReadModel(source, { today: "2027-01-01", permutations: 19 });
      expect(model.associations.items.find(row => row.id === `metric:${METRIC}:same_day`)!.groups).toMatchObject({ rule: "median_balanced_ties", cut: 0, lowIncludesCut: true });
      expect(parseCompleteInsights(JSON.parse(JSON.stringify(model)))).toBeTruthy();
    });
  });
  it("finds a strong planted relation only as exploratory, with coverage and groups", () => {
    const xs = noise.map(v => v + (random() - 0.5) * 0.2);
    const [item] = evaluateAssociations(rows(noise), [candidate("real", xs)], { permutations: 199 }).items;
    expect(item).toMatchObject({ state: "exploratory", pairs: 120, outcomeDays: 120, coverage: 1 }); expect(item!.rho!).toBeGreaterThan(0.7);
    expect(item!.groups!.high.meanOutcome).toBeGreaterThan(item!.groups!.low.meanOutcome); expect(item!.strictGate).toBe(true);
    const model = buildInsightsReadModel(history(oscillating(30)), { today: "2027-01-01", permutations: 19 });
    expect(model.associations.promotion).toEqual({ status: "not_enabled", reason: "risk_budget_not_approved", candidateRiskBudget: 0.01 });
    expect(JSON.stringify(model)).not.toContain("strictGate"); expect(JSON.stringify(model)).not.toContain("consistent");
  });
  it("does not read a shared slow drift as a relation", () => {
    // A single history can land in the tail, which is what calibration measures. The drift itself must not create a relation.
    const items = Array.from({ length: 40 }, (_, seed) => {
      const own = seededRandom(1000 + seed), series = () => noise.map((_, i) => i / 120 + own() * 0.05);
      return evaluateAssociations(rows(series()), [candidate("trend", series())], { permutations: 49 }).items[0]!;
    });
    expect(items.every(item => item.rho! > 0.9)).toBe(true);
    expect(Math.abs(items.reduce((sum, item) => sum + item.localRho!, 0) / items.length)).toBeLessThan(0.1);
    expect(items.filter(item => item.strictGate).length).toBeLessThanOrEqual(4);
  });
  it("flags selective absence and blocks an effect that depends on one routine", () => {
    const ys = noise, xs = ys.map((y, i) => y > 0.5 && i % 10 ? null : y + (random() - 0.5) * 0.1);
    const [selective] = evaluateAssociations(rows(ys), [candidate("selective", xs)], { permutations: 99 }).items;
    expect(Math.abs(selective!.stability.selectiveAbsenceGap!)).toBeGreaterThan(0.15); expect(selective!.strictGate).toBe(false);
    const mixed: ObservationRow[] = ys.map((y, i) => ({ date: dateAt(i), y, ySensitivity: y, routineKey: i < 60 ? "a" : "b" }));
    const onlyA = ys.map((y, i) => i < 60 ? y : random());
    expect(evaluateAssociations(mixed, [candidate("routine", onlyA)], { permutations: 99 }).items[0]!.stability.leaveOneRoutineOutAgrees).toBe(false);
  });
  it("corrects across the whole family, however many candidates end up shown", () => {
    const ys = noise, weak = ys.map(y => y + (random() - 0.5) * 2.2);
    const alone = evaluateAssociations(rows(ys), [candidate("weak", weak)], { permutations: 199 }).items[0]!;
    const family = evaluateAssociations(rows(ys), [candidate("weak", weak), ...Array.from({ length: 30 }, (_, k) => candidate(`null${k}`, ys.map(() => random())))], { permutations: 199 }).items[0]!;
    expect(family.familyAdjustedP!).toBeGreaterThanOrEqual(alone.familyAdjustedP!);
    expect(family.familyAdjustedP!).toBeGreaterThanOrEqual(family.permutationP!);
  });
});
