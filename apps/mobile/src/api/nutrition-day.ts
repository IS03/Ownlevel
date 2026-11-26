import {
  isNutritionDate,
  parseMobileNutritionDayResponse,
} from '../../../../src/lib/mobile-api/nutrition-day-contract';
import type { MobileApiClient } from './client';
import type { MobileNutritionDayResponse } from '../../../../src/lib/mobile-api/nutrition-day-contract';

export { isNutritionDate, parseMobileNutritionDayResponse };
export type {
  MobileNutritionDayResponse, NutritionDayData, NutritionDayMetric, NutritionDayMeal,
  NutritionDayContext, NutritionDayBreakdown, NutritionDayFactor, NutritionDaySummary, NutritionNutrientTotal,
} from '../../../../src/lib/mobile-api/nutrition-day-contract';

type TodayListener = (data: MobileNutritionDayResponse) => void;
const todayListeners = new Set<TodayListener>();
/**
 * #639 · Every confirmed reading of today's day, as it arrives (the reminders cancel today's «Cerrar el día» with it). A
 * listener only ever sees a full, parsed response for the date the server calls today.
 */
export function observeTodayNutrition(listener: TodayListener) { todayListeners.add(listener); return () => { todayListeners.delete(listener); }; }

export function fetchMobileNutritionDay(client: MobileApiClient, date: string, signal?: AbortSignal, background = false) {
  return client.read({
    path: `/api/mobile/v1/nutrition/days/${encodeURIComponent(date)}`,
    parse: value => {
      const data = parseMobileNutritionDayResponse(value);
      if (data?.date !== date) return undefined;
      if (data.date === data.today) todayListeners.forEach(listener => { try { listener(data); } catch { /* a listener never breaks the read */ } });
      return data;
    },
    signal,
    ...(background ? { background: true } : {}),
  });
}
