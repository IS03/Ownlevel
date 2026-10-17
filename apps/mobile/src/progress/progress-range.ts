import { isNutritionDate } from '@/api/nutrition-day';
import type { ProgressQuery } from '@/api/progress';

/**
 * Progreso's period, shared by every Progreso screen (bocetos R1–R5).
 * Week, month, 3/6 months and year are calendar ranges (Monday–Sunday, 1st–last day, January–December),
 * never beyond today. They travel to the server as `custom` ranges; the comparison is opt-in.
 */
export type ProgressUnit = 'week' | '2w' | '3w' | 'month' | '3m' | '6m' | 'year' | 'custom';
export type DateRange = { start: string; end: string };
export type ProgressCompare = { kind: 'none' } | { kind: 'previous' } | { kind: 'last_year' } | { kind: 'custom'; range: DateRange };
export type ProgressRangeState = { unit: ProgressUnit; anchor: string; custom: DateRange | null; compare: ProgressCompare };

export const PROGRESS_UNITS: { value: ProgressUnit; label: string }[] = [
  { value: 'week', label: 'Semana' }, { value: '2w', label: '2 semanas' }, { value: '3w', label: '3 semanas' }, { value: 'month', label: 'Mes' }, { value: '3m', label: '3 meses' },
  { value: '6m', label: '6 meses' }, { value: 'year', label: 'Año' }, { value: 'custom', label: 'Personalizado' },
];
export const PROGRESS_MAX_DAYS = 366;

