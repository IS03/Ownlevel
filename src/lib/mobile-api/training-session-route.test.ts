import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { MobileApiConflictError, MobileApiNotFoundError, MobileApiUnauthorizedError } from "./auth";

const mocks = vi.hoisted(() => ({ readAuth: vi.fn(), writeAuth: vi.fn(), detail: vi.fn(), sync: vi.fn(), save: vi.fn(), add: vi.fn(), remove: vi.fn(), cancel: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("./supabase", () => ({ authenticateMobileAccessToken: mocks.readAuth, authenticateMobileMutationAccessToken: mocks.writeAuth }));
vi.mock("./training-session-server", () => ({ readMobileSession: mocks.detail, readMobileSessionExercise: mocks.sync,
  saveMobileSessionExercise: mocks.save, addMobileSessionExercise: mocks.add,
  removeMobileSessionExercise: mocks.remove, cancelMobileSession: mocks.cancel }));
import { GET as detailGET, DELETE as cancelDELETE, OPTIONS } from "../../app/api/mobile/v1/training/sessions/[sessionId]/route";
import { GET as syncGET, PUT, DELETE as removeDELETE } from "../../app/api/mobile/v1/training/sessions/[sessionId]/exercises/[sessionExerciseId]/route";
import { POST } from "../../app/api/mobile/v1/training/sessions/[sessionId]/exercises/route";

const sessionId = "33300000-0000-4000-8000-000000000001";
const sessionExerciseId = "33300000-0000-4000-8000-000000000003";
const resource = { params: Promise.resolve({ sessionId, sessionExerciseId }) };
const bearerContext = { userId: "bearer-owner", supabase: {} };
const request = (method: string, body?: unknown, authorization = "Bearer valid") => new NextRequest("https://example.test/api/mobile/v1/training/sessions/session", {
  method, headers: { authorization, "content-type": "application/json" },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});
describe("M3.3B final Route Handlers", () => {
  beforeEach(() => {
    vi.clearAllMocks(); mocks.readAuth.mockResolvedValue(bearerContext); mocks.writeAuth.mockResolvedValue(bearerContext);
    mocks.detail.mockResolvedValue({ session: { id: sessionId }, exercises: [], quickHistory: { status: "unavailable" } });
    mocks.sync.mockResolvedValue({ status: "removed" }); mocks.save.mockResolvedValue({ updatedAt: "token" });
    mocks.add.mockResolvedValue({ status: "added" }); mocks.remove.mockResolvedValue({ status: "removed" }); mocks.cancel.mockResolvedValue({ status: "cancelled" });
  });
  it("loads detail and sync with explicit Bearer context and private no-store headers", async () => {
    const response = await detailGET(request("GET"), resource);
    expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.readAuth).toHaveBeenCalledWith("valid");
    expect(mocks.detail).toHaveBeenCalledWith(sessionId, bearerContext, expect.any(Object), false);
    expect((await syncGET(request("GET"), resource)).status).toBe(200);
    expect(mocks.sync).toHaveBeenCalledWith(sessionId, sessionExerciseId, bearerContext, false);
    expect(mocks.writeAuth).not.toHaveBeenCalled();
  });
  it("wires PUT/POST/DELETE with authenticated no-retry mutation context", async () => {
    const body = { idempotencyKey: "intent" };
    expect((await PUT(request("PUT", body), resource)).status).toBe(200);
    expect(mocks.save).toHaveBeenCalledWith(sessionId, sessionExerciseId, body, bearerContext, false);
    expect((await POST(request("POST", body), resource)).status).toBe(201);
    expect(mocks.add).toHaveBeenCalledWith(sessionId, body, bearerContext);
    expect((await removeDELETE(request("DELETE", body), resource)).status).toBe(200);
    expect(mocks.remove).toHaveBeenCalledWith(sessionId, sessionExerciseId, body, bearerContext);
    expect((await cancelDELETE(request("DELETE", body), resource)).status).toBe(200);
    expect(mocks.cancel).toHaveBeenCalledWith(sessionId, body, bearerContext);
    expect(mocks.writeAuth).toHaveBeenCalledTimes(4); expect(mocks.readAuth).not.toHaveBeenCalled();
  });
  it("adopts additions only when explicitly requested, without changing structural operations", async () => {
    const make = (method: string) => new NextRequest("https://example.test/api/mobile/v1/training/sessions/session?routineAdditions=1", { method, headers: { authorization: "Bearer valid", "content-type": "application/json" }, ...(method === "PUT" ? { body: JSON.stringify({}) } : {}) });
    await detailGET(make("GET"), resource); expect(mocks.detail).toHaveBeenLastCalledWith(sessionId, bearerContext, expect.any(Object), true);
    await syncGET(make("GET"), resource); expect(mocks.sync).toHaveBeenLastCalledWith(sessionId, sessionExerciseId, bearerContext, true);
    await PUT(make("PUT"), resource); expect(mocks.save).toHaveBeenLastCalledWith(sessionId, sessionExerciseId, {}, bearerContext, true);
  });
  it("preserves 404/503 rather than returning an empty session", async () => {
    mocks.detail.mockRejectedValueOnce(new MobileApiNotFoundError());
    const missing = await detailGET(request("GET"), resource);
    expect(missing.status).toBe(404); expect(await missing.json()).toMatchObject({ error: "NOT_FOUND" });
    mocks.detail.mockRejectedValueOnce(new Error("private database error"));
    const unavailable = await detailGET(request("GET"), resource);
    expect(unavailable.status).toBe(503); expect(await unavailable.json()).toEqual({ error: "DATA_UNAVAILABLE" });
  });
  it("rejects malformed Bearer and invalid JSON before running domain writes", async () => {
    const missing = await PUT(request("PUT", {}, ""), resource);
    expect(missing.status).toBe(401); expect(mocks.writeAuth).not.toHaveBeenCalled(); expect(mocks.save).not.toHaveBeenCalled();
    mocks.writeAuth.mockRejectedValueOnce(new MobileApiUnauthorizedError());
    expect((await cancelDELETE(request("DELETE", {}), resource)).status).toBe(401);
    const badJson = new NextRequest("https://example.test", { method: "PUT", headers: { authorization: "Bearer valid" }, body: "{" });
    expect((await PUT(badJson, resource)).status).toBe(400); expect(mocks.save).not.toHaveBeenCalled();
  });
  it("returns stable 409 codes and does not replay domain calls on failures", async () => {
    mocks.remove.mockRejectedValueOnce(new MobileApiConflictError("Changed", "SESSION_EXERCISE_CHANGED"));
    const result = await removeDELETE(request("DELETE", {}), resource);
    expect(result.status).toBe(409); expect(await result.json()).toEqual({ error: "SESSION_EXERCISE_CHANGED", message: "Changed" });
    expect(mocks.remove).toHaveBeenCalledTimes(1);
    expect(OPTIONS(request("OPTIONS")).status).toBe(204);
  });
});
