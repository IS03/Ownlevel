import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

const supabaseMocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  createAdminClient: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("../supabase/server", () => ({
  createClient: supabaseMocks.createClient,
}));
vi.mock("../supabase/admin", () => ({
  createAdminClient: supabaseMocks.createAdminClient,
}));

import {
  handleChatgptMealRequest,
  PossibleDuplicateError,
  type ChatgptMealDependencies,
} from "./chatgpt-meals";
import { parseBearerToken, parseChatgptMealInput } from "./chatgpt-contract";
import { handleChatgptStatusRequest } from "./chatgpt-status";
import {
  authenticateIntegrationToken,
  hashIntegrationToken,
  listIntegrationApiTokens,
  newIntegrationToken,
} from "./chatgpt-tokens";
import { persistChatgptMeal } from "./chatgpt-server";

const validToken = `ownlevel_${"a".repeat(43)}`;

const validBody = {
  date: "2026-08-20",
  title: "Pechuga con arroz",
  description: "Porción sintética",
  calories: 650,
  protein_g: 55,
  carbs_g: 70,
  fat_g: 14,
  idempotency_key: "synthetic-request-1",
};

const success = {
  ok: true as const,
  created: true,
  idempotent_replay: false,
  meal: {
    id: "synthetic-meal",
    date: "2026-08-20",
    title: "PECHUGA CON ARROZ",
    calories: 650,
    protein_g: 55,
    carbs_g: 70,
    fat_g: 14,
  },
};

function deps(overrides: Partial<ChatgptMealDependencies> = {}): ChatgptMealDependencies {
  return {
    authenticate: vi.fn(async () => ({ userId: "token-owner" })),
    persist: vi.fn(async () => success),
    ...overrides,
  };
}

function request(body: unknown = validBody, authorization: string | null = "Bearer ownlevel_synthetic_token_that_is_long_enough") {
  return { body, authorization, contentLength: "512" };
}

