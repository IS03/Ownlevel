import { describe, expect, it } from "vitest";
import { buildExposureContext } from "./exposures";
import { describePriorFeelings, priorFeelingFact } from "./prior-feelings";
import { parseSessionFeelings } from "./source-adapter";
import type { InsightsSource } from "./types";
import { isSessionFeelingWire } from "../../mobile-api/performance-insights-contract";

/** #492: the timing of a PRE answer comes from the server receipt when it proves an early record, never from a late receipt alone. */
const T = (hhmm: string) => `2026-11-10T${hhmm}:00.000Z`;
const START = T("21:00"), FIRST_SET = Date.parse(T("21:10")), END = T("22:00");
const session = { startedAt: START, endedAt: END, date: "2026-11-10" }; // 18:00–19:00 in Córdoba, the same logical day
const pre = (capturedAt: string | null, receivedAt?: unknown, value = 4) => ({ energyPre: { value, declaredMoment: "pre", instrumentVersion: "energy-fatigue/1", capturedAt, ...(receivedAt === undefined ? {} : { receivedAt }) } });
const read = (facts: unknown, s: { startedAt: string | null; endedAt: string | null; date?: string | null } = session, firstSet: number | null = FIRST_SET) => parseSessionFeelings(facts, s, firstSet);
const energy = (facts: unknown, s?: Parameters<typeof read>[1], firstSet?: number | null) => read(facts, s, firstSet).values.energyPre!;

describe("#492 pre answer timing with the server receipt", () => {
  it("a receipt before the start proves an early record even when the device clock is AHEAD", () => {
    expect(energy(pre(T("22:30"), T("20:55")))).toEqual({ value: 4, timing: "before_start", basis: "server_receipt", temporalQuality: "unverified_client_clock" });
  });
  it("a receipt between the start and the first completed set proves a record before the first set", () => {
    expect(energy(pre(T("21:20"), T("21:05")))).toMatchObject({ timing: "before_first_set", basis: "server_receipt" });
  });
  it("a receipt before the start with no device time keeps the proof and an unknown device clock", () => {
    expect(energy(pre(null, T("20:00")))).toEqual({ value: 4, timing: "before_start", basis: "server_receipt", temporalQuality: "unknown" });
  });
  it("a device clock BEHIND (early capture, late receipt) is not read as before the start", () => {
    expect(energy(pre(T("20:30"), T("21:40")))).toMatchObject({ timing: "unknown", basis: "receipt_conflict" });
  });
  it("offline capture received after the end is unknown, never late", () => {
    const fact = energy(pre(T("20:50"), T("23:30")));
    expect(fact).toMatchObject({ timing: "unknown", basis: "receipt_conflict" });
    expect(fact.timing).not.toMatch(/after/);
  });
  it("a late receipt with no device time says nothing about the capture", () => {
    expect(energy(pre(null, T("21:40")))).toMatchObject({ timing: "unknown", basis: "client_clock", temporalQuality: "unknown" });
  });
  it("device and receipt both after the reference are reported late, and still unverified", () => {
    expect(energy(pre(T("21:30"), T("21:31")))).toMatchObject({ timing: "after_first_set", basis: "client_and_receipt_late", temporalQuality: "unverified_client_clock" });
    expect(energy(pre(T("22:20"), T("22:21")))).toMatchObject({ timing: "after_end", basis: "client_and_receipt_late" });
  });
  it("a device time between the start and the first set with a receipt after the first set is a conflict, not late", () => {
    expect(energy(pre(T("21:05"), T("21:30")))).toMatchObject({ timing: "unknown", basis: "receipt_conflict" });
  });
  it("an edited answer carries the new receipt: a value changed after the session cannot be read as captured earlier", () => {
    const original = energy(pre(T("20:50"), T("20:51"), 2));
    const edited = energy(pre(T("22:30"), T("22:31"), 5));
    expect(original).toMatchObject({ value: 2, timing: "before_start" });
    expect(edited).toMatchObject({ value: 5, timing: "after_end", basis: "client_and_receipt_late" });
  });
  it("without a first completed set, an answer received after the start is unknown, not late", () => {
    expect(energy(pre(T("21:30"), T("21:31")), session, null)).toMatchObject({ timing: "unknown", basis: "client_clock" });
  });
  it("without a start time only the first set can prove an early receipt", () => {
    expect(energy(pre(T("20:00"), T("21:05")), { startedAt: null, endedAt: END, date: "2026-11-10" })).toMatchObject({ timing: "before_first_set", basis: "server_receipt" });
    expect(energy(pre(T("20:00"), T("21:30")), { startedAt: null, endedAt: END, date: "2026-11-10" })).toMatchObject({ timing: "unknown", basis: "receipt_conflict" });
  });
});

