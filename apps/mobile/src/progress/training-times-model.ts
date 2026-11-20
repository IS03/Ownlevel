import type { TrainingTimeGroup, TrainingTimeMetric } from '@/api/training-times';

const number = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 });
export const timeNumber = (n: number) => number.format(n);
export const timeAt = (minute: number) => `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
export const timeRange = (group: Pick<TrainingTimeGroup, 'fromMinute' | 'toMinute'>) => `${timeAt(group.fromMinute)}–${timeAt(group.toMinute)}`;
export const comparableTimes = (group: TrainingTimeGroup) => group.performance.improved + group.performance.stable + group.performance.declined;
export const timeMetricValue = (group: TrainingTimeGroup, metric: TrainingTimeMetric): number | null => {
  if (metric === 'sessions') return group.sessions;
  if (metric === 'duration') return group.duration.median;
  if (metric === 'energy') return group.energy.median;
  if (metric === 'load') return group.load.median;
  const eligible = comparableTimes(group);
  return eligible ? group.performance.improved / eligible * 100 : null;
};
export const timeMetricCount = (group: TrainingTimeGroup, metric: TrainingTimeMetric) => metric === 'sessions' ? group.sessions : metric === 'improvements' ? comparableTimes(group) : group[metric === 'duration' ? 'duration' : metric === 'energy' ? 'energy' : 'load'].n;
export const TIME_METRICS: readonly { value: TrainingTimeMetric; label: string; description: string }[] = [
  { value: 'sessions', label: 'Sesiones', description: 'Cuántas empezaste a cada hora' },
  { value: 'duration', label: 'Duración', description: 'Tiempo habitual, con descansos' },
  { value: 'energy', label: 'Energía al llegar', description: 'Solo respuestas previas registradas a tiempo' },
  { value: 'improvements', label: 'Mejoras de ejercicios', description: 'Frente a la sesión anterior compatible' },
  { value: 'load', label: 'Cargas por ejercicio', description: 'Un ejercicio y una forma de hacerlo' },
];
export const timeMetricLabel = (metric: TrainingTimeMetric) => TIME_METRICS.find(m => m.value === metric)!.label;
export function timeMetricText(group: TrainingTimeGroup, metric: TrainingTimeMetric, unit = 'kg'): string {
  const value = timeMetricValue(group, metric);
  if (value === null) return 'Sin datos suficientes';
  if (metric === 'sessions') return `${timeNumber(value)} ${value === 1 ? 'sesión' : 'sesiones'}`;
  if (metric === 'duration') return `${timeNumber(value)} min`;
  if (metric === 'energy') return `${timeNumber(value)} de 5`;
  if (metric === 'load') return `${timeNumber(value)} ${unit}`;
  return `${group.performance.improved} de ${comparableTimes(group)} mejoraron`;
}
