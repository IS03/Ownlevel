import { readFileSync } from "node:fs";
import { palette, routinePalette } from "@brand/tokens";
import { describe, expect, it } from "vitest";
import {
  LEGACY_ROUTINE_COLOR_TO_KEY,
  ROUTINE_COLOR_KEYS,
  ROUTINE_COLOR_PRESETS,
  assertRoutineColor,
  normalizeLegacyRoutineColor,
  resolveRoutineColor,
  routineColorCssVariable,
  routineColorCheckColors,
} from "./routine-colors";

describe("routine colors", () => {
  it("defines the complete selectable palette without destructive red", () => {
    expect(ROUTINE_COLOR_KEYS).toEqual([
      "violet", "indigo", "blue", "cyan", "green", "yellow", "orange", "rose", "sand", "stone", "slate", "graphite",
    ]);
    expect(ROUTINE_COLOR_KEYS).not.toContain("red");
    expect(ROUTINE_COLOR_KEYS).toContain("rose");
    expect(ROUTINE_COLOR_PRESETS.every((preset) => Boolean(preset.label) && Boolean(preset.cssVariable))).toBe(true);
  });

  it("uses violet only as a visual fallback for null or invalid legacy input", () => {
    expect(resolveRoutineColor(null)).toBe("violet");
    expect(resolveRoutineColor("#ef4444")).toBe("violet");
    expect(routineColorCssVariable(null)).toBe("var(--routine-violet)");
  });

  it("validates persisted values strictly", () => {
    expect(assertRoutineColor("indigo")).toBe("indigo");
    expect(assertRoutineColor(null)).toBeNull();
    expect(() => assertRoutineColor("#3b82f6")).toThrow("color de rutina válido");
    expect(() => assertRoutineColor("red")).toThrow("color de rutina válido");
  });

  it("uses a brand token with at least 3:1 contrast on all twelve swatches in both schemes", () => {
    const luminance = (hex: string) => {
      const channels = hex.slice(1).match(/../g)!.map(value => {
        const channel = Number.parseInt(value, 16) / 255;
        return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
      });
      return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
    };
    for (const key of ROUTINE_COLOR_KEYS) {
      const checks = routineColorCheckColors(key);
      for (const scheme of ["light", "dark"] as const) {
        expect([palette.light.text, palette.light.onAccent]).toContain(checks[scheme]);
        const a = luminance(checks[scheme]), b = luminance(routinePalette[scheme][key]);
        expect((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it("maps every supported legacy hex deterministically and preserves null", () => {
    expect(LEGACY_ROUTINE_COLOR_TO_KEY).toEqual({
      "#a855f7": "violet",
      "#3b82f6": "blue",
      "#06b6d4": "cyan",
      "#22c55e": "green",
      "#eab308": "yellow",
      "#f97316": "orange",
      "#ef4444": "rose",
    });
    expect(normalizeLegacyRoutineColor(null)).toBeNull();
  });
});

it("keeps both Web color schemes aligned with the shared Mobile palette", () => {
  const css = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");
  const darkStart = css.indexOf(".dark {");
  const schemes = { light: css.slice(0, darkStart), dark: css.slice(darkStart) };
  for (const scheme of ["light", "dark"] as const) {
    for (const key of ROUTINE_COLOR_KEYS) expect(schemes[scheme]).toContain(`--routine-${key}: ${routinePalette[scheme][key]};`);
  }
});
