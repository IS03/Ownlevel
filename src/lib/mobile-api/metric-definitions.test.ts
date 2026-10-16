import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
vi.mock("server-only", () => ({}));
vi.mock("./supabase", () => ({ authenticateMobileAccessToken: vi.fn(), authenticateMobileMutationAccessToken: vi.fn() }));
import { authenticateMobileAccessToken, authenticateMobileMutationAccessToken } from "./supabase";
import { GET, POST } from "@/app/api/mobile/v1/metrics/definitions/route";
import { PUT, DELETE } from "@/app/api/mobile/v1/metrics/definitions/[id]/route";
import { PUT as orderPUT } from "@/app/api/mobile/v1/metrics/definitions/order/route";
import {
  normalizeMetricDefinitionFields, parseMetricDefinition, parseMetricDefinitionIntent, parseMetricDefinitions, parseMetricOrderIntent,
} from "./metric-definitions-contract";

const id = (n: number) => `53000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ts = "2026-10-04T12:00:00.123456+00:00";
const rpc = vi.fn();
const raw = (over: Record<string, unknown> = {}) => ({ id: id(1), systemKey: null, name: "Distancia", unit: "km", valueType: "decimal", target: 5.25,
  isActive: true, sortOrder: 4, updatedAt: ts, hasHistory: false, ...over });
const steps = raw({ id: id(2), systemKey: "steps", name: "Pasos", unit: "pasos", valueType: "integer", target: 10000, sortOrder: 0 });
const request = (url: string, method = "GET", body?: unknown, token = "Bearer token") => new NextRequest(`https://www.ownlevel.fit${url}`,
  { method, headers: { authorization: token, "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
const params = <T,>(value: T) => ({ params: Promise.resolve(value) });
const receipt = (status: number, body: unknown) => ({ data: [{ response_status: status, response_body: body, replayed: false }], error: null });
const fields = { name: "Distancia", valueType: "decimal", unit: "km", target: 5.25 };
const create = { operation: "create", metricId: null, expectedUpdatedAt: null, fields, idempotencyKey: "metric:1" };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(authenticateMobileAccessToken).mockResolvedValue({ userId: "owner", supabase: { rpc } } as never);
  vi.mocked(authenticateMobileMutationAccessToken).mockResolvedValue({ userId: "owner", supabase: { rpc } } as never);
});

