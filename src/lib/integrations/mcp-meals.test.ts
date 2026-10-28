import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { forwardOAuthMeal, handleMealsMcp, registerMealTool } from "./mcp-meals";
const meal = { date: "2026-10-07", title: "Comida sintética", description: "Prueba local",
  calories: 600, protein_g: null, carbs_g: 80, fat_g: null, idempotency_key: "synthetic-meal-1" };
afterEach(() => vi.unstubAllEnvs());
function config() {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://synthetic.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "synthetic-public");
  vi.stubEnv("SUPABASE_SECRET_KEY", undefined);
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "sb_secret_synthetic");
  vi.stubEnv("OWNLEVEL_OAUTH_ENABLED", "true");
}
describe("OWNLEVEL MCP forwarding contract", () => {
  it("forwards only the original bearer and canonical meal fields to the fixed API", async () => {
    config();
    const fetcher = vi.fn(async () => Response.json({ ok: true }));
    await forwardOAuthMeal(meal, "Bearer signed-user-token", fetcher);
    const [url, options] = fetcher.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.href).toBe("https://www.ownlevel.fit/api/integrations/chatgpt/meals");
    expect(options.headers).toEqual({ Authorization: "Bearer signed-user-token", "Content-Type": "application/json" });
    expect(options.redirect).toBe("error");
    expect(JSON.parse(options.body as string)).toEqual(meal);
  });
  it("forwards time and meal type only when the user said them (#308)", async () => {
    config();
    const fetcher = vi.fn(async () => Response.json({ ok: true }));
    await forwardOAuthMeal({ ...meal, time: "13:05", meal_type: "lunch" }, "Bearer token", fetcher);
    const [, options] = fetcher.mock.calls[0] as unknown as [URL, RequestInit];
    expect(JSON.parse(options.body as string)).toEqual({ ...meal, time: "13:05", meal_type: "lunch" });
    expect(registerMealTool.inputSchema.required).not.toContain("time");
    expect(registerMealTool.inputSchema.required).not.toContain("meal_type");
  });
  it("forbids user_id before sending anything", async () => {
    config(); const fetcher = vi.fn();
    await expect(forwardOAuthMeal({ ...meal, user_id: "victim" }, "Bearer token", fetcher)).rejects.toThrow("user_id");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("never permits the disposable local origin override in production", async () => {
    config(); vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("OWNLEVEL_LOCAL_API_ORIGIN", "http://127.0.0.1:3007");
    await expect(forwardOAuthMeal(meal, "Bearer token", vi.fn())).rejects.toThrow("Invalid local");
  });
  it("advertises openid, never meals:write as an OAuth scope", () => {
    expect(registerMealTool.securitySchemes).toEqual([{ type: "oauth2", scopes: ["openid"] }]);
    expect(registerMealTool.inputSchema.additionalProperties).toBe(false);
    expect(registerMealTool.inputSchema.properties).not.toHaveProperty("user_id");
    expect(registerMealTool.annotations.idempotentHint).toBe(true);
  });
  it("keeps the staged integration disabled by default", async () => {
    vi.stubEnv("OWNLEVEL_OAUTH_ENABLED", "false");
    expect((await handleMealsMcp(new Request("https://www.ownlevel.fit/mcp"))).status).toBe(503);
  });
  it("rejects foreign browser origins", async () => {
    config();
    expect((await handleMealsMcp(new Request("https://www.ownlevel.fit/mcp", { headers: { Origin: "https://evil.example" } }))).status).toBe(403);
  });
});
