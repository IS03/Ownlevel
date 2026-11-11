import { QUICK_PINS_MAX, type QuickOption, type QuickPinsSnapshot, type QuickPinState } from '@/api/nutrition-quick';
import { searchable } from './quick-model';

/**
 * #479 C · Rápido's library, pure: saved meals A–Z (Spanish order, accents and case ignored, ties by id so it never moves),
 * grouped by initial; one search over every active saved meal; the pinned rows in the person's order.
 *
 * The order of the INITIALS is explicit, not the platform collator's (#479 D1): Hermes on iOS compares 'N' and 'Ñ' as equal at
 * base sensitivity (measured on the simulator), which interleaves Ñ words with N words and repeats sections. The collator only
 * orders the names inside one initial.
 */
const collator = new Intl.Collator('es', { sensitivity: 'base', numeric: true });
/** Index letters in Spanish alphabetical order; digits and symbols go first under «#». */
const INITIALS = '#ABCDEFGHIJKLMNÑOPQRSTUVWXYZ';
/** The index letter of a name: A–Z or Ñ, without accents; digits and symbols go under «#». */
export function initialOf(name: string) {
  const first = name.trim().charAt(0).toLocaleUpperCase('es-AR');
  if (first === 'Ñ') return 'Ñ';
  const base = first.normalize('NFD').replace(/\p{Diacritic}/gu, '');
  return /^[A-Z]$/.test(base) ? base : '#';
}
export function sortAZ(items: readonly QuickOption[]): QuickOption[] {
  // The initial is computed once per meal, not once per comparison.
  return items.map(option => ({ option, name: option.name.trim(), rank: INITIALS.indexOf(initialOf(option.name)) }))
    .sort((a, b) => a.rank - b.rank || collator.compare(a.name, b.name) || (a.option.source.id < b.option.source.id ? -1 : a.option.source.id > b.option.source.id ? 1 : 0))
    .map(entry => entry.option);
}
export type LibrarySection = { key: string; title: string; data: QuickOption[] };
/** Each saved meal once (by id), in A–Z sections: one section per initial, in index order, whatever the collator does. */
export function librarySections(items: readonly QuickOption[]): LibrarySection[] {
  const byInitial = new Map<string, QuickOption[]>(), seen = new Set<string>();
  for (const option of sortAZ(items)) {
    if (seen.has(option.source.id)) continue;
    seen.add(option.source.id);
    const letter = initialOf(option.name), group = byInitial.get(letter);
    if (group) group.push(option); else byInitial.set(letter, [option]);
  }
  return [...byInitial].map(([key, data]) => ({ key, title: key, data }));
}
/** Every active saved meal whose name or description matches (accents and case ignored), once each, A–Z. */
export function searchLibrary(items: readonly QuickOption[], query: string): QuickOption[] {
  const needle = searchable(query.trim());
  if (!needle) return [];
  const seen = new Set<string>();
  return sortAZ(items).filter(option => {
    if (seen.has(option.source.id) || !searchable(`${option.name} ${option.description ?? ''}`).includes(needle)) return false;
    seen.add(option.source.id); return true;
  });
}

/** A pinned place: an active meal that can be added, or a place still taken by a meal that is not offered now. */
export type PinnedRow = { kind: 'meal'; id: string; option: QuickOption } | { kind: 'unavailable'; id: string; state: Exclude<QuickPinState, 'active'> | 'unknown' };
/**
 * The pinned rows for the ids shown (the confirmed list, or the person's own change while it is unconfirmed). An archived or
 * deleted meal keeps its place and is never offered for adding; an id the person just chose is active in `saved`.
 */
export function pinnedRows(ids: readonly string[], saved: readonly QuickOption[], confirmed: QuickPinsSnapshot | null): PinnedRow[] {
  const byId = new Map(saved.map(option => [option.source.id, option]));
  const states = new Map(confirmed?.items.map(item => [item.id, item.state]) ?? []);
  return ids.map(id => {
    const option = byId.get(id);
    if (option) return { kind: 'meal', id, option };
    const state = states.get(id);
    return { kind: 'unavailable', id, state: state === 'archived' || state === 'deleted' ? state : 'unknown' };
  });
}
export const pinsFull = (ids: readonly string[]) => ids.length >= QUICK_PINS_MAX;
