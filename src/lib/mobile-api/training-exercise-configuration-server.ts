import "server-only";
import { MobileApiConflictError, MobileApiNotFoundError, MobileApiUnauthorizedError, MobileApiValidationError } from "./auth";
import { parseMobileTrainingId } from "./training";
import { parseConfigurationInput, parseConfigurationsResponse, TrainingExerciseConfigurationValidationError } from "./training-exercise-configuration-contract";
import type { MobileSupabaseAuthenticatedContext } from "./supabase";

function databaseError(error: { code?: string; message?: string }): never {
  if (error.message === "UNAUTHORIZED") throw new MobileApiUnauthorizedError();
  if (error.message === "TRAINING_SESSION_NOT_FOUND" || error.message === "SESSION_EXERCISE_NOT_FOUND") throw new MobileApiNotFoundError();
  const conflicts = {
    CONFIGURATION_CHANGED: "La variante cambió en otro lugar. Mostramos la guardada.",
    IDEMPOTENCY_KEY_REUSED: "La clave ya fue usada con otros datos.",
    SESSION_DISCARDED: "La sesión fue eliminada.",
    REPEATED_CONFIGURATION_MISMATCH: "La variante anterior ya no coincide. Elegila de nuevo.",
  } as const;
  if (error.message && Object.hasOwn(conflicts, error.message)) {
    const code = error.message as keyof typeof conflicts;
    throw new MobileApiConflictError(conflicts[code], code);
  }
  if (["22023", "22P02", "23514"].includes(error.code ?? "")) throw new MobileApiValidationError("La variante no es válida.");
  throw new Error("Training exercise configuration unavailable", { cause: error });
}
function response(data: unknown, sessionId: string) {
  try {
    const parsed = parseConfigurationsResponse(data);
    if (parsed.sessionId !== sessionId) throw new Error("Mismatched session");
    return parsed;
  } catch { throw new Error("Invalid training exercise configuration database response"); }
}
export async function readExerciseConfigurations(id: unknown, context: MobileSupabaseAuthenticatedContext) {
  const sessionId = parseMobileTrainingId(id, "La sesión").toLowerCase();
  const { data, error } = await context.supabase.rpc("read_training_exercise_configurations_v1", { p_session_id: sessionId });
  if (error) databaseError(error);
  return response(data, sessionId);
}
export async function writeExerciseConfiguration(id: unknown, value: unknown, context: MobileSupabaseAuthenticatedContext) {
  const sessionId = parseMobileTrainingId(id, "La sesión").toLowerCase();
  let input;
  try { input = parseConfigurationInput(value); }
  catch (error) { if (error instanceof TrainingExerciseConfigurationValidationError) throw new MobileApiValidationError(error.message); throw error; }
  const { data, error } = await context.supabase.rpc("mutate_training_exercise_configuration_v1", { p_session_id: sessionId, p_input: input });
  if (error) databaseError(error);
  if (!Array.isArray(data) || data.length !== 1 || data[0].response_status !== 200 || typeof data[0].replayed !== "boolean") throw new Error("Invalid training exercise configuration receipt");
  return response(data[0].response_body, sessionId);
}
