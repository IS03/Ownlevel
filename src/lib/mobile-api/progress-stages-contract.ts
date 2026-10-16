// Progreso › Tus etapas. Pure contract shared with Expo. Dates are Córdoba calendar dates.
// Stages last different lengths, so every value is per day or per week. null = no data for that stage
// (missing ≠ 0); a whole source that could not be read is reported in `sources`, never as empty stages.
import { isNutritionDate } from "./nutrition-day-contract";
import { stageKinds, type StageKind } from "./nutrition-stages-contract";

export type ProgressStageSummary = {
  id: string; name: string; kind: StageKind | null; status: "current" | "past";
  /** startsOn inclusive, endsOn exclusive (null = open). */
  startsOn: string; endsOn: string | null;
  /** Days actually measured (inclusive): up to today, at most the last 366 days of a long stage. */
  window: { start: string; end: string };
  elapsedDays: number; plannedDays: number | null;
  /** The stage's own plan: average of its seven weekdays. */
  targetKcal: number | null; targetProteinG: number | null;
  /** Average over complete days with meals (same rule as Progreso). */
  eatenKcal: number | null; eatenProteinG: number | null; daysWithMeals: number;
  /** Least-squares slope of the weigh-ins, in kg per week. Needs 3 weigh-ins over 10+ days. */
  weightPerWeekKg: number | null; weighIns: number;
  /** Distinct trained days per week. Needs 7+ measured days. */
  trainingDaysPerWeek: number | null; trainingDays: number;
};
export type ProgressStageSources = { nutrition: "ok" | "unavailable"; body: "ok" | "unavailable"; training: "ok" | "unavailable" };
export type ProgressStages = { today: string; stages: ProgressStageSummary[]; hasUpcoming: boolean; sources: ProgressStageSources };

export const PROGRESS_STAGES_MAX = 13;

const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const exact = (v: Record<string, unknown>, keys: readonly string[]) => Object.keys(v).length === keys.length && keys.every(k => k in v);
const num = (v: unknown) => v === null || (typeof v === "number" && Number.isFinite(v));
const count = (v: unknown) => typeof v === "number" && Number.isInteger(v) && v >= 0;
const source = (v: unknown) => v === "ok" || v === "unavailable";
const STAGE_KEYS = ["id", "name", "kind", "status", "startsOn", "endsOn", "window", "elapsedDays", "plannedDays", "targetKcal", "targetProteinG",
  "eatenKcal", "eatenProteinG", "daysWithMeals", "weightPerWeekKg", "weighIns", "trainingDaysPerWeek", "trainingDays"] as const;

function parseStage(v: unknown): ProgressStageSummary | undefined {
  if (!record(v) || !exact(v, STAGE_KEYS) || typeof v.id !== "string" || typeof v.name !== "string"
    || !(v.kind === null || stageKinds.includes(v.kind as StageKind)) || (v.status !== "current" && v.status !== "past")
    || !isNutritionDate(v.startsOn) || !(v.endsOn === null || isNutritionDate(v.endsOn))
    || !record(v.window) || !exact(v.window, ["start", "end"]) || !isNutritionDate(v.window.start) || !isNutritionDate(v.window.end)
    || v.window.start > v.window.end || !count(v.elapsedDays) || !(v.plannedDays === null || count(v.plannedDays))
    || ![v.targetKcal, v.targetProteinG, v.eatenKcal, v.eatenProteinG, v.weightPerWeekKg, v.trainingDaysPerWeek].every(num)
    || ![v.daysWithMeals, v.weighIns, v.trainingDays].every(count)) return;
  return v as ProgressStageSummary;
}

export function parseProgressStages(v: unknown): ProgressStages | undefined {
  if (!record(v) || !exact(v, ["today", "stages", "hasUpcoming", "sources"]) || !isNutritionDate(v.today) || !Array.isArray(v.stages)
    || v.stages.length > PROGRESS_STAGES_MAX || typeof v.hasUpcoming !== "boolean"
    || !record(v.sources) || !exact(v.sources, ["nutrition", "body", "training"]) || !Object.values(v.sources).every(source)) return;
  const stages = v.stages.map(parseStage);
  if (stages.some(s => !s) || stages.filter(s => s!.status === "current").length > 1) return;
  return { today: v.today, stages: stages as ProgressStageSummary[], hasUpcoming: v.hasUpcoming, sources: v.sources as ProgressStageSources };
}
