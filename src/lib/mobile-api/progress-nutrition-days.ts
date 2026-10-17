import type { NutritionReportDay } from "@/lib/nutrition/reports-core";

/** Complete days with meals and a known measure, shared by overview, Explore and connections.
 * The canonical report builder decides meal eligibility, including imported daily summaries.
 * Empty days never contribute a synthetic zero; today is incomplete.
 */
export const registeredNutritionDays = (days: NutritionReportDay[], value: (day: NutritionReportDay) => number | null) =>
  days.filter(day => day.hasNutrition && day.isComplete && value(day) !== null);
