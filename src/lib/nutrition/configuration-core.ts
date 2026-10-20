import type { EnergyConfigPeriod, ExpenditureRulePeriod, NutritionGoalPeriod, NutritionPlanPeriod, NutritionPlanWeekday } from '../phase1/types';
import { WEEKDAYS, type ActivityLevel, type BaseExpenditureMode, type WeekdayNumber } from './plan-v2-core';
export type NutritionPlanEditor = {
  id: string | null;
  effectiveFrom: string | null;
  name: string;
  baseWaterL: number | null;
  trainingCalorieDeltaKcal: number;
  trainingWaterDeltaL: number;
  weekdays: Array<{
    weekday: WeekdayNumber;
    calorieTargetKcal: number | null;
    proteinTargetG: number | null;
  }>;
  source: "v2" | "legacy" | "default";
};

export type EnergyConfigEditor = {
  id: string | null;
  effectiveFrom: string | null;
  activityLevel: ActivityLevel;
  baseExpenditureMode: BaseExpenditureMode;
  customBaseExpenditureKcal: number | null;
  trainingExpenditureDeltaKcal: number;
  source: "v2" | "legacy" | "default";
};

type PlanWithWeekdays = NutritionPlanPeriod & {
  nutrition_plan_weekdays: NutritionPlanWeekday[];
};

export function legacyPlan(goal: NutritionGoalPeriod | null): NutritionPlanEditor {
  const calories = goal?.calories_no_gym ?? null;
  const protein = goal?.protein_no_gym_g ?? null;
  return {
    id: null,
    effectiveFrom: goal?.effective_from ?? null,
    name: goal?.name ?? "Plan nutricional",
    baseWaterL: goal?.water_no_gym_l ?? null,
    trainingCalorieDeltaKcal: goal
      ? Math.max(0, goal.calories_gym - goal.calories_no_gym)
      : 0,
    trainingWaterDeltaL: goal
      ? Math.max(0, goal.water_gym_l - goal.water_no_gym_l)
      : 0,
    weekdays: WEEKDAYS.map(({ value }) => ({
      weekday: value,
      calorieTargetKcal: calories,
      proteinTargetG: protein,
    })),
    source: goal ? "legacy" : "default",
  };
}

export function legacyTrainingDelta(rule: ExpenditureRulePeriod | null) {
  if (!rule) return 0;
  const workDelta = rule.work_gym_kcal - rule.work_no_gym_kcal;
  const noWorkDelta = rule.no_work_gym_kcal - rule.no_work_no_gym_kcal;
  return workDelta === noWorkDelta && workDelta >= 0 ? workDelta : 0;
}


export function planEditor(plan: PlanWithWeekdays | null, goal: NutritionGoalPeriod | null): NutritionPlanEditor {
  if (!plan) return legacyPlan(goal);
  const weekdays = [...plan.nutrition_plan_weekdays]
    .sort((a, b) => a.weekday - b.weekday)
    .map((item) => ({
      weekday: item.weekday as WeekdayNumber,
      calorieTargetKcal: Number(item.calorie_target_kcal),
      proteinTargetG: Number(item.protein_target_g),
    }));
  if (weekdays.length !== 7) throw new Error("El plan vigente está incompleto.");
  return {
    id: plan.id,
    effectiveFrom: plan.effective_from,
    name: plan.name,
    // null: a stage without its own water goal (the Agua metric keeps it). Never shown as 0.
    baseWaterL: plan.base_water_l == null ? null : Number(plan.base_water_l),
    trainingCalorieDeltaKcal: plan.training_calorie_delta_kcal,
    trainingWaterDeltaL: Number(plan.training_water_delta_l),
    weekdays,
    source: "v2",
  };
}

export function energyEditor(config: EnergyConfigPeriod | null, legacy: ExpenditureRulePeriod | null): EnergyConfigEditor {
  if (config) {
    return {
      id: config.id,
      effectiveFrom: config.effective_from,
      activityLevel: config.activity_level,
      baseExpenditureMode: config.base_expenditure_mode,
      customBaseExpenditureKcal: config.custom_base_expenditure_kcal,
      trainingExpenditureDeltaKcal: config.training_expenditure_delta_kcal,
      source: "v2",
    };
  }

  return {
    id: null,
    effectiveFrom: legacy?.effective_from ?? null,
    activityLevel: "moderate",
    baseExpenditureMode: "automatic",
    customBaseExpenditureKcal: null,
    trainingExpenditureDeltaKcal: legacyTrainingDelta(legacy),
    source: legacy ? "legacy" : "default",
  };
}
