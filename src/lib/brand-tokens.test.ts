import { describe, expect, it } from "vitest";
import { chart, intensity, layout, palette, radius, space, typeScale } from "@brand/tokens";

// Tripwire against accidental edits: these are the values IDENTIDAD.md states in
// prose/tables. Changing one is a brand decision; update IDENTIDAD.md first.
describe("OWNLEVEL brand tokens (shared runtime entry)", () => {
  it("champagne is the single accent; light mode uses the readable dark champagne", () => {
    expect(palette.dark.accent).toBe("#C9B68A");
    expect(palette.light.accent).toBe("#705F36");
    expect(palette.dark.accentSoft).toBe("rgba(201,182,138,0.16)");
    expect(palette.light.accentSoft).toBe("rgba(201,182,138,0.32)");
    expect(chart.dark[0]).toBe(palette.dark.accent);
    expect(chart.light[0]).toBe(palette.light.accent);
    expect(intensity.dark[4]).toBe(palette.dark.accent);
    expect(intensity.light[4]).toBe(palette.light.accent);
  });

  it("graphite neutrals for dark and light", () => {
    expect(palette.dark).toMatchObject({ bg: "#09090B", surface: "#18181B", elevated: "#27272A", text: "#F4F4F5", textMuted: "#9F9FA9" });
    expect(palette.light).toMatchObject({ bg: "#F3F1EC", surface: "#FFFFFF", elevated: "#EAE7DF", border: "#E0DCD0", text: "#18181B", textMuted: "#62626A" });
    expect(palette.dark.heroFrom).toBe("#DCCBA3");
    expect(palette.dark.heroTo).toBe("#A8935F");
  });

  it("only a system error state exists: no success/warning token to judge user data", () => {
    expect(palette.dark.error).toBe("#E5736B");
    expect(palette.light.error).toBe("#B4392F");
    for (const scheme of [palette.dark, palette.light]) {
      expect(Object.keys(scheme).filter(k => /success|warning|positive|negative|good|bad/i.test(k))).toEqual([]);
    }
    expect(Object.keys(palette.dark)).toEqual(Object.keys(palette.light));
  });

  it("system radii, spacing scale and fixed sizes", () => {
    expect(radius).toMatchObject({ card: 20, inner: 12, button: 14, chip: 10, input: 12, sheet: 28, tabBar: 26 });
    expect(Object.values(space)).toEqual([4, 8, 12, 16, 20, 24, 32, 40]);
    expect(layout).toMatchObject({ screenPadding: 16, cardPadding: 18, blockGap: 12, buttonHeight: 50, inputHeight: 48, rowHeight: 44, minTouch: 44 });
  });

  it("iOS type scale (size / weight)", () => {
    const sizes = Object.fromEntries(Object.entries(typeScale).map(([k, v]) => [k, `${v.fontSize}/${v.fontWeight}`]));
    expect(sizes).toEqual({
      largeTitle: "34/700", title1: "28/700", title2: "22/700", headline: "17/600",
      body: "17/400", subheadline: "15/400", footnote: "13/400", caption: "12/500", heroNumber: "56/700",
    });
  });
});
