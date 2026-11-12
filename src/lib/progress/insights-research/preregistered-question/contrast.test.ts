import { describe, expect, it } from "vitest";
import { seededRandom } from "../../insights-engine/stats";
import { ALPHAS, contrastTest, evaluateQuestion, permuteExposure, prepareRows, statisticT, type PairedRow, type SessionDay } from "./contrast";

function randomRows(seed: number, n: number, keys = ["A", "B"]): PairedRow[] {
  const u = seededRandom(seed);
  return Array.from({ length: n }, (_, day) => ({ day, routineKey: keys[Math.floor(u() * keys.length)], a: (u() < 0.45 ? 1 : 0) as 0 | 1, y: Math.floor(u() * 7) / 6 }));
}

/** Independent reference: sum_s w_s (ybar_hi - ybar_lo) with w = n_hi n_lo / n. */
function weightedForm(rows: PairedRow[]): number {
  const groups = new Map<string, PairedRow[]>();
  for (const r of rows) { const k = `${r.routineKey}|${Math.floor(r.day / 28)}`; groups.set(k, [...(groups.get(k) ?? []), r]); }
  let total = 0;
  for (const g of groups.values()) {
    const hi = g.filter(r => r.a === 1), lo = g.filter(r => r.a === 0);
    if (!hi.length || !lo.length) continue;
    const mean = (x: PairedRow[]) => x.reduce((s, r) => s + r.y, 0) / x.length;
    total += ((hi.length * lo.length) / g.length) * (mean(hi) - mean(lo));
  }
  return total;
}
function centeredForm(rows: PairedRow[]): number {
  const groups = new Map<string, PairedRow[]>();
  for (const r of rows) { const k = `${r.routineKey}|${Math.floor(r.day / 28)}`; groups.set(k, [...(groups.get(k) ?? []), r]); }
  let total = 0;
  for (const g of groups.values()) { const abar = g.reduce((s, r) => s + r.a, 0) / g.length; for (const r of g) total += (r.a - abar) * r.y; }
  return total;
}

