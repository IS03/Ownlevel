import { describe, expect, it } from '@jest/globals';
import { formatKg, measurementBadges, measurementDraft, validateMeasurementDraft, validateWeightDraft, weightAt, weightDraft } from './body-model';
import { TODAY, measurement } from './body-fixture.test-helper';

describe('Body model: missing != zero and domain validation', () => {
  it('formats missing as missing and keeps an explicit 0 kg', () => {
    expect(formatKg(null)).toBe('—'); expect(formatKg(0)).toBe('0 kg'); expect(formatKg(80.5)).toBe('80,5 kg');
    expect(weightDraft(TODAY, null).weight).toBe(''); expect(weightDraft(TODAY, 80.25)).toEqual({ date: '04/10/2026', weight: '80,25' });
  });
  it('validates weight like the domain (comma, 0..999.99, two decimals) and blocks future dates', () => {
    expect(validateWeightDraft({ date: '04/10/2026', weight: '80,5' }, TODAY)).toEqual({ date: TODAY, weightKg: 80.5 });
    expect(validateWeightDraft({ date: '04/10/2026', weight: '0' }, TODAY)).toEqual({ date: TODAY, weightKg: 0 });
    expect(validateWeightDraft({ date: '04/10/2026', weight: '' }, TODAY)).toEqual({ errors: { weight: 'El peso es obligatorio.' } });
    for (const bad of ['1000', '80,123', 'abc', '-1']) expect(validateWeightDraft({ date: '04/10/2026', weight: bad }, TODAY)).toHaveProperty('errors.weight');
    expect(validateWeightDraft({ date: '05/10/2026', weight: '80' }, TODAY)).toEqual({ errors: { date: 'No se puede registrar en una fecha futura.' } });
    expect(validateWeightDraft({ date: '31/02/2026', weight: '80' }, TODAY)).toHaveProperty('errors.date');
  });
  it('measurements: empty fields stay null, at least one value unless legacy values remain, (0,500] cm', () => {
    const draft = measurementDraft(null, TODAY);
    expect(validateMeasurementDraft(draft, TODAY)).toEqual({ errors: { form: 'Registrá al menos una medida corporal.' } });
    expect(validateMeasurementDraft(draft, TODAY, true)).toHaveProperty('fields.waistCm', null);
    const parsed = validateMeasurementDraft({ ...draft, waistCm: '80,5', notes: '  ' }, TODAY);
    expect(parsed).toMatchObject({ fields: { measuredOn: TODAY, waistCm: 80.5, chestCm: null, notes: null } });
    expect(validateMeasurementDraft({ ...draft, waistCm: '0' }, TODAY)).toHaveProperty('errors.waistCm');
    expect(validateMeasurementDraft({ ...draft, waistCm: '501' }, TODAY)).toHaveProperty('errors.waistCm');
    expect(validateMeasurementDraft({ ...draft, date: '05/10/2026', waistCm: '80' }, TODAY)).toHaveProperty('errors.date');
  });
  it('knows a date inside the loaded range and refuses to guess older dates', () => {
    const entries = [{ date: TODAY, weightKg: 80 }, { date: '2026-09-20', weightKg: 81 }];
    expect(weightAt(entries, true, '2026-09-25')).toEqual({ known: true, weightKg: null });
    expect(weightAt(entries, true, '2026-09-20')).toEqual({ known: true, weightKg: 81 });
    expect(weightAt(entries, true, '2026-09-01')).toEqual({ known: false });
    expect(weightAt(entries, false, '2026-09-01')).toEqual({ known: true, weightKg: null });
  });
  it('describes import/quality state without technical metadata', () => {
    expect(measurementBadges(measurement())).toEqual([]);
    expect(measurementBadges(measurement({ imported: true, importSource: 'sheet', qualityStatus: 'suspect', qualityNote: 'Revisar' })).map(b => b.text))
      .toEqual(['Sospechosa · excluida del análisis: Revisar', 'Importada']);
  });
});
