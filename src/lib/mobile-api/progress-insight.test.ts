import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/phase2/cordoba-date", () => ({ todayInCordoba: () => "2026-10-15" }));
vi.mock("./supabase", () => ({ authenticateMobileAccessToken: vi.fn(), authenticateMobileMutationAccessToken: vi.fn() }));
vi.mock("./progress-influence", () => ({ buildMobileProgressInfluenceSuggested: vi.fn() }));
import { authenticateMobileAccessToken, authenticateMobileMutationAccessToken } from "./supabase";
import { buildMobileProgressInfluenceSuggested } from "./progress-influence";
import { addProgressIsoDays } from "@/lib/progress/analytics";
import { resolveMobileProgressPeriod } from "./progress-server";
import { parseProgressInsight } from "./progress-insight-contract";

const TODAY = "2026-10-15";
const { period } = resolveMobileProgressPeriod({ period: "3m" }, TODAY);
const days = (from: number, n: number) => Array.from({ length: n }, (_, i) => addProgressIsoDays(period.start, from + i));
const measure = { split: { key: "day.training", label: "Día de entrenamiento", unit: null, valueType: "boolean" as const }, outcome: { key: "nutrition.kcal", label: "Calorías", unit: "kcal", valueType: "integer" as const } };
function question(key: string, evidence: "low" | "moderate" | "clear", percent: number, n = 20) {
  return { key, definition: { split: "day.training", cut: "yes", lag: 0 as const, outcome: "nutrition.kcal" }, measure, reference: null,
    current: { status: "ok" as const, pairs: 2 * n, cut: null, low: { days: days(0, n), average: 2000 }, high: { days: days(n, n), average: 2000 * (1 + percent / 100) },
      difference: 20 * percent, differencePercent: percent, evidence } };
}
let dismissed: { insight_key: string; dismissed_at: string }[] = [];
const rpc = vi.fn();
const request = (path: string, init: { method?: string; body?: unknown } = {}) => new NextRequest(`https://www.ownlevel.fit/api/mobile/v1/${path}`,
  { method: init.method ?? "GET", headers: { authorization: "Bearer token", "content-type": "application/json" }, ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}) });
const read = async () => (await import("@/app/api/mobile/v1/progress/insight/route")).GET(request("progress/insight"));

beforeEach(() => {
  vi.clearAllMocks(); dismissed = [];
  const supabase = { rpc, from: () => ({ select: () => ({ eq: async () => ({ data: dismissed, error: null }) }) }) };
  vi.mocked(authenticateMobileAccessToken).mockResolvedValue({ userId: "owner", supabase } as never);
  vi.mocked(authenticateMobileMutationAccessToken).mockResolvedValue({ userId: "owner", supabase } as never);
  vi.mocked(buildMobileProgressInfluenceSuggested).mockResolvedValue({ today: TODAY, period, questions: [
    question("training_kcal", "clear", 12), question("training_water", "clear", 40), question("carbs_sets", "moderate", 90), question("steps_sleep", "clear", 60, 12),
  ] } as never);
});

describe("Automatic insight (stage 4)", () => {
  it("only clear evidence with ≥ 30 days; the largest relative difference wins; over the last 3 months", async () => {
    const res = await read(); expect(res.status).toBe(200);
    const body = parseProgressInsight(await res.json())!;
    expect(body.insight?.key).toBe("training_water"); // carbs_sets is moderate; steps_sleep has 24 days
    expect(vi.mocked(buildMobileProgressInfluenceSuggested).mock.calls[0][1]).toMatchObject({ preset: "3m", end: TODAY });
    expect(vi.mocked(buildMobileProgressInfluenceSuggested).mock.calls[0][2]).toBe(false);
  });
  it("a dismissed key never comes back; any dismissal in the last 7 days pauses insights", async () => {
    dismissed = [{ insight_key: "training_water", dismissed_at: "2026-09-01T12:00:00Z" }];
    expect(parseProgressInsight(await (await read()).json())!.insight?.key).toBe("training_kcal");
    dismissed = [{ insight_key: "training_water", dismissed_at: "2026-10-12T12:00:00Z" }];
    expect(parseProgressInsight(await (await read()).json())!.insight).toBeNull();
    expect(buildMobileProgressInfluenceSuggested).toHaveBeenCalledTimes(1); // the pause skips the heavy read
  });
  it("nothing clear is null, never a weak claim; parameters are rejected", async () => {
    vi.mocked(buildMobileProgressInfluenceSuggested).mockResolvedValue({ today: TODAY, period, questions: [question("carbs_sets", "moderate", 90)] } as never);
    expect(parseProgressInsight(await (await read()).json())).toEqual({ today: TODAY, insight: null });
    expect((await (await import("@/app/api/mobile/v1/progress/insight/route")).GET(request("progress/insight?period=7"))).status).toBe(400);
    expect(parseProgressInsight({ today: TODAY, insight: { key: "carbs_sets", data: { today: TODAY, period, ...question("carbs_sets", "moderate", 90), key: undefined } } })).toBeUndefined();
  });
  it("dismiss is idempotent through the RPC and validates the key", async () => {
    const { POST } = await import("@/app/api/mobile/v1/progress/insight/dismiss/route");
    expect((await POST(request("progress/insight/dismiss", { method: "POST", body: { key: "otra" } }))).status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
    rpc.mockResolvedValue({ data: { key: "training_water", dismissedAt: "2026-10-15T20:00:00Z" }, error: null });
    const res = await POST(request("progress/insight/dismiss", { method: "POST", body: { key: "training_water" } }));
    expect(res.status).toBe(200); expect(await res.json()).toEqual({ key: "training_water" });
    expect(rpc).toHaveBeenCalledWith("mobile_dismiss_progress_insight", { p_key: "training_water" });
  });
});
