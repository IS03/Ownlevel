import "server-only";

import { createAdminClient } from "../supabase/admin";
import type { ChatgptMealInput, ChatgptMealSuccess } from "./chatgpt-contract";
import { PossibleDuplicateError } from "./chatgpt-meals";

export async function persistChatgptMeal(
  userId: string,
  meal: ChatgptMealInput,
): Promise<ChatgptMealSuccess> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("create_chatgpt_meal_for_integration_v2", {
    p_user_id: userId,
    p_log_date: meal.date,
    p_title: meal.title,
    p_description: meal.description,
    p_calories: meal.calories,
    p_protein_g: meal.protein_g,
    p_carbs_g: meal.carbs_g,
    p_fat_g: meal.fat_g,
    p_idempotency_key: meal.idempotency_key,
    p_force_duplicate: meal.force_duplicate,
    p_consumed_at: meal.consumed_at,
    p_meal_label: meal.meal_type,
  });
  if (error?.message.includes("possible_duplicate")) {
    throw new PossibleDuplicateError();
  }
  if (error) {
    // SQLSTATE only: never the message, which can echo the payload.
    console.error("[ownlevel-chatgpt-api] persist_failed", { via: "token", code: error.code ?? "unknown" });
    throw new Error("No se pudo persistir la comida.");
  }
  const result = data as ChatgptMealSuccess;
  return {
    ok: true,
    created: result.created,
    idempotent_replay: result.idempotent_replay,
    meal: {
      id: result.meal.id,
      date: result.meal.date,
      title: result.meal.title,
      calories: result.meal.calories,
      protein_g: result.meal.protein_g,
      carbs_g: result.meal.carbs_g,
      fat_g: result.meal.fat_g,
    },
  };
}
