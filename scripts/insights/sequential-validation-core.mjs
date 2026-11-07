import { createHash } from "node:crypto";
import { closeSync, existsSync, fsyncSync, linkSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const digest = value => createHash("sha256").update(typeof value === "string" || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest("hex");
export const taskKey = task => `${task.scenario}-${String(task.history).padStart(4, "0")}`;
export function historySeed(seed, scenarioIndex, history, histories) { return (seed + Math.imul(scenarioIndex * histories + history + 1, 0x9e3779b1)) >>> 0; }
export function wilson(successes, total) {
  if (!Number.isInteger(total) || total <= 0 || !Number.isInteger(successes) || successes < 0 || successes > total) throw new Error("Invalid binomial counts");
  const z = 1.96, p = successes / total, den = 1 + z * z / total;
  const center = (p + z * z / (2 * total)) / den, half = z * Math.sqrt(p * (1 - p) / total + z * z / (4 * total * total)) / den;
  return { count: successes, total, rate: p, lower95: Math.max(0, center - half), upper95: Math.min(1, center + half) };
}
export function atomicJson(file, value) {
  const temp = `${file}.tmp`; const fd = openSync(temp, "w");
  try { writeFileSync(fd, JSON.stringify(value, null, 2) + "\n"); fsyncSync(fd); } finally { closeSync(fd); }
  renameSync(temp, file);
}
export function acquireRunLock(dir, resume) {
  mkdirSync(dir, { recursive: true }); const file = join(dir, "runner.lock");
  if (existsSync(file)) {
    const { pid } = JSON.parse(readFileSync(file, "utf8"));
    let alive = true; try { process.kill(pid, 0); } catch (error) { if (error.code === "ESRCH") alive = false; }
    if (!resume || alive) throw new Error(`Campaign locked by PID ${pid}; no second runner allowed`);
    unlinkSync(file);
  }
  writeFileSync(file, JSON.stringify({ pid: process.pid }), { flag: "wx" });
  return () => { if (existsSync(file)) unlinkSync(file); };
}
/** Exclusive atomic publication. A checkpoint is never overwritten or counted twice, even if delivery was ambiguous. */
export function saveHistory(dir, task, value, identity) {
  mkdirSync(dir, { recursive: true }); const file = join(dir, taskKey(task) + ".json");
  if (existsSync(file)) throw new Error("Duplicate completed history: " + taskKey(task));
  const body = { identity, task, value }, payload = { ...body, checksum: digest(body) }, temp = file + ".pending";
  const fd = openSync(temp, "w"); try { writeFileSync(fd, JSON.stringify(payload)); fsyncSync(fd); } finally { closeSync(fd); }
  linkSync(temp, file); unlinkSync(temp);
}
export function loadHistory(dir, task, identity) {
  const file = join(dir, taskKey(task) + ".json"); if (!existsSync(file)) return null;
  const { checksum, ...body } = JSON.parse(readFileSync(file, "utf8"));
  if (body.identity !== identity || digest(body) !== checksum || JSON.stringify(body.task) !== JSON.stringify(task)) throw new Error("Checkpoint mismatch: " + file);
  if (body.value.seed !== task.seed || body.value.scenario !== task.scenario || body.value.history !== task.history) throw new Error("History identity mismatch");
  return body.value;
}
export function tasksFor(protocol, scenarios) {
  return scenarios.flatMap(scenario => Array.from({ length: protocol.histories }, (_, history) => ({
    scenario, history, seed: historySeed(protocol.seed, protocol.scenarios.indexOf(scenario), history, protocol.histories),
  })));
}
const add = (to, from) => { for (const [k, n] of Object.entries(from)) to[k] = (to[k] ?? 0) + n; };
const isTarget = (id, scenario) => scenario.startsWith("previous_") ? id.endsWith(":metric:00000000-0000-4000-8006-000000000000:previous_day") : id.endsWith(":meal_window:carbsG:pre_3h");
export function summarize(protocol, values) {
  const cells = [];
  for (const scenario of protocol.scenarios) {
    const histories = values.filter(v => v.scenario === scenario); if (!histories.length) continue;
    for (const months of protocol.horizons) {
      let any = 0, plantedAny = 0, permutations = 0, looks = 0, rows = 0, sessions = 0, pairs = 0, kept = 0;
      const byOutcome = { energy: 0, fatigue: 0 }, plantedByOutcome = { energy: 0, fatigue: 0 }, bySlot = {}, coverage = {}, excludedCandidates = {}, dayExclusions = {}, historiesWithPass = [];
      for (const kind of ["energy", "fatigue"]) for (let slot = 1; slot <= months / 3; slot++) bySlot[`${kind}:${slot}`] = { evaluated: 0, any: 0, target: 0, cumulativeTarget: 0 };
      for (const h of histories) {
        const selected = h.looks.filter(l => l.slot <= months / 3);
        const didPass = selected.some(l => l.passes.length > 0), planted = selected.some(l => l.passes.some(id => isTarget(id, scenario)));
        any += +didPass; plantedAny += +planted;
        if (didPass && protocol.nullScenarios.includes(scenario)) historiesWithPass.push({ history: h.history, seed: h.seed,
          passes: selected.filter(l => l.passes.length).map(l => ({ kind: l.kind, date: l.date, look: l.look, details: l.passDetails })) });
        for (const kind of ["energy", "fatigue"]) {
          byOutcome[kind] += +selected.some(l => l.kind === kind && l.passes.length > 0);
          plantedByOutcome[kind] += +selected.some(l => l.kind === kind && l.passes.some(id => isTarget(id, scenario)));
          for (let slot = 1; slot <= months / 3; slot++) bySlot[`${kind}:${slot}`].cumulativeTarget += +selected.some(l => l.kind === kind && l.slot <= slot && l.passes.some(id => isTarget(id, scenario)));
        }
        for (const l of selected) {
          looks++; permutations += l.permutations; rows += l.rows; sessions += l.sessions; add(excludedCandidates, l.excludedCandidates); add(dayExclusions, l.dayExclusions);
          const key = `${l.kind}:${l.slot}`, slot = bySlot[key];
          slot.evaluated++; slot.any += +(l.passes.length > 0); slot.target += +l.passes.some(id => isTarget(id, scenario));
          for (const c of l.candidates) {
            pairs += c.pairs; kept += c.kept;
            const cov = coverage[c.id] ??= { evaluations: 0, outcomeRows: 0, pairs: 0, kept: 0, reasons: {}, exclusions: {} };
            cov.evaluations++; cov.outcomeRows += l.rows; cov.pairs += c.pairs; cov.kept += c.kept;
            cov.reasons[c.reason] = (cov.reasons[c.reason] ?? 0) + 1; add(cov.exclusions, c.exclusions);
          }
        }
      }
      cells.push({ scenario, kind: protocol.nullScenarios.includes(scenario) ? "null" : "power", months,
        anyPass: wilson(any, histories.length), targetAny: protocol.nullScenarios.includes(scenario) ? null : wilson(plantedAny, histories.length), historiesWithPass,
        byOutcome: Object.fromEntries(Object.entries(byOutcome).map(([k, n]) => [k, wilson(n, histories.length)])),
        plantedByOutcome: protocol.nullScenarios.includes(scenario) ? null : Object.fromEntries(Object.entries(plantedByOutcome).map(([k, n]) => [k, wilson(n, histories.length)])),
        meetsProposedNullCriterion: protocol.nullScenarios.includes(scenario) ? histories.length === protocol.histories && wilson(any, histories.length).upper95 <= protocol.target : null,
        bySlot: Object.fromEntries(Object.entries(bySlot).map(([k, v]) => [k, { ...v, denominatorHistories: histories.length,
          targetInterval: protocol.nullScenarios.includes(scenario) ? null : wilson(v.target, histories.length),
          cumulativeTargetInterval: protocol.nullScenarios.includes(scenario) ? null : wilson(v.cumulativeTarget, histories.length) }])),
        coverage, excludedCandidates, dayExclusions, lookEvaluations: looks, permutations,
        pooledLookCoverage: { rows, availableSessions: sessions, paired: pairs, retainedInStrata: kept,
          retainedPairShare: pairs ? kept / pairs : null },
      });
    }
  }
  return cells;
}
