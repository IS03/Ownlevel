import { feelingWord } from '@/training/feeling-transition';
import type { DayFact, ExerciseEvidence, InsightsSummary, PerformanceChange, RelationFactor, RelationGroup, SessionChange, SessionFact } from '@/api/performance-insights';

/**
 * #533 · What Comparaciones says about the measured change. Every number comes from the server (PR #540): here it is only
 * formatted. Missing is never zero, a load signal never becomes a percentage, and nothing says why it happened.
 */
const decimal = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1, minimumFractionDigits: 0 });
const integer = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });
const capitalize = (text: string) => text.charAt(0).toLocaleUpperCase('es-AR') + text.slice(1);

/** +8,3 % · 0 % · −7 %. One decimal under 10, none above: it is a reading aid, the exact value stays in the data. */
export function formatPct(pct: number): string {
  const abs = Math.abs(pct), shown = abs >= 10 ? integer.format(abs) : decimal.format(abs);
  if (shown === '0') return '0 %';
  return `${pct > 0 ? '+' : '−'}${shown} %`;
}
export const changeArrow = (pct: number) => (pct > 0 ? '↑' : pct < 0 ? '↓' : '=');
const spokenPct = (pct: number) => `${pct > 0 ? 'subió' : pct < 0 ? 'bajó' : 'igual,'} ${decimal.format(Math.abs(pct))} por ciento`;

/** The value of an exercise row: its percentage, a load signal, or null to keep the reading it had before (#518). */
export function exerciseChangeValue(change: PerformanceChange | undefined): { value: string; spoken: string } | null {
  if (!change) return null;
  if (change.state === 'measured' && change.pct !== null) return { value: `${changeArrow(change.pct)} ${formatPct(change.pct).replace(/^[+−]/, '')}`, spoken: spokenPct(change.pct) };
  if (change.state === 'no_amount_signal' && change.load?.unit === 'kg' && (change.load.up || change.load.down) && !(change.load.up && change.load.down))
    return change.load.up ? { value: '↑ Peso', spoken: 'subió el peso, con las mismas repeticiones' } : { value: '↓ Peso', spoken: 'bajó el peso, con las mismas repeticiones' };
  return null;
}

const amount = (value: number) => decimal.format(value);
/**
 * #533 · What a row shows as recorded, from the server's `shown`: «20 kg · 12 → 13 reps», «10 → 11 reps», «60 → 45 s», or for a
 * load change «50 → 55 kg · 10 reps». Plates keep their own unit. Null when there is nothing to show as recorded.
 */
export function shownText(change: PerformanceChange | undefined): string | null {
  const shown = change?.shown;
  if (!change || !shown) return null;
  const load = change.load?.unit === 'lingote' ? 'lingotes' : 'kg';
  if (change.state === 'measured') {
    if (change.basis === 'time') return `${amount(shown.from)} → ${amount(shown.to)} s`;
    if (change.basis === 'bodyweight_reps' || shown.anchor === null) return `${amount(shown.from)} → ${amount(shown.to)} reps`;
    return `${amount(shown.anchor)} ${load} · ${amount(shown.from)} → ${amount(shown.to)} reps`;
  }
  if (change.state === 'no_amount_signal' && shown.anchor !== null) return `${amount(shown.from)} → ${amount(shown.to)} ${load} · ${amount(shown.anchor)} reps`;
  return null;
}

