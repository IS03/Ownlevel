/** Exclusive: a body weight is above zero. 0 kg is not a weight, it is a value that was stored by mistake. */
export const MIN_WEIGHT_KG = 0;
export const MAX_WEIGHT_KG = 999.99;

/**
 * Whether a stored value is a body weight that analysis can use. Records that fail it stay in the history, to be seen,
 * corrected or deleted, but never enter a chart, a change or a comparison.
 */
export function isValidBodyWeightKg(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > MIN_WEIGHT_KG && value <= MAX_WEIGHT_KG;
}

export type WeightHistoryPoint = {
  id: string;
  log_date: string;
  weight_kg: number;
};

export type ParsedWeight =
  | { ok: true; value: number | null }
  | { ok: false; error: string };

export function parseOptionalWeight(value: string | null | undefined): ParsedWeight {
  const raw = value?.trim() ?? "";
  if (!raw) return { ok: true, value: null };

  const normalized = raw.replace(",", ".");
  const weight = Number(normalized);
  if (!Number.isFinite(weight)) {
    return { ok: false, error: "Ingresá un peso numérico válido." };
  }
  // An empty field still clears the weight (above). Zero is rejected: it is not a weight.
  if (weight <= MIN_WEIGHT_KG || weight > MAX_WEIGHT_KG) {
    return {
      ok: false,
      error: "El peso tiene que ser mayor a 0 y hasta 999,99 kg.",
    };
  }

  const rounded = Math.round(weight * 100) / 100;
  if (Math.abs(weight - rounded) > Number.EPSILON) {
    return { ok: false, error: "El peso puede tener como máximo dos decimales." };
  }

  return { ok: true, value: rounded };
}

export function formatWeightKg(value: number): string {
  return new Intl.NumberFormat("es-AR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

function shiftIsoDate(value: string, days: number): string {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function weightHistoryForLastDays(
  entries: WeightHistoryPoint[],
  today: string,
  days = 90,
): WeightHistoryPoint[] {
  const firstDate = shiftIsoDate(today, -(days - 1));
  return entries.filter((entry) => entry.log_date >= firstDate && entry.log_date <= today);
}

export function weightChange(entries: WeightHistoryPoint[]): number | null {
  if (entries.length < 2) return null;
  return entries.at(-1)!.weight_kg - entries[0]!.weight_kg;
}

export function shouldRecordCurrentWeight(
  previousWeight: number | null,
  nextWeight: number | null,
): nextWeight is number {
  return nextWeight !== null && previousWeight !== nextWeight;
}

/**
 * Decide si Ajustes debe crear un punto histórico. Mantiene el perfil como
 * fuente del peso actual y evita fabricar un registro al guardar otro campo.
 */
export function shouldRecordProfileWeight(input: {
  previousWeight: number | null;
  nextWeight: number | null;
  hasWeightHistory: boolean;
}): input is {
  previousWeight: number | null;
  nextWeight: number;
  hasWeightHistory: boolean;
} {
  if (input.nextWeight === null) return false;
  return (
    shouldRecordCurrentWeight(input.previousWeight, input.nextWeight) ||
    (!input.hasWeightHistory && input.previousWeight !== null)
  );
}

export function isMostRecentWeightEntry(
  logDate: string,
  latestLogDate: string | null,
): boolean {
  return latestLogDate === logDate;
}
