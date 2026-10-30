import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { buildNutritionReportDays, type NutritionReportDayLogFact } from "../nutrition/reports-core";
import { addProgressIsoDays } from "../progress/analytics";
import { NutritionReportDayChangedError, readMobileNutritionDays, readMobileNutritionFacts } from "./nutrition-report-server";
import type { MobileSupabaseAuthenticatedContext } from "./supabase";

const TODAY = "2026-10-30";
const d = (n: number) => addProgressIsoDays(TODAY, n);
/** 500 days of the account: logs on most days, meals (some deleted upstream already), completed workouts and stage names. */
const logs: NutritionReportDayLogFact[] = Array.from({ length: 500 }, (_, i) => d(-i)).filter((_, i) => i % 7 !== 3).map((date, i) => ({
  id: `log-${date}`, log_date: date, total_calories_consumed: 1800 + (i % 9) * 50, total_protein_g: 100 + (i % 5) * 10, total_carbs_g: 200, total_fat_g: 60,
  nutrition_target_kcal_snapshot: i % 4 ? 2100 : null, protein_target_g_snapshot: 130, estimated_expenditure_kcal_snapshot: 2400, delta_vs_nutrition_target: null, energy_balance_kcal: null,
  water_target_l_snapshot: 3, water_l: i % 3 ? 2.5 : null, mate_l: null, steps: 8000 + i, work_effective_snapshot: i % 2 === 0, gym_effective_snapshot: i % 3 === 0, gym_source_snapshot: null,
  nutrition_goal_period_id: null, nutrition_plan_period_id: i < 60 ? "plan-now" : "plan-before", goal_type_snapshot: "maintain",
}));
const names = [{ id: "plan-now", name: "Mantenimiento" }, { id: "plan-before", name: "Recomposición suave" }];
// Facts belong to their day, as in SQL: whether a day has meals or a completed workout never depends on the range read.
const meals = logs.filter((_, i) => i % 6 !== 0).map(l => ({ day_log_id: l.id, entry_kind: "meal", final_calories: l.total_calories_consumed, final_protein_g: l.total_protein_g,
  final_carbs_g: null, final_fat_g: 60, source_type: "manual", deleted_at: null }));
const workouts = logs.filter((_, i) => i % 4 === 0).map(l => ({ day_log_id: l.id, status: "completed" }));

/** The SQL snapshot: every fact filtered by day, 366 days at most, p_end not after today. */
function fake(today = TODAY) {
  const calls: { p_start: string; p_end: string }[] = [];
  const rpc = async (_name: string, args: { p_start: string; p_end: string; p_expected_today: string }) => {
    calls.push({ p_start: args.p_start, p_end: args.p_end });
    if (args.p_expected_today !== today) return { data: { status: "day_changed", today }, error: null };
    const span = Math.round((Date.parse(args.p_end) - Date.parse(args.p_start)) / 86_400_000) + 1;
    if (span > 366 || args.p_end > today || args.p_start > args.p_end) return { data: null, error: { message: "invalid_report_range" } };
    const dayLogs = logs.filter(l => l.log_date >= args.p_start && l.log_date <= args.p_end);
    const ids = new Set(dayLogs.map(l => l.id));
    return { data: { status: "ok", today, start: args.p_start, end: args.p_end, dayLogs,
      meals: meals.filter(m => ids.has(m.day_log_id)), workouts: workouts.filter(w => ids.has(w.day_log_id)),
      goalNames: names.filter(n => dayLogs.some(l => l.nutrition_plan_period_id === n.id && ids.has(l.id))) }, error: null };
  };
  return { calls, context: { supabase: { rpc }, userId: "owner" } as unknown as MobileSupabaseAuthenticatedContext };
}
/** What each range gave when read on its own (the previous behavior). */
async function separately(ranges: { start: string; end: string }[]) {
  const f = fake();
  return Promise.all(ranges.map(async range => buildNutritionReportDays({ range, today: TODAY, ...await readMobileNutritionFacts(f.context, range, TODAY) })));
}

describe("nutrition days of several ranges from as few snapshot reads as possible", () => {
  it.each([
    ["month and the previous month (Progreso › Resumen)", [{ start: d(-29), end: TODAY }, { start: d(-59), end: d(-30) }], 1],
    ["week and the previous week", [{ start: d(-6), end: TODAY }, { start: d(-13), end: d(-7) }], 1],
    ["overlapping ranges", [{ start: d(-40), end: TODAY }, { start: d(-70), end: d(-20) }], 1],
    ["a gap between them (a custom comparison)", [{ start: d(-29), end: TODAY }, { start: d(-400), end: d(-371) }], 2],
    ["a year and the previous year: over the 366-day limit", [{ start: d(-365), end: TODAY }, { start: d(-500 + 1), end: d(-366) }], 2],
    ["a single day", [{ start: TODAY, end: TODAY }], 1],
  ] as const)("%s: the same days as separate reads", async (_label, ranges, reads) => {
    const f = fake();
    const merged = await readMobileNutritionDays(f.context, ranges, TODAY);
    expect(merged).toEqual(await separately([...ranges]));
    expect(f.calls).toHaveLength(reads);
    for (const call of f.calls) expect(Math.round((Date.parse(call.p_end) - Date.parse(call.p_start)) / 86_400_000) + 1).toBeLessThanOrEqual(366);
  });
  it("a midnight in Córdoba still surfaces as a day change, never as partial days", async () => {
    const f = fake("2026-10-31");
    await expect(readMobileNutritionDays(f.context, [{ start: d(-29), end: TODAY }, { start: d(-59), end: d(-30) }], TODAY))
      .rejects.toBeInstanceOf(NutritionReportDayChangedError);
  });
});
