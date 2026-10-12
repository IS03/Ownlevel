import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ authenticate: vi.fn(), rpc: vi.fn(), initialPlan: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("./supabase", () => ({ authenticateMobileMutationAccessToken: mocks.authenticate }));
vi.mock("../phase2/training-robust", () => ({ getInitialPlanStatus: mocks.initialPlan }));

import { POST as duplicateRoute } from "../../app/api/mobile/v1/training/routines/[id]/duplicate/route";
import { PUT as orderRoute } from "../../app/api/mobile/v1/training/routines/order/route";
import { readMobileTrainingRoutines } from "./training-server";
import type { MobileSupabaseAuthenticatedContext } from "./supabase";
import {
  parseMobileTrainingRoutineCreate,
  parseMobileTrainingRoutineDuplicate,
  parseMobileTrainingRoutineIdentity,
  parseMobileTrainingRoutineOrder,
  parseMobileTrainingRoutinesSnapshot,
} from "./training";
import { ROUTINE_COLOR_KEYS } from "../phase2/routine-colors";

const sourceId = "93000000-0000-4000-8000-000000000101";
const copyId = "93000000-0000-4000-8000-000000000102";
const timestamp = "2026-10-12T12:00:00.123456Z";
const duplicatePayload = {
  name: "PUSH copia", color: "sand", idempotencyKey: "duplicate-1",
  expectedUpdatedAt: timestamp, expectedTemplateVersion: 3,
};
const orderPayload = { routineIds: [copyId, sourceId], expectedListVersion: 7, idempotencyKey: "order-1" };
const routine = { id: copyId, name: "PUSH copia", color: "sand", order: 2, isActive: true, exerciseCount: 8, setCount: 24 };
const context = { userId: "bearer-identity", supabase: { rpc: mocks.rpc } } as unknown as MobileSupabaseAuthenticatedContext;
function request(method: string, payload: unknown, authorization: string | null = "Bearer valid-token") {
  return new NextRequest("https://ownlevel.test/api/mobile/v1/training/routines", {
    method, headers: { "content-type": "application/json", ...(authorization ? { authorization } : {}) },
    body: JSON.stringify(payload),
  });
}
const routeParams = { params: Promise.resolve({ id: sourceId }) };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.authenticate.mockResolvedValue(context);
  mocks.initialPlan.mockResolvedValue({ imported: false, routinesFound: 0 });
});

describe("routine library EXPAND contracts", () => {
  it.each(ROUTINE_COLOR_KEYS)("accepts %s for create, duplicate and CAS identity", color => {
    expect(parseMobileTrainingRoutineCreate({ name: "PUSH", color, idempotencyKey: "create-1" }).color).toBe(color);
    expect(parseMobileTrainingRoutineDuplicate({ ...duplicatePayload, color }).color).toBe(color);
    expect(parseMobileTrainingRoutineIdentity({ name: "PUSH", color, expectedUpdatedAt: timestamp }).color).toBe(color);
  });

  it("requires source revisions and rejects client ownership or unknown colors", () => {
    expect(parseMobileTrainingRoutineDuplicate({ ...duplicatePayload, color: null }).color).toBeNull();
    for (const patch of [
      { expectedUpdatedAt: undefined }, { expectedTemplateVersion: undefined }, { expectedTemplateVersion: 0 },
      { expectedTemplateVersion: Number.MAX_SAFE_INTEGER + 1 }, { userId: "someone-else" }, { color: "red" },
    ]) expect(() => parseMobileTrainingRoutineDuplicate({ ...duplicatePayload, ...patch })).toThrow();
  });

  it("keeps request order, rejects duplicate/foreign-shape IDs and unsafe versions", () => {
    expect(parseMobileTrainingRoutineOrder(orderPayload).routineIds).toEqual([copyId, sourceId]);
    expect(parseMobileTrainingRoutineOrder({ ...orderPayload, routineIds: [] }).routineIds).toEqual([]);
    for (const patch of [
      { routineIds: [sourceId, sourceId.toUpperCase()] }, { routineIds: [null] }, { routineIds: "ids" },
      { routineIds: Array(1001).fill(sourceId) }, { expectedListVersion: -1 },
      { expectedListVersion: Number.MAX_SAFE_INTEGER + 1 }, { userId: "spoof" },
    ]) expect(() => parseMobileTrainingRoutineOrder({ ...orderPayload, ...patch })).toThrow();
  });

  it("rejects malformed snapshots instead of inventing empty or zero values", () => {
    expect(parseMobileTrainingRoutinesSnapshot({ routines: [], listVersion: 0 })).toEqual({ routines: [], listVersion: 0 });
    for (const value of [
      { routines: [routine], listVersion: undefined }, { routines: [routine, routine], listVersion: 1 },
      { routines: [{ ...routine, setCount: undefined }], listVersion: 1 },
      { routines: [{ ...routine, order: 1001 }], listVersion: 1 },
    ]) expect(() => parseMobileTrainingRoutinesSnapshot(value)).toThrow();
  });
});

