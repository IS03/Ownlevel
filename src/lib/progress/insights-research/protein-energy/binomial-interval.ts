/** Exact two-sided 95% Clopper–Pearson, by inversion of binomial tails. No normal approximation. */
export function binomialCdf(k: number, n: number, p: number): number {
  if (!Number.isSafeInteger(n) || n < 0 || !Number.isSafeInteger(k) || !Number.isFinite(p) || p < 0 || p > 1) throw new Error("Invalid binomial arguments");
  if (k < 0) return 0; if (k >= n || p === 0) return 1; if (p === 1) return 0;
  let term = n * Math.log1p(-p), total = -Infinity;
  for (let j = 0; j <= k; j++) {
    const max = Math.max(total, term); total = max + Math.log(Math.exp(total - max) + Math.exp(term - max));
    term += Math.log(n - j) - Math.log(j + 1) + Math.log(p) - Math.log1p(-p);
  }
  return Math.min(1, Math.exp(total));
}
function upper(k: number, n: number): number {
  if (k === n) return 1;
  if (k === 0) return -Math.expm1(Math.log(0.025) / n);
  let lo = 0, hi = 1;
  for (let i = 0; i < 70; i++) { const p = (lo + hi) / 2; if (binomialCdf(k, n, p) > 0.025) lo = p; else hi = p; }
  return (lo + hi) / 2;
}
export function exact95(k: number, n: number): { lower: number; upper: number } {
  if (!Number.isSafeInteger(n) || n <= 0 || !Number.isSafeInteger(k) || k < 0 || k > n) throw new Error("Invalid interval counts");
  return { lower: k === 0 ? 0 : 1 - upper(n - k, n), upper: upper(k, n) };
}
