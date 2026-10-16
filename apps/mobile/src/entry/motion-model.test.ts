import { describe, expect, it } from '@jest/globals';
import { ENTRY_BAR_BLEED, ENTRY_BAR_GAP, ENTRY_CONNECT_LIFT, ENTRY_REST_HEIGHTS, ENTRY_RISE_MS, ENTRY_STAIRS_MS, ENTRY_STAGGER_MS, entryBarFrame } from './motion-model';

const top = (frame: ReturnType<typeof entryBarFrame>) => frame.transform[0].translateY!;
const scale = (frame: ReturnType<typeof entryBarFrame>) => frame.transform[1].scaleX!;

describe('entry bars stay anchored while waiting and entering', () => {
  it.each([[390, 844], [320, 568], [844, 390]])('uses close, evenly spaced columns on %s × %s', (width, height) => {
    const frames = ENTRY_REST_HEIGHTS.map((_, i) => entryBarFrame(i, width, height, 0, 0));
    expect(ENTRY_BAR_GAP).toBe(4);
    expect(frames[0].left).toBe(0);
    expect(frames.at(-1)!.left + frames.at(-1)!.width).toBeCloseTo(width);
    frames.slice(1).forEach((f, i) => expect(f.left - frames[i].left - frames[i].width).toBeCloseTo(ENTRY_BAR_GAP));
  });
  it('the waiting pose moves each bar only six points, never into the logo or buttons', () => {
    ENTRY_REST_HEIGHTS.forEach((_, i) => {
      const rest = entryBarFrame(i, 390, 844, 0, 0);
      const waiting = entryBarFrame(i, 390, 844, 1, 0);
      expect(top(rest) - top(waiting)).toBe(ENTRY_CONNECT_LIFT);
      expect(844 - top(waiting)).toBeLessThan(160);
    });
  });
  it('rises smoothly from left to right and never falls or moves horizontally during success', () => {
    const progress = (ENTRY_STAGGER_MS / 2) / ENTRY_STAIRS_MS;
    expect(top(entryBarFrame(0, 390, 844, 1, progress))).toBeLessThan(top(entryBarFrame(0, 390, 844, 1, 0)));
    expect(top(entryBarFrame(1, 390, 844, 1, progress))).toBe(top(entryBarFrame(1, 390, 844, 1, 0)));
    ENTRY_REST_HEIGHTS.forEach((_, i) => {
      let previous = entryBarFrame(i, 390, 844, 1, 0);
      for (let step = 1; step <= 100; step++) {
        const next = entryBarFrame(i, 390, 844, 1, step / 100);
        expect(top(next)).toBeLessThanOrEqual(top(previous));
        expect(next.height).toBe(previous.height);
        expect(next.left).toBe(previous.left);
        expect(next.width).toBe(previous.width);
        previous = next;
      }
      expect(top(previous)).toBe(-16);
    });
    // No jump at a column's first frame: its velocity starts at zero.
    const start = top(entryBarFrame(0, 390, 844, 1, 0));
    expect(start - top(entryBarFrame(0, 390, 844, 1, 1 / ENTRY_STAIRS_MS))).toBeLessThan(0.01);
    expect(ENTRY_STAIRS_MS).toBe(ENTRY_RISE_MS + 6 * ENTRY_STAGGER_MS);
  });
  it.each([[390, 844], [320, 568], [844, 390]])('keeps a filled tail below the screen throughout breathing, waiting and success on %s × %s', (width, height) => {
    ENTRY_REST_HEIGHTS.forEach((_, i) => {
      for (let step = 0; step <= 100; step++) {
        const frame = entryBarFrame(i, width, height, 1, step / 100, 8);
        expect(frame.height).toBe(height + ENTRY_BAR_BLEED);
        expect(top(frame) + frame.height).toBeGreaterThan(height + 32);
      }
      const breathing = entryBarFrame(i, width, height, 0, 0, 8);
      expect(top(breathing) + breathing.height).toBeGreaterThan(height);
    });
  });
  it('widens every bar symmetrically until the champagne itself fills every gap', () => {
    let previousWidth = 0;
    for (let step = 0; step <= 100; step++) {
      const frames = ENTRY_REST_HEIGHTS.map((_, i) => entryBarFrame(i, 390, 844, 1, 1, 0, step / 100));
      const paintedWidth = frames[0].width * scale(frames[0]);
      expect(paintedWidth).toBeGreaterThanOrEqual(previousWidth);
      previousWidth = paintedWidth;
      frames.forEach(frame => expect(top(frame) + frame.height).toBeGreaterThan(844));
      if (step === 100) frames.slice(1).forEach((frame, i) => {
        const previous = frames[i];
        const previousRight = previous.left + previous.width / 2 + previous.width * scale(previous) / 2;
        const nextLeft = frame.left + frame.width / 2 - frame.width * scale(frame) / 2;
        expect(previousRight - nextLeft).toBeCloseTo(1);
      });
    }
  });
});
