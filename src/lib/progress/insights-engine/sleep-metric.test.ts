import { describe, expect, it } from "vitest";
import { conventionSleepIds, isSleepMetric, relationSleepMetric } from "./sleep-metric";

const m = (id: string, name: string, valueType = "duration", systemKey: string | null = null, archived = false) => ({ id, name, valueType, systemKey, archived });

describe("which metric is sleep", () => {
  it("the system one, and an own duration metric named like sleep (accents and case ignored)", () => {
    for (const name of ["Sueño", "SUENO", "Horas de sueño", "Dormir", "Dormí", "Descanso", "descanso nocturno"]) expect(isSleepMetric(m("a", name))).toBe(true);
    for (const name of ["Siesta larga", "Suelo pélvico", "Trabajo", "Descansillo"]) expect(isSleepMetric(m("a", name))).toBe(false);
    expect(isSleepMetric(m("a", "Sueño", "integer"))).toBe(false); // a count is not a duration of sleep
    expect(isSleepMetric(m("s", "Sueño", "duration", "sleep"))).toBe(true);
  });
  it("only own metrics follow the loading convention; the system one keeps its declared night", () => {
    expect([...conventionSleepIds([m("s", "Sueño", "duration", "sleep"), m("o", "Sueño"), m("t", "Trabajo")])]).toEqual(["o"]);
  });
  it("the relation reads an active system sleep first, else the person's own one; archived ones never", () => {
    expect(relationSleepMetric([m("o", "Sueño"), m("s", "Sueño", "duration", "sleep")])?.id).toBe("s");
    expect(relationSleepMetric([m("s", "Sueño", "duration", "sleep", true), m("o", "Sueño")])?.id).toBe("o");
    expect(relationSleepMetric([m("o", "Sueño", "duration", null, true)])).toBeUndefined();
  });
});
