import { describe, expect, it, vi } from "vitest";
import { parsePerformanceInsights } from "../../mobile-api/performance-insights-contract";
import { buildExposureContext } from "./exposures";
import * as exposures from "./exposures";
import { describeFeelingOutcome, FEELING_OUTCOME_PREFIX, prepareFeelingAssociations, stratifiedRows } from "./feeling-outcomes";
import { createInsightsSnapshot, insightsFeelingOutcomes, insightsRelations, insightsSummary } from "./read-model";
import type { InsightsSource } from "./types";

const today = "2029-06-01";
const id = (group: number, n: number) => `93670000-0000-4000-8${String(group).padStart(3, "0")}-${String(n).padStart(12, "0")}`;
type Answer = { value: unknown; at?: string | null; instrument?: string; source?: string } | "unreadable";
type Day = { date: string; pre?: { energy?: Answer; fatigue?: Answer }; post?: { energy?: Answer; fatigue?: Answer }; legacy?: number; noEnd?: boolean };
/** One session per entry, 18:00 to 19:00. A pre answer defaults to 17:55, a post one to 19:01. */
function history(days: Day[]): InsightsSource {
  const sessions: InsightsSource["sessions"][number][] = [], feelings: InsightsSource["feelings"][number][] = [];
  days.forEach((day, index) => {
    const session = id(2, index), start = `${day.date}T18:00:00.000Z`, end = `${day.date}T19:00:00.000Z`;
    sessions.push({ id: session, date: day.date, routineId: "r1", routineName: null, name: null, status: "completed", startedAt: start, endedAt: day.noEnd ? null : end,
      performanceLevel: null, painLevel: null, legacyEnergyLevel: day.legacy ?? null });
    const facts: Record<string, unknown> = {};
    for (const [moment, answers] of [["Pre", day.pre], ["Post", day.post]] as const) for (const kind of ["energy", "fatigue"] as const) {
      const answer = answers?.[kind];
      if (!answer) continue;
      facts[`${kind}${moment}`] = answer === "unreadable" ? { value: "alta" } : { value: answer.value, instrumentVersion: answer.instrument ?? "energy-fatigue/1", declaredMoment: moment.toLowerCase(),
        declaredAt: null, capturedAt: answer.at === undefined ? `${day.date}T${moment === "Pre" ? "17:55" : "19:01"}:00.000Z` : answer.at, source: answer.source ?? "mobile" };
    }
    if (Object.keys(facts).length) feelings.push({ sessionId: session, revision: 1, facts });
  });
  return { sessions, exercises: [], sets: [], feelings, metricDefinitions: [], metricValues: [], meals: [] };
}
const both = (energy: number, fatigue: number) => ({ energy: { value: energy }, fatigue: { value: fatigue } });
const outcome = (source: InsightsSource, kind: "energy" | "fatigue") => ({ summary: describeFeelingOutcome(source, kind, buildExposureContext(source), today),
  ...prepareFeelingAssociations(source, kind, { today, method: 2 }) });

