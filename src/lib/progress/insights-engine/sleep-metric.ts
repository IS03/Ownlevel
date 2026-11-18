/**
 * Which metric is «sleep» for Comparaciones. The system sleep metric (its night is declared when it is loaded), and also a
 * metric of the person's own that is a duration named like sleep («Sueño», «Dormir», «Descanso»…): many people track sleep
 * with their own metric. For those the night is the loading convention: the value of a date is the night that ended that
 * morning, the same convention the system metric declares.
 */
type MetricLike = { id: string; name: string; valueType: string; systemKey?: string | null; archived?: boolean };
const plain = (text: string) => text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
const SLEEP_WORDS = /\b(sueno|suenos|dormir|dormi|dormido|dormida|descanso|descansar|descanse)\b/u;

/** A metric of the person's own that means sleep: a duration with a sleep word in its name. */
export function isNamedSleepMetric(metric: MetricLike): boolean {
  return !metric.systemKey && metric.valueType === "duration" && SLEEP_WORDS.test(plain(metric.name));
}
export function isSleepMetric(metric: MetricLike): boolean {
  return metric.systemKey === "sleep" || isNamedSleepMetric(metric);
}
/** Ids whose values carry no night declaration and follow the loading convention instead. */
export function conventionSleepIds(metrics: readonly MetricLike[]): Set<string> {
  return new Set(metrics.filter(isNamedSleepMetric).map(metric => metric.id));
}
/** The one sleep metric a routine relation reads: an active system one first, else the first active named one. */
export function relationSleepMetric<T extends MetricLike>(metrics: readonly T[]): T | undefined {
  const active = metrics.filter(metric => !metric.archived);
  return active.find(metric => metric.systemKey === "sleep") ?? active.find(isNamedSleepMetric);
}
