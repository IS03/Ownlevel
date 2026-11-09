import { describe, expect, it } from "vitest";
import { developmentHistory, DEVELOPMENT_ANCHOR } from "./development-fixtures";
import { encoderFor, encode, fit, probabilities, rankedProbabilityScore, supportFor, supportReason, type Labeled } from "./model";
import { monthAfter, prepare, type Snapshot } from "./preparation";
import { evaluateCut, runPrototype, snapshotHash } from "./procedure";

const anchor = DEVELOPMENT_ANCHOR;
const histories = developmentHistory(17011, "effect", 12);
const clone = <T>(value: T): T => structuredClone(value);
const pair = () => ({ train: clone(histories[3]), evaluation: clone(histories[4]) });
function alterPost(snapshot: Snapshot, change: (fact: Record<string, unknown>, index: number) => void) {
  snapshot.source.feelings.forEach((row, i) => { const facts = row.facts as { energyPost: Record<string, unknown> }; change(facts.energyPost, i); });
}
function vector(result: ReturnType<typeof evaluateCut>) { return result.predictions.map(row => ({ id: row.id, baseline: row.baseline, extended: row.extended })); }

describe("isolated protein → energy research prototype", () => {
  it("checks a uniform categorical model and ordered loss against a hand calculation", () => {
    const model = fit([[1], [1], [1], [1], [1]], [1, 2, 3, 4, 5]);
    probabilities(model.weights, [1]).forEach(p => expect(p).toBeCloseTo(0.2, 14));
    // Y=3: (0.2−0)^2+(0.4−0)^2+(0.6−1)^2+(0.8−1)^2 = 0.4.
    expect(rankedProbabilityScore([0.2, 0.2, 0.2, 0.2, 0.2], 3)).toBeCloseTo(0.4, 14);
    expect(rankedProbabilityScore([0, 0, 1, 0, 0], 3)).toBe(0);
    expect(() => rankedProbabilityScore([0, 0, 1, 0, 0], 0)).toThrow();
  });
  it("keeps valid normalized probabilities even for extreme finite logits", () => {
    const p = probabilities([[1000], [-1000], [500], [0], [-500]], [1]);
    expect(p.every(value => Number.isFinite(value) && value >= 0 && value <= 1)).toBe(true);
    expect(p.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 14);
    expect(() => probabilities([[Infinity], [0], [0], [0], [0]], [1])).toThrow();
  });
  it("separates response timing, malformed/unknown clocks and exact window boundaries", () => {
    const snapshot = clone(histories[1]), sessions = snapshot.source.sessions;
    const offsets = [-60_000, 0, 2 * 3_600_000, 2 * 3_600_000 + 1];
    alterPost(snapshot, (fact, i) => { if (i < 4) fact.capturedAt = new Date(Date.parse(sessions[i].endedAt!) + offsets[i]).toISOString(); else fact.capturedAt = null; });
    const result = prepare(snapshot, anchor);
    expect(result.targetCounts.before_end).toBe(1);
    expect(result.targetCounts.in_window).toBe(2);
    expect(result.targetCounts.late).toBe(1);
    expect(result.targetCounts.time_unknown).toBe(sessions.length - 4);
    expect(result.jointEligible).toBe(2);
  });
  it("reuses explicit meal provenance across midnight and distinguishes zero from missing or unknown hours", () => {
    const snapshot = clone(histories[1]), first = snapshot.source.sessions[0];
    Object.assign(first, { date: "2022-01-01", startedAt: "2022-01-01T01:00:00-03:00", endedAt: "2022-01-01T02:00:00-03:00" });
    const facts = snapshot.source.feelings[0].facts as Record<string, Record<string, unknown>>;
    facts.energyPre.capturedAt = "2022-01-01T00:59:00-03:00";
    facts.energyPost.capturedAt = "2022-01-01T02:05:00-03:00";
    const meal = snapshot.source.meals[0];
    Object.assign(meal, { date: "2021-12-31", consumedAt: "2021-12-31T23:00:00-03:00", proteinG: 0 });
    expect(prepare(snapshot, anchor).rows.find(row => row.id === first.id)?.protein).toBe(0);
    meal.consumedAt = null;
    expect(prepare(snapshot, anchor).rows.some(row => row.id === first.id)).toBe(false);
    expect(prepare(snapshot, anchor).exclusions["protein:untimed_meal_in_scope"]).toBeGreaterThan(0);
    meal.consumedAt = "2021-12-31T23:00:00-03:00"; meal.proteinG = null;
    expect(prepare(snapshot, anchor).exclusions["protein:partial_macro"]).toBeGreaterThan(0);
  });
  it("rejects ambiguous days, identifiers, invalid times, missing routines and post-as-pre", () => {
    const snapshot = clone(histories[1]);
    Object.assign(snapshot.source.sessions[0], { endedAt: "not-a-time" });
    Object.assign(snapshot.source.sessions[1], { routineId: null });
    const facts = snapshot.source.feelings[2].facts as Record<string, Record<string, unknown>>;
    facts.energyPre.capturedAt = snapshot.source.sessions[2].endedAt;
    const prepared = prepare(snapshot, anchor);
    expect(prepared.exclusions.invalid_session_time).toBe(1);
    expect(prepared.exclusions.unknown_routine).toBe(1);
    expect(prepared.exclusions.ineligible_pre_energy).toBe(1);
    const duplicate = clone(snapshot); (duplicate.source.sessions as unknown[]).push(clone(duplicate.source.sessions[4]));
    expect(prepare(duplicate, anchor).exclusions.multiple_completed_sessions_in_day).toBe(2);
  });
  it("does not use evaluation labels to fit, select predictions or normalize exposure", () => {
    const { train, evaluation } = pair(), before = evaluateCut(anchor, 12, train, evaluation), changed = clone(evaluation);
    alterPost(changed, fact => { fact.value = 6 - Number(fact.value); });
    const after = evaluateCut(anchor, 12, train, changed);
    expect(before.predictions.length).toBeGreaterThan(24);
    expect(vector(after)).toEqual(vector(before));
    expect(before.loss).not.toEqual(after.loss);
    expect(new Set(before.trainingIds.filter(id => before.predictions.some(row => row.id === id))).size).toBe(0);
    expect(before.fits!.columns).toBeLessThanOrEqual(14);
    for (const prediction of before.predictions) for (const p of [prediction.baseline, prediction.extended]) {
      expect(p.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
      expect(p.every(v => Number.isFinite(v) && v >= 0 && v <= 1)).toBe(true);
    }
  });
  it("never alters earlier predictions when future snapshots/observations change", () => {
    const first = runPrototype({ anchor, throughMonth: 9, snapshots: histories.slice(0, 4) });
    const changed = clone(histories); alterPost(changed[4], fact => { fact.value = 1; });
    const later = runPrototype({ anchor, throughMonth: 12, snapshots: changed });
    expect(later.deliveries.slice(0, 3)).toEqual(first.deliveries);
  });
  it("explicitly abstains for globally constant exposure and variation only between routines", () => {
    const confounded = developmentHistory(17011, "confounded", 12);
    const result = evaluateCut(anchor, 12, confounded[3], confounded[4]);
    expect(result.state).toBe("abstain");
    expect(result.supportExclusions.no_within_context_variation).toBeGreaterThan(0);
    const { train, evaluation } = pair();
    for (const snapshot of [train, evaluation]) for (const meal of snapshot.source.meals) meal.proteinG = 0;
    expect(evaluateCut(anchor, 12, train, evaluation).reasons).toContain("constant_or_sparse_exposure");
  });
  it("abstains for new routines and never extrapolates beyond a past cell's range", () => {
    const { train, evaluation } = pair();
    for (const session of evaluation.source.sessions) if (session.date! >= train.asOf) session.routineId = "new-routine";
    const result = evaluateCut(anchor, 12, train, evaluation);
    expect(result.reasons).toContain("no_supported_evaluation_rows");
    expect(result.supportExclusions.new_context).toBeGreaterThan(0);
    const rows = Array.from({ length: 12 }, (_, i): Labeled => ({ id: `${i}`, date: anchor, routine: "a", pre: 3, hour: 18, weekday: 1, protein: i, y: 3 }));
    expect(supportReason({ ...rows[0], protein: 100 }, supportFor(rows))).toBe("outside_past_exposure_range");
    expect(supportReason({ ...rows[0], hour: 8 }, supportFor(rows))).toBe("new_context");
    const encoder = encoderFor(rows, anchor);
    expect(encode({ ...rows[0], protein: 1e9 }, encoder, true).at(-1)).toBe(3);
  });
  it("reports selective target absence without imputing it or silently changing its denominator", () => {
    const { train, evaluation } = pair(), clean = evaluateCut(anchor, 12, train, evaluation);
    alterPost(evaluation, (fact, i) => { if (evaluation.source.sessions[i].date! >= train.asOf && evaluation.source.meals[i].proteinG! <= 50) fact.capturedAt = null; });
    const missing = evaluateCut(anchor, 12, train, evaluation);
    expect(vector(missing)).toEqual(vector(clean));
    expect(missing.state).toBe("abstain");
    expect(missing.reasons).toContain("insufficient_evaluation_coverage");
    expect(missing.evaluation!.completed).toBe(clean.evaluation!.completed);
    expect(missing.responseCoverageByProtein!.low.answered).toBe(0);
    expect(missing.predictions.some(row => row.y === null && row.baselineLoss === null)).toBe(true);
  });
  it("counts fixed scheduled opportunities, replays queries, and invalidates revised history without another chance", () => {
    const input = { anchor, throughMonth: 9, snapshots: histories.slice(0, 4) }, first = runPrototype(input);
    expect(first.deliveries).toHaveLength(3);
    expect(first.deliveries[0].receipt.result.reasons).toContain("too_few_training_rows");
    const replay = runPrototype({ ...input, previous: first.ledger });
    expect(replay.deliveries.every(row => row.replayed && !row.newOpportunity)).toBe(true);
    expect(replay.ledger).toEqual(first.ledger);
    const changed = clone(histories); alterPost(changed[2], fact => { fact.value = 1; });
    const revised = runPrototype({ ...input, throughMonth: 12, snapshots: changed, previous: first.ledger });
    expect(revised.deliveries[2].receipt.result.reasons).toContain("history_revision_changed");
    expect(revised.deliveries[2].newOpportunity).toBe(false);
    expect(revised.deliveries[3].receipt.result.reasons).toContain("history_revision_changed");
    expect(revised.ledger.slice(0, 3)).toEqual(first.ledger);
    expect(first.publicable).toBe(false); expect(first.associationDirection).toBe("not_inferred");
  });
  it("requires exact as-of snapshots, first-of-month anchors and valid calendar boundaries including leap years", () => {
    expect(monthAfter("2023-12-01", 3)).toBe("2024-03-01");
    expect(() => monthAfter("2023-02-29", 3)).toThrow();
    expect(() => runPrototype({ anchor: "2022-01-02", throughMonth: 3, snapshots: [] })).toThrow();
    expect(runPrototype({ anchor, throughMonth: 3, snapshots: [] }).deliveries[0].receipt.result.reasons).toEqual(["missing_as_of_snapshot"]);
    expect(() => evaluateCut(anchor, 12, histories[2], histories[4])).toThrow();
  });
  it("uses stable snapshot fingerprints while retaining row revisions", () => {
    const snapshot = clone(histories[1]), hash = snapshotHash(snapshot);
    (snapshot.source.sessions as unknown[]).reverse();
    expect(snapshotHash(snapshot)).toBe(hash);
    snapshot.revision += "-edited"; expect(snapshotHash(snapshot)).not.toBe(hash);
  });
});
