import type { ProgressComparison, ProgressQuery, ProgressTraining, ProgressTrainingExerciseDetail, ProgressExerciseCharts } from '@/api/progress';
export const TODAY = '2026-10-05';
export const period = (preset: ProgressQuery['period'] = '30') => ({ preset, start: '2026-09-06', end: TODAY, days: 30, previousStart: '2026-08-07', previousEnd: '2026-09-05', bucket: 'week' as const, includesToday: true });
export const cmp = (over: Partial<ProgressComparison> = {}): ProgressComparison => ({ status: 'comparable', reason: 'eligible', current: 2, previous: 1, deltaAbsolute: 1, deltaPercent: 100, change: 'increased', ...over });
export const ex = { bench: 'e1000000-0000-4000-8000-000000000001', cable: 'e1000000-0000-4000-8000-000000000005', dips: 'e1000000-0000-4000-8000-000000000007', old: 'e1000000-0000-4000-8000-000000000008' };
export function training(preset: ProgressQuery['period'] = '30', empty = false): ProgressTraining {
  const empties = { sessions: 0, sets: 0, minutes: 0 };
  return { today: TODAY, period: period(preset),
    summary: { sessions: empty ? 0 : 3, trainingDays: empty ? 0 : 2, sets: empty ? 0 : 12, minutes: empty ? 0 : 150, sessionsPerWeek: empty ? 0 : 0.7,
      comparisons: { sessions: empty ? cmp({ status: 'insufficient_data', reason: 'current_period_empty', current: 0, previous: 0, deltaAbsolute: null, deltaPercent: null, change: 'insufficient_data' }) : cmp({ current: 3, previous: 1, deltaAbsolute: 2, deltaPercent: 200 }),
        trainingDays: cmp(), sets: cmp({ current: 12, previous: 4, deltaAbsolute: 8, deltaPercent: 200 }), minutes: cmp({ current: 150, previous: 60, deltaAbsolute: 90, deltaPercent: 150 }), setsPerSession: cmp({ change: 'stable' }) },
      performance: empty ? { improved: 0, stable: 0, declined: 0, comparable: 0, insufficient: 0, headline: 'No hay suficiente historial comparable' } : { improved: 1, stable: 0, declined: 0, comparable: 1, insufficient: 2, headline: '1 de 1 ejercicios mejoraron' } },
    series: empty ? [{ start: '2026-09-06', end: '2026-09-12', ...empties }] : [{ start: '2026-09-06', end: '2026-09-12', sessions: 1, sets: 4, minutes: 50 }, { start: '2026-09-13', end: TODAY, sessions: 2, sets: 8, minutes: 100 }],
    inPeriod: empty ? { improved: 0, stable: 0, declined: 0, insufficient: 0, exercises: [] } : { improved: 1, stable: 0, declined: 0, insufficient: 1, exercises: [
      { id: ex.bench, status: 'improved', reason: 'comparable', sessions: 3, firstDate: '2026-09-20', lastDate: '2026-10-04', signal: { kind: 'more_load_same_reps', description: '+5 kg manteniendo 5 reps', currentValue: 80, referenceValue: 75, contextValue: 5 } },
      { id: ex.cable, status: 'insufficient_data', reason: 'unsupported_weight_mode', sessions: 2, firstDate: '2026-09-21', lastDate: '2026-10-01', signal: null },
    ] },
    exercises: empty ? [] : [
      { id: ex.bench, name: 'Press banca', muscleLabel: 'Pecho', weightMode: 'Peso total', status: 'improved', reason: 'comparable', isPersonalRecord: true,
        signal: { kind: 'new_best_weight', description: 'Nuevo mejor peso: 80 kg × 5', currentValue: 80, referenceValue: 75, contextValue: 5 }, sessions: 3, sets: 9, lastDate: '2026-10-04' },
      { id: ex.cable, name: 'Remo máquina', muscleLabel: 'Espalda', weightMode: 'Carga manual', status: 'insufficient_data', reason: 'unsupported_weight_mode', isPersonalRecord: false, signal: null, sessions: 2, sets: 3, lastDate: '2026-10-01' },
      { id: ex.old, name: 'Curl', muscleLabel: 'Bíceps', weightMode: 'Por mancuerna', status: 'insufficient_data', reason: 'not_trained_in_primary', isPersonalRecord: false, signal: null, sessions: 0, sets: 0, lastDate: null },
    ],
    personalRecords: empty ? [] : [{ exerciseId: ex.bench, name: 'Press banca', description: 'Nuevo mejor peso: 80 kg × 5' }],
    feelings: empty ? [] : [{ key: 'energy', label: 'Energía', average: 3.8, scaleMaximum: 5, registered: 1, eligible: 3, ratio: 1 / 3 }],
    muscles: empty ? [] : [{ key: 'pecho', label: 'Pecho', sets: 9, sessions: 3, exercises: 1 }],
    routines: empty ? [] : [{ id: '__free__', name: 'Sesión libre', sessions: 3, sets: 12, minutes: 150 }] };
}
export function exercise(id: string, strategy: ProgressExerciseCharts['strategy'] = id === ex.cable ? 'unsupported' : 'load_reps'): ProgressTrainingExerciseDetail {
  const unit = strategy === 'unit_reps' ? 'lingotes' : strategy === 'time' ? 's' : strategy === 'bodyweight_reps' ? 'reps' : 'kg';
  const current = [{ date: '2026-09-20', sessionId: 's-1', value: 54, best: { reps: 10, weightKg: 54 } },
    { date: '2026-09-27', sessionId: 's-gap', value: 60, best: { reps: 15, weightKg: 60 } },
    { date: '2026-10-04', sessionId: 's-2', value: 60, best: { reps: 10, weightKg: 60 } }];
  const definitions = strategy === 'load_reps' ? [['estimated_1rm', '1RM estimado'], ['best_set', 'Mejor serie'], ['volume', 'Volumen']]
    : strategy === 'unit_reps' ? [['best_set', 'Mejor serie'], ['volume', 'Volumen']]
    : strategy === 'bodyweight_reps' ? [['best_set', 'Mejor serie'], ['total_reps', 'Repeticiones totales']]
    : strategy === 'time' ? [['best_time', 'Mejor tiempo'], ['total_time', 'Tiempo total']] : [];
  const measures: ProgressExerciseCharts['measures'] = definitions.map(([key, label]) => ({ key: key as ProgressExerciseCharts['measures'][number]['key'], label, unit, derived: key === 'estimated_1rm',
    points: key === 'estimated_1rm' ? [0, 2].map(i => ({ ...current[i], value: i === 0 ? 72 : 80 })) : current,
    reference: null }));
  return { today: TODAY, period: period(), exercise: { id, name: strategy === 'unsupported' ? 'Remo máquina' : 'Press banca', muscleLabel: 'Pecho', weightMode: strategy === 'unsupported' ? 'Carga manual' : 'Peso total' },
    charts: { strategy, measures },
    performance: strategy === 'unsupported' ? { status: 'insufficient_data', reason: 'unsupported_weight_mode', signal: null, isPersonalRecord: false, primarySamples: 3, referenceSamples: 2 }
      : { status: 'improved', reason: 'comparable', signal: { kind: 'more_load_same_reps', description: '+4 kg manteniendo 10 reps', currentValue: 60, referenceValue: 56, contextValue: 10 }, isPersonalRecord: false, primarySamples: 9, referenceSamples: 3 },
    comparisons: { sessions: cmp(), sets: cmp() },
    marks: strategy === 'unsupported' ? [] : [{ kind: 'best_load', label: 'Mejor peso', value: 60, unit: 'kg', context: '10 reps', date: '2026-10-04' }],
    chart: strategy === 'unsupported' ? null : { kind: 'load', unit: 'kg', points: current.map(p => ({ date: p.date, sessionId: p.sessionId, value: p.value, context: p.best.reps })) },
    sessions: [...current].reverse().map(p => ({ sessionId: p.sessionId, date: p.date, routineName: 'Torso', sets: [{ reps: p.best.reps, weightKg: p.best.weightKg }] })) };
}