describe("M5.3 Metric Definitions contract", () => {
  it('accepts exactly four legacy fields or six presentation fields; validates portion by type without choosing icons',()=>{
    expect(normalizeMetricDefinitionFields(fields)).toEqual(fields);
    for(const [valueType,quickValue,valid] of [['integer',1,true],['integer',1.1,false],['decimal',0.1234,true],['decimal',0.12345,false],['duration',30,true],['duration',1.5,false],['decimal',0,false],['decimal',-1,false]] as const){
      expect(!!normalizeMetricDefinitionFields({...fields,target:null,valueType,icon:'future-icon',quickValue})).toBe(valid);
    }
    expect(normalizeMetricDefinitionFields({...fields,icon:'book'})).toBeUndefined();
    expect(normalizeMetricDefinitionFields({...fields,icon:'Bad Icon',quickValue:null})).toBeUndefined();
    expect(normalizeMetricDefinitionFields({...fields,icon:null,quickValue:null})).toEqual({...fields,icon:null,quickValue:null});
  });
  it("derives actions from domain facts: system = target + archive/restore; custom with history = no meaning change, no delete", () => {
    const withActions = (d: Record<string, unknown>, actions: Record<string, boolean>) => ({ ...d, actions: { editTarget: true, ...actions } });
    expect(parseMetricDefinition(withActions(steps, { editName: false, editMeaning: false, archive: true, restore: false, delete: false }))).toBeDefined();
    expect(parseMetricDefinition(withActions(raw({ hasHistory: true }), { editName: true, editMeaning: false, archive: true, restore: false, delete: false }))).toBeDefined();
    expect(parseMetricDefinition(withActions(raw({ isActive: false }), { editName: true, editMeaning: true, archive: false, restore: true, delete: true }))).toBeDefined();
    // Inconsistent actions, broken system identity, invented types and internals are invalid responses.
    expect(parseMetricDefinition(withActions(steps, { editName: true, editMeaning: false, archive: true, restore: false, delete: false }))).toBeUndefined();
    expect(parseMetricDefinition(withActions({ ...steps, name: "Caminata" }, { editName: false, editMeaning: false, archive: true, restore: false, delete: false }))).toBeUndefined();
    expect(parseMetricDefinition(withActions(raw({ valueType: "boolean" }), { editName: true, editMeaning: true, archive: true, restore: false, delete: true }))).toBeUndefined();
    expect(parseMetricDefinition(withActions(raw({ userId: "x" }), { editName: true, editMeaning: true, archive: true, restore: false, delete: true }))).toBeUndefined();
    expect(parseMetricDefinition(withActions(raw({ valueType: "integer", target: 1.5 }), { editName: true, editMeaning: true, archive: true, restore: false, delete: true }))).toBeUndefined();
  });
  it("normalizes fields like the domain: trimmed name, duration unit = min, blank unit = null, target integrality", () => {
    expect(normalizeMetricDefinitionFields({ name: "  Correr ", valueType: "decimal", unit: "  ", target: 0 })).toEqual({ name: "Correr", valueType: "decimal", unit: null, target: 0 });
    expect(normalizeMetricDefinitionFields({ name: "Leer", valueType: "duration", unit: "h", target: 30 })).toEqual({ name: "Leer", valueType: "duration", unit: "min", target: 30 });
    for (const bad of [{ ...fields, name: " " }, { ...fields, name: "x".repeat(81) }, { ...fields, unit: "x".repeat(17) }, { ...fields, target: -1 },
      { ...fields, valueType: "integer", target: 2.5 }, { ...fields, target: 1.23456 }, { ...fields, extra: 1 }]) {
      expect(normalizeMetricDefinitionFields(bad)).toBeUndefined();
    }
  });
  it("intents: create without id/version, update needs CAS + fields, state changes carry no fields, order is a permutation", () => {
    expect(parseMetricDefinitionIntent(create)).toBeDefined();
    expect(parseMetricDefinitionIntent({ ...create, metricId: id(1) })).toBeUndefined();
    expect(parseMetricDefinitionIntent({ ...create, operation: "update", metricId: id(1) })).toBeUndefined();
    expect(parseMetricDefinitionIntent({ ...create, operation: "update", metricId: id(1), expectedUpdatedAt: ts })).toBeDefined();
    expect(parseMetricDefinitionIntent({ ...create, operation: "archive", metricId: id(1), expectedUpdatedAt: ts })).toBeUndefined();
    expect(parseMetricDefinitionIntent({ ...create, operation: "archive", metricId: id(1), expectedUpdatedAt: ts, fields: null })).toBeDefined();
    expect(parseMetricDefinitionIntent({ ...create, userId: "x" })).toBeUndefined();
    const order = { operation: "reorder", metricIds: [id(2), id(1)], expectedMetricIds: [id(1), id(2)], idempotencyKey: "order:1" };
    expect(parseMetricOrderIntent(order)).toBeDefined();
    expect(parseMetricOrderIntent({ ...order, metricIds: [id(1)] })).toBeUndefined();
    expect(parseMetricOrderIntent({ ...order, metricIds: [id(1), id(1)], expectedMetricIds: [id(1), id(1)] })).toBeUndefined();
    expect(parseMetricOrderIntent({ ...order, metricIds: [id(2), id(3)] })).toBeUndefined();
  });
});

