import { normalizeWeightMode, weightModeStrategy } from "../../mobile-api/weight-modes";
import type { ExerciseExposure, ExclusionReason, HistoricalContext, PerformanceExerciseBlock, PerformanceSet, VolumeFact } from "./types";

export const isExerciseUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

/** Arrays are unordered source rows. This is only for duplicate identity, never performance equality. */
function fingerprint(value: unknown): string {
  if (Array.isArray(value)) return JSON.stringify(value.map(fingerprint).sort());
  if (value !== null && typeof value === "object") return JSON.stringify(Object.entries(value)
    .sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, fingerprint(item)]));
  return JSON.stringify(value);
}

export function uniqueRows<T extends { id: string }>(rows: readonly T[]) {
  const groups = new Map<string, T[]>();
  for (const row of rows) groups.set(row.id, [...(groups.get(row.id) ?? []), row]);
  const unique: T[] = [];
  const conflicts: string[] = [];
  let deduplicated = 0;
  for (const [id, group] of [...groups].sort(([a], [b]) => a.localeCompare(b))) {
    // A row alone cannot contradict itself, and fingerprinting a whole session is the costliest step over a long history.
    if (group.length > 1 && new Set(group.map(fingerprint)).size > 1) conflicts.push(id);
    else {
      unique.push(group[0]!);
      deduplicated += group.length - 1;
    }
  }
  return { unique, conflicts, deduplicated };
}

/** Reference selection compares each exposure with its whole history, and only a handful of mode spellings exist. */
const normalizedModes = new Map<string, string | null>();
function normalizedMode(value: string | null): string | null {
  if (value === null) return null;
  let mode = normalizedModes.get(value);
  if (mode === undefined) { mode = normalizeWeightMode(value); normalizedModes.set(value, mode); }
  return mode;
}

export function contextIssue(context: HistoricalContext): ExclusionReason | null {
  const mode = normalizedMode(context.weightMode);
  if (!mode || !context.unit || !context.implement?.trim() || !context.configuration?.trim()) return "missing_context";
  const strategy = weightModeStrategy(mode);
  if (strategy === "unsupported") return "unsupported_mode";
  const unit = { load_reps: "kg", unit_reps: "lingotes", bodyweight_reps: "reps", time: "seconds" }[strategy];
  return unit === context.unit ? null : "mode_unit_mismatch";
}

export function sameContext(a: HistoricalContext, b: HistoricalContext): boolean {
  return normalizedMode(a.weightMode) === normalizedMode(b.weightMode)
    && a.unit === b.unit && a.implement === b.implement && a.configuration === b.configuration;
}

function validSet(set: PerformanceSet, context: HistoricalContext): boolean {
  const strategy = weightModeStrategy(normalizeWeightMode(context.weightMode));
  if (set.amount === null || !Number.isFinite(set.amount) || set.amount < 0) return false;
  if (strategy !== "time" && !Number.isSafeInteger(set.amount)) return false;
  if (strategy === "load_reps" || strategy === "unit_reps") {
    return set.load !== null && Number.isFinite(set.load) && set.load >= 0
      && (strategy !== "unit_reps" || Number.isSafeInteger(set.load));
  }
  // The explicit bodyweight/time mode has no external-load component. Added load is unsupported.
  return set.load === null || set.load === 0;
}

/** Merge repeated blocks only after verifying their historical context. One exposure per exercise/session. */
export function buildExposure(sessionId: string, exerciseId: string, blocks: readonly PerformanceExerciseBlock[]): ExerciseExposure {
  const rows = uniqueRows(blocks);
  const sets = uniqueRows(rows.unique.flatMap(block => block.sets));
  const context = rows.unique[0]?.context ?? null;
  let issue: ExclusionReason | null = null;
  if (!isExerciseUuid(exerciseId)) issue = "invalid_exercise_id";
  else if (rows.conflicts.length || sets.conflicts.length) issue = "duplicate_conflict";
  else if (!context) issue = "missing_context";
  else issue = rows.unique.map(block => contextIssue(block.context)).find(Boolean) ?? null;
  if (!issue && context && rows.unique.some(block => !sameContext(context, block.context))) issue = "mixed_context";
  if (!issue && rows.unique.some(block => !block.completed)) issue = "incomplete_exercise";
  const completed = sets.unique.filter(set => set.completed);
  if (!issue && !completed.length) issue = "no_completed_sets";
  if (!issue && context && completed.some(set => !validSet(set, context))) issue = "invalid_completed_set";
  return {
    sessionId, exerciseId,
    blockIds: [...new Set(blocks.map(block => block.id))].sort(),
    context: context ? { ...context } : null,
    sets: completed.map(set => ({ ...set })),
    excludedSetIds: [...sets.unique.filter(set => !set.completed).map(set => set.id), ...sets.conflicts].sort(),
    deduplicatedRows: rows.deduplicated + sets.deduplicated,
    issue,
  };
}

export function volumeFact(exposure: ExerciseExposure): VolumeFact {
  if (exposure.issue || !exposure.context) return null;
  const strategy = weightModeStrategy(normalizeWeightMode(exposure.context.weightMode));
  const loaded = strategy === "load_reps" || strategy === "unit_reps";
  const value = exposure.sets.reduce((sum, set) => sum + set.amount! * (loaded ? set.load! : 1), 0);
  if (!Number.isFinite(value)) return null;
  return { unit: strategy === "load_reps" ? "kg_reps" : strategy === "unit_reps" ? "lingote_reps" : strategy === "time" ? "seconds" : "reps", value };
}
