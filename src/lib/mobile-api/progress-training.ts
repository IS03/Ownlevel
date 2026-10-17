import "server-only";
import { loadCompletedTrainingData } from "@/lib/phase2/training-robust";
import { listRoutines } from "@/lib/phase2/training";
import { buildTrainingAnalysis, type TrainingAnalysis, type TrainingAnalysisSource } from "@/lib/phase2/training-analysis";
import { TRAINING_PROGRESS_METRICS } from "@/lib/progress/analytics";
import { buildProgressComparison, type ProgressComparisonReport, type ProgressTemporalComparisonReference } from "@/lib/progress/comparisons";
import {
  compareTrainingExercisePerformance, buildTrainingGeneralAnalytics, buildTrainingLoadComparison, trainingLoadSamples, trainingPerformanceStrategy,
  type TrainingExercisePerformance, type TrainingGeneralAnalytics,
} from "@/lib/progress/training-performance";
import { buildTrainingExercisesAnalytics, type TrainingExerciseDetailAnalytics } from "@/lib/progress/training-exercises";
import type { AuthenticatedRequestContext } from "@/lib/supabase/server";
import type {
  ProgressComparison, ProgressPeriod, ProgressTraining, ProgressTrainingExercise, ProgressTrainingExerciseDetail, ProgressTrainingSummary, ProgressTrainingInPeriod, ProgressExerciseCharts, ProgressExercisePoint,
} from "./progress-contract";

type CompareDto = (result: ProgressComparisonReport["results"][number] | undefined) => ProgressComparison;

/** Reliable load metrics only. Global volume mixes non-comparable weight modes and is never used. */
const LOAD_KEYS = ["training.load.sessions", "training.load.sets", "training.load.duration", "training.load.sets_per_session"] as const;

export type TrainingContext = {
  source: TrainingAnalysisSource; current: TrainingAnalysis; reference: TrainingAnalysis;
  referenceDefinition: ProgressTemporalComparisonReference; general: TrainingGeneralAnalytics;
};

/** ONE historical read (paged loader) shared by summary, exercises, muscles, routines and feelings. */
export async function loadTrainingContext(auth: AuthenticatedRequestContext, period: ProgressPeriod, today: string): Promise<TrainingContext> {
  const [source, routines] = await Promise.all([loadCompletedTrainingData(auth), listRoutines({ includeArchived: true }, auth)]);
  const range = { start: period.start, end: period.end };
  const previous = { start: period.previousStart, end: period.previousEnd };
  const current = buildTrainingAnalysis(source, { today, period: "custom", routines, range });
  const reference = buildTrainingAnalysis(source, { today: previous.end, period: "custom", routines, range: previous });
  const referenceDefinition: ProgressTemporalComparisonReference = { type: "previous_period", period: previous, label: "Período anterior" };
  const general = buildTrainingGeneralAnalytics({ source, primary: current, reference, referenceDefinition });
  return { source, current, reference, referenceDefinition, general };
}

const byKey = (report: ProgressComparisonReport, key: string) => report.results.find(result => result.metric.key === key);

/** Training days: the engine's own session samples, one per distinct date (zero when nothing was trained). */
function trainingDaysComparison(ctx: TrainingContext) {
  const sessionsMetric = TRAINING_PROGRESS_METRICS.find(metric => metric.key === "training.load.sessions")!;
  const daysMetric = { ...sessionsMetric, key: "training.load.days", label: "Días entrenados", unit: "días" };
  const dates = [...new Set((trainingLoadSamples(ctx.source).get("training.load.sessions") ?? []).map(sample => sample.date))];
  return buildProgressComparison({
    metrics: [daysMetric], samplesByMetric: new Map([[daysMetric.key, dates.map(date => ({ date, value: 1 }))]]),
    primaryPeriod: ctx.current.range, primaryLabel: ctx.current.range.label, reference: ctx.referenceDefinition,
  });
}

