/** Deterministic PRNG: the same data and seed always give the same result, with no clock or global state. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Average ranks, so a recorded repeated value (including zero) stays tied instead of being ordered arbitrarily. */
export function ranks(values: ArrayLike<number>): Float64Array {
  const order = Array.from({ length: values.length }, (_, index) => index).sort((a, b) => values[a]! - values[b]!);
  const result = new Float64Array(values.length);
  for (let start = 0; start < order.length;) {
    let end = start;
    while (end + 1 < order.length && values[order[end + 1]!] === values[order[start]!]) end++;
    for (let index = start; index <= end; index++) result[order[index]!] = (start + end) / 2 + 1;
    start = end + 1;
  }
  return result;
}

export function pearson(x: ArrayLike<number>, y: ArrayLike<number>): number | null {
  const n = x.length;
  if (n < 2 || y.length !== n) return null;
  let sumX = 0, sumY = 0;
  for (let i = 0; i < n; i++) { sumX += x[i]!; sumY += y[i]!; }
  const meanX = sumX / n, meanY = sumY / n;
  let xy = 0, xx = 0, yy = 0;
  for (let i = 0; i < n; i++) {
    const a = x[i]! - meanX, b = y[i]! - meanY;
    xy += a * b; xx += a * a; yy += b * b;
  }
  return xx === 0 || yy === 0 ? null : xy / Math.sqrt(xx * yy);
}

export const spearman = (x: ArrayLike<number>, y: ArrayLike<number>) => pearson(ranks(x), ranks(y));

export const dayNumber = (date: string) => Math.round(Date.parse(`${date}T00:00:00Z`) / 86_400_000);

/**
 * Value minus the median of the observations within ±halfWindowDays. Removes slow drift and routine eras, so two series
 * that merely move together over months do not count as a relation between their day-to-day changes. The window shrinks
 * symmetrically at the edges: a one-sided median would leave a drift in both series and create the correlation it removes.
 */
export function localResidual(values: Float64Array, days: Float64Array, halfWindowDays: number): Float64Array {
  const result = new Float64Array(values.length);
  const first = days[0]!, last = days[values.length - 1]!;
  for (let i = 0; i < values.length; i++) {
    const half = Math.min(halfWindowDays, days[i]! - first, last - days[i]!);
    let from = i, to = i;
    while (from > 0 && days[from - 1]! >= days[i]! - half) from--;
    while (to + 1 < values.length && days[to + 1]! <= days[i]! + half) to++;
    const window = values.slice(from, to + 1).sort();
    const middle = window.length >> 1;
    result[i] = values[i]! - (window.length % 2 ? window[middle]! : (window[middle - 1]! + window[middle]!) / 2);
  }
  return result;
}

/** Shuffles runs of consecutive positions, which preserves the short-term dependence a plain shuffle would destroy. */
export function blockPermutation(length: number, blockSize: number, random: () => number): Int32Array {
  const offset = Math.floor(random() * blockSize);
  const blocks: [number, number][] = offset ? [[0, Math.min(offset, length)]] : [];
  for (let start = offset; start < length; start += blockSize) blocks.push([start, Math.min(start + blockSize, length)]);
  for (let i = blocks.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [blocks[i], blocks[j]] = [blocks[j]!, blocks[i]!];
  }
  const result = new Int32Array(length);
  let position = 0;
  for (const [start, end] of blocks) for (let index = start; index < end; index++) result[position++] = index;
  return result;
}

export function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b), middle = sorted.length >> 1;
  return sorted.length % 2 ? sorted[middle]! : sorted[middle - 1]! / 2 + sorted[middle]! / 2;
}

export const mean = (values: readonly number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
