import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { generateHistory } from "./generator";
import { AUTHORIZATION_STATEMENT, authorize, buildAuthorization, type Environment } from "./reserved-authorization";
import { REHEARSAL_PROTOCOL, RESERVED_PROTOCOL, canonicalJson, planJobs, protocolHash, sourceHash, validateProtocol, type Protocol } from "./reserved-protocol";
import { decide } from "./reserved-runner";

const root = fileURLToPath(new URL("../../../../../", import.meta.url));
const env: Environment = { commit: "a".repeat(40), sourceHash: "b".repeat(64), treeClean: true };
const clone = (p: Protocol): Protocol => structuredClone(p);

describe("authorization", () => {
  const good = () => buildAuthorization(REHEARSAL_PROTOCOL, env, "Direccion", "2026-11-11T00:00:00Z");

  it("accepts a matching authorization (rehearsal) even on a dirty tree", () => {
    expect(authorize(REHEARSAL_PROTOCOL, good(), { ...env, treeClean: false }).namespace).toBe(REHEARSAL_PROTOCOL.namespace);
  });

  it("refuses wrong protocolHash, sourceHash, commit, dirty reserved tree and wrong statement", () => {
    expect(() => authorize(REHEARSAL_PROTOCOL, { ...good(), protocolHash: "0".repeat(64) }, env)).toThrow(/protocolHash/);
    expect(() => authorize(REHEARSAL_PROTOCOL, { ...good(), sourceHash: "c".repeat(64) }, env)).toThrow(/sourceHash/);
    expect(() => authorize(REHEARSAL_PROTOCOL, { ...good(), commit: "d".repeat(40) }, env)).toThrow(/commit/);
    expect(() => authorize(REHEARSAL_PROTOCOL, { ...good(), commit: "abc" }, env)).toThrow(/40-hex/);
    expect(() => authorize(REHEARSAL_PROTOCOL, { ...good(), statement: AUTHORIZATION_STATEMENT + "." }, env)).toThrow(/statement/);
    expect(() => authorize(REHEARSAL_PROTOCOL, { ...good(), namespace: "x" }, env)).toThrow(/namespace/);
    expect(() => authorize(REHEARSAL_PROTOCOL, { ...good(), authorizedBy: undefined }, env)).toThrow(/authorizedBy/);
    expect(() => authorize(REHEARSAL_PROTOCOL, null, env)).toThrow();
    const reserved = buildAuthorization(RESERVED_PROTOCOL, env, "Direccion", "2026-11-11T00:00:00Z");
    expect(() => authorize(RESERVED_PROTOCOL, reserved, { ...env, treeClean: false })).toThrow(/working tree/);
  });
});

describe("generator permit", () => {
  it("rejects a reserved namespace without a permit, with a hand-built permit and with a permit for another namespace", () => {
    const ns = RESERVED_PROTOCOL.namespace;
    expect(() => generateHistory("N1_iid", 0, ns)).toThrow(/permit/);
    expect(() => generateHistory("N1_iid", 0, ns, { kind: "reserved-permit", namespace: ns })).toThrow(/permit/);
    const other = authorize(REHEARSAL_PROTOCOL, buildAuthorization(REHEARSAL_PROTOCOL, env, "x", "y"), env);
    expect(() => generateHistory("N1_iid", 0, ns, other)).toThrow(/permit/);
  });

  it("stress scenarios generate valid histories and are deterministic", () => {
    for (const sc of ["S1_short_trends", "S2_anticipatory_missing"] as const) {
      const a = generateHistory(sc, 1, REHEARSAL_PROTOCOL.namespace), b = generateHistory(sc, 1, REHEARSAL_PROTOCOL.namespace);
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
      expect(a.sessions.length).toBeGreaterThan(100);
    }
  });
});

