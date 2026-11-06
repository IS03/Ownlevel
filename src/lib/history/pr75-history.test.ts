import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildHistoricalDailyMetrics,
  formatDailyMetricValue,
  type UserMetric,
} from "../daily-metrics/core";

const source = (path: string) => readFileSync(path, "utf8");
const page = source("src/app/(app)/history/page.tsx");
const loader = source("src/lib/history/daily-history.ts");
const metricServer = source("src/lib/daily-metrics/server.ts");
const editor = source("src/app/(app)/history/historical-metrics-editor.tsx");
const mealList = source("src/app/(app)/today/meal-list.tsx");

function metric(overrides: Partial<UserMetric> = {}): UserMetric {
  return {
    id: "steps",
    user_id: "user",
    system_key: "steps",
    name: "Pasos",
    unit: "pasos",
    value_type: "integer",
    target_value: 10_000,
    sort_order: 0,
    is_active: true,
    archived_at: null,
    created_at: "2026-09-01T00:00:00Z",
    updated_at: "2026-09-01T00:00:00Z",
    has_history: true,
    ...overrides,
  };
}

describe("PR75 · métricas históricas canónicas", () => {
  it("conserva system, custom y archivadas sólo cuando existe una row histórica", () => {
    const result = buildHistoricalDailyMetrics(
      [
        metric(),
        metric({ id: "bike", system_key: null, name: "Bicicleta", unit: "km", value_type: "decimal" }),
        metric({ id: "sleep", system_key: "sleep", name: "Sueño", unit: "min", value_type: "duration", is_active: false, archived_at: "2026-09-09T00:00:00Z" }),
        metric({ id: "missing", system_key: null, name: "Sin registro", is_active: false, archived_at: "2026-09-09T00:00:00Z" }),
      ],
      [
        { metric_id: "steps", value: 0 },
        { metric_id: "bike", value: 12.5 },
        { metric_id: "sleep", value: 454 },
      ],
    );
    expect(result.recorded.map((item) => [item.name, item.value])).toEqual([
      ["Pasos", 0], ["Bicicleta", 12.5], ["Sueño", 454],
    ]);
    expect(result.recorded.some((item) => item.id === "missing")).toBe(false);
    expect(result.editable.some((item) => item.id === "sleep")).toBe(true);
    expect(result.editable.some((item) => item.id === "missing")).toBe(false);
  });

  it("reutiliza formatos integer, decimal y duration sin convertir ausencia en cero", () => {
    expect(formatDailyMetricValue(10_000, metric())).toBe("10.000 pasos");
    expect(formatDailyMetricValue(12.5, metric({ unit: "km", value_type: "decimal" }))).toBe("12,5 km");
    expect(formatDailyMetricValue(454, metric({ unit: "min", value_type: "duration" }))).toBe("7 h 34 min");
    expect(formatDailyMetricValue(null, metric())).toBe("—");
  });

  it("carga definitions y values agrupados, cuenta rows reales y edita por metric_id", () => {
    expect(metricServer).toContain('supabase.from("user_metrics").select("*")');
    expect(metricServer).toContain('supabase.from("daily_metric_values").select("metric_id,value")');
    expect(loader).toContain("getHistoricalDailyMetrics(date, context)");
    expect(page).toContain("metrics.recorded.length");
    expect(page).not.toContain('label: "Pasos"');
    expect(editor).toContain("saveHistoricalDailyMetricsAction({ date, values, declaresSleepNight: true })");
  });
});

describe("PR75 · reconstrucción y densidad del día", () => {
  it("mantiene snapshots efectivos, señala ajustes y conserva las dos semánticas energéticas", () => {
    expect(loader).toContain("getNutritionDay(date, { createIfMissing: false }, context)");
    expect(page).toContain("context.targets.calories");
    expect(page).toContain("context.expenditureKcal");
    expect(page).toContain("context.metrics.deltaVsNutritionTarget");
    expect(page).toContain("context.metrics.energyBalanceKcal");
    expect(page).toContain("dayLog.nutrition_target_override_kcal !== null");
    expect(page).toContain("dayLog.expenditure_override_kcal !== null");
    expect(page).toContain('dayLog.nutrition_target_override_kcal !== null ? " ajustado"');
    expect(page).toContain('dayLog.expenditure_override_kcal !== null ? " ajustado"');
  });

  it("presenta comidas como rows agrupadas, editables o históricas de solo lectura", () => {
    expect(page).toContain("<MealList meals={mealItems}");
    expect(page).toContain("editable: !legacy");
    expect(page).toContain("meal.description");
    expect(page).toContain("meal.final_calories");
    expect(page).toContain("meal.final_protein_g");
    expect(page).toContain("meal.final_carbs_g");
    expect(page).toContain("meal.final_fat_g");
    expect(mealList).toContain('meal.editable === false');
    expect(mealList).toContain("setEditingMeal(meal)");
    expect(loader).toContain('.from("meal_entries")');
    expect(loader).toContain("item.mealCount += 1");
  });

  it("elimina Trabajo/Gym visuales y usa la sesión real para Entrenamiento", () => {
    expect(page).not.toContain("context.work");
    expect(page).not.toContain("context.gym");
    expect(page).not.toContain(">Trabajo<");
    expect(page).not.toContain(">Gym<");
    expect(loader).toContain('.from("workout_sessions")');
    expect(page).toContain("sessions.map((session)");
  });

  it("muestra Cuerpo sólo con información real y conserva navegación inferior", () => {
    expect(page).toMatch(/if \(\s*!values\.length\s*&& !measurement\?\.condition\s*&& !measurement\?\.notes/);
    expect(page).toContain("{hasBody ? <BodySection");
    expect(page).toContain("Día anterior");
    expect(page).toContain("Día siguiente");
  });

  it("usa labels integrados, unidades dentro del campo y un único CTA", () => {
    expect(editor).toContain("<fieldset");
    expect(editor).toContain("<legend");
    expect(editor).toContain("{metric.unit}");
    expect(editor).toContain("Guardar cambios");
    expect(editor).not.toContain("<Label");
  });
});
