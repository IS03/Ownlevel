import 'server-only';
import { MobileApiConflictError, MobileApiNotFoundError, MobileApiUnauthorizedError, MobileApiValidationError } from './auth';
import { parseMobileTrainingId } from './training';
import { parseFeelingsInput, parseFeelingsResponse } from './training-feelings';
import { parseFeelingsFinishEnvelope } from './training-feelings-finish-contract';
import type { MobileSupabaseAuthenticatedContext } from './supabase';

export async function finishTrainingFeelingsWithReceipt(id: unknown, value: unknown, context: MobileSupabaseAuthenticatedContext) {
  const sessionId = parseMobileTrainingId(id, 'La sesión').toLowerCase(), input = parseFeelingsInput(value, 'finish');
  const { data, error } = await context.supabase.rpc('finish_training_feelings_v2', { p_session_id: sessionId, p_input: input });
  if (error) {
    if (error.message === 'UNAUTHORIZED') throw new MobileApiUnauthorizedError();
    if (error.message === 'TRAINING_SESSION_NOT_FOUND') throw new MobileApiNotFoundError();
    if (['IDEMPOTENCY_KEY_REUSED','FEELINGS_CHANGED','SESSION_CHANGED','SESSION_CLOSED','SESSION_DISCARDED','NO_COMPLETED_SETS','FEELINGS_RECEIPT_VERSION_UNAVAILABLE'].includes(error.message))
      throw new MobileApiConflictError('Comprobá la operación original y el estado guardado antes de continuar.', error.message as ConstructorParameters<typeof MobileApiConflictError>[1]);
    if (['22023','22P02','22007','22008','23514'].includes(error.code)) throw new MobileApiValidationError('Los datos de sensaciones no son válidos.');
    throw new Error('Training finish receipt unavailable', { cause: error });
  }
  if (!Array.isArray(data) || data.length !== 1 || data[0].response_status !== 200 || typeof data[0].replayed !== 'boolean') throw Error('Invalid finish receipt');
  const result = parseFeelingsFinishEnvelope(data[0].response_body, parseFeelingsResponse);
  if (result.feelings.sessionId !== sessionId) throw Error('Wrong finish receipt session');
  return result;
}
