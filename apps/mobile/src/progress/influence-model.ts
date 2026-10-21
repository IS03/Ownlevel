import type { AppIconName } from '@/design-system';
import type { InfluenceDefinition, InfluenceMeasureInfo, InfluenceReading, InfluenceSuggestedKey } from '@/api/progress-influence';
import { STATIC_MEASURES, type ExploreChoice } from './explore-model';
import { formatValue } from './progress-format';

export const QUESTIONS: Record<InfluenceSuggestedKey, { title: string; icon: AppIconName }> = {
  sleep_sets: { title: '¿Dormir más cambia tus series del día siguiente?', icon: 'moon' },
  carbs_sets: { title: '¿Los carbohidratos del día anterior cambian tus series?', icon: 'nutrition' },
  training_kcal: { title: '¿Comés distinto los días que entrenás?', icon: 'dumbbell' },
  steps_sleep: { title: '¿Caminar más cambia lo que dormís?', icon: 'footprints' },
  training_water: { title: '¿Tomás más agua los días que entrenás?', icon: 'water' },
};
export const CAUTION = 'Es una relación, no una causa: otras cosas pudieron cambiar esos días.';
export const LAG_LABELS = ['de ese día', 'del día anterior', 'de 2 días antes'];
export function measureInfo(choice: ExploreChoice): InfluenceMeasureInfo {
  const key = choice.key;
  return { key, label: choice.label, unit: choice.unit ?? (key === 'nutrition.kcal' ? 'kcal' : key.startsWith('nutrition.') ? 'g'
    : key === 'training.sets' ? 'series' : key === 'training.sessions' ? 'sesiones' : key === 'training.minutes' ? 'min' : null),
  valueType: key.startsWith('day.') ? 'boolean' : choice.valueType ?? (key === 'training.minutes' ? 'duration' : key === 'nutrition.kcal' || key.startsWith('training.') ? 'integer' : 'decimal') };
}
export function choiceFor(key: string | undefined): ExploreChoice | null {
  if (!key) return null;
  return STATIC_MEASURES.flatMap(g => g.choices).find(c => c.key === key)
    ?? (key === 'day.training' ? { key, label: 'Día de entrenamiento', detail: '' } : key === 'day.work' ? { key, label: 'Día laboral', detail: '' } : { key, label: 'Métrica', detail: '' });
}
export function valueText(value: number, m: InfluenceMeasureInfo, unit = true): string {
  if (m.valueType === 'duration' && !Number.isInteger(value)) return `${Math.floor(value / 60)} h ${formatValue(value % 60, 'min')}`;
  const formatted = formatValue(value, unit ? m.unit : null, m.valueType === 'boolean' ? 'integer' : m.valueType);
  return m.valueType === 'duration' ? formatted.replace(/ h 0 min$/, ' h').replace(/^0 h /, '') : formatted;
}
export function groupLabels(read: InfluenceReading): [string, string] {
  if (read.definition.split === 'day.training') return ['Con entrenamiento', 'Sin entrenamiento'];
  if (read.definition.split === 'day.work') return ['Día laboral', 'Día no laboral'];
  const cut = read.current.cut;
  return cut === null ? ['Grupo alto', 'Grupo bajo'] : [`${thresholdText(cut, read.measure.split)} o más`, `Menos de ${thresholdText(cut, read.measure.split)}`];
}
function thresholdText(cut: number, measure: InfluenceMeasureInfo) {
  return valueText(cut, { ...measure, ...(!Number.isInteger(cut) && measure.valueType === 'integer' ? { valueType: 'decimal' as const } : {}) });
}
export function shortAnswer(read: InfluenceReading): string {
  const r = read.current;
  if (r.status === 'insufficient') return `Todavía no alcanza: ${r.pairs} de 14 días`;
  const [high] = groupLabels(read);
  const yes = read.definition.split === 'day.training';
  return `${yes ? 'Entrenando' : high}: ${valueText(r.high.average, read.measure.outcome)} · ${yes ? 'sin entrenar' : 'el resto'}: ${valueText(r.low.average, read.measure.outcome)}`;
}
export function questionText(d: InfluenceDefinition, split: InfluenceMeasureInfo, outcome: InfluenceMeasureInfo): string {
  const actions: Record<string, string> = { 'nutrition.kcal': 'comer más calorías', 'nutrition.protein': 'comer más proteína', 'nutrition.carbs': 'comer más carbohidratos', 'nutrition.fat': 'comer más grasas',
    'training.sets': 'hacer más series', 'training.sessions': 'hacer más sesiones', 'training.minutes': 'entrenar más tiempo' };
  const results: Record<string, string> = { 'training.sets': 'hacés más series', 'training.sessions': 'hacés más sesiones', 'training.minutes': 'entrenás más tiempo',
    'nutrition.kcal': 'comés más calorías', 'nutrition.protein': 'comés más proteína', 'nutrition.carbs': 'comés más carbohidratos', 'nutrition.fat': 'comés más grasas' };
  const threshold = d.cut.startsWith('gte:') ? valueText(Number(d.cut.slice(4)), split) : '';
  const amountAction = d.split.startsWith('nutrition.') ? `comer ${threshold} o más de ${split.label.toLocaleLowerCase('es-AR')}`
    : d.split.startsWith('training.') ? `hacer ${threshold} o más` : `registrar ${split.label.toLocaleLowerCase('es-AR')} de ${threshold} o más`;
  const more = d.cut === 'median' ? actions[d.split] ?? `registrar más ${split.label.toLocaleLowerCase('es-AR')}` : amountAction;
  const when = d.cut === 'yes' ? d.lag === 0 ? d.split === 'day.training' ? 'los días que entrenás' : 'los días laborales'
    : `${d.lag === 1 ? 'El día' : 'Dos días'} después de ${d.split === 'day.training' ? 'entrenar' : 'un día laboral'}`
    : d.lag === 0 ? `los días con ${d.cut === 'median' ? `más ${split.label.toLocaleLowerCase('es-AR')}` : `${split.label.toLocaleLowerCase('es-AR')} de ${threshold} o más`}` : `los días ${d.lag === 1 ? 'después' : 'dos días después'} de ${more}`;
  return `¿${when.charAt(0).toUpperCase() + when.slice(1)} ${results[d.outcome] ?? `registrás más ${outcome.label.toLocaleLowerCase('es-AR')}`}?`;
}
export function answerText(read: InfluenceReading): string {
  const r = read.current; if (r.status !== 'ok') return '';
  const high = valueText(r.high.average, read.measure.outcome), low = valueText(r.low.average, read.measure.outcome);
  const action = read.definition.outcome.startsWith('nutrition.') ? 'comiste' : read.definition.outcome.startsWith('training.') ? 'hiciste' : 'registraste';
  const later = read.definition.lag === 1 ? ' al día siguiente' : read.definition.lag === 2 ? ' dos días después' : '';
  if (read.definition.split === 'day.training') return `${read.definition.lag ? `Después de un día con entrenamiento,${later}` : 'Los días que entrenaste'} ${action} en promedio ${high}. ${read.definition.lag ? 'Después de días sin entrenar' : 'Los días sin entrenar'}, ${low}.`;
  if (read.definition.split === 'day.work') return `${read.definition.lag ? `Después de un día laboral,${later}` : 'Los días laborales'} ${action} en promedio ${high}. ${read.definition.lag ? 'Después de días no laborales' : 'Los días no laborales'}, ${low}.`;
  if (read.measure.split.label.toLocaleLowerCase('es-AR').includes('sueño')) return `${read.definition.lag ? 'Después de dormir' : 'Los días que dormiste'} ${thresholdText(r.cut!, read.measure.split)} o más${read.definition.lag === 2 ? ', dos días después' : ''} ${action} en promedio ${high}. Los demás días, ${low}.`;
  return `Con ${read.measure.split.label.toLocaleLowerCase('es-AR')} de ${thresholdText(r.cut!, read.measure.split)} o más${later} ${action} en promedio ${high}. Los demás días, ${low}.`;
}
