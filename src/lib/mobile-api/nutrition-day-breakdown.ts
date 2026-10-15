import 'server-only';
import type { MobileSupabaseAuthenticatedContext } from './supabase';
import type { NutritionDayContext, NutritionDayBreakdown, NutritionDayFactor } from './nutrition-day-contract';
import { breakdownMatches, parseNutritionDayBreakdown } from './nutrition-breakdown-contract';

type Row = Record<string, unknown>;
const record = (v: unknown): v is Row => !!v && typeof v === 'object' && !Array.isArray(v);
const number = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const integer = (v: unknown): v is number => number(v) && Number.isSafeInteger(v);
/** Preserve Postgres microseconds when rejecting configuration edits after the snapshot. */
function stamp(v: unknown) {
  if (typeof v !== 'string' || !Number.isFinite(Date.parse(v))) return null;
  return Date.parse(v) * 1000 + Number((v.match(/\.(\d+)/)?.[1] ?? '').padEnd(6, '0').slice(3, 6));
}
function beforeSnapshot(row: Row, resolvedAt: string, userId: string) {
  const updated = stamp(row.updated_at),
    resolved = stamp(resolvedAt);
  return row.user_id === userId && updated !== null && resolved !== null && updated <= resolved;
}
export type BreakdownSources = {
  day: Row;
  plan: Row | null;
  energy: Row | null;
  goal: Row | null;
  expenditure: Row | null;
  profile: Row | null;
};