/** The session's hero: the mean of its exercises measured at an equal condition, with how many entered. */
export function sessionHero(change: SessionChange | undefined): { value: string; caption: string; spoken: string } | null {
  if (!change || change.state !== 'measured' || change.pct === null) return null;
  const of = `${change.eligible} de ${change.total} ${change.total === 1 ? 'ejercicio' : 'ejercicios'}`;
  return { value: formatPct(change.pct), caption: `reps al mismo peso frente a la vez anterior · ${of}`, spoken: `${spokenPct(change.pct)}: repeticiones al mismo peso frente a la vez anterior, promedio de ${of}` };
}
/** Strict and partial measure different exercises of one session (they partition them): the session's change joins both. */
export function joinedChange(strict: SessionChange | undefined, partial: SessionChange | undefined): SessionChange | undefined {
  if (!strict && !partial) return undefined;
  const parts = [strict, partial].filter((row): row is SessionChange => !!row);
  const eligible = parts.reduce((sum, row) => sum + row.eligible, 0);
  const sum = parts.reduce((total, row) => total + (row.pct ?? 0) * row.eligible, 0);
  const add = (key: 'directions' | 'load') => ({ up: parts.reduce((s, r) => s + r[key].up, 0), same: parts.reduce((s, r) => s + r[key].same, 0), down: parts.reduce((s, r) => s + r[key].down, 0) });
  return { state: eligible ? 'measured' : 'no_eligible', pct: eligible ? Math.round((sum / eligible) * 10_000) / 10_000 : null, eligible, total: strict?.total ?? partial?.total ?? 0, directions: add('directions'), load: add('load') };
}

/** Up to ten measured results: what an exercise row draws, oldest first. Never padded with zeros. */
export function recentPoints(recent: { items: readonly { date: string | null; pct: number }[] } | undefined) {
  return (recent?.items ?? []).map(row => row.pct);
}

export type ArrivalFact = { key: string; label: string; value: string | null; spoken: string };
const grams = (value: number) => `${integer.format(Math.round(value))} g`;
const kcal = (value: number) => integer.format(Math.round(value));
function hoursText(hours: number) {
  const whole = Math.floor(hours), minutes = Math.round((hours - whole) * 60);
  return minutes === 60 ? `${whole + 1} h` : minutes ? `${whole} h ${String(minutes).padStart(2, '0')}` : `${whole} h`;
}
function sleepText(value: number, unit: string | null) {
  if (unit === 'min' || unit === 'minutos') return hoursText(value / 60);
  if (unit === 'h' || unit === 'horas') return hoursText(value);
  return `${decimal.format(value)}${unit ? ` ${unit}` : ''}`;
}
/** A day total, or null when it cannot be one: no meals, or a meal without that value (a partial sum). */
function dayTotal(nutrition: DayFact['context']['nutrition'] | undefined, key: 'calories' | 'proteinG') {
  if (!nutrition || nutrition[key].missing) return null;
  return nutrition[key].recorded;
}

/**
 * #533 · «Cómo llegaste»: six facts of one session, in a fixed order. A missing one says «Sin registrar» and never shows a zero.
 * Meals before the session count only with a checkable time; sleep only with its night declared.
 */
export function arrivalFacts(session: SessionFact, day: DayFact, metrics: InsightsSummary['metrics']): ArrivalFact[] {
  const fact = (key: string, label: string, value: string | null): ArrivalFact => ({ key, label, value, spoken: `${label}: ${value ?? 'sin registrar'}` });
  const carbs = session.context.carbsPre3h, last = session.context.preStart?.lastExplicitMeal;
  const lastValue = last && last.state === 'recorded' && !last.untimedInScope && !last.unverifiedInScope && last.hours !== null ? `hace ${hoursText(last.hours)}` : null;
  const previous = day.context.previousDay?.nutrition;
  const protein = dayTotal(previous, 'proteinG'), calories = dayTotal(previous, 'calories');
  const sleepMetric = metrics.find(metric => day.context.metrics.some(row => row.metricId === metric.id && row.sleepNight !== undefined));
  const sleep = sleepMetric ? day.context.metrics.find(row => row.metricId === sleepMetric.id && row.sleepNight === 'declared') : undefined;
  const energy = session.context.feelings.energyPre;
  // An ordinal answer, said in words as everywhere else: never «3 de 5».
  const energyValue = energy && (energy.timing === 'before_start' || energy.timing === 'before_first_set') ? capitalize(feelingWord('energy', { value: energy.value })) : null;
  return [
    fact('carbs', 'Carbos 3 h antes', carbs.state === 'recorded' && carbs.value !== null ? grams(carbs.value) : null),
    fact('last-meal', 'Última comida', lastValue),
    fact('protein-yesterday', 'Proteína ayer', protein === null ? null : grams(protein)),
    fact('kcal-yesterday', 'Kcal ayer', calories === null ? null : kcal(calories)),
    fact('sleep', 'Sueño', sleep && sleepMetric ? sleepText(sleep.value, sleepMetric.unit) : null),
    fact('energy', 'Energía', energyValue),
  ];
}

