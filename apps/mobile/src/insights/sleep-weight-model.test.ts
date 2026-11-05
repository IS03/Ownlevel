import { describe, expect, it } from '@jest/globals';
import { contextRows, exclusionRows, exposureMeaning, exposureUnit, relationName } from './insights-model';
import type { DayFact } from '@/api/performance-insights';

const SLEEP = '93670000-0000-4000-8000-0000000000aa';
const metrics = [{ id: SLEEP, name: 'Sueño', unit: 'min', valueType: 'duration', archived: false }];
const def = (family: string, window: string) => ({ definition: { id: `${family}:${SLEEP}:${window}`, family, window, subject: family === 'body' ? 'weight_kg' : SLEEP, temporalBasis: 'same_day_unordered' } }) as never;

describe('#367 sueño y peso en Insights', () => {
  it('names which night and which weight, and says what each one is before any result', () => {
    expect(relationName(def('sleep', 'night_before'), metrics)).toBe('Sueño de la noche anterior');
    expect(relationName(def('sleep', 'same_day'), metrics)).toBe('Sueño sin noche declarada, misma fecha');
    expect(relationName(def('body', 'same_day'), metrics)).toBe('Peso corporal de ese día');
    expect(exposureUnit(def('body', 'same_day'), metrics)).toBe('kg'); expect(exposureUnit(def('sleep', 'night_before'), metrics)).toBe('min');
    expect(exposureMeaning(def('sleep', 'night_before'))).toContain('la noche que terminó esa mañana');
    expect(exposureMeaning(def('sleep', 'previous_day'))).toContain('no se suman a la noche declarada');
    expect(exposureMeaning(def('body', 'same_day'))).toContain('No sabemos si lo mediste antes o después de entrenar');
    for (const text of [exposureMeaning(def('sleep', 'night_before'))!, exposureMeaning(def('body', 'same_day'))!]) expect(text).not.toMatch(/porque|causa|mejor|deberías/i);
  });
  it('lists what was left out and why, never missing sleep as zero hours', () => {
    expect(exclusionRows({ sleep_not_recorded: 3, sleep_night_undeclared: 5, sleep_declaration_outdated: 1, weight_not_recorded: 4, weight_invalid: 1 }).map(row => row.label))
      .toEqual(['Sueño sin noche declarada', 'Sin peso ese día', 'Sin sueño registrado', 'Sueño editado sin volver a declarar la noche', 'Peso no válido']);
  });
  it('shows the day weight and which night a sleep value is', () => {
    const day = { date: '2026-04-09', sessions: [], context: { metrics: [{ metricId: SLEEP, value: 420, sleepNight: 'declared' }], nutrition: null, bodyWeight: { value: 80.4, state: 'recorded' } } } as unknown as DayFact;
    const rows = contextRows(day, metrics as never);
    expect(rows.find(row => row.key === SLEEP)!.label).toBe('Sueño, noche que terminó esa mañana');
    expect(rows.find(row => row.key === 'body-weight')).toMatchObject({ label: 'Peso corporal, ese día' });
    const missing = { ...day, context: { ...day.context, metrics: [{ metricId: SLEEP, value: 420, sleepNight: 'undeclared' }], bodyWeight: { value: null, state: 'not_recorded' } } } as unknown as DayFact;
    expect(contextRows(missing, metrics as never).find(row => row.key === 'body-weight')!.value).toBe('Sin registrar');
    expect(contextRows(missing, metrics as never).find(row => row.key === SLEEP)!.label).toBe('Sueño, sin noche declarada');
  });
});