describe("#492 absent receipt is not an unreadable receipt", () => {
  it("a legacy fact without receivedAt keeps the device reading exactly as before", () => {
    expect(energy(pre(T("20:30")))).toEqual({ value: 4, timing: "before_start", basis: "client_clock", temporalQuality: "unverified_client_clock" });
    expect(energy(pre(T("21:30")))).toMatchObject({ timing: "after_first_set", basis: "client_clock" });
    expect(energy(pre(T("22:30")))).toMatchObject({ timing: "after_end", basis: "client_clock" });
    expect(energy(pre(null))).toMatchObject({ timing: "unknown", basis: "client_clock", temporalQuality: "unknown" });
  });
  it.each([["null", null], ["a number", 1731272400000], ["text that is not a time", "ayer"], ["a time without an offset", "2026-11-10T20:00:00"], ["an empty string", ""]])(
    "a receipt that is %s leaves the timing unknown but keeps the answer, and is not counted as unreadable or invalid", (_name, receivedAt) => {
      const parsed = read(pre(T("20:30"), receivedAt));
      expect(parsed.values.energyPre).toEqual({ value: 4, timing: "unknown", basis: "receipt_unreadable", temporalQuality: "unverified_client_clock" });
      expect(parsed.invalid).toBe(0);
      expect(parsed.unreadable).toEqual([]);
    });
  it("a malformed value is still excluded and counted, and the receipt cannot rescue it", () => {
    const parsed = read({ energyPre: { value: 9, declaredMoment: "pre", capturedAt: null, receivedAt: T("20:00") } });
    expect(parsed).toMatchObject({ invalid: 1, unreadable: ["energyPre"], values: {} });
  });
});

describe("#492 retroactive sessions", () => {
  const retro = { startedAt: T("21:00"), endedAt: END, date: "2026-11-08" }; // loaded two days later: the start is a loading time
  it("compares nothing against a start whose local day is not the logical day, even with an early receipt", () => {
    expect(energy(pre(T("20:00"), T("20:30")), retro)).toMatchObject({ timing: "unknown", basis: "reference_unreliable" });
    expect(energy(pre(T("20:00")), retro)).toMatchObject({ timing: "unknown", basis: "reference_unreliable" });
  });
  it("a session with no logical date or no start is read as before, with no integrity claim", () => {
    expect(energy(pre(T("20:30")), { startedAt: START, endedAt: END })).toMatchObject({ timing: "before_start", basis: "client_clock" });
    expect(energy(pre(T("20:30")), { startedAt: START, endedAt: END, date: null })).toMatchObject({ timing: "before_start", basis: "client_clock" });
  });
  it("uses the Córdoba day, so a start after local midnight in UTC is still on its logical day", () => {
    const late = { startedAt: "2026-11-11T01:30:00.000Z", endedAt: "2026-11-11T02:30:00.000Z", date: "2026-11-10" }; // 22:30 local
    expect(energy(pre("2026-11-11T01:00:00.000Z", "2026-11-11T01:05:00.000Z"), late, null)).toMatchObject({ timing: "before_start", basis: "server_receipt" });
  });
});

describe("#492 post answers and other facts are not changed", () => {
  it("a post answer keeps post_declared, with no basis, whatever its receipt says", () => {
    const post = (receivedAt?: string) => ({ fatiguePost: { value: 2, declaredMoment: "post", instrumentVersion: "energy-fatigue/1", capturedAt: T("22:05"), ...(receivedAt ? { receivedAt } : {}) } });
    expect(read(post(T("20:00"))).values.fatiguePost).toEqual({ value: 2, timing: "post_declared", temporalQuality: "unverified_client_clock" });
    expect(read(post()).values.fatiguePost).toEqual({ value: 2, timing: "post_declared", temporalQuality: "unverified_client_clock" });
  });
  it("two pre answers of one session are decided independently", () => {
    const facts = { ...pre(T("20:30"), T("20:31")), fatiguePre: { value: 2, declaredMoment: "pre", instrumentVersion: "energy-fatigue/1", capturedAt: T("20:30"), receivedAt: T("21:40") } };
    const parsed = read(facts).values;
    expect(parsed.energyPre).toMatchObject({ timing: "before_start", basis: "server_receipt" });
    expect(parsed.fatiguePre).toMatchObject({ timing: "unknown", basis: "receipt_conflict" });
  });
});

