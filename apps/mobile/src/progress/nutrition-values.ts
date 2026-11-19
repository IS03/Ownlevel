import { formatDelta, formatValue } from './progress-format';

const oneDecimal = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 });
/** Shared chart/detail precision: a positive value below display precision never becomes a recorded zero. */
export function nutritionValue(value: number | null, unit: 'kcal' | 'g', spoken = false): string {
  if (value === null) return '—';
  const below = (limit: string) => spoken ? `menos de ${limit}` : `< ${limit}`;
  if (unit === 'kcal') return value > 0 && value < 0.5 ? below('1 kcal') : formatValue(value, unit, 'integer');
  if (value > 0 && value < 0.05) return below('0,1 g');
  return value < 10 ? `${oneDecimal.format(value)} g` : formatValue(value, unit, 'integer');
}

export function nutritionDifference(value: number | null): string {
  if (value === null) return '—';
  if (value !== 0 && Math.abs(value) < 0.5) return `${value > 0 ? '+' : '−'}< 1 kcal`;
  return formatDelta(value, 'kcal', 'integer');
}
