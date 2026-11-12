import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from '@jest/globals';

import type { ProgressBody, ProgressBodyMetric, ProgressTrainingExercise, ProgressTrainingRecords } from '@/api/progress';

import { MEASURE_WINDOW_DAYS, recordsSummary, selectProgressRows, weightSummary, type ProgressRowModel } from './home-progress-selection';
import type { HomeResource } from './home-resource';
import { homeProgressBody, homeProgressRecords } from './home-test-fixtures';

const DATE = '2026-10-10';
const ready = <T,>(data: T): HomeResource<T> => ({ data, confirmedAt: 1, status: 'ready' });
const stale = <T,>(data?: T): HomeResource<T> => ({ data, confirmedAt: data ? 1 : null, status: 'unavailable' });
const loading = <T,>(): HomeResource<T> => ({ data: undefined, confirmedAt: null, status: 'loading' });

const exercise = (over: Partial<ProgressTrainingExercise> & { id: string }): ProgressTrainingExercise => ({
  name: over.id, muscleLabel: 'Pecho', weightMode: 'load_reps', status: 'stable', reason: 'comparable', signal: null,
  isPersonalRecord: false, sessions: 2, sets: 6, lastDate: null, ...over,
});
const signal = { kind: 'load', description: '8 lingotes × 6 reps', currentValue: 8, referenceValue: 7, contextValue: 6 };

/** Records with a PR on `bench-id`, last trained on `lastDate`. */
function recordsWithPr(lastDate: string | null = '2026-10-08'): ProgressTrainingRecords {
  const records = homeProgressRecords();
  records.exercises = [exercise({ id: 'bench-id', name: 'Press banca', isPersonalRecord: true, lastDate })];
  return records;
}
function recordsWithoutPr(): ProgressTrainingRecords {
  const records = homeProgressRecords(); records.personalRecords = []; records.exercises = []; records.performance.comparable = 0; return records;
}
function recordsWithChange(lastDate: string | null = '2026-10-09'): ProgressTrainingRecords {
  const records = recordsWithoutPr();
  records.exercises = [exercise({ id: 'machine-id', name: 'Remo', status: 'improved', signal, lastDate })];
  return records;
}

