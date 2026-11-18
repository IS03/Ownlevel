import { DEFAULT_MEAL_MOMENT_BANDS, type MealMomentBands } from '../../../../src/lib/mobile-api/nutrition-moment-bands-contract';
/**
 * The meal moment bands the signed-in person confirmed, for code that suggests a moment outside React (new meal drafts,
 * Rápido). The fixed bands until they are read, when never set, when they cannot be read, and after signing out.
 * Written only by MealMomentBandsProvider with server-confirmed values.
 */
let current: MealMomentBands = DEFAULT_MEAL_MOMENT_BANDS;
export function currentMealMomentBands(): MealMomentBands { return current; }
export function adoptMealMomentBands(bands: MealMomentBands | null) { current = bands ?? DEFAULT_MEAL_MOMENT_BANDS; }
