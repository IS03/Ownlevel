import { descriptiveFixture, descriptiveId } from './insights-engine/descriptive-fixture.test-helper';
import type { InsightsSource } from './insights-engine/types';
export const recoveryId = descriptiveId;
export function recoveryFixture(plans: { date: string; start: string | null; end: string | null; routine?: string | null; name?: string; energy?: number; fatigue?: number }[]) {
  const source = descriptiveFixture(), template = { session: source.sessions[0]!, exercise: source.exercises[0]!, set: source.sets[0]! };
  const sessions: InsightsSource['sessions'][number][] = [], exercises: InsightsSource['exercises'][number][] = [], sets: InsightsSource['sets'][number][] = [], feelings: InsightsSource['feelings'][number][] = [];
  plans.forEach((p, i) => {
    const id = descriptiveId(10 + i), block = descriptiveId(100 + i), start = p.start ? Date.parse(p.start) : NaN;
    sessions.push({ ...template.session, id, date: p.date, startedAt: p.start, endedAt: p.end, routineId: p.routine === undefined ? descriptiveId(700) : p.routine, routineName: p.name ?? 'Rutina A', status: 'completed' });
    exercises.push({ ...template.exercise, id: block, sessionId: id, exerciseId: descriptiveId(500), implement: 'barra', weightMode: 'Peso total', configuration: 'recorded:prueba' });
    sets.push({ ...template.set, id: descriptiveId(200 + i), sessionExerciseId: block, actualReps: 8 + i, actualLoad: 50, completedAt: Number.isFinite(start) ? new Date(start + 5 * 60_000).toISOString() : null });
    const fact = (value: number) => ({ value, instrumentVersion: 'energy-fatigue/1', declaredMoment: 'pre', capturedAt: Number.isFinite(start) ? new Date(start - 5 * 60_000).toISOString() : null });
    feelings.push({ sessionId: id, revision: 1, facts: { ...(p.energy === undefined ? {} : { energyPre: fact(p.energy) }), ...(p.fatigue === undefined ? {} : { fatiguePre: fact(p.fatigue) }) } });
  });
  return { ...source, sessions, exercises, sets, feelings };
}
