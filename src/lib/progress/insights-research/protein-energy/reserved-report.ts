import { exact95 } from "./binomial-interval";
import { SCENARIOS, protocolHash } from "./reserved-protocol";
import type { HistoryResult } from "./reserved-history";
export function reservedReport(results: readonly { id: string; value: HistoryResult }[]) {
  const byId = new Map(results.map(row => [row.id, row.value]));
  if (byId.size !== results.length) throw new Error("Duplicate completed history");
  const allowed = new Set(SCENARIOS.flatMap(s => Array.from({ length: s.n }, (_, i) => `${s.id}:${i}`)));
  if (results.some(row => !allowed.has(row.id))) throw new Error("Result outside frozen plan");
  const scenarios = SCENARIOS.map(s => {
    const rows = Array.from({ length: s.n }, (_, i) => byId.get(`${s.id}:${i}`)).filter((row): row is HistoryResult => row !== undefined);
    const failures = rows.filter(row => row.technicalFailure !== null).length;
    const horizons = [24, 36].map(month => {
      const alerts = rows.filter(row => month === 24 ? row.any24 : row.any36).length;
      const k = s.group === "information_null" ? alerts + rows.filter(row => row.technicalFailure !== null && !(month === 24 ? row.any24 : row.any36)).length
        : rows.filter(row => row.technicalFailure === null && (month === 24 ? row.any24 : row.any36)).length;
      const interval = rows.length ? exact95(k, rows.length) : null;
      return { month, alerts, conservativeK: k, interval, pass: rows.length !== s.n || failures ? false : s.group === "information_null" ? interval!.upper <= 0.01
        : s.group === "positive" ? interval!.lower >= 0.80 : s.expected === "all_abstain_no_alert" ? rows.every(row => row.abstainAll && !row.any36) : true };
    });
    return { id: s.id, group: s.group, planned: s.n, completed: rows.length, missing: s.n - rows.length, technicalFailures: failures, horizons };
  });
  const complete = scenarios.every(row => row.missing === 0);
  return { protocolHash: protocolHash(), complete, approved: complete && scenarios.every(row => row.horizons.every(h => h.pass)), scenarios,
    limitation: "Forecast-risk inference is not conditional-independence or causal inference; all information-null gates remain mandatory." };
}