describe("contrast statistic", () => {
  it("T = sum (a - abar_s) y equals sum w_s (ybar_hi - ybar_lo)", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const rows = randomRows(seed, 60 + seed * 5);
      const T = statisticT(prepareRows(rows));
      expect(Math.abs(T - centeredForm(rows))).toBeLessThan(1e-12);
      expect(Math.abs(T - weightedForm(rows))).toBeLessThan(1e-12);
    }
  });

  it("stratum_shift preserves per-stratum n_hi; uninformative strata contribute 0 and do not change p", () => {
    const rows = randomRows(7, 70);
    const prep = prepareRows(rows), random = seededRandom(3), out = new Uint8Array(prep.n);
    for (let b = 0; b < 50; b++) {
      permuteExposure(prep, "stratum_shift", random, out);
      for (const idx of prep.strataRows) expect(idx.reduce((s, i) => s + out[i], 0)).toBe(idx.reduce((s, i) => s + prep.a[i], 0));
    }
    const base = [...rows.filter(r => r.day < 56)];
    const extra: PairedRow[] = Array.from({ length: 6 }, (_, i) => ({ day: 60 + i, routineKey: "C", a: 1 as const, y: 0.2 * i }));
    expect(Math.abs(statisticT(prepareRows([...base, ...extra])) - statisticT(prepareRows(base)))).toBe(0);
    const p0 = contrastTest(base, "stratum_shift", 11), p1 = contrastTest([...base, ...extra], "stratum_shift", 11);
    expect(p1.p).toBe(p0.p);
    expect(p1.informativeStrata).toBe(p0.informativeStrata);
  });

  it("is EXACTLY valid under cyclic invariance (full product group, uniform law on a)", () => {
    const yA = [0.1, 0.5, 0.2, 0.9, 0.5, 0.7], yB = [0.3, 0.3, 0.8, 0.1, 0.6];
    const rows: PairedRow[] = [...yA.map((y, i) => ({ day: i, routineKey: "A", a: 0 as const, y })), ...yB.map((y, i) => ({ day: i, routineKey: "B", a: 0 as const, y }))];
    const prep = prepareRows(rows);
    const subsets = (n: number, k: number) => { const out: number[][] = []; for (let m = 0; m < 1 << n; m++) { const bits = Array.from({ length: n }, (_, i) => (m >> i) & 1); if (bits.reduce((s, b) => s + b, 0) === k) out.push(bits); } return out; };
    const alphas = [0.05, 0.1, 0.2, 0.3];
    let worstExcess = -Infinity, maxRejection = 0;
    for (const [kA, kB] of [[3, 2], [2, 1], [1, 1], [4, 3], [2, 2]]) {
      const pValues: number[] = [];
      for (const aA of subsets(6, kA)) for (const aB of subsets(5, kB)) {
        const T = (x: number[], y: number[]) => { const buf = new Uint8Array(11); buf.set(x, 0); buf.set(y, 6); return statisticT(prep, buf); };
        const obs = Math.abs(T(aA, aB));
        let ge = 0;
        for (let sA = 0; sA < 6; sA++) for (let sB = 0; sB < 5; sB++) {
          const x = aA.map((_, i) => aA[(i + sA) % 6]), y = aB.map((_, i) => aB[(i + sB) % 5]);
          if (Math.abs(T(x, y)) >= obs - 1e-12) ge++;
        }
        pValues.push(ge / 30);
      }
      for (const alpha of alphas) {
        const reject = pValues.filter(p => p <= alpha + 1e-12).length / pValues.length;
        maxRejection = Math.max(maxRejection, reject);
        worstExcess = Math.max(worstExcess, reject - alpha);
        expect(reject).toBeLessThanOrEqual(alpha + 1e-12);
      }
    }
    console.log(`exact cyclic validity: max exact rejection over counts and alphas = ${maxRejection.toFixed(4)}; worst (rejection - alpha) = ${worstExcess.toFixed(4)}`);
  });

  it("COUNTEREXAMPLE (expected failure mode): exposure with a monotone trend, independent of y but not cyclically invariant, over-rejects", () => {
    const n = 8, y = Array.from({ length: n }, (_, t) => t / 7), pr = Array.from({ length: n }, (_, t) => 0.1 + (0.8 * t) / 7);
    const rows: PairedRow[] = y.map((v, t) => ({ day: t, routineKey: "A", a: 0 as const, y: v }));
    const prep = prepareRows(rows);
    const T = (a: number[]) => statisticT(prep, Uint8Array.from(a));
    let reject = 0;
    for (let m = 0; m < 1 << n; m++) {
      const a = Array.from({ length: n }, (_, i) => (m >> i) & 1);
      const prob = a.reduce((s, bit, i) => s * (bit ? pr[i] : 1 - pr[i]), 1);
      const obs = Math.abs(T(a));
      let ge = 0;
      for (let k = 0; k < n; k++) if (Math.abs(T(a.map((_, i) => a[(i + k) % n]))) >= obs - 1e-12) ge++;
      if (ge / n <= 0.25 + 1e-12) reject += prob;
    }
    console.log(`counterexample: exact P(p <= 0.25) = ${reject.toFixed(6)} (nominal 0.25)`);
    expect(reject).toBeGreaterThan(0.25);
  });

  it("Monte Carlo p is in [1/(B+1), 1], deterministic and two-sided symmetric", () => {
    const rows = randomRows(5, 80);
    for (const variant of ["stratum_shift", "era_shift"] as const) {
      const r1 = contrastTest(rows, variant, 42), r2 = contrastTest(rows, variant, 42);
      expect(r1.p).toBe(r2.p);
      expect(r1.p).toBeGreaterThanOrEqual(1 / 1000);
      expect(r1.p).toBeLessThanOrEqual(1);
      const flipped = contrastTest(rows.map(r => ({ ...r, y: 1 - r.y })), variant, 42);
      expect(flipped.p).toBeCloseTo(r1.p, 12);
      expect(flipped.T).toBeCloseTo(-r1.T, 10);
    }
  });
});

