import { describe, expect, it } from '@jest/globals';
import type { InfluenceReading } from '@/api/progress-influence';
import { answerText, choiceFor, measureInfo, questionText, valueText } from './influence-model';

/** Qué influye con fuerza y peso: the words of the two new outcomes. */
const protein = { key: 'nutrition.protein', label: 'Proteína', unit: 'g', valueType: 'decimal' as const };
describe('fuerza y peso en Qué influye', () => {
  it('names both outcomes and always shows the sign of the change', () => {
    const strength = measureInfo(choiceFor('strength.own')!), weight = measureInfo(choiceFor('body.weight_change')!);
    expect(strength).toEqual({ key: 'strength.own', label: 'Fuerza frente a lo tuyo', unit: '%', valueType: 'decimal' });
    expect(valueText(1.25, strength)).toMatch(/^\+1,3\s?%$/);
    expect(valueText(-0.3, weight)).toMatch(/^−0,3\s?kg$/);
    expect(valueText(0, weight)).toMatch(/^0\s?kg$/);
  });
  it('asks and answers in the person\'s words', () => {
    const outcome = measureInfo(choiceFor('strength.own')!);
    const definition = { split: 'nutrition.protein', cut: 'median', lag: 1 as const, outcome: 'strength.own' };
    expect(questionText(definition, protein, outcome)).toBe('¿Los días después de comer más proteína rendís más frente a lo tuyo?');
    const read: InfluenceReading = { definition, measure: { split: protein, outcome }, reference: null,
      current: { status: 'ok', pairs: 20, cut: 150, low: { days: [], average: 0.2 }, high: { days: [], average: 1.4 }, difference: 1.2, differencePercent: 600, evidence: 'moderate' } };
    expect(answerText(read)).toMatch(/^Con proteína de 150\s?g o más al día siguiente rendiste frente a lo tuyo en promedio \+1,4\s?%\. Los demás días, \+0,2\s?%\.$/);
  });
});
