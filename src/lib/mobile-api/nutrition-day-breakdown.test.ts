import { describe, expect, it, vi } from 'vitest';
import type { NutritionDayContext } from './nutrition-day-contract';
import { parseNutritionDayData } from './nutrition-day-contract';
import { breakdownMatches } from './nutrition-breakdown-contract';
import { resolveDayBreakdown, readDayBreakdown, type BreakdownSources } from './nutrition-day-breakdown';
import type { MobileSupabaseAuthenticatedContext } from './supabase';
vi.mock('server-only', () => ({}));
const date = '2026-10-15',
  user = 'owner';
function fixture(completed = false) {
  const c: NutritionDayContext = {
    calorieTarget: completed ? 2150 : 1900,
    targetAutomaticKcal: completed ? 2150 : 1900,
    targetOverrideKcal: null,
    expenditureKcal: completed ? 2100 : 1850,
    expenditureAutomaticKcal: completed ? 2100 : 1850,
    expenditureOverrideKcal: null,
    training: { effective: completed, source: completed ? 'workout' : 'none' },
    work: { effective: false, source: 'schedule' },
    updatedAt: `${date}T10:00:00.123456Z`,
    resolvedAt: `${date}T10:00:00.123456Z`,
    deltaVsTargetKcal: null,
    energyBalanceKcal: null,
    proteinTargetG: null,
    waterTargetL: null,
  };
  const period = { user_id: user, effective_from: '2026-10-01', updated_at: '2026-10-01T10:00:00Z' };
  const s: BreakdownSources = {
    day: { user_id: user, log_date: date, bmr_kcal_snapshot: 1500, gym_override: null },
    plan: {
      ...period,
      id: 'plan',
      training_calorie_delta_kcal: 250,
      nutrition_plan_weekdays: [
        { user_id: user, plan_id: 'plan', weekday: 4, calorie_target_kcal: 1900, updated_at: period.updated_at },
      ],
    },
    energy: {
      ...period,
      base_expenditure_mode: 'custom',
      custom_base_expenditure_kcal: 1850,
      activity_factor: 1.2,
      training_expenditure_delta_kcal: 250,
    },
    goal: null,
    expenditure: null,
    profile: null,
  };
  return { c, s, period };
}
const resolve = (f: ReturnType<typeof fixture>, today = date) => resolveDayBreakdown(date, today, f.c, user, f.s);
describe('Read-only Nutrition day breakdown', () => {
  it.each([false, true])(
    'V2 configured training, completed=%s, closes both automatic and effective totals',
    (completed) => {
      const f = fixture(completed),
        b = resolve(f)!;
      expect(b).toMatchObject({
        baseTargetKcal: 1900,
        baseExpenditureKcal: 1850,
        expenditureMode: 'extras',
        factors: [
          {
            key: 'training',
            appliesTo: 'both',
            active: completed,
            deltaKcal: completed ? 250 : 0,
            source: completed ? 'workout' : 'none',
          },
        ],
      });
      expect(breakdownMatches(b, f.c)).toBe(true);
    },
  );
  it('keeps unequal training amounts distinct and applies the legacy work rule without inventing a V2 work extra', () => {
    const f = fixture(true);
    f.s.energy = null;
    f.c.work = { effective: true, source: 'schedule' };
    f.s.expenditure = {
      ...f.period,
      no_work_no_gym_kcal: 1850,
      no_work_gym_kcal: 2050,
      work_no_gym_kcal: 2100,
      work_gym_kcal: 2300,
    };
    f.c.expenditureKcal = f.c.expenditureAutomaticKcal = 2300;
    expect(resolve(f)?.factors).toEqual([
      { key: 'training', appliesTo: 'target', deltaKcal: 250, active: true, source: 'workout' },
      { key: 'training', appliesTo: 'expenditure', deltaKcal: 200, active: true, source: 'workout' },
      { key: 'work', appliesTo: 'expenditure', deltaKcal: 250, active: true, source: 'schedule' },
    ]);
    const v2 = fixture();
    v2.c.work = { effective: true, source: 'schedule' };
    expect(resolve(v2)?.factors.some((f) => f.key === 'work')).toBe(false);
  });
  it('supports legacy goals and an adjusted work state, with no session invented', () => {
    const f = fixture();
    f.s.plan = f.s.energy = null;
    f.s.goal = { ...f.period, calories_no_gym: 1900, calories_gym: 2150 };
    f.s.expenditure = {
      ...f.period,
      no_work_no_gym_kcal: 1850,
      no_work_gym_kcal: 2100,
      work_no_gym_kcal: 2100,
      work_gym_kcal: 2350,
    };
    f.c.work = { effective: true, source: 'override' };
    f.c.expenditureKcal = f.c.expenditureAutomaticKcal = 2100;
    expect(resolve(f)?.factors).toContainEqual({
      key: 'work',
      appliesTo: 'expenditure',
      deltaKcal: 250,
      active: true,
      source: 'override',
    });
    expect(resolve(f)?.factors.find((f) => f.key === 'training')).toMatchObject({ deltaKcal: 0, active: false });
    // The old resolver calls an explicit gym override "workout" even without a session.
    f.s.day.gym_override = true;
    f.c.training = { effective: true, source: 'workout' };
    f.c.calorieTarget = f.c.targetAutomaticKcal = 2150;
    f.c.expenditureKcal = f.c.expenditureAutomaticKcal = 2350;
    expect(resolve(f)).toBeNull();
  });
  it('fixed expenditure without configured extras has no factor rows', () => {
    const f = fixture();
    f.s.plan!.training_calorie_delta_kcal = 0;
    f.s.energy!.training_expenditure_delta_kcal = 0;
    expect(resolve(f)).toEqual({
      baseTargetKcal: 1900,
      baseExpenditureKcal: 1850,
      expenditureMode: 'fixed',
      baseExpenditureMode: 'custom',
      factors: [],
    });
  });
  it('uses the frozen BMR and numeric activity factor, including PostgreSQL rounding', () => {
    const f = fixture();
    f.s.energy!.base_expenditure_mode = 'automatic';
    f.s.energy!.activity_factor = 1.25;
    f.c.expenditureKcal = f.c.expenditureAutomaticKcal = 1875;
    expect(resolve(f)?.baseExpenditureKcal).toBe(1875);
    f.s.day.bmr_kcal_snapshot = null;
    expect(resolve(f)).toBeNull();
    f.s.profile = { user_id: user, bmr_kcal_current: 1500, updated_at: f.period.updated_at };
    expect(resolve(f)?.baseExpenditureKcal).toBe(1875);
  });
  it.each(['targetOverrideKcal', 'expenditureOverrideKcal'] as const)(
    'manual %s suppresses the explanation',
    (field) => {
      const f = fixture();
      f.c[field] = 2000;
      expect(resolve(f)).toBeNull();
    },
  );
  it('omits historical, future, unresolved and mismatched totals, even a one-kcal difference', () => {
    const f = fixture();
    expect(resolve(f, '2026-10-16')).toBeNull();
    expect(resolve(f, '2026-10-14')).toBeNull();
    f.c.calorieTarget!++;
    expect(resolve(f)).toBeNull();
    f.c.calorieTarget!--;
    f.c.targetAutomaticKcal!++;
    expect(resolve(f)).toBeNull();
    f.c.targetAutomaticKcal!--;
    f.c.expenditureAutomaticKcal!++;
    expect(resolve(f)).toBeNull();
    f.c.expenditureAutomaticKcal!--;
    f.c.resolvedAt = null;
    expect(resolve(f)).toBeNull();
  });
  it('rejects foreign rows, missing weekdays, config races at microsecond precision and non-additive legacy rules', () => {
    const foreign = fixture();
    foreign.s.plan!.user_id = 'other';
    expect(resolve(foreign)).toBeNull();
    const child = fixture();
    (child.s.plan!.nutrition_plan_weekdays as Record<string, unknown>[])[0].user_id = 'other';
    expect(resolve(child)).toBeNull();
    const missing = fixture();
    missing.s.plan!.nutrition_plan_weekdays = [];
    expect(resolve(missing)).toBeNull();
    const race = fixture();
    race.s.energy!.updated_at = `${date}T10:00:00.123457Z`;
    expect(resolve(race)).toBeNull();
    const interaction = fixture();
    interaction.s.energy = null;
    interaction.s.expenditure = {
      ...interaction.period,
      no_work_no_gym_kcal: 1850,
      no_work_gym_kcal: 2100,
      work_no_gym_kcal: 2100,
      work_gym_kcal: 2400,
    };
    expect(resolve(interaction)).toBeNull();
  });
  it('does not reinterpret gym overrides as completed V2 training', () => {
    const f = fixture();
    f.s.day.gym_override = true;
    expect(resolve(f)?.factors).toEqual([
      { key: 'training', appliesTo: 'both', deltaKcal: 0, active: false, source: 'none' },
    ]);
  });
  it('scopes every period read to token-derived identity and never writes', async () => {
    const f = fixture();
    const reads: { table: string; filters: unknown[][] }[] = [];
    const from = vi.fn((table: string) => {
      const filters: unknown[][] = [];
      reads.push({ table, filters });
      const q = {
        select: vi.fn(() => q),
        eq: vi.fn((...args: unknown[]) => {
          filters.push(args);
          return q;
        }),
        lte: vi.fn(() => q),
        order: vi.fn(() => q),
        limit: vi.fn(() => q),
        maybeSingle: vi.fn(async () => ({
          error: null,
          data: table === 'nutrition_plan_periods' ? f.s.plan : f.s.energy,
        })),
      };
      return q;
    });
    const auth = { userId: user, supabase: { from } } as unknown as MobileSupabaseAuthenticatedContext;
    expect(await readDayBreakdown(date, date, f.c, f.s.day, auth)).toEqual(resolve(f));
    expect(reads).toHaveLength(2);
    reads.forEach((r) => expect(r.filters).toContainEqual(['user_id', user]));
    from.mockClear();
    expect(await readDayBreakdown(date, date, f.c, { ...f.s.day, user_id: 'other' }, auth)).toBeNull();
    expect(from).not.toHaveBeenCalled();
  });
  it('optional enrichment failure leaves the core snapshot usable', async () => {
    const f = fixture(),
      auth = {
        userId: user,
        supabase: {
          from: () => {
            throw new Error('offline');
          },
        },
      } as unknown as MobileSupabaseAuthenticatedContext;
    expect(await readDayBreakdown(date, date, f.c, f.s.day, auth)).toBeNull();
  });
});

