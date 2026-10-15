/** Optional read-only explanation. Factor deltas are the contributions APPLIED to this day. */
export type NutritionDayFactor = {
  key: string;
  appliesTo: 'target' | 'expenditure' | 'both';
  deltaKcal: number;
  active: boolean;
  source: string;
};
export type NutritionDayBreakdown = {
  baseTargetKcal: number;
  baseExpenditureKcal: number;
  expenditureMode: 'fixed' | 'extras';
  baseExpenditureMode?: 'automatic' | 'custom' | 'legacy';
  factors: NutritionDayFactor[];
};
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const kcal = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && Math.abs(v) <= 100000;
export function parseNutritionDayBreakdown(v: unknown): NutritionDayBreakdown | null {
  if (
    !record(v) ||
    !kcal(v.baseTargetKcal) ||
    v.baseTargetKcal < 0 ||
    !kcal(v.baseExpenditureKcal) ||
    v.baseExpenditureKcal < 0 ||
    !['fixed', 'extras'].includes(String(v.expenditureMode)) ||
    !Array.isArray(v.factors) ||
    v.factors.length > 32
  )
    return null;
  if ('baseExpenditureMode' in v && !['automatic', 'custom', 'legacy'].includes(String(v.baseExpenditureMode)))
    return null;
  const factors: NutritionDayFactor[] = [],
    destinations = new Set<string>();
  for (const f of v.factors) {
    if (
      !record(f) ||
      typeof f.key !== 'string' ||
      !/^[a-z][a-z0-9_-]{0,63}$/.test(f.key) ||
      !['target', 'expenditure', 'both'].includes(String(f.appliesTo)) ||
      !kcal(f.deltaKcal) ||
      typeof f.active !== 'boolean' ||
      (!f.active && f.deltaKcal !== 0) ||
      typeof f.source !== 'string' ||
      !/^[a-z][a-z0-9_-]{0,63}$/.test(f.source)
    )
      return null;
    for (const destination of f.appliesTo === 'both' ? ['target', 'expenditure'] : [f.appliesTo]) {
      const key = `${f.key}:${destination}`;
      if (destinations.has(key)) return null;
      destinations.add(key);
    }
    factors.push({
      key: f.key,
      appliesTo: f.appliesTo as NutritionDayFactor['appliesTo'],
      deltaKcal: f.deltaKcal,
      active: f.active,
      source: f.source,
    });
  }
  if (v.expenditureMode === 'fixed' && factors.some((f) => f.appliesTo !== 'target')) return null;
  return {
    baseTargetKcal: v.baseTargetKcal,
    baseExpenditureKcal: v.baseExpenditureKcal,
    expenditureMode: v.expenditureMode as NutritionDayBreakdown['expenditureMode'],
    factors,
    ...('baseExpenditureMode' in v
      ? { baseExpenditureMode: v.baseExpenditureMode as NutritionDayBreakdown['baseExpenditureMode'] }
      : {}),
  };
}
export function breakdownMatches(
  b: NutritionDayBreakdown,
  c: {
    calorieTarget: number | null;
    expenditureKcal: number | null;
    targetAutomaticKcal: number | null;
    expenditureAutomaticKcal: number | null;
    targetOverrideKcal: number | null;
    expenditureOverrideKcal: number | null;
  },
) {
  const target =
    b.baseTargetKcal + b.factors.reduce((sum, f) => sum + (f.appliesTo !== 'expenditure' ? f.deltaKcal : 0), 0);
  const expenditure =
    b.baseExpenditureKcal + b.factors.reduce((sum, f) => sum + (f.appliesTo !== 'target' ? f.deltaKcal : 0), 0);
  return (
    c.targetOverrideKcal === null &&
    c.expenditureOverrideKcal === null &&
    target === c.calorieTarget &&
    target === c.targetAutomaticKcal &&
    expenditure === c.expenditureKcal &&
    expenditure === c.expenditureAutomaticKcal
  );
}
