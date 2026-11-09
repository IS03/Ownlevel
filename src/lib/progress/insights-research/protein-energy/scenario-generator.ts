/** RESERVED GENERATOR SPECIFICATION. Never call with the reserve namespace until the external protocol is approved. */
import { createHash } from "node:crypto";
import type { InsightsSource } from "../../insights-engine/types";
import { midnight, monthAfter, type Snapshot } from "./preparation";
import { type ScenarioId, RESERVED_PROTOCOL } from "./reserved-protocol";

export function counterRandom(namespace: string, scenario: string, index: number) {
  const seed = createHash("sha256").update(`${namespace}:${scenario}:${index}`).digest("hex");
  let counter = 0;
  return () => parseInt(createHash("sha256").update(`${seed}:${counter++}`).digest("hex").slice(0, 13), 16) / 2 ** 52;
}
/** Conditional five-category truth; explicit endpoints of B are ±15/30 percentage points in P(Y>=4). */
export function scenarioProbabilities(id: ScenarioId, pre: number, routine: number, day: number, protein: number, latent: number): number[] {
  const p = [0.1 - (pre - 3) * 0.03, 0.35, 0.15, 0.3, 0.1 + (pre - 3) * 0.03];
  let move = 0;
  if (id.startsWith("B")) move = (id.includes("minus") ? -1 : 1) * (id.endsWith("15") ? 0.15 : 0.30) * Math.log1p(protein) / Math.log(81);
  if (id === "A2_serial") move = latent * 0.10;
  if (id === "A3_observed_changes") move = (routine ? 0.08 : -0.08) + (day >= 548 ? 0.05 : -0.05);
  if (id === "A5_variance") { const v = day >= 548 ? 0.05 : -0.05; p[0] += v; p[4] += v; p[2] -= 2 * v; }
  if (id === "A6_nonlinear_proxy") move = 0.15 * Math.sin(day / 27);
  if (id === "C1_hidden") move = latent * 0.15;
  p[1] -= move; p[3] += move;
  return p;
}
/** Pure generator; tests use ONLY a development namespace. Building the plan does not call this. */
export function generateScenario(id: ScenarioId, index: number, namespace: string, months = 36): Snapshot[] {
  if (months % 3 || months < 3 || months > 36) throw new Error("Invalid generator horizon");
  const random = counterRandom(namespace, id, index), anchor = RESERVED_PROTOCOL.anchor;
  const sessions: InsightsSource["sessions"][number][] = [], feelings: InsightsSource["feelings"][number][] = [], meals: InsightsSource["meals"][number][] = [];
  let proteinLatent = 0, outcomeLatent = 0;
  for (let day = 0, time = midnight(anchor); time < midnight(monthAfter(anchor, months)); day++, time += 86_400_000) {
    const weekday = new Date(time).getUTCDay();
    if (weekday === 0 || (id === "A8_sparse" && ![2, 5].includes(weekday))) continue;
    const date = new Date(time).toISOString().slice(0, 10), pre = 2 + Math.floor(random() * 3), routine = Math.floor(day / 7) % 2;
    proteinLatent = 0.8 * proteinLatent + 0.2 * (2 * random() - 1);
    outcomeLatent = 0.7 * outcomeLatent + 0.3 * (2 * random() - 1);
    const hidden = 2 * random() - 1;
    let protein = [0, 5, 15, 30, 50, 80][Math.floor(random() * 6)];
    if (id === "A2_serial") protein = Math.max(0, Math.min(80, 40 + proteinLatent * 80));
    if (id === "A3_observed_changes") protein = Math.max(0, protein / 2 + routine * 20 + (day >= 548 ? 10 : 0));
    if (id === "A6_nonlinear_proxy") protein = Math.max(0, 40 + 30 * Math.sin(day / 27) + 5 * (2 * random() - 1));
    if (id === "C1_hidden") protein = 40 + 40 * hidden;
    if (id === "C4_no_overlap") protein = routine ? 80 : 5;
    const truth = scenarioProbabilities(id, pre, routine, day, protein, id === "C1_hidden" ? hidden : outcomeLatent), draw = random();
    let y = 5, cumulative = 0;
    for (let k = 0; k < 5; k++) { cumulative += truth[k]; if (draw <= cumulative) { y = k + 1; break; } }
    const start = time + (18 + random()) * 3_600_000, end = start + 3_600_000, iso = (at: number) => new Date(at).toISOString(), sid = `research-${day}`;
    const fact = (value: number, moment: string, at: number) => ({ value, declaredMoment: moment, instrumentVersion: "energy-fatigue/1", capturedAt: iso(at), receivedAt: iso(at + 1000) });
    const facts: Record<string, unknown> = { energyPre: fact(pre, "pre", start - 60_000) };
    let response = true;
    if (id === "A4_mar") response = random() > 0.2 + 0.3 * Number(protein > 30);
    if (id === "C2_selection") response = random() < (Number(protein > 30) === Number(y >= 4) ? 0.95 : 0.15);
    if (response) {
      const post: Record<string, unknown> = fact(y, "post", end + 300_000);
      if (id === "A7_timing") { const u = random(); post.capturedAt = u < 0.3 ? null : u < 0.4 ? iso(end - 60_000) : u < 0.5 ? iso(end + 3 * 3_600_000) : post.capturedAt;
        if (u >= 0.4 && u < 0.5) post.receivedAt = iso(end + 3 * 3_600_000 + 1000); }
      // Hidden audit truth, never a model input: the reported clock alone cannot identify this error.
      if (id === "C3_clock" && random() < 0.2) post.researchActualCapturedAt = iso(end - 300_000);
      facts.energyPost = post;
    }
    sessions.push({ id: sid, date, routineId: id === "C5_new_routines" ? `routine-quarter-${Math.floor(day / 91)}` : `routine-${routine}`, routineName: null, name: null,
      status: "completed", startedAt: iso(start), endedAt: iso(end), performanceLevel: null, painLevel: null, legacyEnergyLevel: null });
    feelings.push({ sessionId: sid, revision: 1, facts });
    const uncertain = id === "C3_clock" && random() < 0.7;
    meals.push({ id: `meal-${day}`, date, consumedAt: uncertain ? null : iso(start - 3_600_000), consumedAtSource: uncertain ? null : "user_declared", entryKind: "meal", sourceType: "manual", rawInput: null, importRunId: null,
      proteinG: protein, calories: null, carbsG: null, fatG: null });
  }
  return Array.from({ length: months / 3 + 1 }, (_, i) => {
    const asOf = monthAfter(anchor, i * 3), selected = sessions.filter(row => row.date! < asOf), ids = new Set(selected.map(row => row.id));
    const source: InsightsSource = { sessions: selected, feelings: feelings.filter(row => ids.has(row.sessionId)), meals: meals.filter(row => row.date < asOf), exercises: [], sets: [], metricDefinitions: [], metricValues: [] };
    return { asOf, revision: `synthetic-${id}-${index}-${i}`, source: structuredClone(source) };
  });
}
