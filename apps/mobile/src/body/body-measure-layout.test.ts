import { describe, expect, it } from '@jest/globals';
import { BODY_MEASUREMENT_FIELDS, BODY_MEASUREMENT_LABELS, type BodyMeasurement, type BodyMeasurementField } from '@/api/body';
import { MEASURE_GUIDES } from './body-measure-guides';
import { MEASURES, REGIONS, buildMeasurementLayout, habitualPlan, referenceText, regionPlan } from './body-measure-layout';
import { measurement } from './body-fixture.test-helper';

// Fictitious data only. Dates are DD/MM/AAAA like the draft; rows are newest-first like the controller's read.
let counter = 0;
const row = (measuredOn: string, values: Partial<Record<BodyMeasurementField, number>> = {}, patch: Partial<BodyMeasurement> = {}) => {
  const blank = Object.fromEntries(BODY_MEASUREMENT_FIELDS.map(f => [f, null])) as Record<BodyMeasurementField, null>;
  return measurement({ ...blank, ...values, id: `51000000-0000-4000-8000-${String(++counter).padStart(12, '0')}`, measuredOn, ...patch });
};
const build = (history: BodyMeasurement[], over: Partial<Parameters<typeof buildMeasurementLayout>[0]> = {}) =>
  buildMeasurementLayout({ history, hasMore: false, selectedDate: '04/10/2026', mode: 'create', today: '2026-10-04', ...over });

describe('MEASURES / REGIONS', () => {
  it('lists the seven measures once, in canonical order, covering each of the ten fields exactly once', () => {
    expect(MEASURES.map(m => m.key)).toEqual(['waist', 'abdomen', 'chest', 'hip', 'arm', 'thigh', 'calf']);
    expect(MEASURES.map(m => m.label)).toEqual(['Cintura', 'Abdomen', 'Pecho', 'Cadera', 'Brazo', 'Muslo', 'Pantorrilla']);
    expect(MEASURES.flatMap(m => m.fields)).toEqual([...BODY_MEASUREMENT_FIELDS]);
    expect(new Set(MEASURES.flatMap(m => m.fields)).size).toBe(10);
    expect(REGIONS).toEqual([{ key: 'trunk', label: 'Tronco' }, { key: 'arms', label: 'Brazos' }, { key: 'legs', label: 'Piernas' }]);
    expect(MEASURES.every(m => REGIONS.some(r => r.key === m.region))).toBe(true);
    expect(BODY_MEASUREMENT_LABELS.armRightCm).toBe('Brazo derecho');
    expect(Object.keys(MEASURE_GUIDES).sort()).toEqual(MEASURES.map(m => m.key).sort());
  });
});

describe('habits', () => {
  const full = { waistCm: 80, abdomenCm: 90 };
  it('first use (nothing loaded) has no habits and no references', () => {
    expect(build([])).toEqual({ habitual: [], references: {}, reason: 'first_use' });
  });
  it('fewer than three eligible quick-load rows is insufficient', () => {
    const layout = build([row('2026-10-02', full), row('2026-10-01', full)]);
    expect(layout.habitual).toEqual([]); expect(layout.reason).toBe('insufficient');
    expect(layout.references.waistCm).toEqual({ value: 80, date: '2026-10-02' });
  });
  it('3 of 3 qualifies, in canonical order', () => {
    const layout = build([row('2026-10-03', { waistCm: 80, armLeftCm: 30 }), row('2026-10-02', { waistCm: 80, armLeftCm: 30 }), row('2026-10-01', { waistCm: 80, armLeftCm: 30, chestCm: 100 })]);
    expect(layout.habitual).toEqual(['waistCm', 'armLeftCm']); expect(layout.reason).toBeNull();
  });
  it('3 of 4 qualifies; 2 of 4 does not', () => {
    const layout = build([
      row('2026-10-03', { waistCm: 80, abdomenCm: 90, hipCm: 99 }), row('2026-10-02', { waistCm: 80, abdomenCm: 90 }),
      row('2026-10-01', { waistCm: 80, abdomenCm: 90, hipCm: 99 }), row('2026-09-30', { waistCm: 80, chestCm: 101 }),
    ]);
    expect(layout.habitual).toEqual(['waistCm', 'abdomenCm']); // abdomen 3/4, hip 2/4, chest 1/4
  });
  it('4 of 4 qualifies and only the latest four rows count', () => {
    const history = [row('2026-10-03', { waistCm: 80 }), row('2026-10-02', { waistCm: 80 }), row('2026-10-01', { waistCm: 80 }), row('2026-09-30', { waistCm: 80 }),
      row('2026-09-29', { chestCm: 100 })];
    expect(build(history).habitual).toEqual(['waistCm']);
  });
  it('no recurring field is none_recurring', () => {
    const layout = build([row('2026-10-03', { waistCm: 80 }), row('2026-10-02', { chestCm: 100 }), row('2026-10-01', { hipCm: 99 })]);
    expect(layout.habitual).toEqual([]); expect(layout.reason).toBe('none_recurring');
  });
  it('suspect and imported rows never form habits; suspect never references, imported verified rows do', () => {
    const history = [
      row('2026-10-03', { waistCm: 80, chestCm: 100 }, { qualityStatus: 'suspect' }),
      row('2026-10-02', { waistCm: 80 }, { imported: true, importSource: 'x' }),
      row('2026-10-01', { waistCm: 80 }), row('2026-09-30', { waistCm: 80 }),
    ];
    const layout = build(history);
    expect(layout.habitual).toEqual([]); expect(layout.reason).toBe('insufficient'); // only two own verified, non-imported rows
    expect(layout.references.waistCm).toEqual({ value: 80, date: '2026-10-02' }); // imported verified row is a valid reference
    expect(layout.references.chestCm).toBeUndefined(); // the only chest value was in a suspect row
  });
  it('a habit window skips imported rows and keeps looking back for the latest four own rows', () => {
    const history = [row('2026-10-03', { waistCm: 80 }), row('2026-10-02', { chestCm: 100 }, { imported: true }), row('2026-10-01', { waistCm: 80 }), row('2026-09-30', { waistCm: 80 })];
    expect(build(history).habitual).toEqual(['waistCm']);
  });
  it('never offers habits in edit mode', () => {
    const history = [row('2026-10-03', { waistCm: 80 }), row('2026-10-02', { waistCm: 80 }), row('2026-10-01', { waistCm: 80 })];
    expect(build(history, { mode: 'edit' })).toMatchObject({ habitual: [], reason: null });
  });
});

