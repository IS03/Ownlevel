import "server-only";
import { TIMING_BANDS, type NutritionTiming } from "./progress-contract";
import { nutritionMealTimeKnown } from "./nutrition-meal-time";
import type { MobileSupabaseAuthenticatedContext } from "./supabase";

type Meal = {
  id: string; user_id: string; consumed_at: string | null; entry_kind: string | null; deleted_at: string | null; raw_input: unknown;
  final_calories: number | string | null; final_protein_g: number | string | null;
  day_logs: { user_id: string; log_date: string };
};
const hourInCordoba = new Intl.DateTimeFormat("en-GB", { timeZone: "America/Argentina/Cordoba", hour: "2-digit", hourCycle: "h23" });
const nutrient = (value: Meal["final_protein_g"]) => {
  if (value === null) return null;
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number) || number < 0) throw new Error("Invalid meal nutrient");
  return number;
};

/** Token-scoped RLS read, paged with a total order; range membership always uses the day log's date. */
export async function readNutritionTiming(context: MobileSupabaseAuthenticatedContext, range: { start: string; end: string }): Promise<NutritionTiming> {
  const bands = TIMING_BANDS.map(key => ({ key, kcal: 0, proteinG: 0, kcalShare: null as number | null, proteinShare: null as number | null }));
  let meals = 0, mealsWithTime = 0, offset = 0;
  for (let page = 0; ; page++) {
    if (page >= 1000) throw new Error("Too many nutrition timing pages");
    const { data, error } = await context.supabase.from("meal_entries")
      .select("id,user_id,consumed_at,raw_input,entry_kind,deleted_at,final_calories,final_protein_g,day_logs!inner(log_date,user_id)")
      .eq("user_id", context.userId).eq("day_logs.user_id", context.userId)
      .is("deleted_at", null).gte("day_logs.log_date", range.start).lte("day_logs.log_date", range.end)
      .order("id", { ascending: true }).range(offset, offset + 999);
    if (error) throw new Error("Nutrition timing unavailable", { cause: error });
    if (!data) throw new Error("Nutrition timing missing read");
    if (!data.length) break;
    offset += data.length;
    for (const meal of data as unknown as Meal[]) {
      if (meal.user_id !== context.userId || meal.day_logs?.user_id !== context.userId || meal.day_logs.log_date < range.start || meal.day_logs.log_date > range.end) throw new Error("Invalid nutrition timing ownership/range");
      if (meal.deleted_at !== null || meal.entry_kind === "legacy_daily_summary") continue;
      meals++;
      if (!meal.consumed_at || !nutritionMealTimeKnown(meal.raw_input, meal.entry_kind)) continue;
      const date = new Date(meal.consumed_at);
      if (!Number.isFinite(date.getTime())) throw new Error("Invalid meal time");
      mealsWithTime++;
      const hour = Number(hourInCordoba.format(date));
      const band = bands[hour >= 5 && hour < 11 ? 0 : hour >= 11 && hour < 15 ? 1 : hour >= 15 && hour < 20 ? 2 : 3];
      const kcal = nutrient(meal.final_calories), protein = nutrient(meal.final_protein_g);
      if (kcal !== null) band.kcal += kcal;
      if (protein !== null) band.proteinG += protein;
    }
  }
  const kcal = bands.reduce((sum, b) => sum + b.kcal, 0), proteinG = bands.reduce((sum, b) => sum + b.proteinG, 0);
  for (const band of bands) { band.kcalShare = kcal === 0 ? null : band.kcal / kcal; band.proteinShare = proteinG === 0 ? null : band.proteinG / proteinG; }
  return { meals, mealsWithTime, kcal, proteinG, bands };
}
