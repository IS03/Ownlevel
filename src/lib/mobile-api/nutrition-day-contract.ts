import { breakdownMatches, parseNutritionDayBreakdown, type NutritionDayBreakdown } from './nutrition-breakdown-contract';
export type { NutritionDayBreakdown, NutritionDayFactor } from './nutrition-breakdown-contract';
/** Portable wire contract: no server, Supabase or React dependencies. */
export type NutritionReadResult<T> = { status: "ok"; data: T } | { status: "unavailable" };
export type NutritionNutrientTotal = { knownTotal: number; missingCount: number };
export type NutritionDayMeal = {
  id: string;
  title: string | null;
  description: string | null;
  calories: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  consumedAt: string;
  updatedAt: string;
  timeKnown: boolean;
  /** Optional for older servers: absent reads as explicit when timeKnown, unknown otherwise (#308). */
  timeSource?: "explicit" | "registration" | "unknown";
  entryKind: "meal" | "legacy_daily_summary";
  sourceType: "manual" | "label" | "ai" | "chatgpt" | "sheet_import" | null;
  precision: "catalog" | "label" | "estimated" | "historical" | null;
  mealLabel: "breakfast" | "lunch" | "snack" | "dinner" | "extra" | null;
};
export type NutritionDaySummary = {
  calories: NutritionNutrientTotal;
  proteinG: NutritionNutrientTotal;
  carbsG: NutritionNutrientTotal;
  fatG: NutritionNutrientTotal;
  entryCount: number;
  mealCount: number;
};
export type NutritionDayContext = {
  breakdown?: NutritionDayBreakdown | null;
  updatedAt?: string;
  calorieTarget: number | null;
  proteinTargetG: number | null;
  waterTargetL: number | null;
  deltaVsTargetKcal: number | null;
  expenditureKcal: number | null;
  energyBalanceKcal: number | null;
  targetAutomaticKcal: number | null;
  targetOverrideKcal: number | null;
  expenditureAutomaticKcal: number | null;
  expenditureOverrideKcal: number | null;
  training: { effective: boolean | null; source: "workout" | "override" | "none" | null };
  work: { effective: boolean | null; source: "schedule" | "override" | null };
  resolvedAt: string | null;
};
export type NutritionDayData =
  | { dayState: "missing"; summary: null; context: null; meals: [] }
  | { dayState: "recorded"; summary: NutritionDaySummary; context: NutritionDayContext; meals: NutritionDayMeal[] };
export type NutritionDayMetric = {
  definitionUpdatedAt?: string;
  id: string;
  systemKey: "steps" | "water" | "mate" | "sleep" | null;
  label: string;
  unit: string | null;
  valueType: "integer" | "decimal" | "duration";
  target: number | null;
  value: number | null;
  isActive: boolean;
  updatedAt: string | null;
};
export type MobileNutritionDayResponse = {
  date: string;
  today: string;
  nutrition: NutritionReadResult<NutritionDayData>;
  activity: NutritionReadResult<{ metrics: NutritionDayMetric[] }>;
};

export function isNutritionDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith("0000")) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const textOrNull = (value: unknown): value is string | null => value === null || typeof value === "string";
const count = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const nonnegative = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0;
const nullableNumber = (value: unknown): value is number | null => value === null || nonnegative(value);
const signedNumber = (value: unknown): value is number | null => value === null || (typeof value === "number" && Number.isFinite(value));
const timestamp = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value));
const uuid = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const oneOf = (value: unknown, choices: readonly unknown[]) => choices.includes(value);