describe('date rule', () => {
  const history = [row('2026-10-04', { waistCm: 79 }), row('2026-10-03', { waistCm: 80 }), row('2026-10-01', { waistCm: 82 }), row('2026-09-20', { waistCm: 83 })];
  it('only strictly earlier rows count: same-day and later rows are ignored', () => {
    expect(build(history).references.waistCm).toEqual({ value: 80, date: '2026-10-03' });
    expect(build(history, { selectedDate: '03/10/2026' }).references.waistCm).toEqual({ value: 82, date: '2026-10-01' });
  });
  it('a past date uses only older rows; before all history there is nothing', () => {
    expect(build(history, { selectedDate: '02/10/2026' }).references.waistCm).toEqual({ value: 82, date: '2026-10-01' });
    expect(build(history, { selectedDate: '20/09/2026' }).references).toEqual({});
    expect(build(history, { selectedDate: '20/09/2026' }).reason).toBe('insufficient');
  });
  it('an invalid, empty or future date yields nothing and never throws', () => {
    for (const selectedDate of ['', '31/02/2026', 'abc', '5/10/2026']) expect(build(history, { selectedDate })).toEqual({ habitual: [], references: {}, reason: 'invalid_date' });
    expect(build(history, { selectedDate: '05/10/2026' })).toEqual({ habitual: [], references: {}, reason: 'invalid_date' }); // after today (2026-10-04)
    expect(build(history, { selectedDate: '', mode: 'edit' })).toEqual({ habitual: [], references: {}, reason: null });
  });
  it('accepts an ISO date too', () => {
    expect(build(history, { selectedDate: '2026-10-02' }).references.waistCm?.date).toBe('2026-10-01');
  });
});

describe('completeness of the loaded history', () => {
  const page = [row('2026-10-03', { waistCm: 80 }), row('2026-10-02', { waistCm: 80 }), row('2026-10-01', { waistCm: 80 }), row('2026-09-30', { waistCm: 80 })];
  it('with more pages and a date that reaches the oldest loaded row, what came before is unknown', () => {
    expect(build(page, { hasMore: true, selectedDate: '30/09/2026' })).toEqual({ habitual: [], references: {}, reason: 'incomplete' });
    expect(build(page, { hasMore: true, selectedDate: '15/09/2026' })).toEqual({ habitual: [], references: {}, reason: 'incomplete' });
    expect(build([], { hasMore: true })).toMatchObject({ reason: 'incomplete' });
  });
  it('with more pages but enough loaded rows before the date, habits and references still work', () => {
    const layout = build(page, { hasMore: true });
    expect(layout.habitual).toEqual(['waistCm']); expect(layout.references.waistCm).toEqual({ value: 80, date: '2026-10-03' });
  });
  it('with more pages and fewer than four own rows before the date, habits are incomplete (references remain valid)', () => {
    const layout = build(page, { hasMore: true, selectedDate: '02/10/2026' });
    expect(layout.habitual).toEqual([]); expect(layout.reason).toBe('incomplete');
    expect(layout.references.waistCm).toEqual({ value: 80, date: '2026-10-01' });
  });
  it('without more pages everything is known', () => {
    expect(build(page, { selectedDate: '15/09/2026' })).toMatchObject({ references: {}, reason: 'insufficient' });
  });
});

