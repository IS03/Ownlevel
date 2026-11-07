import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "../../app/api/mobile/v1/progress/performance-insights/route";
import { parsePerformanceInsights } from "./performance-insights-contract";
import { clearInsightsSnapshots } from "./performance-insights-server";

const mocks = vi.hoisted(() => ({ auth: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("./supabase", () => ({ authenticateMobileAccessToken: mocks.auth }));

const USER = "93670000-0000-4000-8000-0000000000a1", EXERCISE = "93670000-0000-4000-8000-00000000000a", METRIC = "93670000-0000-4000-8000-0000000000aa";
const dateAt = (day: number) => new Date(Date.UTC(2026, 0, 1 + day)).toISOString().slice(0, 10);

type Call = { table: string; selected: string; filters: [string, ...unknown[]][]; range: [number, number] | null; limit: number | null; head?: boolean };
/** Answers from in-memory tables and records each query: the assertions are about what is read, and how many times. */
function fakeSupabase(tables: Record<string, Record<string, unknown>[]>, revisionOf: (call: number) => number | null = () => 1, embeddedCap = Infinity) {
  const calls: Call[] = [];
  let revisionCalls = 0;
  const from = (table: string) => {
    const call: Call = { table, selected: "", filters: [], range: null, limit: null };
    const builder: Record<string, unknown> = {
      select(columns: string, options?: { head?: boolean }) { call.selected = columns; call.head = !!options?.head; return builder; },
      eq(...args: unknown[]) { call.filters.push(["eq", ...args]); return builder; },
      is(...args: unknown[]) { call.filters.push(["is", ...args]); return builder; },
      in(...args: unknown[]) { call.filters.push(["in", ...args]); return builder; },
      gte(...args: unknown[]) { call.filters.push(["gte", ...args]); return builder; },
      lte(...args: unknown[]) { call.filters.push(["lte", ...args]); return builder; },
      not(...args: unknown[]) { call.filters.push(["not", ...args]); return builder; },
      order(...args: unknown[]) { if (args[1] && typeof args[1] === "object") call.filters.push(["order", ...args]); return builder; }, returns() { return builder; },
      range(start: number, end: number) { call.range = [start, end]; return builder; },
      maybeSingle() { return builder; },
      then(resolve: (value: unknown) => void) {
        calls.push(call);
        const rows = tables[table] ?? [];
        if (table === "insights_source_revisions") {
          try { const revision = revisionOf(++revisionCalls); resolve({ data: revision === null ? null : { revision }, error: null }); }
          catch { resolve({ data: null, error: { code: "42P01" } }); }
        } else {
          // A count without rows (head): what the loader compares the embedded lists against.
          if (call.head) { resolve({ data: null, error: null, count: rows.length }); return; }
          const page = rows.slice(call.range![0], call.range![1] + 1);
          // PostgREST embeds each exercise's sets when the select names them, as the loader's does, and cuts each embedded list at
          // max-rows (embeddedCap here).
          const own = (id: unknown) => (tables.workout_sets ?? []).filter(set => set.workout_session_exercise_id === id);
          const embedded = table === "workout_session_exercises" && call.selected.includes("sets:workout_sets(")
            ? page.map(row => ({ ...row, sets: own(row.id).slice(0, embeddedCap).map(set => Object.fromEntries(Object.entries(set).filter(([key]) => key !== "workout_session_exercise_id"))) })) : page;
          resolve({ data: embedded, error: null, count: call.range![0] === 0 ? rows.length : null });
        }
      },
    };
    return builder;
  };
  return { client: { from }, calls };
}
function tablesFor(days: number) {
  const reps = Array.from({ length: days }, (_, day) => 8 + (day % 2 ? 1 : -1) * (day % 5 + 1));
  return {
    workout_sessions: reps.map((_, day) => ({ id: `s${day}`, routine_id: "r", routine_name_snapshot: "Rutina", session_name: null, status: "completed", started_at: `${dateAt(day)}T18:00:00.000Z`, ended_at: `${dateAt(day)}T19:00:00.000Z`,
      energy_level: 3, performance_level: null, pain_level: null, day: { log_date: dateAt(day) } })),
    workout_session_exercises: reps.map((_, day) => ({ id: `e${day}`, workout_session_id: `s${day}`, exercise_id: EXERCISE, nombre_snapshot: "Press", implement_snapshot: "barra", weight_mode_snapshot: "Peso total", is_completed: true })),
    workout_sets: reps.map((value, day) => ({ id: `set${day}`, workout_session_exercise_id: `e${day}`, actual_reps: value, actual_weight_kg: "100.00", is_completed: true, completed_at: `${dateAt(day)}T18:10:00.000Z` })),
    workout_session_feelings: [],
    user_metrics: [{ id: METRIC, name: "Métrica", unit: null, value_type: "decimal", is_active: false, archived_at: "2026-02-01T00:00:00Z" }],
    daily_metric_values: reps.map((_, day) => ({ id: `v${day}`, metric_id: METRIC, metric_date: dateAt(day), value: String(day % 4) })),
    meal_entries: [{ id: "m", consumed_at: `${dateAt(0)}T16:00:00.000Z`, consumed_at_source: null, raw_input: null, entry_kind: "meal", source_type: "manual", import_run_id: null, final_calories: 500, final_protein_g: "30", final_carbs_g: null, final_fat_g: 5, day_logs: { log_date: dateAt(0) } }],
  };
}
const request = (query = "") => new NextRequest(`http://127.0.0.1/api/mobile/v1/progress/performance-insights${query}`, { headers: { authorization: "Bearer synthetic" } });

beforeEach(() => { mocks.auth.mockReset(); clearInsightsSnapshots(); });
afterEach(() => { vi.useRealTimers(); });

describe("GET performance-insights", () => {
  it("reads the whole history through grouped streams, derives identity from the token and validates its own contract", async () => {
    const { client, calls } = fakeSupabase(tablesFor(30));
    mocks.auth.mockResolvedValue({ userId: USER, supabase: client });
    const response = await GET(request());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(parsePerformanceInsights(body)).toBeTruthy();
    expect(body.history.sessions).toBe(30); expect(body.metrics[0].archived).toBe(true);
    expect(body.view).toBe("summary"); expect(body.relations.strict.candidatesEvaluated).toBe(2 + 8 + 2 + 2);
    expect(body).not.toHaveProperty("associations");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    // 6 streams of one page each, the count of sets, and the counter before and after. Nothing per session, exercise or candidate.
    expect(calls).toHaveLength(6 + 1 + 2);
    // Sets ride inside the exercises' pages, filtered by owner and ordered: no stream of their own.
    const exercises = calls.find(row => row.table === "workout_session_exercises")!;
    expect(exercises.selected).toContain("sets:workout_sets(id,actual_reps,actual_weight_kg,is_completed,completed_at)");
    expect(exercises.filters).toContainEqual(["eq", "sets.user_id", USER]);
    expect(exercises.filters).toContainEqual(["order", "id", { referencedTable: "sets" }]);
    // One count of the person's sets, without rows, tells whole lists from cut ones. The stream itself is not read.
    const count = calls.find(row => row.table === "workout_sets")!;
    expect(count.head).toBe(true); expect(count.range).toBeNull(); expect(count.filters).toContainEqual(["eq", "user_id", USER]);
    expect(calls.filter(row => row.table === "workout_sets")).toHaveLength(1);
    expect(calls.some(call => call.filters.some(filter => filter[0] === "in"))).toBe(false);
    for (const call of calls.filter(row => row.table !== "workout_session_feelings")) expect(call.filters).toContainEqual(["eq", "user_id", USER]);
    expect(calls.filter(row => row.table === "workout_session_feelings").every(row => row.filters.some(filter => filter[1] === "session.user_id" && filter[2] === USER))).toBe(true);
    expect(calls.find(row => row.table === "meal_entries" && row.range)!.filters).toContainEqual(["is", "deleted_at", null]);
    expect(calls.find(row => row.table === "workout_sessions" && row.range)!.filters).toContainEqual(["eq", "status", "completed"]);
  });
  it("keeps the unknown configuration unknown: nothing is compared and nothing reaches the associations", async () => {
    mocks.auth.mockResolvedValue({ userId: USER, supabase: fakeSupabase(tablesFor(30)).client });
    const body = await (await GET(request())).json();
    expect(body.facts.totals).toMatchObject({ comparable: 0, insufficient: 30, total: 30, coverage: 0 });
    expect(body.exclusions.performance.missing_context).toBe(30);
    expect(body.history).toMatchObject({ sessions: 30, outcomeDays: 0 });
    expect(body.limits.configurationSnapshots).toEqual({ known: 0, total: 30 });
    expect(body.relations.strict).toEqual({ candidatesEvaluated: 14, outcomeDays: 0 });
    const relations = await (await GET(request("?view=relations"))).json();
    // A method without outcome days has no list to send, and says why instead of looking empty.
    expect(relations.strict).toMatchObject({ items: [], candidatesEvaluated: 14, outcomeDays: 0 });
  });
  describe("total query cost, retries included", () => {
    // Each stream of tablesFor(5) takes one page: P = 6, plus the count of sets, and the counter before and after: 1 + 6 + 1 + 1.
    const attempt = 2 + 6 + 1;
    const midnightAfter = (client: { from: (table: string) => unknown }, after: number) => {
      let started = 0;
      return { from(table: string) {
        if (++started >= after) vi.setSystemTime(new Date("2026-06-02T12:00:00Z"));
        return client.from(table);
      } };
    };
    it.each([
      ["steady sources", () => 1, null, 200, attempt],
      ["a source changes once: one retry", (call: number) => call > 1 ? 2 : 1, null, 200, 2 * attempt],
      ["sources keep changing: refused", (call: number) => call, null, 503, 2 * attempt],
      ["Córdoba midnight during the read", () => 1, attempt - 1, 200, 2 * attempt],
      ["both retries: the worst case that still answers", (call: number) => call === 1 ? 1 : call < 6 ? 2 : 3, 2 * attempt - 1, 200, 4 * attempt],
    ] as const)("%s", async (_name, revision, midnight, status, expected) => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
      vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-06-01T12:00:00Z") });
      const fake = fakeSupabase(tablesFor(5), revision);
      mocks.auth.mockResolvedValue({ userId: USER, supabase: midnight === null ? fake.client : midnightAfter(fake.client, midnight) });
      expect((await GET(request())).status).toBe(status);
      expect(fake.calls).toHaveLength(expected);
      warn.mockRestore();
    });
  });
  it("adds pages by rows and not by exercises, sessions or candidates", async () => {
    const small = fakeSupabase(tablesFor(1500));
    mocks.auth.mockResolvedValue({ userId: USER, supabase: small.client });
    expect((await GET(request("?limit=5"))).status).toBe(200);
    // Each of the three 1500-row streams takes 2 pages (sets ride with their exercises); the other three take one.
    expect(small.calls.filter(call => call.range)).toHaveLength(3 * 2 + 3);
  }, 60_000);
  it("retries once when a source changes during the read and then refuses to publish", async () => {
    const once = fakeSupabase(tablesFor(5), call => call <= 1 ? 1 : 2);
    mocks.auth.mockResolvedValue({ userId: USER, supabase: once.client });
    expect((await GET(request())).status).toBe(200);
    expect(once.calls.filter(call => call.table === "workout_session_exercises" && call.range)).toHaveLength(2);

    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const moving = fakeSupabase(tablesFor(5), call => call);
    mocks.auth.mockResolvedValue({ userId: USER, supabase: moving.client });
    const response = await GET(request());
    expect(response.status).toBe(503); expect(await response.json()).toEqual({ error: "DATA_UNAVAILABLE" });
    expect(JSON.stringify(warn.mock.calls)).not.toContain("Press");
    warn.mockRestore();
  });
  it("fails as unavailable, not as an empty history, when a stream errors or holds an unreadable number", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const tables = tablesFor(3);
    const broken = fakeSupabase({ ...tables, workout_sets: tables.workout_sets.map(row => ({ ...row, actual_weight_kg: "not-a-number" })) });
    mocks.auth.mockResolvedValue({ userId: USER, supabase: broken.client });
    expect((await GET(request())).status).toBe(503);
    warn.mockRestore();
  });
  it("returns the pairs of one relation on request and validates its parameters", async () => {
    mocks.auth.mockResolvedValue({ userId: USER, supabase: fakeSupabase(tablesFor(25)).client });
    const id = `metric:${METRIC}:same_day`;
    const body = await (await GET(request(`?association=${encodeURIComponent(id)}`))).json();
    // Under the strict method the configuration is unknown, so it has a relation with no pairs.
    expect(body).toMatchObject({ view: "relation", lane: "strict", id, pairs: [] }); expect(body.item.state).toBe("insufficient_data");
    const partial = await (await GET(request(`?association=${encodeURIComponent(`partial:${id}`)}`))).json();
    expect(partial).toMatchObject({ view: "relation", lane: "partial" }); expect(partial.pairs.length).toBeGreaterThan(0);
    expect(await (await GET(request("?association=partial:metric:none:same_day"))).json()).toMatchObject({ item: null, pairs: null });
    for (const query of ["?limit=0", "?limit=121", "?before=2026-02-31", "?other=1", "?limit=1&limit=2", "?association=%3Cx%3E", "?view=all", "?view=complete", "?pairs=all", "?association=metric:x:same_day&pairs=some"]) {
      expect((await GET(request(query))).status, query).toBe(400);
    }
  }, 30_000);
  describe("reutilización con el contador de la base", () => {
    const pagesOf = (calls: Call[]) => calls.filter(call => call.range).length;
    const parsed = async (query: string) => {
      const response = await GET(request(query));
      expect(response.status, query).toBe(200);
      const body = await response.json();
      expect(parsePerformanceInsights(body), query).toBeTruthy();
      return body;
    };
    it("answers other views of an unchanged history with one query", async () => {
      const fake = fakeSupabase(tablesFor(40));
      mocks.auth.mockResolvedValue({ userId: USER, supabase: fake.client });
      const first = await parsed("?limit=5");
      expect(fake.calls).toHaveLength(6 + 1 + 2);
      for (const query of ["?view=days&before=" + first.facts.page.nextBefore + "&limit=5", "?view=relations", `?association=${encodeURIComponent(`partial:metric:${METRIC}:same_day`)}`, "?limit=5"]) {
        const before = fake.calls.length;
        const body = await parsed(query);
        expect(fake.calls.length - before, query).toBe(1);
        expect(body.sourceRevision).toBe(first.sourceRevision);
      }
      expect(pagesOf(fake.calls)).toBe(6);
    }, 60_000);
    it("reads everything again as soon as the counter moves, and says so", async () => {
      let revision = 1;
      const fake = fakeSupabase(tablesFor(10), () => revision);
      mocks.auth.mockResolvedValue({ userId: USER, supabase: fake.client });
      const first = await parsed("");
      revision = 2;
      const before = fake.calls.length;
      const page = await parsed("?view=days");
      expect(fake.calls.length - before).toBe(6 + 1 + 2);
      expect(page.sourceRevision).not.toBe(first.sourceRevision);
    });
    it("reads as 0 an account with no counter yet, and is unavailable if it cannot be read", async () => {
      mocks.auth.mockResolvedValue({ userId: USER, supabase: fakeSupabase(tablesFor(3), () => null).client });
      expect((await parsed("")).history.sessions).toBe(3);
      clearInsightsSnapshots();
      const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
      mocks.auth.mockResolvedValue({ userId: USER, supabase: fakeSupabase(tablesFor(3), () => { throw new Error("no table"); }).client });
      expect((await GET(request())).status).toBe(503);
      warn.mockRestore();
    });
    it("never serves one account's snapshot to another, even with the same counter", async () => {
      const mine = fakeSupabase(tablesFor(6));
      mocks.auth.mockResolvedValue({ userId: USER, supabase: mine.client });
      const first = await parsed("");
      const other = fakeSupabase(tablesFor(2));
      mocks.auth.mockResolvedValue({ userId: "93670000-0000-4000-8000-0000000000b2", supabase: other.client });
      const body = await parsed("");
      expect(body.history.sessions).toBe(2);
      expect(body.sourceRevision).not.toBe(first.sourceRevision);
      expect(pagesOf(other.calls)).toBe(6);
    });
    it("does not reuse a snapshot across the Córdoba day", async () => {
      vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-06-01T12:00:00Z") });
      const fake = fakeSupabase(tablesFor(4));
      mocks.auth.mockResolvedValue({ userId: USER, supabase: fake.client });
      await parsed("");
      vi.setSystemTime(new Date("2026-06-02T12:00:00Z"));
      const before = fake.calls.length;
      expect((await parsed("")).today).toBe("2026-06-02");
      expect(fake.calls.length - before).toBe(6 + 1 + 2);
    });
    it("still refuses when the token fails, before reusing anything", async () => {
      const { MobileApiUnauthorizedError } = await import("./auth");
      mocks.auth.mockResolvedValue({ userId: USER, supabase: fakeSupabase(tablesFor(4)).client });
      await parsed("");
      mocks.auth.mockRejectedValue(new MobileApiUnauthorizedError());
      expect((await GET(request("?view=days"))).status).toBe(401);
    });
  });
  it("requires a token", async () => {
    const { MobileApiUnauthorizedError } = await import("./auth");
    mocks.auth.mockRejectedValue(new MobileApiUnauthorizedError());
    expect((await GET(request())).status).toBe(401);
  });
});

describe("#367: the configuration recorded per session", () => {
  const withConfigurations = (pick: (day: number) => { kind: string | null; label: string | null } | null) => {
    const tables = tablesFor(30);
    tables.workout_session_exercises = tables.workout_session_exercises.map((row, day) => ({ ...row, configuration: pick(day) }));
    return tables;
  };
  const read = async (tables: ReturnType<typeof tablesFor>) => {
    clearInsightsSnapshots();
    const { client, calls } = fakeSupabase(tables);
    mocks.auth.mockResolvedValue({ userId: USER, supabase: client });
    return { body: await (await GET(request())).json(), calls };
  };
  it("reads it with the exercises, in the same page: no extra stream", async () => {
    const { calls } = await read(withConfigurations(() => null));
    expect(calls).toHaveLength(6 + 1 + 2);
    expect(calls.find(call => call.table === "workout_session_exercises")!.selected).toContain("configuration:workout_session_exercise_configurations(kind,label)");
  });
  it("compares a known configuration with itself only, ignoring case, and leaves the partial lane", async () => {
    const { body } = await read(withConfigurations(day => ({ kind: "recorded", label: day % 2 ? "Agarre neutro" : "agarre NEUTRO" })));
    expect(body.limits.configurationSnapshots).toEqual({ known: 30, total: 30 });
    expect(body.facts.totals).toMatchObject({ total: 30, comparable: 29, insufficient: 1 });
    expect(body.partial.totals).toMatchObject({ total: 0, comparable: 0 });
  });
  it("never compares two different known configurations", async () => {
    const { body } = await read(withConfigurations(day => day % 2 ? { kind: "recorded", label: "Banco plano" } : { kind: "recorded", label: "Banco 30°" }));
    expect(body.facts.totals).toMatchObject({ total: 30, comparable: 28, insufficient: 2 });
  });
  it("keeps not applicable apart from a named one, and an unknown one on the partial lane", async () => {
    const { body } = await read(withConfigurations(day => day < 10 ? null : day < 20 ? { kind: "not_applicable", label: null } : { kind: "recorded", label: "Agarre neutro" }));
    expect(body.limits.configurationSnapshots).toEqual({ known: 20, total: 30 });
    expect(body.facts.totals).toMatchObject({ total: 30, comparable: 18 });
    expect(body.partial.totals).toMatchObject({ total: 10, comparable: 9 });
  });
  it("reads a cleared configuration as unknown", async () => {
    const { body } = await read(withConfigurations(() => ({ kind: null, label: null })));
    expect(body.limits.configurationSnapshots).toEqual({ known: 0, total: 30 });
    expect(body.facts.totals).toMatchObject({ comparable: 0 });
  });
});

describe("#367 series embebidas: una lista cortada nunca se publica", () => {
  const threeSets = () => {
    const tables = tablesFor(210);
    tables.workout_sets = tables.workout_session_exercises.flatMap((exercise, day) => [0, 1, 2].map(set => ({ id: `set${String(day).padStart(3, "0")}-${set}`, workout_session_exercise_id: exercise.id,
      actual_reps: 8 + set, actual_weight_kg: "100.00", is_completed: true, completed_at: `${dateAt(day)}T18:1${set}:00.000Z` })));
    return tables;
  };
  const sourceOf = async (fake: ReturnType<typeof fakeSupabase>) => {
    const { readInsightsSource } = await import("./performance-insights-server");
    return readInsightsSource({ userId: USER, supabase: fake.client } as never);
  };
  it("reads the sets as their own paged stream when the embedded lists add up to less than the count: one stream, never a request per exercise", async () => {
    const whole = fakeSupabase(threeSets());
    const expected = await sourceOf(whole);
    expect(whole.calls.filter(call => call.table === "workout_sets" && call.range)).toHaveLength(0);
    // PostgREST cuts each embedded list at max-rows: here 2 of every exercise's 3 sets arrive.
    const cut = fakeSupabase(threeSets(), undefined, 2);
    const source = await sourceOf(cut);
    expect(source.sets).toEqual(expected.sets);
    expect(source.sets).toHaveLength(630);
    const stream = cut.calls.filter(call => call.table === "workout_sets" && call.range);
    expect(stream).toHaveLength(1);
    expect(stream[0]!.filters).toContainEqual(["eq", "user_id", USER]);
    expect(cut.calls.some(call => call.filters.some(filter => filter[0] === "in"))).toBe(false);
  });
  it("fails as unavailable, not as fewer sets, when the count cannot be read", async () => {
    const fake = fakeSupabase(threeSets());
    const failing = { from(table: string) {
      const builder = fake.client.from(table) as Record<string, unknown>;
      if (table !== "workout_sets") return builder;
      return { ...builder, select: () => ({ eq: () => ({ then: (resolve: (value: unknown) => void) => resolve({ data: null, error: { message: "timeout" }, count: null }) }) }) };
    } };
    await expect(sourceOf({ client: failing } as never)).rejects.toThrow("Leer cantidad de series de Insights");
  });
});

describe("#367 GET energía y fatiga al terminar", () => {
  it("answers from the same snapshot as the other views, in its own contract, and takes no period, page or filter", async () => {
    const fake = fakeSupabase(tablesFor(10));
    mocks.auth.mockResolvedValue({ userId: USER, supabase: fake.client });
    const summary = await (await GET(request("?method=2"))).json();
    const before = fake.calls.length;
    const response = await GET(request("?method=2&view=feelings"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(parsePerformanceInsights(body)?.view).toBe("feelings");
    expect(body.sourceRevision).toBe(summary.sourceRevision);
    // The cached snapshot answers it: only the counter is read again.
    expect(fake.calls.length - before).toBe(1);
    expect(body.outcomes.map((row: { kind: string }) => row.kind)).toEqual(["energy", "fatigue"]);
    for (const query of ["?view=feelings&before=2026-01-10", "?view=feelings&limit=5", "?view=feelings&association=x"]) expect((await GET(request(query))).status).toBe(400);
  });
});

describe("#367 GET resumen de los últimos tres meses", () => {
  it("reuses the snapshot, reads the period's weights once, by token and dates, and answers in its own contract", async () => {
    vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-02-10T15:00:00Z"));
    const tables = { ...tablesFor(40), day_logs: [{ log_date: "2026-01-05", weight_kg: "80.10" }, { log_date: "2026-01-07", weight_kg: "80.30" }, { log_date: "2026-01-09", weight_kg: "80.20" }] };
    const fake = fakeSupabase(tables);
    mocks.auth.mockResolvedValue({ userId: USER, supabase: fake.client });
    const first = await (await GET(request("?method=2"))).json();
    const before = fake.calls.length;
    const response = await GET(request("?method=2&view=period"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(parsePerformanceInsights(body)?.view).toBe("period");
    expect(body.sourceRevision).toBe(first.sourceRevision);
    expect(body.period).toEqual({ start: "2025-11-01", end: "2026-01-31", months: ["2025-11", "2025-12", "2026-01"], days: 92 });
    // Counter (snapshot reused), one page of weights, counter again. No read per week, month or card.
    const calls = fake.calls.slice(before);
    expect(calls.map(call => call.table)).toEqual(["insights_source_revisions", "day_logs", "insights_source_revisions"]);
    expect(calls[1]!.filters).toEqual(expect.arrayContaining([["eq", "user_id", USER], ["gte", "log_date", "2025-11-01"], ["lte", "log_date", "2026-01-31"]]));
    expect(body.weight.weeks.find((week: { start: string }) => week.start === "2026-01-05")).toMatchObject({ median: 80.2 });
    expect(Buffer.byteLength(JSON.stringify(body))).toBeLessThan(40_000);
  });
  it("reads again once if the counter moved, then is unavailable rather than mixing sources", async () => {
    vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-02-10T15:00:00Z"));
    let revision = 1;
    const moving = fakeSupabase({ ...tablesFor(5), day_logs: [] }, () => revision++);
    mocks.auth.mockResolvedValue({ userId: USER, supabase: moving.client });
    const failed = await GET(request("?method=2&view=period"));
    expect(failed.status).toBe(503);
    for (const query of ["?view=period&before=2026-01-01", "?view=period&limit=3", "?view=period&association=x"]) expect((await GET(request(query))).status).toBe(400);
  });
});
