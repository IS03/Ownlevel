import type { TrainingAnalysisSource } from "../phase2/training-analysis";

/**
 * Test fixtures only. Suites written before P1-C2 test mode semantics, scopes and payloads with sessions whose
 * implement and variant were never set. Since the comparison requires both known and equal (#402 §9.3), those fixtures
 * declare a known execution explicitly: implement "Barra" where none was set, «no aplica» as the variant. Unknown
 * implements and variants are tested on their own in training-performance.test.ts.
 */
export function withKnownExecution<T extends Pick<TrainingAnalysisSource, "sessionExercises">>(source: T): T & { configurations: Map<string, string | null> } {
  for (const exercise of source.sessionExercises) {
    if (!exercise.implement_snapshot) (exercise as { implement_snapshot: string | null }).implement_snapshot = "Barra";
  }
  return Object.assign(source, { configurations: new Map(source.sessionExercises.map((exercise) => [exercise.id, "not_applicable"] as const)) });
}
