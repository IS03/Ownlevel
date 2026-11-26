import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET as readRange } from "../../app/api/mobile/v1/nutrition/days/route";
import { GET as readDay } from "../../app/api/mobile/v1/nutrition/days/[date]/route";
import { MobileApiUnauthorizedError } from "./auth";

const mocks = vi.hoisted(() => ({ authenticate: vi.fn(), read: vi.fn() }));
vi.mock("./supabase", () => ({ authenticateMobileAccessToken: mocks.authenticate }));
vi.mock("./nutrition-day-server", () => ({ readMobileNutritionDay: mocks.read }));
vi.mock("../phase2/cordoba-date", () => ({ todayInCordoba: () => "2026-11-26" }));

const request = (path: string, authorization: string | null = "Bearer owner-a") =>
  new NextRequest(`https://example.test/api/mobile/v1/nutrition/days${path}`, { headers: authorization ? { authorization } : {} });

describe("GET /api/mobile/v1/nutrition/days", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.authenticate.mockImplementation(async token => {
      if (!["owner-a", "owner-b"].includes(token)) throw new MobileApiUnauthorizedError();
      return { userId: token, supabase: { token } };
    });
    mocks.read.mockImplementation(async (date, { userId }) => ({
      date, today: "2026-11-26",
      nutrition: date.endsWith("-21") ? { status: "unavailable" } : { status: "ok", data: { dayState: "recorded", meals: [{ id: userId }] } },
      activity: { status: "ok", data: { metrics: [] } },
    }));
  });
  it.each([null, "Basic owner-a", "Bearer revoked"])("requires a valid Bearer (%s)", async authorization => {
    const response = await readRange(request("?from=2026-11-20&to=2026-11-26", authorization));
    expect(response.status).toBe(401);
    expect(mocks.read).not.toHaveBeenCalled();
  });
  it.each([
    "?to=2026-11-26",
    "?from=11-20-2026&to=2026-11-26",
    "?from=2026-11-31&to=2026-11-26",
    "?from=2026-11-26&to=2026-11-20",
    "?from=2026-11-25&to=2026-11-27",
    "?from=2026-11-19&to=2026-11-26",
  ])("rejects invalid bounds before any reads (%s)", async suffix => {
    expect((await readRange(request(suffix))).status).toBe(400);
    expect(mocks.read).not.toHaveBeenCalled();
  });
  it("reads up to seven days serially with the same Bearer-scoped resource and contract as single-day reads", async () => {
    const responses = [];
    for (const date of ["2026-11-20", "2026-11-21", "2026-11-22", "2026-11-23", "2026-11-24", "2026-11-25", "2026-11-26"]) {
      responses.push(await (await readDay(request(`/${date}`), { params: Promise.resolve({ date }) })).json());
    }
    mocks.authenticate.mockClear();
    mocks.read.mockClear();
    const response = await readRange(request("?from=2026-11-20&to=2026-11-26&userId=owner-b"));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ from: "2026-11-20", to: "2026-11-26", days: responses });
    expect(mocks.authenticate.mock.calls).toEqual([["owner-a"]]);
    expect(mocks.read.mock.calls.map(([date, scope]) => [date, scope])).toEqual(responses.map(({ date }) => [date, { userId: "owner-a", supabase: { token: "owner-a" } }]));
    const other = await readRange(request("?from=2026-11-20&to=2026-11-20&userId=owner-a", "Bearer owner-b"));
    expect(await other.json()).toMatchObject({ days: [{ nutrition: { data: { meals: [{ id: "owner-b" }] } } }] });
  });
  it("waits for the previous day before starting the next database read", async () => {
    let release!: (result: object) => void;
    mocks.read.mockReturnValueOnce(new Promise(resolve => { release = resolve; }));
    const pending = readRange(request("?from=2026-11-25&to=2026-11-26"));
    await vi.waitFor(() => expect(mocks.read).toHaveBeenCalledTimes(1));
    release({ date: "2026-11-25", nutrition: { status: "unavailable" }, activity: { status: "unavailable" } });
    expect((await pending).status).toBe(200);
    expect(mocks.read.mock.calls.map(([date]) => date)).toEqual(["2026-11-25", "2026-11-26"]);
  });
  it("returns unavailable if a day throws, without manufacturing an empty day", async () => {
    mocks.read.mockRejectedValueOnce(new Error("database unavailable"));
    const response = await readRange(request("?from=2026-11-20&to=2026-11-20"));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "DATA_UNAVAILABLE" });
  });
});
