// Portable (#367): shared by the API, Web and Expo. What night a sleep value means, said the same way everywhere.
export const SLEEP_NIGHT_CONVENTION = "sleep_night_ending_on_date/1" as const;

const longDate = (date: string) => new Intl.DateTimeFormat("es-AR", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" })
  .format(new Date(`${date}T12:00:00Z`)).replace(/,/gu, "");
const previous = (date: string) => new Date(Date.parse(`${date}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);

/**
 * The sleep recorded on `date` is the night that ended the morning of `date`. "Anoche" only when `date` is today; any other
 * date says which morning, so editing an old day never reads as last night.
 */
export function sleepNightCaption(date: string, today: string): string {
  if (date === today) return "Cuánto dormiste anoche: la noche que terminó esta mañana.";
  if (date === previous(today)) return "La noche que terminó ayer a la mañana.";
  return `La noche que terminó la mañana del ${longDate(date)}.`;
}
