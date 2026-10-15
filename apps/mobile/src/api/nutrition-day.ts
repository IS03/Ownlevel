import {
  isNutritionDate,
  parseMobileNutritionDayResponse,
} from '../../../../src/lib/mobile-api/nutrition-day-contract';
import type { MobileApiClient } from './client';

export { isNutritionDate, parseMobileNutritionDayResponse };
export type {
  MobileNutritionDayResponse, NutritionDayData, NutritionDayMetric, NutritionDayMeal,
  NutritionDayContext, NutritionDaySummary, NutritionNutrientTotal,
} from '../../../../src/lib/mobile-api/nutrition-day-contract';

export function fetchMobileNutritionDay(client: MobileApiClient, date: string, signal?: AbortSignal) {
  return client.read({
    path: `/api/mobile/v1/nutrition/days/${encodeURIComponent(date)}`,
    parse: value => {
      const data = parseMobileNutritionDayResponse(value);
      return data?.date === date ? data : undefined;
    },
    signal,
  });
}
