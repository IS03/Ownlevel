import type { AssociationResult, DayFact, ExerciseSummary, InsightsSummary, PartialAssociationResult, PartialDayFact, PartialExerciseSummary, PartialRelationSummary, RelationSummary } from '@/api/performance-insights';
import { formatValue } from '@/progress/progress-format';

/** Pure presentation of the Insights read model. It never adds across methods and never computes a relation on the client. */
export type Lane = 'strict' | 'partial';
export const LANE_TITLE: Record<Lane, string> = { strict: 'Comparación completa', partial: 'Con contexto parcial' };
export const PARTIAL_LIMIT = 'Comparamos el mismo ejercicio, modo, unidad e implemento. No sabemos si cambiaste agarre, banco o posición, así que un cambio puede venir de ahí. Dice lo que registraste, no cómo estás.';
export const EXPLAIN_DOWN = 'Puede ser programación, descarga o el día.';
const MIN_PAIRS = 20;

type Counts = { up: number; same: number; down: number; other: number; comparable: number; total: number };
const strictCounts = (c: DayFact['counts']): Counts => ({ up: c.improved, same: c.observedStable, down: c.declined, other: c.ambiguous + c.insufficient, comparable: c.comparable, total: c.total });
const partialCounts = (c: PartialDayFact['counts']): Counts => ({ up: c.higher, same: c.same, down: c.lower, other: c.ambiguous + c.insufficient, comparable: c.comparable, total: c.total });

export type ReadingRow = { arrow: string; label: string; value: number; spoken: string };
export function readingRows(lane: Lane, counts: Counts): ReadingRow[] {
  const words = lane === 'strict' ? { up: 'Mejoraron', same: 'Igual', down: 'Por debajo' } : { up: 'Registro superior', same: 'Registro igual', down: 'Registro inferior' };
  const suffix = lane === 'partial' ? ' con contexto parcial' : '';
  return [
    { arrow: '↑', label: words.up, value: counts.up, spoken: `${words.up}${suffix}: ${counts.up}` },
    { arrow: '=', label: words.same, value: counts.same, spoken: `${words.same}${suffix}: ${counts.same}` },
    { arrow: '↓', label: words.down, value: counts.down, spoken: `${words.down}${suffix}: ${counts.down}` },
    { arrow: '', label: 'Mezclado o sin comparar', value: counts.other, spoken: `Mezclado o sin comparar: ${counts.other}` },
  ];
}

export type DayLanes = { date: string; openDay: boolean; strict: DayFact; partial: PartialDayFact | null; strictCounts: Counts; partialCounts: Counts | null };
/** Same dates in both methods. A date missing from the partial page stays null, never zero. */
export function joinDays(strict: readonly DayFact[], partial: readonly PartialDayFact[]): DayLanes[] {
  const byDate = new Map(partial.map(day => [day.date, day]));
  return strict.map(day => {
    const other = byDate.get(day.date) ?? null;
    return { date: day.date, openDay: day.openDay, strict: day, partial: other, strictCounts: strictCounts(day.counts), partialCounts: other ? partialCounts(other.counts) : null };
  });
}

