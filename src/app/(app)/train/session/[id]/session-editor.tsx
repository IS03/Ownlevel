"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useRouter } from "next/navigation";
import {
  ArrowUpRight,
  Check,
  ChevronDown,
  Clock3,
  Dumbbell,
  FileText,
  History,
  LoaderCircle,
  Minus,
  Plus,
  Target,
  X,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { LocalizedDecimalInput } from "@/components/ui/localized-decimal-input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { routineColorCssVariable } from "@/lib/phase2/routine-colors";
import {
  filterExercisesByMuscleGroup,
  MUSCLE_GROUP_OPTIONS,
  type MuscleGroupFilter,
} from "@/lib/phase2/muscle-groups";
import { formatRestRange } from "@/lib/phase2/training-display";
import { exerciseIdentityLabel } from "@/lib/phase2/exercise-library";
import { formatSessionDate } from "@/lib/phase2/session-history";
import {
  appendWorkoutExerciseAction,
  cancelWorkoutSessionAction,
  finishWorkoutSessionAction,
  getWorkoutExerciseSyncStateAction,
  getWorkoutSessionCompletionStateAction,
  removeSessionExerciseAction,
  saveWorkoutExerciseAction,
} from "../../actions";
import {
  getDraftSnapshot,
  getServerDraftSnapshot,
  parseSessionMetadataDraft,
  parseWorkoutExerciseDraft,
  removeDraft,
  sessionMetadataDraftKey,
  subscribeDraftStore,
  TRAINING_DRAFT_VERSION,
  workoutDraftKey,
  writeDraft,
} from "@/lib/phase2/training-drafts";
import {
  nullableNumberFromInput,
  payloadsEqual,
} from "@/lib/phase2/training-validation";
import {
  ExerciseAutosaveError,
  ExerciseAutosaveQueue,
} from "@/lib/phase2/exercise-autosave";
import { resolveWorkoutFinishOutcome } from "@/lib/phase2/finish-reliability";
import { runWorkoutFinishAttempt } from "@/lib/phase2/finish-attempt";
import type { ExerciseAutosaveErrorCategory } from "@/lib/phase2/exercise-autosave";
import type {
  SessionMetadataInput,
  MuscleGroup,
  EditableWorkoutSet,
  WorkoutExercisePayload,
  WorkoutSessionClientDetail,
} from "@/lib/phase2/types";
import {
  calculateScrollCompensation,
  compactAutosaveStatus,
  completionStats,
  exerciseCompletion,
  exerciseProgressLabel,
  initialExpandedExerciseId,
  formatWorkoutClockTime,
  formatWorkoutDuration,
  formatWorkoutTimeRange,
  getWorkoutElapsedMilliseconds,
  nextSessionReminder,
  renumberWorkoutPayload,
  sessionMetadataFromSession,
  toggleTrainingDecision,
  workoutPayloadFromDetail,
  type SelectableTrainingDecision,
} from "./session-editor-helpers";
import { AddExerciseSheet } from "./add-exercise-sheet";
import { CompletedSessionActions } from "./completed-session-actions";
import { WorkoutFinishedDialog } from "./workout-finished-dialog";
import { QuickExerciseHistorySheet } from "./quick-exercise-history-sheet";
import type { ExerciseReportSession } from "@/lib/phase2/exercise-insights";
import { TrainingFeelings, useWebTrainingFeelings } from "@/components/training/training-feelings";
import { useWebExerciseConfigurations, WebExerciseVariant } from "@/components/training/exercise-variant";

const NEXT_SESSION_DECISIONS: Array<{
  value: SelectableTrainingDecision;
  label: string;
}> = [
  { value: "increase_weight", label: "+ Peso" },
  { value: "increase_reps", label: "+ Repeticiones" },
];

type ExerciseStatus = {
  pending: boolean;
  saved: boolean;
  error: string | null;
  errorCategory?: ExerciseAutosaveErrorCategory | null;
};

type RestTimerState = {
  exerciseId: string;
  exerciseName: string;
  endAt: number;
};

type SetRowProps = {
  exerciseId: string;
  set: EditableWorkoutSet;
  setIndex: number;
  readOnly: boolean;
  onChange: (
    updater: (set: EditableWorkoutSet) => EditableWorkoutSet,
    options?: { immediate?: boolean },
  ) => void;
};

const SET_GRID_LAYOUT =
  "grid-cols-[2rem_minmax(0,1fr)_minmax(0,1fr)_2.5rem_2.75rem]";
const SET_GRID_SHARED = `grid ${SET_GRID_LAYOUT} gap-x-1.5 px-2`;
const FINISH_CONFIRMATION_KEY_PREFIX = "ownlevel:workout-finished:";
const REST_TIMER_STORAGE_KEY_PREFIX = "ownlevel:workout-rest-timer:";
const EXERCISE_AUTOSAVE_DEBOUNCE_MS = 850;

function finishConfirmationKey(sessionId: string) {
  return `${FINISH_CONFIRMATION_KEY_PREFIX}${sessionId}`;
}

function restTimerStorageKey(sessionId: string) {
  return `${REST_TIMER_STORAGE_KEY_PREFIX}${sessionId}`;
}

function compactNumber(value: number | null) {
  return value === null ? "—" : String(value).replace(".", ",");
}

function timerLabel(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function validRestSeconds(value: number | null) {
  return value !== null && Number.isFinite(value) && value > 0 ? value : null;
}

function configuredRestLabel(minimum: number | null, maximum: number | null) {
  return formatRestRange(validRestSeconds(minimum), validRestSeconds(maximum));
}

function SessionTiming({
  startedAt,
  endedAt,
  isActive,
}: {
  startedAt: string | null;
  endedAt: string | null;
  isActive: boolean;
}) {
  const startedAtMilliseconds = startedAt ? new Date(startedAt).getTime() : Number.NaN;
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      if (!isActive) return () => {};
      const refresh = () => onStoreChange();
      const onVisibilityChange = () => {
        if (document.visibilityState === "visible") refresh();
      };
      const interval = window.setInterval(refresh, 60_000);
      document.addEventListener("visibilitychange", onVisibilityChange);
      return () => {
        window.clearInterval(interval);
        document.removeEventListener("visibilitychange", onVisibilityChange);
      };
    },
    [isActive],
  );
  const getSnapshot = useCallback(() => Date.now(), []);
  const getServerSnapshot = useCallback(
    () => (Number.isFinite(startedAtMilliseconds) ? startedAtMilliseconds : 0),
    [startedAtMilliseconds],
  );
  const now = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const startedClock = formatWorkoutClockTime(startedAt);

  if (!startedClock) return null;

  if (isActive) {
    const duration = formatWorkoutDuration(
      getWorkoutElapsedMilliseconds(startedAt, new Date(now).toISOString()),
    );
    return duration ? (
      <p className="metric-number text-xs text-muted-foreground">
        Iniciada {startedClock} · {duration}
      </p>
    ) : null;
  }

  const range = formatWorkoutTimeRange(startedAt, endedAt);
  const duration = formatWorkoutDuration(getWorkoutElapsedMilliseconds(startedAt, endedAt));
  return range && duration ? (
    <p className="metric-number text-xs text-muted-foreground">
      {range} · {duration}
    </p>
  ) : (
    <p className="metric-number text-xs text-muted-foreground">
      Iniciada {startedClock}
    </p>
  );
}

