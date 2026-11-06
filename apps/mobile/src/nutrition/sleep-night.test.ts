import { describe, expect, it } from '@jest/globals';
import { buildDayWriteIntent, dayWriteDraft } from './day-write-model';
import { nutritionFixture } from './day-fixture.test-helper';

const SLEEP = '41100000-0000-4000-8000-0000000000aa';
function withSleep(value: number | null) {
  const data = nutritionFixture(); data.today = data.date;
  if (data.activity.status !== 'ok') throw new Error();
  data.activity.data.metrics.push({ id: SLEEP, systemKey: 'sleep', definitionUpdatedAt: '2026-09-01T12:00:00.123456Z', label: 'Sueño', unit: 'min', valueType: 'duration',
    target: 480, value, isActive: true, updatedAt: value === null ? null : `${data.date}T07:00:00Z` });
  return data;
}

describe('#367 sleep night from Mobile', () => {
  it('a sleep value written from the sheets declares its night; other metrics never do', () => {
    const data = withSleep(null);
    const draft = dayWriteDraft('metrics', data);
    draft.metrics[SLEEP] = { value: '', hours: '7', minutes: '30' }; draft.metrics['41100000-0000-4000-8000-000000000003'].value = '1,5';
    const { intent } = buildDayWriteIntent(draft, 'k');
    if (intent?.operation !== 'metrics') throw new Error('no intent');
    expect(intent.changes.find(change => change.metricId === SLEEP)).toMatchObject({ value: 450, sleepNight: 'sleep_night_ending_on_date/1' });
    expect(intent.changes.find(change => change.metricId !== SLEEP)).not.toHaveProperty('sleepNight');
  });
  it('clearing sleep declares nothing: there is no night to declare', () => {
    const data = withSleep(420);
    const draft = dayWriteDraft('metrics', data);
    draft.metrics[SLEEP] = { value: '', hours: '', minutes: '' };
    const { intent } = buildDayWriteIntent(draft, 'k');
    if (intent?.operation !== 'metrics') throw new Error('no intent');
    expect(intent.changes).toEqual([expect.objectContaining({ metricId: SLEEP, value: null })]);
    expect(intent.changes[0]).not.toHaveProperty('sleepNight');
  });
});
