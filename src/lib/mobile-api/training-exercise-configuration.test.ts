import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { configurationIdentity, parseConfigurationInput, parseConfigurationsResponse, type ConfigurationInput, type ConfigurationsResponse } from "./training-exercise-configuration-contract";
import { ExerciseConfigurationJournal, type ConfigurationResult } from "./training-exercise-configuration-journal";

const SESSION = "93671000-0000-4000-8000-000000000021", EXERCISE = "93671000-0000-4000-8000-000000000010";
const PRESS = "93671000-0000-4000-8000-000000000031", EARLIER = "93671000-0000-4000-8000-000000000030";
const recorded = (label: string) => ({ kind: "recorded" as const, label, source: "entered" as const, repeatedFrom: null });
const response = (revision: number, value: ConfigurationsResponse["items"][number]["value"] = null): ConfigurationsResponse => ({
  contractVersion: "training-exercise-configuration/1", sessionId: SESSION, sessionStatus: "in_progress",
  items: [{ sessionExerciseId: PRESS, exerciseId: EXERCISE, revision, value,
    previous: { sessionExerciseId: EARLIER, sessionId: "93671000-0000-4000-8000-000000000020", endedAt: "2026-11-01T11:00:00.000000+00:00", value: { kind: "recorded", label: "Agarre neutro" } } }],
});
const input = (value: ConfigurationInput["value"], extra: Record<string, unknown> = {}) => ({ contractVersion: "training-exercise-configuration/1", sessionExerciseId: PRESS, expectedRevision: 0, value, idempotencyKey: "k-1", ...extra });

describe("training-exercise-configuration/1", () => {
  it("accepts recorded, not applicable, repeated and an explicit clear, with the label as the database keeps it", () => {
    expect(parseConfigurationInput(input(recorded("  Agarre \n neutro "))).value).toEqual(recorded("Agarre neutro"));
    expect(parseConfigurationInput(input({ kind: "not_applicable", label: null, source: "entered", repeatedFrom: null })).value?.kind).toBe("not_applicable");
    expect(parseConfigurationInput(input({ ...recorded("x"), source: "repeated_previous", repeatedFrom: EARLIER })).value?.repeatedFrom).toBe(EARLIER);
    expect(parseConfigurationInput(input(null)).value).toBeNull();
  });
  it("rejects what would invent or hide a value", () => {
    for (const value of [undefined, {}, { kind: "recorded", label: "x", source: "entered" }, recorded(""), recorded("   "), recorded("x".repeat(81)), recorded("a\u0001b"),
      { kind: "none", label: null, source: "entered", repeatedFrom: null }, { kind: "not_applicable", label: "x", source: "entered", repeatedFrom: null },
      { ...recorded("x"), source: "catalog" }, { ...recorded("x"), repeatedFrom: EARLIER }, { ...recorded("x"), source: "repeated_previous" }])
      expect(() => parseConfigurationInput(input(value as never))).toThrow();
    for (const extra of [{ userId: SESSION }, { expectedRevision: -1 }, { expectedRevision: 1.5 }, { contractVersion: "old" }, { idempotencyKey: "a b" }])
      expect(() => parseConfigurationInput(input(null, extra))).toThrow();
    expect(() => parseConfigurationInput({ contractVersion: "training-exercise-configuration/1", sessionExerciseId: PRESS, expectedRevision: 0, idempotencyKey: "k" })).toThrow();
  });
  it("parses a read, and refuses a duplicated row or an unknown status", () => {
    expect(parseConfigurationsResponse(response(1, recorded("Agarre neutro"))).items[0]!.previous!.value.label).toBe("Agarre neutro");
    const body = response(0);
    expect(() => parseConfigurationsResponse({ ...body, items: [...body.items, ...body.items] })).toThrow();
    expect(() => parseConfigurationsResponse({ ...body, sessionStatus: "active" })).toThrow();
  });
  it("gives the comparator one identity per value: unknown is null, case is ignored, not applicable stands apart", () => {
    expect(configurationIdentity(null)).toBeNull();
    expect(configurationIdentity({ kind: null, label: null })).toBeNull();
    expect(configurationIdentity({ kind: "recorded", label: "Agarre Neutro" })).toBe(configurationIdentity({ kind: "recorded", label: "agarre neutro" }));
    expect(configurationIdentity({ kind: "recorded", label: "Agarre neutro" })).not.toBe(configurationIdentity({ kind: "recorded", label: "Agarre prono" }));
    expect(configurationIdentity({ kind: "not_applicable", label: null })).toBe("not_applicable");
    expect(configurationIdentity({ kind: "recorded", label: "not_applicable" })).not.toBe("not_applicable");
  });
});

