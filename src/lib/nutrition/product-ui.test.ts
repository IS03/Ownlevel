import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import { FoodProductError, parseFoodInput, parseOptionalNumber, parseRequiredNumber } from "./product";

const source = (path: string) => readFileSync(path, "utf8");
const today = source("src/app/(app)/today/page.tsx");
const todayActivity = source("src/app/(app)/today/day-activity-panel.tsx");
const todayActivitySection = source("src/app/(app)/today/today-activity.tsx");
const stepsPage = source("src/app/(app)/today/steps/page.tsx");
const todayEditor = source("src/app/(app)/today/day-context-editor.tsx");
const product = source("src/lib/nutrition/product.ts");
const settings = source("src/app/(app)/settings/nutrition/nutrition-settings-forms.tsx");
const settingsRoot = source("src/app/(app)/settings/nutrition/page.tsx");
const settingsProfile = source("src/app/(app)/settings/page.tsx");
const profilePage = source("src/app/(app)/settings/profile/page.tsx");
const profileOverview = source("src/app/(app)/settings/profile/profile-overview.tsx");
const profileForm = source("src/app/(app)/settings/profile-form.tsx");
const goalSettings = source("src/app/(app)/settings/nutrition/goals/page.tsx");
const foodsPage = source("src/app/(app)/settings/nutrition/foods/page.tsx");
const integrationsPage = source("src/app/(app)/settings/nutrition/integrations/page.tsx");
const history = source("src/app/(app)/history/page.tsx");
const historicalMetricsEditor = source("src/app/(app)/history/historical-metrics-editor.tsx");
const historicalMetricsActions = source("src/app/(app)/history/historical-metrics-actions.ts");
const nutritionActions = source("src/app/(app)/today/nutrition-actions.ts");
const foods = source("src/app/(app)/settings/nutrition/foods-catalog.tsx");
const body = source("src/components/body/body-measurements.tsx");
const foodCaloriesDecimalMigration = source("supabase/migrations/20260908223000_food_calories_decimal.sql");