describe("protocol", () => {
  it("rejects altered configuration", () => {
    const mutate = (fn: (p: Protocol) => void) => { const p = clone(RESERVED_PROTOCOL); fn(p); return p; };
    expect(() => validateProtocol(RESERVED_PROTOCOL)).not.toThrow();
    expect(() => validateProtocol(REHEARSAL_PROTOCOL)).not.toThrow();
    expect(() => validateProtocol(mutate(p => { p.method.alphas = { look1: 0.008, look2: 0.032 }; }))).toThrow(/alphas/);
    expect(() => validateProtocol(mutate(p => { p.scenarios[0].n = 3750; }))).toThrow();
    expect(() => validateProtocol(mutate(p => { p.scenarios = p.scenarios.filter(s => s.id !== "N8_retro_selection"); }))).toThrow(/null/);
    expect(() => validateProtocol(mutate(p => { p.scenarios = p.scenarios.filter(s => s.id !== "P25"); }))).toThrow(/power/);
    expect(() => validateProtocol(mutate(p => { p.method.variant = "stratum_shift"; }))).toThrow(/variant/);
    expect(() => validateProtocol(mutate(p => { p.method.design = 160; }))).toThrow(/design/);
    expect(() => validateProtocol(mutate(p => { p.method.permutations = 499; }))).toThrow(/permutations/);
    expect(() => validateProtocol(mutate(p => { p.scenarios[1].id = p.scenarios[0].id; }))).toThrow(/duplicate/);
    expect(() => validateProtocol(mutate(p => { p.scenarios[0].id = "N99"; }))).toThrow(/unknown/);
    expect(() => validateProtocol(mutate(p => { p.namespace = "OWNLEVEL-367-preregistered-DEV-x"; }))).toThrow(/RESERVE/);
    expect(() => validateProtocol(mutate(p => { p.budgets = undefined as never; }))).toThrow(/budgets/);
    expect(() => validateProtocol(mutate(p => { p.budgets.chunkSize = 300; }))).toThrow(/multiple/);
    const rehearsal = (fn: (p: Protocol) => void) => { const p = clone(REHEARSAL_PROTOCOL); fn(p); return p; };
    expect(() => validateProtocol(rehearsal(p => { p.namespace = "OWNLEVEL-367-preregistered-RESERVE-x"; }))).toThrow(/DEV/);
    expect(() => validateProtocol(rehearsal(p => { p.namespace = "OWNLEVEL-367-DEV-reserve"; }))).toThrow(/DEV/);
  });

  it("the committed manifest equals the protocol and hash computed by the code", () => {
    const manifest = JSON.parse(readFileSync(`${root}docs/progress/367-preguntas-reserva-protocolo.json`, "utf8"));
    expect(manifest.protocol).toEqual(JSON.parse(JSON.stringify(RESERVED_PROTOCOL)));
    expect(manifest.protocolHash).toBe(protocolHash(RESERVED_PROTOCOL));
    expect(manifest.sourceFiles).toEqual(RESERVED_PROTOCOL.sourceFiles);
    expect(manifest.sourceHash).toBeUndefined();
    expect(manifest.commit).toBeUndefined();
  });

  it("has 44,000 histories in plan order without drawing anything, and stable hashes", () => {
    expect(RESERVED_PROTOCOL.scenarios.reduce((t, s) => t + s.n, 0)).toBe(44000);
    expect(planJobs(RESERVED_PROTOCOL).length).toBe(176);
    expect(canonicalJson({ b: 1, a: [2, { d: 1, c: 2 }] })).toBe('{"a":[2,{"c":2,"d":1}],"b":1}');
    expect(sourceHash(root)).toMatch(/^[0-9a-f]{64}$/);
    expect(Object.isFrozen(RESERVED_PROTOCOL.scenarios[0])).toBe(true);
  });
});

describe("decision", () => {
  const stats = (over: Record<string, { n: number; wilsonLower95: number; wilsonUpper95: number }> = {}) => {
    const out: Record<string, { n: number; wilsonLower95: number; wilsonUpper95: number }> = {};
    for (const s of RESERVED_PROTOCOL.scenarios) out[s.id] = { n: s.n, wilsonLower95: 0.8, wilsonUpper95: 0.03 };
    return { ...out, ...over };
  };
  it("approves only when everything passes; one failing null or low power rejects; a missing scenario is incomplete", () => {
    expect(decide(RESERVED_PROTOCOL, stats()).decision).toBe("approved");
    const bad = decide(RESERVED_PROTOCOL, stats({ N4_trends: { n: 4000, wilsonLower95: 0, wilsonUpper95: 0.051 } }));
    expect(bad.decision).toBe("rejected");
    expect(bad.failing).toEqual(["N4_trends"]);
    const low = decide(RESERVED_PROTOCOL, stats({ P25: { n: 1000, wilsonLower95: 0.69, wilsonUpper95: 0.8 } }));
    expect(low.decision).toBe("rejected");
    expect(low.failing).toEqual(["P25"]);
    const missing = stats(); delete (missing as Record<string, unknown>).S1_short_trends;
    expect(decide(RESERVED_PROTOCOL, missing).decision).toBe("incomplete");
    expect(decide(RESERVED_PROTOCOL, stats({ N1_iid: { n: 3999, wilsonLower95: 0, wilsonUpper95: 0.01 } })).decision).toBe("incomplete");
    // incomplete beats rejected: a failing null with a missing scenario never reads as a verdict
    const both = stats({ N4_trends: { n: 4000, wilsonLower95: 0, wilsonUpper95: 0.5 } }); delete (both as Record<string, unknown>).P10;
    expect(decide(RESERVED_PROTOCOL, both).decision).toBe("incomplete");
  });
});