const parse = (d: string) => new Date(`${d}T12:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);
export const addDays = (d: string, n: number) => { const x = parse(d); x.setUTCDate(x.getUTCDate() + n); return iso(x); };
/** Month arithmetic clamps the day (31 March − 1 month = 28/29 February). */
export function addMonths(d: string, n: number) {
  const x = parse(d), day = x.getUTCDate();
  x.setUTCDate(1); x.setUTCMonth(x.getUTCMonth() + n);
  const last = new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth() + 1, 0, 12)).getUTCDate();
  x.setUTCDate(Math.min(day, last)); return iso(x);
}
export const daysBetween = (a: string, b: string) => Math.round((parse(b).getTime() - parse(a).getTime()) / 86_400_000) + 1;
const monthStart = (d: string) => `${d.slice(0, 7)}-01`;
const monthEnd = (d: string) => addDays(addMonths(monthStart(d), 1), -1);
const minDate = (a: string, b: string) => a < b ? a : b;

export function initialProgressRange(today: string): ProgressRangeState {
  return { unit: 'month', anchor: today, custom: null, compare: { kind: 'none' } };
}
const unitWeeks = (unit: ProgressUnit) => unit === 'week' ? 1 : unit === '2w' ? 2 : unit === '3w' ? 3 : 0;
/** The whole calendar range of the unit containing the anchor (may extend past today). */
export function calendarRange(unit: Exclude<ProgressUnit, 'custom'>, anchor: string): DateRange {
  const weeks = unitWeeks(unit);
  // Whole Monday–Sunday weeks: the anchor's week and the ones right before it.
  if (weeks) { const offset = (parse(anchor).getUTCDay() + 6) % 7; const monday = addDays(anchor, -offset); return { start: addDays(monday, -7 * (weeks - 1)), end: addDays(monday, 6) }; }
  if (unit === 'month') return { start: monthStart(anchor), end: monthEnd(anchor) };
  if (unit === 'year') return { start: `${anchor.slice(0, 4)}-01-01`, end: `${anchor.slice(0, 4)}-12-31` };
  const months = unit === '3m' ? 3 : 6;
  return { start: monthStart(addMonths(anchor, 1 - months)), end: monthEnd(anchor) };
}
/** What is actually read: the calendar range clipped to today. */
export function progressRange(state: ProgressRangeState, today: string): DateRange {
  const full = state.unit === 'custom' && state.custom ? state.custom : calendarRange(state.unit === 'custom' ? 'month' : state.unit, state.anchor);
  return { start: full.start, end: minDate(full.end, today) };
}
const unitMonths = (unit: ProgressUnit) => unit === 'month' ? 1 : unit === '3m' ? 3 : unit === '6m' ? 6 : unit === 'year' ? 12 : 0;
/** ‹ › move by one unit. Never into a range that starts after today. */
export function stepProgressRange(state: ProgressRangeState, direction: -1 | 1, today: string): ProgressRangeState | null {
  if (state.unit === 'custom') return null;
  const weeks = unitWeeks(state.unit);
  const anchor = weeks ? addDays(state.anchor, 7 * weeks * direction) : addMonths(state.anchor, unitMonths(state.unit) * direction);
  if (calendarRange(state.unit, anchor).start > today) return null;
  return { ...state, anchor: direction === 1 && anchor > today ? today : anchor };
}
/**
 * Personalizado's "anterior / siguiente": one unit back or forward, keeping the unit; a custom range moves by its own
 * length. Never into a range that starts after today (a forward custom range is clipped to today).
 */
export function shiftProgressRange(state: ProgressRangeState, direction: -1 | 1, today: string): ProgressRangeState | null {
  if (state.unit !== 'custom' || !state.custom) return stepProgressRange(state, direction, today);
  const length = daysBetween(state.custom.start, state.custom.end);
  const start = addDays(state.custom.start, length * direction);
  if (start > today) return null;
  const end = minDate(addDays(start, length - 1), today);
  return { ...state, custom: { start, end }, anchor: end };
}
/** True when the period being read reaches today (the live one). */
export const isCurrentProgressRange = (state: ProgressRangeState, today: string) => progressRange(state, today).end === today;
/** "Volver a hoy": the same unit around today (a custom range goes back to the month). */
export const currentProgressRange = (state: ProgressRangeState, today: string): ProgressRangeState =>
  ({ ...state, unit: state.unit === 'custom' ? 'month' : state.unit, anchor: today, custom: null });
const SHIFT_NAMES: Record<ProgressUnit, [string, boolean]> = {
  week: ['Semana', false], '2w': ['2 semanas', true], '3w': ['3 semanas', true], month: ['Mes', false], '3m': ['3 meses', true], '6m': ['6 meses', true], year: ['Año', false], custom: ['Período', false],
};
/** "Semana anterior", "3 meses anteriores", "Mes siguiente". */
export function shiftLabel(unit: ProgressUnit, direction: -1 | 1): string {
  const [name, plural] = SHIFT_NAMES[unit];
  const word = direction === -1 ? (plural ? 'anteriores' : 'anterior') : (plural ? 'siguientes' : 'siguiente');
  return `${name} ${word}`;
}

/**
 * The comparison range B. "Período anterior" and "Año pasado" shift the calendar range, keeping the same elapsed
 * span when the current range is still in progress (1–15 Oct → 1–15 Sep), so a partial month is never set against a full one.
 */
export function compareRange(state: ProgressRangeState, today: string): DateRange | null {
  const c = state.compare;
  if (c.kind === 'none') return null;
  if (c.kind === 'custom') return c.range;
  const current = progressRange(state, today), length = daysBetween(current.start, current.end);
  if (state.unit === 'custom') return c.kind === 'previous'
    ? { start: addDays(current.start, -length), end: addDays(current.start, -1) }
    : { start: addMonths(current.start, -12), end: addMonths(current.end, -12) };
  const full = calendarRange(state.unit, state.anchor);
  const otherAnchor = c.kind === 'last_year' ? addMonths(state.anchor, -12)
    : unitWeeks(state.unit) ? addDays(state.anchor, -7 * unitWeeks(state.unit)) : addMonths(state.anchor, -unitMonths(state.unit));
  const other = calendarRange(state.unit, otherAnchor);
  if (current.end === full.end) return other;
  return { start: other.start, end: minDate(addDays(other.start, length - 1), other.end) };
}
export function progressRequest(state: ProgressRangeState, today: string): { query: ProgressQuery; compare: DateRange | null } {
  const range = progressRange(state, today);
  return { query: { period: 'custom', from: range.start, to: range.end }, compare: compareRange(state, today) };
}

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const dayOf = (d: string) => Number(d.slice(8));
const monthOf = (d: string) => Number(d.slice(5, 7)) - 1;
/** "1–15 sep", "28 sep – 4 oct", "1 dic 2025 – 5 ene 2026": short, for chips and comparison text. */
export function shortRange(r: DateRange, today: string): string {
  const year = (d: string) => d.slice(0, 4) !== today.slice(0, 4) ? ` ${d.slice(0, 4)}` : '';
  if (r.start === r.end) return `${dayOf(r.start)} ${SHORT[monthOf(r.start)]}${year(r.start)}`;
  if (r.start.slice(0, 7) === r.end.slice(0, 7)) return `${dayOf(r.start)}–${dayOf(r.end)} ${SHORT[monthOf(r.end)]}${year(r.end)}`;
  const crossYear = r.start.slice(0, 4) !== r.end.slice(0, 4);
  return `${dayOf(r.start)} ${SHORT[monthOf(r.start)]}${crossYear ? ` ${r.start.slice(0, 4)}` : ''} – ${dayOf(r.end)} ${SHORT[monthOf(r.end)]}${crossYear || year(r.end) ? ` ${r.end.slice(0, 4)}` : ''}`;
}
/** The stepper's title and subtitle: "Octubre 2026" · "del 1 al 15 · en curso". */
export function rangeTitle(state: ProgressRangeState, today: string): { title: string; subtitle: string } {
  const r = progressRange(state, today), live = r.end === today;
  const days = daysBetween(r.start, r.end);
  const tail = live ? ' · en curso' : '';
  if (state.unit === 'month') {
    const full = calendarRange('month', state.anchor);
    return { title: `${cap(MONTHS[monthOf(r.start)])} ${r.start.slice(0, 4)}`, subtitle: r.end === full.end ? `${days} días` : `del 1 al ${dayOf(r.end)}${tail}` };
  }
  if (state.unit === 'year') return { title: r.start.slice(0, 4), subtitle: live ? `hasta el ${dayOf(r.end)} de ${MONTHS[monthOf(r.end)]}${tail}` : `${days} días` };
  if (state.unit === 'week') return { title: `Semana del ${shortRange(calendarRange('week', state.anchor), today)}`, subtitle: live ? `hasta hoy${tail}` : '7 días' };
  return { title: cap(shortRange(r, today)), subtitle: `${days} días${tail}` };
}
const CURRENT_NAMES: Record<Exclude<ProgressUnit, 'custom'>, string> = {
  week: 'Esta semana', '2w': 'Últimas 2 semanas', '3w': 'Últimas 3 semanas', month: 'Este mes', '3m': '3 meses en curso', '6m': '6 meses en curso', year: 'Este año',
};
/**
 * What the collapsed bar says you are looking at: "Este mes", "Mes anterior", "Semana anterior"; further back, the
 * period itself ("Agosto 2026"); a custom range, its dates ("17 sep – 16 oct").
 */
export function rangeShortLabel(state: ProgressRangeState, today: string): string {
  if (state.unit === 'custom') return shortRange(progressRange(state, today), today);
  if (isCurrentProgressRange(state, today)) return CURRENT_NAMES[state.unit];
  const ahead = stepProgressRange(state, 1, today);
  if (ahead && isCurrentProgressRange(ahead, today)) return shiftLabel(state.unit, -1);
  return rangeTitle(state, today).title;
}
/** The overview's heading for the chosen period: "Tu octubre", "Tu semana", "Tus 3 meses", "Tu 2026", "Tu período". */
export function periodHeading(state: ProgressRangeState, today: string): string {
  const r = progressRange(state, today);
  if (state.unit === 'month') return `Tu ${MONTHS[monthOf(r.start)]}`;
  if (state.unit === 'week') return 'Tu semana';
  if (state.unit === '2w') return 'Tus 2 semanas';
  if (state.unit === '3w') return 'Tus 3 semanas';
  if (state.unit === '3m') return 'Tus 3 meses';
  if (state.unit === '6m') return 'Tus 6 meses';
  if (state.unit === 'year') return `Tu ${r.start.slice(0, 4)}`;
  return 'Tu período';
}
export function compareLabel(state: ProgressRangeState, today: string): string | null {
  const r = compareRange(state, today);
  return r ? shortRange(r, today) : null;
}

/** External report links set A once; exact calendar weeks/months keep their native controls. */
export function progressStateForRange(from: unknown, to: unknown, state: ProgressRangeState, today: string): ProgressRangeState | null {
  if (!isNutritionDate(from) || !isNutritionDate(to) || from > to || from > today || daysBetween(from, to) > PROGRESS_MAX_DAYS) return null;
  const range = { start: from, end: to > today ? today : to };
  for (const unit of ['week', 'month'] as const) {
    const candidate = { ...state, unit, anchor: from, custom: null };
    const calendar = progressRange(candidate, today);
    if (calendar.start === range.start && calendar.end === range.end) return candidate;
  }
  return { ...state, unit: 'custom', anchor: range.start, custom: range };
}
