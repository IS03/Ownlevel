import { describe, expect, it } from '@jest/globals';
import { REASON_LABELS } from './training-trends-screen';

// Every reason the server's performance comparison can give (src/lib/progress/training-performance.ts) has its own
// copy. P1-C2 added the implement and variant reasons: the screen never falls back to a generic "Datos insuficientes".
const SERVER_REASONS = [
  'comparable', 'new_exercise', 'not_trained_in_primary', 'different_weight_mode', 'missing_weight_mode', 'unsupported_weight_mode',
  'incomplete_sets', 'ambiguous_evidence', 'missing_implement', 'different_implement', 'unknown_configuration',
  'different_configuration', 'mixed_configuration',
];

describe('comparison reason copy', () => {
  it.each(SERVER_REASONS.filter(reason => reason !== 'comparable'))('%s has its own neutral copy', reason => {
    expect(REASON_LABELS[reason]).toMatch(/^[A-ZÁÉÍÓÚ].+\.$/);
    expect(REASON_LABELS[reason]).not.toContain('!');
  });
  it('tells implement and variant apart', () => {
    expect(REASON_LABELS.different_implement).toBe('Cambió el implemento.');
    expect(REASON_LABELS.different_configuration).toBe('Cambió la variante.');
    expect(REASON_LABELS.unknown_configuration).toBe('Falta la variante en alguna sesión.');
    expect(REASON_LABELS.mixed_configuration).toBe('Hiciste más de una variante en el período.');
    expect(REASON_LABELS.missing_implement).toBe('Falta el implemento en alguna sesión.');
  });
});
