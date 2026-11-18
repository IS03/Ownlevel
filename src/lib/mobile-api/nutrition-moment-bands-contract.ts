/**
 * Personal meal moment bands (EXPAND 20261118003108): when a meal loaded now is suggested as Desayuno, Almuerzo, Merienda
 * or Cena. Five clock limits in minutes since midnight (Córdoba), strictly increasing, on a 15-minute grid. Outside
 * [breakfastFrom, dinnerUntil) a load has no suggested moment. Shared by the server and Mobile (pure).
 */
export type MealMomentBands = { breakfastFrom: number; lunchFrom: number; snackFrom: number; dinnerFrom: number; dinnerUntil: number };
/** Revision 0 with null bands: never written; the fixed defaults apply. */
export type MealMomentBandsSnapshot = { revision: number; bands: MealMomentBands | null };
export type MealMomentBandsRead = { status: 'ok' } & MealMomentBandsSnapshot | { status: 'unavailable' };
export type MealMomentBandsWrite = { bands: MealMomentBands; expectedRevision: number; idempotencyKey: string };
export type MealMomentBandsConflict = { error: 'MEAL_MOMENT_BANDS_CHANGED' | 'IDEMPOTENCY_KEY_REUSED'; message: string; current: MealMomentBandsSnapshot | null };
export type MealMoment = 'breakfast' | 'lunch' | 'snack' | 'dinner';

/** The bands every account had before this preference existed: 05:00, 11:00, 15:00, 19:00 and 23:00. */
export const DEFAULT_MEAL_MOMENT_BANDS: MealMomentBands = Object.freeze({ breakfastFrom: 300, lunchFrom: 660, snackFrom: 900, dinnerFrom: 1140, dinnerUntil: 1380 });
export const MEAL_MOMENT_BAND_KEYS = ['breakfastFrom', 'lunchFrom', 'snackFrom', 'dinnerFrom', 'dinnerUntil'] as const;
export const MEAL_MOMENT_STEP = 15;

const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const exactKeys = (v: Record<string, unknown>, keys: readonly string[]) => Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k));
const revisionOf = (v: unknown): v is number => Number.isSafeInteger(v) && Number(v) >= 0;

/** Valid bands: whole minutes on the 15-minute grid, strictly increasing, within one day. */
export function parseMealMomentBands(v: unknown): MealMomentBands | undefined {
  if (!record(v) || !exactKeys(v, MEAL_MOMENT_BAND_KEYS)) return undefined;
  const values = MEAL_MOMENT_BAND_KEYS.map(key => v[key]);
  if (!values.every(n => Number.isSafeInteger(n) && (n as number) % MEAL_MOMENT_STEP === 0)) return undefined;
  const [a, b, c, d, e] = values as number[];
  return a! >= 0 && a! < b! && b! < c! && c! < d! && d! < e! && e! <= 1440
    ? { breakfastFrom: a!, lunchFrom: b!, snackFrom: c!, dinnerFrom: d!, dinnerUntil: e! } : undefined;
}
export function parseMealMomentBandsSnapshot(v: unknown): MealMomentBandsSnapshot | undefined {
  if (!record(v) || !exactKeys(v, ['revision', 'bands']) || !revisionOf(v.revision)) return undefined;
  if (v.bands === null) return v.revision === 0 ? { revision: 0, bands: null } : undefined;
  const bands = parseMealMomentBands(v.bands);
  return bands && v.revision > 0 ? { revision: v.revision, bands } : undefined;
}
/** The GET body. Anything absent or invalid is «unavailable», never the defaults pretending to be the person's own. */
export function parseMealMomentBandsRead(v: unknown): MealMomentBandsRead {
  if (!record(v) || v.status !== 'ok' || !exactKeys(v, ['status', 'revision', 'bands'])) return { status: 'unavailable' };
  const snapshot = parseMealMomentBandsSnapshot({ revision: v.revision, bands: v.bands });
  return snapshot ? { status: 'ok', ...snapshot } : { status: 'unavailable' };
}
export function parseMealMomentBandsWrite(v: unknown): MealMomentBandsWrite | undefined {
  if (!record(v) || !exactKeys(v, ['bands', 'expectedRevision', 'idempotencyKey']) || !revisionOf(v.expectedRevision)
    || typeof v.idempotencyKey !== 'string' || !/^[A-Za-z0-9._:-]{1,128}$/.test(v.idempotencyKey)) return undefined;
  const bands = parseMealMomentBands(v.bands);
  return bands ? { bands, expectedRevision: v.expectedRevision, idempotencyKey: v.idempotencyKey } : undefined;
}
export function parseMealMomentBandsConflict(v: unknown): MealMomentBandsConflict | undefined {
  if (!record(v) || !exactKeys(v, ['error', 'message', 'current']) || typeof v.message !== 'string'
    || !['MEAL_MOMENT_BANDS_CHANGED', 'IDEMPOTENCY_KEY_REUSED'].includes(String(v.error))) return undefined;
  const current = v.current === null ? null : parseMealMomentBandsSnapshot(v.current);
  return current === undefined ? undefined : { error: v.error as MealMomentBandsConflict['error'], message: v.message, current };
}
/** The moment a clock time (minutes since midnight) falls in; none outside the bands. */
export function mealMomentAtMinute(minute: number, bands: MealMomentBands = DEFAULT_MEAL_MOMENT_BANDS): MealMoment | undefined {
  if (minute < bands.breakfastFrom || minute >= bands.dinnerUntil) return undefined;
  return minute < bands.lunchFrom ? 'breakfast' : minute < bands.snackFrom ? 'lunch' : minute < bands.dinnerFrom ? 'snack' : 'dinner';
}