/** The latest day with something to say. The strict method speaks first; the two are never added. */
export function heroOf(days: readonly DayLanes[]): { day: DayLanes; lane: Lane; counts: Counts } | null {
  for (const day of days) {
    if (day.strictCounts.comparable > 0) return { day, lane: 'strict', counts: day.strictCounts };
    if (day.partialCounts && day.partialCounts.comparable > 0) return { day, lane: 'partial', counts: day.partialCounts };
  }
  return null;
}
export const heroCaption = (lane: Lane) => lane === 'strict' ? 'ejercicios comparables, contra su última vez' : 'ejercicios comparables con contexto parcial';
/** Two answers belong together only if they come from the same read of the same day. */
export const sameRead = (a: Pick<InsightsSummary, 'sourceRevision' | 'today'>, b: Pick<InsightsSummary, 'sourceRevision' | 'today'>) => a.sourceRevision === b.sourceRevision && a.today === b.today;
export const nextDate = (date: string) => new Date(Date.parse(`${date}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

/** One session's facts in its own method. A session lives in one day; the lane follows what it can compare. */
export function focusOf(days: readonly DayLanes[], sessionId: string): { day: DayLanes; session: DayFact['sessions'][number]; partial: PartialDayFact['sessions'][number] | null; lane: Lane; counts: Counts } | null {
  for (const day of days) {
    const session = day.strict.sessions.find(row => row.sessionId === sessionId);
    if (!session) continue;
    const partial = day.partial?.sessions.find(row => row.sessionId === sessionId) ?? null;
    const strict = strictCounts(session.counts);
    if (strict.comparable > 0 || !partial?.counts.total) return { day, session, partial, lane: 'strict', counts: strict };
    return { day, session, partial, lane: 'partial', counts: partialCounts(partial.counts) };
  }
  return null;
}

export function primaryLane(model: InsightsSummary): Lane { return model.facts.totals.comparable > 0 || model.partial.totals.comparable === 0 ? 'strict' : 'partial'; }

export type StripMark = { date: string; kind: 'value'; share: number } | { date: string; kind: 'zero' } | { date: string; kind: 'gap' };
/** Oldest to newest. A zero is a mark at the base and a day without comparison is a gap: never a zero bar, never interpolated. */
export function stripMarks(days: readonly DayLanes[], lane: Lane): StripMark[] {
  return [...days].reverse().map(day => {
    const share = lane === 'strict' ? day.strict.declineProportion : day.partial?.lowerProportion ?? null;
    return share === null ? { date: day.date, kind: 'gap' } : share === 0 ? { date: day.date, kind: 'zero' } : { date: day.date, kind: 'value', share };
  });
}
export function stripSummary(marks: readonly StripMark[], lane: Lane) {
  const compared = marks.filter(mark => mark.kind !== 'gap').length;
  const what = lane === 'strict' ? 'por debajo de la última vez' : 'con registro inferior';
  return `${marks.length} días. ${compared} con comparación y ${marks.length - compared} sin comparación. Proporción de ejercicios ${what}.`;
}

const REASONS: Record<string, string> = {
  direct_evidence: '', crossed_signals: 'Subió por un lado y bajó por otro', unanchored_evidence: 'Sin una carga o repeticiones en común',
  no_compatible_reference: 'Todavía sin una sesión anterior para comparar', different_context: 'Se hizo de otra forma que la anterior', mixed_context: 'Se registró de dos formas en la misma sesión',
  incomplete_exercise: 'Quedó sin terminar', no_completed_sets: 'Sin series completas', invalid_completed_set: 'Una serie no se puede leer', unsupported_mode: 'Este modo todavía no se compara',
  mode_unit_mismatch: 'El modo y la unidad no coinciden', uncertain_chronology: 'No sabemos a qué hora fue', reference_order_uncertain: 'Dos sesiones anteriores empatan', duplicate_conflict: 'Hay datos contradictorios',
  session_not_completed: 'La sesión no se terminó', invalid_exercise_id: 'Ejercicio no identificado', not_before_start: 'Sin una sesión anterior para comparar', history_unavailable: 'No pudimos leer el historial', invalid_logical_date: 'Fecha no válida',
};
export function reasonText(lane: Lane, reason: string) {
  if (reason === 'missing_context') return lane === 'strict' ? 'Todavía no sabemos si se hizo igual' : 'Falta el modo o el implemento';
  return REASONS[reason] ?? 'Sin comparar';
}

const STRICT_STATUS: Record<string, string> = { improved: 'Mejoró', observed_stable: 'Igual', declined: 'Por debajo', ambiguous_evidence: 'Mezclado', insufficient_comparison: 'Sin comparar' };
const PARTIAL_READING: Record<string, string> = { higher_record: 'Registro superior', same_record: 'Registro igual', lower_record: 'Registro inferior', ambiguous_evidence: 'Mezclado', insufficient_comparison: 'Sin comparar' };
const ARROW: Record<string, string> = { improved: '↑', higher_record: '↑', observed_stable: '=', same_record: '=', declined: '↓', lower_record: '↓' };
export const statusArrow = (status: string) => ARROW[status] ?? '';
export const statusText = (lane: Lane, status: string) => (lane === 'strict' ? STRICT_STATUS : PARTIAL_READING)[status] ?? 'Sin comparar';
/** A row read as a sentence: "Press banca, registro inferior con contexto parcial, hace 3 días". */
export function exerciseSentence(lane: Lane, name: string, status: string, reason: string, ageDays: number | null) {
  const comparable = !!ARROW[status];
  const reading = statusText(lane, status).toLocaleLowerCase('es-AR'), limit = lane === 'partial' && comparable ? ' con contexto parcial' : '';
  const age = !comparable || ageDays === null ? '' : ageDays === 0 ? ', el mismo día' : ageDays === 1 ? ', hace 1 día' : `, hace ${ageDays} días`;
  const why = comparable ? '' : reasonText(lane, reason) ? `, ${reasonText(lane, reason).toLocaleLowerCase('es-AR')}` : '';
  return `${name || 'Ejercicio'}, ${reading}${limit}${age}${why}`;
}
export const summaryText = (lane: Lane, row: ExerciseSummary | PartialExerciseSummary) => {
  const [up, same, down] = lane === 'strict' ? [(row as ExerciseSummary).improved, (row as ExerciseSummary).observedStable, (row as ExerciseSummary).declined] : [(row as PartialExerciseSummary).higher, (row as PartialExerciseSummary).same, (row as PartialExerciseSummary).lower];
  return `↑ ${up}  = ${same}  ↓ ${down}`;
};
export const summarySpoken = (lane: Lane, row: ExerciseSummary | PartialExerciseSummary) => {
  const [up, same, down] = lane === 'strict' ? [(row as ExerciseSummary).improved, (row as ExerciseSummary).observedStable, (row as ExerciseSummary).declined] : [(row as PartialExerciseSummary).higher, (row as PartialExerciseSummary).same, (row as PartialExerciseSummary).lower];
  const words = lane === 'strict' ? ['mejoró', 'igual', 'por debajo'] : ['registro superior', 'registro igual', 'registro inferior'];
  return `${row.name || 'Ejercicio'}: ${up} ${words[0]}, ${same} ${words[1]}, ${down} ${words[2]}, de ${row.exposures} veces`;
};

/** Why nothing compares, taken from the exclusions: empty history and missing context are different things. */
export function nothingComparable(model: InsightsSummary) {
  const counts = model.partial.exclusions.performance;
  const top = Object.entries(counts).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))[0]?.[0];
  return top === 'missing_context' ? 'Faltan el modo o el implemento en estas sesiones, así que no las comparamos.' : 'Todavía no hay una sesión anterior para comparar.';
}

const NUTRIENT: Record<string, { name: string; unit: string }> = { calories: { name: 'Calorías registradas', unit: 'kcal' }, proteinG: { name: 'Proteína registrada', unit: 'g' }, carbsG: { name: 'Carbohidratos registrados', unit: 'g' }, fatG: { name: 'Grasas registradas', unit: 'g' } };
const FEELING: Record<string, string> = { energyPre: 'Energía antes de entrenar', fatiguePre: 'Fatiga antes de entrenar', energyPost: 'Energía al terminar', fatiguePost: 'Fatiga al terminar' };
type Metric = InsightsSummary['metrics'][number];
type AnyRelation = RelationSummary | PartialRelationSummary;
/** Names what was recorded. A metric is found by UUID; its unit is the stored one, or none. */
export function relationName(item: Pick<AnyRelation, 'definition'>, metrics: readonly Metric[]) {
  const { family, subject, window } = item.definition;
  if (family === 'body') return 'Peso corporal de ese día';
  if (family === 'sleep') return window === 'night_before' ? 'Sueño de la noche anterior' : `Sueño sin noche declarada${window === 'previous_day' ? ', fecha anterior' : ', misma fecha'}`;
  if (family === 'meal_window') return window === 'pre_3h' ? 'Carbohidratos registrados, 3 h antes' : 'Carbohidratos registrados antes de entrenar';
  if (family === 'feeling') return FEELING[subject] ?? 'Sensación';
  const when = window === 'previous_day' ? ', día anterior' : ', ese día';
  if (family === 'nutrition') return `${NUTRIENT[subject]?.name ?? 'Nutrición'}${when}`;
  return `${metrics.find(metric => metric.id === subject)?.name ?? 'Métrica'}${when}`;
}
export function exposureUnit(item: Pick<AnyRelation, 'definition'>, metrics: readonly Metric[]) {
  const { family, subject } = item.definition;
  if (family === 'meal_window') return 'g';
  if (family === 'body') return 'kg';
  if (family === 'nutrition') return NUTRIENT[subject]?.unit ?? null;
  return family === 'metric' || family === 'sleep' ? metrics.find(metric => metric.id === subject)?.unit ?? null : null;
}
export function relationState(item: Pick<AnyRelation, 'state' | 'reason' | 'pairs'>) {
  if (item.state === 'exploratory') return 'Exploratorio';
  if (item.state === 'coincidence_context_unknown') return 'Coincidieron';
  if (item.state === 'no_clear_signal') return 'Sin señal clara';
  return item.reason === 'too_few_pairs' ? `Faltan días: ${item.pairs} de ${MIN_PAIRS}` : 'Casi siempre el mismo valor';
}
const lowerName = (name: string) => name.charAt(0).toLocaleLowerCase('es-AR') + name.slice(1);
/**
 * Never a cause, a pattern or a recommendation. The most it can say is what is written here. In the partial lane it cannot even
 * say that: an unrecorded change of variant on those days would look the same, so it stays a coincidence and says why.
 */
export function relationSentence(lane: Lane, item: AssociationResult | PartialAssociationResult, metrics: readonly Metric[]) {
  const base = lowerName(relationName(item, metrics));
  if (item.state === 'insufficient_data') return item.reason === 'too_few_pairs' ? `Todavía faltan días: tenés ${item.pairs} de ${MIN_PAIRS}.` : 'Este dato casi no cambia entre días, así que no se puede mirar.';
  if (item.state === 'no_clear_signal' || item.rho === null) return 'Por ahora no se ve una relación clara.';
  const more = item.rho < 0 ? 'menos' : 'más', subject = base.replace(/, (ese día|día anterior)$/, '');
  if (item.state === 'coincidence_context_unknown') return `Los días con más ${subject} coincidieron con ${more} ejercicios con registro inferior, en ${item.pairs} de ${item.outcomeDays} días. No sabemos si esos días cambiaste de variante, así que esto no dice que tenga que ver.`;
  return `Los días con más ${subject}, ${more} ejercicios quedaron por debajo de la última vez. Lo vimos en ${item.pairs} de ${item.outcomeDays} días. Todavía no alcanza para decir que se repite.`;
}
export const coverageText = (item: Pick<AnyRelation, 'pairs' | 'outcomeDays'>) => `Visto en ${item.pairs} de ${item.outcomeDays} días`;
/**
 * What each exposure is, said every time: which night, which weight and from what date. Written before any result. The outcome is
 * the same as for every relation: the share of exercises below their last comparable time, each day counted once.
 */
export function exposureMeaning(item: Pick<AnyRelation, 'definition'>): string | null {
  const { family, window } = item.definition;
  if (family === 'body') return 'Usa el peso que registraste en Cuerpo para la misma fecha del entrenamiento, un valor por día aunque hayas entrenado dos veces. No sabemos si lo mediste antes o después de entrenar: es contexto del día, no un antecedente. El peso cambia despacio: si los dos cambian con el tiempo, pueden coincidir sin tener que ver.';
  if (family === 'sleep' && window === 'night_before') return 'Cada día usa el sueño que registraste para esa fecha como la noche que terminó esa mañana. Solo cuentan los valores guardados con esa aclaración.';
  if (family === 'sleep') return 'Estos valores se guardaron sin decir a qué noche corresponden: pueden ser de la noche anterior o de la siguiente. Por eso van aparte y no se suman a la noche declarada.';
  return null;
}

const EXCLUSIONS: Record<string, string> = {
  metric_not_recorded: 'Sin valor registrado', no_active_meals: 'Sin comidas registradas', partial_macro: 'Alguna comida sin ese dato', multiple_sessions_day: 'Días con más de una sesión', no_start_time: 'Sin hora de inicio',
  untimed_meal_in_scope: 'Comidas sin hora', unverified_meal_time_in_scope: 'Comidas con hora sin confirmar', no_registered_meal_in_window: 'Sin comidas con hora en esa ventana',
  feeling_not_recorded: 'Sin sensación registrada', feeling_capture_unknown: 'No sabemos cuándo se respondió', feeling_after_first_set: 'Respondida después de empezar',
  sleep_not_recorded: 'Sin sueño registrado', sleep_night_undeclared: 'Sueño sin noche declarada', sleep_declaration_outdated: 'Sueño editado sin volver a declarar la noche',
  sleep_night_declared: 'Ya cuenta como noche declarada', weight_not_recorded: 'Sin peso ese día', weight_invalid: 'Peso no válido',
};
export const exclusionRows = (exclusions: Record<string, number>) => Object.entries(exclusions).filter(([, days]) => days > 0).sort((a, b) => b[1] - a[1]).map(([key, days]) => ({ key, label: EXCLUSIONS[key] ?? 'Otro motivo', days }));

const percent = (share: number) => `${Math.round(share * 100)} %`;
export function groupRows(lane: Lane, item: AssociationResult | PartialAssociationResult, unit: string | null) {
  if (!item.groups) return [];
  const outcome = lane === 'strict' ? 'por debajo' : 'con registro inferior';
  const side = (group: NonNullable<AssociationResult['groups']>['low']) => ({
    label: group.min === group.max ? `Con ${formatValue(group.min, unit)}` : `De ${formatValue(group.min, null)} a ${formatValue(group.max, unit)}`,
    value: `${percent(group.meanOutcome)} ${outcome}`, days: `${group.days} días` });
  return [side(item.groups.low), side(item.groups.high)];
}
export const shareText = (lane: Lane, share: number) => `${percent(share)} ${lane === 'strict' ? 'por debajo' : 'con registro inferior'}`;

export type FamilyFilter = 'all' | AnyRelation['definition']['family'];
export const FAMILY_OPTIONS: readonly { value: FamilyFilter; label: string }[] = [{ value: 'all', label: 'Todas' }, { value: 'metric', label: 'Métricas' }, { value: 'nutrition', label: 'Nutrición' }, { value: 'meal_window', label: 'Comidas' }, { value: 'feeling', label: 'Sensaciones' }];
const STATE_ORDER = { exploratory: 0, coincidence_context_unknown: 0, no_clear_signal: 1, insufficient_data: 2 };
/** Every evaluated relation stays reachable, including those that said nothing: showing only hits would hide the denominator. */
export function relationGroups<T extends AnyRelation>(items: readonly T[], family: FamilyFilter) {
  const shown = items.filter(item => family === 'all' || item.definition.family === family).sort((a, b) => STATE_ORDER[a.state] - STATE_ORDER[b.state]);
  return { readable: shown.filter(item => item.state !== 'insufficient_data'), waiting: shown.filter(item => item.state === 'insufficient_data'), total: shown.length };
}

export function dayLabel(date: string) {
  const text = new Intl.DateTimeFormat('es-AR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`));
  return text.charAt(0).toUpperCase() + text.slice(1);
}
const CARBS: Record<string, string> = { no_registered_meal: 'Sin comidas con hora', partial_macro: 'Alguna comida sin ese dato', untimed_meal_in_scope: 'Comidas sin hora', unverified_meal_time_in_scope: 'Hay comidas, pero no sabemos si esa fue la hora', no_start_time: 'Sin hora de inicio' };
/** What was recorded around the training. If it was not recorded it says so: never a zero. */
export function contextRows(day: DayFact, metrics: readonly Metric[], session: DayFact['sessions'][number] | undefined = day.sessions[0]) {
  const rows: { key: string; label: string; value: string; metricId?: string }[] = [];
  if (session) {
    const feelings = session.context.feelings;
    for (const key of ['energyPre', 'fatiguePre', 'energyPost', 'fatiguePost'] as const) rows.push({ key, label: FEELING[key]!, value: feelings[key] ? `${feelings[key]!.value} de 5` : 'Sin registrar' });
    const carbs = session.context.carbsPre3h;
    rows.push({ key: 'carbs', label: 'Carbohidratos registrados, 3 h antes', value: carbs.state === 'recorded' && carbs.value !== null ? formatValue(carbs.value, 'g') : CARBS[carbs.state] ?? 'Sin registrar' });
  }
  const nutrition = day.context.nutrition;
  rows.push({ key: 'calories', label: 'Calorías registradas', value: !nutrition ? 'Sin comidas registradas' : `${formatValue(nutrition.calories.recorded, 'kcal', 'integer')}${nutrition.calories.missing ? `, ${nutrition.calories.missing} sin dato` : ''}` });
  for (const metric of day.context.metrics) {
    const known = metrics.find(row => row.id === metric.metricId);
    const night = metric.sleepNight === undefined ? '' : metric.sleepNight === 'declared' ? ', noche que terminó esa mañana' : ', sin noche declarada';
    // Only a metric the read names can open its trends.
    rows.push({ key: metric.metricId, label: `${known?.name ?? 'Métrica'}${night}`, value: formatValue(metric.value, known?.unit ?? null), ...(known ? { metricId: known.id } : {}) });
  }
  const weight = day.context.bodyWeight;
  if (weight) rows.push({ key: 'body-weight', label: 'Peso corporal, ese día', value: weight.state === 'recorded' && weight.value !== null ? formatValue(weight.value, 'kg') : weight.state === 'invalid' ? 'Peso no válido' : 'Sin registrar' });
  return rows;
}
