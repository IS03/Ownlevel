import { describe, expect, it } from "vitest";
import { DEV_NAMESPACE, generateHistory, inverseNormalCdf } from "./generator";
import { prepareRows, summarizeRows, type PairedRow } from "./contrast";

describe("dev generator", () => {
  it("refuses reserved namespaces (case-insensitive)", () => {
    expect(() => generateHistory("N1_iid", 0, "x-Reserve-y")).toThrow();
    expect(() => generateHistory("N1_iid", 0, "RESERVED")).toThrow();
  });

  it("is deterministic and namespace/index sensitive", () => {
    const a = generateHistory("N2_persist", 3, DEV_NAMESPACE), b = generateHistory("N2_persist", 3, DEV_NAMESPACE);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(JSON.stringify(generateHistory("N2_persist", 4, DEV_NAMESPACE).sessions)).not.toBe(JSON.stringify(a.sessions));
  });

  it("inverse normal CDF is accurate", () => {
    expect(inverseNormalCdf(0.5)).toBeCloseTo(0, 9);
    expect(inverseNormalCdf(0.975)).toBeCloseTo(1.959963985, 6);
    expect(inverseNormalCdf(0.01)).toBeCloseTo(-2.326347874, 6);
  });

  it("era lengths are in [56,112] and sessions are post-creation, sorted, with y in [0,1]", () => {
    for (let i = 0; i < 20; i++) {
      const h = generateHistory("N5_recorded_changes", i, DEV_NAMESPACE);
      for (const len of h.meta.eraLengths) { expect(len).toBeGreaterThanOrEqual(56); expect(len).toBeLessThanOrEqual(112); }
      expect(h.sessions.every((s, k) => s.day >= 0 && s.day <= 729 && s.y >= 0 && s.y <= 1 && (k === 0 || s.day > h.sessions[k - 1].day))).toBe(true);
    }
  });

  it("N2 exposure coverage is roughly in range and N6 has a single routine key", () => {
    let sum = 0;
    for (let i = 0; i < 30; i++) sum += generateHistory("N2_persist", i, DEV_NAMESPACE).meta.observedExposureFraction;
    const mean = sum / 30;
    expect(mean).toBeGreaterThan(0.55);
    expect(mean).toBeLessThan(0.8);
    const keys = new Set(generateHistory("N6_unrecorded_changes", 1, DEV_NAMESPACE).sessions.map(s => s.routineKey));
    expect([...keys]).toEqual(["r0"]);
    expect(new Set(generateHistory("N5_recorded_changes", 1, DEV_NAMESPACE).sessions.map(s => s.routineKey)).size).toBeGreaterThan(3);
  });

  it("N8 picks a candidate from pre-creation data and N9/P15_sparse are sparse", () => {
    const h = generateHistory("N8_retro_selection", 2, DEV_NAMESPACE);
    expect(h.meta.picked!.candidate).toBeGreaterThanOrEqual(0);
    expect(h.meta.picked!.candidate).toBeLessThan(12);
    expect(h.preSessions.every(s => s.day < 0 && s.a.length === 12)).toBe(true);
    for (const sc of ["N9_sparse", "P15_sparse"] as const) { const m = generateHistory(sc, 0, DEV_NAMESPACE).meta; expect(m.sessionsPerWeek).toBe(2); expect(m.coverage).toBe(0.5); }
  });

  it("P20 produces a clearly positive pooled effect on average", () => {
    let sum = 0, count = 0;
    for (let i = 0; i < 30; i++) {
      const rows = generateHistory("P20", i, DEV_NAMESPACE).sessions.filter(s => s.a !== null) as PairedRow[];
      const e = summarizeRows(prepareRows(rows)).effect;
      if (e !== null) { sum += e; count++; }
    }
    expect(sum / count).toBeGreaterThan(0.08);
  });

  it("N7b misses exposure more often on high days, and P25 beats P20 on average", () => {
    let hi = 0, lo = 0;
    for (let i = 0; i < 30; i++) { const m = generateHistory("N7b_missing_by_exposure", i, DEV_NAMESPACE).meta; hi += m.missingRateHigh!; lo += m.missingRateLow!; }
    expect(hi / 30).toBeGreaterThan(0.5);
    expect(hi / 30).toBeLessThan(0.7);
    expect(lo / 30).toBeGreaterThan(0.08);
    expect(lo / 30).toBeLessThan(0.22);
    const mean = (sc: "P20" | "P25") => { let s = 0, n = 0; for (let i = 0; i < 30; i++) { const e = summarizeRows(prepareRows(generateHistory(sc, i, DEV_NAMESPACE).sessions.filter(x => x.a !== null) as PairedRow[])).effect; if (e !== null) { s += e; n++; } } return s / n; };
    expect(mean("P25")).toBeGreaterThan(mean("P20"));
  });
});
