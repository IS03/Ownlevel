import "server-only";
import { MobileApiConflictError, MobileApiNotFoundError, MobileApiUnauthorizedError, MobileApiValidationError } from "./auth";
import { parseMobileTrainingId } from "./training";
import { parseFeelingsInput, parseFeelingsResponse } from "./training-feelings";
import type { MobileSupabaseAuthenticatedContext } from "./supabase";

function databaseError(error: { code?: string; message?: string }): never {
  if (error.message === "UNAUTHORIZED") throw new MobileApiUnauthorizedError();
  if (error.message === "TRAINING_SESSION_NOT_FOUND") throw new MobileApiNotFoundError();
  const conflicts = {
    FEELINGS_CHANGED: "Las sensaciones cambiaron. Comprobá lo guardado antes de reintentar.",
    SESSION_CHANGED: "La sesión cambió. Comprobá la versión guardada.",
    IDEMPOTENCY_KEY_REUSED: "La clave ya fue usada con otros datos.",
    SESSION_CLOSED: "La sesión ya no está en curso.", SESSION_DISCARDED: "La sesión fue eliminada.",
    NO_COMPLETED_SETS: "Marcá y guardá al menos una serie antes de finalizar.",
  } as const;
  if (error.message && Object.hasOwn(conflicts, error.message)) {
    const code = error.message as keyof typeof conflicts;
    throw new MobileApiConflictError(conflicts[code], code);
  }
  if (["22023", "22P02", "22007", "22008", "23514"].includes(error.code ?? "")) throw new MobileApiValidationError("Los datos de sensaciones no son válidos.");
  throw new Error("Training feelings unavailable", { cause: error });
}
function response(data: unknown, sessionId: string) {
  try {
    const parsed = parseFeelingsResponse(data);
    if (parsed.sessionId !== sessionId) throw new Error("Mismatched session");
    return parsed;
  } catch { throw new Error("Invalid training feelings database response"); }
}
export async function readTrainingFeelings(id: unknown, context: MobileSupabaseAuthenticatedContext) {
  const sessionId = parseMobileTrainingId(id, "La sesión").toLowerCase();
  const { data, error } = await context.supabase.rpc("read_training_feelings_v1", { p_session_id: sessionId });
  if (error) databaseError(error);
  return response(data, sessionId);
}
export async function writeTrainingFeelings(id: unknown, value: unknown, operation: "save" | "finish", context: MobileSupabaseAuthenticatedContext) {
  const sessionId = parseMobileTrainingId(id, "La sesión").toLowerCase();
  const input = operation === "save" ? parseFeelingsInput(value, "save") : parseFeelingsInput(value, "finish");
  const { data, error } = await context.supabase.rpc("mutate_training_feelings_v1", { p_session_id: sessionId, p_input: input });
  if (error) databaseError(error);
  if (!Array.isArray(data) || data.length !== 1 || data[0].response_status !== 200 || typeof data[0].replayed !== "boolean") throw new Error("Invalid training feelings receipt");
  const result = response(data[0].response_body, sessionId);
  if (operation === "finish" && result.sessionStatus !== "completed") throw new Error("Invalid training feelings finish receipt");
  return result;
}
