import type { PerformanceExerciseBlock, PerformanceSession } from "./types";

/** A small seeded generator, so a failure names the seed that reproduces it. Test fixture: no product code imports it. */
export function randomFrom(seed: number) { let state = seed >>> 0; return () => { state = Math.imul(state ^ (state >>> 15), 0x2c1b3c6d) + 0x9e3779b9 >>> 0; return state / 2 ** 32; }; }
const EXERCISES = [1, 2, 3].map(n => `93670000-0000-4000-8000-00000000000${n}`);
const MODES = [["Peso total", "kg"], ["lingotes (no kg)", "lingotes"], ["Peso corporal", "reps"], ["Tiempo (segundos)", "seconds"]] as const;

/** Messy on purpose: other implements, known and unknown configuration, ties in time, broken sessions, issues and repeated blocks. */
export function messyHistory(seed: number): PerformanceSession[] {
  const random = randomFrom(seed), pick = <T,>(rows: readonly T[]) => rows[Math.floor(random() * rows.length)]!;
  const sessions: PerformanceSession[] = [];
  for (let day = 0; day < 40; day++) {
    const date = new Date(Date.UTC(2026, 0, 1 + Math.floor(day / 2))).toISOString().slice(0, 10);
    const tie = random() < 0.15 ? 0 : day % 2;
    const exercises: PerformanceExerciseBlock[] = [];
    for (const [index, exerciseId] of EXERCISES.entries()) {
      if (random() < 0.3) continue;
      const blocks = random() < 0.1 ? 2 : 1;
      for (let block = 0; block < blocks; block++) {
        const [weightMode, unit] = random() < 0.85 ? MODES[index % 2]! : pick(MODES);
        const loaded = unit === "kg" || unit === "lingotes";
        exercises.push({ id: `b${day}-${index}-${block}`, exerciseId, completed: random() > 0.05,
          context: { weightMode: random() < 0.03 ? null : weightMode, unit, implement: random() < 0.03 ? null : pick(["barra", "barra", "barra", "mancuerna"]), configuration: pick([null, null, null, "none", "cerrado", " "]) },
          sets: Array.from({ length: 1 + Math.floor(random() * 3) }, (_, set) => ({ id: `x${day}-${index}-${block}-${set}`, completed: random() > 0.1,
            amount: random() < 0.02 ? null : Math.floor(random() * 4) * (random() < 0.9 ? 3 : 0), load: loaded ? pick([20, 25, 30]) : random() < 0.02 ? 5 : null })) });
      }
    }
    sessions.push({ id: `s${String(day).padStart(2, "0")}`, date, routineId: "r", status: random() < 0.05 ? "active" : random() < 0.05 ? "discarded" : "completed",
      startedAt: random() < 0.03 ? null : `${date}T${String(8 + tie * 4).padStart(2, "0")}:00:00.000Z`, endedAt: `${date}T${String(9 + tie * 4).padStart(2, "0")}:00:00.000Z`, chronology: random() < 0.03 ? "uncertain" : "verified", exercises });
  }
  return sessions;
}
