import type { InsightsPeriodSummary, InsightsPinnedPeriodSummary } from '@/api/performance-insights';
import { formatValue } from '@/progress/progress-format';
import { shortRange } from '@/progress/progress-range';
import { postsText } from './feelings-model';

/**
 * The summary of the last three whole months, written from its figures alone: the same input always gives the same words. Facts
 * only: no sentence joins two of them into a cause, and none speaks of an association.
 */
type Summary = InsightsPeriodSummary | InsightsPinnedPeriodSummary;
export const exactPeriodDate = (date: string) => date.split('-').reverse().join('/');
export const exactPeriodRange = (period: { start: string; end: string }) => `${exactPeriodDate(period.start)} – ${exactPeriodDate(period.end)}`;
const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const monthName = (month: string) => MONTHS[Number(month.slice(5, 7)) - 1]!;

export function periodHeading(data: Summary) {
  const [a, b, c] = data.period.months.map(monthName);
  return { range: shortRange({ start: data.period.start, end: data.period.end }, data.today), months: `${a!.charAt(0).toLocaleUpperCase('es-AR')}${a!.slice(1)}, ${b} y ${c}. El mes en curso no entra.` };
}

const lane = (counts: { comparable: number; total: number }, up: number, same: number, down: number) =>
  counts.total ? `${counts.comparable} de ${counts.total} comparables: ↑ ${up}  = ${same}  ↓ ${down}` : 'Sin ejercicios en este método';

/** Whether there is anything at all to describe: an empty period is said as such, never as zeros on every line. */
export function periodEmpty(data: Summary) {
  return !data.training.sessions && !data.nutrition.daysWithMeals && !data.weight.weighIns;
}

/** One sentence per fact, each with the figure it rests on. */
export function periodSentences(data: Summary): string[] {
  const { training, nutrition, weight, routines } = data;
  const sentences: string[] = [];
  sentences.push(training.sessions
    ? `Entrenaste ${plural(training.sessions, 'vez', 'veces')} en ${plural(training.trainingDays, 'día', 'días')}${training.multipleSessionDays ? `; ${plural(training.multipleSessionDays, 'día tuvo', 'días tuvieron')} más de una sesión` : ''}.`
    : 'No hay entrenamientos terminados en estos tres meses.');
  if (training.strict.comparable) sentences.push(`Comparación completa: ${training.strict.comparable} de ${training.strict.total} ejercicios comparables.`);
  if (training.partial.comparable) sentences.push(`Con contexto parcial: ${training.partial.comparable} de ${training.partial.total}, contados aparte.`);
  // Each feeling on its own, with its own coverage: an answer given later is not a missing one, and neither is a count of the other.
  for (const summary of data.feelings) sentences.push(feelingSentence(summary));
  sentences.push(`Registraste comidas en ${nutrition.daysWithMeals} de ${data.period.days} días. Es lo registrado, no necesariamente todo lo que comiste.`);
  const withMedian = weight.weeks.filter(week => week.median !== null).length, changes = weight.changes.filter(change => change.change !== null).length;
  sentences.push(weight.weighIns
    ? `${plural(weight.weighIns, 'pesaje', 'pesajes')}; ${withMedian} de ${plural(weight.weeks.length, 'semana entera tiene', 'semanas enteras tienen')} mediana, y hay ${plural(changes, 'cambio', 'cambios')} entre semanas seguidas.`
    : 'Sin pesajes en estos tres meses.');
  if (routines.order === 'sequence') sentences.push(`Rutinas, una después de otra: ${routines.items.map(row => row.name ?? 'Sin rutina').join(', ')}.`);
  if (routines.order === 'alternating') sentences.push(`Alternaste ${routines.items.length} rutinas: ${routines.items.map(row => row.name ?? 'Sin rutina').join(', ')}.`);
  return sentences;
}
/**
 * "Energía al terminar: respondida en 12 de 20 sesiones; 2 más tarde y 6 sin respuesta." Answered at the finish, later or without
 * a time, unreadable or on another scale, and not answered: separate counts that add up to the sessions.
 */
