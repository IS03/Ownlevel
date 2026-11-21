import { loadTime, mealMoments, suggestedMealLabel } from './meal-timing-model';
import { parseQuickSelection, plateTitle, QUICK_PLATE_MAX, type QuickNutrients, type QuickSelection } from '@/api/nutrition-quick';
import { parsePersonalFood, type PersonalFood } from '@/api/nutrition-food';
import { isNutritionDate } from '@/api/nutrition-day';

/**
 * «Plato»: several of the person's foods, each with its quantity, registered as one meal (server source `plate`).
 * The draft keeps each food as it was read (its version is the CAS the server checks) and the quantity as typed.
 */
export type PlateItem = { food: PersonalFood; quantity: string };
export type PlateDraft = Pick<QuickSelection, 'mealLabel' | 'consumedAt' | 'consumedAtSource'> & {
  date: string; title: string; saveToLibrary: boolean; items: PlateItem[];
};
export const PLATE_MAX = QUICK_PLATE_MAX;
export const PLATE_TITLE_MAX = 120;

/** A new plate for `date`: named after the moment of the day it is loaded in («Merienda»), which the person can change. */
export function plateDraft(date: string): PlateDraft {
  const moment = suggestedMealLabel(date), at = loadTime(date);
  return { ...(moment ? { mealLabel: moment } : {}), ...(at ? { consumedAt: at, consumedAtSource: 'user_declared' as const } : {}),
    date, title: moment ? mealMoments[moment] : '', saveToLibrary: false, items: [] };
}
/** A food can go in a plate when its calories are known (0 included: black coffee). Unknown is not zero. */
export const plateable = (food: PersonalFood) => food.isActive && food.calories !== null && food.calories >= 0 && food.servingQuantity > 0;
const comma = (n: number) => String(n).replace('.', ',');
/** The food's own portion, when it fits the plate's two decimals; otherwise one unit of it. */
export const defaultQuantity = (food: PersonalFood) => Number(food.servingQuantity.toFixed(2)) === food.servingQuantity ? food.servingQuantity : 1;
/** Grams and millilitres move by 10; everything else (unidad, taza, rebanada…) by one. */
export const plateStep = (unit: string) => ['g', 'ml'].includes(unit.trim().toLowerCase()) ? 10 : 1;
export const parsePlateQuantity = (text: string) => /^\d+(?:[,.]\d{1,2})?$/.test(text.trim()) ? Number(text.trim().replace(',', '.')) : NaN;

export function withFood(draft: PlateDraft, food: PersonalFood): PlateDraft {
  const at = draft.items.findIndex(item => item.food.id === food.id);
  // The same food again is one more portion of it, never a second row.
  if (at >= 0) {
    const current = parsePlateQuantity(draft.items[at]!.quantity), add = defaultQuantity(food);
    const next = Number.isFinite(current) ? Math.round((current + add) * 100) / 100 : add;
    return { ...draft, items: draft.items.map((item, i) => i === at ? { ...item, quantity: comma(next) } : item) };
  }
  if (draft.items.length >= PLATE_MAX || !plateable(food)) return draft;
  return { ...draft, items: [...draft.items, { food, quantity: comma(defaultQuantity(food)) }] };
}
export function stepped(draft: PlateDraft, foodId: string, delta: number): PlateDraft {
  return { ...draft, items: draft.items.map(item => {
    if (item.food.id !== foodId) return item;
    const current = parsePlateQuantity(item.quantity), step = plateStep(item.food.servingUnit);
    if (!Number.isFinite(current)) return item;
    return { ...item, quantity: comma(Math.max(0.01, Math.round((current + delta * step) * 100) / 100)) };
  }) };
}

export function selectionFromPlate(draft: PlateDraft): { selection?: QuickSelection; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  if (!draft.items.length) return { errors };
  const quantities = draft.items.map(item => {
    const quantity = parsePlateQuantity(item.quantity);
    if (!(quantity > 0 && quantity <= 1_000_000)) errors[item.food.id] = 'Ingresá una cantidad positiva, con hasta dos decimales.';
    return { itemId: item.food.id, quantity, version: item.food.version };
  });
  const title = plateTitle(draft.title);
  if (draft.saveToLibrary && title === null) errors.title = 'Poné un nombre para guardarlo en tus comidas.';
  if (title !== null && title.length > PLATE_TITLE_MAX) errors.title = `Hasta ${PLATE_TITLE_MAX} caracteres.`;
  if (Object.keys(errors).length) return { errors };
  const selection = parseQuickSelection({ date: draft.date, source: { kind: 'plate', title: draft.title, saveToLibrary: draft.saveToLibrary }, quantities,
    ...('mealLabel' in draft ? { mealLabel: draft.mealLabel } : {}), ...('consumedAt' in draft ? { consumedAt: draft.consumedAt } : {}),
    ...('consumedAtSource' in draft ? { consumedAtSource: draft.consumedAtSource } : {}) });
  return { ...(selection ? { selection } : {}), errors };
}

const scaled = (value: number | null, factor: number, places: number) => value === null ? null : Math.round(value * factor * 10 ** places) / 10 ** places;
/** One food at its quantity, rounded like the server (whole kcal, two-decimal macros). Null when the quantity is not valid. */
export function itemEstimate(item: PlateItem): QuickNutrients | null {
  const quantity = parsePlateQuantity(item.quantity), food = item.food;
  if (!(quantity > 0) || !(food.servingQuantity > 0)) return null;
  const factor = quantity / food.servingQuantity;
  return { calories: scaled(food.calories, factor, 0), proteinG: scaled(food.proteinG, factor, 2), carbsG: scaled(food.carbsG, factor, 2), fatG: scaled(food.fatG, factor, 2) };
}
/** Instant total while the server confirms it. A macro unknown in any food is unknown in the plate (missing ≠ zero). */
export function plateEstimate(draft: PlateDraft): QuickNutrients | null {
  const rows = draft.items.map(itemEstimate);
  if (!rows.length || rows.some(row => !row)) return null;
  const sum = (key: keyof QuickNutrients, places: number) => rows.some(row => row![key] === null) ? null
    : Math.round(rows.reduce((total, row) => total + row![key]!, 0) * 10 ** places) / 10 ** places;
  return { calories: sum('calories', 0), proteinG: sum('proteinG', 2), carbsG: sum('carbsG', 2), fatG: sum('fatG', 2) };
}

export function parsePlateDraft(v: unknown): PlateDraft | undefined {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return undefined;
  const d = v as Record<string, unknown>;
  if (!isNutritionDate(d.date) || typeof d.title !== 'string' || typeof d.saveToLibrary !== 'boolean' || !Array.isArray(d.items) || d.items.length > PLATE_MAX) return undefined;
  const items: PlateItem[] = [];
  for (const raw of d.items) {
    if (!raw || typeof raw !== 'object') return undefined;
    const food = parsePersonalFood((raw as Record<string, unknown>).food), quantity = (raw as Record<string, unknown>).quantity;
    if (!food || typeof quantity !== 'string') return undefined;
    items.push({ food, quantity });
  }
  return { date: d.date, title: d.title, saveToLibrary: d.saveToLibrary, items,
    ...('mealLabel' in d ? { mealLabel: d.mealLabel as PlateDraft['mealLabel'] } : {}), ...('consumedAt' in d ? { consumedAt: d.consumedAt as string } : {}),
    ...('consumedAtSource' in d ? { consumedAtSource: d.consumedAtSource as PlateDraft['consumedAtSource'] } : {}) };
}
