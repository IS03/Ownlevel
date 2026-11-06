import { describe, expect, it } from "vitest";
import {
  formatWeightKg,
  isValidBodyWeightKg,
  parseOptionalWeight,
  shouldRecordCurrentWeight,
  shouldRecordProfileWeight,
  isMostRecentWeightEntry,
  weightChange,
  weightHistoryForLastDays,
  type WeightHistoryPoint,
} from "./weight-history";

const entries: WeightHistoryPoint[] = [
  { id: "one", log_date: "2026-05-01", weight_kg: 66 },
  { id: "two", log_date: "2026-08-01", weight_kg: 65.4 },
  { id: "three", log_date: "2026-08-11", weight_kg: 64.8 },
];

describe("historial de peso", () => {
  it("acepta decimales con punto o coma y rechaza valores inválidos", () => {
    expect(parseOptionalWeight("64.8")).toEqual({ ok: true, value: 64.8 });
    expect(parseOptionalWeight("64,8")).toEqual({ ok: true, value: 64.8 });
    expect(parseOptionalWeight("")).toEqual({ ok: true, value: null });
    expect(parseOptionalWeight("NaN").ok).toBe(false);
    expect(parseOptionalWeight("-1").ok).toBe(false);
    // Zero is not a weight (#367); an empty field still clears it.
    expect(parseOptionalWeight("0")).toEqual({ ok: false, error: "El peso tiene que ser mayor a 0 y hasta 999,99 kg." });
    expect(parseOptionalWeight("0,00").ok).toBe(false);
    expect(parseOptionalWeight("0.01")).toEqual({ ok: true, value: 0.01 });
    expect([0, -1, Number.NaN, 1000, 0.01, 80].map(isValidBodyWeightKg)).toEqual([false, false, false, false, true, true]);
    expect(parseOptionalWeight("1000").ok).toBe(false);
    expect(parseOptionalWeight("64.888").ok).toBe(false);
  });

  it("usa sólo puntos reales del período y calcula el cambio de forma neutral", () => {
    expect(weightHistoryForLastDays(entries, "2026-08-11", 90).map((entry) => entry.id)).toEqual([
      "two",
      "three",
    ]);
    expect(weightChange(entries.slice(1))).toBeCloseTo(-0.6);
    expect(weightChange([entries[2]!])).toBeNull();
  });

  it("formatea el peso para la interfaz argentina", () => {
    expect(formatWeightKg(64.8)).toBe("64,8");
  });

  it("sólo crea o reemplaza el snapshot diario cuando el peso actual cambia", () => {
    expect(shouldRecordCurrentWeight(null, 65)).toBe(true);
    expect(shouldRecordCurrentWeight(65, 64.8)).toBe(true);
    expect(shouldRecordCurrentWeight(64.8, 64.8)).toBe(false);
    expect(shouldRecordCurrentWeight(64.8, null)).toBe(false);
  });

  it("corrige perfiles con peso existente pero sin historial sin inventar registros posteriores", () => {
    expect(shouldRecordProfileWeight({ previousWeight: null, nextWeight: 65, hasWeightHistory: false })).toBe(true);
    expect(shouldRecordProfileWeight({ previousWeight: 65, nextWeight: 65, hasWeightHistory: false })).toBe(true);
    expect(shouldRecordProfileWeight({ previousWeight: 65, nextWeight: 65, hasWeightHistory: true })).toBe(false);
    expect(shouldRecordProfileWeight({ previousWeight: 65, nextWeight: 64.8, hasWeightHistory: true })).toBe(true);
  });

  it("sólo considera actual al registro cronológicamente más reciente", () => {
    expect(isMostRecentWeightEntry("2026-08-13", "2026-08-13")).toBe(true);
    expect(isMostRecentWeightEntry("2026-08-10", "2026-08-13")).toBe(false);
    expect(isMostRecentWeightEntry("2026-08-13", null)).toBe(false);
  });
});
