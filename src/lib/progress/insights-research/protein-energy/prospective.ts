import { createHash } from "node:crypto";
import { cordobaDateOf } from "../../../phase2/cordoba-date";
import { instantMs } from "../../insights-engine/source-adapter";
import type { InsightsSource } from "../../insights-engine/types";
import { encode, encoderFor, fit, probabilities, supportFor, supportReason, type Encoder, type Model, type Support } from "./model";
import { POLICY } from "./policy";
import { midnight, monthAfter, object, prepare, validDay, type Features, type Snapshot } from "./preparation";
import { snapshotHash } from "./procedure";

export type BlockModel = { month: number; anchor: string; trainingHash: string; historyHashes: Record<string, string>; modelHash: string; trainingIds: string[]; reasons: string[];
  fitted: { encoder: Encoder; support: Support; baseline: Model; extended: Model } | null };
export type Forecast = { month: number; modelHash: string; trainingHash: string; id: string; date: string; endedAt: string; committedAt: string;
  features: Features; baseline: number[]; extended: number[]; sourceHash: string; digest: string };
export const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function forecastDigest(value: Omit<Forecast, "digest"> | Forecast): string {
  const { month, modelHash, trainingHash, id, date, endedAt, committedAt, features, baseline, extended, sourceHash } = value;
  return digest({ month, modelHash, trainingHash, id, date, endedAt, committedAt,
    features: [features.id, features.date, features.routine, features.pre, features.hour, features.weekday, features.protein], baseline, extended, sourceHash });
}
export function fitBlock(anchor: string, month: number, training: Snapshot, previousSnapshots: readonly Snapshot[] = []): BlockModel {
  if (!POLICY.months.includes(month) || training.asOf !== monthAfter(anchor, month - 3)) throw new Error("Wrong training boundary");
  const prepared = prepare(training, anchor), rows = prepared.rows.filter(row => row.target.state === "in_window").map(row => ({ ...row, y: row.target.value! }));
  const reasons: string[] = [];
  if (rows.length < POLICY.minTrain) reasons.push("too_few_training_rows");
  if (new Set(rows.map(row => row.routine)).size > POLICY.maxRoutines) reasons.push("too_many_routines");
  if (new Set(rows.map(row => row.y)).size < POLICY.minOutcomeCategories) reasons.push("too_few_outcome_categories");
  const trainingHash = snapshotHash(training);
  const historyHashes: Record<string, string> = {};
  for (const snapshot of [...previousSnapshots, training]) {
    if (snapshot.asOf > training.asOf || (historyHashes[snapshot.asOf] && historyHashes[snapshot.asOf] !== snapshotHash(snapshot))) throw new Error("Inconsistent as-of history");
    historyHashes[snapshot.asOf] = snapshotHash(snapshot);
  }
  let fitted: BlockModel["fitted"] = null;
  if (!reasons.length) {
    const encoder = encoderFor(rows, anchor);
    if (!Number.isFinite(encoder.proteinSd) || encoder.proteinSd < POLICY.minProteinLogSd) reasons.push("constant_or_sparse_exposure");
    else {
      try { fitted = { encoder, support: supportFor(rows), baseline: fit(rows.map(row => encode(row, encoder, false)), rows.map(row => row.y)),
        extended: fit(rows.map(row => encode(row, encoder, true)), rows.map(row => row.y)) }; }
      catch { reasons.push("numerical_fit_failure"); }
    }
  }
  return { month, anchor, trainingHash, historyHashes, trainingIds: rows.map(row => row.id), reasons, fitted,
    modelHash: digest({ policy: POLICY, anchor, month, trainingHash, fitted: fitted && { encoder: fitted.encoder, baseline: fitted.baseline, extended: fitted.extended, support: [...fitted.support] }, reasons }) };
}
/** Called with what was available BEFORE the post response. The caller must attest source availability, not backdate today's rows. */
export function forecastBeforeResponse(model: BlockModel, input: { source: InsightsSource; revision: string; observedAt: string; sessionId: string }): { forecast: Forecast | null; reasons: string[] } {
  const at = instantMs(input.observedAt);
  if (!model.fitted || model.reasons.length) return { forecast: null, reasons: [...model.reasons] };
  if (at === null || at < midnight(monthAfter(model.anchor, model.month - 3)) || at >= midnight(monthAfter(model.anchor, model.month))) return { forecast: null, reasons: ["outside_prediction_block"] };
  const session = input.source.sessions.find(row => row.id === input.sessionId);
  if (!session || model.trainingIds.includes(input.sessionId)) return { forecast: null, reasons: ["invalid_or_training_identity"] };
  const facts = input.source.feelings.find(row => row.sessionId === input.sessionId)?.facts;
  if (object(facts)?.energyPost !== undefined) return { forecast: null, reasons: ["outcome_already_available"] };
  if (!session.date || !validDay(session.date)) return { forecast: null, reasons: ["invalid_logical_date"] };
  const day = cordobaDateOf(at), next = (date: string) => new Date(Date.parse(date) + 86_400_000).toISOString().slice(0, 10), nextDay = next(day);
  const start = instantMs(session.startedAt);
  if (start === null) return { forecast: null, reasons: ["unknown_start_time"] };
  const previousDay = new Date(Date.parse(session.date) - 86_400_000).toISOString().slice(0, 10);
  const mealDates = new Set([previousDay, session.date, cordobaDateOf(start - 3 * 3_600_000), cordobaDateOf(start - 1)]);
  // Project only feature inputs. Irrelevant future rows/labels must not enter even the commitment's hash.
  const sessions = input.source.sessions.filter(row => row.date === session.date && (instantMs(row.endedAt) ?? Infinity) < at), ids = new Set(sessions.map(row => row.id));
  const exercises = input.source.exercises.filter(row => ids.has(row.sessionId)), exerciseIds = new Set(exercises.map(row => row.id));
  const known: InsightsSource = { sessions, exercises, sets: input.source.sets.filter(row => exerciseIds.has(row.sessionExerciseId) && (instantMs(row.completedAt) ?? Infinity) < at),
    feelings: input.source.feelings.filter(row => ids.has(row.sessionId)).map(row => ({ ...row, facts: { energyPre: object(row.facts)?.energyPre } })),
    meals: input.source.meals.filter(row => mealDates.has(row.date) && (instantMs(row.consumedAt) ?? -Infinity) < at), metricDefinitions: [], metricValues: [] };
  // This upper calendar bound includes the current day; knownAt is the actual source cutoff. No future rows are claimed known.
  const snapshot = { asOf: nextDay, revision: input.revision, source: known };
  const features = prepare(snapshot, session.date, next(session.date), at).rows.find(row => row.id === input.sessionId);
  if (!features) return { forecast: null, reasons: ["ineligible_prospective_features"] };
  const reason = supportReason(features, model.fitted.support);
  if (reason) return { forecast: null, reasons: [reason] };
  const { id, date, routine, pre, hour, weekday, protein } = features;
  const clean: Features = { id, date, routine, pre, hour, weekday, protein };
  const value: Omit<Forecast, "digest"> = { month: model.month, modelHash: model.modelHash, trainingHash: model.trainingHash, id, date,
    endedAt: session.endedAt!, committedAt: input.observedAt, features: clean,
    baseline: probabilities(model.fitted.baseline.weights, encode(clean, model.fitted.encoder, false)),
    extended: probabilities(model.fitted.extended.weights, encode(clean, model.fitted.encoder, true)), sourceHash: snapshotHash(snapshot) };
  return { forecast: { ...value, digest: forecastDigest(value) }, reasons: [] };
}
