import type { ProgressComparisonReport } from '../progress/comparisons';
import type { TrainingContext } from './progress-training';
import type { ProgressEditorialFinding, ProgressPeriod, ProgressTrainingInPeriod } from './progress-contract';
import { addProgressIsoDays } from '../progress/analytics';

/** Exact equivalence only: a record and a contextual comparison of the same exercise are different observations. */
export function distinctEditorialFindings(items: ProgressEditorialFinding[]): ProgressEditorialFinding[] {
  const seen = new Set<string>();
  return items.filter(item => {
    const c = item.coverage, r = item.reference;
    const key = JSON.stringify([item.kind, item.method, item.title, item.description,
      item.period.start, item.period.end, r.start, r.end, item.observedDate,
      c.current, c.reference, c.eligibleCurrent, c.eligibleReference, c.unit,
      item.destination.kind, item.destination.kind === 'training_exercise' ? item.destination.exerciseId : null]);
    if (seen.has(key)) return false;
    seen.add(key); return true;
  }).slice(0, 3);
}

/** Fixed inventory, not a score: one record, one first/last comparison, one nutrition change. No Insights reads. */
export function progressEditorialFindings(input: {
  period: ProgressPeriod; training: TrainingContext | null;
  inPeriod: ProgressTrainingInPeriod | null; nutrition: ProgressComparisonReport | null;
}): ProgressEditorialFinding[] {
  const { period, training, inPeriod, nutrition } = input;
  const window = { start: period.start, end: period.end };
  const result: ProgressEditorialFinding[] = [];
  // Identity order is stable across magnitudes, signs and source row order.
  const record = training?.general.performance.exercises.filter(e => e.isPersonalRecord && e.signal && e.primarySampleSize > 0)
    .sort((a, b) => a.exerciseId.localeCompare(b.exerciseId))[0];
  if (record?.signal) result.push({
    id: `record:${record.exerciseId}`, kind: 'record', method: 'progress-record',
    title: record.name, description: record.signal.description, period: window, observedDate: null,
    reference: { start: null, end: addProgressIsoDays(period.start, -1) },
    coverage: { current: record.primarySampleSize, reference: null, eligibleCurrent: null, eligibleReference: null, unit: 'sets' },
    destination: { kind: 'training_exercise', exerciseId: record.exerciseId },
  });
  const change = inPeriod?.exercises.filter(e => e.reason === 'comparable' && e.signal && e.status !== 'insufficient_data')
    .sort((a, b) => a.id.localeCompare(b.id))[0];
  if (change?.signal && training) result.push({
    id: `first-last:${change.id}`, kind: 'change', method: 'progress-first-last',
    title: training.current.exercises.find(e => e.id === change.id)?.name ?? 'Ejercicio',
    description: change.signal.description, period: window, observedDate: change.lastDate,
    reference: { start: change.firstDate, end: change.firstDate },
    coverage: { current: change.sessions, reference: null, eligibleCurrent: null, eligibleReference: null, unit: 'sessions' },
    destination: { kind: 'training_exercise', exerciseId: change.id },
  });
  // Use the existing eligibility and change classification, never its magnitude ranking or a new threshold.
  for (const key of ['nutrition.calories', 'nutrition.protein']) {
    const r = nutrition?.results.find(r => r.metric.key === key);
    if (!r || !r.insightEligible || r.eligibility.status !== 'comparable' || r.reference.type !== 'period'
      || r.change === 'stable' || r.change === 'insufficient_data' || r.valueA === null || r.valueB === null) continue;
    const a = r.primary.coverage, b = r.reference.analysis.coverage;
    result.push({
      id: `nutrition:${key}`, kind: 'change', method: 'progress-nutrition',
      title: key === 'nutrition.calories' ? 'Calorías registradas' : 'Proteína registrada',
      description: `${r.formattedValueB} → ${r.formattedValueA} por día utilizado`,
      period: window, observedDate: null,
      reference: { start: period.previousStart, end: period.previousEnd },
      coverage: { current: a.registeredCount, reference: b.registeredCount,
        eligibleCurrent: a.eligibleCount, eligibleReference: b.eligibleCount, unit: 'days' },
      destination: { kind: 'nutrition' },
    });
    break;
  }
  return distinctEditorialFindings(result);
}
