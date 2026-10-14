import type { SessionDetailDto } from '@/api/active-session';
import type { SessionCorrectionInput, TrainingHistoryMark, TrainingHistorySession } from '@/api/training-history';
import { formatDuration, formatTimeRange } from '@/home/format';
import { parseDraftNumber } from './active-session-model';

// M3.4-3 — presentation for history/day/exercise history and the correction draft.
// Only formats server truth: missing stays missing, never 0.
const decimal = (value: number) => String(Math.round(value * 10) / 10).replace('.', ',');
export function markLabel(mark: TrainingHistoryMark | null): string {
  if (!mark) return '—';
  if (mark.weightKg !== null && mark.reps !== null) return `${decimal(mark.weightKg)} kg × ${decimal(mark.reps)}`;
  if (mark.weightKg !== null) return `${decimal(mark.weightKg)} kg`;
  if (mark.reps !== null) return `${decimal(mark.reps)} reps`;
  return '—';
}
export function plural(value: number, singular: string, pluralForm = `${singular}s`) { return `${value} ${value === 1 ? singular : pluralForm}`; }
export function markMetadata(completedSets: number, rirValues: readonly number[]): string {
  return [plural(completedSets, 'serie'), rirValues.length ? `RIR ${rirValues.join(' / ')}` : null].filter(Boolean).join(' · ');
}
const volumeFormatter = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });
export function volumeLabel(volumeKg: number | null): string | null {
  return volumeKg === null || !Number.isFinite(volumeKg) || volumeKg < 0 ? null : `${volumeFormatter.format(volumeKg)} kg`;
}
function noonUtc(date: string) { const [year, month, day] = date.split('-').map(Number); return new Date(Date.UTC(year, month - 1, day, 12)); }
export function dayHeading(date: string): string {
  const label = new Intl.DateTimeFormat('es-AR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(noonUtc(date));
  return label.charAt(0).toUpperCase() + label.slice(1);
}
export function shortDate(date: string): string {
  return new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(noonUtc(date)).replace('.', '');
}
export function sessionTiming(session: Pick<TrainingHistorySession, 'startedAt' | 'endedAt' | 'durationMilliseconds'>): string {
  return [formatTimeRange(session.startedAt, session.endedAt), formatDuration(session.durationMilliseconds)].filter(Boolean).join(' · ');
}
export function sessionTotals(session: Pick<TrainingHistorySession, 'exercisesCompleted' | 'completedSets' | 'volumeKg'>): string {
  const volume = volumeLabel(session.volumeKg);
  return [plural(session.exercisesCompleted, 'ejercicio'), plural(session.completedSets, 'serie'), volume ?? 'Volumen sin registrar'].join(' · ');
}
/** Newest day first; within a day, newest start first (Web grouping). */
export function groupSessionsByDate(sessions: readonly TrainingHistorySession[]) {
  const groups = new Map<string, TrainingHistorySession[]>();
  for (const session of sessions) groups.set(session.logDate, [...(groups.get(session.logDate) ?? []), session]);
  return [...groups.entries()].sort(([left], [right]) => right.localeCompare(left))
    .map(([date, items]) => ({ date, sessions: [...items].sort((left, right) => right.startedAt.localeCompare(left.startedAt)) }));
}
/** Appends a page without duplicating sessions already shown. */
export function mergeHistoryPage(current: readonly TrainingHistorySession[], next: readonly TrainingHistorySession[]) {
  const seen = new Set(current.map(session => session.id));
  return [...current, ...next.filter(session => !seen.has(session.id))];
}
export function addMonths(month: string, delta: number): string {
  const [year, monthNumber] = month.split('-').map(Number);
  const date = new Date(Date.UTC(year, monthNumber - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

// Historical correction: only actuals and summary/notes (Web parity). Date,
// duration, routine, exercises, targets, checks and progression stay frozen.
export type CorrectionDraft = {
  energyLevel: number | null;
  performanceLevel: number | null;
  painLevel: number | null;
  notes: string;
  exercises: { id: string; sets: { setNumber: number; weight: string; reps: string }[] }[];
};
const text = (value: number | null) => value === null ? '' : String(value).replace('.', ',');
export function correctionDraft(detail: SessionDetailDto): CorrectionDraft {
  const { metadata } = detail.session;
  return {
    energyLevel: metadata.energyLevel, performanceLevel: metadata.performanceLevel, painLevel: metadata.painLevel, notes: metadata.notes ?? '',
    exercises: detail.exercises.map(exercise => ({ id: exercise.id,
      sets: exercise.payload.sets.map(set => ({ setNumber: set.setNumber, weight: text(set.actualWeightKg), reps: text(set.actualReps) })) })),
  };
}
/** Builds the full correction request; throws a user-facing message when a value is invalid. */
export function correctionInput(detail: SessionDetailDto, draft: CorrectionDraft, idempotencyKey: string): SessionCorrectionInput {
  const exercises = detail.exercises.map(exercise => {
    const edited = draft.exercises.find(item => item.id === exercise.id);
    return {
      sessionExerciseId: exercise.id, expectedUpdatedAt: exercise.updatedAt, notes: exercise.payload.notes || null,
      sets: exercise.payload.sets.map(set => {
        const row = edited?.sets.find(item => item.setNumber === set.setNumber);
        const where = `de la serie ${set.setNumber} de ${exercise.nameSnapshot}`;
        return { setNumber: set.setNumber, notes: set.notes || null,
          actualWeightKg: row ? parseDraftNumber(row.weight, `El peso ${where}`, 9999.99, false) : set.actualWeightKg,
          actualReps: row ? parseDraftNumber(row.reps, `Las reps ${where}`, 1000, true) : set.actualReps };
      }),
    };
  });
  return {
    expectedSessionUpdatedAt: detail.session.updatedAt,
    // Fields Mobile does not edit (pain note, treadmill) are preserved verbatim.
    metadata: { ...detail.session.metadata, energyLevel: draft.energyLevel, performanceLevel: draft.performanceLevel,
      painLevel: draft.painLevel, notes: draft.notes.trim() ? draft.notes : null },
    exercises, idempotencyKey,
  };
}
export function correctionIsDirty(detail: SessionDetailDto, draft: CorrectionDraft): boolean {
  return JSON.stringify(correctionDraft(detail)) !== JSON.stringify(draft);
}

// M9 history redesign (HI1–HI5) — presentation helpers. Server truth only.
const capital = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);
/** "Viernes 9"; adds the month outside the current one and the year outside the current year. */
export function historyDayLabel(date: string, today: string): string {
  const sameYear = date.slice(0, 4) === today.slice(0, 4), sameMonth = sameYear && date.slice(0, 7) === today.slice(0, 7);
  const label = new Intl.DateTimeFormat('es-AR', { weekday: 'long', day: 'numeric', ...(sameMonth ? {} : { month: 'long' }), ...(sameYear ? {} : { year: 'numeric' }), timeZone: 'UTC' }).format(noonUtc(date));
  return capital(label.replace(',', ''));
}
/** Right side of a day header: "2 sesiones · 1 h 36 min" (count only when more than one; unknown durations stay out). */
export function dayTotalsLabel(sessions: readonly Pick<TrainingHistorySession, 'durationMilliseconds'>[]): string {
  const known = sessions.map(session => session.durationMilliseconds).filter((value): value is number => value !== null);
  const duration = known.length ? formatDuration(known.reduce((total, value) => total + value, 0)) : null;
  return [sessions.length > 1 ? plural(sessions.length, 'sesión', 'sesiones') : null, duration].filter(Boolean).join(' · ');
}
export function startTime(iso: string): string {
  return new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso));
}
/** "14:40 · 1 h 28 min" for a session row. */
export function sessionRowTiming(session: Pick<TrainingHistorySession, 'startedAt' | 'durationMilliseconds'>): string {
  return [startTime(session.startedAt), formatDuration(session.durationMilliseconds)].filter(Boolean).join(' · ');
}
/** "5 – 11 oct" (or "29 sep – 5 oct") for a Monday-first week. */
export function weekRangeLabel(monday: string): string {
  const sunday = shiftDay(monday, 6);
  const day = (date: string) => String(Number(date.slice(8)));
  return monday.slice(0, 7) === sunday.slice(0, 7) ? `${day(monday)} – ${shortDate(sunday)}` : `${shortDate(monday)} – ${shortDate(sunday)}`;
}
export function shiftDay(date: string, days: number): string {
  const base = noonUtc(date); base.setUTCDate(base.getUTCDate() + days); return base.toISOString().slice(0, 10);
}
export function mondayOf(date: string): string { return shiftDay(date, -((noonUtc(date).getUTCDay() + 6) % 7)); }
/** "Mié 7 oct" for the finished-session subtitle. */
export function compactWeekdayDate(date: string): string {
  return capital(new Intl.DateTimeFormat('es-AR', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(noonUtc(date)).replace(/\./g, '').replace(',', ''));
}
/** Unit for a weight mode's chart axis; null = no weight to chart (bodyweight). */
export function weightModeUnit(mode: string | null): string | null {
  if (mode === 'Peso corporal') return null;
  return mode === 'Lingotes (no kg)' ? 'placas' : mode === 'Tiempo (segundos)' ? 's' : 'kg';
}
export type HistoryBar = { sessionId: string; date: string; value: number | null };
/** Best set per session, oldest → newest, up to 8. A session without a weight is a gap, never a 0 bar. */
export function bestSetBars(sessions: readonly { sessionId: string; logDate: string; mark: TrainingHistoryMark | null }[], limit = 8): HistoryBar[] {
  return sessions.slice(0, limit).map(session => ({ sessionId: session.sessionId, date: session.logDate, value: session.mark?.weightKg ?? null })).reverse();
}
export const sameMark = (left: TrainingHistoryMark | null, right: TrainingHistoryMark | null) =>
  left !== null && right !== null && left.weightKg === right.weightKg && left.reps === right.reps;
