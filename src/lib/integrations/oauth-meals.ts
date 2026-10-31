import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ChatgptMealInput, ChatgptMealSuccess } from "./chatgpt-contract";
import { PossibleDuplicateError } from "./chatgpt-meals";
import { callMealRpc } from "./meal-rpc";
import { OAuthPermissionDeniedError, oauthIdentityParameters, type OAuthMealIdentity } from "./oauth-auth";

export async function persistOAuthMeal(admin: SupabaseClient, identity: OAuthMealIdentity, meal: ChatgptMealInput): Promise<ChatgptMealSuccess> {
  const { data, error } = await callMealRpc(admin, "create_chatgpt_meal_for_oauth_v2", "create_chatgpt_meal_for_oauth_v3", {
    ...oauthIdentityParameters(identity), p_log_date: meal.date,
    p_title: meal.title, p_description: meal.description, p_calories: meal.calories,
    p_protein_g: meal.protein_g, p_carbs_g: meal.carbs_g, p_fat_g: meal.fat_g,
    p_idempotency_key: meal.idempotency_key, p_force_duplicate: meal.force_duplicate,
    p_consumed_at: meal.consumed_at, p_meal_label: meal.meal_type,
  }, meal);
  if (error?.code === "42501") throw new OAuthPermissionDeniedError();
  if (error?.message.includes("possible_duplicate")) throw new PossibleDuplicateError();
  if (error) {
    // SQLSTATE only: never the message, which can echo the payload.
    console.error("[ownlevel-chatgpt-api] persist_failed", { via: "oauth", code: error.code ?? "unknown" });
    throw new Error("No se pudo persistir la comida.");
  }
  const result = data as ChatgptMealSuccess;
  return { ok: true, created: result.created, idempotent_replay: result.idempotent_replay, meal: result.meal };
}
