import type { ProgressOverview, ProgressComparison, ProgressEditorialFinding } from '@/api/progress';
export const PANORAMA_TODAY = '2026-11-09';
const c: ProgressComparison = { status: 'insufficient_data', reason: 'previous_period_empty', current: null, previous: null, deltaAbsolute: null, deltaPercent: null, change: 'insufficient_data' };
export function panoramaFixture(): ProgressOverview {
    const points = (xs: (number | null)[]) => xs.map((value, i) => ({ start: ['2026-10-11', '2026-10-12', '2026-10-19', '2026-10-26', '2026-11-02', '2026-11-09'][i]!, end: ['2026-10-11', '2026-10-18', '2026-10-25', '2026-11-01', '2026-11-08', '2026-11-09'][i]!, value }));
    return { today: PANORAMA_TODAY, period: { preset: 'custom', start: '2026-10-11', end: PANORAMA_TODAY, days: 30, previousStart: '2026-09-11', previousEnd: '2026-10-10', bucket: 'week', includesToday: true }, evolution: [], changes: [],
        training: { status: 'ok', data: { sessions: 8, trainingDays: 7, sets: 96, minutes: 400, sessionsPerWeek: 2, comparisons: { sessions: c, trainingDays: c, sets: c, minutes: c, setsPerSession: c }, performance: { improved: 2, stable: 2, declined: 1, comparable: 5, insufficient: 3, headline: '2 de 5 ejercicios mejoraron' } } },
        body: { status: 'ok', data: { trackedMetrics: 1, excludedSuspect: 0 } }, metrics: { status: 'ok', data: { items: [] } },
        nutrition: { status: 'ok', data: { averageKcal: 2190, averageProteinG: 127, averageTargetKcal: 2200, averageTargetProteinG: 130, accumulatedBalanceKcal: null, registeredDays: 13, completedDays: 12, days: 30, calories: c, protein: c, balance: c } },
        inPeriod: { improved: 3, comparable: 5 }, panorama: { weight: { count: 3, first: { date: '2026-10-13', value: 81 }, last: { date: '2026-11-07', value: 79.8 } }, nutrition: { caloriesDays: 10, proteinDays: 8, targetDays: 8 } },
        sparks: { weight: { current: points([null, 81, null, 80.5, 79.8, null]), reference: null, first: 81, last: 79.8, referenceLast: null }, training: { current: points([0, 24, 36, 12, 24, 0]), reference: null }, nutrition: { current: points([null, 2100, 0, null, 2280, null]), reference: null } } };
}

/** Local-only visual and interaction fixture. No account or readers. */
export function editorialFixture(): ProgressEditorialFinding[] {
    const period = {start: '2026-10-11', end: PANORAMA_TODAY};
    const exerciseId = 'e1000000-0000-4000-8000-000000000001';
    return [
        {id: `record:${exerciseId}`, kind: 'record', method: 'progress-record', title: 'Press banca',
            description: 'Nuevo récord de reps: 10 con 60 kg', period, observedDate: null,
            reference: {start: null, end: '2026-10-10'},
            coverage: {current: 2, reference: null, eligibleCurrent: null, eligibleReference: null, unit: 'sets'},
            destination: {kind: 'training_exercise', exerciseId}},
        {id: `first-last:${exerciseId}`, kind: 'change', method: 'progress-first-last', title: 'Press banca',
            description: '+1 reps con 60 kg', period, observedDate: '2026-11-07',
            reference: {start: '2026-11-01', end: '2026-11-01'},
            coverage: {current: 3, reference: null, eligibleCurrent: null, eligibleReference: null, unit: 'sessions'},
            destination: {kind: 'training_exercise', exerciseId}},
        {id: 'nutrition:nutrition.calories', kind: 'change', method: 'progress-nutrition', title: 'Calorías registradas',
            description: '2.000 kcal → 2.190 kcal por día utilizado', period, observedDate: null,
            reference: {start: '2026-09-11', end: '2026-10-10'},
            coverage: {current: 10, reference: 15, eligibleCurrent: 29, eligibleReference: 30, unit: 'days'},
            destination: {kind: 'nutrition'}},
    ];
}