export function trainingSummaryDto(ctx: TrainingContext, period: ProgressPeriod, compare: CompareDto): ProgressTrainingSummary {
  const load = buildTrainingLoadComparison({ source: ctx.source, primary: ctx.current, reference: ctx.reference,
    referenceDefinition: ctx.referenceDefinition, metricKeys: LOAD_KEYS });
  const days = trainingDaysComparison(ctx);
  const s = ctx.current.summary, perf = ctx.general.performance.summary;
  const trainingDays = days.results[0]?.valueA ?? 0;
  return {
    sessions: s.sessions, trainingDays, sets: s.sets, minutes: s.minutes,
    // A weekly rate only means something over at least two weeks.
    sessionsPerWeek: period.days >= 14 ? Math.round(s.sessions * 7 / period.days * 10) / 10 : null,
    comparisons: {
      sessions: compare(byKey(load, "training.load.sessions")), trainingDays: compare(days.results[0]),
      sets: compare(byKey(load, "training.load.sets")), minutes: compare(byKey(load, "training.load.duration")),
      setsPerSession: compare(byKey(load, "training.load.sets_per_session")),
    },
    performance: { improved: perf.improved, stable: perf.stable, declined: perf.declined, comparable: perf.comparable, insufficient: perf.insufficient, headline: perf.headline },
  };
}

function exerciseDto(item: TrainingExercisePerformance, stats: TrainingAnalysis["exercises"][number] | undefined): ProgressTrainingExercise {
  return {
    id: item.exerciseId, name: stats?.name ?? item.name, muscleLabel: stats?.muscleLabel ?? item.muscleLabel, weightMode: item.weightMode,
    status: item.status, reason: item.reason, signal: item.status === "insufficient_data" ? null : item.signal, isPersonalRecord: item.isPersonalRecord,
    sessions: stats?.sessions ?? 0, sets: stats?.sets ?? 0, lastDate: stats?.lastDate ?? null,
  };
}

export function trainingDto(ctx: TrainingContext, today: string, period: ProgressPeriod, compare: CompareDto): ProgressTraining {
  const statsById = new Map(ctx.current.exercises.map(exercise => [exercise.id, exercise]));
  const performance = ctx.general.performance.exercises;
  return {
    today, period, summary: trainingSummaryDto(ctx, period, compare),
    series: ctx.current.timeline.map(point => ({ start: point.start, end: point.end, sessions: point.sessions, sets: point.sets, minutes: point.minutes })),
    // Trained in the period first (most sessions), then exercises only present in the previous period.
    exercises: performance.map(item => exerciseDto(item, statsById.get(item.exerciseId)))
      .sort((a, b) => Number(b.sessions > 0) - Number(a.sessions > 0) || b.sessions - a.sessions || a.name.localeCompare(b.name, "es-AR")),
    personalRecords: performance.filter(item => item.isPersonalRecord && item.signal).map(item => ({ exerciseId: item.exerciseId, name: item.name, description: item.signal!.description })),
    feelings: ctx.general.feelings.map(f => ({ key: f.key, label: f.label, average: f.average, scaleMaximum: f.scaleMaximum,
      registered: f.registeredCount, eligible: f.eligibleCount, ratio: f.coverageRatio })),
    muscles: ctx.current.muscles.filter(m => m.summary.hasData).map(m => ({ key: m.key, label: m.label, sets: m.summary.sets, sessions: m.summary.sessions, exercises: m.summary.exerciseCount })),
    routines: ctx.current.routines.filter(r => r.summary.hasData).map(r => ({ id: r.id, name: r.name, sessions: r.summary.sessions, sets: r.summary.sets, minutes: r.summary.minutes })),
  };
}

