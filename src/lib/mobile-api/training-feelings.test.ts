import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { MobileApiConflictError, MobileApiValidationError } from "./auth";
import { parseFeelingsInput, parseFeelingsResponse, TRAINING_FEELINGS_CONTRACT } from "./training-feelings";
import { readTrainingFeelings, writeTrainingFeelings } from "./training-feelings-server";
import type { MobileSupabaseAuthenticatedContext } from "./supabase";
import { GET, PATCH } from "../../app/api/mobile/v1/training/sessions/[sessionId]/feelings/route";
import { POST } from "../../app/api/mobile/v1/training/sessions/[sessionId]/finish-with-feelings/route";

const mocks = vi.hoisted(() => ({ readAuth: vi.fn(), writeAuth: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("./supabase", () => ({ authenticateMobileAccessToken: mocks.readAuth, authenticateMobileMutationAccessToken: mocks.writeAuth }));
const sid = "93670000-0000-4000-8000-000000000010";
const other = "93670000-0000-4000-8000-000000000011";
const time = "2026-11-02T10:00:00.123456+00:00";
const fact = { op: "set", value: 3, instrumentVersion: "energy-fatigue/1", declaredMoment: "pre", declaredAt: null, capturedAt: time, source: "mobile" } as const;
const save = { contractVersion: TRAINING_FEELINGS_CONTRACT, operation: "save", expectedRevision: 0, patch: { energyPre: fact }, idempotencyKey: "fixture:save" };
const finish = { ...save, operation: "finish", expectedSessionUpdatedAt: time, metadata: {}, idempotencyKey: "fixture:finish" };
const dto = { contractVersion: TRAINING_FEELINGS_CONTRACT, sessionId: sid, sessionStatus: "in_progress", sessionUpdatedAt: time, endedAt: null, revision: 0, values: {} };
const stored = { value: 3, instrumentVersion: "energy-fatigue/1", declaredMoment: "pre", declaredAt: null,
  capturedAt: time, source: "mobile", receivedAt: time, temporalQuality: "unverified_client_clock" };
const ledger = (body: unknown, replayed = false) => ({ data: [{ response_status: 200, response_body: body, replayed }], error: null });
const context = (rpc = vi.fn()) => ({ userId: "derived-from-bearer", supabase: { rpc } }) as unknown as MobileSupabaseAuthenticatedContext;
const request = (method: string, body?: unknown, query = "", authorization: string | null = "Bearer fixture") => new NextRequest(`https://example.test/api/mobile/v1/training/sessions/${sid}/feelings${query}`, {
  method, headers: { ...(authorization === null ? {} : { authorization }), "content-type": "application/json" },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});

describe("training-feelings/1 explicit contracts", () => {
  it("has no defaults, accepts each independent field and preserves raw timestamp precision", () => {
    expect(parseFeelingsInput({ ...save, patch: {} }, "save").patch).toEqual({});
    for (const key of ["energyPre", "fatiguePre", "energyPost", "fatiguePost"]) {
      const value = { ...fact, declaredMoment: key.endsWith("Pre") ? "pre" : "post" };
      const parsed = parseFeelingsInput({ ...save, patch: { [key]: value } }, "save");
      expect(parsed.patch).toEqual({ [key]: value });
      expect(Object.keys(parsed.patch)).toHaveLength(1);
    }
    expect(parseFeelingsInput(save, "save").patch.energyPre).toMatchObject({ capturedAt: time, declaredAt: null });
  });

  it("requires explicit clear and rejects implicit null/undefined/default values", () => {
    expect(parseFeelingsInput({ ...save, patch: { energyPre: { op: "clear" } } }, "save").patch).toEqual({ energyPre: { op: "clear" } });
    for (const energyPre of [null, undefined, {}, { value: 3 }, { op: "clear", value: 3 }, { ...fact, value: null }])
      expect(() => parseFeelingsInput({ ...save, patch: { energyPre } }, "save")).toThrow(MobileApiValidationError);
  });

  it.each([0, 6, -1, 1.5, "3", NaN, Infinity])("rejects invalid ordinal %s", value => {
    expect(() => parseFeelingsInput({ ...save, patch: { energyPre: { ...fact, value } } }, "save")).toThrow();
  });

  it.each([
    { instrumentVersion: "legacy" }, { declaredMoment: "post" }, { source: "server" },
    { receivedAt: time }, { temporalQuality: "verified" }, { capturedAt: "2026-02-30T10:00:00Z" },
    { capturedAt: "2026-11-02T24:00:00Z" }, { capturedAt: "2026-11-02T10:00:00" },
    { capturedAt: "2026-11-02T10:00:00.1234567Z" }, { declaredAt: "yesterday" },
  ])("rejects invalid provenance or fabricated quality %j", change => {
    expect(() => parseFeelingsInput({ ...save, patch: { energyPre: { ...fact, ...change } } }, "save")).toThrow();
  });

  it("rejects arbitrary identity/unknown keys, missing versions, and invalid CAS", () => {
    for (const change of [{ userId: other }, { contractVersion: "old" }, { expectedRevision: -1 }, { expectedRevision: 0.5 },
      { expectedRevision: Number.MAX_SAFE_INTEGER }, { operation: "finish" }, { patch: { energy: fact } }, { idempotencyKey: "bad key" }])
      expect(() => parseFeelingsInput({ ...save, ...change }, "save")).toThrow();
    const unversioned: Record<string, unknown> = { ...save }; delete unversioned.contractVersion;
    expect(() => parseFeelingsInput(unversioned, "save")).toThrow();
  });

  it("keeps legacy metadata a separate PATCH in the new atomic finish", () => {
    expect(parseFeelingsInput(finish, "finish").metadata).toEqual({});
    const metadata = { energyLevel: null, performanceLevel: 3, painLevel: 0, notes: "" };
    expect(parseFeelingsInput({ ...finish, metadata }, "finish").metadata).toEqual(metadata);
    for (const metadata of [{ energyPost: 4 }, { energyLevel: 0 }, { painLevel: 11 }, { notes: 3 }, { notes: "x".repeat(10001) }])
      expect(() => parseFeelingsInput({ ...finish, metadata }, "finish")).toThrow();
    expect(() => parseFeelingsInput({ ...finish, expectedSessionUpdatedAt: null }, "finish")).toThrow();
  });

  it("validates new read receipts, never treating unknown chronology as verified", () => {
    expect(parseFeelingsResponse({ ...dto, revision: 1, values: { energyPre: stored } }).values.energyPre).toEqual(stored);
    expect(parseFeelingsResponse({ ...dto, values: { fatiguePre: { ...stored, capturedAt: null, temporalQuality: "unknown" } } }).values.fatiguePre?.capturedAt).toBeNull();
    for (const change of [{ extra: true }, { contractVersion: "old" }, { values: { energyPre: { ...stored, temporalQuality: "verified" } } },
      { values: { energyPre: { ...stored, capturedAt: null } } }, { revision: -1 }, { revision: null }, { sessionStatus: "completed" }])
      expect(() => parseFeelingsResponse({ ...dto, ...change })).toThrow();
  });
});

describe("new feelings repository boundary", () => {
  it("sends only the explicit versioned request to one atomic RPC with no userId", async () => {
    const rpc = vi.fn().mockResolvedValue(ledger(dto));
    expect(await writeTrainingFeelings(sid.toUpperCase(), save, "save", context(rpc))).toEqual(dto);
    expect(rpc).toHaveBeenCalledExactlyOnceWith("mutate_training_feelings_v1", { p_session_id: sid, p_input: save });
  });
  it.each([false, true])("returns the immutable receipt when replayed=%s", async replayed => {
    const completed = { ...dto, sessionStatus: "completed", endedAt: time };
    const rpc = vi.fn().mockResolvedValue(ledger(completed, replayed));
    expect(await writeTrainingFeelings(sid, finish, "finish", context(rpc))).toEqual(completed);
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it.each(["FEELINGS_CHANGED", "SESSION_CHANGED", "IDEMPOTENCY_KEY_REUSED", "SESSION_CLOSED", "SESSION_DISCARDED", "NO_COMPLETED_SETS"])("surfaces %s without retrying the write", async message => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: "PT409", message } });
    await expect(writeTrainingFeelings(sid, save, "save", context(rpc))).rejects.toBeInstanceOf(MobileApiConflictError);
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it("rejects malformed/mismatched receipts and a false successful finish", async () => {
    for (const body of [{ ...dto, sessionId: other }, {}, { ...dto, values: null }]) {
      const rpc = vi.fn().mockResolvedValue(ledger(body));
      await expect(writeTrainingFeelings(sid, save, "save", context(rpc))).rejects.toThrow("Invalid training feelings database response");
    }
    await expect(writeTrainingFeelings(sid, finish, "finish", context(vi.fn().mockResolvedValue(ledger(dto))))).rejects.toThrow("Invalid training feelings finish receipt");
    await expect(writeTrainingFeelings(sid, save, "save", context(vi.fn().mockResolvedValue({ data: [], error: null })))).rejects.toThrow();
  });
  it("does not turn unavailable data into an empty read", async () => {
    await expect(readTrainingFeelings(sid, context(vi.fn().mockResolvedValue({ data: null, error: { code: "PGRST202" } })))).rejects.toThrow("Training feelings unavailable");
    await expect(readTrainingFeelings(sid, context(vi.fn().mockResolvedValue({ data: null, error: null })))).rejects.toThrow("Invalid training feelings database response");
  });
});

describe("authenticated, separate HTTP contracts", () => {
  beforeEach(() => { vi.clearAllMocks(); });
  it("authenticates GET and preserves strict no-store headers", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: dto, error: null }); mocks.readAuth.mockResolvedValue(context(rpc));
    const result = await GET(request("GET"), { params: Promise.resolve({ sessionId: sid }) });
    expect(result.status).toBe(200); expect(await result.json()).toEqual(dto);
    expect(mocks.readAuth).toHaveBeenCalledWith("fixture"); expect(mocks.writeAuth).not.toHaveBeenCalled();
    expect(result.headers.get("cache-control")).toContain("no-store");
  });
  it("uses mutation authentication for PATCH and finish-with-feelings", async () => {
    const rpc = vi.fn().mockResolvedValue(ledger(dto)); mocks.writeAuth.mockResolvedValue(context(rpc));
    expect((await PATCH(request("PATCH", save), { params: Promise.resolve({ sessionId: sid }) })).status).toBe(200);
    rpc.mockResolvedValue(ledger({ ...dto, sessionStatus: "completed", endedAt: time }));
    expect((await POST(request("POST", finish), { params: Promise.resolve({ sessionId: sid }) })).status).toBe(200);
    expect(mocks.writeAuth).toHaveBeenCalledTimes(2);
  });
  it("rejects absent bearer, arbitrary query identity and failed reads without leaking payloads", async () => {
    expect((await GET(request("GET", undefined, "", null), { params: Promise.resolve({ sessionId: sid }) })).status).toBe(401);
    const rpc = vi.fn(); mocks.readAuth.mockResolvedValue(context(rpc)); mocks.writeAuth.mockResolvedValue(context(rpc));
    const queried = await PATCH(request("PATCH", save, `?userId=${other}`), { params: Promise.resolve({ sessionId: sid }) });
    expect(queried.status).toBe(400); expect(rpc).not.toHaveBeenCalled();
    rpc.mockResolvedValue({ data: null, error: { message: "private SQL and payload" } });
    const failed = await GET(request("GET"), { params: Promise.resolve({ sessionId: sid }) });
    expect(failed.status).toBe(503); expect(await failed.json()).toEqual({ error: "DATA_UNAVAILABLE" });
  });
});
