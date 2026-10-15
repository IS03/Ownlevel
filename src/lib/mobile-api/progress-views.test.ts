import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/phase2/cordoba-date", () => ({ todayInCordoba: () => "2026-10-05" }));
vi.mock("./supabase", () => ({ authenticateMobileAccessToken: vi.fn(), authenticateMobileMutationAccessToken: vi.fn() }));
vi.mock("@/lib/phase2/training-robust", () => ({ loadCompletedTrainingData: vi.fn() }));
vi.mock("@/lib/phase2/training", () => ({ listRoutines: vi.fn() }));
import { authenticateMobileAccessToken, authenticateMobileMutationAccessToken } from "./supabase";
import { loadCompletedTrainingData } from "@/lib/phase2/training-robust";
import { parseProgressViewsRead } from "./progress-views-contract";

const ID = "4357c187-6641-4343-bcae-ea685e3554bc", OTHER = "cddcae61-5e78-45a8-984d-0283d3367a86";
const SETS = { measure: "training.sets", breakdown: "muscle", days: null, series: false };
const view = (id: string, position: number, definition: object, name = "Series de piernas") => ({ id, name, position, version: 1, definition });
let rpc: ReturnType<typeof vi.fn>;
const request = (path: string, init: { method?: string; body?: unknown } = {}) => new NextRequest(`https://www.ownlevel.fit/api/mobile/v1/${path}`,
  { method: init.method ?? "GET", headers: { authorization: "Bearer token", "content-type": "application/json" }, ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}) });
const routes = async () => ({ list: await import("@/app/api/mobile/v1/progress/views/route"), one: await import("@/app/api/mobile/v1/progress/views/[id]/route"),
  order: await import("@/app/api/mobile/v1/progress/views/order/route") });
const route = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.clearAllMocks();
  rpc = vi.fn();
  const context = { userId: "owner", supabase: { rpc, from: () => { throw new Error("no table read expected"); } } } as never;
  vi.mocked(authenticateMobileAccessToken).mockResolvedValue(context);
  vi.mocked(authenticateMobileMutationAccessToken).mockResolvedValue(context);
  vi.mocked(loadCompletedTrainingData).mockResolvedValue({ sessions: [], sessionExercises: [], sets: [], dateByDayLog: new Map() } as never);
});

describe("Mis vistas API (stage 2, step 3)", () => {
  it("reads every view with its result in the shared period; one invalid view never hides the others", async () => {
    rpc.mockResolvedValue({ data: { listVersion: 3, views: [view(ID, 1, SETS), view(OTHER, 2, { measure: "training.volume", breakdown: null, days: null, series: false }, "Vieja")] }, error: null });
    const res = await (await routes()).list.GET(request("progress/views?period=custom&from=2026-10-01&to=2026-10-05"));
    expect(res.status).toBe(200);
    const body = parseProgressViewsRead(await res.json())!;
    expect(body.listVersion).toBe(3);
    expect(body.views[0].result).toMatchObject({ status: "ok", data: { measure: { key: "training.sets" }, current: { value: 0 } } });
    expect(body.views[1]).toMatchObject({ name: "Vieja", result: { status: "unavailable", reason: "invalid_definition" } });
    expect(rpc).toHaveBeenCalledWith("mobile_progress_views_snapshot");
  });
  it("creates with an idempotency key, validating the definition with the Explorar rules before the database", async () => {
    const { list } = await routes();
    expect((await list.POST(request("progress/views", { method: "POST", body: { name: "X", definition: { ...SETS, breakdown: "meal_moment" }, idempotencyKey: "k1" } }))).status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
    rpc.mockResolvedValue({ data: [{ response_status: 201, response_body: { view: view(ID, 1, SETS), listVersion: 1 }, replayed: false }], error: null });
    const res = await list.POST(request("progress/views", { method: "POST", body: { name: "Series de piernas", definition: SETS, idempotencyKey: "k1" } }));
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ view: { id: ID, position: 1 }, listVersion: 1 });
    expect(rpc).toHaveBeenCalledWith("mobile_create_progress_view", { p_name: "Series de piernas", p_definition: SETS, p_idempotency_key: "k1" });
    rpc.mockResolvedValue({ data: null, error: { code: "22023", message: "Ya tenés 6 vistas. Sacá una para fijar otra." } });
    const full = await list.POST(request("progress/views", { method: "POST", body: { name: "Otra", definition: SETS, idempotencyKey: "k2" } }));
    expect(full.status).toBe(400);
    expect(await full.json()).toMatchObject({ message: "Ya tenés 6 vistas. Sacá una para fijar otra." });
  });
  it("rename and delete use the view's version: a stale version is a 409, a missing view a 404", async () => {
    const { one } = await routes();
    rpc.mockResolvedValue({ data: null, error: { code: "40001", message: "PROGRESS_VIEW_CHANGED" } });
    const stale = await one.PATCH(request(`progress/views/${ID}`, { method: "PATCH", body: { name: "Nuevo", expectedVersion: 1 } }), route(ID));
    expect(stale.status).toBe(409);
    expect(await stale.json()).toMatchObject({ error: "PROGRESS_VIEW_CHANGED" });
    rpc.mockResolvedValue({ data: { view: { ...view(ID, 1, SETS, "Nuevo"), version: 2 }, listVersion: 4 }, error: null });
    expect((await one.PATCH(request(`progress/views/${ID}`, { method: "PATCH", body: { name: "Nuevo", expectedVersion: 1 } }), route(ID))).status).toBe(200);
    expect((await one.PATCH(request(`progress/views/${ID}`, { method: "PATCH", body: { name: " Nuevo", expectedVersion: 1 } }), route(ID))).status).toBe(400);
    expect((await one.DELETE(request(`progress/views/${ID}`, { method: "DELETE" }), route(ID))).status).toBe(400); // expectedVersion is required
    rpc.mockResolvedValue({ data: null, error: { code: "P0002", message: "PROGRESS_VIEW_NOT_FOUND" } });
    expect((await one.DELETE(request(`progress/views/${ID}?expectedVersion=1`, { method: "DELETE" }), route(ID))).status).toBe(404);
    rpc.mockResolvedValue({ data: { listVersion: 5 }, error: null });
    const deleted = await one.DELETE(request(`progress/views/${ID}?expectedVersion=1`, { method: "DELETE" }), route(ID));
    expect(deleted.status).toBe(200);
    expect(rpc).toHaveBeenLastCalledWith("mobile_delete_progress_view", { p_view_id: ID, p_expected_version: 1 });
  });
  it("reorder is idempotent by key with CAS on the list version; a changed list is a 409", async () => {
    const { order } = await routes();
    rpc.mockResolvedValue({ data: null, error: { code: "40001", message: "PROGRESS_VIEW_LIST_CHANGED" } });
    const stale = await order.PUT(request("progress/views/order", { method: "PUT", body: { viewIds: [OTHER, ID], expectedListVersion: 3, idempotencyKey: "o1" } }));
    expect(stale.status).toBe(409);
    rpc.mockResolvedValue({ data: [{ response_status: 200, response_body: { viewIds: [OTHER, ID], listVersion: 4 }, replayed: false }], error: null });
    const ok = await order.PUT(request("progress/views/order", { method: "PUT", body: { viewIds: [OTHER, ID], expectedListVersion: 3, idempotencyKey: "o1" } }));
    expect(await ok.json()).toEqual({ viewIds: [OTHER, ID], listVersion: 4 });
    expect((await order.PUT(request("progress/views/order", { method: "PUT", body: { viewIds: [ID, ID], expectedListVersion: 3, idempotencyKey: "o2" } }))).status).toBe(400);
  });
});
