"use client";

import Link from "next/link";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

import { ComparisonConfigurator } from "@/components/progress/comparison-configurator";
import { ComparisonEvolution } from "@/components/progress/comparison-evolution";
import type { TrainingAnalysis } from "@/lib/phase2/training-analysis";
import {
  trainingAnalysisComparisonPath,
  trainingAnalysisExercisePath,
  trainingAnalysisWorkspacePath,
  type TrainingAnalysisNavigationState,
} from "@/lib/phase2/training-analysis-navigation";
import { formatProgressMetricValue, type ProgressPeriodPreset } from "@/lib/progress/analytics";
import {
  comparisonInsufficientMessage,
  type ProgressComparisonQuery,
  type ProgressComparisonReport,
  type ProgressTemporalComparisonReference,
} from "@/lib/progress/comparisons";
import type {
  TrainingExercisePerformance,
  TrainingPerformanceStatus,
} from "@/lib/progress/training-performance";
import type {
  TrainingRoutineDetailAnalytics,
  TrainingRoutineListItem,
  TrainingRoutinesAnalytics,
} from "@/lib/progress/training-routines";
import { cn } from "@/lib/utils";

const LOAD_METRIC_OPTIONS = [
  { key: "training.load.sessions", label: "Sesiones", supportsGoal: false },
  { key: "training.load.sets", label: "Series", supportsGoal: false },
  { key: "training.load.duration", label: "Duración", supportsGoal: false },
  { key: "training.load.volume", label: "Volumen", supportsGoal: false },
];

const EVOLUTION_METRIC_KEYS = new Set([
  "training.load.volume",
  "training.load.sets",
  "training.load.duration",
]);

const statusMeta: Record<TrainingPerformanceStatus, { label: string; className: string }> = {
  improved: { label: "Mejoró", className: "text-primary" },
  declined: { label: "Bajó", className: "text-foreground" },
  stable: { label: "Sin cambio claro", className: "text-muted-foreground" },
  insufficient_data: { label: "Sin suficiente comparación", className: "text-muted-foreground" },
};

function insufficientDescription(item: TrainingExercisePerformance) {
  if (item.reason === "new_exercise") return "No existe un baseline en el período comparado";
  if (item.reason === "not_trained_in_primary") return "No tuvo registros en el período principal";
  if (item.reason === "different_weight_mode") return "Cambió la forma de registrar la carga";
  if (item.reason === "missing_weight_mode") return "Falta definir cómo se registra la carga";
  if (item.reason === "unsupported_weight_mode") return "Este modo todavía no admite comparación directa";
  if (item.reason === "incomplete_sets") return "Faltan series completas comparables";
  if (item.reason === "missing_implement") return "Falta el implemento en alguna de las sesiones";
  if (item.reason === "different_implement") return "Cambió el implemento usado";
  if (item.reason === "unknown_configuration") return "Falta la variante en alguna de las sesiones";
  if (item.reason === "different_configuration") return "Cambió la variante del ejercicio";
  if (item.reason === "mixed_configuration") return "Hubo más de una variante en el mismo período";
  return "La evidencia disponible no permite una conclusión";
}

function routinePerformanceLabel(item: TrainingRoutineListItem) {
  const summary = item.performance.summary;
  return summary.comparable
    ? `${summary.improved} de ${summary.comparable} comparables mejoraron`
    : "Sin suficiente comparación";
}

