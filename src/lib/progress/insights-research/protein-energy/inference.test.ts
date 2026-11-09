import { describe, expect, it } from "vitest";
import { exact95, binomialCdf } from "./binomial-interval";
import { developmentHistory, DEVELOPMENT_ANCHOR as anchor } from "./development-fixtures";
import { INFERENCE, crossesThreshold, initialEvidence, logEvidence, updateEvidence } from "./inference";
import { fitBlock, forecastBeforeResponse, forecastDigest, type Forecast } from "./prospective";
import { createResearchLedger, openResearchBlock, commitResearchForecast, resolveResearchForecast, closeResearchCut, type Resolution } from "./research-ledger";
import { monthAfter } from "./preparation";
import { scenarioProbabilities, generateScenario } from "./scenario-generator";
import { protocolHash, planJobs } from "./reserved-protocol";

const histories = developmentHistory(17011, "effect", 12);
const models = [3, 6, 9, 12].map(month => fitBlock(anchor, month, histories[month / 3 - 1], histories.slice(0, month / 3 - 1)));
function opened() {
  let ledger = createResearchLedger("development-only", anchor);
  for (const model of models.slice(0, 3)) ledger = closeResearchCut(openResearchBlock(ledger, model), { month: model.month, completed: 0, revisionHash: `closed-${model.month}` });
  return openResearchBlock(ledger, models[3]);
}
function forecast(i = 0): Forecast {
  const date = new Date(Date.parse("2022-10-01") + i * 86_400_000).toISOString().slice(0, 10);
  const f: Omit<Forecast, "digest"> = { month: 12, modelHash: models[3].modelHash, trainingHash: models[3].trainingHash, id: `independent-${i}`, date,
    endedAt: `${date}T18:00:00-03:00`, committedAt: `${date}T18:01:00-03:00`, sourceHash: "independent-test-receipt",
    features: { id: `independent-${i}`, date, routine: "test", pre: 3, hour: 17, weekday: 1, protein: 20 }, baseline: [1, 0, 0, 0, 0], extended: [0, 0, 0, 0, 1] };
  return { ...f, digest: forecastDigest(f) };
}
function resolution(f: Forecast, value: number | null = 5): Resolution {
  const nextDay = new Date(Date.parse(f.date) + 86_400_000).toISOString().slice(0, 10);
  return { value, capturedAt: value === null ? null : `${f.date}T18:05:00-03:00`, resolvedAt: `${nextDay}T00:00:01-03:00`, instrumentVersion: "energy-fatigue/1", declaredMoment: "post", completedOnDay: 1 };
}
describe("joint temporal research inference", () => {
  it("matches a closed-form e-value, not another run of the implementation", () => {
    const result = updateEvidence(initialEvidence(), 4);
    // z=1: exp(lambda−psi(lambda)) = (1−lambda)*exp(2*lambda).
    const expected = INFERENCE.lambdas.reduce((sum, l) => sum + (1 - l) * Math.exp(2 * l), 0) / INFERENCE.lambdas.length;
    expect(Math.exp(result.logE)).toBeCloseTo(expected, 14);
    const second = updateEvidence(result, -4);
    expect(second.sum).toBe(0); expect(second.squares).toBe(2);
    expect(second.logE).toBeLessThan(0);
  });
  it("has expected capital <=1 by exhaustive dependent zero-mean paths, without simulated seeds", () => {
    let expected = 0;
    for (let path = 0; path < 256; path++) {
      let state = initialEvidence(), previous = 1;
      for (let t = 0; t < 8; t++) { const z = ((path >> t) & 1 ? 1 : -1) * (previous < 0 ? 0.25 : 1); state = updateEvidence(state, z * 4); previous = z; }
      expected += Math.exp(state.logE) / 256;
    }
    expect(expected).toBeLessThanOrEqual(1 + 1e-12);
  });
  it("does not turn the diagnostic threshold into significance, and fails explicitly on numerical corruption", () => {
    expect(crossesThreshold(updateEvidence(initialEvidence(), 0.02))).toBe(false);
    expect(() => updateEvidence(initialEvidence(), NaN)).toThrow();
    expect(() => updateEvidence(initialEvidence(), 4.001)).toThrow();
    expect(() => logEvidence(1, -1)).toThrow();
    expect(() => logEvidence(Infinity, 0)).toThrow();
    const missing = updateEvidence(initialEvidence(), null); expect(missing.n).toBe(1); expect(missing.logE).toBe(0);
  });
  it("allocates the budget once for all twelve cuts, with no reset on an insufficient cut or replay", () => {
    let ledger = createResearchLedger("test", anchor);
    for (let month = 3; month <= 36; month += 3) {
      const model = { ...models[0], month, historyHashes: models[0].historyHashes, reasons: ["too_few_training_rows"] };
      ledger = openResearchBlock(ledger, model);
      ledger = closeResearchCut(ledger, { month, completed: 0, revisionHash: `${month}` });
      const replay = closeResearchCut(ledger, { month, completed: 0, revisionHash: `${month}` });
      expect(replay).toBe(ledger);
    }
    expect(ledger.cuts).toHaveLength(12); expect(ledger.budget).toEqual({ allocated: 0.005, familyCap: 0.01, allocations: 1 });
    expect(ledger.cuts.every(cut => cut.state === "abstain")).toBe(true);
  });
  it("counts each prospective observation once and permanently blocks revised predictions/outcomes/history", () => {
    const f = forecast(), committed = commitResearchForecast(opened(), f);
    expect(commitResearchForecast(committed, structuredClone(f))).toBe(committed);
    const resolved = resolveResearchForecast(committed, f.id, resolution(f));
    expect(resolved.evidence.n).toBe(1);
    expect(resolveResearchForecast(resolved, f.id, resolution(f))).toBe(resolved);
    expect(resolveResearchForecast(resolved, f.id, resolution(f, 1)).invalidReason).toBe("outcome_revision");
    expect(commitResearchForecast(resolved, { ...f, digest: "edited" }).invalidReason).toBe("prediction_revision");
    const closed = closeResearchCut(resolved, { month: 12, completed: 1, revisionHash: "v1" });
    expect(closeResearchCut(closed, { month: 12, completed: 1, revisionHash: "v2" }).invalidReason).toBe("closed_cut_revision");
    const next = { ...models[3], month: 15, historyHashes: { ...models[3].historyHashes, [anchor]: "edited" } };
    expect(openResearchBlock(closed, next).invalidReason).toBe("snapshot_history_revision");
  });
  it("does not drop evidence because coverage later fails, and distinguishes abstention from not rejected", () => {
    let ledger = opened();
    for (let i = 0; i < 30; i++) { const f = forecast(i); ledger = resolveResearchForecast(commitResearchForecast(ledger, f), f.id, resolution(f, i % 2 ? 5 : 1)); }
    const low = closeResearchCut(ledger, { month: 12, completed: 100, revisionHash: "low" });
    expect(low.cuts.at(-1)!.state).toBe("abstain"); expect(low.evidence).toEqual(ledger.evidence);
    const enough = closeResearchCut(ledger, { month: 12, completed: 30, revisionHash: "enough" });
    expect(enough.cuts.at(-1)!.state).toBe("not_rejected");
    expect(enough.evidence.n).toBe(30);
  });
  it("can cross the joint threshold using an independently obvious four-point loss advantage", () => {
    let ledger = opened();
    for (let i = 0; i < 85; i++) { const f = forecast(i); ledger = resolveResearchForecast(commitResearchForecast(ledger, f), f.id, resolution(f)); }
    expect(ledger.invalidReason).toBeNull();
    const closed = closeResearchCut(ledger, { month: 12, completed: 85, revisionHash: "test" });
    expect(closed.cuts.at(-1)!.state).toBe("research_evidence"); expect(closed.firstAlertMonth).toBe(12);
    expect(closed.budget.allocations).toBe(1);
  });
  it("requires a real pre-response commitment, ordered reveals, valid probabilities and no early declaration of missing", () => {
    const f = forecast(), committed = commitResearchForecast(opened(), f), next = forecast(1);
    expect(commitResearchForecast(committed, next).invalidReason).toBe("previous_outcome_not_resolved");
    expect(resolveResearchForecast(committed, f.id, { ...resolution(f), capturedAt: f.committedAt }).invalidReason).toBe("invalid_outcome_chronology");
    expect(resolveResearchForecast(committed, f.id, { ...resolution(f, null), resolvedAt: `${f.date}T18:02:00-03:00` }).invalidReason).toBe("invalid_outcome_chronology");
    const invalid = { ...f, baseline: [NaN, 0, 0, 0, 1] }; invalid.digest = forecastDigest(invalid);
    expect(commitResearchForecast(opened(), invalid).invalidReason).toBe("invalid_forecast_probabilities");
    expect(() => closeResearchCut({ ...opened(), evidence: { n: 0, sum: 0, squares: 0, logE: NaN } }, { month: 12, completed: 0, revisionHash: "x" })).toThrow();
    const noninstrument = resolveResearchForecast(committed, f.id, { ...resolution(f), instrumentVersion: "other" });
    expect(noninstrument.evidence.logE).toBe(0); expect(noninstrument.entries[0].eligible).toBe(false);
    const multipleDay = resolveResearchForecast(committed, f.id, { ...resolution(f), completedOnDay: 2 });
    expect(multipleDay.evidence.logE).toBe(0); expect(multipleDay.entries[0].eligible).toBe(false);
  });
  it("predicts from past training and currently known features before any post outcome is provided", () => {
    const evaluation = structuredClone(histories[4]), session = evaluation.source.sessions.find(row => row.date! >= "2022-10-01")!;
    const input = { source: evaluation.source, revision: "development", observedAt: new Date(Date.parse(session.endedAt!) + 60_000).toISOString(), sessionId: session.id };
    expect(forecastBeforeResponse(models[3], input).reasons).toContain("outcome_already_available");
    const fact = evaluation.source.feelings.find(row => row.sessionId === session.id)!.facts as Record<string, unknown>;
    delete fact.energyPost;
    const before = forecastBeforeResponse(models[3], input);
    expect(before.forecast).not.toBeNull();
    expect(models[3].trainingIds).not.toContain(before.forecast!.id);
    for (const row of evaluation.source.feelings) if (row.sessionId !== session.id) (row.facts as Record<string, unknown>).energyPost = { value: 1 };
    const after = forecastBeforeResponse(models[3], input);
    expect(after.forecast).toEqual(before.forecast);
    expect(monthAfter(anchor, 12)).toBe("2023-01-01");
  });
  it("checks exact binomial intervals against independent closed forms and direct enumeration", () => {
    expect(exact95(0, 1).upper).toBeCloseTo(0.975, 14); expect(exact95(1, 1).lower).toBeCloseTo(0.025, 14);
    expect(exact95(1, 2).upper).toBeCloseTo(Math.sqrt(0.975), 13);
    expect(exact95(0, 10).upper).toBeCloseTo(1 - 0.025 ** 0.1, 14);
    expect(binomialCdf(1, 3, 0.5)).toBeCloseTo(4 / 8, 14);
    expect(() => exact95(0, 0)).toThrow(); expect(() => exact95(2, 1)).toThrow();
  });
  it("fixes information nulls and positive endpoint contrasts analytically without drawing reserve data", () => {
    for (const id of ["A1_iid", "A2_serial", "A3_observed_changes", "A4_mar", "A5_variance", "A6_nonlinear_proxy", "A7_timing", "A8_sparse"] as const)
      expect(scenarioProbabilities(id, 3, 1, 200, 0, 0.1)).toEqual(scenarioProbabilities(id, 3, 1, 200, 80, 0.1));
    for (const [id, expected] of [["B1_plus15", 0.15], ["B2_plus30", 0.30], ["B3_minus15", -0.15], ["B4_minus30", -0.30]] as const) {
      const lo = scenarioProbabilities(id, 3, 0, 0, 0, 0), hi = scenarioProbabilities(id, 3, 0, 0, 80, 0);
      expect(hi[3] + hi[4] - lo[3] - lo[4]).toBeCloseTo(expected, 14);
      expect(hi.every(p => p >= 0 && p <= 1)).toBe(true);
    }
    const development = generateScenario("A1_iid", 0, "development-generator-correctness-only", 3);
    expect(development[1].source.sessions.length).toBeGreaterThan(70);
    expect(planJobs()).toHaveLength(38_400); expect(protocolHash()).toHaveLength(64);
  });
});