/** #533 · Relación. The group words: three for a direction, three apart that never count as one. */
export const GROUP_LABEL: Record<RelationGroup, string> = { up: 'Subió', same: 'Igual', down: 'Bajó', mixed: 'Mixta', load_only: 'Solo peso', not_compared: 'Sin comparar' };
const FACTOR_LABEL: Record<string, string> = {
  carbs_pre_3h: 'Carbos 3 h antes', last_meal_hours: 'Última comida', calories_day: 'Kcal del día', protein_previous_day: 'Proteína ayer',
  calories_previous_day: 'Kcal ayer', sleep_night_before: 'Sueño de la noche', energy_pre: 'Energía al empezar',
};
export function factorLabel(factor: Pick<RelationFactor, 'key' | 'metricId'>, metrics: readonly { id: string; name: string }[]) {
  if (FACTOR_LABEL[factor.key]) return FACTOR_LABEL[factor.key]!;
  const name = metrics.find(metric => metric.id === factor.metricId)?.name;
  return name ? `${name} ayer` : 'Métrica ayer';
}
/** A factor's value in its own unit: grams, kcal, hours, the 1–5 scale or the metric's unit. */
export function factorValue(factor: Pick<RelationFactor, 'key' | 'unit'>, value: number): string {
  if (factor.key === 'last_meal_hours') return hoursText(value);
  // A median of ordinal answers: a word, or the two words it falls between. Never a number on that scale.
  if (factor.key === 'energy_pre') return Number.isInteger(value) ? feelingWord('energy', { value }) : `entre ${feelingWord('energy', { value: Math.floor(value) })} y ${feelingWord('energy', { value: Math.ceil(value) })}`;
  if (factor.unit === 'g') return grams(value);
  if (factor.unit === 'kcal') return kcal(value);
  if (factor.key === 'sleep_night_before') return sleepText(value, factor.unit);
  return `${decimal.format(value)}${factor.unit ? ` ${factor.unit}` : ''}`;
}
/** One line under a factor: the two medians, or what is missing for one. */
export function factorSummary(factor: RelationFactor): string {
  const side = (stat: RelationFactor['groups']['up']) => stat.median === null ? (stat.valid ? 'faltan datos' : 'sin datos') : factorValue(factor, stat.median);
  return `${side(factor.groups.up)} · ${side(factor.groups.down)}`;
}
/** The fixed sentence of the detail. Only with three or more in each group, and only as a coincidence in the records. */
export function factorSentence(factor: RelationFactor, label: string): string | null {
  const { up, down } = factor.groups;
  if (up.median === null || down.median === null) return null;
  return `En tus registros, la mediana de «${label}» fue ${factorValue(factor, up.median)} en las sesiones que subieron y ${factorValue(factor, down.median)} en las que bajaron.`;
}

const COMPARED = new Set(['improved', 'observed_stable', 'declined', 'higher_record', 'same_record', 'lower_record']);
/**
 * #533 · The evidence screen's hero, from the signals it already shows: the same rule as the server's `change` (amount signals at an
 * equal condition with a positive reference, their mean), so the number matches the row that opened it.
 */
export function evidenceChange(item: Pick<ExerciseEvidence, 'evidence'>, result: string): number | null {
  if (!COMPARED.has(result)) return null;
  const based = item.evidence.filter(signal => (signal.kind === 'reps_at_load' || signal.kind === 'bodyweight_reps' || signal.kind === 'time') && signal.reference > 0);
  if (!based.length) return null;
  return Math.round((based.reduce((sum, signal) => sum + signal.delta / signal.reference, 0) / based.length) * 1_000_000) / 10_000;
}
/** Both sessions' sets side by side, in the order they were recorded, with the change of reps where the load is the same. */
export function sideBySide(current: readonly { key: string; label: string; value: string; load: number | null; amount: number | null; used: boolean }[], reference: readonly { value: string; load: number | null; amount: number | null }[]) {
  return Array.from({ length: Math.max(current.length, reference.length) }, (_, index) => {
    const now = current[index], before = reference[index];
    const delta = now && before && now.load === before.load && now.amount !== null && before.amount !== null ? now.amount - before.amount : null;
    return { key: now?.key ?? `reference-${index}`, number: index + 1, before: before?.value ?? '—', now: now?.value ?? '—', used: !!now?.used, change: delta,
      beforeAmount: before?.amount ?? null, nowAmount: now?.amount ?? null,
      delta: delta === null ? '' : delta === 0 ? '=' : `${delta > 0 ? '+' : '−'}${Math.abs(delta)}` };
  });
}

