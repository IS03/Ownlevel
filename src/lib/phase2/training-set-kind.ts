import type { SetKind } from "./types";

/** Rows and legacy read models without a type are working sets. Never infer it from load or order. */
export function completedWorkSet(set: { is_completed: boolean; set_kind?: SetKind }): boolean {
  return set.is_completed && set.set_kind !== "warmup";
}
