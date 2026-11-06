import 'server-only';
import { NextResponse } from 'next/server';
import { MobileApiUnauthorizedError, MobileApiValidationError, mobileBearerToken } from './auth';
import { authenticateMobileMutationAccessToken } from './supabase';
import { mobileApiResponseHeaders, readMobileJson } from './http';
import { parseDayWriteIntent, parseDayWriteResponse, splitSleepNights, type DayWriteIntent } from './nutrition-day-write-contract';
export async function nutritionDayWriteResponse(request: Request, operation: DayWriteIntent['operation'], date: string) {
  let status = 503;
  let body: unknown = { error: 'DATA_UNAVAILABLE' };
  try {
    const context = await authenticateMobileMutationAccessToken(mobileBearerToken(request.headers.get('authorization')));
    const intent = parseDayWriteIntent(await readMobileJson(request));
    if (!intent || intent.operation !== operation || intent.date !== date) throw new MobileApiValidationError('Revisá los cambios de esta fecha.');
    const { intent: written, sleepNightMetricIds } = splitSleepNights(intent);
    // Only a client that showed the convention declares a night, in the same transaction as the write (#367).
    const { data, error } = sleepNightMetricIds.length
      ? await context.supabase.rpc('mobile_mutate_nutrition_day_v2', { p_intent: written, p_sleep_night_metric_ids: sleepNightMetricIds })
      : await context.supabase.rpc('mobile_mutate_nutrition_day', { p_intent: written });
    if (error) {
      if (['22023','22007','22008','22P02','22003','23514'].includes(error.code)) throw new MobileApiValidationError('Revisá los valores y sus límites.');
      throw new Error('Day mutation unavailable');
    }
    const receipt = Array.isArray(data) && data.length === 1 ? data[0] : null;
    const parsed = parseDayWriteResponse(receipt?.response_body);
    if (!parsed || (receipt.response_status === 200 ? !('status' in parsed) || parsed.date !== date || parsed.operation !== operation
      : receipt.response_status !== 409 || !('error' in parsed))) throw new Error('Invalid day receipt');
    status = receipt.response_status; body = parsed;
  } catch (error) {
    if (error instanceof MobileApiUnauthorizedError) { status = 401; body = { error: 'UNAUTHORIZED' }; }
    else if (error instanceof MobileApiValidationError) { status = 400; body = { error: 'VALIDATION_ERROR', message: error.message }; }
    else console.warn('[mobile.nutrition.day.write] unavailable');
  }
  return NextResponse.json(body, { status, headers: mobileApiResponseHeaders(request) });
}
