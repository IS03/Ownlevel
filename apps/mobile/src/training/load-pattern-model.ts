import type { LoadPattern, LoadPatternSchemeSet } from '@/api/active-session';
import { compactActual } from './active-session-model';

/**
 * #537 · How a load pattern reads. It states what was recorded and nothing more: never «estancado», never how much to add.
 * Numbers in the on-screen format (62,5 kg).
 */
export function schemeLabel(scheme: readonly LoadPatternSchemeSet[]): string {
  const first = scheme[0];
  if (!first) return '';
  if (scheme.every(set => set.reps === first.reps && set.weightKg === first.weightKg)) return `${scheme.length} × ${first.reps} · ${compactActual(first.weightKg)} kg`;
  if (scheme.every(set => set.weightKg === first.weightKg)) return `${scheme.map(set => set.reps).join(' · ')} reps · ${compactActual(first.weightKg)} kg`;
  return scheme.map(set => `${compactActual(set.weightKg)} kg × ${set.reps}`).join(' · ');
}
export function patternTitle(pattern: LoadPattern): string {
  return pattern.signal === 'surplus' ? `Te sobraron reps las últimas ${pattern.count} veces` : `Repetiste este esquema ${pattern.count} veces`;
}
/** The surplus line shows the last set of the latest execution against its target: what the signal rests on. */
export function patternDetail(pattern: LoadPattern): string {
  if (pattern.signal === 'repeated') return schemeLabel(pattern.scheme);
  const last = [...(pattern.sessions[0]?.sets ?? [])].sort((a, b) => a.setNumber - b.setNumber).at(-1);
  if (!last || last.actualReps === null || last.targetReps === null || last.actualWeightKg === null) return schemeLabel(pattern.scheme);
  return `Última serie: ${last.actualReps} reps de ${last.targetReps} · ${compactActual(last.actualWeightKg)} kg`;
}
export function patternEvidenceLine(pattern: LoadPattern): string {
  return pattern.signal === 'surplus'
    ? `En estas ${pattern.count} sesiones la última serie pasó su objetivo por 2 reps o más, con el mismo peso.`
    : `Lo registraste en estas ${pattern.count} sesiones.`;
}
export const PATTERN_GUIDANCE = 'Si terminaste con margen y buena técnica, podés considerar más repeticiones o más peso.';
