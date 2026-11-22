import { loadTime, suggestedMealLabel } from './meal-timing-model';
import { parseQuickOption, parseQuickSelection, type QuickNutrients, type QuickOption, type QuickSelection } from '@/api/nutrition-quick';
import { isNutritionDate } from '@/api/nutrition-day';
/**
 * `times` (2–20, saved meals only): «Agregar varias veces». The same saved meal multiplied, registered through the plate
 * source as one meal named «NOMBRE ×N», its nutrients the saved meal's own times N (server-side, #610).
 */
export type QuickDraft = Pick<QuickSelection, 'mealLabel' | 'consumedAt' | 'consumedAtSource'> & { date: string; option: QuickOption; quantities: Record<string, string>; times?: number };
export const QUICK_TIMES_MAX = 20;
const validTimes = (n: unknown): n is number => Number.isInteger(n) && (n as number) >= 2 && (n as number) <= QUICK_TIMES_MAX;
/** «PASTA ×2»: the saved meal's name, kept within the plate title's 120 characters. */
/** A simple saved meal can be added in portions (×N); a composite one is adjusted by its ingredients instead. */
export const multipliable = (option: QuickOption) => option.source.kind === 'saved' && option.templateType !== 'composite';
export const timesTitle = (name: string, times: number) => `${name.trim().slice(0, 112)} ×${times}`;
export function quickDraft(date: string, option: QuickOption, times?: number): QuickDraft {
  const moment = suggestedMealLabel(date), at = loadTime(date);
  return { ...(moment ? { mealLabel: moment } : {}), ...(at ? { consumedAt: at, consumedAtSource: 'user_declared' as const } : {}), date, option, quantities: Object.fromEntries(option.items.map(i => [i.id, String(i.quantity).replace('.', ',')])),
    ...(validTimes(times) && option.source.kind === 'saved' ? { times } : {}) };
}
export function selectionFromDraft(draft: QuickDraft): { selection?: QuickSelection; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  if (draft.times !== undefined) {
    const source = draft.option.source;
    if (!validTimes(draft.times) || source.kind !== 'saved') return { errors: { times: 'Elegí entre 2 y 20 veces.' } };
    const selection = parseQuickSelection({ date: draft.date, source: { kind: 'plate', title: timesTitle(draft.option.name, draft.times), saveToLibrary: false },
      quantities: [{ kind: 'saved', itemId: source.id, quantity: draft.times, version: source.version }],
      ...('mealLabel' in draft ? { mealLabel: draft.mealLabel } : {}), ...('consumedAt' in draft ? { consumedAt: draft.consumedAt } : {}), ...('consumedAtSource' in draft ? { consumedAtSource: draft.consumedAtSource } : {}) });
    return { ...(selection ? { selection } : {}), errors };
  }
  const quantities = draft.option.templateType === 'composite' || draft.option.source.kind === 'food' ? draft.option.items.map(i => {
    const text = draft.quantities[i.id]?.trim() ?? '';
    const quantity = new RegExp(`^\\d+(?:[,.]\\d{1,${draft.option.source.kind === 'food' ? 3 : 2}})?$`).test(text) ? Number(text.replace(',', '.')) : 0;
    if (quantity <= 0 || quantity > 1_000_000) errors[i.id] = `Ingresá una cantidad positiva, con hasta ${draft.option.source.kind === 'food' ? 'tres' : 'dos'} decimales.`;
    return { itemId: i.id, quantity };
  }) : null;
  if (Object.keys(errors).length) return { errors };
  const selection = parseQuickSelection({ date: draft.date, source: draft.option.source, quantities, ...('mealLabel' in draft ? { mealLabel: draft.mealLabel } : {}), ...('consumedAt' in draft ? { consumedAt: draft.consumedAt } : {}), ...('consumedAtSource' in draft ? { consumedAtSource: draft.consumedAtSource } : {}) });
  return { ...(selection ? { selection } : {}), errors };
}
export function parseQuickDraft(v: unknown): QuickDraft | undefined {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return undefined;
  const d = v as Record<string, unknown>, option = parseQuickOption(d.option);
  if (!isNutritionDate(d.date) || !option || !d.quantities || typeof d.quantities !== 'object' || Array.isArray(d.quantities)) return undefined;
  const quantities = d.quantities as Record<string, unknown>;
  if (Object.keys(quantities).length !== option.items.length || option.items.some(i => typeof quantities[i.id] !== 'string')) return undefined;
  if ('times' in d && !validTimes(d.times)) return undefined;
  const draft = { date: d.date, option, quantities: quantities as Record<string, string>, ...('times' in d ? { times: d.times as number } : {}), ...('mealLabel' in d ? { mealLabel: d.mealLabel as QuickDraft['mealLabel'] } : {}), ...('consumedAt' in d ? { consumedAt: d.consumedAt as string } : {}), ...('consumedAtSource' in d ? { consumedAtSource: d.consumedAtSource as QuickDraft['consumedAtSource'] } : {}) };
  return selectionFromDraft(draft).selection ? draft : undefined;
}
/**
 * Instant estimate shown while the server preview is computed: a food scales its base portion; any other option
 * only at its own quantities. Display only: adding still requires the confirmed preview. Missing stays null.
 */
export function quickEstimate(draft: QuickDraft): QuickNutrients | null {
  // Calories in whole kcal, like the server's preview; macros keep two decimals.
  const scale = (factor: number): QuickNutrients => ({ calories: times(draft.option.calories, factor, 0), proteinG: times(draft.option.proteinG, factor),
    carbsG: times(draft.option.carbsG, factor), fatG: times(draft.option.fatG, factor) });
  const amount = (id: string) => Number(draft.quantities[id]?.trim().replace(',', '.'));
  if (draft.option.source.kind === 'food') {
    const item = draft.option.items[0], quantity = item ? amount(item.id) : NaN;
    return item && item.quantity > 0 && Number.isFinite(quantity) && quantity > 0 ? scale(quantity / item.quantity) : null;
  }
  return draft.option.items.every(i => amount(i.id) === i.quantity) ? scale(draft.times ?? 1) : null;
}
const times = (value: number | null, factor: number, places = 2) => value === null ? null : Math.round(value * factor * 10 ** places) / 10 ** places;
/** Search form of a text: no accents, no case (café = cafe = CAFÉ), like the server's catalog search. */
export const searchable = (value: string) => value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleUpperCase('es-AR');
