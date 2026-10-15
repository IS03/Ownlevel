import { isNutritionDate } from './nutrition-day-contract';
import { mealUuid, mealVersion, parseMealTiming, type MealTiming } from './nutrition-meal-contract';

export type QuickSource = { kind: 'suggestion' | 'saved' | 'food'; id: string; version: string };
export type QuickQuantity = { itemId: string; quantity: number };
export type QuickSelection = MealTiming & { date: string; source: QuickSource; quantities: QuickQuantity[] | null };
export type QuickIntent = QuickSelection & { operation: 'register' | 'saveSuggestion'; idempotencyKey: string };
export type QuickNutrients = { calories: number | null; proteinG: number | null; carbsG: number | null; fatG: number | null };
export type QuickItem = { id: string; label: string; quantity: number; unit: string };
export type QuickOption = QuickNutrients & { source: QuickSource; name: string; description: string | null;
  templateType: 'manual' | 'composite' | null; items: QuickItem[]; useCount: number | null; lastUsedDate: string | null };
export type QuickOptions = { today: string; saved: QuickSection; suggested: QuickSection };
export type QuickSection = { status: 'ok'; items: QuickOption[] } | { status: 'unavailable' };
export type QuickSnapshot = QuickNutrients & { calories: number; title: string | null; description: string | null;
  precision: 'catalog' | 'label' | 'estimated' | 'historical' | null; contextType: string | null; sourceNote: string | null };
export type QuickPreview = { status: 'preview'; selection: QuickSelection; snapshot: QuickSnapshot; items: (QuickItem & QuickNutrients)[] };
export type QuickReceipt = { status: 'registered' | 'habitual_saved'; operation: QuickIntent['operation']; date: string; resourceId: string; updatedAt: string };
export type QuickConflict = { error: 'QUICK_SOURCE_CHANGED' | 'QUICK_SOURCE_UNAVAILABLE' | 'QUICK_SOURCE_UNUSABLE'
  | 'SAVED_NAME_EXISTS' | 'DAY_HAS_HISTORICAL_SUMMARY' | 'IDEMPOTENCY_KEY_REUSED'; message: string };