describe('Additive Mobile breakdown parser', () => {
  it('accepts absence/null and degrades only malformed explanations, preserving core data', () => {
    const f = fixture(),
      breakdown = resolve(f)!;
    const total = { knownTotal: 0, missingCount: 0 };
    const data = {
      dayState: 'recorded',
      summary: { entryCount: 0, mealCount: 0, calories: total, proteinG: total, carbsG: total, fatG: total },
      context: f.c,
      meals: [],
    };
    expect(parseNutritionDayData(data)).toEqual(data);
    for (const b of [
      null,
      { ...breakdown, baseTargetKcal: '1900' },
      { ...breakdown, baseTargetKcal: 1901 },
      { ...breakdown, factors: [...breakdown.factors, ...breakdown.factors] },
    ]) {
      expect(parseNutritionDayData({ ...data, context: { ...f.c, breakdown: b } })).toMatchObject({
        context: { breakdown: null },
        summary: data.summary,
      });
    }
    expect(parseNutritionDayData({ ...data, context: { ...f.c, breakdown } })).toMatchObject({
      context: { breakdown },
    });
    expect(parseNutritionDayData({ ...data, context: { ...f.c, breakdown, targetOverrideKcal: 2000 } })).toMatchObject({
      context: { breakdown: null },
    });
  });
});
