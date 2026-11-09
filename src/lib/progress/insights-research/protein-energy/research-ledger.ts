import { INFERENCE, crossesThreshold, initialEvidence, logEvidence, updateEvidence, type Evidence } from "./inference";
import { rankedProbabilityScore } from "./model";
import { POLICY } from "./policy";
import { instantMs } from "../../insights-engine/source-adapter";
import { midnight, monthAfter } from "./preparation";
import { digest, forecastDigest, type BlockModel, type Forecast } from "./prospective";

export type Resolution = { value: number | null; capturedAt: string | null; resolvedAt: string; instrumentVersion: string | null; declaredMoment: string | null; completedOnDay: number };
export type ResearchCut = { month: number; inputHash: string; state: "abstain" | "not_rejected" | "research_evidence" | "already_emitted";
  reasons: string[]; evidence: Evidence; scored: number; committed: number; completed: number; coverage: number; firstAlertMonth: number | null };
export type ResearchLedger = { version: string; historyId: string; anchor: string; budget: { allocated: number; familyCap: number; allocations: number };
  evidence: Evidence; snapshotHashes: Record<string, string>; invalidReason: string | null; lastEvent: number; firstAlertMonth: number | null;
  block: { month: number; trainingHash: string; modelHash: string; reasons: string[] } | null;
  entries: { forecast: Forecast; resolution: Resolution | null; resolutionHash: string | null; eligible: boolean }[]; cuts: ResearchCut[] };
