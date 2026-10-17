import type { ConnectionKey, ConnectionMissing, ConnectionStory } from '@/api/progress-connections';
import { arrowDelta, formatValue } from './progress-format';
import { compareRange, progressRange, rangeShortLabel, shortRange, type ProgressRangeState } from './progress-range';

export const CONNECTION_NAMES: Record<ConnectionKey, string> = {
  protein_strength: 'Proteína y fuerza', carbs_strength: 'Carbos y fuerza',
  carbs_energy: 'Carbos y energía', kcal_weight: 'Calorías y peso',
};
export const CONNECTION_LABELS: Record<ConnectionKey, string> = {
  protein_strength: 'PROTEÍNA · FUERZA', carbs_strength: 'CARBOS · FUERZA',
  carbs_energy: 'CARBOS · ENERGÍA', kcal_weight: 'CALORÍAS · PESO',
};
const difference = (now: number | null, before: number | null) => now === null || before === null ? null : now - before;
export const connectionDelta = (now: number | null, before: number | null, unit: string | null) => {
  const delta = difference(now, before);
  return delta === null ? 'Sin comparación' : Math.abs(delta) < 1e-9 ? '=' : arrowDelta(delta, unit);
};
const spokenDelta = (now: number | null, before: number | null, unit: string | null) => {
  const delta = difference(now, before);
  return delta === null ? 'sin comparación' : Math.abs(delta) < 1e-9 ? 'sin cambio'
    : `${formatValue(Math.abs(delta), unit)} ${delta > 0 ? 'más' : 'menos'}`;
};
const spokenUnit = (unit: string) => unit === 'g' ? 'gramos' : unit === 'kg' ? 'kilogramos' : unit === 'kcal' ? 'kilocalorías' : unit;
const foodName = (key: ConnectionKey) => key === 'protein_strength' ? 'proteína' : key === 'kcal_weight' ? 'calorías' : 'carbos';
function foodTitle(story: ConnectionStory) {
  const { current, previous } = story.food;
  if (current === null || previous === null) return null;
  const delta = current - previous, name = foodName(story.key);
  const same = delta === 0 || previous !== 0 && Math.abs(delta / previous) < 0.03;
  return `${same ? name === 'proteína' ? 'Misma' : name === 'calorías' ? 'Mismas' : 'Mismos' : delta > 0 ? 'Más' : 'Menos'} ${name}`;
}
export function connectionTitle(story: ConnectionStory): string {
  const food = foodTitle(story), o = story.outcome;
  if (!food) return CONNECTION_NAMES[story.key];
  if (story.key === 'protein_strength' && o.kind === 'strength') return o.improved === null ? CONNECTION_NAMES[story.key]
    : `${food} y ${o.improved === 0 ? 'ningún ejercicio mejoró' : o.improved === 1 ? '1 ejercicio que mejoró' : `${o.improved} ejercicios que mejoraron`}`;
  if (o.kind === 'strength') {
    if (!o.top) return CONNECTION_NAMES[story.key];
    const delta = o.top.currentE1rm - o.top.previousE1rm;
    // Exercise names are free text: this phrasing works without guessing their grammatical gender.
    return delta === 0 ? `${food} y ${o.top.name} igual` : `${food} y ${delta > 0 ? 'más' : 'menos'} peso en ${o.top.name}`;
  }
  const delta = difference(o.current, o.previous);
  if (delta === null) return CONNECTION_NAMES[story.key];
  const outcome = o.kind === 'weight' ? 'peso' : 'energía al terminar';
  const direction = delta === 0 ? o.kind === 'weight' ? 'el mismo' : 'la misma' : delta > 0 ? 'más' : 'menos';
  return `${food} y ${direction} ${outcome}`;
}

/** VoiceOver reads facts, units and changes as a single label; visual arrows/captions are not separate stops. */
export function connectionAccessibilityLabel(story: ConnectionStory): string {
  const f = story.food, o = story.outcome;
  const food = `${formatValue(f.current, spokenUnit(f.unit))}${f.key === 'nutrition.kcal' ? '' : ` de ${foodName(story.key)}`} por día, ${spokenDelta(f.current, f.previous, spokenUnit(f.unit))}`;
  const result = o.kind === 'strength'
    ? story.key === 'protein_strength' ? o.improved === null || o.comparable === null ? 'Sin dato de fuerza'
      : `${formatValue(o.improved, null, 'integer')} de ${formatValue(o.comparable, null, 'integer')} ejercicios mejoraron`
      : o.top ? `${o.top.name}, ${formatValue(o.top.currentE1rm, 'kilogramos')}, 1RM estimado, ${spokenDelta(o.top.currentE1rm, o.top.previousE1rm, 'kilogramos')}` : 'Sin dato de fuerza'
    : o.kind === 'energy' ? `${formatValue(o.current, null)} de 5 de energía al finalizar, ${spokenDelta(o.current, o.previous, null)}`
      : `${formatValue(o.current, 'kilogramos')} de tendencia de peso, ${spokenDelta(o.current, o.previous, 'kilogramos')}`;
  return `${CONNECTION_NAMES[story.key]}. ${food}. ${result}.`;
}

export function connectionMissingText(missing: ConnectionMissing, unit: ProgressRangeState['unit']): string {
  const previous = missing.period === 'previous', have = missing.have === null ? 'Sin dato' : formatValue(missing.have, null, 'integer');
  const which = unit === 'week' ? previous ? 'de la semana anterior' : 'de esta semana' : previous ? 'del período anterior' : 'del período actual';
  switch (missing.reason) {
    case 'food_days': return `Hacen falta comidas en ${missing.need} días ${which}. Tenés ${have}.`;
    case 'comparable_exercises': return 'Hace falta repetir un ejercicio en los dos períodos.';
    case 'energy_sessions': return `Hacen falta ${missing.need} entrenamientos con la energía cargada en cada período. ${previous ? 'El anterior' : 'Este'} tiene ${have}.`;
    case 'weigh_ins': return `Hacen falta ${missing.need} pesajes en cada período. ${previous ? 'El anterior' : 'Este'} tiene ${have}.`;
    case 'weigh_in_span': return `Hacen falta pesajes separados por al menos ${missing.need} días. Los ${which} abarcan ${have}.`;
  }
}
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const monthName = (date: string, today: string) => new Intl.DateTimeFormat('es-AR', {
  month: 'long', ...(date.slice(0, 4) !== today.slice(0, 4) ? { year: 'numeric' } : {}), timeZone: 'UTC',
}).format(new Date(`${date}T12:00:00Z`));
export function connectionsPeriodText(state: ProgressRangeState, today: string): string {
  const a = progressRange(state, today), b = compareRange({ ...state, compare: { kind: 'previous' } }, today)!;
  const pair = state.unit === 'month' ? `${cap(monthName(a.start, today))} frente a ${monthName(b.start, today)}`
    : state.unit === 'week' && a.end === today ? 'Esta semana frente a la anterior'
    : state.unit === 'week' ? `Semana del ${shortRange(a, today)} frente a la del ${shortRange(b, today)}`
    : state.unit === 'year' ? `${a.start.slice(0, 4)} frente a ${b.start.slice(0, 4)}`
    : state.unit === 'custom' ? `${shortRange(a, today)} frente a ${shortRange(b, today)}`
    : `${rangeShortLabel(state, today)} frente a ${shortRange(b, today)}`;
  const scale = state.unit === 'month' ? 'del mes' : state.unit === 'week' ? 'de la semana' : state.unit === 'year' ? 'del año' : 'del período';
  return `${pair}${a.end === today ? `, a la misma altura ${scale}` : ''}.`;
}