describe("PR 7 — experiencia nutricional", () => {
  it("valida números finitos, enteros, cero y null sin confundirlos", () => {
    expect(parseOptionalNumber("", "Macro", { min: 0 })).toBeNull();
    expect(parseOptionalNumber("0", "Macro", { min: 0 })).toBe(0);
    expect(parseRequiredNumber("12,5", "Macro", { min: 0 })).toBe(12.5);
    expect(() => parseRequiredNumber("NaN", "Macro")).toThrow("número válido");
    expect(() => parseRequiredNumber("Infinity", "Macro")).toThrow("número válido");
    expect(() => parseRequiredNumber("-1", "Macro", { min: 0 })).toThrow("al menos 0");
    expect(() => parseRequiredNumber("1.5", "Pasos", { integer: true })).toThrow("entero");
  });

  it("acepta foods completos o parciales y rechaza nutrición totalmente desconocida", () => {
    expect(parseFoodInput({ name: "Sintético", servingQuantity: "100", servingUnit: "g", calories: "200", proteinG: "10", carbsG: "0", fatG: "5" })).toMatchObject({ calories: 200, protein_g: 10, carbs_g: 0, fat_g: 5 });
    expect(parseFoodInput({ name: "Parcial", servingQuantity: "1", servingUnit: "unidad", calories: "", proteinG: "2", carbsG: "", fatG: "0" })).toMatchObject({ calories: null, protein_g: 2, carbs_g: null, fat_g: 0 });
    expect(() => parseFoodInput({ name: "Vacío", servingQuantity: "1", servingUnit: "unidad", calories: "", proteinG: "", carbsG: "", fatG: "" })).toThrow("al menos un valor");
  });

  it("acepta calorías y macros decimales con coma o punto sin perder precisión", () => {
    const comma = parseFoodInput({ name: "Tostada", servingQuantity: "1", servingUnit: "unidad", calories: "22,5", proteinG: "0,38", carbsG: "5,25", fatG: "0" });
    const point = parseFoodInput({ name: "Tostada", servingQuantity: "1.125", servingUnit: "unidad", calories: "22.5", proteinG: "0.38", carbsG: "5.25", fatG: "0" });

    expect(comma).toMatchObject({ serving_quantity: 1, calories: 22.5, protein_g: 0.38, carbs_g: 5.25, fat_g: 0 });
    expect(point).toMatchObject({ serving_quantity: 1.125, calories: 22.5, protein_g: 0.38, carbs_g: 5.25, fat_g: 0 });
    expect(foodCaloriesDecimalMigration).toContain("alter column calories type numeric(10, 2)");
  });

  it("rechaza separadores inválidos y asocia el error al campo correspondiente", () => {
    try {
      parseFoodInput({ name: "Tostada", servingQuantity: "1", servingUnit: "unidad", calories: "22;5", proteinG: "0,38", carbsG: "5,25", fatG: "0" });
      expect.fail("El alimento inválido no fue rechazado");
    } catch (error) {
      expect(error).toBeInstanceOf(FoodProductError);
      expect((error as FoodProductError).message).toBe("Calorías debe ser un número válido.");
      expect((error as FoodProductError).field).toBe("calories");
    }
  });

  it("Today separa objetivo, gasto, balance y entrenamiento sin controles legacy", () => {
    expect(today).toContain("context.targets.calories");
    expect(todayActivity).toContain('["Balance", values.balanceLabel, Scale]');
    expect(today).toContain("if (value > 0) return `+${value} kcal`");
    expect(today).toContain("return `${value} kcal`");
    expect(todayActivity).toContain('["Gasto estimado", values.expenditureLabel, Flame]');
    expect(todayActivity).toContain('["Objetivo nutricional", values.targetLabel, Target]');
    expect(todayActivity).toContain('["Entrenamiento", values.trainingLabel, Dumbbell]');
    expect(today).toContain("context.expenditureKcal");
    expect(today).not.toContain("dayLog.target_kcal_snapshot");
    expect(todayEditor).not.toContain("Usar horario habitual");
    expect(todayEditor).not.toContain("Registrar que entrené sin sesión");
    expect(todayEditor).toContain("saveNutritionTargetOverrideAction");
    expect(product).toContain("gym_override: true");
    expect(product).not.toContain("gym_override: false");
  });

  it("actividad no calcula totales ni refresca el motor desde TypeScript", () => {
    const activity = product.slice(product.indexOf("export async function updateDailyActivity"), product.indexOf("export async function updateWorkOverride"));
    expect(activity).toContain('rpc("save_daily_activity_metrics"');
    expect(activity).toContain("p_steps:");
    expect(activity).toContain("p_water_l:");
    expect(activity).toContain("p_mate_l:");
    expect(activity).not.toContain("refresh_nutrition_day");
    expect(activity).not.toContain("total_calories_consumed");
    expect(activity).not.toContain("expenditure_override_kcal");
    expect(activity).not.toContain("estimated_expenditure_kcal_snapshot");
    expect(activity).not.toContain("energy_balance_kcal");
  });

  it("Pasos se edita como métrica diaria sin analytics históricos en Actividad", () => {
    expect(today).toContain("<TodayActivity");
    expect(todayActivitySection).toContain("<DayActivityPanel");
    expect(todayActivitySection).not.toContain("<StepsCard");
    expect(todayActivitySection).toContain("<ResponsiveDialog");
    expect(todayActivitySection).toContain("onMetricsChange={setActivity}");
    expect(todayEditor).toContain("metrics.map");
    expect(todayEditor).not.toContain("StepsSummary");
    expect(todayEditor).not.toContain('role="progressbar"');
    expect(todayEditor).not.toContain("Prom. 7 días");
    expect(today).not.toContain("getStepsOverview");
    expect(nutritionActions).toContain('revalidatePath("/today/steps")');
    expect(stepsPage).toContain("<StepsReport");
    expect(stepsPage).toContain('href="/today"');
  });

  it("Ajustes inserta versiones y no actualiza períodos históricos", () => {
    expect(settings).toContain("Los cambios anteriores se conservan");
    expect(product).toContain('.from("nutrition_goal_periods").insert');
    expect(product).toContain('.from("expenditure_rule_periods").insert');
    expect(product).toContain('.from("work_schedule_periods").insert');
    expect(product).toContain("Ya existe una versión para esa fecha");
    expect(product).not.toContain('.from("nutrition_goal_periods").update');
  });

  it("separa perfil, hub de nutrición y pantallas especializadas", () => {
    expect(settingsProfile).not.toContain("<ProfileForm");
    expect(settingsProfile).toContain('href="/settings/profile"');
    expect(profilePage).toContain("<ProfileOverview");
    expect(profileOverview).toContain("<ProfileForm");
    expect(profileOverview).toContain("Metabolismo basal");
    expect(profileOverview).toContain('href="/settings/nutrition/energy"');
    expect(profileOverview).not.toContain("Calorías basales");
    expect(profileForm).not.toContain("Para seguir el historial");
    expect(settingsRoot).toContain("getNutritionPlanEditor");
    expect(settingsRoot).toContain("<NutritionPlanEditor");
    expect(settingsRoot).not.toContain("FoodsCatalog");
    expect(settingsRoot).not.toContain("listIntegrationApiTokens");
    expect(goalSettings).toContain("Objetivo actual");
    expect(goalSettings).toContain("Próximos cambios");
    expect(foodsPage).toContain("<FoodsCatalog");
    expect(foodsPage).toContain('href="/settings/library"');
    expect(foodsPage).toContain("Biblioteca");
    expect(integrationsPage).toContain("<ChatgptIntegration");
  });

  it("History conserva modo read-only y distingue summaries, hora y eventos", () => {
    expect(history).toContain("createIfMissing: false");
    expect(history).toContain("Resumen diario histórico");
    expect(history).toContain("Sin desglose de comidas disponible");
    expect(history).toContain("Horario no informado");
    expect(history).toContain("Eventos / contexto");
  });

  it("corrige métricas históricas por metric_id sin restaurar el editor legacy", () => {
    expect(parseOptionalNumber("9350", "Pasos", { integer: true, min: 0 })).toBe(9350);
    expect(parseOptionalNumber("2,5", "Agua", { min: 0 })).toBe(2.5);
    expect(parseOptionalNumber("0.5", "Mate", { min: 0 })).toBe(0.5);
    expect(parseOptionalNumber("", "Agua", { min: 0 })).toBeNull();
    expect(() => parseOptionalNumber("1.5", "Pasos", { integer: true, min: 0 })).toThrow("entero");
    expect(() => parseOptionalNumber("-1", "Mate", { min: 0 })).toThrow("al menos 0");
    expect(history).toContain("<HistoricalMetricsEditor date={requestedDate} metrics={metrics.editable}");
    expect(historicalMetricsEditor).toContain("saveHistoricalDailyMetricsAction({ date, values, declaresSleepNight: true })");
    expect(historicalMetricsEditor).toContain("if (!result.ok)");
    expect(historicalMetricsEditor).toContain("setOpen(false)");
    expect(historicalMetricsEditor).not.toContain("saveDailyActivityAction");
    expect(historicalMetricsEditor).not.toContain("Trabajo");
    expect(historicalMetricsEditor).not.toContain("Gym");
    expect(historicalMetricsActions).toContain('revalidatePath("/calendar")');
    expect(nutritionActions).toContain('revalidatePath("/today/reports")');
  });

  it("Foods distingue catálogo activo, archivo y borrado sin perder precisión", () => {
    expect(foods).toContain("Activos");
    expect(foods).toContain("Archivados");
    expect(foods).toContain("Todos");
    expect(foods).toContain("Archivar");
    expect(foods).toContain("Reactivar");
    expect(foods).toContain("Eliminar alimento");
    expect(foods).toContain("Las comidas ya registradas no cambiarán");
    expect(foods).toContain("Dejá vacío lo que no conozcas");
    expect(foods).toContain('footer={saveButton}');
    expect(foods).toContain('form="food-editor-form"');
    expect(product).toContain('.from("foods")');
    expect(product).toContain(".delete()");
    expect(product).toContain("delete payload.precision_level");
    for (const value of ["abdomen_cm", "arm_right_cm", "arm_left_cm", "thigh_right_cm", "thigh_left_cm", "calf_right_cm", "calf_left_cm"]) expect(body).toContain(value);
    expect(body).toContain("Revisar medición");
    expect(body).toContain("Los lados no se promedian");
    // M5.1 decision: imported measurements can be deleted too.
    expect(body).not.toContain("entry.import_run_id?null");
  });
});