export type QuickResponse = QuickReceipt | QuickConflict;
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const nullableText = (v: unknown): v is string | null => v === null || typeof v === 'string';
const nonnegative = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;
const nutrient = (v: unknown) => v === null || nonnegative(v);
export function parseQuickSource(v: unknown): QuickSource | undefined {
  return record(v) && Object.keys(v).length === 3 && (v.kind === 'saved' || v.kind === 'suggestion' || v.kind === 'food') && mealUuid(v.id)
    && typeof v.version === 'string' && /^[a-f0-9]{64}$/.test(v.version)
    ? { kind: v.kind, id: v.id.toLowerCase(), version: v.version } : undefined;
}
export function parseQuickSelection(v: unknown): QuickSelection | undefined {
  if (!record(v) || Object.keys(v).some(k => !['date','source','quantities','mealLabel','consumedAt'].includes(k)) || !isNutritionDate(v.date)) return undefined;
  const timing = parseMealTiming(v, v.date);
  if (!timing) return undefined;
  const source = parseQuickSource(v.source);
  if (!source || !(v.quantities === null || Array.isArray(v.quantities))) return undefined;
  let quantities: QuickQuantity[] | null = null;
  if (Array.isArray(v.quantities)) {
    if (!['saved','food'].includes(source.kind) || v.quantities.length < 1 || v.quantities.length > 50) return undefined;
    quantities = [];
    for (const q of v.quantities) {
      if (!record(q) || Object.keys(q).length !== 2 || !mealUuid(q.itemId) || !nonnegative(q.quantity)
        || q.quantity <= 0 || q.quantity > 1_000_000 || Number(q.quantity.toFixed(source.kind === 'food' ? 3 : 2)) !== q.quantity) return undefined;
      quantities.push({ itemId: q.itemId.toLowerCase(), quantity: q.quantity });
    }
    if (new Set(quantities.map(q => q.itemId)).size !== quantities.length) return undefined;
    quantities.sort((a,b) => a.itemId.localeCompare(b.itemId));
  }
  if (source.kind === 'food' && (!quantities || quantities.length !== 1 || quantities[0].itemId !== source.id)) return undefined;
  return { date: v.date, source, quantities, ...timing };
}
export function parseQuickIntent(v: unknown): QuickIntent | undefined {
  if (!record(v) || Object.keys(v).some(k => !['date','source','quantities','operation','idempotencyKey','mealLabel','consumedAt'].includes(k)) || !['register','saveSuggestion'].includes(String(v.operation))
    || typeof v.idempotencyKey !== 'string' || !/^[A-Za-z0-9._:-]{1,128}$/.test(v.idempotencyKey)) return undefined;
  const selection = parseQuickSelection(quickSelectionOf(v as QuickIntent));
  if (!selection || v.operation === 'saveSuggestion' && selection.source.kind !== 'suggestion') return undefined;
  return { ...selection, operation: v.operation as QuickIntent['operation'], idempotencyKey: v.idempotencyKey };
}
export function quickSelectionOf(v: QuickSelection): QuickSelection { return { date: v.date, source: v.source, quantities: v.quantities, ...('mealLabel' in v ? { mealLabel: v.mealLabel } : {}), ...('consumedAt' in v ? { consumedAt: v.consumedAt } : {}) }; }
export function sameQuickSelection(a: QuickSelection, b: QuickSelection) {
  return JSON.stringify(parseQuickSelection(quickSelectionOf(a))) === JSON.stringify(parseQuickSelection(quickSelectionOf(b)));
}
function parseNutrients(v: Record<string, unknown>): QuickNutrients | undefined {
  return [v.calories,v.proteinG,v.carbsG,v.fatG].every(nutrient)
    ? { calories: v.calories as number | null, proteinG: v.proteinG as number | null, carbsG: v.carbsG as number | null, fatG: v.fatG as number | null } : undefined;
}
function parseItem(v: unknown): QuickItem | undefined {
  return record(v) && mealUuid(v.id) && typeof v.label === 'string' && typeof v.unit === 'string'
    && nonnegative(v.quantity) && v.quantity > 0 && v.quantity <= 1_000_000
    ? { id: v.id.toLowerCase(), label: v.label, unit: v.unit, quantity: v.quantity } : undefined;
}
export function parseQuickOption(v: unknown): QuickOption | undefined {
  if (!record(v) || typeof v.name !== 'string' || !nullableText(v.description) || !Array.isArray(v.items)) return undefined;
  const source = parseQuickSource(v.source), n = parseNutrients(v), items = v.items.map(parseItem);
  if (!source || !n || items.some(i => !i) || items.length > 50 || new Set(items.map(i => i!.id)).size !== items.length) return undefined;
  if (source.kind === 'food' ? v.templateType !== null || v.useCount !== null || v.lastUsedDate !== null || items.length !== 1 || items[0]!.id !== source.id
    : source.kind === 'saved' ? !['manual','composite'].includes(String(v.templateType)) || v.useCount !== null || v.lastUsedDate !== null
    || (v.templateType === 'manual' ? items.length !== 0 : items.length < 1)
    : v.templateType !== null || items.length !== 0 || !Number.isSafeInteger(v.useCount) || Number(v.useCount) < 1 || !isNutritionDate(v.lastUsedDate)) return undefined;
  return { ...n, source, name: v.name, description: v.description, templateType: v.templateType as QuickOption['templateType'],
    items: items as QuickItem[], useCount: v.useCount as number | null, lastUsedDate: v.lastUsedDate as string | null };
}
export function parseQuickOptions(v: unknown): QuickOptions | undefined {
  if (!record(v) || !isNutritionDate(v.today)) return undefined;
  function section(raw: unknown, kind: QuickSource['kind']): QuickSection | undefined {
    if (!record(raw)) return undefined;
    if (raw.status === 'unavailable') return { status: 'unavailable' };
    if (raw.status !== 'ok' || !Array.isArray(raw.items)) return undefined;
    const items = raw.items.map(parseQuickOption);
    return items.every(i => i?.source.kind === kind) ? { status: 'ok', items: items as QuickOption[] } : undefined;
  }
  const saved = section(v.saved, 'saved'), suggested = section(v.suggested, 'suggestion');
  return saved && suggested ? { today: v.today, saved, suggested } : undefined;
}
export function parseQuickConflict(v: unknown): QuickConflict | undefined {
  return record(v) && typeof v.message === 'string' && ['QUICK_SOURCE_CHANGED','QUICK_SOURCE_UNAVAILABLE','QUICK_SOURCE_UNUSABLE',
    'SAVED_NAME_EXISTS','DAY_HAS_HISTORICAL_SUMMARY','IDEMPOTENCY_KEY_REUSED'].includes(String(v.error))
    ? { error: v.error as QuickConflict['error'], message: v.message } : undefined;
}
export function parseQuickPreview(v: unknown): QuickPreview | undefined {
  if (!record(v) || v.status !== 'preview' || !record(v.snapshot) || !Array.isArray(v.items)) return undefined;
  const selection = parseQuickSelection(v.selection), n = parseNutrients(v.snapshot), s = v.snapshot;
  if (!selection || !n || !Number.isSafeInteger(n.calories) || Number(n.calories) <= 0 || !nullableText(s.title)
    || ![s.description,s.contextType,s.sourceNote].every(nullableText) || ![null,'catalog','label','estimated','historical'].includes(s.precision as string | null)) return undefined;
  const items: (QuickItem & QuickNutrients)[] = [];
  for (const raw of v.items) { const i = parseItem(raw), nn = record(raw) ? parseNutrients(raw) : undefined; if (!i || !nn) return undefined; items.push({...i,...nn}); }
  if (selection.source.kind === 'food' && (items.length !== 1 || items[0].id !== selection.source.id || items[0].quantity !== selection.quantities![0].quantity)) return undefined;
  if (items.length > 50 || new Set(items.map(i => i.id)).size !== items.length || selection.source.kind === 'suggestion' && items.length) return undefined;
  return { status: 'preview', selection, snapshot: { ...n, calories: n.calories as number, title: s.title,
    description: s.description as string | null, contextType: s.contextType as string | null, sourceNote: s.sourceNote as string | null, precision: s.precision as QuickSnapshot['precision'] }, items };
}
export function parseQuickResponse(v: unknown): QuickResponse | undefined {
  if (!record(v)) return undefined;
  const conflict = parseQuickConflict(v); if (conflict) return conflict;
  return (v.operation === 'register' && v.status === 'registered' || v.operation === 'saveSuggestion' && v.status === 'habitual_saved')
    && isNutritionDate(v.date) && mealUuid(v.resourceId) && mealVersion(v.updatedAt)
    ? { status: v.status as QuickReceipt['status'], operation: v.operation as QuickIntent['operation'], date: v.date, resourceId: v.resourceId.toLowerCase(), updatedAt: v.updatedAt } : undefined;
}