function SetRow({
  exerciseId,
  set,
  setIndex,
  readOnly,
  onChange,
}: SetRowProps) {
  return (
    <div
      className={cn(
        SET_GRID_SHARED,
        "grid-rows-[2.25rem_auto] items-center gap-y-0 border-b border-border/50 pb-1 pt-2 last:border-b-0 transition-colors duration-150",
        set.is_completed
          ? "bg-emerald-500/[0.035]"
          : "bg-transparent",
      )}
    >
      <div className="col-start-1 row-start-1 flex min-w-0 items-center justify-center">
        <span className="metric-number flex size-6 items-center justify-center rounded-md bg-muted/25 text-xs font-semibold text-muted-foreground">
          {setIndex + 1}
        </span>
      </div>
      <LocalizedDecimalInput
        aria-label={`Peso de la serie ${setIndex + 1} de ${exerciseId}`}
        className="metric-number col-start-2 row-start-1 h-9 rounded-md border-border/55 bg-background px-1 text-center text-sm font-semibold"
        min={0}
        max={9999.99}
        readOnly={readOnly}
        value={set.actual_weight_kg}
        onValueChange={(value) =>
          onChange((current) => ({
            ...current,
            actual_weight_kg: value,
          }))
        }
      />
      <p className="metric-number col-start-2 row-start-2 truncate text-center text-[10px] leading-none text-muted-foreground/85">
        obj {compactNumber(set.target_weight_kg)}
      </p>
      <Input
        aria-label={`Repeticiones de la serie ${setIndex + 1} de ${exerciseId}`}
        className="metric-number col-start-3 row-start-1 h-9 rounded-md border-border/55 bg-background px-1 text-center text-sm font-semibold"
        type="number"
        min={0}
        max={1000}
        step={1}
        inputMode="numeric"
        readOnly={readOnly}
        value={set.actual_reps ?? ""}
        onChange={(event) =>
          onChange((current) => ({
            ...current,
            actual_reps: nullableNumberFromInput(event.target.value),
          }))
        }
      />
      <p className="metric-number col-start-3 row-start-2 truncate text-center text-[10px] leading-none text-muted-foreground/85">
        obj {compactNumber(set.target_reps)}
      </p>
      <span
        className="metric-number col-start-4 row-start-1 flex min-w-0 items-center justify-center text-sm font-semibold text-foreground"
        aria-label={`RIR objetivo de la serie ${setIndex + 1}: ${set.target_rir ?? "sin definir"}`}
      >
        {compactNumber(set.target_rir)}
      </span>
      {readOnly ? (
        <div
          className="col-start-5 row-start-1 flex min-w-0 items-center justify-center"
          aria-label={set.is_completed ? "Serie completada" : "Serie pendiente"}
        >
          <span
            className={cn(
              "flex size-7 items-center justify-center rounded-full border",
              set.is_completed
                ? "border-emerald-500 bg-emerald-500 text-white"
                : "border-border bg-transparent text-muted-foreground",
            )}
          >
            {set.is_completed ? <Check className="size-4" strokeWidth={3} aria-hidden /> : null}
          </span>
        </div>
      ) : (
        <button
          type="button"
          className="group col-start-5 row-start-1 flex size-11 min-w-0 touch-manipulation items-center justify-center justify-self-center rounded-full outline-none transition-transform duration-150 active:scale-90 focus-visible:ring-3 focus-visible:ring-ring/50"
          aria-label={`Marcar serie ${setIndex + 1} como ${set.is_completed ? "pendiente" : "completada"}`}
          aria-pressed={set.is_completed}
          onClick={() =>
            onChange(
              (current) => ({
                ...current,
                is_completed: !current.is_completed,
              }),
              { immediate: true },
            )
          }
        >
          <span
            className={cn(
              "flex size-7 items-center justify-center rounded-full border transition-[background-color,border-color,transform] duration-150 group-active:scale-95",
              set.is_completed
                ? "border-emerald-500 bg-emerald-500 text-white"
                : "border-border bg-transparent text-muted-foreground group-hover:border-primary/50",
            )}
          >
            {set.is_completed ? <Check className="size-4" strokeWidth={3} aria-hidden /> : null}
          </span>
        </button>
      )}
    </div>
  );
}

function snapshotRecord(snapshot: string): Record<string, string | null> {
  try {
    const value: unknown = JSON.parse(snapshot);
    return typeof value === "object" && value !== null
      ? (value as Record<string, string | null>)
      : {};
  } catch {
    return {};
  }
}

