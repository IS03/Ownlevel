"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { useState } from "react";

import { ComparisonConfigurator } from "@/components/progress/comparison-configurator";
import { ComparisonEvolution } from "@/components/progress/comparison-evolution";
import { TrainingProgressPeriodSelector } from "@/components/training/training-progress-period-selector";
import type { TrainingAnalysis } from "@/lib/phase2/training-analysis";
import {
  trainingAnalysisExercisePath,
  trainingAnalysisWorkspacePath,
  type TrainingAnalysisNavigationState,
} from "@/lib/phase2/training-analysis-navigation";
import { formatProgressMetricValue, type ProgressPeriodPreset } from "@/lib/progress/analytics";
import {
  comparisonInsufficientMessage,
  type ProgressComparisonQuery,
  type ProgressTemporalComparisonReference,
} from "@/lib/progress/comparisons";
import type {
  TrainingExercisePerformance,
  TrainingGeneralAnalytics,
  TrainingPerformanceStatus,
} from "@/lib/progress/training-performance";
import { cn } from "@/lib/utils";

const statusMeta: Record<TrainingPerformanceStatus, { label: string; className: string }> = {
  improved: { label: "Mejoró", className: "text-primary" },
  declined: { label: "Bajó", className: "text-foreground" },
  stable: { label: "Sin cambio claro", className: "text-muted-foreground" },
  insufficient_data: { label: "Sin datos suficientes", className: "text-muted-foreground" },
};

const LOAD_METRIC_OPTIONS = [
  { key: "training.load.sessions", label: "Sesiones", supportsGoal: false },
  { key: "training.load.sets", label: "Series", supportsGoal: false },
  { key: "training.load.duration", label: "Duración", supportsGoal: false },
  { key: "training.load.volume", label: "Volumen", supportsGoal: false },
];

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

function ExercisePerformanceRow({ item, state }: { item: TrainingExercisePerformance; state: TrainingAnalysisNavigationState }) {
  const meta = statusMeta[item.status];
  return <Link href={trainingAnalysisExercisePath(item.exerciseId, state)} className="group flex min-h-16 items-center gap-3 border-b border-border/70 py-3 outline-none last:border-b-0 focus-visible:ring-2 focus-visible:ring-ring">
    <span className="min-w-0 flex-1">
      <span className="block truncate text-sm font-medium">{item.name}</span>
      <span className={cn("mt-0.5 block text-xs font-medium", meta.className)}>{meta.label}</span>
      <span className="mt-0.5 block text-xs text-muted-foreground">{item.signal?.description ?? insufficientDescription(item)}</span>
    </span>
    <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden />
  </Link>;
}

function PerformanceOverview({ analytics }: { analytics: TrainingGeneralAnalytics }) {
  const summary = analytics.performance.summary;
  return <section className="space-y-3" aria-labelledby="training-performance-title">
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.11em] text-primary">Tu rendimiento</p>
      <h2 id="training-performance-title" className="mt-1 text-2xl font-semibold tracking-tight">{summary.headline}</h2>
      {summary.context ? <p className="mt-1 text-sm text-muted-foreground">{summary.context}</p> : null}
    </div>
    {summary.comparable ? <dl className="grid grid-cols-3 gap-px overflow-hidden rounded-xl border bg-border">
      <div className="bg-card px-3 py-3"><dt className="text-xs text-muted-foreground">Mejoraron</dt><dd className="metric-number mt-0.5 text-xl font-semibold text-primary">{summary.improved}</dd></div>
      <div className="bg-card px-3 py-3"><dt className="text-xs text-muted-foreground">Estables</dt><dd className="metric-number mt-0.5 text-xl font-semibold">{summary.stable}</dd></div>
      <div className="bg-card px-3 py-3"><dt className="text-xs text-muted-foreground">Bajaron</dt><dd className="metric-number mt-0.5 text-xl font-semibold">{summary.declined}</dd></div>
    </dl> : <p className="rounded-xl border bg-muted/20 px-4 py-4 text-sm text-muted-foreground">Necesitás registrar el mismo ejercicio, con el mismo modo de carga, en ambos períodos.</p>}
    {summary.insufficient ? <p className="text-xs text-muted-foreground">{summary.insufficient} {summary.insufficient === 1 ? "ejercicio quedó" : "ejercicios quedaron"} fuera del denominador por falta de comparación suficiente.</p> : null}
  </section>;
}

