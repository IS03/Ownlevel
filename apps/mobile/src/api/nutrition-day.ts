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

export function notifyTodayNutrition(data: MobileNutritionDayResponse) {
  if (data.date === data.today) todayListeners.forEach(listener => { try { listener(data); } catch { /* a listener never breaks the read */ } });
}

export function fetchMobileNutritionWeek(client: MobileApiClient, dates: readonly string[], signal: AbortSignal) {
  const from = dates[0], to = dates[dates.length - 1];
  return client.read({
    path: `/api/mobile/v1/nutrition/days?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
    parse: value => {
      if (typeof value !== 'object' || value === null || !('from' in value) || value.from !== from
        || !('to' in value) || value.to !== to || !('days' in value) || !Array.isArray(value.days) || value.days.length !== dates.length) return undefined;
      const days = value.days.map(parseMobileNutritionDayResponse);
      const confirmed: MobileNutritionDayResponse[] = [];
      for (const [index, day] of days.entries()) {
        if (!day || day.date !== dates[index]) return undefined;
        confirmed.push(day);
      }
      return confirmed;
    },
    signal,
    background: true,
  });
}

export function fetchMobileNutritionDay(client: MobileApiClient, date: string, signal?: AbortSignal, background = false) {
  return client.read({
    path: `/api/mobile/v1/nutrition/days/${encodeURIComponent(date)}`,
    parse: value => {
      const data = parseMobileNutritionDayResponse(value);
      if (data?.date !== date) return undefined;
      notifyTodayNutrition(data);
      return data;
    },
    signal,
    ...(background ? { background: true } : {}),
  });
}