/** Exercise analytics: existing read model, with optional mode-compatible session charts. */
export function trainingExerciseDto(ctx: TrainingContext, exerciseId: string, today: string, period: ProgressPeriod, compare: CompareDto, withCharts = false, comparing = false): ProgressTrainingExerciseDetail | null {
  const analytics = buildTrainingExercisesAnalytics({ source: ctx.source, primary: ctx.current, reference: ctx.reference,
    referenceDefinition: ctx.referenceDefinition, selectedExerciseId: exerciseId });
  const item = analytics.exercises.find(exercise => exercise.id === exerciseId);
  const selected = analytics.selected;
  if (!item || !selected) return null;
  const load = buildTrainingLoadComparison({ source: ctx.source, primary: ctx.current, reference: ctx.reference, referenceDefinition: ctx.referenceDefinition,
    scope: { exerciseId }, metricKeys: ["training.load.sessions", "training.load.sets"] });
  const strategy = trainingPerformanceStrategy(selected.weightMode);
  const unit = strategy === "unit_reps" ? "lingotes" as const : strategy === "time" ? "s" as const : strategy === "bodyweight_reps" ? "reps" as const : "kg" as const;
  // One point per session, with the validated semantics of the mode; unsupported modes get no chart.
  const points = strategy === "unsupported" ? [] : [...selected.currentSessions].reverse().flatMap(session => {
    const sets = session.sets.filter(set => set.is_completed && (set.actual_reps ?? 0) > 0);
    if (strategy === "load_reps" || strategy === "unit_reps") {
      const loaded = sets.filter(set => (set.actual_weight_kg ?? 0) > 0);
      const best = loaded.sort((a, b) => b.actual_weight_kg! - a.actual_weight_kg! || b.actual_reps! - a.actual_reps!)[0];
      return best ? [{ date: session.logDate, sessionId: session.sessionId, value: best.actual_weight_kg!, context: best.actual_reps }] : [];
    }
    const pool = strategy === "bodyweight_reps" ? sets.filter(set => !set.actual_weight_kg) : sets;
    const best = pool.sort((a, b) => b.actual_reps! - a.actual_reps!)[0];
    return best ? [{ date: session.logDate, sessionId: session.sessionId, value: best.actual_reps!, context: null }] : [];
  });
  const p = selected.performance;
  return {
    today, period,
    ...(withCharts ? { charts: exerciseCharts(selected, comparing) } : {}),
    exercise: { id: exerciseId, name: item.name, muscleLabel: item.muscleLabel, weightMode: selected.weightMode },
    performance: { status: p.status, reason: p.reason, signal: p.status === "insufficient_data" ? null : p.signal, isPersonalRecord: p.isPersonalRecord,
      primarySamples: p.primarySampleSize, referenceSamples: p.referenceSampleSize },
    comparisons: { sessions: compare(byKey(load, "training.load.sessions")), sets: compare(byKey(load, "training.load.sets")) },
    marks: selected.marks.flatMap(mark => mark.kind === "best_volume" ? [] : [{ kind: mark.kind, label: mark.label, value: mark.value, unit: mark.unit, context: mark.context, date: mark.logDate }]),
    chart: strategy === "unsupported" ? null : { kind: strategy === "time" ? "time" : strategy === "bodyweight_reps" ? "reps" : "load", unit, points },
    sessions: selected.currentSessions.map(session => ({ sessionId: session.sessionId, date: session.logDate, routineName: session.routineName,
      sets: session.sets.filter(set => set.is_completed).map(set => ({ reps: set.actual_reps, weightKg: set.actual_weight_kg })) })),
  };
}

