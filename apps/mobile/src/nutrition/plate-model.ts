import { loadTime, mealMoments, suggestedMealLabel } from './meal-timing-model';
import { parseQuickOption, parseQuickSelection, plateTitle, QUICK_PLATE_MAX, type QuickNutrients, type QuickOption, type QuickSelection } from '@/api/nutrition-quick';
import { parsePersonalFood, type PersonalFood } from '@/api/nutrition-food';
import { isNutritionDate } from '@/api/nutrition-day';

/**
 * «Plato»: several of the person's foods (by quantity) and saved meals (by portions), registered as one meal (server
 * source `plate`). The draft keeps each item as it was read (its version is the CAS the server checks) and the quantity
 * as typed.
 */
export type PlateSource = { kind: 'food'; food: PersonalFood } | { kind: 'saved'; meal: QuickOption };
export type PlateItem = { source: PlateSource; quantity: string };
export type PlateDraft = Pick<QuickSelection, 'mealLabel' | 'consumedAt' | 'consumedAtSource'> & {
  date: string; title: string; saveToLibrary: boolean; items: PlateItem[];
};
export const PLATE_MAX = QUICK_PLATE_MAX;
export const PLATE_TITLE_MAX = 120;

/** What every item answers the same way, whether it is a food or a saved meal. */
export const sourceId = (s: PlateSource) => s.kind === 'food' ? s.food.id : s.meal.source.id;
export const sourceName = (s: PlateSource) => s.kind === 'food' ? s.food.name : s.meal.name;
/** A saved meal is counted in portions. */
export const sourceUnit = (s: PlateSource) => s.kind === 'food' ? s.food.servingUnit : 'porción';
/** The quantity its nutrients are given for: the food's portion, or one portion of the saved meal. */
const sourceBase = (s: PlateSource) => s.kind === 'food' ? s.food.servingQuantity : 1;
const sourceValues = (s: PlateSource): QuickNutrients => s.kind === 'food' ? s.food : s.meal;
const sourceVersion = (s: PlateSource) => s.kind === 'food' ? s.food.version : (s.meal.source as { version: string }).version;

/** A new plate for `date`: named after the moment of the day it is loaded in («Merienda»), which the person can change. */
export function plateDraft(date: string): PlateDraft {
  const moment = suggestedMealLabel(date), at = loadTime(date);
  return { ...(moment ? { mealLabel: moment } : {}), ...(at ? { consumedAt: at, consumedAtSource: 'user_declared' as const } : {}),
    date, title: moment ? mealMoments[moment] : '', saveToLibrary: false, items: [] };
}
/** It can go in a plate when its calories are known (0 included: black coffee). Unknown is not zero. */
export function plateable(s: PlateSource) {
  if (s.kind === 'food') return s.food.isActive && s.food.calories !== null && s.food.calories >= 0 && s.food.servingQuantity > 0;
  return s.meal.source.kind === 'saved' && s.meal.calories !== null && s.meal.calories >= 0;
}
const comma = (n: number) => String(n).replace('.', ',');
/** A food's own portion, when it fits the plate's two decimals (otherwise one unit of it); a saved meal, one portion. */
export const defaultQuantity = (s: PlateSource) => s.kind === 'food' && Number(s.food.servingQuantity.toFixed(2)) === s.food.servingQuantity ? s.food.servingQuantity : 1;
/** Grams and millilitres move by 10; everything else (unidad, taza, porción…) by one. */
export const plateStep = (unit: string) => ['g', 'ml'].includes(unit.trim().toLowerCase()) ? 10 : 1;
export const parsePlateQuantity = (text: string) => /^\d+(?:[,.]\d{1,2})?$/.test(text.trim()) ? Number(text.trim().replace(',', '.')) : NaN;

/** «1 unidad», «2 unidades», «2 porciones», «150 g»: abbreviations never take a plural. */
export function unitLabel(unit: string, quantity: number) {
  const u = unit.trim();
  if (quantity === 1 || !u || u.length <= 2 || /[^a-záéíóúñü ]/i.test(u)) return u;
  if (/ón$/i.test(u)) return `${u.slice(0, -2)}ones`;
  if (/[aeiou]$/i.test(u)) return `${u}s`;
  if (/z$/i.test(u)) return `${u.slice(0, -1)}ces`;
  return `${u}es`;
}