function RoutineList({ analytics, analysis }: { analytics: TrainingRoutinesAnalytics; analysis: TrainingAnalysis }) {
  const searchParams = useSearchParams();
  const routineHref = (routineId: string) => {
    const next = new URLSearchParams(searchParams.toString());
    next.set("view", "routines");
    next.set("period", analysis.period);
    next.set("routine", routineId);
    next.delete("compare");
    next.delete("a");
    next.delete("b");
    return `/train/progress?${next.toString()}`;
  };

  return <section className="space-y-3" aria-labelledby="routine-list-title">
    <div><h2 id="routine-list-title" className="text-lg font-semibold tracking-tight">Rutinas del período</h2><p className="mt-1 text-sm text-muted-foreground">Progreso basado sólo en ejercicios comparables de la misma rutina.</p></div>
    {analytics.routines.length === 0 ? <div className="rounded-xl border border-dashed px-4 py-7 text-center text-sm text-muted-foreground">No hay rutinas con sesiones finalizadas en este período.</div> : <div className="divide-y">
      {analytics.routines.map((routine) => <Link key={routine.id} href={routineHref(routine.id)} className="group flex min-h-[72px] items-center gap-3 py-3 outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2"><span className="truncate text-sm font-semibold">{routine.name}</span>{!routine.isActive ? <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">Histórica</span> : null}</span>
          <span className="mt-0.5 block text-xs text-muted-foreground">{routine.sessions} {routine.sessions === 1 ? "sesión" : "sesiones"} · {routine.exerciseCount} {routine.exerciseCount === 1 ? "ejercicio" : "ejercicios"}</span>
          <span className={cn("mt-1 block text-xs font-medium", routine.performance.summary.comparable ? "text-primary" : "text-muted-foreground")}>{routinePerformanceLabel(routine)}</span>
        </span>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden />
      </Link>)}
    </div>}
  </section>;
}

function Performance({ detail }: { detail: TrainingRoutineDetailAnalytics }) {
  const summary = detail.performance.summary;
  const majorAdvance = detail.performance.findings.find((item) => item.status === "improved") ?? null;
  return <section className="space-y-3" aria-labelledby="routine-performance-title">
    <div><p className="text-xs font-semibold uppercase tracking-[0.11em] text-primary">Rendimiento</p><h2 id="routine-performance-title" className="mt-1 text-2xl font-semibold tracking-tight">{summary.headline}</h2></div>
    {summary.comparable ? <dl className="grid grid-cols-3 gap-px overflow-hidden rounded-xl border bg-border">
      <div className="bg-card px-3 py-3"><dt className="text-xs text-muted-foreground">Mejoraron</dt><dd className="metric-number mt-0.5 text-xl font-semibold text-primary">{summary.improved}</dd></div>
      <div className="bg-card px-3 py-3"><dt className="text-xs text-muted-foreground">Estables</dt><dd className="metric-number mt-0.5 text-xl font-semibold">{summary.stable}</dd></div>
      <div className="bg-card px-3 py-3"><dt className="text-xs text-muted-foreground">Bajaron</dt><dd className="metric-number mt-0.5 text-xl font-semibold">{summary.declined}</dd></div>
    </dl> : <p className="rounded-xl border bg-muted/20 px-4 py-4 text-sm text-muted-foreground">Necesitás registrar el mismo ejercicio y modo de carga en ambos períodos.</p>}
    {summary.insufficient ? <p className="text-xs text-muted-foreground">{summary.insufficient} {summary.insufficient === 1 ? "ejercicio quedó" : "ejercicios quedaron"} fuera del denominador.</p> : null}
    {detail.confidenceNote ? <p className="text-xs text-muted-foreground">{detail.confidenceNote}</p> : null}
    {majorAdvance ? <div className="rounded-xl border bg-card px-3 py-3"><p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">Mayor avance</p><p className="mt-1 text-sm font-semibold">{majorAdvance.name}</p><p className="mt-0.5 text-sm text-muted-foreground">{majorAdvance.signal?.description}</p></div> : null}
  </section>;
}

function Findings({ detail }: { detail: TrainingRoutineDetailAnalytics }) {
  return <section className="space-y-2" aria-labelledby="routine-findings-title"><h2 id="routine-findings-title" className="text-lg font-semibold tracking-tight">Qué cambió</h2>
    {detail.performance.findings.length ? <div className="divide-y rounded-xl border bg-card px-3">{detail.performance.findings.map((item) => <div key={item.exerciseId} className="py-3"><div className="flex items-baseline justify-between gap-3"><p className="text-sm font-semibold">{item.name}</p>{item.isPersonalRecord ? <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-primary">Nueva marca</span> : null}</div><p className="mt-0.5 text-sm text-muted-foreground">{item.signal?.description}</p></div>)}</div> : <p className="text-sm text-muted-foreground">No hubo cambios claros con evidencia comparable en esta rutina.</p>}
  </section>;
}

function deltaLabel(result: ProgressComparisonReport["results"][number]) {
  if (result.eligibility.status !== "comparable") return null;
  if (result.deltaPercent !== null) return `${new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1, signDisplay: "always" }).format(result.deltaPercent)}%`;
  if (result.deltaAbsolute === null) return null;
  const sign = result.deltaAbsolute > 0 ? "+" : result.deltaAbsolute < 0 ? "−" : "";
  return `${sign}${formatProgressMetricValue(Math.abs(result.deltaAbsolute), result.metric)}`;
}

function RoutineLoad({ report }: { report: ProgressComparisonReport }) {
  const baselineMissing = report.results.length > 0 && report.results.every((result) => result.eligibility.status !== "comparable");
  return <section className="space-y-3" aria-labelledby="routine-load-title"><div><h2 id="routine-load-title" className="text-lg font-semibold tracking-tight">Carga de la rutina</h2><p className="mt-1 text-sm text-muted-foreground">Describe cuánto entrenaste esta rutina; no mide fuerza ni rendimiento.</p></div>
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-4">{report.results.map((result) => { const delta = deltaLabel(result); return <div key={result.metric.key} className="min-w-0 bg-card px-3 py-3"><p className="text-xs text-muted-foreground">{result.metric.label}</p><p className="metric-number mt-0.5 truncate text-lg font-semibold">{result.formattedValueA}</p>{result.eligibility.status === "comparable" ? <p className="mt-0.5 truncate text-xs text-muted-foreground">vs. {result.formattedValueB}{delta ? ` · ${delta}` : ""}</p> : <p className="mt-0.5 text-xs text-muted-foreground">Sin historial comparable</p>}</div>; })}</div>
    {baselineMissing ? <p className="text-sm text-muted-foreground">{comparisonInsufficientMessage(report.results[0]!.eligibility)}</p> : null}
  </section>;
}

function RoutineEvolution({ report }: { report: ProgressComparisonReport }) {
  const evolutionReport = useMemo(() => {
    const results = report.results.filter((result) => EVOLUTION_METRIC_KEYS.has(result.metric.key));
    const activeMetricKey = results.some((result) => result.metric.key === report.activeMetricKey) ? report.activeMetricKey : results[0]?.metric.key ?? null;
    return { ...report, results, selectedMetricKeys: results.map((result) => result.metric.key), activeMetricKey };
  }, [report]);
  const [activeMetric, setActiveMetric] = useState(evolutionReport.activeMetricKey);
  const [mode, setMode] = useState<"current" | "comparison">("comparison");
  const comparisonLabel = report.reference.type === "previous_period" ? "Vs anterior" : "Vs comparación";
  return <section className="space-y-4" aria-labelledby="routine-evolution-title"><div><h2 id="routine-evolution-title" className="text-lg font-semibold tracking-tight">Evolución</h2><p className="mt-1 text-sm text-muted-foreground">Volumen, series o duración; una métrica de carga por vez.</p></div>
    <div className="grid grid-cols-2 rounded-lg border bg-muted/25 p-1" aria-label="Modo de evolución"><button type="button" onClick={() => setMode("current")} aria-pressed={mode === "current"} className={cn("min-h-11 rounded-md px-2 text-xs font-medium", mode === "current" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground")}>Actual</button><button type="button" onClick={() => setMode("comparison")} aria-pressed={mode === "comparison"} className={cn("min-h-11 rounded-md px-2 text-xs font-medium", mode === "comparison" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground")}>{comparisonLabel}</button></div>
    <ComparisonEvolution report={evolutionReport} activeMetricKey={activeMetric} onMetricChange={setActiveMetric} showReference={mode === "comparison"} />
  </section>;
}

function MuscleDistribution({ detail, state }: { detail: TrainingRoutineDetailAnalytics; state: TrainingAnalysisNavigationState }) {
  return <section className="space-y-2" aria-labelledby="routine-muscles-title"><div><h2 id="routine-muscles-title" className="text-lg font-semibold tracking-tight">Distribución muscular</h2><p className="mt-1 text-sm text-muted-foreground">Distribución de series por grupo; describe carga, no crecimiento.</p></div>
    {detail.muscleDistribution.length ? <div className="divide-y">{detail.muscleDistribution.map((muscle) => <Link key={muscle.key} href={trainingAnalysisWorkspacePath({ ...state, view: "muscles", routineId: null, muscleKey: muscle.key, comparison: undefined })} className="group block min-h-14 py-3 outline-none focus-visible:ring-2 focus-visible:ring-ring"><span className="flex items-center gap-3"><span className="min-w-0 flex-1 text-sm font-medium">{muscle.label}</span><span className="metric-number text-sm font-medium">{muscle.sets} series · {new Intl.NumberFormat("es-AR", { style: "percent", maximumFractionDigits: 0 }).format(muscle.ratio)}</span><ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden /></span><span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-muted"><span className="block h-full rounded-full bg-primary/65" style={{ width: `${muscle.ratio * 100}%` }} /></span></Link>)}</div> : <p className="text-sm text-muted-foreground">No hay series musculares registradas para esta rutina.</p>}
  </section>;
}

function RoutineExercises({ detail, state }: { detail: TrainingRoutineDetailAnalytics; state: TrainingAnalysisNavigationState }) {
  return <section className="space-y-2" aria-labelledby="routine-exercises-title"><h2 id="routine-exercises-title" className="text-lg font-semibold tracking-tight">Ejercicios de la rutina</h2>
    {detail.performance.exercises.length ? <div className="divide-y">{detail.performance.exercises.map((item) => { const meta = statusMeta[item.status]; return <Link key={item.exerciseId} href={trainingAnalysisExercisePath(item.exerciseId, { ...state, routineId: detail.routine.id })} className="group flex min-h-16 items-center gap-3 py-3 outline-none focus-visible:ring-2 focus-visible:ring-ring"><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{item.name}</span><span className={cn("mt-0.5 block text-xs font-medium", meta.className)}>{meta.label}</span><span className="mt-0.5 block text-xs text-muted-foreground">{item.signal?.description ?? insufficientDescription(item)}</span></span><ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden /></Link>; })}</div> : <p className="text-sm text-muted-foreground">No hay ejercicios históricos con series realizadas.</p>}
  </section>;
}

function RoutineDetail({ detail, state, analysis }: { detail: TrainingRoutineDetailAnalytics; state: TrainingAnalysisNavigationState; analysis: TrainingAnalysis }) {
  const searchParams = useSearchParams();
  const backHref = (() => { const next = new URLSearchParams(searchParams.toString()); next.delete("routine"); next.delete("compare"); next.delete("a"); next.delete("b"); return `/train/progress?${next.toString()}`; })();
  const crossHref = trainingAnalysisComparisonPath(state, "routines", { a: detail.routine.id });
  return <div className="space-y-7">
    <div><Link href={backHref} className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-primary"><ArrowLeft className="size-4" aria-hidden />Rutinas</Link><div className="flex items-center gap-2"><h2 className="text-xl font-semibold tracking-tight">{detail.routine.name}</h2>{!detail.isActive ? <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">Histórica</span> : null}</div><p className="mt-1 text-sm text-muted-foreground">{analysis.range.label} · datos de sesiones finalizadas.</p></div>
    {!detail.routine.summary.hasData ? <div className="rounded-xl border border-dashed px-4 py-7 text-center text-sm text-muted-foreground">No hay sesiones finalizadas de esta rutina en el período principal.</div> : <><Performance detail={detail} /><Findings detail={detail} /><RoutineLoad report={detail.loadComparison} /><RoutineEvolution key={`${detail.routine.id}-${detail.loadComparison.primaryPeriod.start}-${detail.loadComparison.reference.type === "goal" ? "goal" : detail.loadComparison.reference.period.start}`} report={detail.loadComparison} /><MuscleDistribution detail={detail} state={state} /><RoutineExercises detail={detail} state={state} /></>}
    <section className="space-y-1 border-t border-border/70 pt-4"><h2 className="text-base font-semibold tracking-tight">Otra lectura</h2><Link href={crossHref} className="group flex min-h-11 items-center justify-between text-sm font-medium text-primary"><span>Comparar con otra rutina</span><ChevronRight className="size-4" aria-hidden /></Link><p className="text-xs text-muted-foreground">Compara composición y carga; no decide qué rutina progresó más.</p></section>
  </div>;
}

export function TrainingRoutinesV2({
  analysis,
  analytics,
  state,
  reference,
  comparisonQuery,
  today,
  comparisonError,
}: {
  analysis: TrainingAnalysis;
  analytics: TrainingRoutinesAnalytics;
  state: TrainingAnalysisNavigationState;
  reference: ProgressTemporalComparisonReference;
  comparisonQuery: ProgressComparisonQuery;
  today: string;
  comparisonError?: string | null;
}) {
  const report = analytics.selected?.loadComparison ?? null;
  return <div className="space-y-7">
    <div className="space-y-2"><ComparisonConfigurator metrics={LOAD_METRIC_OPTIONS} primaryPeriod={analysis.range} today={today} selectedMetricKeys={report?.selectedMetricKeys ?? LOAD_METRIC_OPTIONS.map((metric) => metric.key)} referenceType={comparisonQuery.referenceType ?? "previous_period"} referencePreset={(comparisonQuery.referencePreset ?? null) as ProgressPeriodPreset | null} referencePeriod={reference.period} initialView={comparisonQuery.initialView} activeMetricKey={report?.activeMetricKey ?? "training.load.volume"} viewParam="comparisonView" triggerLabel="Ajustar comparación" triggerClassName="mt-0" showViewSelection={false} />{comparisonError ? <p className="text-xs text-destructive">{comparisonError}</p> : null}</div>
    {analytics.selected ? <RoutineDetail detail={analytics.selected} state={state} analysis={analysis} /> : <RoutineList analytics={analytics} analysis={analysis} />}
  </div>;
}
