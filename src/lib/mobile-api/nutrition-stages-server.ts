import 'server-only';
import { NextResponse } from 'next/server';
import { mobileBearerToken, MobileApiUnauthorizedError, MobileApiValidationError } from './auth';
import { authenticateMobileMutationAccessToken } from './supabase';
import { mobileApiResponseHeaders, readMobileJson } from './http';
import { configRecord } from './nutrition-config-contract';
import { parseNutritionStages, parseStagesIntent, parseStagesResult } from './nutrition-stages-contract';

export async function nutritionStagesResponse(request: Request) {
  let status = 503, body: unknown = { error: 'DATA_UNAVAILABLE' };
  // Opt-in shape v2: the protein training extra and optional water. Without it, every read and write stays v1.
  const v2 = new URL(request.url).searchParams.get('targets') === '2';
  try {
    const auth = await authenticateMobileMutationAccessToken(mobileBearerToken(request.headers.get('authorization')));
    if (request.method === 'GET') {
      const { data, error } = await auth.supabase.rpc(v2 ? 'mobile_read_nutrition_stages_v2' : 'mobile_read_nutrition_stages', {}, { get: true });
      const list = error ? undefined : v2 ? parseNutritionStages(data, 2) : parseNutritionStages(data);
      if (!list) throw new Error('Invalid nutrition stages snapshot');
      status = 200; body = list;
    } else {
      const raw = await readMobileJson(request);
      const intent = v2 ? parseStagesIntent(raw, 2) : parseStagesIntent(raw);
      if (!intent) throw new MobileApiValidationError('Revisá los datos de las etapas.');
      const { data, error } = await auth.supabase.rpc(v2 ? 'mobile_mutate_nutrition_stages_v2' : 'mobile_mutate_nutrition_stages', { p_intent: intent });
      if (error) {
        if (['22023', '22P02', '22003', '23514', '22008', '22007'].includes(error.code)) throw new MobileApiValidationError('Revisá los valores y las fechas de las etapas.');
        if (error.code === 'PT401') throw new MobileApiUnauthorizedError();
        throw new Error('Nutrition stages write unavailable');
      }
      const row = Array.isArray(data) && data.length === 1 && configRecord(data[0]) ? data[0] : undefined;
      const result = v2 ? parseStagesResult(row?.response_body, 2) : parseStagesResult(row?.response_body);
      if (!result || typeof row?.replayed !== 'boolean') throw new Error('Invalid stages receipt');
      if (result.status === 'confirmed' && row.response_status === 200 && result.operation === intent.operation && result.date === intent.date && result.list.listVersion >= intent.expectedListVersion) {
        status = 200; body = result;
      } else if (result.status === 'conflict' && row.response_status === 409) {
        status = 409; body = result;
      } else if (result.status === 'validation' && row.response_status === 400) {
        status = 400; body = result;
      } else throw new Error('Stages receipt mismatch');
    }
  } catch (error) {
    if (error instanceof MobileApiUnauthorizedError) { status = 401; body = { error: 'UNAUTHORIZED' }; }
    else if (error instanceof MobileApiValidationError) { status = 400; body = { status: 'validation', message: error.message }; }
    else console.warn('[mobile.nutrition.stages] unavailable'); // Never log payloads or tokens.
  }
  return NextResponse.json(body, { status, headers: mobileApiResponseHeaders(request) });
}