const observation = (date: string, value: number) => ({ date, value, imported: false, provenanceLabel: 'Registro' });
function metric(key: string, label: string, date: string | null, value = 80, unit: 'kg' | 'cm' = 'cm'): ProgressBodyMetric {
  const latest = date ? observation(date, value) : null;
  return { key, label, unit, first: latest, last: latest, latest, change: null, referenceChange: null, trend: 'unavailable', confidence: 'unavailable',
    observations: latest ? [latest] : [], referenceCount: 0, comparison: { status: 'insufficient_data', reason: 'insufficient_previous_samples' } };
}
function bodyWith(weightDate: string | null, ...measures: ProgressBodyMetric[]): ProgressBody {
  const body = homeProgressBody();
  body.metrics = [...(weightDate ? [metric('body.weight', 'Peso', weightDate, 78.4, 'kg')] : []), ...measures];
  return body;
}
const select = (body: HomeResource<ProgressBody>, records: HomeResource<ProgressTrainingRecords>, date = DATE) => selectProgressRows({ body, date, records });
const ids = (rows: ProgressRowModel[]) => rows.map(row => row.id);
const day = (offset: number) => { const d = new Date(`${DATE}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + offset); return d.toISOString().slice(0, 10); };

describe('selectProgressRows: the two primary rows', () => {
  it('both reads with data: records and weight, with the existing summaries and targets', () => {
    const rows = select(ready(homeProgressBody()), ready(homeProgressRecords()));
    expect(ids(rows)).toEqual(['records', 'weight']);
    expect(rows[0]).toMatchObject({ icon: 'trophy', title: '1 récord en 30 días', subtitle: 'Press banca', state: 'ready', target: { kind: 'exercise', period: '30', exerciseId: 'bench-id' } });
    expect(rows[1]).toMatchObject({ icon: 'scale', title: 'Peso', value: '78,4 kg', subtitle: 'Último registro: hoy', state: 'ready', target: { kind: 'body', period: '7' } });
    expect(rows[1].target).not.toHaveProperty('metric');
  });

  it('keeps the exported summaries with their current text and targets', () => {
    expect(recordsSummary(homeProgressRecords())).toEqual({ title: '1 récord en 30 días', subtitle: 'Press banca', target: { kind: 'exercise', period: '30', exerciseId: 'bench-id' } });
    expect(weightSummary(homeProgressBody())).toEqual({ title: 'Peso', value: '78,4 kg', subtitle: 'Último registro: hoy', target: { kind: 'body', period: '7' } });
  });

  it('many records go to the training list; the single one to its exercise', () => {
    const records = homeProgressRecords();
    for (const name of ['Sentadilla', 'Remo', 'Dominadas']) records.personalRecords.push({ exerciseId: `${name}-id`, name, description: 'Nuevo mejor peso' });
    expect(select(ready(homeProgressBody()), ready(records))[0]).toMatchObject({ title: '4 récords en 30 días', subtitle: 'Press banca, Sentadilla y 2 más', target: { kind: 'training', period: '30' } });
    expect(select(ready(homeProgressBody()), ready(homeProgressRecords()))[0].target).toEqual({ kind: 'exercise', period: '30', exerciseId: 'bench-id' });
  });

  it.each(['improved', 'declined'] as const)('without a PR it falls back to the %s performance change', status => {
    const records = recordsWithChange(); records.exercises[0].status = status;
    expect(select(ready(bodyWith('2026-10-01')), ready(records))[0]).toMatchObject({
      title: 'Rendimiento en 30 días', subtitle: `${status === 'improved' ? '↑' : '↓'} Remo · 8 lingotes × 6 reps`,
      target: { kind: 'exercise', period: '30', exerciseId: 'machine-id' }, evidenceDate: '2026-10-09' });
  });

  it('records-only, weight-only and neither stay honest and keep both stable rows', () => {
    const noBody = bodyWith(null);
    const recordsOnly = select(ready(noBody), ready(homeProgressRecords()));
    expect(recordsOnly.map(row => row.subtitle)).toEqual(['Press banca', 'Sin registros']);
    const weightOnly = select(ready(homeProgressBody()), ready(recordsWithoutPr()));
    expect(weightOnly.map(row => row.title)).toEqual(['Sin récords en 30 días', 'Peso']);
    const neither = select(ready(noBody), ready(recordsWithoutPr()));
    expect(neither.map(row => [row.title, row.subtitle])).toEqual([['Sin récords en 30 días', 'Faltan entrenamientos comparables'], ['Peso', 'Sin registros']]);
    expect(neither.every(row => row.evidenceDate === null && !row.value)).toBe(true);
  });

  it('suspect-only body data asks to review Cuerpo instead of saying there is nothing', () => {
    const body = bodyWith(null); body.excludedSuspect = 2;
    expect(select(ready(body), ready(homeProgressRecords()))[1].subtitle).toBe('Revisá tus registros en Cuerpo');
  });

  it('comparable exercises without a change say to keep adding sessions', () => {
    const records = recordsWithoutPr(); records.performance.comparable = 2;
    expect(select(ready(homeProgressBody()), ready(records))[0].subtitle).toBe('Seguí sumando entrenamientos');
  });
});

describe('selectProgressRows: order follows the recency of the evidence', () => {
  it('weight logged after the last record exercise goes first', () => {
    const rows = select(ready(bodyWith('2026-10-10')), ready(recordsWithPr('2026-10-08')));
    expect(ids(rows)).toEqual(['weight', 'records']);
    expect(rows.map(row => row.evidenceDate)).toEqual(['2026-10-10', '2026-10-08']);
  });

  it('records trained after the weight keep records first', () => {
    expect(ids(select(ready(bodyWith('2026-10-05')), ready(recordsWithPr('2026-10-08'))))).toEqual(['records', 'weight']);
  });

  it('the performance-change exercise orders too', () => {
    expect(ids(select(ready(bodyWith('2026-10-10')), ready(recordsWithChange('2026-10-09'))))).toEqual(['weight', 'records']);
  });

  it('the latest of the PR exercises counts, not only the ones named in the subtitle', () => {
    const records = recordsWithPr('2026-10-01');
    records.personalRecords.push({ exerciseId: 'row-id', name: 'Remo', description: 'x' });
    records.exercises.push(exercise({ id: 'row-id', lastDate: '2026-10-10' }));
    expect(select(ready(bodyWith('2026-10-10')), ready(records)).map(row => [row.id, row.evidenceDate])).toEqual([['records', '2026-10-10'], ['weight', '2026-10-10']]);
  });

  it('ties, a missing date on either side, or a non-ready row keep records first', () => {
    expect(ids(select(ready(bodyWith('2026-10-08')), ready(recordsWithPr('2026-10-08'))))).toEqual(['records', 'weight']);
    expect(ids(select(ready(bodyWith('2026-10-10')), ready(recordsWithPr(null))))).toEqual(['records', 'weight']);
    expect(ids(select(ready(bodyWith(null)), ready(recordsWithPr('2026-10-01'))))).toEqual(['records', 'weight']);
    expect(ids(select(ready(bodyWith('2026-10-10')), ready(recordsWithoutPr())))).toEqual(['records', 'weight']);
    expect(ids(select(stale(bodyWith('2026-10-10')), ready(recordsWithPr('2026-10-01'))))).toEqual(['records', 'weight']);
    expect(ids(select(ready(bodyWith('2026-10-10')), stale(recordsWithPr('2026-10-01'))))).toEqual(['records', 'weight']);
    expect(ids(select(loading(), ready(recordsWithPr('2026-10-01'))))).toEqual(['records', 'weight']);
  });

  it('a date in the future or malformed is no evidence', () => {
    expect(ids(select(ready(bodyWith('2026-10-12')), ready(recordsWithPr('2026-10-01'))))).toEqual(['records', 'weight']);
    expect(select(ready(bodyWith('2026-10-10')), ready(recordsWithPr('mañana')))[0].evidenceDate).toBeNull();
  });

  it('the order changes only with the data: the same inputs always give the same output and are not mutated', () => {
    const body = ready(bodyWith('2026-10-10', metric('body.waist', 'Cintura', '2026-10-09', 90)));
    const records = ready(recordsWithPr('2026-10-08'));
    const before = JSON.stringify([body, records]);
    const first = select(body, records);
    expect(select(body, records)).toEqual(first);
    expect(JSON.stringify([body, records])).toBe(before);
    expect(select(ready(JSON.parse(JSON.stringify(body.data))), ready(JSON.parse(JSON.stringify(records.data))))).toEqual(first);
  });
});

describe('selectProgressRows: freshness and states', () => {
  it('a previous day never passes as today: ready data of another day is loading, failed data is unavailable', () => {
    const rows = select(ready(homeProgressBody()), ready(homeProgressRecords()), '2026-10-11');
    expect(rows.map(row => [row.id, row.state, row.title, row.subtitle])).toEqual([['records', 'loading', 'Récords', ''], ['weight', 'loading', 'Peso', '']]);
    const failed = select(stale(homeProgressBody()), stale(homeProgressRecords()), '2026-10-11');
    expect(failed.map(row => row.state)).toEqual(['unavailable', 'unavailable']);
  });

  it('the same data with a new date flips to loading, then the day\'s own read shows', () => {
    const body = ready(homeProgressBody()), records = ready(homeProgressRecords());
    expect(select(body, records).map(row => row.state)).toEqual(['ready', 'ready']);
    expect(select(body, records, day(1)).map(row => row.state)).toEqual(['loading', 'loading']);
  });

  it('loading is a skeleton row, unavailable without data says it, with fixed labels and no value', () => {
    const rows = select(loading(), stale<ProgressTrainingRecords>());
    expect(rows.map(row => [row.id, row.state, row.title, row.subtitle, row.value, row.evidenceDate])).toEqual([
      ['records', 'unavailable', 'Récords', '', undefined, null], ['weight', 'loading', 'Peso', '', undefined, null]]);
  });

  it('unavailable WITH current-day data keeps the note and marks it stale, for each row', () => {
    const rows = select(stale(homeProgressBody()), stale(homeProgressRecords()));
    expect(rows.map(row => [row.id, row.state, row.title])).toEqual([['records', 'stale', '1 récord en 30 días'], ['weight', 'stale', 'Peso']]);
    expect(rows[1].value).toBe('78,4 kg');
  });

  it('both reads failing without data: two unavailable rows and no third', () => {
    const rows = select(stale<ProgressBody>(), stale<ProgressTrainingRecords>());
    expect(rows.map(row => [row.id, row.state])).toEqual([['records', 'unavailable'], ['weight', 'unavailable']]);
  });

  it('one read can fail while the other renders', () => {
    expect(select(stale<ProgressBody>(), ready(homeProgressRecords())).map(row => row.state)).toEqual(['ready', 'unavailable']);
    expect(select(ready(homeProgressBody()), loading()).map(row => row.state)).toEqual(['loading', 'ready']);
  });
});

describe('selectProgressRows: the measure row', () => {
  const waist = (date: string | null, value = 90.5) => metric('body.waist', 'Cintura', date, value);
  const third = (body: ProgressBody, records = ready(homeProgressRecords())) => select(ready(body), records)[2];

  it('shows the label, the formatted value and when it was recorded, opening that measure in the body detail', () => {
    expect(third(bodyWith('2026-10-10', waist('2026-10-07')))).toEqual({
      id: 'measure', icon: 'ruler', title: 'Cintura', value: '90,5 cm', subtitle: 'Último registro: 7 oct',
      target: { kind: 'body', period: '7', metric: 'body.waist' }, state: 'ready', evidenceDate: '2026-10-07' });
  });

  it('says "hoy" when recorded today', () => {
    expect(third(bodyWith(null, waist(DATE))).subtitle).toBe('Último registro: hoy');
  });

  it('30-day window: day 30 is in, day 31 is out', () => {
    expect(MEASURE_WINDOW_DAYS).toBe(30);
    expect(third(bodyWith(null, waist(day(-30))))?.evidenceDate).toBe(day(-30));
    expect(third(bodyWith(null, waist(day(-31))))).toBeUndefined();
  });

  it('a future date is ignored', () => {
    expect(third(bodyWith(null, waist(day(1))))).toBeUndefined();
  });

  it('picks the most recently recorded measure; ties follow the order of body.metrics', () => {
    const body = bodyWith('2026-10-10', metric('body.waist', 'Cintura', '2026-10-05'), metric('body.chest', 'Pecho', '2026-10-08'), metric('body.hip', 'Cadera', '2026-10-08'));
    expect(third(body)).toMatchObject({ title: 'Pecho', target: { metric: 'body.chest' } });
    const reversed = bodyWith('2026-10-10', metric('body.hip', 'Cadera', '2026-10-08'), metric('body.chest', 'Pecho', '2026-10-08'));
    expect(third(reversed)).toMatchObject({ title: 'Cadera' });
  });

  it('weight is never the measure, not even when it is the only metric or the most recent', () => {
    expect(select(ready(bodyWith('2026-10-10')), ready(homeProgressRecords()))).toHaveLength(2);
    expect(third(bodyWith('2026-10-10', metric('body.waist', 'Cintura', '2026-10-01')))).toMatchObject({ title: 'Cintura' });
    const kgOnly = bodyWith(null, metric('body.other_kg', 'Otra', '2026-10-10', 5, 'kg'));
    expect(third(kgOnly)).toBeUndefined();
  });

  it('only cm measures with a latest observation, a positive finite value and a body.* key', () => {
    expect(third(bodyWith(null, waist(null)))).toBeUndefined();
    expect(third(bodyWith(null, waist('2026-10-09', 0)))).toBeUndefined();
    expect(third(bodyWith(null, waist('2026-10-09', Number.NaN)))).toBeUndefined();
    expect(third(bodyWith(null, metric('waist', 'Cintura', '2026-10-09')))).toBeUndefined();
    // An unusable newer one does not hide an eligible older one.
    expect(third(bodyWith(null, waist('2026-10-09', 0), metric('body.hip', 'Cadera', '2026-10-02')))).toMatchObject({ title: 'Cadera' });
  });

  it('suspect-only data leaves no measure: the server excludes them from metrics, so only the review hint remains', () => {
    const body = bodyWith('2026-10-10'); body.excludedSuspect = 1;
    const rows = select(ready(body), ready(homeProgressRecords()));
    expect(ids(rows)).toEqual(['records', 'weight']);
  });

  it('never states a trend or a change, whatever the API says about it', () => {
    const rising = { ...waist('2026-10-09'), trend: 'increased' as const, confidence: 'supported' as const, change: 3.2, referenceChange: 1 };
    const row = third(bodyWith(null, rising));
    expect(row.value).toBe('90,5 cm');
    expect(JSON.stringify(row)).not.toMatch(/3,2|3\.2|subió|bajó|aument|redujo/i);
  });

  it('is omitted unless the body read is ready with today\'s data: loading, unavailable, stale and another day', () => {
    const body = bodyWith('2026-10-10', waist('2026-10-09'));
    expect(select(loading(), ready(homeProgressRecords()))).toHaveLength(2);
    expect(select(stale<ProgressBody>(), ready(homeProgressRecords()))).toHaveLength(2);
    expect(select(stale(body), ready(homeProgressRecords()))).toHaveLength(2);
    expect(select(ready(body), ready(homeProgressRecords()), '2026-10-11')).toHaveLength(2);
    expect(select(ready(body), ready(homeProgressRecords()))).toHaveLength(3);
  });

  it('is independent from the records read', () => {
    const body = bodyWith('2026-10-10', waist('2026-10-09'));
    for (const records of [loading<ProgressTrainingRecords>(), stale<ProgressTrainingRecords>(), ready(recordsWithoutPr())]) {
      expect(ids(select(ready(body), records))).toEqual(['records', 'weight', 'measure']);
    }
  });

  it('is always the last row, even when the weight goes first', () => {
    const body = bodyWith('2026-10-10', waist('2026-10-10'));
    expect(ids(select(ready(body), ready(recordsWithPr('2026-10-01'))))).toEqual(['weight', 'records', 'measure']);
  });
});

describe('selectProgressRows: invariants', () => {
  it('never more than three rows and never a row twice, with every metric present', () => {
    const body = bodyWith('2026-10-10', ...['waist', 'abdomen', 'chest', 'hip', 'arm_right', 'thigh_left'].map((key, i) => metric(`body.${key}`, key, day(-i))));
    const rows = select(ready(body), ready(recordsWithPr()));
    expect(rows.length).toBeLessThanOrEqual(3);
    expect(new Set(ids(rows)).size).toBe(rows.length);
  });

  it('every state combination yields two or three distinct rows', () => {
    const states = [loading<ProgressBody>(), stale<ProgressBody>(), stale(homeProgressBody()), ready(homeProgressBody()), ready(bodyWith(null))];
    const recordStates = [loading<ProgressTrainingRecords>(), stale<ProgressTrainingRecords>(), stale(homeProgressRecords()), ready(homeProgressRecords()), ready(recordsWithoutPr())];
    for (const body of states) for (const records of recordStates) {
      const rows = select(body, records);
      expect(rows.length).toBeGreaterThanOrEqual(2);
      expect(rows.length).toBeLessThanOrEqual(3);
      expect(new Set(ids(rows)).size).toBe(rows.length);
    }
  });

  it('body rows use neutral copy: no verdict about the user', () => {
    const rising = { ...metric('body.waist', 'Cintura', '2026-10-09'), trend: 'decreased' as const, change: -2 };
    const text = JSON.stringify(select(ready(bodyWith('2026-10-10', rising)), ready(homeProgressRecords())).filter(row => row.id !== 'records'));
    expect(text).not.toMatch(/mejor|peor|empeor|bajaste|subiste|!/i);
  });
});

describe('selectProgressRows: runs on already-loaded resources only', () => {
  const source = readFileSync(join(__dirname, 'home-progress-selection.ts'), 'utf8');

  it('imports no client, hook, clock or randomness: it cannot request anything or change by itself', () => {
    expect(source).not.toMatch(/from '@\/api(\/client|\/resource)?'|useApiResource|useMobileApi|fetch[A-Z]|\bfetch\(/u);
    expect(source).not.toMatch(/Date\.now|new Date\(\)|Math\.random|setTimeout|setInterval/u);
    expect(source).not.toMatch(/from 'react'|expo-router/u);
  });
});
