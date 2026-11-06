import { describe, expect, it } from "vitest";
import { sleepNightCaption } from "./sleep-night";

describe("#367 sleep night caption", () => {
  it("says anoche only for today, and names the morning for any other date", () => {
    expect(sleepNightCaption("2026-11-04", "2026-11-04")).toBe("Cuánto dormiste anoche: la noche que terminó esta mañana.");
    expect(sleepNightCaption("2026-11-03", "2026-11-04")).toBe("La noche que terminó ayer a la mañana.");
    expect(sleepNightCaption("2026-10-28", "2026-11-04")).toBe("La noche que terminó la mañana del miércoles 28 de octubre.");
    expect(sleepNightCaption("2026-10-28", "2026-11-04")).not.toContain("anoche");
  });
});
