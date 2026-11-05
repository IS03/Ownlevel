import { notFound } from "next/navigation";
import { listExercises } from "@/lib/phase2/training";
import {
  getWorkoutSessionDetail,
  listRecentRobustExerciseHistoryByExercise,
  type RobustExerciseHistoryItem,
} from "@/lib/phase2/training-robust";
import type { ExerciseReportSession } from "@/lib/phase2/exercise-insights";
import { SessionEditor } from "./session-editor";
import { clientDetailFromWorkoutDetail } from "./session-editor-helpers";
import { requireAuthenticatedRequestContext } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function serializeRecentHistory(
  history: Record<string, RobustExerciseHistoryItem[]>,
): Record<string, ExerciseReportSession[]> {
  return Object.fromEntries(
    Object.entries(history).map(([exerciseId, items]) => [
      exerciseId,
      items.map((item) => ({
        sessionId: item.session.id,
        logDate: item.logDate,
        completedAt: item.session.ended_at,
        routineId: item.session.routine_id,
        routineName: item.session.routine_name_snapshot ?? item.session.session_name ?? "Sesión libre",
        decision: item.exercise.decision,
        sets: item.exercise.sets.map((set) => ({
          id: set.id,
          set_number: set.set_number,
          target_reps: set.target_reps,
          target_weight_kg: set.target_weight_kg,
          target_rir: set.target_rir,
          actual_reps: set.actual_reps,
          actual_weight_kg: set.actual_weight_kg,
          is_completed: set.is_completed,
        })),
      })),
    ]),
  );
}

export default async function SessionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const search = (await searchParams) ?? {};
  const requestedReturn = typeof search.return === "string" ? search.return : null;
  const historyReturnHref = requestedReturn?.startsWith("/history?") ? requestedReturn : null;
  const auth = await requireAuthenticatedRequestContext();
  const [detail, exercises] = await Promise.all([
    getWorkoutSessionDetail(id, auth),
    listExercises({ includeArchived: false }, auth),
  ]);
  if (!detail) notFound();
  const recentHistory = detail.session.status === "in_progress"
    ? await listRecentRobustExerciseHistoryByExercise({
        exerciseIds: detail.exercises.map((exercise) => exercise.exercise_id),
        limitPerExercise: 6,
      }, auth)
    : {};
  const clientDetail = clientDetailFromWorkoutDetail(detail);
  const editorKey = `${detail.session.updated_at}:${clientDetail.exercises
    .map((exercise) => `${exercise.id}:${exercise.updated_at}`)
    .join(",")}`;

  return (
    <div className="lg:mx-auto lg:max-w-[760px]">
      <SessionEditor
        userId={auth.userId}
        key={editorKey}
        detail={clientDetail}
        recentHistoryByExerciseId={serializeRecentHistory(recentHistory)}
        returnHref={historyReturnHref}
        returnLabel={historyReturnHref ? "Volver al día" : undefined}
        libraryExercises={exercises.map((exercise) => ({
          id: exercise.id,
          nombre: exercise.nombre,
          grupo_muscular: exercise.grupo_muscular,
          muscle_group_label: exercise.muscle_group_label,
          implement: exercise.implement,
          weight_mode: exercise.weight_mode,
        }))}
      />
    </div>
  );
}