describe("routine library HTTP → bearer → RPC", () => {
  it("returns 201 for duplicate and passes only the approved payload to its RPC", async () => {
    mocks.rpc.mockResolvedValue({ data: [{ response_status: 201, response_body: { routine }, replayed: false }], error: null });
    const response = await duplicateRoute(request("POST", duplicatePayload), routeParams);
    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ routine });
    expect(mocks.authenticate).toHaveBeenCalledWith("valid-token");
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("mobile_duplicate_training_routine", {
      p_routine_id: sourceId, p_name: "PUSH copia", p_color: "sand", p_idempotency_key: "duplicate-1",
      p_expected_updated_at: timestamp, p_expected_template_version: 3,
    });
  });

  it("returns 200 for an idempotent order replay", async () => {
    const body = { routineIds: orderPayload.routineIds, listVersion: 9 };
    mocks.rpc.mockResolvedValue({ data: [{ response_status: 200, response_body: body, replayed: true }], error: null });
    const response = await orderRoute(request("PUT", orderPayload));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(body);
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("mobile_reorder_training_routines", {
      p_routine_ids: [copyId, sourceId], p_expected_list_version: 7, p_idempotency_key: "order-1",
    });
  });

  it.each([
    ["40001", "ROUTINE_LIST_CHANGED", 409, "ROUTINE_LIST_CHANGED"],
    ["P0001", "IDEMPOTENCY_KEY_REUSED", 409, "IDEMPOTENCY_KEY_REUSED"],
    ["08006", "Connection lost", 503, "DATA_UNAVAILABLE"],
  ])("maps order %s/%s without retrying the write", async (code, message, status, expected) => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code, message } });
    const response = await orderRoute(request("PUT", orderPayload));
    expect(response.status).toBe(status);
    expect((await response.json()).error).toBe(expected);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["P0002", "TRAINING_ROUTINE_NOT_FOUND", 404, "NOT_FOUND"],
    ["40001", "ROUTINE_CHANGED", 409, "ROUTINE_CHANGED"],
    ["40001", "ROUTINE_TEMPLATE_CHANGED", 409, "ROUTINE_TEMPLATE_CHANGED"],
    ["23505", "duplicate name", 400, "VALIDATION_ERROR"],
    ["P0001", "TRAINING_ROUTINE_TEMPLATE_CORRUPT", 503, "DATA_UNAVAILABLE"],
  ])("maps duplicate %s/%s", async (code, message, status, expected) => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code, message } });
    const response = await duplicateRoute(request("POST", duplicatePayload), routeParams);
    expect(response.status).toBe(status);
    expect((await response.json()).error).toBe(expected);
  });

  it("requires bearer auth before executing either write", async () => {
    expect((await duplicateRoute(request("POST", duplicatePayload, null), routeParams)).status).toBe(401);
    expect((await orderRoute(request("PUT", orderPayload, null))).status).toBe(401);
    expect(mocks.authenticate).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("rejects client userId before any SQL write", async () => {
    expect((await duplicateRoute(request("POST", { ...duplicatePayload, userId: "spoof" }), routeParams)).status).toBe(400);
    expect((await orderRoute(request("PUT", { ...orderPayload, userId: "spoof" }))).status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it.each([
    { routineIds: [sourceId, copyId], listVersion: 9 },
    { routineIds: [copyId, sourceId], listVersion: 6 },
    { routineIds: [copyId, sourceId], listVersion: null },
  ])("returns unavailable for a mismatched database order response", async body => {
    mocks.rpc.mockResolvedValue({ data: [{ response_status: 200, response_body: body, replayed: false }], error: null });
    expect((await orderRoute(request("PUT", orderPayload))).status).toBe(503);
  });

  it("returns unavailable for incomplete duplicate counts", async () => {
    mocks.rpc.mockResolvedValue({ data: [{ response_status: 201, response_body: { routine: { ...routine, setCount: undefined } }, replayed: false }], error: null });
    expect((await duplicateRoute(request("POST", duplicatePayload), routeParams)).status).toBe(503);
  });

  it("reads counts and version through the same atomic RPC, independently of initial-plan availability", async () => {
    mocks.rpc.mockResolvedValue({ data: { routines: [routine], listVersion: 9 }, error: null });
    mocks.initialPlan.mockRejectedValue(new Error("unavailable"));
    const result = await readMobileTrainingRoutines(context, {} as never);
    expect(result).toEqual({ routines: { status: "ok", data: [routine] }, listVersion: { status: "ok", data: 9 }, initialPlan: { status: "unavailable" } });
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("mobile_training_routines_snapshot");
  });

  it("keeps a malformed snapshot unavailable together with its version", async () => {
    mocks.rpc.mockResolvedValue({ data: { routines: [{ ...routine, setCount: undefined }], listVersion: 9 }, error: null });
    const result = await readMobileTrainingRoutines(context, {} as never);
    expect(result.routines.status).toBe("unavailable");
    expect(result.listVersion?.status).toBe("unavailable");
  });
});
