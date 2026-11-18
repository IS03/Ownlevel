import 'server-only';
import { NextResponse } from 'next/server';
import { MobileApiUnauthorizedError, MobileApiValidationError, mobileBearerToken } from './auth';
import { authenticateMobileMutationAccessToken } from './supabase';
import { mobileApiResponseHeaders, readMobileJson } from './http';
import { parseMealMomentBandsConflict, parseMealMomentBandsSnapshot, parseMealMomentBandsWrite } from './nutrition-moment-bands-contract';

const VALIDATION = 'Revisá los horarios de las comidas.';
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/**
 * GET /api/mobile/v1/nutrition/moment-bands. Identity only from the Bearer token; the row is read through RLS.
 * 200 = { status: 'ok', revision, bands } (bands null with revision 0: never written, the app uses the defaults);
 * 200 = { status: 'unavailable' } when the preference cannot be read (the app keeps the defaults, never pretends they are
 * the person's own); 401 = session.
 */
export async function mealMomentBandsGetResponse(request: Request) {
  let status = 200; let body: unknown = { status: 'unavailable' };
  try {
    const auth = await authenticateMobileMutationAccessToken(mobileBearerToken(request.headers.get('authorization')));
    const { data, error } = await auth.supabase.rpc('mobile_read_meal_moment_bands', {}, { get: true });
    if (error?.code === 'PT401') throw new MobileApiUnauthorizedError();
    const snapshot = !error ? parseMealMomentBandsSnapshot(data) : undefined;
    if (snapshot) body = { status: 'ok', ...snapshot };
    else console.warn('[mobile.nutrition.moment-bands] read unavailable');
  } catch (error) {
    if (error instanceof MobileApiUnauthorizedError) { status = 401; body = { error: 'UNAUTHORIZED' }; }
    else console.warn('[mobile.nutrition.moment-bands] read unavailable');
  }
  return NextResponse.json(body, { status, headers: mobileApiResponseHeaders(request) });
}

/**
 * PUT /api/mobile/v1/nutrition/moment-bands. The RPC owns ownership, CAS on the revision and idempotency. 200 = confirmed
 * bands (a replay returns the stored receipt), 409 = an explicit refusal with server truth when available, 400 = invalid,
 * 401 = session, 503 = outcome unknown (the same key can be replayed safely).
 */
export async function mealMomentBandsPutResponse(request: Request) {
  let status = 503; let body: unknown = { error: 'DATA_UNAVAILABLE' };
  try {
    const auth = await authenticateMobileMutationAccessToken(mobileBearerToken(request.headers.get('authorization')));
    const input = parseMealMomentBandsWrite(await readMobileJson(request));
    if (!input) throw new MobileApiValidationError(VALIDATION);
    const { bands } = input;
    const { data, error } = await auth.supabase.rpc('mobile_put_meal_moment_bands', {
      p_breakfast_from: bands.breakfastFrom, p_lunch_from: bands.lunchFrom, p_snack_from: bands.snackFrom, p_dinner_from: bands.dinnerFrom,
      p_dinner_until: bands.dinnerUntil, p_expected_revision: input.expectedRevision, p_idempotency_key: input.idempotencyKey,
    });
    if (error) {
      if (['22023', '22P02', '23514'].includes(error.code)) throw new MobileApiValidationError(VALIDATION);
      if (error.code === 'PT401') throw new MobileApiUnauthorizedError();
      // The first-row or update CAS lost outside the lock: nothing was written; the app re-reads the GET.
      if (error.code === '40001' && error.message?.includes('MEAL_MOMENT_BANDS_CHANGED')) {
        status = 409; body = { error: 'MEAL_MOMENT_BANDS_CHANGED', message: 'Tus horarios cambiaron en otro dispositivo.', current: null };
        return NextResponse.json(body, { status, headers: mobileApiResponseHeaders(request) });
      }
      throw new Error('Meal moment bands unavailable');
    }
    const row = Array.isArray(data) && data.length === 1 && record(data[0]) ? data[0] : null;
    if (row?.response_status === 200) {
      const receipt = parseMealMomentBandsSnapshot(row.response_body);
      // A receipt must hold the bands that were asked for (a replay included).
      if (!receipt?.bands || JSON.stringify(receipt.bands) !== JSON.stringify(bands) || receipt.revision < input.expectedRevision) throw new Error('Invalid meal moment bands receipt');
      status = 200; body = receipt;
    } else if (row?.response_status === 409) {
      const conflict = parseMealMomentBandsConflict(row.response_body); if (!conflict) throw new Error('Invalid meal moment bands conflict');
      status = 409; body = conflict;
    } else throw new Error('Invalid meal moment bands response');
  } catch (error) {
    if (error instanceof MobileApiUnauthorizedError) { status = 401; body = { error: 'UNAUTHORIZED' }; }
    else if (error instanceof MobileApiValidationError) { status = 400; body = { error: 'VALIDATION_ERROR', message: error.message }; }
    else { status = 503; body = { error: 'DATA_UNAVAILABLE' }; console.warn('[mobile.nutrition.moment-bands] write unavailable'); }
  }
  return NextResponse.json(body, { status, headers: mobileApiResponseHeaders(request) });
}
