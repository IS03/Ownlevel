export function todayInCordoba(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Cordoba",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = new Map(parts.map((part) => [part.type, part.value]));
  return `${values.get("year")}-${values.get("month")}-${values.get("day")}`;
}

const CORDOBA_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Cordoba", year: "numeric", month: "2-digit", day: "2-digit" });
/** The Córdoba calendar date of an instant (ms), as `todayInCordoba` would give it then. One shared formatter: called per window. */
export function cordobaDateOf(instant: number): string {
  const values = new Map(CORDOBA_DAY.formatToParts(new Date(instant)).map((part) => [part.type, part.value]));
  return `${values.get("year")}-${values.get("month")}-${values.get("day")}`;
}