/** Mirrors resolve_nutrition_context (daily_nutrition_overrides_v2), then proves BOTH totals. */
export function resolveDayBreakdown(
  date: string,
  today: string,
  c: NutritionDayContext,
  userId: string,
  sources: BreakdownSources,
): NutritionDayBreakdown | null {
  const { day, plan, energy, goal, expenditure, profile } = sources;
  if (
    date !== today ||
    !c.resolvedAt ||
    day.user_id !== userId ||
    day.log_date !== date ||
    c.targetOverrideKcal !== null ||
    c.expenditureOverrideKcal !== null
  )
    return null;
  for (const row of [plan, energy, goal, expenditure])
    if (
      row &&
      (!beforeSnapshot(row, c.resolvedAt, userId) ||
        typeof row.effective_from !== 'string' ||
        row.effective_from > date)
    )
      return null;
  // The all-legacy resolver labels a true gym override as "workout" too.
  // Without a completed-session snapshot its origin cannot be explained reliably.
  if (!plan && !energy && day.gym_override === true && c.training.source === 'workout') return null;
  const completed = c.training.effective === true && c.training.source === 'workout';
  const legacyGym = completed || day.gym_override === true;
  const legacySource = completed ? 'workout' : legacyGym ? 'override' : 'none';
  const factors: NutritionDayFactor[] = [];
  const add = (
    key: string,
    appliesTo: NutritionDayFactor['appliesTo'],
    delta: number,
    active: boolean,
    source: string,
  ) => {
    if (delta !== 0) factors.push({ key, appliesTo, deltaKcal: active ? delta : 0, active, source });
  };
  let baseTarget: number;
  if (plan) {
    if (!Array.isArray(plan.nutrition_plan_weekdays) || !integer(plan.training_calorie_delta_kcal)) return null;
    const weekday = ((new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7) + 1;
    const matches = plan.nutrition_plan_weekdays.filter((w) => record(w) && w.weekday === weekday);
    if (matches.length !== 1 || !record(matches[0])) return null;
    const w = matches[0];
    if (!beforeSnapshot(w, c.resolvedAt, userId) || w.plan_id !== plan.id || !integer(w.calorie_target_kcal))
      return null;
    baseTarget = w.calorie_target_kcal;
    add('training', 'target', plan.training_calorie_delta_kcal, completed, completed ? 'workout' : 'none');
  } else {
    if (!goal || !integer(goal.calories_no_gym) || !integer(goal.calories_gym)) return null;
    baseTarget = goal.calories_no_gym;
    add('training', 'target', goal.calories_gym - baseTarget, legacyGym, legacySource);
  }
  let baseExpenditure: number;
  let expenditureExtras = false;
  if (energy) {
    if (!integer(energy.training_expenditure_delta_kcal)) return null;
    // The SQL resolver requires BMR even for a custom base. Use its frozen value first.
    let bmr = day.bmr_kcal_snapshot;
    if (bmr === null) {
      if (!profile || !beforeSnapshot(profile, c.resolvedAt, userId)) return null;
      bmr = profile.bmr_kcal_current;
    }
    if (!integer(bmr)) return null;
    if (energy.base_expenditure_mode === 'custom' && integer(energy.custom_base_expenditure_kcal))
      baseExpenditure = energy.custom_base_expenditure_kcal;
    else if (
      energy.base_expenditure_mode === 'automatic' &&
      number(energy.activity_factor) &&
      energy.activity_factor > 0
    )
      baseExpenditure = Math.round(bmr * energy.activity_factor);
    else return null;
    expenditureExtras = energy.training_expenditure_delta_kcal !== 0;
    add('training', 'expenditure', energy.training_expenditure_delta_kcal, completed, completed ? 'workout' : 'none');
  } else {
    if (
      !expenditure ||
      ![
        expenditure.no_work_no_gym_kcal,
        expenditure.no_work_gym_kcal,
        expenditure.work_no_gym_kcal,
        expenditure.work_gym_kcal,
      ].every(integer) ||
      c.work.effective === null
    )
      return null;
    baseExpenditure = expenditure.no_work_no_gym_kcal as number;
    const training = (expenditure.no_work_gym_kcal as number) - baseExpenditure;
    const work = (expenditure.work_no_gym_kcal as number) - baseExpenditure;
    // A legacy four-way rule may contain an interaction. Do not invent how to allocate it.
    if (baseExpenditure + training + work !== expenditure.work_gym_kcal) return null;
    expenditureExtras = training !== 0 || work !== 0;
    add('training', 'expenditure', training, legacyGym, legacySource);
    add('work', 'expenditure', work, c.work.effective, c.work.source ?? 'none');
  }
  if (factors.some((f) => f.key === 'training') && c.training.effective === null) return null;
  if (factors.some((f) => f.key === 'work') && c.work.source === null) return null;
  const target = factors.find((f) => f.key === 'training' && f.appliesTo === 'target');
  const spent = factors.find((f) => f.key === 'training' && f.appliesTo === 'expenditure');
  // Different contributions stay separate allocations of the SAME factor; never label unequal amounts "both".
  if (
    target &&
    spent &&
    target.deltaKcal === spent.deltaKcal &&
    target.active === spent.active &&
    target.source === spent.source
  ) {
    target.appliesTo = 'both';
    factors.splice(factors.indexOf(spent), 1);
  }
  const result = parseNutritionDayBreakdown({
    baseTargetKcal: baseTarget,
    baseExpenditureKcal: baseExpenditure,
    baseExpenditureMode: energy ? energy.base_expenditure_mode : 'legacy',
    expenditureMode: expenditureExtras ? 'extras' : 'fixed',
    factors,
  });
  return result && breakdownMatches(result, c) ? result : null;
}

export async function readDayBreakdown(
  date: string,
  today: string,
  c: NutritionDayContext,
  day: unknown,
  auth: MobileSupabaseAuthenticatedContext,
): Promise<NutritionDayBreakdown | null> {
  if (
    date !== today ||
    !record(day) ||
    day.user_id !== auth.userId ||
    !c.resolvedAt ||
    c.targetOverrideKcal !== null ||
    c.expenditureOverrideKcal !== null
  )
    return null;
  try {
    const period = async (table: string, columns: string) => {
      const result = await auth.supabase
        .from(table)
        .select(columns)
        .eq('user_id', auth.userId)
        .lte('effective_from', date)
        .order('effective_from', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (result.error || (result.data !== null && !record(result.data)))
        throw new Error('Breakdown source unavailable');
      return result.data as Row | null;
    };
    const [plan, energy] = await Promise.all([
      period(
        'nutrition_plan_periods',
        'id,user_id,effective_from,updated_at,training_calorie_delta_kcal,nutrition_plan_weekdays(plan_id,user_id,weekday,calorie_target_kcal,updated_at)',
      ),
      period(
        'energy_config_periods',
        'user_id,effective_from,updated_at,activity_factor,base_expenditure_mode,custom_base_expenditure_kcal,training_expenditure_delta_kcal',
      ),
    ]);
    const [goal, expenditure, profile] = await Promise.all([
      plan ? null : period('nutrition_goal_periods', 'user_id,effective_from,updated_at,calories_no_gym,calories_gym'),
      energy
        ? null
        : period(
            'expenditure_rule_periods',
            'user_id,effective_from,updated_at,no_work_no_gym_kcal,no_work_gym_kcal,work_no_gym_kcal,work_gym_kcal',
          ),
      energy && day.bmr_kcal_snapshot === null
        ? auth.supabase
            .from('profiles')
            .select('user_id,updated_at,bmr_kcal_current')
            .eq('user_id', auth.userId)
            .maybeSingle()
        : null,
    ]);
    if (profile?.error || (profile?.data !== undefined && profile.data !== null && !record(profile.data))) return null;
    return resolveDayBreakdown(date, today, c, auth.userId, {
      day,
      plan,
      energy,
      goal,
      expenditure,
      profile: record(profile?.data) ? profile.data : null,
    });
  } catch {
    return null;
  } // Optional enrichment must never turn a valid day into unavailable.
}