describe("#367 energía y fatiga al terminar como resultados", () => {
  it("counts each answer at the finish by its prior answer, and keeps late, unknown, unreadable and other instruments apart", () => {
    const source = history([
      { date: "2029-03-01", pre: both(2, 1), post: both(4, 3) },
      { date: "2029-03-02", pre: both(4, 2), post: both(4, 4) },
      { date: "2029-03-03", pre: both(4, 2), post: { energy: { value: 5, at: "2029-03-04T09:00:00.000Z" }, fatigue: { value: 2, source: "web" } } },
      { date: "2029-03-04", pre: { energy: { value: 3, at: "2029-03-04T18:30:00.000Z" } }, post: { energy: { value: 3, at: null }, fatigue: "unreadable" } },
      { date: "2029-03-05", post: { energy: { value: 2 }, fatigue: { value: 2, instrument: "energy-fatigue/2" } } },
      { date: "2029-03-06", legacy: 4 },
    ]);
    const energy = outcome(source, "energy").summary, fatigue = outcome(source, "fatigue").summary;
    expect(energy.sessions).toEqual({ completed: 6, answered: 5, notRecorded: 1, unreadable: 0, otherInstrument: 0 });
    expect(energy.capture).toEqual({ atFinish: 3, late: 1, captureUnknown: 1, beforeStart: 0 });
    // Ended high after starting low, and after starting high: two different rows, never one "high".
    expect(energy.byPrior[1]!.posts).toEqual([0, 0, 0, 1, 0]);
    expect(energy.byPrior[3]!.posts).toEqual([0, 0, 0, 1, 0]);
    expect(energy.priorNotComparable).toEqual({ posts: [0, 1, 0, 0, 0], reasons: { not_recorded: 1, unreadable: 0, capture_unknown: 0, after_first_set: 0 } });
    // The old flow's energy has no moment: counted apart, never as an answer at the end.
    expect(energy.legacyEnergyOnly).toBe(1);
    expect(fatigue.sessions).toEqual({ completed: 6, answered: 3, notRecorded: 1, unreadable: 1, otherInstrument: 1 });
    expect(fatigue.source).toEqual({ mobile: 2, web: 1, unknown: 0 });
    expect(fatigue.legacyEnergyOnly).toBeNull();
  });

  it("reads each feeling on its own: fatigue never comes from energy, and nothing is combined", () => {
    const base = [{ date: "2029-03-01", pre: both(3, 3), post: both(3, 3) }, { date: "2029-03-02", pre: both(3, 3), post: both(3, 3) }];
    const changed = base.map(day => ({ ...day, post: { ...day.post, energy: { value: 5 } } }));
    expect(outcome(history(changed), "fatigue").summary).toEqual(outcome(history(base), "fatigue").summary);
    expect(outcome(history(changed), "energy").summary).not.toEqual(outcome(history(base), "energy").summary);
    const body = JSON.stringify(insightsFeelingOutcomes(createInsightsSnapshot(history(base), { today, method: 2 })));
    for (const word of ["mean", "average", "score", "delta", "difference", "rho"]) expect(body).not.toMatch(new RegExp(`"${word}`, "i"));
  });

  it("uses one row per closed day with one session and a comparable prior answer", () => {
    const source = history([
      { date: "2029-03-01", pre: both(2, 2), post: both(3, 3) },
      { date: "2029-03-02", pre: both(2, 2), post: both(3, 3) },
      { date: "2029-03-02", pre: both(4, 4), post: both(5, 5) },
      { date: "2029-03-03", pre: { energy: { value: 3, at: "2029-03-03T18:40:00.000Z" } }, post: both(3, 3) },
      { date: today, pre: both(2, 2), post: both(3, 3) },
    ]);
    const { summary, rows } = outcome(source, "energy");
    expect(rows.map(row => row.date)).toEqual(["2029-03-01"]);
    expect(summary.days).toEqual({ eligible: 1, exclusions: { multiple_sessions_day: 2, prior_capture_unknown: 1, day_still_open: 1 } });
  });

  it("ranks the outcome within its prior level: ties stay tied, a lone level says nothing, and levels never mix", () => {
    const rows = stratifiedRows([
      { date: "2029-03-01", pre: 2, post: 3, routineId: null }, { date: "2029-03-02", pre: 2, post: 5, routineId: null }, { date: "2029-03-03", pre: 2, post: 3, routineId: null },
      { date: "2029-03-04", pre: 4, post: 1, routineId: null }, { date: "2029-03-05", pre: 4, post: 2, routineId: null }, { date: "2029-03-06", pre: 5, post: 5, routineId: null },
    ]);
    expect(rows.map(row => +row.y.toFixed(4))).toEqual([0.3333, 0.8333, 0.3333, 0.25, 0.75, 0.5]);
    // A 5 after a 2 and a 2 after a 4 are each the top of their own level: absolute levels are not compared across them.
    expect(rows[1]!.y).toBeGreaterThan(rows[3]!.y);
  });

  it("tests its own family of candidates, never the prior feelings, and publishes no association", () => {
    const source = history(Array.from({ length: 30 }, (_, day) => ({ date: `2029-0${3 + Math.floor(day / 28)}-${String(day % 28 + 1).padStart(2, "0")}`, pre: both(1 + day % 5, 1 + (day * 2) % 5), post: both(1 + (day * 3) % 5, 1 + day % 5) })));
    const snapshot = createInsightsSnapshot({ ...source, metricDefinitions: [{ id: id(9, 1), name: "M", unit: null, valueType: "decimal", archived: false }],
      metricValues: source.sessions.map((session, day) => ({ metricId: id(9, 1), date: session.date!, value: day % 7 })) }, { today, method: 2, permutations: 19 });
    for (const summary of snapshot.feelingOutcomes) {
      // Prepared only on an explicit request, never by the snapshot.
      const prepared = prepareFeelingAssociations(source.metricDefinitions.length ? source : { ...source, metricDefinitions: [{ id: id(9, 1), name: "M", unit: null, valueType: "decimal", archived: false }],
        metricValues: source.sessions.map((session, day) => ({ metricId: id(9, 1), date: session.date!, value: day % 7 })) }, summary.kind, { today, method: 2 });
      expect(prepared.candidates.length).toBeGreaterThan(0);
      expect(prepared.candidates.every(candidate => candidate.definition.family !== "feeling" && candidate.definition.id.startsWith(`${FEELING_OUTCOME_PREFIX}${summary.outcomeKey}:`))).toBe(true);
      expect(prepared.rows).toHaveLength(summary.days.eligible);
      expect(prepared.evaluate(19).items).toHaveLength(prepared.candidates.length);
    }
    const body = JSON.parse(JSON.stringify(insightsFeelingOutcomes(snapshot)));
    expect(body.outcomes.map((row: { associations: unknown }) => row.associations)).toEqual([expect.objectContaining({ status: "not_published" }), expect.objectContaining({ status: "not_published" })]);
    expect(JSON.stringify(body)).not.toContain(FEELING_OUTCOME_PREFIX);
    // The other views do not carry them.
    for (const view of [insightsSummary(snapshot), insightsRelations(snapshot)]) expect(JSON.stringify(view)).not.toContain(FEELING_OUTCOME_PREFIX);
    expect(parsePerformanceInsights(body)?.view).toBe("feelings");
  });

  it("describes without preparing any association: no ranks, exposure table or candidates for the views (#412)", () => {
    const source = history(Array.from({ length: 30 }, (_, day) => ({ date: `2029-0${3 + Math.floor(day / 28)}-${String(day % 28 + 1).padStart(2, "0")}`, pre: both(1 + day % 5, 2), post: both(1 + (day * 3) % 5, 3) })));
    const table = vi.spyOn(exposures, "buildExposureTable");
    const snapshot = createInsightsSnapshot(source, { today, method: 2 });
    // The performance lanes build theirs, strict and partial; the feelings add none.
    expect(table).toHaveBeenCalledTimes(2);
    for (const view of [insightsFeelingOutcomes(snapshot), insightsSummary(snapshot), insightsRelations(snapshot)]) JSON.stringify(view);
    expect(table).toHaveBeenCalledTimes(2);
    table.mockRestore();
    // What the snapshot keeps of them is the published description and nothing else.
    expect(snapshot.feelingOutcomes).toEqual(insightsFeelingOutcomes(snapshot).outcomes);
    for (const summary of snapshot.feelingOutcomes) expect(Object.keys(summary).sort()).toEqual(["associations", "byPrior", "capture", "days", "firstDate", "instrument", "kind", "lastDate", "legacyEnergyOnly", "methodVersion", "outcomeKey", "priorKey", "priorNotComparable", "sessions", "source"]);
    // And the experimental preparation, asked for, rests on the same days the description counts.
    for (const summary of snapshot.feelingOutcomes) expect(prepareFeelingAssociations(source, summary.kind, { today, method: 2 }).rows).toHaveLength(summary.days.eligible);
  });

  it("is refused by the contract when its parts do not add up to the whole", () => {
    const body = JSON.parse(JSON.stringify(insightsFeelingOutcomes(createInsightsSnapshot(history([{ date: "2029-03-01", pre: both(2, 2), post: both(4, 3) }, { date: "2029-03-02", post: both(3, 3) }]), { today, method: 2 }))));
    expect(parsePerformanceInsights(body)).toBeDefined();
    for (const tamper of [
      (b: typeof body) => { b.outcomes[0].byPrior[1].posts[3]++; },
      (b: typeof body) => { b.outcomes[0].capture.late++; },
      (b: typeof body) => { b.outcomes[1].legacyEnergyOnly = 0; },
      (b: typeof body) => { b.outcomes[0].associations.status = "published"; },
      (b: typeof body) => { b.outcomes[0].associations.items = []; },
      (b: typeof body) => { b.outcomes.reverse(); },
      (b: typeof body) => { b.outcomes[0].byPrior[0].posts.push(0); },
    ]) { const copy = structuredClone(body); tamper(copy); expect(parsePerformanceInsights(copy)).toBeUndefined(); }
  });
});
