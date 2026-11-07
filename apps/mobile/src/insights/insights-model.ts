import type { AssociationResult, DayFact, ExerciseSummary, InsightsSummary, PartialAssociationResult, PartialDayFact, PartialExerciseSummary, PartialRelationSummary, RelationSummary } from '@/api/performance-insights';
import { formatClockTime } from '@/home/format';
import { formatValue } from '@/progress/progress-format';
import { feelingTransition, type FeelingSide } from '@/training/feeling-transition';

/** Pure presentation of the Insights read model. It never adds across methods and never computes a relation on the client. */
export type Lane = 'strict' | 'partial';
export const LANE_TITLE: Record<Lane, string> = { strict: 'Comparación completa', partial: 'Con contexto parcial' };
export const PARTIAL_LIMIT = 'Comparamos el mismo ejercicio, modo, unidad e implemento. No sabemos si cambiaste agarre, banco o posición, así que un cambio puede venir de ahí. Dice lo que registraste, no cómo estás.';
export const EXPLAIN_DOWN = 'Puede ser programación, descarga o el día.';
const MIN_PAIRS = 20;

type Counts = { up: number; same: number; down: number; ambiguous: number; insufficient: number; comparable: number; total: number };
const strictCounts = (c: DayFact['counts']): Counts => ({ up: c.improved, same: c.observedStable, down: c.declined, ambiguous: c.ambiguous, insufficient: c.insufficient, comparable: c.comparable, total: c.total });
const partialCounts = (c: PartialDayFact['counts']): Counts => ({ up: c.higher, same: c.same, down: c.lower, ambiguous: c.ambiguous, insufficient: c.insufficient, comparable: c.comparable, total: c.total });

