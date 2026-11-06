"use server";

import { revalidatePath } from "next/cache";
import {
  updateDailyActivity,
  updateExpenditureOverride,
  updateNutritionTargetOverride,
} from "@/lib/nutrition/product";
import { saveDailyMetricValues } from "@/lib/daily-metrics/server";

type Result = { ok: true } | { ok: false; error: string };

function message(error: unknown) {
  return error instanceof Error ? error.message : "No se pudo guardar el cambio.";
}

function refreshNutritionPages() {
  revalidatePath("/today");
  revalidatePath("/home");
  revalidatePath("/history");
  revalidatePath("/today/reports");
  revalidatePath("/today/steps");
}

export async function saveDailyMetricsAction(input: {
  date: string; values: Record<string, string>; declaresSleepNight?: boolean;
}): Promise<Result> {
  try {
    await saveDailyMetricValues(input);
    refreshNutritionPages();
    return { ok: true };
  } catch (error) { return { ok: false, error: message(error) }; }
}

/** Adapter temporal para el editor histórico; Today escribe por metric_id. */
export async function saveDailyActivityAction(input: {
  dayLogId: string; steps: string; waterL: string; mateL: string;
}): Promise<Result> {
  try {
    await updateDailyActivity(input);
    refreshNutritionPages();
    return { ok: true };
  } catch (error) { return { ok: false, error: message(error) }; }
}

export async function saveExpenditureOverrideAction(input: {
  dayLogId: string; kcal: string;
}): Promise<Result> {
  try {
    await updateExpenditureOverride(input);
    refreshNutritionPages();
    return { ok: true };
  } catch (error) { return { ok: false, error: message(error) }; }
}

export async function saveNutritionTargetOverrideAction(input: {
  dayLogId: string; kcal: string;
}): Promise<Result> {
  try {
    await updateNutritionTargetOverride(input);
    refreshNutritionPages();
    return { ok: true };
  } catch (error) { return { ok: false, error: message(error) }; }
}