function nutrient(value: unknown, entries: number): NutritionNutrientTotal | undefined {
  if (!record(value) || !nonnegative(value.knownTotal) || !count(value.missingCount) || value.missingCount > entries) return undefined;
  return { knownTotal: value.knownTotal, missingCount: value.missingCount };
}
function meal(value: unknown): NutritionDayMeal | undefined {
  if (!record(value) || !uuid(value.id) || !textOrNull(value.title) || !textOrNull(value.description)
    || ![value.calories, value.proteinG, value.carbsG, value.fatG].every(nullableNumber)
    || !timestamp(value.consumedAt) || !timestamp(value.updatedAt) || typeof value.timeKnown !== "boolean"
    || !oneOf(value.entryKind, ["meal", "legacy_daily_summary"])
    || !oneOf(value.sourceType, ["manual", "label", "ai", "chatgpt", "sheet_import", null])
    || !oneOf(value.precision, ["catalog", "label", "estimated", "historical", null])
    || !oneOf(value.mealLabel, ["breakfast", "lunch", "snack", "dinner", "extra", null])
    || (value.timeSource !== undefined && (!oneOf(value.timeSource, ["explicit", "registration", "unknown"])
      || (value.timeSource === "explicit") !== value.timeKnown))) return undefined;
  return { id: value.id, title: value.title, description: value.description, calories: value.calories as number | null,
    proteinG: value.proteinG as number | null, carbsG: value.carbsG as number | null, fatG: value.fatG as number | null,
    consumedAt: value.consumedAt, updatedAt: value.updatedAt, timeKnown: value.timeKnown,
    ...(value.timeSource !== undefined ? { timeSource: value.timeSource as NutritionDayMeal["timeSource"] } : {}),
    entryKind: value.entryKind as NutritionDayMeal["entryKind"], sourceType: value.sourceType as NutritionDayMeal["sourceType"],
    precision: value.precision as NutritionDayMeal["precision"], mealLabel: value.mealLabel as NutritionDayMeal["mealLabel"] };
}
export function parseNutritionDayData(value: unknown): NutritionDayData | undefined {
  if (!record(value) || !Array.isArray(value.meals)) return undefined;
  if (value.dayState === "missing") return value.summary === null && value.context === null && value.meals.length === 0
    ? { dayState: "missing", summary: null, context: null, meals: [] } : undefined;
  if (value.dayState !== "recorded" || !record(value.summary) || !record(value.context)) return undefined;
  const s = value.summary, c = value.context;
  if (!count(s.entryCount) || !count(s.mealCount) || s.mealCount > s.entryCount || s.entryCount !== value.meals.length) return undefined;
  const calories = nutrient(s.calories, s.entryCount), proteinG = nutrient(s.proteinG, s.entryCount);
  const carbsG = nutrient(s.carbsG, s.entryCount), fatG = nutrient(s.fatG, s.entryCount);
  const meals = value.meals.map(meal);
  if (!calories || !proteinG || !carbsG || !fatG || meals.some(m => m === undefined)
    || new Set(meals.map(m => m?.id)).size !== meals.length || meals.filter(m => m?.entryKind === "meal").length !== s.mealCount) return undefined;
  // Coverage must describe these exact entries; never accept a false complete total.
  for (const [field, total] of [["calories", calories], ["proteinG", proteinG], ["carbsG", carbsG], ["fatG", fatG]] as const) {
    if (meals.filter(m => m?.[field] === null).length !== total.missingCount) return undefined;
  }
  if ((c.updatedAt !== undefined && !timestamp(c.updatedAt)) || ![c.calorieTarget, c.proteinTargetG, c.waterTargetL, c.expenditureKcal, c.targetAutomaticKcal,
    c.targetOverrideKcal, c.expenditureAutomaticKcal, c.expenditureOverrideKcal].every(nullableNumber)
    || !signedNumber(c.deltaVsTargetKcal) || !signedNumber(c.energyBalanceKcal)
    || !(c.resolvedAt === null || timestamp(c.resolvedAt)) || !record(c.training) || !record(c.work)
    || !(c.training.effective === null || typeof c.training.effective === "boolean")
    || !oneOf(c.training.source, ["workout", "override", "none", null])
    || !(c.work.effective === null || typeof c.work.effective === "boolean") || !oneOf(c.work.source, ["schedule", "override", null])) return undefined;
  const breakdown = parseNutritionDayBreakdown(c.breakdown);
  return { dayState: "recorded", summary: { calories, proteinG, carbsG, fatG, entryCount: s.entryCount, mealCount: s.mealCount },
    context: { ...('breakdown' in c ? { breakdown: breakdown && breakdownMatches(breakdown, c as unknown as NutritionDayContext) ? breakdown : null } : {}), ...(c.updatedAt !== undefined ? { updatedAt: c.updatedAt as string } : {}), calorieTarget: c.calorieTarget as number | null, proteinTargetG: c.proteinTargetG as number | null,
      waterTargetL: c.waterTargetL as number | null, deltaVsTargetKcal: c.deltaVsTargetKcal, expenditureKcal: c.expenditureKcal as number | null,
      energyBalanceKcal: c.energyBalanceKcal, targetAutomaticKcal: c.targetAutomaticKcal as number | null,
      targetOverrideKcal: c.targetOverrideKcal as number | null, expenditureAutomaticKcal: c.expenditureAutomaticKcal as number | null,
      expenditureOverrideKcal: c.expenditureOverrideKcal as number | null,
      training: { effective: c.training.effective, source: c.training.source as NutritionDayContext["training"]["source"] },
      work: { effective: c.work.effective, source: c.work.source as NutritionDayContext["work"]["source"] }, resolvedAt: c.resolvedAt },
    meals: meals as NutritionDayMeal[] };
}
export function parseNutritionDayActivity(value: unknown): { metrics: NutritionDayMetric[] } | undefined {
  if (!record(value) || !Array.isArray(value.metrics)) return undefined;
  const metrics: NutritionDayMetric[] = [];
  for (const m of value.metrics) {
    if (!record(m) || (m.definitionUpdatedAt !== undefined && !timestamp(m.definitionUpdatedAt)) || !uuid(m.id) || typeof m.label !== "string" || !m.label.trim() || !textOrNull(m.unit)
      || !oneOf(m.systemKey, ["steps", "water", "mate", "sleep", null]) || !oneOf(m.valueType, ["integer", "decimal", "duration"])
      || !nullableNumber(m.value) || !nullableNumber(m.target) || typeof m.isActive !== "boolean"
      || !(m.updatedAt === null || timestamp(m.updatedAt)) || (m.value === null) !== (m.updatedAt === null)
      || (!m.isActive && m.value === null)
      || (m.valueType !== "decimal" && [m.value, m.target].some(n => n !== null && !Number.isInteger(n)))) return undefined;
    metrics.push({ ...(m.definitionUpdatedAt !== undefined ? { definitionUpdatedAt: m.definitionUpdatedAt as string } : {}), id: m.id, systemKey: m.systemKey as NutritionDayMetric["systemKey"], label: m.label, unit: m.unit,
      valueType: m.valueType as NutritionDayMetric["valueType"], value: m.value, target: m.target,
      isActive: m.isActive, updatedAt: m.updatedAt });
  }
  return new Set(metrics.map(m => m.id)).size === metrics.length ? { metrics } : undefined;
}
function readResult<T>(value: unknown, parse: (data: unknown) => T | undefined): NutritionReadResult<T> | undefined {
  if (!record(value)) return undefined;
  if (value.status === "unavailable") return { status: "unavailable" };
  if (value.status !== "ok") return undefined;
  const data = parse(value.data);
  return data === undefined ? undefined : { status: "ok", data };
}
export function parseMobileNutritionDayResponse(value: unknown): MobileNutritionDayResponse | undefined {
  if (!record(value) || !isNutritionDate(value.date) || !isNutritionDate(value.today)) return undefined;
  const nutrition = readResult(value.nutrition, parseNutritionDayData), activity = readResult(value.activity, parseNutritionDayActivity);
  return nutrition && activity ? { date: value.date, today: value.today, nutrition, activity } : undefined;
}
