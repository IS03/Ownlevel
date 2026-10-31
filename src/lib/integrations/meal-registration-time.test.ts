import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { parseChatgptMealInput } from "./chatgpt-contract";
import { callMealRpc } from "./meal-rpc";
import { forwardOAuthMeal, registerMealTool } from "./mcp-meals";
import { nutritionMealTimeKnown, nutritionMealTimeSource } from "../mobile-api/nutrition-meal-time";
import { parseNutritionDayData } from "../mobile-api/nutrition-day-contract";

// 31/10/2026 13:42 in Córdoba (UTC-3).
const NOW = new Date("2026-10-31T16:42:00Z");
const meal = { date: "2026-10-31", title: "Tostado", description: "", calories: 380, protein_g: null, carbs_g: null, fat_g: null, idempotency_key: "synthetic-308-1" };

describe("consumed_now signal (#308)", () => {
  it("marks a meal of today without a time as eaten now", () => {
    expect(parseChatgptMealInput({ ...meal, consumed_now: true }, NOW)).toMatchObject({ consumed_now: true, consumed_at: null });
  });
  it("lets a said time prevail: the meal is explicit, not registration", () => {
    expect(parseChatgptMealInput({ ...meal, consumed_now: true, time: "13:15" }, NOW)).toMatchObject({ consumed_now: false, consumed_at: "2026-10-31T13:15:00-03:00" });
  });
  it("keeps historical meals without a time unknown and refuses 'now' for another day", () => {
    expect(parseChatgptMealInput({ ...meal, date: "2026-10-30" }, NOW)).toMatchObject({ consumed_now: false, consumed_at: null });
    expect(() => parseChatgptMealInput({ ...meal, date: "2026-10-30", consumed_now: true }, NOW)).toThrow("Una comida de ahora es de hoy (2026-10-31");
  });
  it("uses the Córdoba day across midnight", () => {
    const justAfterMidnight = new Date("2026-11-01T03:00:30Z");
    expect(() => parseChatgptMealInput({ ...meal, consumed_now: true }, justAfterMidnight)).toThrow("2026-11-01");
    expect(parseChatgptMealInput({ ...meal, date: "2026-11-01", consumed_now: true }, justAfterMidnight).consumed_now).toBe(true);
  });
  it("rejects a non-boolean signal and defaults to false", () => {
    expect(() => parseChatgptMealInput({ ...meal, consumed_now: "yes" }, NOW)).toThrow("consumed_now debe ser booleano.");
    expect(parseChatgptMealInput(meal, NOW).consumed_now).toBe(false);
  });
  it("is optional in the MCP tool and forwarded only when it applies", async () => {
    expect(registerMealTool.inputSchema.required).not.toContain("consumed_now");
    const fetcher = vi.fn(async () => Response.json({ ok: true }));
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://synthetic.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "synthetic-public");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "sb_secret_synthetic");
    vi.stubEnv("OWNLEVEL_OAUTH_ENABLED", "true");
    await forwardOAuthMeal({ ...meal, date: undefined, consumed_now: true }, "Bearer t", fetcher);
    await forwardOAuthMeal({ ...meal, date: undefined, consumed_now: true, time: "12:00" }, "Bearer t", fetcher);
    const bodies = fetcher.mock.calls.map(c => JSON.parse((c as unknown as [URL, RequestInit])[1].body as string));
    expect(bodies[0].consumed_now).toBe(true);
    expect(bodies[1]).not.toHaveProperty("consumed_now");
    vi.unstubAllEnvs();
  });
});

describe("registration time persistence routing (#308)", () => {
  const args = { p_user_id: "u", p_consumed_at: null, p_meal_label: null };
  const parsed = (consumed_now: boolean) => ({ ...parseChatgptMealInput(meal, NOW), consumed_now });
  const admin = (...results: { data?: unknown; error: { code: string } | null }[]) => {
    const rpc = vi.fn(async () => results.shift() ?? { data: { ok: true }, error: null });
    return { client: { rpc } as never, rpc };
  };
  it("sends a meal eaten now to v3 with the registration source and no explicit time", async () => {
    const { client, rpc } = admin({ data: { ok: true }, error: null });
    await callMealRpc(client, "v2", "v3", args, parsed(true));
    expect(rpc.mock.calls).toEqual([["v3", { p_user_id: "u", p_meal_label: null, p_time_source: "registration" }]]);
  });
  it("falls back to v2 only while v3 does not exist", async () => {
    const missing = admin({ error: { code: "PGRST202" } });
    await callMealRpc(missing.client, "v2", "v3", args, parsed(true));
    expect(missing.rpc.mock.calls.map(c => (c as unknown[])[0])).toEqual(["v3", "v2"]);
    const duplicate = admin({ error: { code: "P0001" } });
    expect((await callMealRpc(duplicate.client, "v2", "v3", args, parsed(true))).error).toEqual({ code: "P0001" });
    expect(duplicate.rpc).toHaveBeenCalledTimes(1);
  });
  it("keeps every other meal on v2 unchanged", async () => {
    const { client, rpc } = admin();
    await callMealRpc(client, "v2", "v3", args, parsed(false));
    expect(rpc.mock.calls).toEqual([["v2", args]]);
  });
});

describe("time provenance readers (#308)", () => {
  it("distinguishes explicit, registration and unknown, and only explicit counts as a known time", () => {
    const registration = '{"originalTimeKnown":false,"timeSource":"registration"}';
    expect(nutritionMealTimeSource(null, "meal")).toBe("explicit");
    expect(nutritionMealTimeSource('{"originalTimeKnown":false}', "meal")).toBe("unknown");
    expect(nutritionMealTimeSource(registration, "meal")).toBe("registration");
    expect(nutritionMealTimeSource(registration, "legacy_daily_summary")).toBe("unknown");
    expect(nutritionMealTimeKnown(registration, "meal")).toBe(false);
  });
  it("parses timeSource when present and stays compatible when an older server omits it", () => {
    const base = { id: "41200000-0000-4000-8000-000000000001", title: "Tostado", description: null, calories: 380, proteinG: null, carbsG: null, fatG: null,
      consumedAt: "2026-10-31T16:42:00.000Z", updatedAt: "2026-10-31T16:42:00.000Z", timeKnown: false, entryKind: "meal", sourceType: "chatgpt", precision: null, mealLabel: null };
    const total = (knownTotal: number, missingCount: number) => ({ knownTotal, missingCount });
    const day = (m: Record<string, unknown>) => parseNutritionDayData({ dayState: "recorded", meals: [m],
      summary: { calories: total(380, 0), proteinG: total(0, 1), carbsG: total(0, 1), fatG: total(0, 1), entryCount: 1, mealCount: 1 },
      context: { calorieTarget: null, proteinTargetG: null, waterTargetL: null, expenditureKcal: null, targetAutomaticKcal: null, targetOverrideKcal: null,
        expenditureAutomaticKcal: null, expenditureOverrideKcal: null, deltaVsTargetKcal: 0, energyBalanceKcal: 0, resolvedAt: null,
        training: { effective: null, source: null }, work: { effective: null, source: null } } });
    expect(day({ ...base, timeSource: "registration" })?.meals[0].timeSource).toBe("registration");
    expect(day(base)?.meals[0]).not.toHaveProperty("timeSource");
    expect(day({ ...base, timeSource: "explicit" })).toBeUndefined();
    expect(day({ ...base, timeSource: "guess" })).toBeUndefined();
  });
});
