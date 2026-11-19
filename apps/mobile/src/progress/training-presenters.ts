import type { ProgressTrainingExercise, TrainingSignal } from '@/api/progress';
export const STATUS_LABELS: Record<ProgressTrainingExercise['status'], string> = {
  improved: 'Mejoró',
  stable: 'Estable',
  declined: 'Bajó',
  insufficient_data: 'Sin comparación',
};
export const REASON_LABELS: Record<string, string> = {
  insufficient_sessions: 'No hay dos sesiones con datos suficientes para comparar.',
  new_exercise: 'No se hizo en el período de comparación.',
  not_trained_in_primary: 'No se hizo en este período.',
  different_weight_mode: 'Cambió el modo de carga.',
  missing_weight_mode: 'Falta el modo de carga.',
  unsupported_weight_mode: 'Este modo de carga no tiene una comparación confiable.',
  incomplete_sets: 'Faltan series comparables.',
  missing_implement: 'Falta el implemento en alguna sesión.',
  different_implement: 'Cambió el implemento.',
  unknown_configuration: 'Falta la variante en alguna sesión.',
  different_configuration: 'Cambió la variante.',
  mixed_configuration: 'Hiciste más de una variante en el período.',
  ambiguous_evidence: 'Sin cambio claro.',
};
const fmt = (n: number, digits = 1) => new Intl.NumberFormat('es-AR', { maximumFractionDigits: digits }).format(n);
export function signalLine(signal: TrainingSignal | null): string | null {
  if (!signal || signal.kind === 'stable') return null;
  const { referenceValue: before, currentValue: now, description } = signal;
  if (before === null || now === null) return description;
  const pair = `${fmt(before, 2)} → ${fmt(now, 2)}`;
  if (signal.kind.includes('reps_same_load') || signal.kind.endsWith('reps_bodyweight')) {
    const at = description.indexOf(' con ');
    return at >= 0 ? `${pair} reps${description.slice(at)}` : description;
  }
  if (signal.kind.includes('load_same_reps')) {
    const [delta, reps] = description.split(' manteniendo ');
    const unit = delta?.split(' ').slice(1).join(' ');
    return unit && reps ? `${pair} ${unit}, a ${reps}` : description;
  }
  if (signal.kind.endsWith('_time')) return `${pair} s en el mejor registro`;
  return description;
}
