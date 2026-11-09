/** DEVELOPMENT ONLY. No reserved seeds/generators and no production reads. */
import type { InsightsSource } from "../../insights-engine/types";
import { midnight, monthAfter, type Snapshot } from "./preparation";
export type Scenario = "null" | "effect" | "confounded";
export const DEVELOPMENT_ANCHOR = "2022-01-01";
function randomFor(seed: number) {
  let state = seed >>> 0;
  return () => { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return (state >>> 0) / 4_294_967_296; };
}
export function developmentHistory(seed: number, scenario: Scenario, months = 36): Snapshot[] {
  const random = randomFor(seed), source: InsightsSource = { sessions: [], exercises: [], sets: [], feelings: [], metricDefinitions: [], metricValues: [], meals: [] };
  const sessions = [...source.sessions], feelings = [...source.feelings], meals = [...source.meals];
  const finish = midnight(monthAfter(DEVELOPMENT_ANCHOR, months));
  let index = 0;
  for (let day = midnight(DEVELOPMENT_ANCHOR); day < finish; day += 86_400_000) {
    if (new Date(day).getUTCDay() === 0) continue;
    const date = new Date(day).toISOString().slice(0, 10), routine = index % 2 ? "routine-b" : "routine-a", pre = 2 + Math.floor(random() * 3);
    const protein = scenario === "confounded" ? (routine === "routine-a" ? 5 : 80) : [0, 5, 15, 30, 50, 80][Math.floor(random() * 6)];
    const start = day + (18 + random()) * 3_600_000, end = start + 3_600_000, id = `development-session-${index++}`;
    const latent = (pre - 3) * 0.35 + (scenario === "effect" ? (Math.log1p(protein) - 2.2) * 1.5 : scenario === "confounded" ? (routine === "routine-a" ? -1.2 : 1.2) : 0);
    const logits = [1, 2, 3, 4, 5].map(k => (k - 3) * latent - 0.6 * (k - 3) ** 2), max = Math.max(...logits);
    const weights = logits.map(v => Math.exp(v - max)), draw = random() * weights.reduce((a, b) => a + b, 0);
    let cumulative = 0, post = 5;
    for (let k = 0; k < 5; k++) { cumulative += weights[k]; if (draw <= cumulative) { post = k + 1; break; } }
    const iso = (at: number) => new Date(at).toISOString();
    const fact = (value: number, moment: "pre" | "post", at: number) => ({ value, declaredMoment: moment, capturedAt: iso(at), instrumentVersion: "energy-fatigue/1", receivedAt: iso(at + 1000) });
    sessions.push({ id, date, routineId: routine, routineName: routine, name: "Development only", status: "completed", startedAt: iso(start), endedAt: iso(end), performanceLevel: null, painLevel: null, legacyEnergyLevel: null });
    feelings.push({ sessionId: id, revision: 1, facts: { energyPre: fact(pre, "pre", start - 60_000), energyPost: fact(post, "post", end + 300_000) } });
    meals.push({ id: `development-meal-${index}`, date, consumedAt: iso(start - 3_600_000), consumedAtSource: "user_declared", entryKind: "meal", sourceType: "manual", importRunId: null, rawInput: null, proteinG: protein, calories: null, carbsG: null, fatG: null });
  }
  return Array.from({ length: months / 3 + 1 }, (_, i) => {
    const asOf = monthAfter(DEVELOPMENT_ANCHOR, i * 3), selected = sessions.filter(row => row.date! < asOf), ids = new Set(selected.map(row => row.id));
    return { asOf, revision: `development-${seed}-${scenario}-${i}`, source: structuredClone({ ...source, sessions: selected,
      feelings: feelings.filter(row => ids.has(row.sessionId)), meals: meals.filter(row => row.date < asOf) }) };
  });
}
