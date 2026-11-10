import { useState } from 'react';
import { useWindowDimensions, type LayoutChangeEvent } from 'react-native';
import { brandTokens, typography } from '@/design-system';

/** Average advance of a tabular figure or letter, in em, rounded up so the estimate errs towards stacking. */
const ADVANCE = 0.62;

/**
 * Whether a row of figures (value with its unit) fits side by side in the measured container.
 * Never shrinks a number to make it fit: with large text or not enough width the figures stack
 * (AGENTS.md / IDENTIDAD.md: Dynamic Type is respected, values are not compressed).
 */
export function figuresFitInRow({ texts, width, fontScale, variant, gap = brandTokens.space.lg, columns = texts.length }: {
  texts: string[]; width: number; fontScale: number; variant: keyof typeof typography; gap?: number;
  /** Columns of a grid when there are more figures than columns (Mis vistas); one per figure by default. */
  columns?: number;
}) {
  if (fontScale > 1.3) return false;
  if (!texts.length) return true;
  const column = (width - gap * (columns - 1)) / columns;
  const longest = Math.max(...texts.map(text => text.length));
  return longest * ADVANCE * typography[variant].fontSize * fontScale <= column;
}

/** The width of a summary as laid out, starting from the screen width before the first layout. */
export function useMeasuredWidth() {
  const { width: windowWidth, fontScale } = useWindowDimensions();
  const [width, setWidth] = useState(windowWidth - 2 * brandTokens.layout.screenPadding);
  return { width, fontScale, onLayout: (event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width) };
}
