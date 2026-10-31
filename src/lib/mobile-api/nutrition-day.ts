import { nutritionMealTimeKnown, nutritionMealTimeSource } from "./nutrition-meal-time";
import { MobileApiValidationError } from "./auth";
import {
  isNutritionDate,
  parseNutritionDayActivity,
  parseNutritionDayData,
  type MobileNutritionDayResponse,
  type NutritionDayData,
  type NutritionReadResult,
} from "./nutrition-day-contract";

const record = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

export function parseNutritionDate(value: unknown): string {
  if (!isNutritionDate(value)) throw new MobileApiValidationError("Fecha inválida. Usá YYYY-MM-DD.");
  return value;
}


function nutritionData(raw: unknown, date: string): NutritionDayData | undefined {
  if (!record(raw) || !Array.isArray(raw.meals)) return undefined;
  if (raw.dayLog === null) return parseNutritionDayData({ dayState: "missing", summary: null, context: null, meals: raw.meals });
  if (!record(raw.dayLog) || raw.dayLog.log_date !== date) return undefined;
  const d = raw.dayLog;
  if (raw.meals.some(m => !record(m) || m.day_log_id !== d.id || m.deleted_at !== null)) return undefined;
  const meals = (raw.meals as Record<string, unknown>[]).map(m => ({
    id: m.id, title: m.title, description: m.description,
    calories: m.final_calories, proteinG: m.final_protein_g, carbsG: m.final_carbs_g, fatG: m.final_fat_g,
    consumedAt: m.consumed_at, updatedAt: m.updated_at,
    timeKnown: nutritionMealTimeKnown(m.raw_input, m.entry_kind), timeSource: nutritionMealTimeSource(m.raw_input, m.entry_kind),
    entryKind: m.entry_kind,
    sourceType: m.source_type, precision: m.precision_level, mealLabel: m.meal_label,
  }));
  // Totals remain canonical persisted aggregates. Only coverage is derived here.
  const total = (knownTotal: unknown, field: "calories" | "proteinG" | "carbsG" | "fatG") => ({
    knownTotal, missingCount: meals.filter(m => m[field] === null).length,
  });
  return parseNutritionDayData({
    dayState: "recorded", meals,
    summary: {
      calories: total(d.total_calories_consumed, "calories"), proteinG: total(d.total_protein_g, "proteinG"),
      carbsG: total(d.total_carbs_g, "carbsG"), fatG: total(d.total_fat_g, "fatG"),
      entryCount: meals.length, mealCount: meals.filter(m => m.entryKind === "meal").length,
    },
    context: {
      ...(d.updated_at !== undefined ? { updatedAt: d.updated_at } : {}), calorieTarget: d.nutrition_target_kcal_snapshot, proteinTargetG: d.protein_target_g_snapshot, waterTargetL: d.water_target_l_snapshot,
      deltaVsTargetKcal: d.delta_vs_nutrition_target, expenditureKcal: d.estimated_expenditure_kcal_snapshot, energyBalanceKcal: d.energy_balance_kcal,
      targetAutomaticKcal: d.nutrition_target_automatic_kcal_snapshot, targetOverrideKcal: d.nutrition_target_override_kcal,
      expenditureAutomaticKcal: d.estimated_expenditure_automatic_kcal_snapshot, expenditureOverrideKcal: d.expenditure_override_kcal,
      training: { effective: d.gym_effective_snapshot, source: d.gym_source_snapshot },
      work: { effective: d.work_effective_snapshot, source: d.work_source_snapshot }, resolvedAt: d.nutrition_resolved_at,
    },
  });
}

function section<T>(raw: unknown, parse: (v: unknown) => T | undefined): NutritionReadResult<T> {
  if (!record(raw) || raw.status !== "ok") return { status: "unavailable" };
  const data = parse(raw.data);
  return data === undefined ? { status: "unavailable" } : { status: "ok", data };
}

export function buildMobileNutritionDayResponse(date: string, raw: unknown): MobileNutritionDayResponse {
  if (!record(raw) || raw.date !== date || !isNutritionDate(raw.today)) throw new Error("Nutrition day snapshot unavailable");
  const nutrition = section(raw.nutrition, v => nutritionData(v, date));
  const activity = section(raw.activity, parseNutritionDayActivity);
  if (nutrition.status === "unavailable" && activity.status === "unavailable") throw new Error("Nutrition day snapshot unavailable");
  return { date, today: raw.today, nutrition, activity };
}