function memoryStorage() {
  const items = new Map<string, string>();
  return { items, getItem: async (key: string) => items.get(key) ?? null, setItem: async (key: string, value: string) => { items.set(key, value); } };
}
const ok = (data: ConfigurationsResponse): ConfigurationResult => ({ status: "ok", data });

describe("ExerciseConfigurationJournal", () => {
  it("writes one answer against the read revision, and replays the same request after a lost response", async () => {
    let server = response(0);
    const writes: ConfigurationInput[] = [];
    const port = { read: vi.fn(async () => ok(server)), write: vi.fn(async (body: ConfigurationInput) => { writes.push(body); return { status: "unavailable" } as ConfigurationResult; }) };
    const storage = memoryStorage();
    const journal = new ExerciseConfigurationJournal(storage, port, "user", SESSION, () => `key-${writes.length}`);
    await journal.refresh();
    expect(await journal.choose(PRESS, recorded("Agarre neutro"))).toBe(false);
    expect(journal.view(PRESS)).toMatchObject({ value: recorded("Agarre neutro"), state: "unconfirmed" });
    // Nothing new is derived from an uncertain result.
    expect(await journal.choose(PRESS, recorded("Agarre prono"))).toBe(false);
    // The app closes; a new journal on the same storage replays the frozen request.
    server = response(1, recorded("Agarre neutro"));
    port.write.mockImplementation(async (body: ConfigurationInput) => { writes.push(body); return ok(server); });
    const reopened = new ExerciseConfigurationJournal(storage, port, "user", SESSION, () => "never");
    await reopened.refresh();
    expect(writes.map(body => body.idempotencyKey)).toEqual(["key-0", "key-0"]);
    expect(writes[1]).toEqual(writes[0]);
    expect(writes[0]!.expectedRevision).toBe(0);
    expect(reopened.view(PRESS)).toMatchObject({ value: recorded("Agarre neutro"), state: "saved" });
    expect(reopened.getSnapshot().pending).toBeNull();
  });
  it("shows the saved value on a conflict and never sends a new write by itself", async () => {
    const port = { read: vi.fn(async () => ok(response(3, recorded("Banco plano")))), write: vi.fn(async (): Promise<ConfigurationResult> => ({ status: "conflict", message: "x" })) };
    const journal = new ExerciseConfigurationJournal(memoryStorage(), port, "user", SESSION, () => "k");
    port.read.mockResolvedValueOnce(ok(response(2)));
    await journal.refresh();
    expect(await journal.choose(PRESS, recorded("Banco 30°"))).toBe(false);
    expect(port.write).toHaveBeenCalledTimes(1);
    expect(journal.view(PRESS)).toMatchObject({ value: recorded("Banco plano"), state: "saved" });
    expect(journal.getSnapshot().error).toMatch(/cambió en otro lugar/);
  });
  it("does nothing for the same answer, and retires an intent the server could not have written", async () => {
    const port = { read: vi.fn(async () => ok(response(1, recorded("Agarre neutro")))), write: vi.fn(async (): Promise<ConfigurationResult> => ({ status: "validation" })) };
    const journal = new ExerciseConfigurationJournal(memoryStorage(), port, "user", SESSION, () => "k");
    await journal.refresh();
    expect(await journal.choose(PRESS, recorded("Agarre neutro"))).toBe(true);
    expect(port.write).not.toHaveBeenCalled();
    expect(await journal.choose(PRESS, null)).toBe(false);
    expect(journal.getSnapshot().pending).toBeNull();
    expect(journal.view(PRESS).value).toEqual(recorded("Agarre neutro"));
  });
  it("keeps training independent: a failed read leaves no item and no write", async () => {
    const port = { read: vi.fn(async (): Promise<ConfigurationResult> => ({ status: "unavailable" })), write: vi.fn() };
    const journal = new ExerciseConfigurationJournal(memoryStorage(), port, "user", SESSION, () => "k");
    await journal.refresh();
    expect(journal.view(PRESS).item).toBeNull();
    expect(await journal.choose(PRESS, recorded("x"))).toBe(false);
    expect(port.write).not.toHaveBeenCalled();
  });
});

