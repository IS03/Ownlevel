import { describe, expect, it } from 'vitest';
import { buildTrainingRecovery, trainingGap } from './training-recovery';
import { recoveryFixture, recoveryId } from './training-recovery-fixture.test-helper';
import { parseProgressTrainingRecovery, recoveryBin, type RecoverySelection } from '../mobile-api/progress-training-recovery-contract';
import type { ProgressPeriod } from '../mobile-api/progress-contract';

const today = '2026-08-31', selection: RecoverySelection = { scope: 'all', routine: null, bin: null, offset: 0 };
const period: ProgressPeriod = { preset: 'custom', start: '2026-08-01', end: today, days: 31, previousStart: '2026-07-01', previousEnd: '2026-07-31', bucket: 'week', includesToday: true };
const plan = (date: string, routine = recoveryId(700), start = '08:00', end = '09:00') => ({ date: `2026-08-${date}`, start: `2026-08-${date}T${start}:00-03:00`, end: `2026-08-${date}T${end}:00-03:00`, routine, energy: 4, fatigue: 2 });
const read = (source = recoveryFixture([plan('01'), plan('02'), plan('03')]), selected = selection, range = period) => buildTrainingRecovery(source, { today, period: range, revision: 'a'.repeat(32), selection: selected });
describe('hours between registered sessions', () => {
  it('distinguishes any workout from the same routine, keeping intervening workouts visible', () => {
    const s = recoveryFixture([plan('01'), plan('02', recoveryId(701)), plan('03')]);
    const all = read(s), same = read(s, { ...selection, scope: 'routine' });
    expect(all.page.rows[0]!.gap.hours).toBe(23); expect(all.page.rows[0]!.gap.previous!.id).toBe(recoveryId(11));
    expect(same.page.rows[0]!.gap.hours).toBe(47); expect(same.page.rows[0]!.gap.previous!.id).toBe(recoveryId(10));
    expect(same.page.rows[0]!.gap.intervening).toBe(1);
    expect(parseProgressTrainingRecovery(all)).toBeDefined(); expect(parseProgressTrainingRecovery(same)).toBeDefined();
  });
  it('finds predecessors before period and routine filters, without filtering the general timeline', () => {
    const s = recoveryFixture([plan('01'), plan('02', recoveryId(701)), plan('03')]);
    const r = read(s, { ...selection, routine: recoveryId(700) }, { ...period, start: '2026-08-03', days: 29, previousStart: '2026-07-05', previousEnd: '2026-08-02' });
    expect(r.coverage.sessions).toBe(1); expect(r.page.rows[0]!.gap.previous!.id).toBe(recoveryId(11));
    expect(r.page.rows[0]!.gap.hours).toBe(23); expect(r.total.performance.improved).toBe(1);
    expect(parseProgressTrainingRecovery(r)).toBeDefined();
  });
  it.each([[24, '02', 1], [48, '03', 2], [72, '04', 3], [168, '08', 4]] as const)('classifies exact %d h by instants, not calendar days', (hours, date, bin) => {
    const s = recoveryFixture([plan('01'), plan(date, recoveryId(700), '09:00', '10:00')]), r = read(s);
    expect(r.page.rows[0]!.gap.hours).toBe(hours); expect(recoveryBin(hours)).toBe(bin); expect(r.groups[bin]!.sessions).toBe(1);
  });
  it('handles midnight, UTC offsets and real contiguous zero-hour gaps', () => {
    const s = recoveryFixture([{ ...plan('01'), start: '2026-08-02T01:30:00Z', end: '2026-08-02T03:30:00Z' }, plan('02', recoveryId(700), '01:30', '02:30')]);
    expect(read(s).page.rows[0]!.gap.hours).toBe(1);
    const contiguous = recoveryFixture([plan('01'), plan('01', recoveryId(700), '09:00', '10:00')]);
    expect(read(contiguous).page.rows[0]!.gap.hours).toBe(0); expect(read(contiguous).groups[0]!.sessions).toBe(1);
  });
  it('does not turn the first known session or free workouts into an infinite/zero routine gap', () => {
    const s = recoveryFixture([{ ...plan('01'), routine: null }, { ...plan('02'), routine: null }]);
    expect(read(s).coverage.excluded.no_previous).toBe(1);
    const same = read(s, { ...selection, scope: 'routine' }); expect(same.coverage.excluded.no_routine).toBe(2); expect(same.coverage.paired).toBe(0);
    expect(same.groups.every(g => g.sessions === 0)).toBe(true);
  });
  it('never skips a recent incomplete/uncertain predecessor to manufacture more rest', () => {
    const s = recoveryFixture([plan('01'), { ...plan('02'), end: null }, plan('03')]);
    expect(read(s).page.rows[0]!.gap.state).toBe('invalid_previous'); expect(read(s).page.rows[0]!.gap.hours).toBeNull();
    s.sessions[1]!.startedAt = '2026-08-04T08:00:00-03:00';
    expect(read(s).page.rows[0]!.gap.state).toBe('invalid_previous');
  });
  it('rejects overlapping sessions and same-start ambiguity', () => {
    const overlap = recoveryFixture([{ ...plan('01'), end: '2026-08-02T10:00:00-03:00' }, plan('02')]);
    expect(read(overlap).page.rows[0]!.gap.state).toBe('overlap');
    const same = recoveryFixture([plan('01'), plan('01')]);
    expect(read(same).coverage.paired).toBe(0);
    expect(read(same).page.rows.every(r => r.gap.state === 'uncertain_order')).toBe(true);
  });
  it('keeps fatigue, energy and performance eligibility independent', () => {
    const s = recoveryFixture([plan('01'), plan('02')]);
    (s.feelings[1]!.facts as { energyPre: { capturedAt: string } }).energyPre.capturedAt = '2026-08-02T08:30:00-03:00';
    s.exercises[1]!.configuration = null;
    const r = read(s); expect(r.total.energy.n).toBe(0); expect(r.total.fatigue.n).toBe(1);
    expect(r.total.fatigue.median).toBe(2); expect(r.total.performance.insufficient).toBe(1); expect(r.total.performance.improved).toBe(0);
  });
  it('uses routine UUIDs rather than names, and excludes discarded/active sessions as predecessors', () => {
    const s = recoveryFixture([plan('01'), plan('02', recoveryId(701)), { ...plan('03'), name: 'Renombrada' }]);
    expect(read(s, { ...selection, scope: 'routine' }).page.rows[0]!.gap.hours).toBe(47);
    s.sessions[1]!.status = 'discarded'; expect(read(s).page.rows[0]!.gap.hours).toBe(47);
    s.sessions[1]!.status = 'in_progress'; expect(read(s).coverage.sessions).toBe(2);
  });
  it('does not lose intervening uncertainty or unknown chronological dates', () => {
    const s = recoveryFixture([plan('01'), { ...plan('02', recoveryId(701)), start: null }, plan('03')]);
    expect(read(s, { ...selection, scope: 'routine' }).page.rows[0]!.gap.intervening).toBeNull();
    s.sessions[1]!.date = null;
    expect(trainingGap(s, s.sessions[2]!, 'all', today).state).toBe('uncertain_order');
  });
  it('paginates selected groups and rejects tampered timing and denominators', () => {
    const plans = Array.from({ length: 40 }, (_, i) => ({ date: '2026-08-10', start: new Date(Date.parse('2026-08-10T03:00:00Z') + i * 30 * 60_000).toISOString(), end: new Date(Date.parse('2026-08-10T03:10:00Z') + i * 30 * 60_000).toISOString() }));
    const s = recoveryFixture(plans), first = read(s), next = read(s, { ...selection, offset: 30 });
    expect(first.page.rows).toHaveLength(30); expect(next.page.rows).toHaveLength(10); expect(parseProgressTrainingRecovery(next)).toBeDefined();
    const bin = read(s, { ...selection, bin: 0 }); expect(bin.page.total).toBe(39); expect(bin.total).toEqual(first.total);
    const corrupt = structuredClone(first); corrupt.page.rows[0]!.gap.hours = 90;
    expect(parseProgressTrainingRecovery(corrupt)).toBeUndefined();
    expect(parseProgressTrainingRecovery({ ...first, coverage: { ...first.coverage, paired: 0 } })).toBeUndefined();
  });
});
