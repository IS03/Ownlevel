import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
vi.mock("server-only", () => ({}));
vi.mock("./supabase", () => ({ authenticateMobileAccessToken: vi.fn(), authenticateMobileMutationAccessToken: vi.fn() }));
import { authenticateMobileAccessToken, authenticateMobileMutationAccessToken } from "./supabase";
import { GET as overviewGET } from "@/app/api/mobile/v1/body/route";
import { GET as weightsGET } from "@/app/api/mobile/v1/body/weights/route";
import { PUT as weightPUT, DELETE as weightDELETE } from "@/app/api/mobile/v1/body/weights/[date]/route";
import { GET as measurementsGET, POST as measurementPOST } from "@/app/api/mobile/v1/body/measurements/route";
import { PUT as measurementPUT, DELETE as measurementDELETE } from "@/app/api/mobile/v1/body/measurements/[id]/route";
import {
  parseBodyMeasurementIntent, parseBodyOverview, parseBodyWeightIntent, parseBodyWeightReceipt,
  type BodyMeasurementFields,
} from "./body-contract";

const today = "2026-10-04", id = "51000000-0000-4000-8000-000000000001", ts = "2026-10-04T12:00:00.123456+00:00";
const rpc = vi.fn();
const measurement = { id, measuredOn: today, waistCm: 80.5, abdomenCm: null, chestCm: null, hipCm: null, armRightCm: null, armLeftCm: null,
  thighRightCm: null, thighLeftCm: null, calfRightCm: null, calfLeftCm: null, armCm: 33, thighCm: null, condition: null, notes: null,
  imported: true, importSource: "sheet", qualityStatus: "suspect", qualityNote: "Revisar", updatedAt: ts };
const fields: BodyMeasurementFields = { measuredOn: today, waistCm: 80, abdomenCm: null, chestCm: null, hipCm: null, armRightCm: null, armLeftCm: null,
  thighRightCm: null, thighLeftCm: null, calfRightCm: null, calfLeftCm: null, condition: null, notes: null };
