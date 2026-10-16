// Presentation only. OAuth can take any amount of time: its waiting pose never climbs the screen.
export const ENTRY_REST_HEIGHTS = [72, 100, 84, 120, 112, 148, 132] as const;
export const ENTRY_BAR_GAP = 4;
export const ENTRY_CONNECT_LIFT = 6;
export const ENTRY_RISE_MS = 700;
export const ENTRY_STAGGER_MS = 60;
export const ENTRY_STAIRS_MS = ENTRY_RISE_MS + ENTRY_STAGGER_MS * (ENTRY_REST_HEIGHTS.length - 1);
export const ENTRY_SPREAD_MS = 300;
export const ENTRY_BAR_BLEED = 64;
export const ENTRY_FADE_MS = 300;
export const ENTRY_SUCCESS_MS = ENTRY_STAIRS_MS + ENTRY_FADE_MS;

const clamp = (value: number) => {
  'worklet';
  return Math.max(0, Math.min(1, value));
};
export function entryBarFrame(index: number, width: number, height: number, connecting: number, arrival: number, breathe = 0, spread = 0) {
  'worklet';
  const barWidth = Math.max(1, (width - ENTRY_BAR_GAP * (ENTRY_REST_HEIGHTS.length - 1)) / ENTRY_REST_HEIGHTS.length);
  const baseline = Math.min(ENTRY_REST_HEIGHTS[index], height * 0.18);
  const t = clamp((clamp(arrival) * ENTRY_STAIRS_MS - index * ENTRY_STAGGER_MS) / ENTRY_RISE_MS);
  // Smoothstep: zero velocity at both ends. No spring overshoot or reverse motion on a screen-sized rise.
  const eased = t * t * (3 - 2 * t);
  const waiting = baseline + clamp(connecting) * ENTRY_CONNECT_LIFT;
  const visibleHeight = waiting + (height + 16 - waiting) * eased + breathe * (1 - eased);
  return {
    left: index * (barWidth + ENTRY_BAR_GAP),
    width: barWidth,
    // Fixed native/SVG bounds: only the top edge moves. The filled tail stays below the viewport.
    height: height + ENTRY_BAR_BLEED,
    transform: [
      { translateY: height - visibleHeight },
      // Grow around each column's center; a one-point overlap prevents hairline seams.
      { scaleX: 1 + (ENTRY_BAR_GAP + 1) / barWidth * clamp(spread) },
    ],
  };
}