function Findings({ analytics }: { analytics: TrainingGeneralAnalytics }) {
  const findings = analytics.performance.findings;
  return <section className="space-y-2" aria-labelledby="training-findings-title">
    <h2 id="training-findings-title" className="text-lg font-semibold tracking-tight">Qué cambió</h2>
    {findings.length ? <div className="divide-y rounded-xl border bg-card px-3">{findings.map((item) => <div key={item.exerciseId} className="py-3"><div className="flex items-baseline justify-between gap-3"><p className="text-sm font-semibold">{item.name}</p>{item.isPersonalRecord ? <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-primary">Nueva marca</span> : null}</div><p className="mt-0.5 text-sm text-muted-foreground">{item.signal?.description}</p></div>)}</div> : <p className="text-sm text-muted-foreground">No hubo cambios claros con evidencia comparable en las métricas disponibles.</p>}
  </section>;
}

function ExercisePerformanceList({ analytics, state }: { analytics: TrainingGeneralAnalytics; state: TrainingAnalysisNavigationState }) {
  const [showAll, setShowAll] = useState(false);
  const exercises = showAll ? analytics.performance.exercises : analytics.performance.exercises.slice(0, 6);
  return <section className="space-y-2" aria-labelledby="exercise-performance-title">
    <div className="flex items-baseline justify-between gap-3"><h2 id="exercise-performance-title" className="text-lg font-semibold tracking-tight">Rendimiento por ejercicio</h2>{analytics.performance.exercises.length > 6 && !showAll ? <button type="button" onClick={() => setShowAll(true)} className="min-h-11 text-sm font-medium text-primary">Ver todos</button> : null}</div>
    {exercises.length ? <div>{exercises.map((item) => <ExercisePerformanceRow key={item.exerciseId} item={item} state={state} />)}</div> : <p className="text-sm text-muted-foreground">Todavía no hay ejercicios finalizados en estos períodos.</p>}
  </section>;
}

function deltaLabel(result: TrainingGeneralAnalytics["loadComparison"]["results"][number]) {
  if (result.eligibility.status !== "comparable") return null;
  if (result.deltaPercent !== null) return new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1, signDisplay: "always" }).format(result.deltaPercent) + "%";
  if (result.deltaAbsolute === null) return null;
  const sign = result.deltaAbsolute > 0 ? "+" : result.deltaAbsolute < 0 ? "−" : "";
  return `${sign}${formatProgressMetricValue(Math.abs(result.deltaAbsolute), result.metric)}`;
}

function LoadSummary({ analytics }: { analytics: TrainingGeneralAnalytics }) {
  const coverageResult = analytics.loadComparison.results[0] ?? null;
  return <section className="space-y-3" aria-labelledby="training-load-title">
    <div><h2 id="training-load-title" className="text-lg font-semibold tracking-tight">Carga de entrenamiento</h2><p className="mt-1 text-sm text-muted-foreground">Describe cuánto entrenaste; no se interpreta como fuerza o rendimiento.</p></div>
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-4">{analytics.loadComparison.results.map((result) => {
      const delta = deltaLabel(result);
      return <div key={result.metric.key} className="min-w-0 bg-card px-3 py-3"><p className="text-xs text-muted-foreground">{result.metric.label}</p><p className="metric-number mt-0.5 truncate text-lg font-semibold">{result.formattedValueA}</p>{result.eligibility.status === "comparable" ? <p className="mt-0.5 truncate text-xs text-muted-foreground">vs. {result.formattedValueB}{delta ? ` · ${delta}` : ""}</p> : <p className="mt-0.5 text-xs text-muted-foreground">Sin historial comparable</p>}</div>;
    })}</div>
    {coverageResult?.eligibility.status === "comparable" && coverageResult.reference.type === "period" ? <p className="text-xs text-muted-foreground">{coverageResult.primary.coverage.sampleSize} sesiones en el período principal · {coverageResult.reference.analysis.coverage.sampleSize} en la comparación.</p> : null}
    {analytics.loadComparison.results.length && analytics.loadComparison.results.every((result) => result.eligibility.status !== "comparable") ? <p className="text-sm text-muted-foreground">{comparisonInsufficientMessage(analytics.loadComparison.results[0]!.eligibility)}</p> : null}
  </section>;
}

