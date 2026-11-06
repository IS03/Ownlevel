import { FEELING_LABELS } from '@/api/training-feelings';

/**
 * Energy and fatigue as the ordinal answers they are: "Energía: baja → alta", before and after. Never a number, an average or
 * a combined score. A side can be unanswered or unreadable, and says which: neither becomes the other, nor a value.
 */
export type FeelingSide = { value: number } | 'missing' | 'unreadable';
export type FeelingKind = 'energy' | 'fatigue';
const NAME: Record<FeelingKind, string> = { energy: 'Energía', fatigue: 'Fatiga' };

export function feelingWord(kind: FeelingKind, side: FeelingSide) {
  if (side === 'missing') return 'sin registrar';
  if (side === 'unreadable') return 'no se pudo leer';
  const label = FEELING_LABELS[kind][side.value - 1];
  return label ? label.toLocaleLowerCase('es-AR') : 'no se pudo leer';
}
export function feelingTransition(kind: FeelingKind, before: FeelingSide, after: FeelingSide) {
  const pre = feelingWord(kind, before), post = feelingWord(kind, after);
  return { label: NAME[kind], value: `${pre} → ${post}`, spoken: `${NAME[kind]}: ${pre} antes de entrenar, ${post} al terminar` };
}