const routeMocks = vi.hoisted(() => ({ readAuth: vi.fn(), writeAuth: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("./supabase", () => ({ authenticateMobileAccessToken: routeMocks.readAuth, authenticateMobileMutationAccessToken: routeMocks.writeAuth }));

describe("PATCH/GET exercise-configurations", () => {
  const path = `https://example.test/api/mobile/v1/training/sessions/${SESSION}/exercise-configurations`;
  const call = (method: "GET" | "PATCH", body?: unknown, query = "") => new NextRequest(`${path}${query}`, {
    method, headers: { authorization: "Bearer fixture", "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const params = { params: Promise.resolve({ sessionId: SESSION }) };
  it("takes identity from the token only, and returns the database receipt as it is", async () => {
    const rpc = vi.fn(async () => ({ data: [{ response_status: 200, response_body: response(1, recorded("Agarre neutro")), replayed: false }], error: null }));
    routeMocks.writeAuth.mockResolvedValue({ userId: "derived-from-bearer", supabase: { rpc } });
    const { PATCH } = await import("../../app/api/mobile/v1/training/sessions/[sessionId]/exercise-configurations/route");
    const result = await PATCH(call("PATCH", input(recorded("Agarre neutro"))), params);
    expect(result.status).toBe(200);
    expect((await result.json()).items[0].value).toEqual(recorded("Agarre neutro"));
    expect(rpc).toHaveBeenCalledWith("mutate_training_exercise_configuration_v1", { p_session_id: SESSION, p_input: input(recorded("Agarre neutro")) });
    expect(JSON.stringify(rpc.mock.calls)).not.toContain("derived-from-bearer");
  });
  it("rejects a body the contract does not accept before calling the database, and maps a conflict to 409", async () => {
    const rpc = vi.fn(async () => ({ data: null, error: { code: "PT409", message: "CONFIGURATION_CHANGED" } }));
    routeMocks.writeAuth.mockResolvedValue({ userId: "u", supabase: { rpc } });
    const { PATCH } = await import("../../app/api/mobile/v1/training/sessions/[sessionId]/exercise-configurations/route");
    expect((await PATCH(call("PATCH", input(recorded("x"), { userId: SESSION })), params)).status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
    expect((await PATCH(call("PATCH", input(recorded("x"))), params)).status).toBe(409);
  });
  it("reads through the RPC and refuses query parameters", async () => {
    const rpc = vi.fn(async () => ({ data: response(0), error: null }));
    routeMocks.readAuth.mockResolvedValue({ userId: "u", supabase: { rpc } });
    const { GET } = await import("../../app/api/mobile/v1/training/sessions/[sessionId]/exercise-configurations/route");
    expect((await GET(call("GET"), params)).status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("read_training_exercise_configurations_v1", { p_session_id: SESSION });
    expect((await GET(call("GET", undefined, "?userId=x"), params)).status).toBe(400);
  });
});
