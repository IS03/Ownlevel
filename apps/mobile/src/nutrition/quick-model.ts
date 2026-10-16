import { suggestedMealLabel } from './meal-timing-model';
import { parseQuickOption, parseQuickSelection, type QuickNutrients, type QuickOption, type QuickSelection } from '@/api/nutrition-quick';
import { isNutritionDate } from '@/api/nutrition-day';
export type QuickDraft = Pick<QuickSelection, 'mealLabel' | 'consumedAt'> & { date: string; option: QuickOption; quantities: Record<string, string> };
export function quickDraft(date: string, option: QuickOption): QuickDraft {
  const moment = suggestedMealLabel(date);
  return { ...(moment ? { mealLabel: moment } : {}), date, option, quantities: Object.fromEntries(option.items.map(i => [i.id, String(i.quantity).replace('.', ',')])) };
}
export function selectionFromDraft(draft: QuickDraft): { selection?: QuickSelection; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const quantities = draft.option.templateType === 'composite' || draft.option.source.kind === 'food' ? draft.option.items.map(i => {
    const text = draft.quantities[i.id]?.trim() ?? '';
    const quantity = new RegExp(`^\\d+(?:[,.]\\d{1,${draft.option.source.kind === 'food' ? 3 : 2}})?$`).test(text) ? Number(text.replace(',', '.')) : 0;
    if (quantity <= 0 || quantity > 1_000_000) errors[i.id] = `Ingresá una cantidad positiva, con hasta ${draft.option.source.kind === 'food' ? 'tres' : 'dos'} decimales.`;
    return { itemId: i.id, quantity };
  }) : null;
  if (Object.keys(errors).length) return { errors };
  const selection = parseQuickSelection({ date: draft.date, source: draft.option.source, quantities, ...('mealLabel' in draft ? { mealLabel: draft.mealLabel } : {}), ...('consumedAt' in draft ? { consumedAt: draft.consumedAt } : {}) });
  return { ...(selection ? { selection } : {}), errors };
}
export function parseQuickDraft(v: unknown): QuickDraft | undefined {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return undefined;
  const d = v as Record<string, unknown>, option = parseQuickOption(d.option);
  if (!isNutritionDate(d.date) || !option || !d.quantities || typeof d.quantities !== 'object' || Array.isArray(d.quantities)) return undefined;
  const quantities = d.quantities as Record<string, unknown>;
  if (Object.keys(quantities).length !== option.items.length || option.items.some(i => typeof quantities[i.id] !== 'string')) return undefined;
  const draft = { date: d.date, option, quantities: quantities as Record<string, string>, ...('mealLabel' in d ? { mealLabel: d.mealLabel as QuickDraft['mealLabel'] } : {}), ...('consumedAt' in d ? { consumedAt: d.consumedAt as string } : {}) };
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
  return draft.option.items.every(i => amount(i.id) === i.quantity) ? scale(1) : null;
}
const times = (value: number | null, factor: number, places = 2) => value === null ? null : Math.round(value * factor * 10 ** places) / 10 ** places;
/** Search form of a text: no accents, no case (café = cafe = CAFÉ), like the server's catalog search. */
export const searchable = (value: string) => value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleUpperCase('es-AR');
