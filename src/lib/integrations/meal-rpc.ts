import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ChatgptMealInput } from "./chatgpt-contract";

/**
 * #367: a time the user stated goes through v4, which records that statement. Without the statement, or until that EXPAND
 * is applied, it stays on v2 and the time keeps an unknown origin: a time arriving does not say who chose it.
 *
 * #308: a meal eaten now goes through v3, which records the registration instant as its approximate time. Until
 * that EXPAND is applied (PGRST202, function missing) it falls back to v2: the previous behavior, time not reported.
 * v3 takes no consumed_at (the database clock sets it) and the same remaining arguments as v2.
 */
export async function callMealRpc(admin: SupabaseClient, v2: string, v3: string, args: Record<string, unknown>, meal: ChatgptMealInput) {
  if (meal.time_stated && meal.consumed_at) {
    const result = await admin.rpc(v2.replace(/_v2$/, "_v4"), { ...args, p_time_source: "user_declared" });
    if (result.error?.code !== "PGRST202") return result;
  }
  if (meal.consumed_now) {
    const { p_consumed_at: _explicitTimeIsNullHere, ...rest } = args;
    const result = await admin.rpc(v3, { ...rest, p_time_source: "registration" });
    if (result.error?.code !== "PGRST202") return result;
  }
  return admin.rpc(v2, args);
}