function LoadEvolution({ analytics }: { analytics: TrainingGeneralAnalytics }) {
  const report = analytics.loadComparison;
  const [activeMetric, setActiveMetric] = useState(report.activeMetricKey);
  const [mode, setMode] = useState<"current" | "comparison">("comparison");
  const comparisonLabel = report.reference.type === "previous_period" ? "Vs anterior" : "Vs comparación";
  return <section className="space-y-4" aria-labelledby="training-evolution-title">
    <div><h2 id="training-evolution-title" className="text-lg font-semibold tracking-tight">Evolución</h2><p className="mt-1 text-sm text-muted-foreground">Una métrica de carga por vez, alineada por posición dentro del período.</p></div>
    <div className="grid grid-cols-2 rounded-lg border bg-muted/25 p-1" aria-label="Modo de evolución"><button type="button" onClick={() => setMode("current")} aria-pressed={mode === "current"} className={cn("min-h-11 rounded-md px-2 text-xs font-medium", mode === "current" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground")}>Actual</button><button type="button" onClick={() => setMode("comparison")} aria-pressed={mode === "comparison"} className={cn("min-h-11 rounded-md px-2 text-xs font-medium", mode === "comparison" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground")}>{comparisonLabel}</button></div>
    <ComparisonEvolution report={report} activeMetricKey={activeMetric} onMetricChange={setActiveMetric} showReference={mode === "comparison"} />
  </section>;
}

function Feelings({ analytics }: { analytics: TrainingGeneralAnalytics }) {
  if (!analytics.feelings.length) return null;
  return <section className="space-y-3" aria-labelledby="training-feelings-title"><div><h2 id="training-feelings-title" className="text-lg font-semibold tracking-tight">Cómo te sentiste</h2><p className="mt-1 text-sm text-muted-foreground">Promedios sólo cuando existen al menos dos respuestas.</p></div><div className="divide-y rounded-xl border bg-card px-3">{analytics.feelings.map((item) => <div key={item.key} className="flex min-h-14 items-center justify-between gap-3 py-3"><div><p className="text-sm font-medium">{item.label}</p><p className="text-xs text-muted-foreground">{item.registeredCount} de {item.eligibleCount} sesiones</p></div><p className="metric-number text-base font-semibold">{new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 }).format(item.average)} / {item.scaleMaximum}</p></div>)}</div></section>;
}

function Explore({ state }: { state: TrainingAnalysisNavigationState }) {
  const items = [
    { view: "routines" as const, label: "Rutinas" },
    { view: "muscles" as const, label: "Músculos" },
    { view: "exercises" as const, label: "Ejercicios" },
  ];
  return <section className="space-y-2 border-t pt-5" aria-labelledby="training-explore-title"><h2 id="training-explore-title" className="text-lg font-semibold tracking-tight">Explorar</h2><div className="divide-y">{items.map((item) => <Link key={item.view} href={trainingAnalysisWorkspacePath({ view: item.view, period: state.period, customFrom: state.customFrom, customTo: state.customTo, routineId: null, muscleKey: null })} className="flex min-h-11 items-center justify-between text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring"><span>{item.label}</span><ChevronRight className="size-4 text-muted-foreground" aria-hidden /></Link>)}</div></section>;
}

export function TrainingGeneralV2({
  analysis,
  analytics,
  state,
  reference,
  comparisonQuery,
  today,
  comparisonError,
}: {
  analysis: TrainingAnalysis;
  analytics: TrainingGeneralAnalytics;
  state: TrainingAnalysisNavigationState;
  reference: ProgressTemporalComparisonReference;
  comparisonQuery: ProgressComparisonQuery;
  today: string;
  comparisonError?: string | null;
}) {
  return <div className="space-y-7">
    <div className="space-y-2"><TrainingProgressPeriodSelector analysis={analysis} reference={reference} today={today} view="general" /><ComparisonConfigurator metrics={LOAD_METRIC_OPTIONS} primaryPeriod={analysis.range} today={today} selectedMetricKeys={analytics.loadComparison.selectedMetricKeys} referenceType={comparisonQuery.referenceType ?? "previous_period"} referencePreset={(comparisonQuery.referencePreset ?? null) as ProgressPeriodPreset | null} referencePeriod={reference.period} initialView={comparisonQuery.initialView} activeMetricKey={analytics.loadComparison.activeMetricKey} viewParam="comparisonView" triggerLabel="Ajustar comparación" triggerClassName="mt-0" showViewSelection={false} />{comparisonError ? <p className="text-xs text-destructive">{comparisonError}</p> : null}</div>
    <PerformanceOverview analytics={analytics} />
    <Findings analytics={analytics} />
    <ExercisePerformanceList analytics={analytics} state={state} />
    <LoadSummary analytics={analytics} />
    <LoadEvolution key={`${analytics.loadComparison.primaryPeriod.start}-${reference.period.start}-${analytics.loadComparison.activeMetricKey ?? "default"}`} analytics={analytics} />
    <Feelings analytics={analytics} />
    <Explore state={state} />
  </div>;
}