/** Alternating routine keys keep the shift group large so a strong planted effect can reach p <= 0.008. */
function synthetic(count: number, effect: boolean, seed = 1, startDay = 0, step = 1): SessionDay[] {
  const u = seededRandom(seed);
  return Array.from({ length: count }, (_, i) => {
    const a = (u() < 0.5 ? 1 : 0) as 0 | 1, noise = (u() - 0.5) * 0.1;
    return { day: startDay + i * step, routineKey: i % 2 ? "A" : "B", a, y: Math.min(1, Math.max(0, effect ? (a ? 0.85 : 0.15) + noise : 0.5 + noise * 4)) };
  });
}

describe("look schedule", () => {
  it("alphas sum to 0.04", () => expect(Math.abs(ALPHAS.look1 + ALPHAS.look2 - 0.04)).toBeLessThan(1e-12));

  it("a strong planted effect is supported at look 1", () => {
    const result = evaluateQuestion(synthetic(150, true), { design: 120, variant: "stratum_shift", seed: 1 });
    expect(result.closure).toBe("supported");
    expect(result.alertLook).toBe(1);
    expect(result.looks[0].m).toBe(60);
    expect(result.looks[0].day).toBe(59);
  });

  it("honors a custom alpha pair", () => {
    const strong = synthetic(150, true);
    expect(evaluateQuestion(strong, { design: 120, variant: "stratum_shift", seed: 1, alphas: { look1: 0, look2: 0 } }).closure).not.toBe("supported");
    const r = evaluateQuestion(strong, { design: 120, variant: "stratum_shift", seed: 1, alphas: { look1: 0.007, look2: 0.028 } });
    expect(r.looks[0].alpha).toBe(0.007);
    expect(r.closure).toBe("supported");
  });

  it("does not evaluate before m1 paired rows", () => {
    const result = evaluateQuestion(synthetic(59, true), { design: 120, variant: "stratum_shift", seed: 1 });
    expect(result.looks).toHaveLength(0);
    expect(result.closure).toBe("insufficient_data");
  });

  it("closes as insufficient_data when N is not reached within 730 days (rows after the horizon do not count)", () => {
    const early = synthetic(100, false, 2), late = synthetic(80, false, 3, 730);
    const result = evaluateQuestion([...early, ...late], { design: 120, variant: "era_shift", seed: 1 });
    expect(result.pairedTotal).toBe(100);
    expect(result.looks.map(l => l.look)).toEqual([1]);
    expect(result.closure).toBe("insufficient_data");
  });

  it("closes as no_clear_difference when look 2 passes the gates without an alert", () => {
    const result = evaluateQuestion(synthetic(140, false, 4), { design: 120, variant: "stratum_shift", seed: 5 });
    expect(result.looks.map(l => l.look)).toEqual([1, 2]);
    expect(result.looks[1].gates).toEqual({ coverage: true, selective: true, strata: true });
    expect(result.closure).toBe("no_clear_difference");
  });

  it("closes as selective_record when the selective-absence gate blocks the final look", () => {
    const days: SessionDay[] = [];
    const base = synthetic(130, false, 6, 0, 1);
    // every 4th calendar day has an outcome but no exposure, with a very different outcome
    let day = 0;
    for (const s of base) { days.push({ ...s, day: day++ }); if (day % 3 === 0) days.push({ day: day++, routineKey: "A", y: 0.98, a: null }); }
    const result = evaluateQuestion(days, { design: 120, variant: "stratum_shift", seed: 1 });
    const final = result.looks.find(l => l.look === 2)!;
    expect(final.coverage).toBeGreaterThanOrEqual(0.5);
    expect(final.gates.selective).toBe(false);
    expect(final.p).toBeNull();
    expect(result.closure).toBe("selective_record");
  });

  it("low coverage blocks with insufficient_data", () => {
    const base = synthetic(130, false, 7);
    const days: SessionDay[] = [];
    let day = 0;
    for (const s of base) { days.push({ ...s, day: day++ }); days.push({ day: day++, routineKey: "A", y: s.y, a: null }); days.push({ day: day++, routineKey: "A", y: s.y, a: null }); }
    const result = evaluateQuestion(days, { design: 120, variant: "stratum_shift", seed: 1 });
    expect(result.closure).toBe("insufficient_data");
  });
});
