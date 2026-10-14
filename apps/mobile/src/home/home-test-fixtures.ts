import { habitWeekRange, type ProgressHabitWeek, type ProgressBody, ProgressComparison, ProgressPeriod, ProgressTraining } from '@/api/progress';

const period = (preset: '7' | '30'): ProgressPeriod => ({
  preset, start: preset === '7' ? '2026-10-04' : '2026-09-11', end: '2026-10-10', days: Number(preset),
  previousStart: preset === '7' ? '2026-09-27' : '2026-08-12', previousEnd: preset === '7' ? '2026-10-03' : '2026-09-10',
  bucket: preset === '7' ? 'day' : 'week', includesToday: true,
});

const comparison: ProgressComparison = {
  status: 'comparable', reason: 'eligible', current: 3, previous: 2, deltaAbsolute: 1, deltaPercent: 50, change: 'increased',
};

export function homeProgressTraining(preset: '7' | '30' = '7'): ProgressTraining {
  return {
    today: '2026-10-10', period: period(preset),
    summary: { sessions: 3, trainingDays: 3, sets: 54, minutes: 150, sessionsPerWeek: preset === '7' ? null : 0.7,
      comparisons: { sessions: comparison, trainingDays: comparison, sets: comparison, minutes: comparison, setsPerSession: comparison },
      performance: { improved: 1, stable: 0, declined: 0, comparable: 1, insufficient: 0, headline: '1 ejercicio mejoró' } },
    series: [{ start: period(preset).start, end: period(preset).end, sessions: 3, sets: 54, minutes: 150 }],
    exercises: [], personalRecords: [{ exerciseId: 'bench-id', name: 'Press banca', description: 'Nuevo mejor peso: 80 kg × 5' }],
    feelings: [], muscles: [], routines: [],
  };
}

export function homeProgressBody(): ProgressBody {
  const first = { date: '2026-10-06', value: 78.7, imported: false, provenanceLabel: 'Registro' };
  const last = { date: '2026-10-10', value: 78.4, imported: false, provenanceLabel: 'Registro' };
  return { today: '2026-10-10', period: period('7'), excludedSuspect: 0, metrics: [{
    key: 'body.weight', label: 'Peso', unit: 'kg', first, last, latest: last, change: -0.3, referenceChange: null,
    trend: 'decreased', confidence: 'limited', observations: [first, last], referenceCount: 0,
    comparison: { status: 'insufficient_data', reason: 'insufficient_previous_samples' },
  }] };
}

export function homeProgressHabits(): ProgressHabitWeek {
  return { today: '2026-10-10', ...habitWeekRange('2026-10-10'), items: [{ id: 'm1', systemKey: 'water', name: 'Agua', unit: 'L', valueType: 'decimal',
    average: 2.1, coverage: { registered: 5, eligible: 5, ratio: 1 }, comparison: { ...comparison, current: 2.1 } }] };
}
