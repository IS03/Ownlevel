import "server-only";
import { TIMING_BANDS, type NutritionTiming, type TimingBandKey } from "./progress-contract";
import { nutritionMealTimeKnown } from "./nutrition-meal-time";
import type { MobileSupabaseAuthenticatedContext } from "./supabase";

type Meal = {
  id: string; user_id: string; consumed_at: string | null; entry_kind: string | null; deleted_at: string | null; raw_input: unknown; meal_label: string | null;
  final_calories: number | string | null; final_protein_g: number | string | null; final_carbs_g: number | string | null; final_fat_g: number | string | null;
  day_logs: { user_id: string; log_date: string };
};
/** One active meal of the user in the period (no deletions, no legacy daily summaries). null nutrient = unknown, never 0. */
export type MealRow = {
  logDate: string; mealLabel: string | null; band: TimingBandKey | null;
  kcal: number | null; proteinG: number | null; carbsG: number | null; fatG: number | null;
};
const hourInCordoba = new Intl.DateTimeFormat("en-GB", { timeZone: "America/Argentina/Cordoba", hour: "2-digit", hourCycle: "h23" });
const nutrient = (value: Meal["final_protein_g"] | undefined) => {
  if (value === null || value === undefined) return null;
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number) || number < 0) throw new Error("Invalid meal nutrient");
  return number;
};
/** Mañana 5–11, Mediodía 11–15, Tarde 15–20, Noche 20–5, in Córdoba time. */
function bandOf(consumedAt: string): TimingBandKey {
  const date = new Date(consumedAt);
  if (!Number.isFinite(date.getTime())) throw new Error("Invalid meal time");
  const hour = Number(hourInCordoba.format(date));
  return TIMING_BANDS[hour >= 5 && hour < 11 ? 0 : hour >= 11 && hour < 15 ? 1 : hour >= 15 && hour < 20 ? 2 : 3];
}

/** Token-scoped RLS read, paged with a total order; range membership always uses the day log's date. */
export async function readMealRows(context: MobileSupabaseAuthenticatedContext, range: { start: string; end: string }): Promise<MealRow[]> {
  const rows: MealRow[] = [];
  let offset = 0;
  for (let page = 0; ; page++) {
    if (page >= 1000) throw new Error("Too many nutrition timing pages");
    const { data, error } = await context.supabase.from("meal_entries")
      .select("id,user_id,consumed_at,raw_input,entry_kind,deleted_at,meal_label,final_calories,final_protein_g,final_carbs_g,final_fat_g,day_logs!inner(log_date,user_id)")
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
      const timed = !!meal.consumed_at && nutritionMealTimeKnown(meal.raw_input, meal.entry_kind);
      rows.push({ logDate: meal.day_logs.log_date, mealLabel: meal.meal_label ?? null, band: timed ? bandOf(meal.consumed_at!) : null,
        kcal: nutrient(meal.final_calories), proteinG: nutrient(meal.final_protein_g), carbsG: nutrient(meal.final_carbs_g), fatG: nutrient(meal.final_fat_g) });
    }
  }
  return rows;
}

export async function readNutritionTiming(context: MobileSupabaseAuthenticatedContext, range: { start: string; end: string }): Promise<NutritionTiming> {
  const bands = TIMING_BANDS.map(key => ({ key, kcal: 0, proteinG: 0, kcalShare: null as number | null, proteinShare: null as number | null }));
  const rows = await readMealRows(context, range);
  let mealsWithTime = 0;
  for (const meal of rows) {
    if (!meal.band) continue;
    mealsWithTime++;
    const band = bands[TIMING_BANDS.indexOf(meal.band)];
    if (meal.kcal !== null) band.kcal += meal.kcal;
    if (meal.proteinG !== null) band.proteinG += meal.proteinG;
  }
  const kcal = bands.reduce((sum, b) => sum + b.kcal, 0), proteinG = bands.reduce((sum, b) => sum + b.proteinG, 0);
  for (const band of bands) { band.kcalShare = kcal === 0 ? null : band.kcal / kcal; band.proteinShare = proteinG === 0 ? null : band.proteinG / proteinG; }
  return { meals: rows.length, mealsWithTime, kcal, proteinG, bands };
}