/** Derived measures use the already loaded session snapshots; unknown/incompatible modes remain gaps. */
export function exerciseCharts(selected: TrainingExerciseDetailAnalytics, comparing: boolean): ProgressExerciseCharts {
  const strategy = trainingPerformanceStrategy(selected.weightMode);
  const unit = strategy === "unit_reps" ? "lingotes" : strategy === "time" ? "s" : strategy === "bodyweight_reps" ? "reps" : "kg";
  const definitions: { key: ProgressExerciseCharts["measures"][number]["key"]; label: string }[] = strategy === "load_reps"
    ? [{ key: "estimated_1rm", label: "1RM estimado" }, { key: "best_set", label: "Mejor serie" }, { key: "volume", label: "Volumen" }]
    : strategy === "unit_reps" ? [{ key: "best_set", label: "Mejor serie" }, { key: "volume", label: "Volumen" }]
    : strategy === "bodyweight_reps" ? [{ key: "best_set", label: "Mejor serie" }, { key: "total_reps", label: "Repeticiones totales" }]
    : strategy === "time" ? [{ key: "best_time", label: "Mejor tiempo" }, { key: "total_time", label: "Tiempo total" }] : [];
  const normalize = (v: string | null | undefined) => v?.trim().replace(/\s+/g, " ").toLocaleLowerCase("es-AR") ?? null;
  const buildPoints = (sessions: TrainingExerciseDetailAnalytics["currentSessions"], key: ProgressExerciseCharts["measures"][number]["key"]): ProgressExercisePoint[] => {
    // Repeated blocks of the same exercise in one session still produce a single point.
    const grouped = new Map<string, TrainingExerciseDetailAnalytics["currentSessions"][number]>();
    for (const session of sessions) {
      if (normalize(session.weightMode) !== normalize(selected.weightMode)) continue;
      const previous = grouped.get(session.sessionId);
      grouped.set(session.sessionId, previous ? { ...session, sets: [...previous.sets, ...session.sets] } : session);
    }
    return [...grouped.values()].sort((a, b) => a.logDate.localeCompare(b.logDate) || (a.completedAt ?? "").localeCompare(b.completedAt ?? "") || a.sessionId.localeCompare(b.sessionId)).flatMap(session => {
      const sets = session.sets.filter(s => s.is_completed && typeof s.actual_reps === "number" && Number.isFinite(s.actual_reps) && s.actual_reps > 0)
        .filter(s => strategy === "load_reps" || strategy === "unit_reps" ? typeof s.actual_weight_kg === "number" && Number.isFinite(s.actual_weight_kg) && s.actual_weight_kg > 0
          : strategy !== "bodyweight_reps" || !s.actual_weight_kg);
      if (!sets.length) return [];
      let value: number, best: ProgressExercisePoint["best"] = null;
      if (key === "volume") value = sets.reduce((sum, s) => sum + s.actual_reps! * s.actual_weight_kg!, 0);
      else if (key === "total_reps" || key === "total_time") value = sets.reduce((sum, s) => sum + s.actual_reps!, 0); // Time is stored in actual_reps, in seconds.
      else {
        const candidates = key === "estimated_1rm" ? sets.filter(s => s.actual_reps! <= 12) : sets;
        const score = (s: typeof sets[number]) => key === "estimated_1rm" ? s.actual_weight_kg! * (1 + s.actual_reps! / 30)
          : strategy === "load_reps" || strategy === "unit_reps" ? s.actual_weight_kg! : s.actual_reps!;
        const winner = [...candidates].sort((a, b) => score(b) - score(a) || b.actual_reps! - a.actual_reps!)[0];
        if (!winner) return [];
        value = key === "estimated_1rm" ? Math.round(score(winner) * 2) / 2 : score(winner);
        best = { reps: winner.actual_reps!, weightKg: winner.actual_weight_kg };
      }
      return Number.isFinite(value) && value > 0 ? [{ date: session.logDate, sessionId: session.sessionId, value, best }] : [];
    });
  };
  return { strategy, measures: definitions.map(({ key, label }) => ({ key, label, unit, derived: key === "estimated_1rm",
    points: buildPoints(selected.currentSessions, key), reference: comparing ? buildPoints(selected.referenceSessions, key) : null })) };
}

