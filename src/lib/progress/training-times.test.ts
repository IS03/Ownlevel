import { describe, expect, it } from 'vitest';
import { buildTrainingTimes, trainingTimeMedian } from './training-times';
import { trainingStartTime, trainingTimesPreview } from './training-start-time';
import { descriptiveFixture, descriptiveId } from './insights-engine/descriptive-fixture.test-helper';
import { parseProgressTrainingTimes, type TrainingTimeSelection } from '../mobile-api/progress-training-times-contract';
import type { ProgressPeriod } from '../mobile-api/progress-contract';

const period: ProgressPeriod = { preset: 'custom', start: '2026-08-01', end: '2026-08-31', days: 31, previousStart: '2026-07-01', previousEnd: '2026-07-31', bucket: 'week', includesToday: true };
const selection: TrainingTimeSelection = { routine: null, execution: null, bin: null, offset: 0 };
const read = (source = descriptiveFixture(), filter = selection) => buildTrainingTimes(source, { today: '2026-08-31', period, revision: 'a'.repeat(32), selection: filter });

describe('training start and descriptive times', () => {
  it('groups in Córdoba by start, preserving minute precision and sessions crossing midnight', () => {
    const s = descriptiveFixture();
    Object.assign(s.sessions[1]!, { date: '2026-08-02', startedAt: '2026-08-03T02:30:00Z', endedAt: '2026-08-03T04:30:00Z' });
    const result = read(s), row = result.page.rows.find(r => r.id === s.sessions[1]!.id)!;
    expect(row.minute).toBe(1410); expect(row.minutes).toBe(120);
    expect(result.bins[11]!.sessions).toBe(1); expect(result.bands[3]!.sessions).toBe(1);
    expect(result.coverage.sessions).toBe(12); expect(result.coverage.timed).toBe(12);
    expect(parseProgressTrainingTimes(result)).toBeDefined();
  });
  it('keeps absent, invalid, future and backdated starts out, with separate counts', () => {
    const s = descriptiveFixture();
    s.sessions[1]!.startedAt = null; s.sessions[2]!.startedAt = '2026-08-04T10:00:00';
    s.sessions[3]!.startedAt = '2026-08-20T10:00:00-03:00';
    s.sessions[4]!.startedAt = '2026-09-01T10:00:00-03:00';
    const r = read(s);
    expect(r.coverage).toEqual({ sessions: 12, timed: 8, missingStart: 1, invalidStart: 1, differentDay: 1, futureStart: 1 });
    expect(r.bins.reduce((n, b) => n + b.sessions, 0)).toBe(8);
    expect(trainingStartTime({ date: '2026-08-03', startedAt: 'invalid' }, '2026-08-31')).toEqual({ state: 'invalidStart' });
  });
  it('uses independent eligibility: duration and energy do not require any comparable exercises', () => {
    const s = descriptiveFixture(); s.exercises.forEach(e => { e.configuration = null; });
    s.sessions[1]!.endedAt = null;
    const raw = s.feelings[2]!.facts as { energyPre: { capturedAt: string } }; raw.energyPre.capturedAt = `${s.sessions[2]!.date}T12:00:00-03:00`;
    delete (s.feelings[3]!.facts as Record<string, unknown>).energyPre;
    const r = read(s);
    expect(r.total.sessions).toBe(12); expect(r.total.duration.n).toBe(11);
    expect(r.total.energy.n).toBe(10); // a missing end does not erase a valid pre-session answer
    expect(r.total.performance.insufficient).toBe(12);
    expect(r.total.performance.improved).toBe(0); expect(r.executions).toHaveLength(0);
    expect(r.bands[3]!.sessions).toBe(0); // empty bands do not hide the populated bands
  });
  it('uses the strict comparator and references before the selected period', () => {
    const s = descriptiveFixture(), r = read(s);
    expect(r.total.performance.improved).toBeGreaterThan(0);
    s.exercises[1]!.configuration = 'recorded:otra variante';
    const changed = read(s);
    expect(changed.page.rows.find(row => row.id === s.sessions[1]!.id)!.performance.insufficient).toBe(1);
    expect(changed.executions).toHaveLength(2);
  });
  it('filters routines and never mixes exercise variants, kg or lingotes', () => {
    const s = descriptiveFixture(); s.exercises[2]!.weightMode = 'Lingotes (no kg)';
    const all = read(s); expect(new Set(all.executions.map(e => e.unit))).toEqual(new Set(['kg', 'lingotes']));
    const execution = all.executions.find(e => e.unit === 'lingotes')!;
    const r = read(s, { ...selection, execution: execution.key });
    expect(r.coverage.sessions).toBe(1); expect(r.total.load.n).toBe(1);
    expect(r.page.rows[0]!.load).toEqual({ value: s.sets[2]!.actualLoad, reps: s.sets[2]!.actualReps });
    const routine = read(s, { ...selection, routine: descriptiveId(700) });
    expect(routine.coverage.sessions).toBe(6);
    expect(() => read(s, { ...selection, routine: descriptiveId(9999) })).toThrow('Unknown timing routine');
  });
  it('preserves a real zero load and excludes unknown and unsupported modes', () => {
    const s = descriptiveFixture(); s.sets[1]!.actualLoad = 0;
    s.exercises[2]!.implement = null; s.exercises[3]!.weightMode = 'Peso asistido';
    const all = read(s), r = read(s, { ...selection, execution: all.executions[0]!.key });
    expect(r.page.rows.find(row => row.id === s.sessions[1]!.id)!.load!.value).toBe(0);
    expect(all.executions).toHaveLength(1);
  });
  it('keeps missing ends out of duration and uses medians rather than outlier-driven means', () => {
    const s = descriptiveFixture(); s.sessions[1]!.endedAt = s.sessions[1]!.startedAt;
    s.sessions[2]!.endedAt = `${s.sessions[2]!.date}T23:00:00-03:00`;
    const r = read(s); expect(r.total.duration.n).toBe(11); expect(r.total.duration.median).toBe(60);
    expect(trainingTimeMedian([5, 10, 15, 1000])).toBe(12.5); expect(trainingTimeMedian([])).toBeNull();
  });
  it('excludes active and discarded sessions and paginates the exact bin without losing aggregates', () => {
    const s = descriptiveFixture(); s.sessions[1]!.status = 'discarded'; s.sessions[2]!.status = 'in_progress';
    expect(read(s).coverage.sessions).toBe(10);
    for (let i = 0; i < 35; i++) s.sessions.push({ ...s.sessions[4]!, id: descriptiveId(900 + i) });
    const first = read(s); expect(first.page.rows).toHaveLength(30); expect(first.page.nextOffset).toBe(30);
    const next = read(s, { ...selection, offset: 30 }); expect(next.page.total).toBe(first.page.total);
    expect(new Set([...first.page.rows, ...next.page.rows].map(row => row.id)).size).toBe(first.page.total);
    const bin = read(s, { ...selection, bin: 8 }); expect(bin.page.rows.every(row => row.minute >= 960 && row.minute < 1080)).toBe(true);
    expect(bin.total).toEqual(first.total); expect(parseProgressTrainingTimes(next)).toBeDefined();
  });
  it('rejects corrupt coverage, distributions and page results at the shared contract boundary', () => {
    const r = read(); expect(parseProgressTrainingTimes(r)).toBeDefined();
    expect(parseProgressTrainingTimes({ ...r, coverage: { ...r.coverage, timed: 0 } })).toBeUndefined();
    expect(parseProgressTrainingTimes({ ...r, total: { ...r.total, energy: { ...r.total.energy, distribution: [100, 0, 0, 0, 0] } } })).toBeUndefined();
    expect(parseProgressTrainingTimes({ ...r, page: { ...r.page, nextOffset: 1 } })).toBeUndefined();
  });
  it('builds the landing preview from the same eligibility without another source read', () => {
    const s = descriptiveFixture(), r = read(s);
    const sessions = s.sessions.filter(row => row.date! >= period.start && row.date! <= period.end);
    const preview = trainingTimesPreview(sessions, '2026-08-31');
    expect(preview.bins).toEqual(r.bins.map(b => b.sessions)); expect(preview.timed).toBe(r.coverage.timed);
  });
});
