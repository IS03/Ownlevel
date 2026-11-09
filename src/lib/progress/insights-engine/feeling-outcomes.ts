import { evaluateAssociations } from "./associations";
import { buildExposureContext, buildExposureTable, type ExposureContext, type OutcomeDay } from "./exposures";
import { instantMs } from "./source-adapter";
import { ranks } from "./stats";
import type { Candidate, FeelingOutcomeKind, FeelingOutcomeSummary, InsightsEngineMethod, InsightsSource, ObservationRow } from "./types";

/**
 * #367: energy and fatigue declared at the end of a session, as two outcomes of their own (see 367-sensaciones-resultado-metodo.md).
 * Fixed before looking at any result:
 * - unit: a closed logical day with exactly one completed session, so a day is never counted once per session;
 * - outcome: the ordinal answer 1–5 of `energy-fatigue/1`, never inverted, summed, averaged into a score or turned into a pre/post difference;
 * - prior answer of the same kind: the stratum the outcome is ranked within, so ending high after starting low is not read as ending
 *   high after starting high. It is context, never an exposure;
 * - temporality: the post answer must be captured between the start and two hours after the end. Later or unknown captures stay
 *   visible and counted, out of the outcome.
 */
export const FEELING_OUTCOME_METHOD = "insights-feeling-outcomes/1" as const;
export const FEELING_INSTRUMENT = "energy-fatigue/1" as const;
export const POST_CAPTURE_GRACE_HOURS = 2;
export const FEELING_OUTCOME_KINDS: readonly FeelingOutcomeKind[] = ["energy", "fatigue"];
export const FEELING_OUTCOME_PREFIX = "feeling_outcome:";

type PostFact = { state: "not_recorded" | "unreadable" | "other_instrument" } | { state: "answered"; value: number; capturedAt: number | null; source: "mobile" | "web" | "unknown" };
/** The post answer as stored, read for this method alone: the published session context (`SessionFeeling`) is not changed. */
export function postFact(facts: unknown, key: "energyPost" | "fatiguePost"): PostFact {
  // No row at all is nothing recorded; a row that is not an object cannot be read.
  if (facts === undefined) return { state: "not_recorded" };
  if (!facts || typeof facts !== "object" || Array.isArray(facts)) return { state: "unreadable" };
  const raw = (facts as Record<string, unknown>)[key];
  if (raw === undefined || raw === null) return { state: "not_recorded" };
  const fact = raw as Record<string, unknown>;
  if (typeof raw !== "object" || typeof fact.value !== "number" || !Number.isInteger(fact.value) || fact.value < 1 || fact.value > 5 || fact.declaredMoment !== "post"
    || (fact.capturedAt !== null && fact.capturedAt !== undefined && typeof fact.capturedAt !== "string")) return { state: "unreadable" };
  // Another instrument is another scale: its anchors are not these, so it is never read as one of them.
  if (fact.instrumentVersion !== FEELING_INSTRUMENT) return { state: "other_instrument" };
  return { state: "answered", value: fact.value, capturedAt: typeof fact.capturedAt === "string" ? instantMs(fact.capturedAt) : null,
    source: fact.source === "mobile" || fact.source === "web" ? fact.source : "unknown" };
}
type Capture = "at_finish" | "late" | "capture_unknown" | "before_start";
function captureOf(at: number | null, session: InsightsSource["sessions"][number]): Capture {
  const start = instantMs(session.startedAt), end = instantMs(session.endedAt);
  if (at === null || end === null) return "capture_unknown";
  if (start !== null && at < start) return "before_start";
  return at <= end + POST_CAPTURE_GRACE_HOURS * 3_600_000 ? "at_finish" : "late";
}

type Observation = { date: string; sessionId: string; routineId: string | null; post: number; pre: number };
/**
 * The outcome of a day: its post answer ranked among the days that started at the same prior level, as a share in (0, 1).
 * Mid-ranks keep ties tied. A level seen once gives 0.5: it says nothing either way. Exported for the calibration, which runs this same code.
 */