export function feelingSentence(summary: Summary['feelings'][number]) {
  const name = summary.kind === 'energy' ? 'Energía al terminar' : 'Fatiga al terminar';
  const { sessions, capture } = summary;
  if (!sessions.completed) return `${name}: sin sesiones en estos tres meses.`;
  const later = capture.late, noTime = capture.captureUnknown + capture.beforeStart, unreadable = sessions.unreadable + sessions.otherInstrument;
  const rest = [later ? `${later} más tarde` : null, noTime ? `${noTime} sin hora de respuesta` : null, unreadable ? `${plural(unreadable, 'ilegible', 'ilegibles')}` : null,
    sessions.notRecorded ? `${sessions.notRecorded} sin respuesta` : null].filter(Boolean) as string[];
  const tail = rest.length ? `; ${rest.length > 1 ? `${rest.slice(0, -1).join(', ')} y ${rest.at(-1)}` : rest[0]}` : '';
  return `${name}: respondida en ${capture.atFinish} de ${plural(sessions.completed, 'sesión', 'sesiones')}${tail}.`;
}
export const FACTS_ONLY = 'Son hechos de tus registros. Este resumen no busca relaciones; las que ya existen están en «Para mirar con calma», sobre todo tu historial.';

export function trainingRows(data: Summary) {
  const { strict, partial } = data.training;
  return [
    { key: 'strict', label: 'Comparación completa', value: lane(strict, strict.improved, strict.observedStable, strict.declined), detail: strict.ambiguous || strict.insufficient ? `${strict.ambiguous} mezclados, ${strict.insufficient} sin comparar` : undefined },
    { key: 'partial', label: 'Con contexto parcial', value: lane(partial, partial.higher, partial.same, partial.lower), detail: partial.ambiguous || partial.insufficient ? `${partial.ambiguous} mezclados, ${partial.insufficient} sin comparar` : undefined },
  ];
}

/** Every answer at the finish of the period, in the words of its scale, and how many sessions had one. */
export function feelingRows(data: Summary) {
  return data.feelings.map(summary => {
    const posts = summary.byPrior.reduce((sum, row) => sum.map((value, index) => value + row.posts[index]!), [...summary.priorNotComparable.posts]);
    const label = summary.kind === 'energy' ? 'Energía al terminar' : 'Fatiga al terminar';
    const value = summary.capture.atFinish ? postsText(summary.kind, posts) : 'Sin respuestas';
    const outside = summary.capture.late + summary.capture.captureUnknown + summary.capture.beforeStart + summary.sessions.unreadable + summary.sessions.otherInstrument;
    const detail = `${summary.capture.atFinish} de ${plural(summary.sessions.completed, 'sesión', 'sesiones')}${outside ? `; ${outside} fuera de las cuentas (tardías, sin hora o ilegibles)` : ''}`;
    return { key: summary.kind, label, value, detail };
  });
}

const NUTRIENT = [['calories', 'Calorías', 'kcal'], ['proteinG', 'Proteína', 'g'], ['carbsG', 'Carbohidratos', 'g'], ['fatG', 'Grasas', 'g']] as const;
export function nutritionRows(data: Summary) {
  return NUTRIENT.map(([key, label, unit]) => {
    const row = data.nutrition.nutrients[key];
    const value = row.dailyMedian === null ? 'Sin días completos' : `${formatValue(row.dailyMedian, unit)} por día (mediana)`;
    const detail = `${plural(row.knownDays, 'día', 'días')} con el dato en todas las comidas${row.partialDays ? `; en ${plural(row.partialDays, 'día', 'días')} falta en alguna comida` : ''}`;
    return { key, label: `${label} registradas`.replace('Proteína registradas', 'Proteína registrada'), value, detail };
  });
}

export function routineRows(data: Summary, today: string) {
  return data.routines.items.map(row => ({ key: row.routineId ?? 'free', label: row.name ?? 'Sin rutina', value: plural(row.sessions, 'sesión', 'sesiones'),
    detail: shortRange({ start: row.first, end: row.last }, today) }));
}
