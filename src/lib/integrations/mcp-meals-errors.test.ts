import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
// The OAuth gate is exercised in oauth-auth.test.ts; here it either authorizes or answers by itself.
const gate = vi.hoisted(() => ({ status: 0 }));
vi.mock("./oauth-auth", () => ({
  withOwnlevelOAuth: async (req: Request, handler: (req: Request) => Promise<Response>) =>
    gate.status ? new Response(null, { status: gate.status }) : handler(req),
}));
import { handleChatgptMealRequest } from "./chatgpt-meals";
import { handleMealsMcp, registerMealTool } from "./mcp-meals";

const meal = { date: "2026-10-07", title: "Comida sintética", description: "Prueba local",
  calories: 600, protein_g: 0, carbs_g: 80, fat_g: null, idempotency_key: "synthetic-meal-346" };
const BEARER = "Bearer synthetic-user-token";

beforeEach(() => {
  gate.status = 0;
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://synthetic.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "synthetic-public");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "sb_secret_synthetic");
  vi.stubEnv("OWNLEVEL_OAUTH_ENABLED", "true");
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

type ToolResult = { isError?: boolean; structuredContent?: { ok: boolean; error?: string; message?: string }; content: { text: string }[]; _meta?: Record<string, unknown> };
async function callTool(args: Record<string, unknown>): Promise<ToolResult> {
  const response = await handleMealsMcp(new Request("https://www.ownlevel.fit/mcp", { method: "POST",
    headers: { Authorization: BEARER, "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "register_meal", arguments: args } }) }));
  return (await response.json()).result;
}
const api = (status: number, body: unknown) => vi.fn(async () => Response.json(body, { status }));

describe("register_meal calories contract (#346)", () => {
  it("advertises the backend rule: integer kilocalories greater than 0", () => {
    expect(registerMealTool.inputSchema.properties.calories).toMatchObject({ type: "integer", minimum: 1 });
  });
  it("rejects 0 kcal early with a clear invalid_request, before calling the API", async () => {
    const fetcher = api(200, { ok: true }); vi.stubGlobal("fetch", fetcher);
    const result = await callTool({ ...meal, calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 });
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toEqual({ ok: false, error: "invalid_request", message: "Las calorías son obligatorias y deben ser mayores a 0." });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("rejects fractional calories as the server does", async () => {
    const fetcher = api(200, { ok: true }); vi.stubGlobal("fetch", fetcher);
    expect((await callTool({ ...meal, calories: 600.5 })).structuredContent).toMatchObject({ error: "invalid_request", message: "Las calorías deben ser un número entero." });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("forwards a positive integer with 0 and null macros unchanged and returns the saved meal", async () => {
    const saved = { ok: true, created: true, idempotent_replay: false, meal: { id: "m1", date: meal.date, title: meal.title, calories: 600, protein_g: 0, carbs_g: 80, fat_g: null } };
    const fetcher = api(200, saved); vi.stubGlobal("fetch", fetcher);
    const result = await callTool(meal);
    expect(result).toMatchObject({ isError: false, structuredContent: saved });
    const [, options] = fetcher.mock.calls[0] as unknown as [URL, RequestInit];
    expect(JSON.parse(options.body as string)).toMatchObject({ calories: 600, protein_g: 0, fat_g: null });
  });
  it("keeps the API answer for the same meal at 0 kcal: 400 invalid_request", async () => {
    const result = await handleChatgptMealRequest({ authorization: BEARER, contentLength: null, body: { ...meal, calories: 0 } },
      { authenticate: async () => ({ ok: true, identity: { userId: "u1" } }) as never, persist: vi.fn() });
    expect(result).toEqual({ status: 400, body: { ok: false, error: "invalid_request", message: "Las calorías son obligatorias y deben ser mayores a 0." } });
  });
});

describe("register_meal failures stay distinguishable and safe (#346)", () => {
  it("passes possible_duplicate through so the model asks before force_duplicate", async () => {
    vi.stubGlobal("fetch", api(409, { ok: false, error: "possible_duplicate", message: "Existe una comida idéntica cargada recientemente." }));
    expect((await callTool(meal)).structuredContent).toMatchObject({ ok: false, error: "possible_duplicate" });
  });
  it("reports a revoked permission as an authorization challenge, not as a meal failure", async () => {
    vi.stubGlobal("fetch", api(403, { ok: false, error: "permission_denied", message: "x" }));
    const result = await callTool(meal);
    expect(result.content[0].text).toBe("La conexión no tiene permiso vigente.");
    expect(JSON.stringify(result._meta)).toContain("insufficient_scope");
  });
  it("asks to connect only when the gate itself denied the call", async () => {
    gate.status = 401;
    expect((await callTool(meal)).content[0].text).toBe("Conectá OWNLEVEL y autorizá el registro de comidas.");
  });
  it("reports an unavailable authorization check as temporary, not as missing authorization", async () => {
    gate.status = 503;
    expect((await callTool(meal)).structuredContent).toMatchObject({ error: "temporarily_unavailable" });
  });
  it.each([
    ["a network failure", vi.fn(async () => { throw new TypeError("fetch failed: synthetic-user-token"); })],
    ["an unreadable answer", vi.fn(async () => new Response("<html>gateway</html>", { status: 502 }))],
  ])("reports %s as an unconfirmed result with the same idempotency_key, without internal detail", async (_label, fetcher) => {
    vi.stubGlobal("fetch", fetcher);
    const result = await callTool(meal);
    expect(result.structuredContent).toEqual({ ok: false, error: "temporarily_unavailable",
      message: "No se pudo confirmar si la comida quedó registrada. Si reintentás, usá la misma idempotency_key: no se duplica." });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(result)).not.toMatch(/synthetic-user-token|gateway|fetch failed/);
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toMatch(/synthetic-user-token|Comida sintética/);
  });
  it("passes a persistence failure through as internal_error, distinct from the network case", async () => {
    vi.stubGlobal("fetch", api(500, { ok: false, error: "internal_error", message: "No se pudo registrar la comida." }));
    expect((await callTool(meal)).structuredContent).toMatchObject({ ok: false, error: "internal_error" });
  });
});
