"use server";

import { revalidatePath } from "next/cache";
import { saveHistoricalDailyMetricValues } from "@/lib/daily-metrics/server";
import { todayInCordoba } from "@/lib/phase2/cordoba-date";

type Result = { ok: true } | { ok: false; error: string };

export async function saveHistoricalDailyMetricsAction(input: {
  date: string;
  values: Record<string, string>;
  declaresSleepNight?: boolean;
}): Promise<Result> {
  try {
    if (input.date > todayInCordoba()) {
      return { ok: false, error: "No se pueden registrar métricas en una fecha futura." };
    }
    await saveHistoricalDailyMetricValues(input);
    revalidatePath("/history");
    revalidatePath("/calendar");
    revalidatePath("/today");
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "No se pudieron guardar las métricas.",
    };
  }
}