describe("#492 consumers keep reading timing only", () => {
  const source = (facts: unknown, date = "2026-11-10"): InsightsSource => ({
    sessions: [{ id: "s1", date, routineId: "r", routineName: null, name: null, status: "completed", startedAt: START, endedAt: END, performanceLevel: null, painLevel: null, legacyEnergyLevel: null }],
    exercises: [{ id: "e1", sessionId: "s1", exerciseId: "x", name: "x", implement: null, weightMode: null, isCompleted: true, configuration: null }],
    sets: [{ id: "k1", sessionExerciseId: "e1", actualReps: 5, actualLoad: 50, isCompleted: true, completedAt: T("21:10") }],
    feelings: [{ sessionId: "s1", revision: 1, facts }], metricDefinitions: [], metricValues: [], meals: [],
  });
  const countsFor = (facts: unknown, date?: string) => {
    const src = source(facts, date), ctx = buildExposureContext(src);
    const description = describePriorFeelings(src.sessions, ctx, new Map([["s1", facts]]))[0]!;
    return { eligible: description.eligible, late: description.late, timingUnknown: description.timingUnknown, exclusions: ctx.exclusions };
  };
  it("an early server receipt is eligible even when the device clock says late", () => {
    expect(countsFor(pre(T("22:30"), T("20:50")))).toMatchObject({ eligible: 1, late: 0, timingUnknown: 0 });
  });
  it("offline capture is counted as unknown time, not as late and not as eligible", () => {
    expect(countsFor(pre(T("20:50"), T("23:30")))).toMatchObject({ eligible: 0, late: 0, timingUnknown: 1 });
  });
  it("both clocks late is counted as late", () => {
    expect(countsFor(pre(T("21:30"), T("21:31")))).toMatchObject({ eligible: 0, late: 1, timingUnknown: 0 });
  });
  it("a retroactive session is counted as unknown time and the answer is not lost", () => {
    expect(countsFor(pre(T("20:50"), T("20:51")), "2026-11-08")).toMatchObject({ eligible: 0, late: 0, timingUnknown: 1 });
  });
  it("a legacy fact is counted exactly as before", () => {
    expect(countsFor(pre(T("20:50")))).toMatchObject({ eligible: 1, late: 0, timingUnknown: 0 });
  });
  it("priorFeelingFact keeps its states for the new evidence", () => {
    const ctx = (facts: unknown) => ({ feelings: read(facts).values, unreadableFeelings: undefined });
    expect(priorFeelingFact(ctx(pre(T("22:30"), T("20:50"))), pre(T("22:30"), T("20:50")), "energyPre")).toEqual({ state: "recorded", value: 4 });
    expect(priorFeelingFact(ctx(pre(T("20:50"), T("23:30"))), pre(T("20:50"), T("23:30")), "energyPre")).toEqual({ state: "unknown_time", value: null });
    expect(priorFeelingFact(ctx(pre(T("22:30"), T("22:31"))), pre(T("22:30"), T("22:31")), "energyPre")).toEqual({ state: "late", value: null });
  });
});

describe("#492 the wire contract stays compatible", () => {
  const wire = (extra: Record<string, unknown>) => ({ value: 3, timing: "before_start", temporalQuality: "unverified_client_clock", ...extra });
  it("accepts an answer without basis (an older server), every known basis, and refuses anything else", () => {
    expect(isSessionFeelingWire(wire({}))).toBe(true);
    for (const basis of ["server_receipt", "client_clock", "client_and_receipt_late", "receipt_conflict", "receipt_unreadable", "reference_unreliable"]) expect(isSessionFeelingWire(wire({ basis }))).toBe(true);
    for (const basis of ["verified", "", null, 3]) expect(isSessionFeelingWire(wire({ basis }))).toBe(false);
  });
  it("still refuses a temporalQuality the contract never had: a receipt does not upgrade the device clock", () => {
    expect(isSessionFeelingWire(wire({ temporalQuality: "server_verified" }))).toBe(false);
  });
  it("every fact the adapter produces passes the validator an installed app carries", () => {
    const facts = { ...pre(T("20:30"), T("20:31")), fatiguePre: { value: 2, declaredMoment: "pre", capturedAt: T("20:30"), receivedAt: "nope" }, fatiguePost: { value: 3, declaredMoment: "post", capturedAt: null } };
    for (const fact of Object.values(read(facts).values)) expect(isSessionFeelingWire(fact)).toBe(true);
  });
});