export function createResearchLedger(historyId: string, anchor: string): ResearchLedger {
  monthAfter(anchor, 0);
  if (!historyId.trim()) throw new Error("Stable research history identity required");
  return { version: INFERENCE.version, historyId, anchor, budget: { allocated: INFERENCE.alpha, familyCap: INFERENCE.familyCap, allocations: 1 },
    evidence: initialEvidence(), snapshotHashes: {}, invalidReason: null, lastEvent: midnight(anchor), firstAlertMonth: null, block: null, entries: [], cuts: [] };
}
const invalidate = (ledger: ResearchLedger, reason: string): ResearchLedger => ({ ...ledger, invalidReason: ledger.invalidReason ?? reason });
function valid(ledger: ResearchLedger) {
  if (ledger.version !== INFERENCE.version || ledger.budget.allocated !== INFERENCE.alpha || ledger.budget.allocations !== 1 || ledger.budget.familyCap !== INFERENCE.familyCap) throw new Error("Incompatible inference version/budget; do not reset a history");
  if (!Number.isFinite(ledger.evidence.logE) || !Number.isSafeInteger(ledger.evidence.n) || ledger.evidence.n < 0 || Math.abs(logEvidence(ledger.evidence.sum, ledger.evidence.squares) - ledger.evidence.logE) > 1e-10) throw new Error("Corrupt inference accumulators");
}
export function openResearchBlock(ledger: ResearchLedger, model: BlockModel): ResearchLedger {
  valid(ledger); if (ledger.invalidReason) return ledger;
  if (Object.entries(ledger.snapshotHashes).some(([day, hash]) => model.historyHashes[day] !== hash)) return invalidate(ledger, "snapshot_history_revision");
  if (ledger.block) return ledger.block.month === model.month && ledger.block.modelHash === model.modelHash ? ledger : invalidate(ledger, "model_or_history_revision");
  if (model.anchor !== ledger.anchor || model.month !== POLICY.months[ledger.cuts.length]) return invalidate(ledger, "unscheduled_or_repeated_cut");
  return { ...ledger, snapshotHashes: { ...model.historyHashes }, block: { month: model.month, trainingHash: model.trainingHash, modelHash: model.modelHash, reasons: [...model.reasons] } };
}
/** A receipt is accepted BEFORE its target is resolved. A pure module cannot certify wall clocks or prevent discarding the ledger. */
export function commitResearchForecast(ledger: ResearchLedger, forecast: Forecast): ResearchLedger {
  valid(ledger); if (ledger.invalidReason) return ledger;
  const prior = ledger.entries.find(entry => entry.forecast.id === forecast.id);
  if (prior) return prior.forecast.digest === forecast.digest && forecastDigest(forecast) === forecast.digest ? ledger : invalidate(ledger, "prediction_revision");
  if (!ledger.block || ledger.block.reasons.length || forecast.month !== ledger.block.month || forecast.modelHash !== ledger.block.modelHash || forecast.trainingHash !== ledger.block.trainingHash) return invalidate(ledger, "uncommitted_model");
  if (ledger.entries.some(entry => entry.resolution === null)) return invalidate(ledger, "previous_outcome_not_resolved");
  const at = instantMs(forecast.committedAt), end = instantMs(forecast.endedAt);
  if (at === null || end === null || at <= end || at >= end + POLICY.postGraceHours * 3_600_000 || at < ledger.lastEvent
    || at < midnight(monthAfter(ledger.anchor, forecast.month - 3)) || at >= midnight(monthAfter(ledger.anchor, forecast.month))
    || forecastDigest(forecast) !== forecast.digest || ledger.entries.some(entry => entry.forecast.date === forecast.date)) return invalidate(ledger, "invalid_prediction_chronology_or_identity");
  try { rankedProbabilityScore(forecast.baseline, 1); rankedProbabilityScore(forecast.extended, 1); } catch { return invalidate(ledger, "invalid_forecast_probabilities"); }
  return { ...ledger, lastEvent: at, entries: [...ledger.entries, { forecast: structuredClone(forecast), resolution: null, resolutionHash: null, eligible: false }] };
}
export function resolveResearchForecast(ledger: ResearchLedger, id: string, resolution: Resolution): ResearchLedger {
  valid(ledger); if (ledger.invalidReason) return ledger;
  const index = ledger.entries.findIndex(entry => entry.forecast.id === id), entry = ledger.entries[index];
  if (!entry) return invalidate(ledger, "outcome_without_prediction");
  const resolutionHash = digest([resolution.value, resolution.capturedAt, resolution.resolvedAt, resolution.instrumentVersion, resolution.declaredMoment, resolution.completedOnDay]);
  if (entry.resolution) return entry.resolutionHash === resolutionHash ? ledger : invalidate(ledger, "outcome_revision");
  const at = instantMs(resolution.resolvedAt), captured = instantMs(resolution.capturedAt), commit = instantMs(entry.forecast.committedAt)!, end = instantMs(entry.forecast.endedAt)!;
  const valueValid = resolution.value !== null && Number.isInteger(resolution.value) && resolution.value >= 1 && resolution.value <= 5;
  const inWindow = valueValid && resolution.instrumentVersion === "energy-fatigue/1" && resolution.declaredMoment === "post" && captured !== null && captured >= end && captured <= end + POLICY.postGraceHours * 3_600_000;
  const eligible = inWindow && resolution.completedOnDay === 1;
  const nextDay = new Date(Date.parse(entry.forecast.date) + 86_400_000).toISOString().slice(0, 10), settledAfter = Math.max(midnight(nextDay), end + POLICY.postGraceHours * 3_600_000);
  if (at === null || at < ledger.lastEvent || (captured !== null && captured > at) || (eligible && captured! <= commit)
    || at < settledAfter || !Number.isSafeInteger(resolution.completedOnDay) || resolution.completedOnDay < 1) return invalidate(ledger, "invalid_outcome_chronology");
  let evidence: Evidence;
  try { evidence = updateEvidence(ledger.evidence, eligible ? rankedProbabilityScore(entry.forecast.baseline, resolution.value!) - rankedProbabilityScore(entry.forecast.extended, resolution.value!) : null); }
  catch { return invalidate(ledger, "numerical_inference_failure"); }
  const entries = ledger.entries.slice(); entries[index] = { ...entry, resolution: { ...resolution }, resolutionHash, eligible };
  return { ...ledger, entries, evidence, lastEvent: at };
}
/** Coverage gates presentation ONLY. Already revealed scores are never removed because a block's coverage is low. */
export function closeResearchCut(ledger: ResearchLedger, input: { month: number; completed: number; revisionHash: string }): ResearchLedger {
  valid(ledger); if (ledger.invalidReason) return ledger;
  const inputHash = digest([input.month, input.completed, input.revisionHash]), previous = ledger.cuts.find(cut => cut.month === input.month);
  if (previous) return previous.inputHash === inputHash ? ledger : invalidate(ledger, "closed_cut_revision");
  if (!ledger.block || ledger.block.month !== input.month || !input.revisionHash || ledger.entries.some(entry => entry.resolution === null)) return invalidate(ledger, "unresolved_or_unscheduled_cut");
  const entries = ledger.entries.filter(entry => entry.forecast.month === input.month), scored = entries.filter(entry => entry.eligible).length;
  if (!Number.isSafeInteger(input.completed) || input.completed < entries.length) return invalidate(ledger, "invalid_coverage_denominator");
  const coverage = input.completed ? scored / input.completed : 0, reasons = [...ledger.block.reasons];
  if (scored < POLICY.minEvaluation) reasons.push("too_few_evaluation_labels");
  if (coverage < POLICY.minCoverage) reasons.push("insufficient_evaluation_coverage");
  const firstAlertMonth = ledger.firstAlertMonth ?? (!reasons.length && crossesThreshold(ledger.evidence) ? input.month : null);
  const state: ResearchCut["state"] = reasons.length ? "abstain" : ledger.firstAlertMonth !== null ? "already_emitted" : firstAlertMonth !== null ? "research_evidence" : "not_rejected";
  const cut: ResearchCut = { month: input.month, inputHash, state, reasons, evidence: { ...ledger.evidence }, scored, committed: entries.length, completed: input.completed, coverage, firstAlertMonth };
  return { ...ledger, block: null, firstAlertMonth, cuts: [...ledger.cuts, cut], lastEvent: Math.max(ledger.lastEvent, midnight(monthAfter(ledger.anchor, input.month))) };
}
