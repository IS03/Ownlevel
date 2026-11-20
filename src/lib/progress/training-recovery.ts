import { prepareTrainingTimes, trainingTimeMedian } from './training-times';
import { instantMs } from './insights-engine/source-adapter';
import { trainingStartTime } from './training-start-time';
import type { InsightsSource } from './insights-engine/types';
import type { ProgressPeriod } from '../mobile-api/progress-contract';
import { recoveryBin, type ProgressTrainingRecovery, type RecoveryFeeling, type RecoveryGroup, type RecoveryRow, type RecoverySelection } from '../mobile-api/progress-training-recovery-contract';

type Session = InsightsSource['sessions'][number];
const unknown = (state: Exclude<RecoveryRow['gap']['state'], 'paired'>): RecoveryRow['gap'] => ({ state, hours: null, previous: null, intervening: null });
/** Select predecessors before applying the screen's routine/period filters. Unknown recent sessions never get skipped to manufacture a longer gap. */
export function trainingGap(source: InsightsSource, current: Session, scope: RecoverySelection['scope'], today: string): RecoveryRow['gap'] {
  if (scope === 'routine' && !current.routineId) return unknown('no_routine');
  const now = trainingStartTime(current, today);
  if (now.state !== 'timed' || !current.date) return unknown('uncertain_order');
  const all = source.sessions.filter(s => s.status === 'completed' && s.id !== current.id);
  const candidates = all.filter(s => scope !== 'routine' || s.routineId?.toLowerCase() === current.routineId?.toLowerCase())
    .filter(s => !s.date || s.date < current.date! || s.date === current.date && (trainingStartTime(s, today).state !== 'timed' || instantMs(s.startedAt)! <= now.start));
  if (!candidates.length) return unknown('no_previous');
  if (candidates.some(s => !s.date)) return unknown('uncertain_order');
  if (candidates.some(s => instantMs(s.startedAt) === now.start)) return unknown('uncertain_order');
  if (candidates.some(s => trainingStartTime(s, today).state === 'timed' && instantMs(s.endedAt) !== null && instantMs(s.endedAt)! > now.start)) return unknown('overlap');
  const day = candidates.reduce((latest, s) => s.date! > latest ? s.date! : latest, '');
  const lastDay = candidates.filter(s => s.date === day);
  if (lastDay.some(s => trainingStartTime(s, today).state !== 'timed')) return unknown('invalid_previous');
  lastDay.sort((a, b) => instantMs(b.startedAt)! - instantMs(a.startedAt)!);
  const previous = lastDay[0]!, start = instantMs(previous.startedAt)!;
  if (start === now.start || lastDay[1] && instantMs(lastDay[1].startedAt) === start) return unknown('uncertain_order');
  const end = instantMs(previous.endedAt);
  if (end === null || end <= start) return unknown('invalid_previous');
  if (end > now.start) return unknown('overlap');
  if (candidates.some(s => s.id !== previous.id && instantMs(s.startedAt) !== null && instantMs(s.endedAt) !== null && instantMs(s.startedAt)! < end && instantMs(s.endedAt)! > start)) return unknown('uncertain_order');
  // Other sessions may have happened between two repetitions of a routine. This interval is never described as complete rest.
  let intervening: number | null = 0;
  for (const s of all) {
    if (s.id === previous.id) continue;
    const time = trainingStartTime(s, today);
    if (time.state === 'timed') {
      if (time.start >= end && time.start < now.start && intervening !== null) intervening++;
      else if (time.start < end && instantMs(s.endedAt) !== null && instantMs(s.endedAt)! > end) intervening = null;
    }
    else if (!s.date || s.date >= previous.date! && s.date <= current.date) intervening = null;
  }
  return { state: 'paired', hours: (now.start - end) / 3_600_000, intervening,
    previous: { id: previous.id, date: previous.date!, name: previous.routineName ?? previous.name ?? 'Sesión libre', endedAt: previous.endedAt! } };
}
function summarize(rows: RecoveryRow[]): RecoveryGroup {
  const feelings = (key: 'energy' | 'fatigue'): RecoveryFeeling => {
    const values = rows.flatMap(r => r[key].value === null ? [] : [r[key].value!]);
    return { n: values.length, median: trainingTimeMedian(values), distribution: [1, 2, 3, 4, 5].map(v => values.filter(x => x === v).length) };
  };
  const performance = { improved: 0, stable: 0, declined: 0, ambiguous: 0, insufficient: 0 };
  for (const row of rows) for (const key of Object.keys(performance) as (keyof typeof performance)[]) performance[key] += row.performance[key];
  return { sessions: rows.length, energy: feelings('energy'), fatigue: feelings('fatigue'), performance };
}
export function buildTrainingRecovery(source: InsightsSource, options: { today: string; period: ProgressPeriod; revision: string; selection: RecoverySelection }): ProgressTrainingRecovery {
  const { today, period, revision, selection } = options;
  const prepared = prepareTrainingTimes(source, { today, period, selection: { routine: selection.routine, execution: null, bin: null, offset: 0 } });
  const sessions = new Map(source.sessions.map(s => [s.id, s]));
  const rows: RecoveryRow[] = prepared.rows.map(r => ({ id: r.id, date: r.date, name: r.name, routineId: r.routineId, startedAt: r.startedAt,
    energy: r.energy, fatigue: r.fatigue, performance: r.performance, gap: trainingGap(source, sessions.get(r.id)!, selection.scope, today) }));
  const paired = rows.filter(r => r.gap.state === 'paired');
  const excluded = { no_previous: 0, no_routine: 0, uncertain_order: 0, invalid_previous: 0, overlap: 0 };
  for (const row of rows) if (row.gap.state !== 'paired') excluded[row.gap.state]++;
  const selected = selection.bin === null ? rows : paired.filter(r => recoveryBin(r.gap.hours!) === selection.bin);
  const page = selected.slice(selection.offset, selection.offset + 30), next = selection.offset + page.length;
  return { contractVersion: 'training-recovery/1', timeBasis: 'stored_end_to_start', timezone: 'America/Argentina/Cordoba', today, period, revision, selection, routines: prepared.routines,
    coverage: { sessions: prepared.coverage.sessions, paired: paired.length, currentTimeExcluded: prepared.coverage.sessions - rows.length, excluded },
    total: summarize(paired), groups: Array.from({ length: 5 }, (_, index) => summarize(paired.filter(r => recoveryBin(r.gap.hours!) === index))),
    page: { total: selected.length, nextOffset: next < selected.length ? next : null, rows: page } };
}