export type ReadingRow = { arrow: string; label: string; value: number; spoken: string };
export function readingRows(lane: Lane, counts: Counts): ReadingRow[] {
  const words = lane === 'strict' ? { up: 'Mejoraron', same: 'Igual', down: 'Por debajo' } : { up: 'Registro superior', same: 'Registro igual', down: 'Registro inferior' };
  const suffix = lane === 'partial' ? ' con contexto parcial' : '';
  return [
    { arrow: '↑', label: words.up, value: counts.up, spoken: `${words.up}${suffix}: ${counts.up}` },
    { arrow: '=', label: words.same, value: counts.same, spoken: `${words.same}${suffix}: ${counts.same}` },
    { arrow: '↓', label: words.down, value: counts.down, spoken: `${words.down}${suffix}: ${counts.down}` },
    // Mixed evidence and no comparison are different facts: one compared and found both directions, the other could not compare.
    { arrow: '', label: 'Mezclado', value: counts.ambiguous, spoken: `Mezclado${suffix}: ${counts.ambiguous}` },
    { arrow: '', label: 'Sin comparar', value: counts.insufficient, spoken: `Sin comparar: ${counts.insufficient}` },
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

/**
 * Whether the strict method holds an exercise of its own here. The partial method holds exactly the exercises whose
 * configuration is unknown, so any other strict exercise has a known configuration: its result is strict evidence even when
 * it is mixed or not compared. An exercise of unknown configuration never opens the strict lane on its own.
 */
function hasStrictEvidence(session: DayFact['sessions'][number], partial: PartialDayFact['sessions'][number] | null | undefined) {
  const unknown = new Set((partial?.exercises ?? []).map(row => row.exerciseId));
  return session.exercises.some(row => !unknown.has(row.exerciseId));
}
/**
 * The methods a session is shown in, each with its own counts and denominator: the strict one when it holds an exercise of its
 * own (compared or not) or there is nothing partial, the partial one when it holds exercises. They are never added.
 */
export function sessionLanes(session: DayFact['sessions'][number], partial: PartialDayFact['sessions'][number] | null): { lane: Lane; counts: Counts }[] {
  const strict = strictCounts(session.counts), other = partial ? partialCounts(partial.counts) : null;
  const showStrict = strict.comparable > 0 || !other?.total || hasStrictEvidence(session, partial);
  return [...(showStrict ? [{ lane: 'strict' as const, counts: strict }] : []), ...(other?.total ? [{ lane: 'partial' as const, counts: other }] : [])];
}
/** The same rule for a day: the strict lane is there when any of its sessions holds strict evidence of its own. */
export function dayLanes(day: DayLanes): Lane[] {
  const showStrict = day.strictCounts.comparable > 0 || !day.partialCounts?.total
    || day.strict.sessions.some(session => hasStrictEvidence(session, day.partial?.sessions.find(row => row.sessionId === session.sessionId)));
  return [...(showStrict ? ['strict' as const] : []), ...(day.partialCounts?.total ? ['partial' as const] : [])];
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
/** A row read as a sentence: "Press banca, registro inferior con contexto parcial, hace 3 días, frente a la sesión del lunes 2 de marzo". */
export function exerciseSentence(lane: Lane, name: string, status: string, reason: string, ageDays: number | null, referenceDate?: string | null) {
  const comparable = !!ARROW[status];
  const reading = statusText(lane, status).toLocaleLowerCase('es-AR'), limit = lane === 'partial' && comparable ? ' con contexto parcial' : '';
  const age = !comparable || ageDays === null ? '' : ageDays === 0 ? ', el mismo día' : ageDays === 1 ? ', hace 1 día' : `, hace ${ageDays} días`;
  const against = comparable && referenceDate ? `, frente a la sesión del ${lowerDay(referenceDate)}` : '';
  const why = comparable ? '' : reasonText(lane, reason) ? `, ${reasonText(lane, reason).toLocaleLowerCase('es-AR')}` : '';
  return `${name || 'Ejercicio'}, ${reading}${limit}${age}${against}${why}`;
}
/** Which earlier session a reading was compared with, by its date; an answer of an older server only knows how long ago. */
export function referenceText(ageDays: number | null, referenceDate?: string | null) {
  if (referenceDate) return `Frente al ${lowerDay(referenceDate)}`;
  if (ageDays === null) return null;
  return ageDays === 0 ? 'Frente a una sesión del mismo día' : ageDays === 1 ? 'Frente a una sesión de hace 1 día' : `Frente a una sesión de hace ${ageDays} días`;
}
const lowerDay = (date: string) => { const text = dayLabel(date); return text.charAt(0).toLocaleLowerCase('es-AR') + text.slice(1); };
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
type Session = DayFact['sessions'][number];
export type ContextRow = { key: string; label: string; value: string; detail?: string; spoken?: string; metricId?: string; body?: true };
const instant = (iso: string | null) => iso === null ? null : Number.isFinite(Date.parse(iso)) ? Date.parse(iso) : null;

/**
 * The day's sessions in the order they started, only when that order is known: every start readable and none tied. Otherwise
 * the server's stable order stays and orderKnown is false, so the screen never numbers or sequences them.
 */
export function daySessions(day: Pick<DayFact, 'sessions'>): { sessions: Session[]; orderKnown: boolean } {
  const starts = day.sessions.map(session => instant(session.startedAt));
  const known = starts.every(start => start !== null) && new Set(starts).size === starts.length;
  if (!known) return { sessions: [...day.sessions], orderKnown: day.sessions.length < 2 };
  return { sessions: day.sessions.map((session, index) => ({ session, start: starts[index]! })).sort((a, b) => a.start - b.start).map(row => row.session), orderKnown: true };
}
export const sessionName = (session: Pick<Session, 'routineName' | 'name'>) => session.routineName ?? session.name ?? 'Sesión';
/** Clock time where it was recorded, in the app's time zone. Without a start there is no time to show, never a guessed one. */
export function sessionTime(session: Pick<Session, 'startedAt' | 'endedAt'>) {
  const start = instant(session.startedAt), end = instant(session.endedAt);
  if (start === null) return 'Sin horario';
  return end !== null && end >= start ? `${formatClockTime(session.startedAt!)}–${formatClockTime(session.endedAt!)}` : `Desde ${formatClockTime(session.startedAt!)}`;
}

const LATE: Partial<Record<string, string>> = { after_first_set: 'respondida después de empezar', after_end: 'respondida al terminar', unknown: 'no sabemos cuándo se respondió' };
/**
 * Energy and fatigue as ordinal answers, before → after ("Energía: baja → alta"). Not recorded, unreadable and answered late
 * stay distinct. The legacy energy has no moment of its own, so it is its own row and never stands in for the energy at the end.
 */
export function sessionRows(session: Pick<Session, 'context'>): ContextRow[] {
  const { feelings, unreadableFeelings = [], legacy, carbsPre3h } = session.context;
  const rows: ContextRow[] = [];
  const side = (key: 'energyPre' | 'fatiguePre' | 'energyPost' | 'fatiguePost'): FeelingSide =>
    feelings[key] ? { value: feelings[key]!.value } : unreadableFeelings.includes(key) ? 'unreadable' : 'missing';
  const anyFeeling = Object.keys(feelings).length > 0 || unreadableFeelings.length > 0;
  if (!anyFeeling) rows.push({ key: 'feelings', label: 'Sensaciones', value: 'Sin registrar' });
  else for (const [kind, pre, post] of [['energy', 'energyPre', 'energyPost'], ['fatigue', 'fatiguePre', 'fatiguePost']] as const) {
    const line = feelingTransition(kind, side(pre), side(post));
    // Only an answer before starting has a moment to check. A late one stays visible, with when it was given.
    const timing = feelings[pre]?.timing, late = timing ? LATE[timing] : undefined;
    rows.push({ key: `feelings-${kind}`, label: line.label, value: line.value, ...(late ? { detail: `Antes: ${late}` } : {}), spoken: `${line.spoken}${late ? `. Antes: ${late}` : ''}` });
  }
  if (legacy.energyLevel !== null) rows.push({ key: 'legacy-energy', label: 'Energía, registro anterior', value: `${legacy.energyLevel} de 5`, detail: 'Sin momento: no es la energía al terminar' });
  const windowValue = (window: typeof carbsPre3h, unit: string) => window.state === 'recorded' && window.value !== null ? formatValue(window.value, unit) : CARBS[window.state] ?? 'Sin registrar';
  rows.push({ key: 'carbs', label: 'Carbohidratos registrados, 3 h antes', value: windowValue(carbsPre3h, 'g') });
  // #367 phase 2: only from a server that sends it. Amount, energy and distance in time stay separate rows, never one figure.
  const pre = session.context.preStart;
  if (pre) {
    rows.push({ key: 'protein', label: 'Proteína registrada, 3 h antes', value: windowValue(pre.proteinG, 'g') });
    rows.push({ key: 'calories', label: 'Calorías registradas, 3 h antes', value: windowValue(pre.calories, 'kcal') });
    const last = pre.lastExplicitMeal;
    const value = last.state === 'recorded' && last.hours !== null ? `Hace ${hoursText(last.hours)}` : last.state === 'no_start_time' ? 'Sin hora de inicio' : 'Ninguna con hora en las 12 h previas';
    const detail = last.untimedInScope ? 'Hay comidas sin hora que podrían ser posteriores' : last.unverifiedInScope ? 'Hay comidas con una hora que no sabemos si es la real' : last.state === 'recorded' ? 'La última registrada con hora, no necesariamente la última que comiste' : undefined;
    rows.push({ key: 'last-meal', label: 'Última comida registrada con hora', value, ...(detail ? { detail } : {}), spoken: `Última comida registrada con hora: ${value.toLocaleLowerCase('es-AR')}${detail ? `. ${detail}` : ''}` });
  }
  return rows;
}
/** "2 h 30 min", "45 min": minutes rounded, never a decimal of hours. */
export function hoursText(hours: number) {
  const minutes = Math.round(hours * 60), h = Math.floor(minutes / 60), m = minutes % 60;
  return h ? (m ? `${h} h ${m} min` : `${h} h`) : `${m} min`;
}
/** The phone's clock dates each answer: said once, only where there is an answer before starting. */
export const feelingClockNote = (sessions: readonly Session[]) => sessions.some(session => session.context.feelings.energyPre || session.context.feelings.fatiguePre)
  ? 'El momento de cada respuesta sale del reloj del teléfono.' : null;

const MACROS = [['calories', 'Calorías', 'kcal'], ['proteinG', 'Proteínas', 'g'], ['carbsG', 'Carbohidratos', 'g'], ['fatG', 'Grasas', 'g']] as const;
/**
 * The day's canonical totals, as the server summed them. A meal without a macro adds nothing to it: the total says it is
 * partial and how many meals lack it. A known zero is a zero; no meals, or no meal with that macro, is "sin dato".
 */
export function nutritionRows(day: Pick<DayFact, 'context'>): ContextRow[] {
  const nutrition = day.context.nutrition;
  if (!nutrition || nutrition.activeMeals === 0) return [{ key: 'meals', label: 'Comidas', value: 'Sin comidas registradas' }];
  return MACROS.map(([key, label, unit]) => {
    const { recorded, missing } = nutrition[key];
    const amount = formatValue(recorded, unit, key === 'calories' ? 'integer' : 'decimal');
    if (missing >= nutrition.activeMeals) return { key, label, value: 'Sin dato', spoken: `${label}: ninguna comida registrada tiene ese dato` };
    if (!missing) return { key, label, value: amount };
    const detail = `${missing} de ${nutrition.activeMeals} comidas sin ese dato`;
    return { key, label, value: `${amount}, parcial`, detail, spoken: `${label}: ${amount}, total parcial, ${detail}` };
  });
}
export const NUTRITION_SCOPE = 'Suma lo que registraste ese día. No dice si es todo lo que comiste ni si fue antes de entrenar.';

/** What belongs to the whole day: one value each, however many sessions there were. If it was not recorded it says so: never a zero. */
export function contextRows(day: DayFact, metrics: readonly Metric[]) {
  const rows: ContextRow[] = [];
  for (const metric of day.context.metrics) {
    const known = metrics.find(row => row.id === metric.metricId);
    const night = metric.sleepNight === undefined ? '' : metric.sleepNight === 'declared' ? ', noche que terminó esa mañana' : ', sin noche declarada';
    // Only a metric the read names can open its trends.
    rows.push({ key: metric.metricId, label: `${known?.name ?? 'Métrica'}${night}`, value: formatValue(metric.value, known?.unit ?? null), ...(known ? { metricId: known.id } : {}) });
  }
  const weight = day.context.bodyWeight;
  // Opens Cuerpo on that month: to see it in its evolution, or to load or correct it.
  if (weight) rows.push({ key: 'body-weight', label: 'Peso corporal, ese día', value: weight.state === 'recorded' && weight.value !== null ? formatValue(weight.value, 'kg') : weight.state === 'invalid' ? 'Peso no válido' : 'Sin registrar', body: true });
  return rows;
}
