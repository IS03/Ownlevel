// Pure (shared with Expo through the mobile-api contracts folder): which comparison a weight mode admits. Only load_reps (kg) admits an estimated 1RM.
export type WeightModeStrategy = "load_reps" | "bodyweight_reps" | "unit_reps" | "time" | "unsupported";

/** `mode` already normalized (trimmed, single spaces, lower-case es-AR). */
export function weightModeStrategy(mode: string | null): WeightModeStrategy {
  if (["peso total", "por mancuerna", "por brazo", "total con barra"].includes(mode ?? "")) return "load_reps";
  if (mode === "peso corporal") return "bodyweight_reps";
  if (mode === "lingotes (no kg)") return "unit_reps";
  if (mode === "tiempo (segundos)") return "time";
  return "unsupported";
}
export const normalizeWeightMode = (value: string | null | undefined): string | null => value?.trim().replace(/\s+/g, " ").toLocaleLowerCase("es-AR") || null;
