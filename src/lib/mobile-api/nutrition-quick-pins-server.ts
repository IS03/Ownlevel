import 'server-only';
import { NextResponse } from 'next/server';
import { MobileApiUnauthorizedError, MobileApiValidationError, mobileBearerToken } from './auth';
import { authenticateMobileMutationAccessToken } from './supabase';
import { mobileApiResponseHeaders, readMobileJson } from './http';
import { parseQuickPinsConflict, parseQuickPinsSnapshot, parseQuickPinsWrite } from './nutrition-quick-contract';

const VALIDATION = 'Revisá las comidas fijadas.';
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/**
 * #479 · PUT /api/mobile/v1/nutrition/quick-pins. Identity only from the Bearer token; the RPC owns ownership, CAS on the
 * revision and idempotency. 200 = confirmed pins (a replay returns the stored receipt), 409 = an explicit refusal with server
 * truth when available, 400 = invalid request, 401 = session, 503 = outcome unknown (the same key can be replayed safely).
 */
export async function quickPinsPutResponse(request: Request) {
  let status = 503; let body: unknown = { error: 'DATA_UNAVAILABLE' };
  try {
    const auth = await authenticateMobileMutationAccessToken(mobileBearerToken(request.headers.get('authorization')));
    const input = parseQuickPinsWrite(await readMobileJson(request));
    if (!input) throw new MobileApiValidationError(VALIDATION);
    const { data, error } = await auth.supabase.rpc('mobile_put_quick_pins', {
      p_saved_meal_ids: input.savedMealIds, p_expected_revision: input.expectedRevision, p_idempotency_key: input.idempotencyKey,
    });
    if (error) {
      if (['22023', '22P02'].includes(error.code)) throw new MobileApiValidationError(VALIDATION);
      if (error.code === 'PT401') throw new MobileApiUnauthorizedError();
      // The first-row or update CAS lost outside the mutex: nothing was written; the app re-reads the GET.
      if (error.code === '40001' && error.message?.includes('QUICK_PINS_CHANGED')) {
        status = 409; body = { error: 'QUICK_PINS_CHANGED', message: 'Tus fijadas cambiaron en otro dispositivo.', current: null };
        return NextResponse.json(body, { status, headers: mobileApiResponseHeaders(request) });
      }
      throw new Error('Quick pins unavailable');
    }
    const row = Array.isArray(data) && data.length === 1 && record(data[0]) ? data[0] : null;
    if (row?.response_status === 200) {
      const receipt = parseQuickPinsSnapshot(row.response_body);
      // A receipt must be the list that was asked for, in that order (a replay included).
      if (!receipt || receipt.items.map(i => i.id).join() !== input.savedMealIds.join() || receipt.revision < input.expectedRevision) throw new Error('Invalid quick pins receipt');
      status = 200; body = receipt;
    } else if (row?.response_status === 409) {
      const conflict = parseQuickPinsConflict(row.response_body); if (!conflict) throw new Error('Invalid quick pins conflict');
      status = 409; body = conflict;
    } else throw new Error('Invalid quick pins response');
  } catch (error) {
    if (error instanceof MobileApiUnauthorizedError) { status = 401; body = { error: 'UNAUTHORIZED' }; }
    else if (error instanceof MobileApiValidationError) { status = 400; body = { error: 'VALIDATION_ERROR', message: error.message }; }
    else { status = 503; body = { error: 'DATA_UNAVAILABLE' }; console.warn('[mobile.nutrition.quick-pins] unavailable'); }
  }
  return NextResponse.json(body, { status, headers: mobileApiResponseHeaders(request) });
}