/** First and last completed SESSION per exercise, using the existing read and comparison engine. */
export function trainingInPeriodDto(ctx: TrainingContext, period: ProgressPeriod): ProgressTrainingInPeriod {
  type Snapshot = NonNullable<Parameters<typeof compareTrainingExercisePerformance>[0]["primary"]>;
  const sessions = new Map(ctx.source.sessions.filter(s => s.status === "completed" && s.ended_at).flatMap(s => {
    const date = ctx.source.dateByDayLog.get(s.day_log_id);
    return date && date >= period.start && date <= period.end ? [[s.id, { date, startedAt: s.started_at, endedAt: s.ended_at! }] as const] : [];
  }));
  const sets = new Map<string, Snapshot["sets"]>();
  for (const set of ctx.source.sets) {
    if (!set.is_completed || typeof set.actual_reps !== "number" || !Number.isFinite(set.actual_reps) || set.actual_reps <= 0) continue;
    const rows = sets.get(set.workout_session_exercise_id) ?? [];
    rows.push({ reps: set.actual_reps, load: typeof set.actual_weight_kg === "number" && Number.isFinite(set.actual_weight_kg) ? set.actual_weight_kg : null, date: "" });
    sets.set(set.workout_session_exercise_id, rows);
  }
  const stats = new Map(ctx.current.exercises.map(e => [e.id, e]));
  const grouped = new Map<string, Map<string, Snapshot>>();
  for (const e of ctx.source.sessionExercises) {
    const session = sessions.get(e.workout_session_id);
    if (!session || !e.is_completed) continue;
    const mode = e.weight_mode_snapshot?.trim() || null;
    const normalizedMode = mode?.replace(/\s+/g, " ").toLocaleLowerCase("es-AR") || null;
    const bySession = grouped.get(e.exercise_id) ?? new Map<string, Snapshot>();
    const previous = bySession.get(e.workout_session_id);
    const snapshot: Snapshot = { exerciseId: e.exercise_id, name: e.nombre_snapshot, muscleKey: e.grupo_muscular_snapshot ?? "unassigned", muscleLabel: stats.get(e.exercise_id)?.muscleLabel ?? "Sin grupo", mode, normalizedMode,
      sets: (sets.get(e.id) ?? []).map(s => ({ ...s, date: session.date })) };
    // Repeated exercise blocks in one session form one snapshot; mixed modes stay non-comparable.
    if (previous) { snapshot.sets = [...previous.sets, ...snapshot.sets]; if (previous.normalizedMode !== normalizedMode) snapshot.normalizedMode = "__multiple__"; }
    bySession.set(e.workout_session_id, snapshot); grouped.set(e.exercise_id, bySession);
  }
  const exercises: ProgressTrainingInPeriod["exercises"] = [];
  for (const [id, bySession] of grouped) {
    // A block without valid sets says nothing about performance: it is never the "first" or "last" session.
    // (Its session count may differ from the summary's, which counts any completed set; the parser only checks the id.)
    const ordered = [...bySession].filter(([, snapshot]) => snapshot.sets.length > 0).sort(([a], [b]) => {
      const x = sessions.get(a)!, y = sessions.get(b)!;
      return x.date.localeCompare(y.date) || x.startedAt.localeCompare(y.startedAt) || x.endedAt.localeCompare(y.endedAt) || a.localeCompare(b);
    });
    if (ordered.length < 2) continue;
    const [firstId, first] = ordered[0], [lastId, last] = ordered[ordered.length - 1];
    const result = compareTrainingExercisePerformance({ primary: last, reference: first });
    if (result) exercises.push({ id, status: result.status, reason: result.reason, sessions: ordered.length, firstDate: sessions.get(firstId)!.date, lastDate: sessions.get(lastId)!.date, signal: result.signal });
  }
  const count = (status: string) => exercises.filter(e => e.status === status).length;
  return { improved: count("improved"), stable: count("stable"), declined: count("declined"), insufficient: count("insufficient_data"), exercises };
}
