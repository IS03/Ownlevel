import { instantMs } from "../../insights-engine/source-adapter";
import type { InsightsSource } from "../../insights-engine/types";
import { object, monthAfter, midnight } from "./preparation";
import { fitBlock, forecastBeforeResponse, digest } from "./prospective";
import { createResearchLedger, openResearchBlock, commitResearchForecast, resolveResearchForecast, closeResearchCut, type ResearchLedger } from "./research-ledger";
import { generateScenario } from "./scenario-generator";
import { RESERVED_PROTOCOL, type ScenarioId } from "./reserved-protocol";

export type HistoryCheckpoint = { nextMonth: number; ledger: ResearchLedger; exclusions: Record<string, number> };
export type HistoryResult = { any24: boolean; any36: boolean; abstainAll: boolean; technicalFailure: string | null; auditHash: string; cuts: { month: number; state: string; logE: number; coverage: number }[]; exclusions: Record<string, number> };
/** Synthetic as-of availability only. This is not a production reader or a way to reconstruct availability in real histories. */
function knownSource(source: InsightsSource, at: number): InsightsSource {
  const sessions = source.sessions.filter(row => (instantMs(row.endedAt) ?? Infinity) < at), ids = new Set(sessions.map(row => row.id));
  return { ...source, sessions, meals: source.meals.filter(row => row.date <= new Date(at - 3 * 3_600_000).toISOString().slice(0, 10)),
    feelings: source.feelings.filter(row => ids.has(row.sessionId)).map(row => {
      const facts = { ...object(row.facts) };
      for (const key of ["energyPre", "energyPost"]) {
        const fact = object(facts[key]), received = typeof fact?.receivedAt === "string" ? instantMs(fact.receivedAt) : null;
        if (received === null || received > at) delete facts[key];
      }
      return { ...row, facts };
    }) };
}
/** Invoked only AFTER the runner verifies an external authorization bound to this exact protocol and candidate. */
export function executeReservedHistory(job: { id: string; scenario: ScenarioId; index: number }, namespace: string, checkpoint: HistoryCheckpoint | null,
  save: (checkpoint: HistoryCheckpoint) => void, guard: () => void): HistoryResult {
  const snapshots = generateScenario(job.scenario, job.index, namespace);
  const anchor = RESERVED_PROTOCOL.anchor;
  let state: HistoryCheckpoint = checkpoint ?? { nextMonth: 3, ledger: createResearchLedger(job.id, anchor), exclusions: {} };
  for (let month = state.nextMonth; month <= 36; month += 3) {
    guard();
    if (!state.ledger.invalidReason) {
      if (job.scenario === "C6_revision" && month === 9) snapshots[1].revision += "-historical-edit";
      const model = fitBlock(anchor, month, snapshots[month / 3 - 1], snapshots.slice(0, month / 3 - 1));
      let ledger = openResearchBlock(state.ledger, model);
      const evaluation = snapshots[month / 3], sessions = evaluation.source.sessions.filter(row => row.date! >= monthAfter(anchor, month - 3));
      if (!ledger.invalidReason && model.fitted) for (const session of sessions) {
        guard(); const end = instantMs(session.endedAt)!;
        const predicted = forecastBeforeResponse(model, { source: knownSource(evaluation.source, end + 60_000), observedAt: new Date(end + 60_000).toISOString(), revision: `known-${session.id}`, sessionId: session.id });
        if (!predicted.forecast) { for (const reason of predicted.reasons) state.exclusions[reason] = (state.exclusions[reason] ?? 0) + 1; continue; }
        ledger = commitResearchForecast(ledger, predicted.forecast);
        const raw = object(object(evaluation.source.feelings.find(row => row.sessionId === session.id)?.facts)?.energyPost);
        const capture = typeof raw?.capturedAt === "string" ? instantMs(raw.capturedAt) : null;
        const nextDay = new Date(Date.parse(session.date!) + 86_400_000).toISOString().slice(0, 10);
        ledger = resolveResearchForecast(ledger, session.id, { value: typeof raw?.value === "number" ? raw.value : null,
          capturedAt: typeof raw?.capturedAt === "string" ? raw.capturedAt : null, resolvedAt: new Date(Math.max(midnight(nextDay) + 1000, end + 2 * 3_600_000 + 1000, (capture ?? 0) + 1000)).toISOString(),
          completedOnDay: sessions.filter(row => row.date === session.date).length,
          instrumentVersion: typeof raw?.instrumentVersion === "string" ? raw.instrumentVersion : null, declaredMoment: typeof raw?.declaredMoment === "string" ? raw.declaredMoment : null });
      }
      ledger = closeResearchCut(ledger, { month, completed: sessions.length, revisionHash: digest(evaluation) });
      state = { ...state, ledger };
    }
    state = { ...state, nextMonth: month + 3 }; save(state); guard();
  }
  const first = state.ledger.firstAlertMonth, technicalFailure = state.ledger.invalidReason && state.ledger.invalidReason !== "snapshot_history_revision" ? state.ledger.invalidReason : null;
  const cuts = Array.from({ length: 12 }, (_, i) => {
    const month = (i + 1) * 3, cut = state.ledger.cuts.find(row => row.month === month);
    return { month, state: cut?.state ?? "abstain", logE: cut?.evidence.logE ?? state.ledger.evidence.logE, coverage: cut?.coverage ?? 0 };
  });
  return { any24: first !== null && first <= 24, any36: first !== null, abstainAll: cuts.every(cut => cut.state === "abstain"), technicalFailure,
    cuts, exclusions: state.exclusions, auditHash: digest(state.ledger) };
}