const weights = (n: number) => Array.from({ length: n }, (_, i) => ({ date: `2026-0${9 - Math.floor(i / 28)}-${String(28 - (i % 28)).padStart(2, "0")}`, weightKg: 80 }));
const request = (url: string, method = "GET", body?: unknown, token = "Bearer token") => new NextRequest(`https://www.ownlevel.fit${url}`,
  { method, headers: { authorization: token, "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
const params = <T,>(value: T) => ({ params: Promise.resolve(value) });
const receipt = (status: number, body: unknown) => ({ data: [{ response_status: status, response_body: body, replayed: false }], error: null });
const weightIntent = { operation: "set", date: today, expectedWeightKg: null, weightKg: 80.5, idempotencyKey: "body:1" };
const weightReceipt = { status: "confirmed", operation: "set", date: today, weightKg: 80.5, current: { date: today, weightKg: 80.5 }, profileWeightKg: 80.5, currentWeightChanged: true };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(authenticateMobileAccessToken).mockResolvedValue({ userId: "owner", supabase: { rpc } } as never);
  vi.mocked(authenticateMobileMutationAccessToken).mockResolvedValue({ userId: "owner", supabase: { rpc } } as never);
});

describe("M5.1 Body contract", () => {
  it("missing stays null, zero kg is explicit and internals are rejected", () => {
    const overview = { today, current: null, profileWeightKg: null, weights: { items: [], nextBefore: null }, measurements: { items: [], nextBefore: null } };
    expect(parseBodyOverview(overview)).toEqual(overview);
    expect(parseBodyOverview({ ...overview, current: { date: today, weightKg: 0 } })?.current?.weightKg).toBe(0);
    expect(parseBodyOverview({ ...overview, measurements: { items: [{ ...measurement, source_payload: {} }], nextBefore: null } })).toBeUndefined();
    expect(parseBodyOverview({ ...overview, measurements: { items: [{ ...measurement, waistCm: 0 }], nextBefore: null } })).toBeUndefined();
    expect(parseBodyOverview({ ...overview, weights: { items: [{ date: today, weightKg: 80 }, { date: today, weightKg: 81 }], nextBefore: null } })).toBeUndefined();
  });
  it("weight intents distinguish 'expected none' from an expected value and reject malformed payloads", () => {
    expect(parseBodyWeightIntent(weightIntent)).toEqual(weightIntent);
    expect(parseBodyWeightIntent({ ...weightIntent, expectedWeightKg: 80 })?.expectedWeightKg).toBe(80);
    for (const bad of [{ ...weightIntent, weightKg: null }, { ...weightIntent, weightKg: 80.123 }, { ...weightIntent, weightKg: 1000 },
      { ...weightIntent, operation: "delete" }, { ...weightIntent, date: "2026-02-30" }, { ...weightIntent, user_id: "foreign" }]) {
      expect(parseBodyWeightIntent(bad)).toBeUndefined();
    }
    expect(parseBodyWeightIntent({ ...weightIntent, operation: "delete", weightKg: null, expectedWeightKg: 80 })).toBeDefined();
    expect(parseBodyWeightReceipt(weightReceipt)).toEqual(weightReceipt);
  });
  it("a new weight of 0 kg is rejected; a stored 0 kg can still be corrected or deleted, and still reads (#367)", () => {
    expect(parseBodyWeightIntent({ ...weightIntent, weightKg: 0 })).toBeUndefined();
    expect(parseBodyWeightIntent({ ...weightIntent, weightKg: 79.5, expectedWeightKg: 0 })?.weightKg).toBe(79.5);
    expect(parseBodyWeightIntent({ ...weightIntent, operation: "delete", weightKg: null, expectedWeightKg: 0 })).toBeDefined();
    expect(parseBodyWeightReceipt({ ...weightReceipt, operation: "delete", weightKg: null })).toBeDefined();
  });
  it("measurement intents carry CAS for update/delete and never for create", () => {
    expect(parseBodyMeasurementIntent({ operation: "create", measurementId: null, expectedUpdatedAt: null, fields, idempotencyKey: "m:1" })).toBeDefined();
    expect(parseBodyMeasurementIntent({ operation: "create", measurementId: id, expectedUpdatedAt: null, fields, idempotencyKey: "m:1" })).toBeUndefined();
    expect(parseBodyMeasurementIntent({ operation: "update", measurementId: id, expectedUpdatedAt: null, fields, idempotencyKey: "m:1" })).toBeUndefined();
    expect(parseBodyMeasurementIntent({ operation: "delete", measurementId: id, expectedUpdatedAt: ts, fields: null, idempotencyKey: "m:1" })).toBeDefined();
    expect(parseBodyMeasurementIntent({ operation: "update", measurementId: id, expectedUpdatedAt: ts, fields: { ...fields, armCm: 33 }, idempotencyKey: "m:1" })).toBeUndefined();
  });
});

describe("M5.1 Body API", () => {
  it("overview pages newest-first with limit+1 cursors and an allowlisted measurement DTO", async () => {
    rpc.mockResolvedValue({ data: { today, current: { date: "2026-09-28", weightKg: 80 }, profileWeightKg: 80, weights: weights(31), measurements: [measurement] }, error: null });
    const response = await overviewGET(request("/api/mobile/v1/body"));
    expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.json();
    expect(body.weights.items).toHaveLength(30); expect(body.weights.nextBefore).toBe(body.weights.items[29].date);
    expect(body.measurements).toEqual({ items: [measurement], nextBefore: null });
    expect(rpc).toHaveBeenCalledWith("mobile_read_body", { p_weights_before: null, p_weights_limit: 30, p_measurements_before: null, p_measurements_limit: 20 });
    // Never a GET rpc: postgrest-js would send the null cursors as the string "null".
    expect(rpc.mock.calls[0]).toHaveLength(2);
    expect(vi.mocked(authenticateMobileAccessToken)).toHaveBeenCalledWith("token");
  });
  it("section pages use the keyset cursor; invalid cursors and unreadable snapshots are not empty", async () => {
    rpc.mockResolvedValue({ data: { today, current: null, profileWeightKg: null, weights: [], measurements: [] }, error: null });
    expect(await (await weightsGET(request("/api/mobile/v1/body/weights?before=2026-09-01"))).json()).toEqual({ today, items: [], nextBefore: null });
    expect(rpc).toHaveBeenCalledWith("mobile_read_body", { p_weights_before: "2026-09-01", p_weights_limit: 30, p_measurements_before: null, p_measurements_limit: 0 });
    expect((await measurementsGET(request("/api/mobile/v1/body/measurements?before=nope"))).status).toBe(400);
    rpc.mockResolvedValue({ data: null, error: { code: "XX000" } });
    expect((await overviewGET(request("/api/mobile/v1/body"))).status).toBe(503);
    expect((await overviewGET(request("/api/mobile/v1/body", "GET", undefined, ""))).status).toBe(401);
  });
  it("weight writes require the route date/operation and map receipts and stable conflicts", async () => {
    rpc.mockResolvedValue(receipt(200, weightReceipt));
    const ok = await weightPUT(request(`/api/mobile/v1/body/weights/${today}`, "PUT", weightIntent), params({ date: today }));
    expect(ok.status).toBe(200); expect(await ok.json()).toEqual(weightReceipt);
    expect(rpc).toHaveBeenCalledWith("mobile_mutate_body_weight", { p_intent: weightIntent });
    expect((await weightPUT(request("/x", "PUT", weightIntent), params({ date: "2026-10-03" }))).status).toBe(400);
    expect((await weightDELETE(request("/x", "DELETE", weightIntent), params({ date: today }))).status).toBe(400);
    for (const error of ["WEIGHT_CHANGED", "BODY_FUTURE_DATE", "IDEMPOTENCY_KEY_REUSED"]) {
      rpc.mockResolvedValue(receipt(409, { error, message: "m" }));
      const r = await weightPUT(request("/x", "PUT", weightIntent), params({ date: today }));
      expect(r.status).toBe(409); expect(await r.json()).toEqual({ error, message: "m" });
    }
    rpc.mockResolvedValue(receipt(409, { error: "SOMETHING_ELSE", message: "m" }));
    expect((await weightPUT(request("/x", "PUT", weightIntent), params({ date: today }))).status).toBe(503);
    rpc.mockResolvedValue(receipt(200, { ...weightReceipt, date: "2026-10-03" }));
    expect((await weightPUT(request("/x", "PUT", weightIntent), params({ date: today }))).status).toBe(503);
    rpc.mockResolvedValue({ data: null, error: { code: "22023" } });
    expect((await weightPUT(request("/x", "PUT", weightIntent), params({ date: today }))).status).toBe(400);
  });
  it("measurement writes: create/update/delete receipts, 404, date collision and empty-record validation", async () => {
    const created = { status: "confirmed", operation: "create", measurementId: id, measurement };
    rpc.mockResolvedValue(receipt(200, created));
    const create = { operation: "create", measurementId: null, expectedUpdatedAt: null, fields, idempotencyKey: "m:1" };
    expect(await (await measurementPOST(request("/x", "POST", create))).json()).toEqual(created);
    const update = { operation: "update", measurementId: id, expectedUpdatedAt: ts, fields, idempotencyKey: "m:2" };
    rpc.mockResolvedValue(receipt(409, { error: "MEASUREMENT_DATE_TAKEN", message: "m" }));
    expect((await measurementPUT(request("/x", "PUT", update), params({ id }))).status).toBe(409);
    expect((await measurementPUT(request("/x", "PUT", update), params({ id: "51000000-0000-4000-8000-000000000002" }))).status).toBe(400);
    rpc.mockResolvedValue(receipt(404, { error: "NOT_FOUND", message: "m" }));
    const del = { operation: "delete", measurementId: id, expectedUpdatedAt: ts, fields: null, idempotencyKey: "m:3" };
    expect((await measurementDELETE(request("/x", "DELETE", del), params({ id }))).status).toBe(404);
    rpc.mockResolvedValue(receipt(200, { status: "confirmed", operation: "delete", measurementId: id, measurement: null }));
    expect((await measurementDELETE(request("/x", "DELETE", del), params({ id }))).status).toBe(200);
    rpc.mockResolvedValue({ data: null, error: { code: "23514" } });
    const empty = await measurementPOST(request("/x", "POST", { ...create, fields: { ...fields, waistCm: null } }));
    expect(empty.status).toBe(400); expect((await empty.json()).message).toMatch(/al menos una/);
  });
});
