import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { parseChatgptMealInput } from "../integrations/chatgpt-contract";
import { callMealRpc } from "../integrations/meal-rpc";
import { forwardOAuthMeal, registerMealTool } from "../integrations/mcp-meals";
import { parseManualMealFields } from "./nutrition-meal-contract";
import { parseQuickIntent, parseQuickSelection, quickSelectionOf } from "./nutrition-quick-contract";

const DATE = "2026-10-20", TIME = `${DATE}T13:00:00-03:00`;
const fields = { date: DATE, title: "Prueba", description: null, calories: 500, proteinG: 30, carbsG: 60, fatG: 10 };
const selection = { date: DATE, source: { kind: "saved", id: "93670000-0000-4000-8000-00000000000a", version: "a".repeat(64) }, quantities: null };
const NOW = new Date("2026-10-20T16:42:00Z");
const meal = { date: DATE, title: "Tostado", description: "", calories: 380, protein_g: null, carbs_g: null, fat_g: null, idempotency_key: "synthetic-367-1" };

describe("contrato de procedencia", () => {
  it("keeps an old payload exactly as it was, with no statement added", () => {
    expect(parseManualMealFields({ ...fields, consumedAt: TIME })).not.toHaveProperty("consumedAtSource");
    expect(parseManualMealFields(fields)).not.toHaveProperty("consumedAtSource");
    expect(parseQuickSelection({ ...selection, consumedAt: TIME })).not.toHaveProperty("consumedAtSource");
  });
  it("accepts only a stated time", () => {
    expect(parseManualMealFields({ ...fields, consumedAt: TIME, consumedAtSource: "user_declared" })).toMatchObject({ consumedAtSource: "user_declared" });
    expect(parseManualMealFields({ ...fields, consumedAtSource: "user_declared" })).toBeUndefined();
    for (const value of ["default_clock", "registration_now", "imported", null, true]) expect(parseManualMealFields({ ...fields, consumedAt: TIME, consumedAtSource: value })).toBeUndefined();
  });
  it("travels through the quick selection and its intent", () => {
    const stated = parseQuickSelection({ ...selection, consumedAt: TIME, consumedAtSource: "user_declared" })!;
    expect(quickSelectionOf(stated)).toMatchObject({ consumedAtSource: "user_declared" });
    expect(parseQuickIntent({ ...stated, operation: "register", idempotencyKey: "abc" })).toMatchObject({ consumedAtSource: "user_declared" });
    expect(parseQuickSelection({ ...selection, consumedAtSource: "user_declared" })).toBeUndefined();
  });
});

describe("ChatGPT", () => {
  it("does not take a time as stated unless the caller says so", () => {
    expect(parseChatgptMealInput({ ...meal, time: "13:00" }, NOW)).toMatchObject({ time_stated: false, consumed_at: TIME });
    expect(parseChatgptMealInput({ ...meal, time: "13:00", time_stated_by_user: true }, NOW)).toMatchObject({ time_stated: true });
  });
  it("rejects a statement without a time, or that is not boolean", () => {
    expect(() => parseChatgptMealInput({ ...meal, time_stated_by_user: true }, NOW)).toThrow("time_stated_by_user");
    expect(() => parseChatgptMealInput({ ...meal, time: "13:00", time_stated_by_user: "yes" }, NOW)).toThrow("time_stated_by_user");
  });
  const rpcWith = (...results: { error: { code: string } | null }[]) => {
    const rpc = vi.fn();
    for (const result of results) rpc.mockResolvedValueOnce({ data: {}, ...result });
    return rpc;
  };
  const call = (rpc: ReturnType<typeof vi.fn>, body: Record<string, unknown>) => callMealRpc({ rpc } as never, "create_chatgpt_meal_for_integration_v2", "create_chatgpt_meal_for_integration_v3", { p_consumed_at: TIME }, parseChatgptMealInput({ ...meal, ...body }, NOW));
  it("goes through v4 only with the statement, and stays on v2 without it", async () => {
    const stated = rpcWith({ error: null });
    await call(stated, { time: "13:00", time_stated_by_user: true });
    expect(stated).toHaveBeenCalledWith("create_chatgpt_meal_for_integration_v4", { p_consumed_at: TIME, p_time_source: "user_declared" });
    const plain = rpcWith({ error: null });
    await call(plain, { time: "13:00" });
    expect(plain).toHaveBeenCalledWith("create_chatgpt_meal_for_integration_v2", { p_consumed_at: TIME });
  });
  it("falls back to v2 until the EXPAND is applied, and never after any other failure", async () => {
    const missing = rpcWith({ error: { code: "PGRST202" } }, { error: null });
    await call(missing, { time: "13:00", time_stated_by_user: true });
    expect(missing).toHaveBeenCalledTimes(2);
    expect(missing).toHaveBeenLastCalledWith("create_chatgpt_meal_for_integration_v2", { p_consumed_at: TIME });
    const failed = rpcWith({ error: { code: "57014" } });
    await call(failed, { time: "13:00", time_stated_by_user: true });
    expect(failed).toHaveBeenCalledTimes(1);
  });
  it("carries the statement through MCP and documents it", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://synthetic.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "synthetic-public");
    vi.stubEnv("SUPABASE_SECRET_KEY", undefined);
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "sb_secret_synthetic");
    vi.stubEnv("OWNLEVEL_OAUTH_ENABLED", "true");
    const fetcher = vi.fn(async () => Response.json({ ok: true }));
    await forwardOAuthMeal({ ...meal, consumed_now: false, time: "13:00", time_stated_by_user: true }, "Bearer x", fetcher as never);
    const body = (call: number) => JSON.parse((fetcher.mock.calls[call] as unknown as [URL, RequestInit])[1].body as string);
    expect(body(0)).toMatchObject({ time: "13:00", time_stated_by_user: true });
    await forwardOAuthMeal({ ...meal, consumed_now: false, time: "13:00" }, "Bearer x", fetcher as never);
    expect(body(1)).not.toHaveProperty("time_stated_by_user");
    expect(registerMealTool.inputSchema.properties).toHaveProperty("time_stated_by_user");
    vi.unstubAllEnvs();
  });
});