function RatingPicker({
  label,
  value,
  minimum,
  maximum,
  disabled,
  onChange,
}: {
  label: string;
  value: number | null;
  minimum: number;
  maximum: number;
  disabled: boolean;
  onChange: (next: number | null) => void;
}) {
  const values = Array.from({ length: maximum - minimum + 1 }, (_, index) => minimum + index);
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div
        className={cn(
          "grid overflow-hidden rounded-xl border border-border/80 bg-background/40",
          maximum - minimum >= 10 ? "grid-cols-6" : "grid-cols-5",
        )}
        role="group"
        aria-label={label}
      >
        {values.map((option) => {
          const selected = value === option;
          return (
            <button
              key={option}
              type="button"
              disabled={disabled}
              aria-pressed={selected}
              className={cn(
                "metric-number flex h-11 touch-manipulation items-center justify-center border-r border-border/70 text-sm font-medium outline-none transition-colors last:border-r-0 focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-60",
                selected ? "bg-primary text-primary-foreground" : "hover:bg-muted/60 active:bg-muted",
              )}
              onClick={() => onChange(selected ? null : option)}
            >
              {option}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PainSlider({
  value,
  disabled,
  onChange,
}: {
  value: number | null;
  disabled: boolean;
  onChange: (next: number) => void;
}) {
  const currentValue = value ?? 0;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor="session-pain-level">Dolor</Label>
        <output htmlFor="session-pain-level" className="metric-number text-sm font-semibold">
          {currentValue}/10
        </output>
      </div>
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
        <span className="metric-number text-xs text-muted-foreground">0</span>
        <input
          id="session-pain-level"
          aria-label="Dolor, de 0 a 10"
          className="h-8 w-full cursor-pointer accent-primary disabled:cursor-not-allowed disabled:opacity-60"
          type="range"
          min={0}
          max={10}
          step={1}
          value={currentValue}
          disabled={disabled}
          onChange={(event) => onChange(Number(event.target.value))}
        />
        <span className="metric-number text-xs text-muted-foreground">10</span>
      </div>
    </div>
  );
}

export function SessionEditor({
  userId,
  detail,
  libraryExercises,
  recentHistoryByExerciseId,
  returnHref,
  returnLabel,
}: {
  userId: string;
  detail: WorkoutSessionClientDetail;
  libraryExercises: Array<{
    id: string;
    nombre: string;
    grupo_muscular: MuscleGroup | null;
    muscle_group_label: string | null;
    implement: string | null;
    weight_mode: string | null;
  }>;
  recentHistoryByExerciseId: Record<string, ExerciseReportSession[]>;
  returnHref?: string | null;
  returnLabel?: string;
}) {
  const feelings = useWebTrainingFeelings(userId, detail.session.id);
  const router = useRouter();
  const readOnly = detail.session.status !== "in_progress";
  const exerciseIds = useMemo(
    () => detail.exercises.map((exercise) => exercise.id),
    [detail.exercises],
  );
  // #367: optional variant per session exercise, the same journal and route as Mobile.
  const configurations = useWebExerciseConfigurations(userId, detail.session.id, exerciseIds);
  const metadataKey = sessionMetadataDraftKey(detail.session.id);
  const draftKeys = useMemo(
    () => [
      metadataKey,
      ...exerciseIds.map((exerciseId) => workoutDraftKey(detail.session.id, exerciseId)),
    ],
    [detail.session.id, exerciseIds, metadataKey],
  );
  const draftSnapshot = useSyncExternalStore(
    subscribeDraftStore,
    () => getDraftSnapshot(draftKeys),
    getServerDraftSnapshot,
  );
  const rawDrafts = useMemo(() => snapshotRecord(draftSnapshot), [draftSnapshot]);

  const initialPayloads = useMemo(
    () =>
      Object.fromEntries(
        detail.exercises.map((exercise) => [exercise.id, workoutPayloadFromDetail(exercise)]),
      ),
    [detail.exercises],
  );
  const initialVersions = useMemo(
    () =>
      Object.fromEntries(
        detail.exercises.map((exercise) => [exercise.id, exercise.updated_at]),
      ),
    [detail.exercises],
  );
  const [serverPayloads, setServerPayloads] = useState<
    Record<string, WorkoutExercisePayload>
  >(initialPayloads);
  const [serverVersions, setServerVersions] = useState<Record<string, string>>(
    initialVersions,
  );
  const [overrides, setOverrides] = useState<Record<string, WorkoutExercisePayload>>({});
  const [statuses, setStatuses] = useState<Record<string, ExerciseStatus>>({});
  const mountedRef = useRef(true);
  const exerciseCardRefs = useRef(new Map<string, HTMLDivElement>());
  const pendingScrollAnchorRef = useRef<{
    exerciseId: string;
    beforeTop: number;
  } | null>(null);
  const editingFencedRef = useRef(false);
  const finishInFlightRef = useRef(false);
  const removingExerciseIdsRef = useRef(new Set<string>());
  const serverPayloadsRef = useRef(initialPayloads);
  const serverVersionsRef = useRef(initialVersions);
  const latestPayloadsRef = useRef(initialPayloads);
  const [storageError, setStorageError] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [globalPending, setGlobalPending] = useState(false);
  const [finishStage, setFinishStage] = useState<"saving" | "finishing" | null>(null);
  const [finishConfirmationOpen, setFinishConfirmationOpen] = useState(false);
  const [selectedExerciseId, setSelectedExerciseId] = useState("");
  const [selectedMuscleGroup, setSelectedMuscleGroup] = useState<MuscleGroupFilter>("all");
  const [exerciseSearch, setExerciseSearch] = useState("");
  const [exercisePickerOpen, setExercisePickerOpen] = useState(false);
  const [editingNoteExerciseId, setEditingNoteExerciseId] = useState<string | null>(null);
  const [quickHistoryExerciseId, setQuickHistoryExerciseId] = useState<string | null>(null);
  const [restTimer, setRestTimer] = useState<RestTimerState | null>(null);
  const [restTimerHydrated, setRestTimerHydrated] = useState(readOnly);
  const [timerNow, setTimerNow] = useState(() => Date.now());
  const autosaveRef = useRef<ExerciseAutosaveQueue<WorkoutExercisePayload> | null>(null);
  if (autosaveRef.current === null) {
    autosaveRef.current = new ExerciseAutosaveQueue<WorkoutExercisePayload>({
      debounceMs: EXERCISE_AUTOSAVE_DEBOUNCE_MS,
      equals: payloadsEqual,
      save: async ({ exerciseId, payload, expectedUpdatedAt }) => {
        const result = await saveWorkoutExerciseAction({
          sessionId: detail.session.id,
          sessionExerciseId: exerciseId,
          expectedUpdatedAt,
          payload,
        });
        if (!result.ok) {
          throw new ExerciseAutosaveError(result.errorCategory, result.error);
        }
        return result.data;
      },
      loadServerState: async (exerciseId) => {
        const result = await getWorkoutExerciseSyncStateAction({
          sessionId: detail.session.id,
          sessionExerciseId: exerciseId,
        });
        if (!result.ok) throw new Error(result.error);
        return result.data;
      },
      onStateChange: (exerciseId, state) => {
        if (!mountedRef.current) return;
        setStatuses((current) => ({
          ...current,
          [exerciseId]: {
            pending: state.phase === "saving",
            saved: state.phase === "saved",
            error: state.error,
            errorCategory: state.errorCategory,
          },
        }));
      },
      onServerState: (exerciseId, state) => {
        if (state.status !== "active") {
          if (mountedRef.current) {
            setGlobalError(
              state.status === "session_closed"
                ? "La sesión ya fue finalizada en otra pestaña."
                : "Este ejercicio ya no está en la sesión.",
            );
          }
          return;
        }
        serverPayloadsRef.current = {
          ...serverPayloadsRef.current,
          [exerciseId]: state.payload,
        };
        serverVersionsRef.current = {
          ...serverVersionsRef.current,
          [exerciseId]: state.updatedAt,
        };
        if (!mountedRef.current) return;
        setServerPayloads((current) => ({ ...current, [exerciseId]: state.payload }));
        setServerVersions((current) => ({ ...current, [exerciseId]: state.updatedAt }));
      },
      onSaved: (
        exerciseId,
        { savedPayload, latestPayload, updatedAt, hasNewerChanges },
      ) => {
        serverPayloadsRef.current = {
          ...serverPayloadsRef.current,
          [exerciseId]: savedPayload,
        };
        serverVersionsRef.current = {
          ...serverVersionsRef.current,
          [exerciseId]: updatedAt,
        };

        if (hasNewerChanges) {
          writeExerciseDraft(exerciseId, latestPayload, updatedAt);
        } else {
          latestPayloadsRef.current = {
            ...latestPayloadsRef.current,
            [exerciseId]: savedPayload,
          };
          removeDraft(workoutDraftKey(detail.session.id, exerciseId));
        }

        if (!mountedRef.current) return;
        setServerPayloads((current) => ({ ...current, [exerciseId]: savedPayload }));
        setServerVersions((current) => ({ ...current, [exerciseId]: updatedAt }));
        if (!hasNewerChanges) {
          setOverrides((current) => {
            const next = { ...current };
            delete next[exerciseId];
            return next;
          });
        }
      },
    });
  }
  const sessionExerciseLibraryIds = useMemo(
    () => new Set(detail.exercises.map((exercise) => exercise.exercise_id)),
    [detail.exercises],
  );
  const filteredLibraryExercises = useMemo(
    () =>
      filterExercisesByMuscleGroup(libraryExercises, selectedMuscleGroup).filter(
        (exercise) =>
          !sessionExerciseLibraryIds.has(exercise.id) &&
          exercise.nombre.toLocaleLowerCase("es").includes(exerciseSearch.trim().toLocaleLowerCase("es")),
      ),
    [exerciseSearch, libraryExercises, selectedMuscleGroup, sessionExerciseLibraryIds],
  );
  const selectedLibraryExercise = libraryExercises.find(
    (exercise) =>
      exercise.id === selectedExerciseId &&
      !sessionExerciseLibraryIds.has(exercise.id),
  );
  const quickHistoryExercise = detail.exercises.find(
    (exercise) => exercise.id === quickHistoryExerciseId,
  ) ?? null;

  const baseMetadata = useMemo(
    () => sessionMetadataFromSession(detail.session),
    [detail.session],
  );
  const metadataDraft = readOnly
    ? null
    : parseSessionMetadataDraft(rawDrafts[metadataKey] ?? null, detail.session.id);
  const [metadataOverride, setMetadataOverride] = useState<SessionMetadataInput | null>(null);
  const metadata = readOnly
    ? baseMetadata
    : metadataOverride ?? metadataDraft?.metadata ?? baseMetadata;
  const draftById = useMemo(
    () =>
      Object.fromEntries(
        exerciseIds.map((exerciseId) => {
          const key = workoutDraftKey(detail.session.id, exerciseId);
          return [
            exerciseId,
            readOnly
              ? null
              : parseWorkoutExerciseDraft(rawDrafts[key] ?? null, exerciseId),
          ];
        }),
      ),
    [detail.session.id, exerciseIds, rawDrafts, readOnly],
  );

  const currentPayloads = useMemo(() => {
    const result: Record<string, WorkoutExercisePayload> = {};
    for (const exerciseId of exerciseIds) {
      const draft = draftById[exerciseId];
      const draftIsCurrent = draft?.serverUpdatedAt === serverVersions[exerciseId];
      result[exerciseId] = readOnly
        ? serverPayloads[exerciseId]
        : overrides[exerciseId] ??
          (draftIsCurrent ? draft.payload : null) ??
          serverPayloads[exerciseId];
    }
    return result;
  }, [draftById, exerciseIds, overrides, readOnly, serverPayloads, serverVersions]);
  const [expandedExerciseId, setExpandedExerciseId] = useState<string | null>(() =>
    initialExpandedExerciseId(
      detail.exercises.map((exercise) => ({
        id: exercise.id,
        payload: currentPayloads[exercise.id],
      })),
    ),
  );
  const appliedHydratedFocus = useRef(false);

  useLayoutEffect(() => {
    const anchor = pendingScrollAnchorRef.current;
    if (!anchor) return;
    const card = exerciseCardRefs.current.get(anchor.exerciseId);
    pendingScrollAnchorRef.current = null;
    if (!card) return;

    const delta = calculateScrollCompensation(anchor.beforeTop, card.getBoundingClientRect().top);
    if (delta !== 0) window.scrollBy(0, delta);
  }, [expandedExerciseId]);

  const staleDraftIds = useMemo(
    () =>
      new Set(
        exerciseIds.filter((exerciseId) => {
          const draft = draftById[exerciseId];
          return draft !== null && draft.serverUpdatedAt !== serverVersions[exerciseId];
        }),
      ),
    [draftById, exerciseIds, serverVersions],
  );
  const dirtyIds = useMemo(
    () =>
      new Set(
        exerciseIds.filter(
          (exerciseId) =>
            !payloadsEqual(currentPayloads[exerciseId], serverPayloads[exerciseId]),
        ),
      ),
    [currentPayloads, exerciseIds, serverPayloads],
  );
  const metadataDirty = !readOnly && !payloadsEqual(metadata, baseMetadata);
  const interactionLocked = readOnly || finishStage !== null;
  const syncingCount = Object.values(statuses).filter((status) => status.pending).length;
  const syncErrorCount = Object.values(statuses).filter((status) => status.error).length;
  const stats = completionStats(Object.values(currentPayloads));
  const progressPercent =
    stats.totalSets === 0 ? 0 : Math.round((stats.completedSets / stats.totalSets) * 100);
  const hasUnsavedWork = dirtyIds.size > 0 || metadataDirty;
  const hasRoutineAccent = !readOnly && detail.session.routine_id !== null;
  const routineAccent = hasRoutineAccent
    ? routineColorCssVariable(detail.routineColor)
    : "var(--primary)";
  const restRemaining = restTimer
    ? Math.max(0, Math.ceil((restTimer.endAt - timerNow) / 1000))
    : 0;

  useEffect(() => {
    latestPayloadsRef.current = currentPayloads;
  }, [currentPayloads]);

  useEffect(() => {
    mountedRef.current = true;
    const autosave = autosaveRef.current;
    autosave?.activate();
    return () => {
      mountedRef.current = false;
      autosave?.dispose();
    };
  }, []);

  useEffect(() => {
    if (readOnly) return;
    const autosave = autosaveRef.current;
    for (const exercise of detail.exercises) {
      autosave?.register({
        exerciseId: exercise.id,
        serverVersion: serverVersionsRef.current[exercise.id] ?? exercise.updated_at,
        serverPayload: serverPayloadsRef.current[exercise.id] ?? initialPayloads[exercise.id],
        localPayload: currentPayloads[exercise.id],
      });
    }
  }, [currentPayloads, detail.exercises, initialPayloads, readOnly]);

  useEffect(() => {
    if (readOnly) return;
    const retryWhenOnline = () => {
      void autosaveRef.current?.flushAll(exerciseIds);
    };
    window.addEventListener("online", retryWhenOnline);
    return () => window.removeEventListener("online", retryWhenOnline);
  }, [exerciseIds, readOnly]);

  useEffect(() => {
    if (appliedHydratedFocus.current) return;
    appliedHydratedFocus.current = true;

    const storedDrafts = snapshotRecord(getDraftSnapshot(draftKeys));
    const hydratedExercises = detail.exercises.map((exercise) => {
      const draft = readOnly
        ? null
        : parseWorkoutExerciseDraft(
            storedDrafts[workoutDraftKey(detail.session.id, exercise.id)] ?? null,
            exercise.id,
          );
      return {
        id: exercise.id,
        payload:
          draft?.serverUpdatedAt === serverVersions[exercise.id]
            ? draft.payload
            : serverPayloads[exercise.id],
      };
    });
    setExpandedExerciseId(initialExpandedExerciseId(hydratedExercises));
  }, [detail.exercises, detail.session.id, draftKeys, readOnly, serverPayloads, serverVersions]);

  useEffect(() => {
    if (!restTimer) return;
    setTimerNow(Date.now());
    const interval = window.setInterval(() => setTimerNow(Date.now()), 250);
    return () => window.clearInterval(interval);
  }, [restTimer]);

  useEffect(() => {
    if (readOnly) return;
    try {
      const raw = window.sessionStorage.getItem(restTimerStorageKey(detail.session.id));
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (
          typeof parsed === "object" &&
          parsed !== null &&
          typeof (parsed as RestTimerState).exerciseId === "string" &&
          typeof (parsed as RestTimerState).exerciseName === "string" &&
          typeof (parsed as RestTimerState).endAt === "number" &&
          Number.isFinite((parsed as RestTimerState).endAt) &&
          (parsed as RestTimerState).endAt > Date.now() - 60_000
        ) {
          setRestTimer(parsed as RestTimerState);
        }
      }
    } catch {
      // The rest timer remains an optional local convenience when storage is unavailable.
    } finally {
      setRestTimerHydrated(true);
    }
  }, [detail.session.id, readOnly]);

  useEffect(() => {
    if (readOnly || !restTimerHydrated) return;
    const key = restTimerStorageKey(detail.session.id);
    try {
      if (restTimer) window.sessionStorage.setItem(key, JSON.stringify(restTimer));
      else window.sessionStorage.removeItem(key);
    } catch {
      // The visual timer still works during this visit if browser storage is unavailable.
    }
  }, [detail.session.id, readOnly, restTimer, restTimerHydrated]);

  useEffect(() => {
    if (!hasUnsavedWork) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [hasUnsavedWork]);

  useEffect(() => {
    if (detail.session.status !== "completed") return;

    const key = finishConfirmationKey(detail.session.id);
    try {
      if (window.sessionStorage.getItem(key) !== "1") return;
      window.sessionStorage.removeItem(key);
      setFinishConfirmationOpen(true);
    } catch {
      // The confirmation is optional browser UI; the saved session remains correct if storage is unavailable.
    }
  }, [detail.session.id, detail.session.status]);

  function writeExerciseDraft(
    exerciseId: string,
    payload: WorkoutExercisePayload,
    serverUpdatedAt = serverVersionsRef.current[exerciseId],
  ) {
    const saved = writeDraft(workoutDraftKey(detail.session.id, exerciseId), {
      version: TRAINING_DRAFT_VERSION,
      sessionExerciseId: exerciseId,
      serverUpdatedAt,
      savedAt: new Date().toISOString(),
      payload,
    });
    if (!saved && mountedRef.current) setStorageError(true);
  }

  function updateExercise(
    exerciseId: string,
    updater: (current: WorkoutExercisePayload) => WorkoutExercisePayload,
    options?: { immediate?: boolean },
  ) {
    if (
      editingFencedRef.current ||
      removingExerciseIdsRef.current.has(exerciseId) ||
      readOnly
    ) return;
    const next = updater(latestPayloadsRef.current[exerciseId]);
    latestPayloadsRef.current = { ...latestPayloadsRef.current, [exerciseId]: next };
    setOverrides((current) => ({ ...current, [exerciseId]: next }));
    writeExerciseDraft(exerciseId, next);
    autosaveRef.current?.change(exerciseId, next, options);
  }

  function startRestTimer(exercise: WorkoutSessionClientDetail["exercises"][number]) {
    const seconds =
      validRestSeconds(exercise.rest_max_seconds_snapshot) ??
      validRestSeconds(exercise.rest_min_seconds_snapshot);
    if (seconds === null) return;
    const now = Date.now();
    setTimerNow(now);
    setRestTimer({
      exerciseId: exercise.id,
      exerciseName: exercise.nombre_snapshot,
      endAt: now + seconds * 1000,
    });
  }

  function updateRestTimer(seconds: number) {
    setRestTimer((current) =>
      current
        ? { ...current, endAt: Math.max(Date.now(), current.endAt + seconds * 1000) }
        : current,
    );
  }

  function updateMetadata(
    updater: (current: SessionMetadataInput) => SessionMetadataInput,
  ) {
    if (editingFencedRef.current || readOnly) return;
    const next = updater(metadata);
    setMetadataOverride(next);
    const saved = writeDraft(metadataKey, {
      version: TRAINING_DRAFT_VERSION,
      sessionId: detail.session.id,
      savedAt: new Date().toISOString(),
      metadata: next,
    });
    if (!saved) setStorageError(true);
  }

  async function discardExerciseDraft(exerciseId: string) {
    const autosave = autosaveRef.current;
    if (!autosave) return;
    let state: Awaited<ReturnType<typeof autosave.discardLocal>>;
    try {
      state = await autosave.discardLocal(exerciseId);
    } catch {
      return;
    }
    if (state.status !== "active") {
      router.refresh();
      return;
    }
    latestPayloadsRef.current = {
      ...latestPayloadsRef.current,
      [exerciseId]: state.payload,
    };
    setOverrides((current) => {
      const next = { ...current };
      delete next[exerciseId];
      return next;
    });
    setStatuses((current) => ({
      ...current,
      [exerciseId]: {
        pending: false,
        saved: false,
        error: null,
        errorCategory: null,
      },
    }));
    removeDraft(workoutDraftKey(detail.session.id, exerciseId));
  }

  async function retryExercise(exerciseId: string) {
    await autosaveRef.current?.retry(exerciseId);
    const category = autosaveRef.current?.getErrorCategory(exerciseId);
    if (category === "session_closed" || category === "removed") router.refresh();
  }

  function toggleExercise(exerciseId: string) {
    const previouslyExpanded = expandedExerciseId;
    if (previouslyExpanded && previouslyExpanded !== exerciseId) {
      const card = exerciseCardRefs.current.get(exerciseId);
      if (card) {
        pendingScrollAnchorRef.current = {
          exerciseId,
          beforeTop: card.getBoundingClientRect().top,
        };
      }
    } else {
      pendingScrollAnchorRef.current = null;
    }
    if (previouslyExpanded) void autosaveRef.current?.flush(previouslyExpanded);
    setEditingNoteExerciseId(null);
    setExpandedExerciseId((current) => (current === exerciseId ? null : exerciseId));
  }

  async function addExistingExercise() {
    if (!selectedLibraryExercise) return;
    setGlobalPending(true);
    setGlobalError(null);
    const result = await appendWorkoutExerciseAction({
      sessionId: detail.session.id,
      exerciseId: selectedLibraryExercise.id,
    });
    setGlobalPending(false);
    if (!result.ok) {
      setGlobalError(result.error);
      return;
    }
    setExercisePickerOpen(false);
    router.refresh();
  }

  async function removeExercise(exerciseId: string, name: string) {
    if (!window.confirm(`¿Quitar ${name} de esta sesión?`)) return;
    removingExerciseIdsRef.current.add(exerciseId);
    await autosaveRef.current?.pauseAndWait(exerciseId);
    // A conflict read-back can advance serverVersionsRef while the card still
    // displays its local override. Do not remove that unseen remote payload.
    if (autosaveRef.current?.getErrorCategory(exerciseId) === "conflict") {
      removingExerciseIdsRef.current.delete(exerciseId);
      autosaveRef.current?.resume(exerciseId);
      setGlobalError("Comprobá los cambios y usá la versión guardada antes de quitar este ejercicio.");
      return;
    }
    setStatuses((current) => ({
      ...current,
      [exerciseId]: { pending: true, saved: false, error: null },
    }));
    const formData = new FormData();
    formData.set("session_id", detail.session.id);
    formData.set("id", exerciseId);
    formData.set("expected_updated_at", serverVersionsRef.current[exerciseId]);
    try {
      await removeSessionExerciseAction(formData);
      await autosaveRef.current?.remove(exerciseId);
      removeDraft(workoutDraftKey(detail.session.id, exerciseId));
      router.refresh();
    } catch (error) {
      removingExerciseIdsRef.current.delete(exerciseId);
      autosaveRef.current?.resume(exerciseId);
      setStatuses((current) => ({
        ...current,
        [exerciseId]: {
          pending: false,
          saved: false,
          error: error instanceof Error ? error.message : "No se pudo quitar.",
        },
      }));
    }
  }

  async function finishSession() {
    if (finishInFlightRef.current) return;
    if (stats.completedSets === 0) {
      setGlobalError("Marcá al menos una serie antes de finalizar.");
      return;
    }
    finishInFlightRef.current = true;
    editingFencedRef.current = true;
    setGlobalPending(true);
    setFinishStage("saving");
    setGlobalError(null);
    await runWorkoutFinishAttempt(async () => {
    const failedExerciseIds =
      (await autosaveRef.current?.fenceAndFlushAll(exerciseIds)) ?? [];
    if (failedExerciseIds.length > 0) {
      const names = failedExerciseIds.map(
        (exerciseId) =>
          detail.exercises.find((exercise) => exercise.id === exerciseId)?.nombre_snapshot ??
          "Ejercicio",
      );
      setGlobalPending(false);
      setFinishStage(null);
      finishInFlightRef.current = false;
      editingFencedRef.current = false;
      autosaveRef.current?.releaseFence();
      const sessionUnavailable = failedExerciseIds.some((exerciseId) => {
        const category = autosaveRef.current?.getErrorCategory(exerciseId);
        return category === "session_closed" || category === "removed";
      });
      setGlobalError(
        sessionUnavailable
          ? "La sesión ya fue finalizada o modificada en otra pestaña. Actualizando…"
          : `No pudimos finalizar todavía. No se pudo guardar: ${names.join(", ")}. Reintentá cuando tengas conexión.`,
      );
      if (sessionUnavailable) router.refresh();
      return;
    }

    setFinishStage("finishing");
    let actionConfirmed = false;
    let legacyAttempted = false;
    let actionError: string | null = null;
    try {
      await feelings.refresh();
      const withFeelings = feelings.needsFinish();
      if (!feelings.getSnapshot().ready || feelings.getSnapshot().localError) throw new Error('Local feelings unavailable');
      if (withFeelings) {
        if (feelings.getSnapshot().pending?.operation === 'save' && !(await feelings.retry())) throw new Error('Pending pre feelings');
        const changed = {
          ...(metadata.performance_level !== baseMetadata.performance_level ? { performanceLevel: metadata.performance_level } : {}),
          ...(metadata.pain_level !== baseMetadata.pain_level ? { painLevel: metadata.pain_level } : {}),
          ...(metadata.notes !== baseMetadata.notes ? { notes: metadata.notes || null } : {}),
        };
        const input = await feelings.prepareFinish(changed);
        if (!input) throw new Error('Feelings need review');
        const receipt = await feelings.retry();
        actionConfirmed = receipt?.sessionStatus === 'completed' && !!(await feelings.confirmFinish());
        if (!actionConfirmed) actionError = 'No confirmamos el entrenamiento. Comprobá las sensaciones pendientes y la misma operación.';
      } else {
        legacyAttempted = true;
        const result = await finishWorkoutSessionAction({
          sessionId: detail.session.id,
          metadata: { ...metadata, energy_level: baseMetadata.energy_level },
        });
        actionConfirmed = result.ok;
        if (!result.ok) actionError = result.error;
      }
    } catch {
      actionError = "No recibimos la confirmación de la finalización.";
    }

    let verification: "completed" | "in_progress" | "unknown" = "unknown";
    if (!actionConfirmed && legacyAttempted) {
      try {
        const result = await getWorkoutSessionCompletionStateAction({
          sessionId: detail.session.id,
        });
        if (result.ok && (result.data === "completed" || result.data === "in_progress")) {
          verification = result.data;
        }
      } catch {
        verification = "unknown";
      }
    }
    const outcome = resolveWorkoutFinishOutcome(actionConfirmed, verification);
    setGlobalPending(false);
    if (outcome.status !== "confirmed_success") {
      setFinishStage(null);
      finishInFlightRef.current = false;
      editingFencedRef.current = false;
      autosaveRef.current?.releaseFence();
      setGlobalError(
        outcome.status === "confirmed_failure"
          ? actionError ?? "La finalización no se guardó. Podés volver a intentarlo."
          : "No pudimos confirmar si el entrenamiento se finalizó. Comprobá el estado antes de volver a intentarlo.",
      );
      return;
    }
    try {
      // This transient marker is consumed after the refreshed completed detail mounts.
      // Clearing it on page hide also prevents it from surviving a browser reload.
      const key = finishConfirmationKey(detail.session.id);
      const clearConfirmation = () => window.sessionStorage.removeItem(key);
      window.sessionStorage.setItem(key, "1");
      window.addEventListener("pagehide", clearConfirmation, { once: true });
    } catch {
      // Saving succeeded. Keep the existing flow functional if browser storage is unavailable.
    }
    autosaveRef.current?.dispose();
    for (const key of draftKeys) removeDraft(key);
    setRestTimer(null);
    try {
      window.sessionStorage.removeItem(restTimerStorageKey(detail.session.id));
    } catch {
      // Completion is already saved; rest timer cleanup is best-effort browser state.
    }
    router.refresh();
    return "confirmed";
    }, () => {
      setGlobalPending(false);
      setFinishStage(null);
      finishInFlightRef.current = false;
      editingFencedRef.current = false;
      autosaveRef.current?.releaseFence();
    }, () => {
      setGlobalError("No confirmamos la finalización. Los borradores y la operación pendiente se conservan; comprobá el estado antes de reintentar.");
    });
  }

  async function cancelSession() {
    if (
      !window.confirm(
        "¿Cancelar este borrador de sesión? Se eliminará la sesión en curso, pero no las rutinas ni el historial anterior.",
      )
    ) {
      return;
    }
    setGlobalPending(true);
    setGlobalError(null);
    await Promise.all(
      exerciseIds.map((exerciseId) => autosaveRef.current?.pauseAndWait(exerciseId)),
    );
    const result = await cancelWorkoutSessionAction({ sessionId: detail.session.id });
    setGlobalPending(false);
    if (!result.ok) {
      for (const exerciseId of exerciseIds) autosaveRef.current?.resume(exerciseId);
      setGlobalError(result.error);
      return;
    }
    autosaveRef.current?.dispose();
    for (const key of draftKeys) removeDraft(key);
    setRestTimer(null);
    try {
      window.sessionStorage.removeItem(restTimerStorageKey(detail.session.id));
    } catch {
      // The deleted session remains correct if local browser cleanup is unavailable.
    }
    router.replace("/train");
    router.refresh();
  }

  function confirmNavigation(event: React.MouseEvent<HTMLAnchorElement>) {
    if (
      hasUnsavedWork &&
      !window.confirm("Hay cambios guardados solo como borrador local. ¿Salir igualmente?")
    ) {
      event.preventDefault();
    }
  }

  return (
    <div className="space-y-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
      <TrainingFeelings journal={feelings} phase="pre" disabled={interactionLocked} />
      <header
        className={cn(
          "relative space-y-2 rounded-2xl border border-border/70 bg-background px-3 py-3 shadow-sm",
          hasRoutineAccent && "pl-3",
        )}
      >
        {hasRoutineAccent ? (
          <span
            className="absolute bottom-3 left-0 top-3 w-[3px] rounded-full"
            style={{ backgroundColor: routineAccent }}
            aria-hidden
          />
        ) : null}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold tracking-tight">
              {detail.session.session_name ??
                detail.session.routine_name_snapshot ??
                "Sesión libre"}
            </h1>
            <SessionTiming
              startedAt={detail.session.started_at}
              endedAt={detail.session.ended_at}
              isActive={!readOnly}
            />
          </div>
          {!readOnly && (syncErrorCount > 0 || syncingCount > 0 || metadataDirty) ? (
            <span
              className={cn(
                "mt-1 shrink-0 rounded-full px-2 py-1 text-[11px] font-medium",
                syncErrorCount > 0
                  ? "bg-destructive/10 text-destructive"
                  : "bg-primary/10 text-primary",
              )}
            >
              {syncErrorCount > 0
                ? `${syncErrorCount} sin sincronizar`
                : syncingCount > 0
                  ? "Sincronizando"
                  : "Resumen en borrador"}
            </span>
          ) : null}
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
            <span>
              <span className="metric-number font-semibold text-foreground">
                {stats.completedSets}/{stats.totalSets}
              </span>{" "}
              series · {stats.completedExercises}/{detail.exercises.length} ejercicios
            </span>
            <span className="metric-number shrink-0 font-medium text-foreground">
              {progressPercent}%
            </span>
          </div>
          <div
            className="h-1.5 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-label="Progreso del entrenamiento"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progressPercent}
          >
            <div
              className="h-full rounded-full transition-[width] duration-200 motion-reduce:transition-none"
              style={{ width: `${progressPercent}%`, backgroundColor: routineAccent }}
            />
          </div>
        </div>
        {detail.session.status === "completed" ? (
          <CompletedSessionActions
            sessionId={detail.session.id}
            sessionName={detail.session.routine_name_snapshot ?? detail.session.session_name ?? "Sesión libre"}
            dateLabel={formatSessionDate(detail.logDate)}
            timingLabel={formatWorkoutTimeRange(detail.session.started_at, detail.session.ended_at)}
            completedSets={stats.completedSets}
            returnHref={returnHref}
          />
        ) : null}
      </header>

      {storageError ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          El navegador no permitió guardar el borrador local. No cierres esta pestaña hasta
          guardar los ejercicios.
        </div>
      ) : null}

      {!readOnly ? (
        <AddExerciseSheet
          open={exercisePickerOpen}
          onOpenChange={setExercisePickerOpen}
          sessionId={detail.session.id}
          exercises={libraryExercises}
          filteredExercises={filteredLibraryExercises}
          muscleGroups={[...MUSCLE_GROUP_OPTIONS]}
          selectedMuscleGroup={selectedMuscleGroup}
          onMuscleGroupChange={setSelectedMuscleGroup}
          search={exerciseSearch}
          onSearchChange={setExerciseSearch}
          selectedExerciseId={selectedExerciseId}
          onSelectExercise={setSelectedExerciseId}
          onAddExercise={() => void addExistingExercise()}
          pending={globalPending}
        />
      ) : null}
      {quickHistoryExercise ? (
        <QuickExerciseHistorySheet
          open
          onOpenChange={(open) => {
            if (!open) setQuickHistoryExerciseId(null);
          }}
          exerciseId={quickHistoryExercise.exercise_id}
          exerciseName={quickHistoryExercise.nombre_snapshot}
          sessions={recentHistoryByExerciseId[quickHistoryExercise.exercise_id] ?? []}
        />
      ) : null}

      <section className="space-y-3">
        <div className="flex min-h-9 items-center justify-between gap-3">
          <h2 className="text-base font-semibold tracking-tight">Ejercicios</h2>
          {!readOnly ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={globalPending}
              onClick={() => setExercisePickerOpen(true)}
            >
              <Plus className="size-4" aria-hidden />
              Agregar
            </Button>
          ) : null}
        </div>
        {detail.exercises.length === 0 ? (
          <p className="text-sm text-muted-foreground">Esta sesión no tiene ejercicios.</p>
        ) : (
          detail.exercises.map((exercise) => {
            const payload = currentPayloads[exercise.id];
            const status = statuses[exercise.id];
            const dirty = dirtyIds.has(exercise.id);
            const completion = exerciseCompletion(payload);
            const expanded = expandedExerciseId === exercise.id;
            const restLabel = configuredRestLabel(
              exercise.rest_min_seconds_snapshot,
              exercise.rest_max_seconds_snapshot,
            );
            const activeRestTimer = restTimer?.exerciseId === exercise.id ? restTimer : null;
            const receivedReminder = !readOnly
              ? nextSessionReminder(
                  exercise.next_adjustment_snapshot,
                  exercise.next_adjustment_note_snapshot,
                )
              : null;
            const exerciseContentId = `session-exercise-${exercise.id}`;
            const exerciseMeta = exerciseIdentityLabel({
              grupo_muscular: exercise.grupo_muscular_snapshot,
              muscle_group_label: exercise.muscle_group_label_snapshot,
              implement: exercise.implement_snapshot,
              weight_mode: exercise.weight_mode_snapshot,
            });
            const collapsedSubtitle = exerciseMeta;
            const progressLabel = exerciseProgressLabel(payload);
            const quickNote = payload.notes.trim();
            const autosaveVisualStatus = compactAutosaveStatus({
              saved: Boolean(status?.saved),
              saving: Boolean(status?.pending),
              dirty,
              error: status?.error ?? null,
            });
            const autosaveStatusLabel = {
              idle: "Sin cambios pendientes",
              saved: "Guardado",
              saving: "Guardando cambios",
              dirty: "Cambios pendientes",
              error: "Error al guardar",
            }[autosaveVisualStatus];
            const noteLabel = exercise.routine_exercise_id
              ? "Nota para próximas sesiones"
              : "Nota del ejercicio en esta sesión";
            const noteEditorOpen = editingNoteExerciseId === exercise.id;
            return (
              <div
                key={exercise.id}
                ref={(node) => {
                  if (node) exerciseCardRefs.current.set(exercise.id, node);
                  else exerciseCardRefs.current.delete(exercise.id);
                }}
              >
                <Card
                  size="sm"
                  className={cn(
                    "relative gap-0 overflow-hidden py-0 transition-[box-shadow,border-color] duration-200 motion-reduce:transition-none",
                    expanded && "border-primary/20",
                    completion.isComplete && !expanded && "border-emerald-500/25",
                  )}
                >
                <span
                  className={cn(
                    "absolute inset-y-2.5 left-0 w-[3px] rounded-r-full transition-opacity duration-200",
                    expanded ? "opacity-100" : "opacity-55",
                  )}
                  style={{ backgroundColor: routineAccent }}
                  aria-hidden
                />
                <CardHeader className="p-0">
                  <button
                    type="button"
                    className="grid min-h-[4.75rem] w-full touch-manipulation grid-cols-[2.75rem_minmax(0,1fr)_auto] items-center gap-2.5 px-3 py-2.5 text-left outline-none transition-colors duration-150 hover:bg-muted/40 active:bg-muted/60 focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring/50"
                    aria-expanded={expanded}
                    aria-controls={exerciseContentId}
                    onClick={() => toggleExercise(exercise.id)}
                  >
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-border/75 bg-muted/45 text-primary" aria-hidden>
                      <Dumbbell className="size-4" strokeWidth={1.8} />
                    </span>
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <h3 className="truncate text-sm font-semibold tracking-tight">
                          {exercise.nombre_snapshot}
                        </h3>
                        {dirty ? (
                          <span
                            className="size-1.5 shrink-0 rounded-full bg-amber-500"
                            aria-label="Cambios sin guardar"
                          />
                        ) : null}
                      </div>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {collapsedSubtitle}
                      </p>
                      {receivedReminder ? (
                        <p className="mt-1 flex min-w-0 items-center gap-1 text-[11px] font-medium text-primary">
                          <ArrowUpRight className="size-3 shrink-0" aria-hidden />
                          <span className="truncate">{receivedReminder}</span>
                        </p>
                      ) : null}
                      {staleDraftIds.has(exercise.id) ? (
                        <p className="mt-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-300">
                          Borrador anterior sin aplicar
                        </p>
                      ) : null}
                    </div>
                    <span className="flex shrink-0 items-center gap-2" aria-label={`${progressLabel} series completadas`}>
                      <span
                        className={cn(
                          "metric-number min-w-[3.75rem] rounded-full border px-2 py-1 text-center text-xs font-medium tabular-nums",
                          completion.isComplete &&
                            "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
                        )}
                      >
                        {progressLabel}
                      </span>
                      <span
                        className={cn(
                          "flex size-5 shrink-0 items-center justify-center",
                          autosaveVisualStatus === "saved" &&
                            "text-emerald-700 dark:text-emerald-300",
                          autosaveVisualStatus === "saving" && "text-primary",
                          autosaveVisualStatus === "dirty" &&
                            "text-amber-700 dark:text-amber-300",
                          autosaveVisualStatus === "error" && "text-destructive",
                        )}
                        role="status"
                        aria-live="polite"
                        aria-label={autosaveStatusLabel}
                      >
                        {autosaveVisualStatus === "saved" ? (
                          <Check className="size-3.5" strokeWidth={2.75} aria-hidden />
                        ) : autosaveVisualStatus === "saving" ? (
                          <LoaderCircle className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden />
                        ) : autosaveVisualStatus === "dirty" ? (
                          <span className="size-1.5 rounded-full bg-current" aria-hidden />
                        ) : autosaveVisualStatus === "error" ? (
                          <X className="size-3.5" strokeWidth={2.5} aria-hidden />
                        ) : null}
                      </span>
                      <ChevronDown
                        className={cn(
                          "size-4 shrink-0 text-muted-foreground transition-transform duration-200 motion-reduce:transition-none",
                          expanded && "rotate-180",
                        )}
                        aria-hidden
                      />
                    </span>
                  </button>
                </CardHeader>
                {expanded ? (
                  <CardContent
                    id={exerciseContentId}
                    className="space-y-2.5 border-t border-border/70 px-3 pb-3 pt-2.5 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-1 motion-safe:duration-200"
                  >
                  {staleDraftIds.has(exercise.id) ? (
                    <div className="space-y-2 rounded-xl border border-amber-500/35 bg-amber-500/10 p-3 text-sm">
                      <p className="text-xs leading-relaxed">
                        Hay un borrador de una versión anterior. No se aplicó para evitar
                        sobrescribir cambios de otro dispositivo.
                      </p>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => discardExerciseDraft(exercise.id)}
                      >
                        Descartar borrador viejo
                      </Button>
                    </div>
                  ) : null}

                  <div className="flex min-h-9 items-center justify-between gap-3 px-1">
                    <h4 className="text-base font-semibold tracking-tight">Series</h4>
                    {!readOnly ? (
                      <Button
                        className="h-9 px-2 text-sm"
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={interactionLocked}
                        onClick={() => {
                          const activeElement = document.activeElement;
                          if (activeElement instanceof HTMLElement) activeElement.blur();
                          setQuickHistoryExerciseId(exercise.id);
                        }}
                      >
                        <History className="size-4" aria-hidden />
                        Últimas veces
                        <ChevronDown className="size-3.5 -rotate-90" aria-hidden />
                      </Button>
                    ) : null}
                  </div>
                  <div className="overflow-hidden rounded-lg border border-border/55 bg-background/20">
                    <div
                      className={cn(
                        "border-b border-border/50 bg-muted/15 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground",
                        SET_GRID_SHARED,
                      )}
                    >
                      <div className="flex min-w-0 items-center justify-center">#</div>
                      <div className="flex min-w-0 items-center justify-center">KG</div>
                      <div className="flex min-w-0 items-center justify-center">REPS</div>
                      <div className="flex min-w-0 items-center justify-center">RIR</div>
                      <div className="flex min-w-0 items-center justify-center" aria-label="Completada">✓</div>
                    </div>
                    {payload.sets.map((set, setIndex) => (
                      <SetRow
                        key={set.set_number}
                        exerciseId={exercise.id}
                        set={set}
                        setIndex={setIndex}
                        readOnly={interactionLocked}
                        onChange={(updater, options) =>
                          updateExercise(
                            exercise.id,
                            (current) =>
                              renumberWorkoutPayload({
                                ...current,
                                sets: current.sets.map((currentSet, currentIndex) =>
                                  currentIndex === setIndex ? updater(currentSet) : currentSet,
                                ),
                              }),
                            options,
                          )
                        }
                      />
                    ))}
                  </div>

                  {!readOnly ? (
                    <Button
                      className="h-8 w-full rounded-md border border-dashed border-primary/35 text-primary hover:bg-primary/5"
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={interactionLocked || payload.sets.length >= 50}
                      onClick={() =>
                        updateExercise(exercise.id, (current) => {
                          const previous = current.sets[current.sets.length - 1];
                          return renumberWorkoutPayload({
                            ...current,
                            sets: [
                              ...current.sets,
                              {
                                set_number: current.sets.length + 1,
                                target_reps: previous?.target_reps ?? null,
                                target_weight_kg: previous?.target_weight_kg ?? null,
                                target_rir: previous?.target_rir ?? null,
                                actual_reps: previous?.actual_reps ?? null,
                                actual_weight_kg: previous?.actual_weight_kg ?? null,
                                is_completed: false,
                                notes: null,
                              },
                            ],
                          });
                        })
                      }
                    >
                      <Plus className="size-3.5" aria-hidden />
                      Agregar serie
                    </Button>
                  ) : null}

                  {restLabel ? (
                    <div className="flex min-h-9 items-center justify-between gap-2 rounded-md border border-border/55 bg-muted/15 px-2">
                      <p className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
                        <Clock3 className="size-4 shrink-0 text-primary" aria-hidden />
                        <span className="truncate">
                          Descanso{" "}
                          <span className="metric-number font-semibold text-foreground">
                            {activeRestTimer
                              ? restRemaining > 0
                                ? timerLabel(restRemaining)
                                : "Listo"
                              : restLabel}
                          </span>
                        </span>
                      </p>
                      {!interactionLocked ? (
                        activeRestTimer ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="h-8 rounded-md px-2"
                            onClick={() => setRestTimer(null)}
                          >
                            Saltar
                          </Button>
                        ) : (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-8 rounded-md px-2.5"
                            onClick={() => startRestTimer(exercise)}
                            aria-label={`Iniciar temporizador de descanso para ${exercise.nombre_snapshot}`}
                          >
                            Iniciar
                          </Button>
                        )
                      ) : null}
                    </div>
                  ) : null}

                  {!readOnly && status?.error ? (
                    <div className="flex min-h-11 items-center justify-between gap-3 border-t border-border/60 pt-3">
                      <div className="min-w-0" aria-live="polite">
                        <p className="flex items-center gap-1.5 text-xs font-medium text-destructive">
                          <X className="size-3.5" strokeWidth={2.5} aria-hidden />
                          No se pudo guardar
                        </p>
                        <p className="mt-1 text-xs leading-snug text-destructive">
                          {status.error}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
                        {status.errorCategory === "conflict" ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => void discardExerciseDraft(exercise.id)}
                          >
                            Usar versión guardada
                          </Button>
                        ) : null}
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => void retryExercise(exercise.id)}
                        >
                          {status.errorCategory === "conflict"
                            ? "Comprobar cambios"
                            : status.errorCategory === "session_closed" ||
                                status.errorCategory === "removed"
                              ? "Actualizar"
                              : "Reintentar"}
                        </Button>
                      </div>
                    </div>
                  ) : null}

                  <section className="space-y-2.5 border-t border-border/60 pt-2.5">
                    <div className="flex min-h-8 items-center justify-between gap-3 px-1">
                      <Label>Próxima vez</Label>
                      <span className="text-xs text-muted-foreground">Opcional</span>
                    </div>
                    <div className="space-y-2.5 pb-0.5">
                      <div className="grid grid-cols-2 gap-1.5" role="group" aria-label="Decisión para la próxima vez">
                        {NEXT_SESSION_DECISIONS.map((adjustment) => (
                          <Button
                            key={adjustment.value}
                            type="button"
                            size="sm"
                            variant={payload.decision === adjustment.value ? "secondary" : "outline"}
                            className="h-9 rounded-lg"
                            disabled={interactionLocked}
                            aria-pressed={payload.decision === adjustment.value}
                            onClick={() =>
                              updateExercise(
                                exercise.id,
                                (current) => ({
                                  ...current,
                                  decision: toggleTrainingDecision(
                                    current.decision,
                                    adjustment.value,
                                  ),
                                  decision_note: "",
                                }),
                                { immediate: true },
                              )
                            }
                          >
                            {adjustment.label}
                          </Button>
                        ))}
                      </div>

                      {payload.decision === "custom" ? (
                        <div className="space-y-2 border-l-2 border-primary/35 pl-3">
                          <div>
                            <p className="text-xs font-medium text-primary">
                              Recordatorio anterior
                            </p>
                            <p className="mt-1 break-words text-sm">
                              {payload.decision_note}
                            </p>
                          </div>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={interactionLocked}
                            onClick={() =>
                              updateExercise(
                                exercise.id,
                                (current) => ({
                                  ...current,
                                  decision: toggleTrainingDecision(
                                    current.decision,
                                    "maintain",
                                  ),
                                  decision_note: "",
                                }),
                                { immediate: true },
                              )
                            }
                          >
                            Quitar
                          </Button>
                        </div>
                      ) : null}

                      {exercise.routine_exercise_id ? (
                        <div
                          className={cn(
                            "flex min-h-14 items-center gap-3 rounded-lg border px-2.5 py-2 text-sm transition-colors",
                            payload.apply_to_routine
                              ? "border-primary/40 bg-primary/5"
                              : "border-border/75 bg-background/35 hover:bg-muted/35",
                          )}
                        >
                          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary" aria-hidden>
                            <Target className="size-4" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block font-medium">Tomar resultado de hoy</span>
                            <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                              Usa las series completadas como base.
                            </span>
                          </span>
                          <button
                            type="button"
                            role="switch"
                            aria-label="Tomar resultado de hoy"
                            aria-checked={payload.apply_to_routine}
                            disabled={interactionLocked}
                            className={cn(
                              "relative flex h-7 w-12 shrink-0 touch-manipulation items-center rounded-full p-0.5 outline-none transition-colors duration-200 focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-60",
                              payload.apply_to_routine ? "bg-primary" : "bg-muted-foreground/35",
                            )}
                            onClick={() =>
                              updateExercise(
                                exercise.id,
                                (current) => ({
                                  ...current,
                                  apply_to_routine: !current.apply_to_routine,
                                }),
                                { immediate: true },
                              )
                            }
                          >
                          <span
                            className={cn(
                              "size-6 rounded-full bg-white shadow-sm transition-transform duration-200",
                              payload.apply_to_routine
                                ? "translate-x-5"
                                : "translate-x-0",
                            )}
                            aria-hidden
                          />
                          </button>
                        </div>
                      ) : null}

                      <div className={cn(
                        "rounded-lg border border-border/60 bg-muted/15 px-2.5",
                        noteEditorOpen || quickNote ? "space-y-2 py-2" : "py-1.5",
                      )}>
                        <div className="flex min-h-8 items-center justify-between gap-3">
                          {noteEditorOpen ? (
                            <Label htmlFor={`exercise-notes-${exercise.id}`}>{noteLabel}</Label>
                          ) : (
                          <p className="flex items-center gap-2 text-sm font-medium">
                            <FileText className="size-4 text-primary" aria-hidden />
                            {noteLabel}
                          </p>
                          )}
                          {!readOnly ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              disabled={interactionLocked}
                              aria-expanded={noteEditorOpen}
                              aria-controls={`exercise-notes-${exercise.id}`}
                              onClick={() =>
                                setEditingNoteExerciseId(noteEditorOpen ? null : exercise.id)
                              }
                            >
                              {noteEditorOpen ? "Listo" : quickNote ? "Editar" : "Agregar"}
                            </Button>
                          ) : null}
                        </div>
                        {noteEditorOpen ? (
                          <textarea
                            id={`exercise-notes-${exercise.id}`}
                            aria-label={`Nota para ${exercise.nombre_snapshot}`}
                            className="min-h-20 w-full rounded-lg border bg-background px-3 py-2 text-sm disabled:opacity-60"
                            value={payload.notes}
                            disabled={interactionLocked}
                            placeholder="Opcional"
                            onChange={(event) =>
                              updateExercise(exercise.id, (current) => ({
                                ...current,
                                notes: event.target.value,
                              }))
                            }
                          />
                        ) : quickNote ? (
                          <p
                            className="line-clamp-1 text-sm text-muted-foreground"
                          >
                            {quickNote}
                          </p>
                        ) : null}
                      </div>
                      <WebExerciseVariant
                        journal={configurations}
                        sessionExerciseId={exercise.id}
                        name={exercise.nombre_snapshot}
                        editable={detail.session.status !== "discarded"}
                        completed={detail.session.status === "completed"}
                      />
                    </div>
                  </section>

                  {!readOnly ? (
                    <details className="group rounded-xl border border-transparent">
                      <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between rounded-xl px-3 text-xs font-medium text-muted-foreground outline-none transition-colors hover:bg-muted/40 focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
                        Más opciones del ejercicio
                        <ChevronDown className="size-3.5 transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none" aria-hidden />
                      </summary>
                      <div className="grid gap-2 px-3 pb-3 pt-1 sm:grid-cols-2">
                        {dirty ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={globalPending}
                            onClick={() => void discardExerciseDraft(exercise.id)}
                          >
                            Descartar cambios
                          </Button>
                        ) : null}
                        <Button
                          type="button"
                          size="sm"
                          variant="destructive"
                          disabled={globalPending}
                          onClick={() => void removeExercise(exercise.id, exercise.nombre_snapshot)}
                        >
                          Quitar de la sesión
                        </Button>
                      </div>
                    </details>
                  ) : null}
                  </CardContent>
                ) : null}
                </Card>
              </div>
            );
          })
        )}
      </section>

      <Card size="sm" className="gap-0 py-0">
        <details className="group">
          <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-3 outline-none transition-colors hover:bg-muted/40 focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
            <span className="flex min-w-0 items-center gap-2">
              <CardTitle className="text-sm">Resumen de la sesión</CardTitle>
              {metadataDirty ? (
                <span className="size-1.5 shrink-0 rounded-full bg-amber-500" aria-label="Resumen con cambios" />
              ) : null}
            </span>
            <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none" aria-hidden />
          </summary>
          <CardContent className="border-t border-border/70 px-3 pb-3 pt-3">
          <fieldset className="space-y-3.5 disabled:opacity-80" disabled={interactionLocked}>
          <TrainingFeelings journal={feelings} phase="post" disabled={interactionLocked} />
          {readOnly && metadata.energy_level !== null ? <p>Energía registrada (histórica): {metadata.energy_level} / 5</p> : null}
          <RatingPicker
            label="Rendimiento"
            value={metadata.performance_level}
            minimum={1}
            maximum={5}
            disabled={interactionLocked}
            onChange={(value) => updateMetadata((current) => ({ ...current, performance_level: value }))}
          />
          <PainSlider
            value={metadata.pain_level}
            disabled={interactionLocked}
            onChange={(value) => updateMetadata((current) => ({ ...current, pain_level: value }))}
          />
          <div className="space-y-1">
            <Label htmlFor="session-notes">Notas</Label>
            <textarea
              id="session-notes"
              className="min-h-24 w-full rounded-lg border bg-background px-3 py-2 text-sm disabled:opacity-60"
              value={metadata.notes}
              disabled={readOnly}
              placeholder="¿Cómo te sentiste? Algo para recordar para la próxima sesión…"
              onChange={(event) =>
                updateMetadata((current) => ({ ...current, notes: event.target.value }))
              }
            />
          </div>
          {!readOnly && metadataDirty ? (
            <div className="flex justify-end">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  setMetadataOverride(null);
                  removeDraft(metadataKey);
                }}
              >
                Descartar
              </Button>
            </div>
          ) : null}
          </fieldset>
          </CardContent>
        </details>
      </Card>

      {!readOnly ? (
        <div className="space-y-3">
          <Button
            className="h-12 w-full"
            type="button"
            disabled={globalPending || stats.completedSets === 0}
            onClick={() => void finishSession()}
          >
            {finishStage ? "Finalizando…" : "Finalizar entrenamiento"}
          </Button>
          {finishStage ? (
          <p className="text-xs text-muted-foreground" aria-live="polite">
            {finishStage === "saving"
              ? "Guardando los últimos cambios antes de cerrar la sesión…"
              : finishStage === "finishing"
                ? "Todos los ejercicios están sincronizados. Cerrando la sesión…"
                : null}
          </p>
          ) : null}
          <Link
            href="/train"
            className={cn(buttonVariants({ variant: "outline" }), "h-11 w-full")}
            onClick={confirmNavigation}
          >
            Volver a Entrenar
          </Link>
          <div aria-live="polite">
            {globalError ? <p className="text-sm text-destructive">{globalError}</p> : null}
          </div>
          <details className="group relative rounded-xl border border-border/80 px-3 py-2">
            <span
              className="pointer-events-none absolute bottom-2.5 left-3 top-2.5 w-[3px] rounded-full bg-destructive/80"
              aria-hidden
            />
            <summary className="-mx-1 flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-lg py-1 pl-4 pr-2 text-sm font-medium outline-none transition-[background-color,color] duration-150 hover:bg-muted/70 focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
              Más opciones
              <ChevronDown className="size-4 shrink-0 transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none" aria-hidden />
            </summary>
            <div className="space-y-2 pb-1 pl-4 pt-2 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-1">
              <Button
                className="h-11 w-full"
                type="button"
                variant="destructive"
                disabled={globalPending}
                onClick={() => void cancelSession()}
              >
                Cancelar entrenamiento
              </Button>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Elimina solo esta sesión en curso; no toca la rutina ni el historial.
              </p>
            </div>
          </details>
        </div>
      ) : (
        <div className="rounded-xl border bg-muted/30 p-3 text-sm">
          Sesión finalizada. El historial está en modo lectura.
        </div>
      )}

      {readOnly && globalError ? (
        <div aria-live="polite">
          <p className="text-sm text-destructive">{globalError}</p>
        </div>
      ) : null}

      <WorkoutFinishedDialog
        open={finishConfirmationOpen}
        onOpenChange={setFinishConfirmationOpen}
        sessionName={
          detail.session.routine_name_snapshot ?? detail.session.session_name ?? "Sesión libre"
        }
        duration={formatWorkoutDuration(
          getWorkoutElapsedMilliseconds(detail.session.started_at, detail.session.ended_at),
        )}
        completedSets={stats.completedSets}
        completedExercises={stats.completedExercises}
      />

      {readOnly ? (
        <Link
          href={returnHref ?? "/train"}
          className={cn(buttonVariants({ variant: "outline" }), "h-11 w-full")}
        >
          {returnLabel ?? "Volver a Entrenar"}
        </Link>
      ) : null}

      {restTimer && !readOnly ? (
        <aside
          className="fixed inset-x-3 bottom-[calc(5.65rem+env(safe-area-inset-bottom))] z-40 mx-auto max-w-[406px] rounded-2xl border border-primary/25 bg-card/95 px-3 py-2.5 shadow-xl shadow-black/15 backdrop-blur-xl"
          aria-live="polite"
          aria-label="Temporizador de descanso"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary">
                <Clock3 className="size-4" aria-hidden />
              </span>
              <div className="min-w-0">
                <p className="truncate text-xs text-muted-foreground">Descanso · {restTimer.exerciseName}</p>
                <p className="metric-number text-lg font-semibold tracking-tight text-primary">
                  {restRemaining > 0 ? timerLabel(restRemaining) : "Listo"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button type="button" size="icon-sm" variant="ghost" aria-label="Restar 15 segundos" onClick={() => updateRestTimer(-15)}>
                <Minus aria-hidden />
              </Button>
              <Button type="button" size="icon-sm" variant="ghost" aria-label="Sumar 15 segundos" onClick={() => updateRestTimer(15)}>
                <Plus aria-hidden />
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => setRestTimer(null)}>
                Saltar
              </Button>
            </div>
          </div>
        </aside>
      ) : null}
    </div>
  );
}
