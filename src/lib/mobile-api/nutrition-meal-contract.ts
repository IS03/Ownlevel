import { isNutritionDate } from './nutrition-day-contract';

export type MealTiming = { mealLabel?: 'breakfast' | 'lunch' | 'snack' | 'dinner' | 'extra' | null; consumedAt?: string };
/** Absent fields keep the original v1 payload and ledger hash intact. */
export function parseMealTiming(v: Record<string, unknown>, date: string): MealTiming | undefined {
  if ('mealLabel' in v && ![null, 'breakfast', 'lunch', 'snack', 'dinner', 'extra'].includes(v.mealLabel as string | null)) return undefined;
  if ('consumedAt' in v && (typeof v.consumedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(v.consumedAt) || !isNutritionDate(v.consumedAt.slice(0,10)) || !Number.isFinite(Date.parse(v.consumedAt)) || new Date(Date.parse(v.consumedAt) - 3 * 3600000).toISOString().slice(0,10) !== date)) return undefined;
  return { ...('mealLabel' in v ? { mealLabel: v.mealLabel as MealTiming['mealLabel'] } : {}), ...('consumedAt' in v ? { consumedAt: new Date(v.consumedAt as string).toISOString() } : {}) };
}
export type ManualMealFields = MealTiming & { date: string; title: string | null; description: string | null;
  calories: number; proteinG: number | null; carbsG: number | null; fatG: number | null; saveToLibrary?: boolean };
export type MealMutationIntent = { operation: 'create' | 'edit' | 'delete'; sourceDate: string;
  mealId: string | null; expectedUpdatedAt: string | null; idempotencyKey: string;
  fields: ManualMealFields | null; forceDuplicate: boolean };
export type MealMutationReceipt = { status: 'saved' | 'deleted'; mealId: string; sourceDate: string;
  destinationDate: string; updatedAt: string };
export type MealMutationConflict = { error: 'SAVED_NAME_EXISTS' | 'POSSIBLE_DUPLICATE' | 'MEAL_CHANGED' | 'MEAL_UNAVAILABLE' | 'DAY_HAS_HISTORICAL_SUMMARY' | 'IDEMPOTENCY_KEY_REUSED'; message: string; currentDate?: string };
export type MealMutationResponse = MealMutationReceipt | MealMutationConflict;
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
export const mealUuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
export const mealVersion = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v) && Number.isFinite(Date.parse(v));
const macro = (v: unknown, maximum = 99999999.99) => v === null || (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= maximum && Math.abs(v * 100 - Math.round(v * 100)) < 0.000001);
export function parseManualMealFields(v: unknown): ManualMealFields | undefined {
  if (!record(v) || Object.keys(v).some(k => !['date','title','description','calories','proteinG','carbsG','fatG','mealLabel','consumedAt','saveToLibrary'].includes(k)) || !isNutritionDate(v.date)
    || ![v.title, v.description].every(t => t === null || typeof t === 'string')
    || typeof v.calories !== 'number' || !Number.isSafeInteger(v.calories) || v.calories <= 0 || v.calories > 2147483647
    || !macro(v.proteinG, 999999.99) || !macro(v.carbsG) || !macro(v.fatG)) return undefined;
  const timing = parseMealTiming(v, v.date);
  if (!timing || 'saveToLibrary' in v && typeof v.saveToLibrary !== 'boolean') return undefined;
  const text = (t: unknown) => typeof t === 'string' ? t.trim().replace(/\s+/g, ' ').toUpperCase() || null : null;
  return { ...timing, ...('saveToLibrary' in v ? { saveToLibrary: v.saveToLibrary as boolean } : {}), date: v.date, title: text(v.title), description: text(v.description), calories: v.calories,
    proteinG: v.proteinG as number | null, carbsG: v.carbsG as number | null, fatG: v.fatG as number | null };
}
export function parseMealMutationIntent(v: unknown): MealMutationIntent | undefined {
  if (!record(v) || Object.keys(v).length !== 7 || !['create','edit','delete'].includes(String(v.operation))
    || !isNutritionDate(v.sourceDate) || typeof v.idempotencyKey !== 'string' || !/^[A-Za-z0-9._:-]{1,128}$/.test(v.idempotencyKey)
    || typeof v.forceDuplicate !== 'boolean') return undefined;
  const operation = v.operation as MealMutationIntent['operation'];
  if (operation === 'create' ? v.mealId !== null || v.expectedUpdatedAt !== null : !mealUuid(v.mealId) || !mealVersion(v.expectedUpdatedAt)) return undefined;
  const fields = v.fields === null ? null : parseManualMealFields(v.fields);
  if (operation === 'delete' ? fields !== null : !fields) return undefined;
  if (fields?.saveToLibrary && (operation !== 'create' || !(fields.title || fields.description))) return undefined;
  if (operation === 'create' && fields?.date !== v.sourceDate || operation !== 'create' && v.forceDuplicate) return undefined;
  return { operation, sourceDate: v.sourceDate, mealId: v.mealId as string | null,
    expectedUpdatedAt: v.expectedUpdatedAt as string | null, idempotencyKey: v.idempotencyKey, fields: fields ?? null, forceDuplicate: v.forceDuplicate };
}
export function parseMealMutationResponse(v: unknown): MealMutationResponse | undefined {
  if (!record(v)) return undefined;
  if (v.status === 'saved' || v.status === 'deleted') {
    return mealUuid(v.mealId) && isNutritionDate(v.sourceDate) && isNutritionDate(v.destinationDate) && mealVersion(v.updatedAt)
      ? { status: v.status, mealId: v.mealId, sourceDate: v.sourceDate, destinationDate: v.destinationDate, updatedAt: v.updatedAt } : undefined;
  }
  if (['SAVED_NAME_EXISTS','POSSIBLE_DUPLICATE','MEAL_CHANGED','MEAL_UNAVAILABLE','DAY_HAS_HISTORICAL_SUMMARY','IDEMPOTENCY_KEY_REUSED'].includes(String(v.error))
    && typeof v.message === 'string' && (v.currentDate === undefined || isNutritionDate(v.currentDate))) {
    if (v.error === 'MEAL_CHANGED' && !isNutritionDate(v.currentDate)) return undefined;
    return { error: v.error as MealMutationConflict['error'], message: v.message, ...(v.currentDate ? { currentDate: v.currentDate as string } : {}) };
  }
  return undefined;
}