export function withSource(draft: PlateDraft, source: PlateSource): PlateDraft {
  if (draft.items.length >= PLATE_MAX || !plateable(source) || draft.items.some(item => sourceId(item.source) === sourceId(source))) return draft;
  return { ...draft, items: [...draft.items, { source, quantity: comma(defaultQuantity(source)) }] };
}
/** One step up or down; below the first step the item leaves the plate. */
export function stepped(draft: PlateDraft, id: string, delta: number): PlateDraft {
  const item = draft.items.find(i => sourceId(i.source) === id);
  if (!item) return draft;
  const current = parsePlateQuantity(item.quantity), step = plateStep(sourceUnit(item.source));
  if (!Number.isFinite(current)) return draft;
  const next = Math.round((current + delta * step) * 100) / 100;
  if (next <= 0) return { ...draft, items: draft.items.filter(i => i !== item) };
  return { ...draft, items: draft.items.map(i => i === item ? { ...i, quantity: comma(next) } : i) };
}

export function selectionFromPlate(draft: PlateDraft): { selection?: QuickSelection; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  if (!draft.items.length) return { errors };
  const quantities = draft.items.map(item => {
    const quantity = parsePlateQuantity(item.quantity), id = sourceId(item.source);
    if (!(quantity > 0 && quantity <= 1_000_000)) errors[id] = 'Ingresá una cantidad positiva, con hasta dos decimales.';
    return { itemId: id, quantity, version: sourceVersion(item.source), ...(item.source.kind === 'saved' ? { kind: 'saved' as const } : {}) };
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
/** One item at its quantity, rounded like the server (whole kcal, two-decimal macros). Null when the quantity is not valid. */
export function itemEstimate(item: PlateItem): QuickNutrients | null {
  const quantity = parsePlateQuantity(item.quantity), base = sourceBase(item.source), values = sourceValues(item.source);
  if (!(quantity > 0) || !(base > 0)) return null;
  const factor = quantity / base;
  return { calories: scaled(values.calories, factor, 0), proteinG: scaled(values.proteinG, factor, 2), carbsG: scaled(values.carbsG, factor, 2), fatG: scaled(values.fatG, factor, 2) };
}
/** Instant total while the server confirms it. A macro unknown in any item is unknown in the plate (missing ≠ zero). */
export function plateEstimate(draft: PlateDraft): QuickNutrients | null {
  const rows = draft.items.map(itemEstimate);
  if (!rows.length || rows.some(row => !row)) return null;
  const sum = (key: keyof QuickNutrients, places: number) => rows.some(row => row![key] === null) ? null
    : Math.round(rows.reduce((total, row) => total + row![key]!, 0) * 10 ** places) / 10 ** places;
  return { calories: sum('calories', 0), proteinG: sum('proteinG', 2), carbsG: sum('carbsG', 2), fatG: sum('fatG', 2) };
}

function parseSource(v: unknown): PlateSource | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const s = v as Record<string, unknown>;
  if (s.kind === 'food') { const food = parsePersonalFood(s.food); return food ? { kind: 'food', food } : undefined; }
  if (s.kind === 'saved') { const meal = parseQuickOption(s.meal); return meal && meal.source.kind === 'saved' ? { kind: 'saved', meal } : undefined; }
  return undefined;
}
export function parsePlateDraft(v: unknown): PlateDraft | undefined {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return undefined;
  const d = v as Record<string, unknown>;
  if (!isNutritionDate(d.date) || typeof d.title !== 'string' || typeof d.saveToLibrary !== 'boolean' || !Array.isArray(d.items) || d.items.length > PLATE_MAX) return undefined;
  const items: PlateItem[] = [];
  for (const raw of d.items) {
    if (!raw || typeof raw !== 'object') return undefined;
    const source = parseSource((raw as Record<string, unknown>).source), quantity = (raw as Record<string, unknown>).quantity;
    if (!source || typeof quantity !== 'string') return undefined;
    items.push({ source, quantity });
  }
  return { date: d.date, title: d.title, saveToLibrary: d.saveToLibrary, items,
    ...('mealLabel' in d ? { mealLabel: d.mealLabel as PlateDraft['mealLabel'] } : {}), ...('consumedAt' in d ? { consumedAt: d.consumedAt as string } : {}),
    ...('consumedAtSource' in d ? { consumedAtSource: d.consumedAtSource as PlateDraft['consumedAtSource'] } : {}) };
}
