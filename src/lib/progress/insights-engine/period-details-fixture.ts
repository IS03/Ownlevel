import type { InsightsSource } from "./types";
/** Synthetic fixture shared by the route and native journey tests. Never imported by runtime. */
export function periodDetailsFixture(): InsightsSource {
  const source: InsightsSource = { sessions: [], feelings: [], exercises: [], sets: [], meals: [], metricDefinitions: [], metricValues: [] };
  const id = (n: number) => `93670000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const fact = (value: number, capturedAt: string | null) => ({ value, capturedAt, instrumentVersion: "energy-fatigue/1", declaredMoment: "post", source: "mobile" });
  for (let i = 0; i < 10; i++) {
    const date = i < 8 ? `2026-08-${String(i + 3).padStart(2, "0")}` : i === 8 ? "2026-07-01" : "2026-11-01";
    (source.sessions as InsightsSource["sessions"][number][]).push({ id: id(i), date, routineId: null, routineName: null, name: null, status: "completed", startedAt: `${date}T18:00:00-03:00`, endedAt: `${date}T19:00:00-03:00`, legacyEnergyLevel: i === 2 ? 4 : null, painLevel: null, performanceLevel: null });
    (source.exercises as InsightsSource["exercises"][number][]).push({ id: id(100 + i), sessionId: id(i), exerciseId: id(200), name: "Ejercicio", implement: null, weightMode: null, configuration: null, isCompleted: true });
    (source.sets as InsightsSource["sets"][number][]).push({ id: id(300 + i), sessionExerciseId: id(100 + i), completedAt: `${date}T18:10:00-03:00`, isCompleted: true, actualReps: 8, actualLoad: 20 });
    const energyPost = i === 2 ? undefined : i === 3 ? fact(9, `${date}T19:05:00-03:00`) : i === 4 ? fact(3, null)
      : i === 5 ? { ...fact(3, `${date}T19:05:00-03:00`), instrumentVersion: "other/1" }
      : fact(i === 7 ? 1 : 4, `${date}T${i === 1 ? "23:30" : i === 6 ? "17:00" : "19:05"}:00-03:00`);
    const energyPre = i === 7 ? undefined : { ...fact(3, `${date}T${i === 0 ? "18:05" : "17:55"}:00-03:00`), declaredMoment: "pre" };
    (source.feelings as InsightsSource["feelings"][number][]).push({ sessionId: id(i), revision: 1, facts: { energyPost, energyPre,
      ...(i === 0 ? { fatiguePost: fact(2, `${date}T19:05:00-03:00`) } : {}) } });
  }
  const meals = [
    { date: "2026-08-11", calories: 0, proteinG: 0, carbsG: 0, fatG: 0 },
    { date: "2026-08-11", calories: 100, proteinG: null, carbsG: 20, fatG: null },
    { date: "2026-08-12", calories: null, proteinG: null, carbsG: null, fatG: null },
    { date: "2026-08-13", calories: 0, proteinG: 0, carbsG: 0, fatG: 0 },
    { date: "2026-09-01", calories: 500, proteinG: 25, carbsG: 50, fatG: 20 },
    { date: "2026-07-31", calories: 9999, proteinG: 999, carbsG: 999, fatG: 999 },
    { date: "2026-11-01", calories: 9999, proteinG: 999, carbsG: 999, fatG: 999 },
  ];
  return { ...source, meals: meals.map((m, i) => ({ ...m, id: id(400 + i), consumedAt: null, consumedAtSource: null, rawInput: null, entryKind: i === 4 ? "legacy_daily_summary" : "meal", sourceType: null, importRunId: null })) };
}