export function stratifiedRows(observations: readonly Pick<Observation, "date" | "post" | "pre" | "routineId">[]): ObservationRow[] {
  const byPre = new Map<number, number[]>();
  observations.forEach((row, index) => { const list = byPre.get(row.pre); if (list) list.push(index); else byPre.set(row.pre, [index]); });
  const y = new Float64Array(observations.length);
  for (const indices of byPre.values()) {
    const order = ranks(indices.map(index => observations[index]!.post));
    indices.forEach((index, position) => { y[index] = (order[position]! - 0.5) / indices.length; });
  }
  return observations.map((row, index) => ({ date: row.date, y: y[index]!, ySensitivity: y[index]!, routineKey: row.routineId ?? "free" }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

type PreReason = "not_recorded" | "unreadable" | "capture_unknown" | "after_first_set";
const zeros = () => [0, 0, 0, 0, 0];

/** One pass over the sessions: the descriptive facts, and the days the associations would use. Nothing analytic is built here. */
function scan(source: InsightsSource, kind: FeelingOutcomeKind, context: Pick<ExposureContext, "feelingsBySession" | "unreadableFeelingsBySession">, today: string) {
  const postKey = kind === "energy" ? "energyPost" : "fatiguePost", preKey = kind === "energy" ? "energyPre" : "fatiguePre";
  const factsBySession = new Map(source.feelings.map(row => [row.sessionId, row.facts]));
  const completed = source.sessions.filter(session => session.status === "completed" && !!session.date);
  const perDay = new Map<string, number>();
  for (const session of completed) perDay.set(session.date!, (perDay.get(session.date!) ?? 0) + 1);

  const summary: FeelingOutcomeSummary = {
    kind, outcomeKey: postKey, priorKey: preKey, instrument: FEELING_INSTRUMENT, methodVersion: FEELING_OUTCOME_METHOD,
    sessions: { completed: completed.length, answered: 0, notRecorded: 0, unreadable: 0, otherInstrument: 0 },
    capture: { atFinish: 0, late: 0, captureUnknown: 0, beforeStart: 0 },
    source: { mobile: 0, web: 0, unknown: 0 },
    byPrior: [1, 2, 3, 4, 5].map(prior => ({ prior, posts: zeros() })),
    priorNotComparable: { posts: zeros(), reasons: { not_recorded: 0, unreadable: 0, capture_unknown: 0, after_first_set: 0 } },
    legacyEnergyOnly: kind === "energy" ? 0 : null,
    firstDate: null, lastDate: null,
    days: { eligible: 0, exclusions: {} },
    associations: { status: "not_published", reason: "validation_pending" },
  };
  const observations: Observation[] = [];
  const bump = (key: string) => { summary.days.exclusions[key] = (summary.days.exclusions[key] ?? 0) + 1; };
  for (const session of completed) {
    const fact = postFact(factsBySession.get(session.id), postKey);
    if (fact.state !== "answered") {
      if (fact.state === "not_recorded") summary.sessions.notRecorded++; else if (fact.state === "unreadable") summary.sessions.unreadable++; else summary.sessions.otherInstrument++;
      // The energy of the old flow has no moment: it never stands in for an answer at the end.
      if (kind === "energy" && fact.state === "not_recorded" && session.legacyEnergyLevel !== null) summary.legacyEnergyOnly!++;
      continue;
    }
    summary.sessions.answered++;
    summary.source[fact.source]++;
    const capture = captureOf(fact.capturedAt, session);
    summary.capture[capture === "at_finish" ? "atFinish" : capture === "late" ? "late" : capture === "capture_unknown" ? "captureUnknown" : "beforeStart"]++;
    if (capture !== "at_finish") continue;
    summary.firstDate = !summary.firstDate || session.date! < summary.firstDate ? session.date! : summary.firstDate;
    summary.lastDate = !summary.lastDate || session.date! > summary.lastDate ? session.date! : summary.lastDate;
    const pre = context.feelingsBySession.get(session.id)?.[preKey];
    const preReason: PreReason | null = context.unreadableFeelingsBySession.get(session.id)?.includes(preKey) ? "unreadable"
      : !pre ? "not_recorded" : pre.timing === "unknown" ? "capture_unknown" : pre.timing !== "before_start" && pre.timing !== "before_first_set" ? "after_first_set" : null;
    if (preReason) { summary.priorNotComparable.posts[fact.value - 1]!++; summary.priorNotComparable.reasons[preReason]++; }
    else summary.byPrior[pre!.value - 1]!.posts[fact.value - 1]!++;
    // Days, for the associations: closed, with this session alone, and with a comparable prior answer.
    if (session.date! >= today) { bump("day_still_open"); continue; }
    if (perDay.get(session.date!)! > 1) { bump("multiple_sessions_day"); continue; }
    if (preReason) { bump(`prior_${preReason}`); continue; }
    observations.push({ date: session.date!, sessionId: session.id, routineId: session.routineId, post: fact.value, pre: pre!.value });
  }
  summary.days.eligible = observations.length;
  return { summary, observations, postKey };
}

/** What `view=feelings` publishes: counts and states only. The observations are dropped here, never kept by a snapshot. */
export function describeFeelingOutcome(source: InsightsSource, kind: FeelingOutcomeKind, context: Pick<ExposureContext, "feelingsBySession" | "unreadableFeelingsBySession">, today: string): FeelingOutcomeSummary {
  return scan(source, kind, context, today).summary;
}

/**
 * EXPERIMENTAL, only when asked for explicitly (tests, calibration, a future validated method): the ranked days, the exposure
 * table and the candidates of one outcome, and their evaluation. No view calls this, and no snapshot holds what it builds.
 */
export function prepareFeelingAssociations(source: InsightsSource, kind: FeelingOutcomeKind, options: { today: string; method: InsightsEngineMethod; context?: ExposureContext }) {
  const context = options.context ?? buildExposureContext(source);
  const { observations, postKey } = scan(source, kind, context, options.today);
  const rows = stratifiedRows(observations);
  const byDate = new Map(observations.map(item => [item.date, item]));
  const days: OutcomeDay[] = rows.map(row => { const observation = byDate.get(row.date)!;
    return { date: row.date, sessions: [{ sessionId: observation.sessionId, routineId: observation.routineId }], outcome: row.y, outcomeSensitivity: row.y }; });
  const table = buildExposureTable(source, days, options.today, context, false, options.method);
  // The prior answers are the stratum, not exposures: testing them here would test the outcome against its own frame.
  const candidates: Candidate[] = table.candidates.filter(candidate => candidate.definition.family !== "feeling")
    .map(candidate => ({ ...candidate, definition: { ...candidate.definition, id: `${FEELING_OUTCOME_PREFIX}${postKey}:${candidate.definition.id}` } }));
  return { rows: table.rows, sessionIdsByDate: table.sessionIdsByDate, candidates,
    evaluate: (permutations?: number) => evaluateAssociations(table.rows, candidates, { permutations }) };
}