describe("ChatGPT private meal contract", () => {
  it("acepta Bearer case-insensitive, OWS exterior y múltiples espacios", () => {
    expect(parseBearerToken(`Bearer ${validToken}`)).toBe(validToken);
    expect(parseBearerToken(`bearer ${validToken}`)).toBe(validToken);
    expect(parseBearerToken(`BEARER ${validToken}`)).toBe(validToken);
    expect(parseBearerToken(`Bearer    ${validToken}`)).toBe(validToken);
    expect(parseBearerToken(` \t bearer\t${validToken} \t`)).toBe(validToken);
  });

  it("rechaza credential vacía, whitespace interno y Authorization ausente", () => {
    expect(parseBearerToken("Bearer    ")).toBeNull();
    expect(parseBearerToken(`Bearer ${validToken} extra`)).toBeNull();
    expect(parseBearerToken(null)).toBeNull();
  });

  it("envía cada Bearer válido al autenticador sin alterar la credential", async () => {
    for (const header of [
      `Bearer ${validToken}`,
      `bearer ${validToken}`,
      `BEARER    ${validToken}`,
      ` \tBearer\t${validToken}\t `,
    ]) {
      const authenticate = vi.fn(async () => ({ userId: "token-owner" }));
      expect(
        (await handleChatgptMealRequest(request(validBody, header), deps({ authenticate }))).status,
      ).toBe(200);
      expect(authenticate).toHaveBeenCalledWith(validToken);
    }
  });

  it("clasifica fallos previos al lookup sin registrar credenciales", async () => {
    const auditAuth = vi.fn();
    const authenticate = vi.fn(async () => ({ userId: "token-owner" }));
    await handleChatgptMealRequest(request(validBody, null), deps({ auditAuth, authenticate }));
    await handleChatgptMealRequest(request(validBody, "Bearer   "), deps({ auditAuth, authenticate }));
    expect(auditAuth.mock.calls).toEqual([
      ["missing_authorization"],
      ["malformed_bearer"],
    ]);
    expect(authenticate).not.toHaveBeenCalled();
  });

  it("rechaza formas de token ajenas a OWNLEVEL antes del lookup", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    await expect(authenticateIntegrationToken("arbitrary-token")).resolves.toBeNull();
    expect(info).toHaveBeenCalledWith(
      "[ownlevel-chatgpt-auth] invalid_token_shape",
    );
    info.mockRestore();
  });

  it("exige scope meals:write y un token no revocado en el lookup", async () => {
    const chain = {
      select: vi.fn(),
      eq: vi.fn(),
      is: vi.fn(),
      maybeSingle: vi.fn(async () => ({ data: null, error: null })),
    };
    chain.select.mockReturnValue(chain);
    chain.eq.mockReturnValue(chain);
    chain.is.mockReturnValue(chain);
    supabaseMocks.createAdminClient.mockReturnValue({
      from: vi.fn(() => chain),
    } as never);

    await expect(authenticateIntegrationToken(validToken)).resolves.toBeNull();
    expect(chain.eq).toHaveBeenCalledWith("scope", "meals:write");
    expect(chain.is).toHaveBeenCalledWith("revoked_at", null);
  });

  it("rechaza Authorization ausente, inválida o revocada", async () => {
    expect((await handleChatgptMealRequest(request(validBody, null), deps())).status).toBe(401);
    expect((await handleChatgptMealRequest(request(validBody, "Basic abc"), deps())).status).toBe(401);
    expect((await handleChatgptMealRequest(request(), deps({ authenticate: vi.fn(async () => null) }))).status).toBe(401);
    expect((await handleChatgptMealRequest(request(), deps({ authenticate: vi.fn(async () => { throw new Error("db"); }) }))).status).toBe(500);
  });

  it("status autentica con la misma fuente de verdad y no expone datos", async () => {
    const authenticate = vi.fn(async () => ({
      userId: "private-user-id",
      tokenId: "private-token-id",
    }));
    const result = await handleChatgptStatusRequest(`Bearer ${validToken}`, {
      authenticate,
    });

    expect(result).toEqual({
      status: 200,
      body: { ok: true, connected: true },
    });
    expect(authenticate).toHaveBeenCalledWith(validToken);
    expect(JSON.stringify(result.body)).not.toContain("private-user-id");
    expect(JSON.stringify(result.body)).not.toContain("private-token-id");
    expect(JSON.stringify(result.body)).not.toMatch(
      /email|calories|protein|carbs|fat|weight|steps|token_hash/i,
    );
  });

  it("status devuelve 401 para token ausente, inválido o revocado", async () => {
    const authenticate = vi.fn(async () => null);
    expect(
      (await handleChatgptStatusRequest(null, { authenticate })).status,
    ).toBe(401);
    expect(
      (await handleChatgptStatusRequest("Basic invalid", { authenticate })).status,
    ).toBe(401);
    expect(
      (
        await handleChatgptStatusRequest(`Bearer ${validToken}`, {
          authenticate,
        })
      ).status,
    ).toBe(401);
  });

  it("un token autenticado actualiza last_used_at sin devolver el hash", async () => {
    const lookup = {
      select: vi.fn(),
      eq: vi.fn(),
      is: vi.fn(),
      maybeSingle: vi.fn(async () => ({
        data: { id: "token-id", user_id: "owner-id", scope: "meals:write" },
        error: null,
      })),
    };
    lookup.select.mockReturnValue(lookup);
    lookup.eq.mockReturnValue(lookup);
    lookup.is.mockReturnValue(lookup);

    const usage = {
      update: vi.fn(),
      eq: vi.fn(),
      is: vi.fn(async () => ({ error: null })),
    };
    usage.update.mockReturnValue(usage);
    usage.eq.mockReturnValue(usage);

    const from = vi
      .fn()
      .mockReturnValueOnce(lookup)
      .mockReturnValueOnce(usage);
    supabaseMocks.createAdminClient.mockReturnValue({ from } as never);

    const result = await handleChatgptStatusRequest(`Bearer ${validToken}`, {
      authenticate: authenticateIntegrationToken,
    });

    expect(result.status).toBe(200);
    expect(lookup.select).toHaveBeenCalledWith("id,user_id,scope");
    expect(usage.update).toHaveBeenCalledWith({
      last_used_at: expect.any(String),
    });
    expect(JSON.stringify(result.body)).not.toContain("token-id");
  });

  it("usa exclusivamente el user del token y rechaza user_id en payload", async () => {
    const persist = vi.fn(async () => success);
    const dependency = deps({ persist });
    expect((await handleChatgptMealRequest(request(), dependency)).status).toBe(200);
    expect(persist).toHaveBeenCalledWith("token-owner", expect.objectContaining({ date: "2026-08-20" }));
    const injected = await handleChatgptMealRequest(
      request({ ...validBody, user_id: "attacker" }),
      dependency,
    );
    expect(injected.status).toBe(400);
  });

  it("resuelve fecha explícita o default Córdoba y conserva null distinto de cero", () => {
    expect(parseChatgptMealInput({ ...validBody, date: undefined }, new Date("2026-08-20T02:30:00Z")).date).toBe("2026-08-19");
    expect(parseChatgptMealInput({ ...validBody, protein_g: null, carbs_g: 0, fat_g: undefined })).toMatchObject({
      date: "2026-08-20",
      protein_g: null,
      carbs_g: 0,
      fat_g: null,
    });
  });

  it("rechaza macros inválidos, campos arbitrarios y bodies grandes", async () => {
    expect(() => parseChatgptMealInput({ ...validBody, protein_g: -1 })).toThrow();
    expect(() => parseChatgptMealInput({ ...validBody, calories: Number.NaN })).toThrow();
    expect(() => parseChatgptMealInput({ ...validBody, extra: true })).toThrow("Campos no permitidos");
    const oversized = await handleChatgptMealRequest(
      { ...request(), contentLength: "20000" },
      deps(),
    );
    expect(oversized.status).toBe(413);
  });

  it("diferencia replay idempotente, duplicado humano y force_duplicate", async () => {
    const replay = { ...success, created: false, idempotent_replay: true };
    expect((await handleChatgptMealRequest(request(), deps({ persist: vi.fn(async () => replay) }))).body).toMatchObject({ created: false, idempotent_replay: true });
    expect((await handleChatgptMealRequest(request(), deps({ persist: vi.fn(async () => { throw new PossibleDuplicateError(); }) }))).status).toBe(409);
    const persist = vi.fn(async () => success);
    await handleChatgptMealRequest(request({ ...validBody, force_duplicate: true }), deps({ persist }));
    expect(persist).toHaveBeenCalledWith("token-owner", expect.objectContaining({ force_duplicate: true }));
  });

  it("limita la respuesta pública a la escritura recién confirmada", async () => {
    const rpc = vi.fn(async () => ({
      data: {
        ...success,
        meal: {
          ...success.meal,
          description: "Dato interno no público",
          daily_position: 3,
        },
        day: {
          total_calories: 1_234,
          total_protein_g: 99,
          total_carbs_g: 120,
          total_fat_g: 45,
          target_calories: 2_100,
          target_protein_g: 130,
        },
        nutrition_target: { calories: 2_100, protein_g: 130 },
        other_meals: [{ id: "private-existing-meal" }],
      },
      error: null,
    }));
    supabaseMocks.createAdminClient.mockReturnValue({ rpc } as never);

    const result = await persistChatgptMeal("token-owner", {
      ...parseChatgptMealInput(validBody),
    });

    expect(result).toEqual(success);
    expect(Object.keys(result)).toEqual([
      "ok",
      "created",
      "idempotent_replay",
      "meal",
    ]);
    expect(Object.keys(result.meal)).toEqual([
      "id",
      "date",
      "title",
      "calories",
      "protein_g",
      "carbs_g",
      "fat_g",
    ]);
    expect(JSON.stringify(result)).not.toMatch(
      /day|total_|target|other_meals|description|daily_position|private-existing-meal/i,
    );
  });

  it("hora y tipo sólo si el usuario los dijo: HH:MM de Córdoba en la fecha, nunca inferidos (#308)", () => {
    const none = parseChatgptMealInput(validBody);
    expect(none.consumed_at).toBeNull();
    expect(none.meal_type).toBeNull();
    const said = parseChatgptMealInput({ ...validBody, time: "23:45", meal_type: "dinner" });
    expect(said.consumed_at).toBe("2026-08-20T23:45:00-03:00");
    expect(new Date(said.consumed_at!).toISOString()).toBe("2026-08-21T02:45:00.000Z");
    expect(said.meal_type).toBe("dinner");
    for (const time of ["24:00", "7:30", "07:30:00", 730]) {
      expect(() => parseChatgptMealInput({ ...validBody, time })).toThrow("Hora inválida");
    }
    expect(() => parseChatgptMealInput({ ...validBody, meal_type: "brunch" })).toThrow("Tipo de comida inválido");
  });

  it("persiste con la RPC v2 y pasa hora y tipo sin inventarlos (#308)", async () => {
    const rpc = vi.fn(async () => ({ data: { ok: true, created: true, idempotent_replay: false,
      meal: { id: "m", date: "2026-08-20", title: "T", calories: 1, protein_g: null, carbs_g: null, fat_g: null } }, error: null }));
    supabaseMocks.createAdminClient.mockReturnValue({ rpc } as never);
    await persistChatgptMeal("token-owner", parseChatgptMealInput(validBody));
    await persistChatgptMeal("token-owner", parseChatgptMealInput({ ...validBody, time: "08:10", meal_type: "breakfast" }));
    const calls = rpc.mock.calls as unknown as [string, Record<string, unknown>][];
    expect(calls[0][0]).toBe("create_chatgpt_meal_for_integration_v2");
    expect(calls[0][1]).toMatchObject({ p_consumed_at: null, p_meal_label: null });
    expect(calls[1][1]).toMatchObject({ p_consumed_at: "2026-08-20T08:10:00-03:00", p_meal_label: "breakfast" });
  });

  it("genera secretos aleatorios y sólo persiste SHA-256", () => {
    const first = newIntegrationToken();
    const second = newIntegrationToken();
    expect(first).toMatch(/^ownlevel_[A-Za-z0-9_-]{40,}$/);
    expect(first).not.toBe(second);
    expect(hashIntegrationToken(first)).toMatch(/^[0-9a-f]{64}$/);
    const migration = readFileSync("supabase/migrations/20260820130000_chatgpt_private_meal_api.sql", "utf8");
    expect(migration).toContain("token_hash text not null");
    expect(migration).not.toContain(first);
    expect(migration).toContain("'chatgpt'");
    expect(migration).toContain("'meal'");
  });

  it("la lectura web nunca selecciona token_hash ni el token raw", async () => {
    const chain = {
      select: vi.fn(),
      eq: vi.fn(),
      order: vi.fn(async () => ({ data: [], error: null })),
    };
    chain.select.mockReturnValue(chain);
    chain.eq.mockReturnValue(chain);
    const getUser = vi.fn(async () => ({
      data: { user: { id: "owner" } },
      error: null,
    }));
    supabaseMocks.createClient.mockResolvedValue({
      auth: { getUser },
      from: vi.fn(() => chain),
    } as never);

    await expect(listIntegrationApiTokens()).resolves.toEqual([]);
    expect(chain.select).toHaveBeenCalledWith(
      "id,token_prefix,label,scope,created_at,last_used_at,revoked_at",
    );
    expect(chain.select.mock.calls[0]?.[0]).not.toContain("token_hash");
  });
});