describe("M5.3 Metric Definitions routes", () => {
  it('legacy GET strips presentation keys; opt-in uses its own RPC and returns the extra fields',async()=>{
    rpc.mockResolvedValue({data:{definitions:[raw({icon:'book',quickValue:0.25})]},error:null});
    const old=await (await GET(request('/api/mobile/v1/metrics/definitions'))).json();
    expect(Object.keys(old.definitions[0])).not.toContain('icon');
    expect(Object.keys(old.definitions[0])).not.toContain('quickValue');
    expect(Object.keys(old.definitions[0]).sort()).toEqual(['id','systemKey','name','unit','valueType','target','isActive','sortOrder','updatedAt','hasHistory','actions'].sort());
    const modern=await GET(request('/api/mobile/v1/metrics/definitions?presentation=1'));
    expect(modern.status).toBe(200);expect(rpc).toHaveBeenLastCalledWith('mobile_read_metric_presentations');
    expect(parseMetricDefinitions(await modern.json())?.definitions[0]).toMatchObject({icon:'book',quickValue:0.25});
  });
  it("GET initializes and reads through one RPC (POST), adds actions, keeps active before archived", async () => {
    rpc.mockResolvedValue({ data: { definitions: [steps, raw(), raw({ id: id(3), isActive: false, hasHistory: true })] }, error: null });
    const response = await GET(request("/api/mobile/v1/metrics/definitions"));
    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledExactlyOnceWith("mobile_read_metric_definitions");
    const body = await response.json();
    expect(parseMetricDefinitions(body)?.definitions.map(d => [d.name, d.actions.delete, d.actions.restore])).toEqual([
      ["Pasos", false, false], ["Distancia", true, false], ["Distancia", false, true]]);
    expect(response.headers.get("cache-control")).toContain("no-store");
    rpc.mockResolvedValue({ data: { definitions: [raw({ isActive: false }), steps] }, error: null });
    expect((await GET(request("/api/mobile/v1/metrics/definitions"))).status).toBe(503);
    expect((await GET(request("/api/mobile/v1/metrics/definitions", "GET", undefined, ""))).status).toBe(401);
  });
  it("create passes only the intent (identity comes from the token) and replays the receipt", async () => {
    rpc.mockResolvedValue(receipt(200, { status: "confirmed", operation: "create", metricId: id(1), definition: raw() }));
    const response = await POST(request("/api/mobile/v1/metrics/definitions", "POST", create));
    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledExactlyOnceWith("mobile_mutate_metric_definition", { p_intent: create });
    expect((await response.json()).definition.actions).toEqual({ editName: true, editMeaning: true, editTarget: true, archive: true, restore: false, delete: true });
    expect((await POST(request("/api/mobile/v1/metrics/definitions", "POST", { ...create, userId: "other" }))).status).toBe(400);
  });
  it("PUT/DELETE must match the route id and operation; conflicts and 404 are stable", async () => {
    const update = { ...create, operation: "update", metricId: id(1), expectedUpdatedAt: ts };
    expect((await PUT(request(`/api/mobile/v1/metrics/definitions/${id(9)}`, "PUT", update), params({ id: id(9) }))).status).toBe(400);
    expect((await PUT(request(`/api/mobile/v1/metrics/definitions/${id(1)}`, "PUT", { ...update, operation: "delete", fields: null }), params({ id: id(1) }))).status).toBe(400);
    for (const error of ["METRIC_CHANGED", "METRIC_HAS_HISTORY", "SYSTEM_METRIC_IMMUTABLE", "SYSTEM_METRIC_PROTECTED"]) {
      rpc.mockResolvedValue(receipt(409, { error, message: "m" }));
      const r = await PUT(request(`/api/mobile/v1/metrics/definitions/${id(1)}`, "PUT", update), params({ id: id(1) }));
      expect(r.status).toBe(409); expect(await r.json()).toEqual({ error, message: "m" });
    }
    rpc.mockResolvedValue(receipt(404, { error: "NOT_FOUND", message: "x" }));
    const del = { ...update, operation: "delete", fields: null };
    expect((await DELETE(request(`/api/mobile/v1/metrics/definitions/${id(1)}`, "DELETE", del), params({ id: id(1) }))).status).toBe(404);
    rpc.mockResolvedValue(receipt(409, { error: "SOMETHING_ELSE", message: "x" }));
    expect((await DELETE(request(`/api/mobile/v1/metrics/definitions/${id(1)}`, "DELETE", del), params({ id: id(1) }))).status).toBe(503);
    rpc.mockResolvedValue({ data: null, error: { code: "22023" } });
    expect((await DELETE(request(`/api/mobile/v1/metrics/definitions/${id(1)}`, "DELETE", del), params({ id: id(1) }))).status).toBe(400);
  });
  it("order: full list + CAS reaches the RPC; changed list is a stable conflict; mismatched receipt is unavailable", async () => {
    const order = { operation: "reorder", metricIds: [id(2), id(1)], expectedMetricIds: [id(1), id(2)], idempotencyKey: "order:1" };
    rpc.mockResolvedValue(receipt(200, { status: "confirmed", operation: "reorder", metricIds: order.metricIds }));
    expect((await orderPUT(request("/api/mobile/v1/metrics/definitions/order", "PUT", order))).status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("mobile_reorder_metric_definitions", { p_intent: order });
    rpc.mockResolvedValue(receipt(409, { error: "METRIC_ORDER_CHANGED", message: "m" }));
    expect((await orderPUT(request("/api/mobile/v1/metrics/definitions/order", "PUT", order))).status).toBe(409);
    rpc.mockResolvedValue(receipt(200, { status: "confirmed", operation: "reorder", metricIds: [id(1), id(2)] }));
    expect((await orderPUT(request("/api/mobile/v1/metrics/definitions/order", "PUT", order))).status).toBe(503);
  });
});
