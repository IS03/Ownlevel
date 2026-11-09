import { FEELING_LABELS } from '@/api/training-feelings';
import type { FeelingOutcomeSummary } from '@/api/performance-insights';
import { dayLabel } from './insights-model';

/**
 * Energy and fatigue at the end, described as recorded: how many sessions ended at each answer, apart by how they started.
 * Counts only: no average, score, difference or percentage, and no association (none is published yet).
 */
const NAME = { energy: 'Energía', fatigue: 'Fatiga' } as const;
const word = (kind: FeelingOutcomeSummary['kind'], value: number) => FEELING_LABELS[kind][value - 1]!.toLocaleLowerCase('es-AR');
const sessions = (count: number) => count === 1 ? '1 sesión' : `${count} sesiones`;
const total = (posts: readonly number[]) => posts.reduce((sum, value) => sum + value, 0);

/** "muy alta 2 · alta 6 · media 3": every answer that occurred, in scale order, with its count. Nothing is left out or merged. */
export function postsText(kind: FeelingOutcomeSummary['kind'], posts: readonly number[]) {
  return posts.map((count, index) => count ? `${word(kind, index + 1)} ${count}` : null).filter(Boolean).reverse().join(' · ');
}
export const outcomeTitle = (summary: FeelingOutcomeSummary) => `${NAME[summary.kind]} al terminar`;

/** One row per way of starting that occurred, highest first, then those that cannot be framed by how they started. */
export function priorRows(summary: FeelingOutcomeSummary) {
  const rows = [...summary.byPrior].reverse().filter(row => total(row.posts)).map(row => {
    const label = `Antes: ${word(summary.kind, row.prior)}`, name = NAME[summary.kind].toLocaleLowerCase('es-AR');
    return { key: `prior-${row.prior}`, label, value: sessions(total(row.posts)), detail: `Al terminar: ${postsText(summary.kind, row.posts)}`,
      spoken: `${NAME[summary.kind]} ${word(summary.kind, row.prior)} antes de entrenar: ${sessions(total(row.posts))}. Al terminar, ${name} ${postsText(summary.kind, row.posts).replaceAll(' · ', ', ')}` };
  });
  const loose = total(summary.priorNotComparable.posts);
  if (loose) {
    const { reasons } = summary.priorNotComparable;
    const why = [reasons.not_recorded ? `${reasons.not_recorded} sin respuesta antes` : null, reasons.unreadable ? `${reasons.unreadable} que no se pudo leer` : null,
      reasons.capture_unknown ? `${reasons.capture_unknown} sin hora de respuesta` : null, reasons.after_first_set ? `${reasons.after_first_set} respondida después de empezar` : null].filter(Boolean).join(', ');
    rows.push({ key: 'prior-none', label: 'Antes: sin una respuesta que sirva', value: sessions(loose), detail: `Al terminar: ${postsText(summary.kind, summary.priorNotComparable.posts)}. ${why}.`,
      spoken: `Sin una respuesta antes que sirva: ${sessions(loose)}. Al terminar, ${postsText(summary.kind, summary.priorNotComparable.posts).replaceAll(' · ', ', ')}. ${why}` });
  }
  return rows;
}

/** What is not in the rows above, and why: every session is accounted for. */
export function asideRows(summary: FeelingOutcomeSummary) {
  const { sessions: s, capture } = summary;
  return [
    { key: 'late', label: 'Respondidas más tarde', value: capture.late, detail: 'Más de 2 horas después de terminar' },
    { key: 'unknown', label: 'Sin hora de respuesta', value: capture.captureUnknown },
    { key: 'before', label: 'Con una hora anterior al inicio', value: capture.beforeStart },
    { key: 'unreadable', label: 'No se pudieron leer', value: s.unreadable },
    { key: 'instrument', label: 'Con otra escala', value: s.otherInstrument },
    { key: 'none', label: 'Sin respuesta al terminar', value: s.notRecorded },
    ...(summary.legacyEnergyOnly ? [{ key: 'legacy', label: 'Solo con el registro anterior de energía', value: summary.legacyEnergyOnly, detail: 'No dice el momento, así que no se cuenta como energía al terminar' }] : []),
  ].filter(row => row.value).map(row => ({ ...row, value: sessions(row.value) }));
}

export function scopeText(summary: FeelingOutcomeSummary) {
  const counted = summary.capture.atFinish;
  if (!counted) return 'Todavía no hay respuestas al terminar para mostrar.';
  const span = summary.firstDate && summary.lastDate ? summary.firstDate === summary.lastDate ? `, el ${dayLabel(summary.firstDate).toLocaleLowerCase('es-AR')}` : `, del ${dayLabel(summary.firstDate).toLocaleLowerCase('es-AR')} al ${dayLabel(summary.lastDate).toLocaleLowerCase('es-AR')}` : '';
  return `${sessions(counted)} con respuesta al terminar, de ${sessions(summary.sessions.completed)} terminadas${span}.`;
}
export const NOT_PUBLISHED = 'Esto describe tus registros. Las asociaciones estadísticas siguen sin publicarse: falta validar esa búsqueda.';