describe('references', () => {
  it('picks, per field, the latest NON-NULL value, skipping rows where only that field is empty', () => {
    const layout = build([row('2026-10-03', { waistCm: 80 }), row('2026-10-02', { chestCm: 100 }), row('2026-10-01', { waistCm: 82, chestCm: 101 })]);
    expect(layout.references.waistCm).toEqual({ value: 80, date: '2026-10-03' });
    expect(layout.references.chestCm).toEqual({ value: 100, date: '2026-10-02' });
    expect(layout.references.hipCm).toBeUndefined(); // omitted, never zero
  });
  it('legacy armCm/thighCm never become a reference for the sided fields', () => {
    const layout = build([row('2026-10-03', { waistCm: 80 }, { armCm: 33, thighCm: 55 }), row('2026-10-02', { armRightCm: 31 })]);
    expect(layout.references.armLeftCm).toBeUndefined(); expect(layout.references.thighRightCm).toBeUndefined();
    expect(layout.references.armRightCm).toEqual({ value: 31, date: '2026-10-02' });
  });
  it('edit mode excludes the edited record from its own history', () => {
    const edited = row('2026-10-03', { waistCm: 70 }), older = row('2026-10-01', { waistCm: 82 });
    expect(build([edited, older], { mode: 'edit', editedId: edited.id, selectedDate: '03/10/2026' }).references.waistCm).toEqual({ value: 82, date: '2026-10-01' });
    expect(build([edited, older], { mode: 'edit', editedId: edited.id, selectedDate: '04/10/2026' }).references.waistCm).toEqual({ value: 82, date: '2026-10-01' });
  });
  it('an edited record appended out of order (server truth) never decides completeness', () => {
    const prefix = [row('2026-10-03', { waistCm: 80 }), row('2026-10-02', { waistCm: 81 })], old = row('2020-01-01', { waistCm: 90 });
    const layout = build([...prefix, old], { hasMore: true, mode: 'edit', editedId: old.id, selectedDate: '01/01/2020' });
    expect(layout).toEqual({ habitual: [], references: {}, reason: null });
  });
  it('formats the reference with comma decimals and the body date', () => {
    expect(referenceText({ value: 82, date: '2026-10-03' })).toBe('Anterior: 82 cm · 3 oct 2026');
    expect(referenceText({ value: 82.5, date: '2026-10-03' })).toBe('Anterior: 82,5 cm · 3 oct 2026');
  });
});

describe('regionPlan', () => {
  const fieldsOf = (plan: ReturnType<typeof regionPlan>) => plan.flatMap(r => r.measures.flatMap(m => m.fields));
  it('with no habits shows the three regions with every field once', () => {
    const plan = regionPlan([]);
    expect(plan.map(r => r.region.key)).toEqual(['trunk', 'arms', 'legs']);
    expect(plan.map(r => r.measures.map(m => m.measure.key))).toEqual([['waist', 'abdomen', 'chest', 'hip'], ['arm'], ['thigh', 'calf']]);
    expect(fieldsOf(plan)).toEqual([...BODY_MEASUREMENT_FIELDS]);
  });
  it('never repeats a habitual field and omits empty regions/measures', () => {
    const habitual: BodyMeasurementField[] = ['waistCm', 'abdomenCm', 'chestCm', 'hipCm', 'armRightCm', 'armLeftCm'];
    const plan = regionPlan(habitual);
    expect(plan.map(r => r.region.key)).toEqual(['legs']);
    expect([...fieldsOf(plan), ...habitualPlan(habitual).flatMap(m => m.fields)].sort()).toEqual([...BODY_MEASUREMENT_FIELDS].sort());
  });
  it('splits a bilateral pair without mirroring: each side stays its own field', () => {
    const plan = regionPlan(['armRightCm']);
    expect(plan.find(r => r.region.key === 'arms')?.measures).toEqual([{ measure: MEASURES[4], fields: ['armLeftCm'] }]);
    expect(habitualPlan(['armRightCm'])).toEqual([{ measure: MEASURES[4], fields: ['armRightCm'] }]);
    const all = [...fieldsOf(plan), 'armRightCm'];
    expect(all.filter(f => f === 'armRightCm')).toHaveLength(1);
  });
});

describe('purity', () => {
  it('does not mutate its inputs', () => {
    const history = [row('2026-10-01', { waistCm: 80 }), row('2026-10-03', { waistCm: 81 }), row('2026-10-02', { waistCm: 82 }), row('2026-09-30', { waistCm: 83 })];
    const snapshot = JSON.stringify(history);
    build(history); build(history, { mode: 'edit', editedId: history[0].id });
    expect(JSON.stringify(history)).toBe(snapshot);
    const habitual: BodyMeasurementField[] = ['waistCm']; const copy = [...habitual];
    regionPlan(habitual); habitualPlan(habitual);
    expect(habitual).toEqual(copy);
  });
  it('tolerates unsorted input by ordering internally', () => {
    const layout = build([row('2026-10-01', { waistCm: 82 }), row('2026-10-03', { waistCm: 80 })]);
    expect(layout.references.waistCm?.date).toBe('2026-10-03');
  });
});