/**
 * «Comparaciones más claras» · One sentence that says why the exercise reads as it does, from the signals behind it. A set that went
 * up while the best set stayed equal is said, so it never contradicts the «=». A load step says it is not a percentage.
 */
const ORDINAL_DONE = new Set(['improved', 'higher_record']), ORDINAL_DOWN = new Set(['declined', 'lower_record']), ORDINAL_SAME = new Set(['observed_stable', 'same_record']);
export function evidenceSentence(item: Pick<ExerciseEvidence, 'evidence'>, result: string, pairs: readonly { number: number; change: number | null }[], unit: string | null | undefined): string | null {
  const load = unit === 'lingotes' ? 'lingotes' : 'kg';
  const reps = item.evidence.filter(signal => signal.kind === 'reps_at_load');
  const loads = item.evidence.filter(signal => signal.kind === 'load_at_reps');
  const more = pairs.filter(pair => pair.change !== null && pair.change > 0);
  const extra = ORDINAL_SAME.has(result) && more.length ? ` En la serie ${more[0]!.number} hiciste ${more[0]!.change === 1 ? 'una más' : `${more[0]!.change} más`}.` : '';
  if (reps.length) {
    const best = reps.reduce((top, signal) => ((signal.anchor ?? 0) > (top.anchor ?? 0) ? signal : top));
    const where = reps.length === 1 ? `Todo a ${amount(best.anchor ?? 0)} ${load}.` : `Con ${amount(best.anchor ?? 0)} ${load},`;
    const said = ORDINAL_SAME.has(result) ? `tu mejor serie fue igual (${amount(best.current)} reps), así que da =.`
      : ORDINAL_DONE.has(result) ? `tu mejor serie pasó de ${amount(best.reference)} a ${amount(best.current)} reps.`
      : ORDINAL_DOWN.has(result) ? `tu mejor serie pasó de ${amount(best.reference)} a ${amount(best.current)} reps.` : null;
    if (!said) return null;
    return `${where} ${reps.length === 1 ? capitalize(said) : said}${extra}`;
  }
  const time = item.evidence.find(signal => signal.kind === 'time'), body = item.evidence.find(signal => signal.kind === 'bodyweight_reps');
  if (time) return `Tu mejor tiempo pasó de ${amount(time.reference)} a ${amount(time.current)} s.${extra}`;
  if (body) return `Tu mejor serie pasó de ${amount(body.reference)} a ${amount(body.current)} reps.${extra}`;
  if (loads.length && loads.every(signal => signal.delta > 0)) return 'Con más peso y las mismas reps. No se compara en %, porque el peso cambió.';
  if (loads.length && loads.every(signal => signal.delta < 0)) return 'Con menos peso y las mismas reps. No se compara en %, porque el peso cambió.';
  return null;
}
/** The load step of an exercise whose only signal is the load: «27,5 → 30 kg». Null otherwise. */
export function loadStep(item: Pick<ExerciseEvidence, 'evidence'>, unit: string | null | undefined): { up: boolean; text: string } | null {
  if (item.evidence.some(signal => signal.kind !== 'load_at_reps')) return null;
  const loads = item.evidence.filter(signal => signal.kind === 'load_at_reps');
  if (!loads.length || !(loads.every(signal => signal.delta > 0) || loads.every(signal => signal.delta < 0))) return null;
  const top = loads.reduce((best, signal) => (signal.current > best.current ? signal : best));
  return { up: top.delta > 0, text: `${amount(top.reference)} → ${amount(top.current)} ${unit === 'lingotes' ? 'lingotes' : 'kg'}` };
}
