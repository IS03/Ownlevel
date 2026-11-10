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
  TrainingMuscleDetailAnalytics,
  TrainingMuscleListItem,
  TrainingMusclePerformance,
  TrainingMuscleSubzoneDetail,
  TrainingMusclesAnalytics,
} from "@/lib/progress/training-muscles";
import { cn } from "@/lib/utils";

const LOAD_METRIC_OPTIONS = [
  { key: "training.load.sessions", label: "Sesiones", supportsGoal: false },
  { key: "training.load.sets", label: "Series", supportsGoal: false },
  { key: "training.load.sets_per_session", label: "Series por sesión", supportsGoal: false },
];

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

function performanceLabel(item: TrainingMuscleListItem) {
  const summary = item.performance.summary;
  return summary.comparable
    ? `${summary.improved} de ${summary.comparable} comparables mejoraron`
    : "Sin suficiente comparación";
}

function MuscleList({ analytics, state }: { analytics: TrainingMusclesAnalytics; state: TrainingAnalysisNavigationState }) {
  return <section className="space-y-3" aria-labelledby="muscle-list-title">
    <div><h2 id="muscle-list-title" className="text-lg font-semibold tracking-tight">Grupos musculares</h2><p className="mt-1 text-sm text-muted-foreground">Rendimiento de ejercicios comparables, separado de la carga realizada.</p></div>
    {analytics.muscles.length === 0 ? <div className="rounded-xl border border-dashed px-4 py-7 text-center text-sm text-muted-foreground">No hay grupos musculares con series finalizadas en este período.</div> : <div className="divide-y">
      {analytics.muscles.map((muscle) => <Link key={muscle.key} href={trainingAnalysisWorkspacePath({ ...state, view: "muscles", routineId: null, muscleKey: muscle.key, muscleZoneKey: null, comparison: undefined })} className="group flex min-h-[76px] items-center gap-3 py-3 outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{muscle.label}</span><span className="mt-0.5 block text-xs text-muted-foreground">{muscle.sessions} {muscle.sessions === 1 ? "sesión" : "sesiones"} · {muscle.exerciseCount} {muscle.exerciseCount === 1 ? "ejercicio" : "ejercicios"} · {muscle.sets} series</span><span className={cn("mt-1 block text-xs font-medium", muscle.performance.summary.comparable ? "text-primary" : "text-muted-foreground")}>{performanceLabel(muscle)}</span></span>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden />
      </Link>)}
    </div>}
    <p className="text-xs text-muted-foreground">Se muestran sólo grupos amplios con actividad real; los detalles específicos aparecen dentro de cada grupo.</p>
  </section>;
}

function Performance({ performance, confidenceNote }: { performance: TrainingMusclePerformance; confidenceNote?: string | null }) {
  const summary = performance.summary;
  const majorAdvance = performance.findings.find((item) => item.status === "improved") ?? null;
  return <section className="space-y-3" aria-labelledby="muscle-performance-title">
    <div><p className="text-xs font-semibold uppercase tracking-[0.11em] text-primary">Rendimiento</p><h2 id="muscle-performance-title" className="mt-1 text-2xl font-semibold tracking-tight">{summary.headline}</h2></div>
    {summary.comparable ? <dl className="grid grid-cols-3 gap-px overflow-hidden rounded-xl border bg-border"><div className="bg-card px-3 py-3"><dt className="text-xs text-muted-foreground">Mejoraron</dt><dd className="metric-number mt-0.5 text-xl font-semibold text-primary">{summary.improved}</dd></div><div className="bg-card px-3 py-3"><dt className="text-xs text-muted-foreground">Estables</dt><dd className="metric-number mt-0.5 text-xl font-semibold">{summary.stable}</dd></div><div className="bg-card px-3 py-3"><dt className="text-xs text-muted-foreground">Bajaron</dt><dd className="metric-number mt-0.5 text-xl font-semibold">{summary.declined}</dd></div></dl> : <p className="rounded-xl border bg-muted/20 px-4 py-4 text-sm text-muted-foreground">Necesitás registrar el mismo ejercicio y modo de carga en ambos períodos.</p>}
    {summary.insufficient ? <p className="text-xs text-muted-foreground">{summary.insufficient} {summary.insufficient === 1 ? "ejercicio quedó" : "ejercicios quedaron"} fuera del denominador.</p> : null}
    {confidenceNote ? <p className="text-xs text-muted-foreground">{confidenceNote}</p> : null}
    {majorAdvance ? <div className="rounded-xl border bg-card px-3 py-3"><p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">Mayor avance</p><p className="mt-1 text-sm font-semibold">{majorAdvance.name}</p><p className="mt-0.5 text-sm text-muted-foreground">{majorAdvance.signal?.description}</p></div> : null}
  </section>;
}

function Findings({ performance }: { performance: TrainingMusclePerformance }) {
  return <section className="space-y-2" aria-labelledby="muscle-findings-title"><h2 id="muscle-findings-title" className="text-lg font-semibold tracking-tight">Qué cambió</h2>{performance.findings.length ? <div className="divide-y rounded-xl border bg-card px-3">{performance.findings.map((item) => <div key={item.exerciseId} className="py-3"><div className="flex items-baseline justify-between gap-3"><p className="text-sm font-semibold">{item.name}</p>{item.isPersonalRecord ? <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-primary">Nueva marca</span> : null}</div><p className="mt-0.5 text-sm text-muted-foreground">{item.signal?.description}</p></div>)}</div> : <p className="text-sm text-muted-foreground">No hubo cambios claros con evidencia comparable en este grupo.</p>}</section>;
}

function deltaLabel(result: ProgressComparisonReport["results"][number]) {
  if (result.eligibility.status !== "comparable") return null;
  if (result.deltaPercent !== null) return `${new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1, signDisplay: "always" }).format(result.deltaPercent)}%`;
  if (result.deltaAbsolute === null) return null;
  const sign = result.deltaAbsolute > 0 ? "+" : result.deltaAbsolute < 0 ? "−" : "";
  return `${sign}${formatProgressMetricValue(Math.abs(result.deltaAbsolute), result.metric)}`;
}

function MuscleLoad({ report, exerciseCount, compact = false }: { report: ProgressComparisonReport; exerciseCount: number; compact?: boolean }) {
  const baselineMissing = report.results.length > 0 && report.results.every((result) => result.eligibility.status !== "comparable");
  return <section className="space-y-3" aria-labelledby="muscle-load-title"><div><h2 id="muscle-load-title" className="text-lg font-semibold tracking-tight">{compact ? "Carga" : "Carga del grupo"}</h2><p className="mt-1 text-sm text-muted-foreground">Trabajo realizado; no mide crecimiento muscular.</p></div><div className={cn("grid gap-px overflow-hidden rounded-xl border bg-border", compact ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-4")}>{report.results.map((result) => { const delta = deltaLabel(result); return <div key={result.metric.key} className="min-w-0 bg-card px-3 py-3"><p className="text-xs text-muted-foreground">{result.metric.label}</p><p className="metric-number mt-0.5 truncate text-lg font-semibold">{result.formattedValueA}</p>{result.eligibility.status === "comparable" ? <p className="mt-0.5 truncate text-xs text-muted-foreground">vs. {result.formattedValueB}{delta ? ` · ${delta}` : ""}</p> : <p className="mt-0.5 text-xs text-muted-foreground">Sin historial comparable</p>}</div>; })}<div className="min-w-0 bg-card px-3 py-3"><p className="text-xs text-muted-foreground">Ejercicios</p><p className="metric-number mt-0.5 text-lg font-semibold">{exerciseCount}</p><p className="mt-0.5 text-xs text-muted-foreground">con series en el período</p></div></div>{baselineMissing ? <p className="text-sm text-muted-foreground">{comparisonInsufficientMessage(report.results[0]!.eligibility)}</p> : null}</section>;
}

function MuscleEvolution({ report }: { report: ProgressComparisonReport }) {
  const evolutionReport = useMemo(() => ({ ...report, activeMetricKey: report.results.some((result) => result.metric.key === report.activeMetricKey) ? report.activeMetricKey : report.results[0]?.metric.key ?? null }), [report]);
  const [activeMetric, setActiveMetric] = useState(evolutionReport.activeMetricKey);
  const [mode, setMode] = useState<"current" | "comparison">("comparison");
  const comparisonLabel = report.reference.type === "previous_period" ? "Vs anterior" : "Vs comparación";
  return <section className="space-y-4" aria-labelledby="muscle-evolution-title"><div><h2 id="muscle-evolution-title" className="text-lg font-semibold tracking-tight">Evolución</h2><p className="mt-1 text-sm text-muted-foreground">Series, sesiones o promedio; una medida de carga por vez.</p></div><div className="grid grid-cols-2 rounded-lg border bg-muted/25 p-1" aria-label="Modo de evolución"><button type="button" onClick={() => setMode("current")} aria-pressed={mode === "current"} className={cn("min-h-11 rounded-md px-2 text-xs font-medium", mode === "current" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground")}>Actual</button><button type="button" onClick={() => setMode("comparison")} aria-pressed={mode === "comparison"} className={cn("min-h-11 rounded-md px-2 text-xs font-medium", mode === "comparison" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground")}>{comparisonLabel}</button></div><ComparisonEvolution report={evolutionReport} activeMetricKey={activeMetric} onMetricChange={setActiveMetric} showReference={mode === "comparison"} /></section>;
}

function ExerciseRows({ performance, state, title = "Ejercicios" }: { performance: TrainingMusclePerformance; state: TrainingAnalysisNavigationState; title?: string }) {
  return <section className="space-y-2" aria-labelledby="muscle-exercises-title"><h2 id="muscle-exercises-title" className="text-lg font-semibold tracking-tight">{title}</h2>{performance.exercises.length ? <div className="divide-y">{performance.exercises.map((item) => { const meta = statusMeta[item.status]; return <Link key={item.exerciseId} href={trainingAnalysisExercisePath(item.exerciseId, state)} className="group flex min-h-16 items-center gap-3 py-3 outline-none focus-visible:ring-2 focus-visible:ring-ring"><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{item.name}</span><span className={cn("mt-0.5 block text-xs font-medium", meta.className)}>{meta.label}</span><span className="mt-0.5 block text-xs text-muted-foreground">{item.signal?.description ?? insufficientDescription(item)}</span></span><ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden /></Link>; })}</div> : <p className="text-sm text-muted-foreground">No hay ejercicios históricos con series realizadas.</p>}</section>;
}

function Subzones({ detail, state }: { detail: TrainingMuscleDetailAnalytics; state: TrainingAnalysisNavigationState }) {
  if (!detail.subzones.length) return null;
  return <section className="space-y-2" aria-labelledby="muscle-zones-title"><div><h2 id="muscle-zones-title" className="text-lg font-semibold tracking-tight">Subzonas</h2><p className="mt-1 text-sm text-muted-foreground">Detalle muscular real del ejercicio; la distribución representa series, no hipertrofia.</p></div><div className="divide-y">{detail.subzones.map((zone) => <Link key={zone.key} href={trainingAnalysisWorkspacePath({ ...state, muscleZoneKey: zone.key, comparison: undefined })} className="group block min-h-14 py-3 outline-none focus-visible:ring-2 focus-visible:ring-ring"><span className="flex items-center gap-3"><span className="min-w-0 flex-1 text-sm font-medium">{zone.label}</span><span className="metric-number shrink-0 text-sm font-medium">{zone.sets} series · {new Intl.NumberFormat("es-AR", { style: "percent", maximumFractionDigits: 0 }).format(zone.ratio)}</span><ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden /></span><span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-muted"><span className="block h-full rounded-full bg-primary/65" style={{ width: `${zone.ratio * 100}%` }} /></span></Link>)}</div></section>;
}

function SubzoneDetail({ detail, zone, state }: { detail: TrainingMuscleDetailAnalytics; zone: TrainingMuscleSubzoneDetail; state: TrainingAnalysisNavigationState }) {
  return <div className="space-y-7"><div><Link href={trainingAnalysisWorkspacePath({ ...state, muscleZoneKey: null, comparison: undefined })} className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-primary"><ArrowLeft className="size-4" aria-hidden />{detail.muscle.label}</Link><h2 className="text-xl font-semibold tracking-tight">{zone.label}</h2><p className="mt-1 text-sm text-muted-foreground">Subzona registrada dentro de {detail.muscle.label.toLocaleLowerCase("es-AR")}.</p></div><Performance performance={zone.performance} /><MuscleLoad report={zone.loadComparison} exerciseCount={zone.exerciseIds.length} compact /><ExerciseRows performance={zone.performance} state={state} title={`Ejercicios de ${zone.label.toLocaleLowerCase("es-AR")}`} /></div>;
}

function MuscleDetail({ detail, state, analysis }: { detail: TrainingMuscleDetailAnalytics; state: TrainingAnalysisNavigationState; analysis: TrainingAnalysis }) {
  const searchParams = useSearchParams();
  if (detail.selectedSubzone) return <SubzoneDetail detail={detail} zone={detail.selectedSubzone} state={state} />;
  const backHref = (() => { const next = new URLSearchParams(searchParams.toString()); next.delete("muscle"); next.delete("zone"); next.delete("compare"); next.delete("a"); next.delete("b"); return `/train/progress?${next.toString()}`; })();
  const crossHref = trainingAnalysisComparisonPath({ ...state, muscleZoneKey: null }, "muscles", { a: detail.muscle.key });
  return <div className="space-y-7"><div><Link href={backHref} className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-primary"><ArrowLeft className="size-4" aria-hidden />Músculos</Link><h2 className="text-xl font-semibold tracking-tight">{detail.muscle.label}</h2><p className="mt-1 text-sm text-muted-foreground">{analysis.range.label} · datos de sesiones finalizadas.</p></div><Performance performance={detail.performance} confidenceNote={detail.confidenceNote} /><Findings performance={detail.performance} /><MuscleLoad report={detail.loadComparison} exerciseCount={detail.muscle.summary.exerciseCount} /><MuscleEvolution key={`${detail.muscle.key}-${detail.loadComparison.primaryPeriod.start}-${detail.loadComparison.reference.type === "goal" ? "goal" : detail.loadComparison.reference.period.start}`} report={detail.loadComparison} /><Subzones detail={detail} state={state} /><ExerciseRows performance={detail.performance} state={state} title={`Ejercicios de ${detail.muscle.label.toLocaleLowerCase("es-AR")}`} /><section className="space-y-1 border-t border-border/70 pt-4"><h2 className="text-base font-semibold tracking-tight">Otra lectura</h2><Link href={crossHref} className="group flex min-h-11 items-center justify-between text-sm font-medium text-primary"><span>Comparar con otro músculo</span><ChevronRight className="size-4" aria-hidden /></Link><p className="text-xs text-muted-foreground">Compara carga y distribución; no decide qué músculo progresó más.</p></section></div>;
}

export function TrainingMusclesV2({ analysis, analytics, state, reference, comparisonQuery, today, comparisonError }: { analysis: TrainingAnalysis; analytics: TrainingMusclesAnalytics; state: TrainingAnalysisNavigationState; reference: ProgressTemporalComparisonReference; comparisonQuery: ProgressComparisonQuery; today: string; comparisonError?: string | null }) {
  const report = analytics.selected?.selectedSubzone?.loadComparison ?? analytics.selected?.loadComparison ?? null;
  return <div className="space-y-7"><div className="space-y-2"><ComparisonConfigurator metrics={LOAD_METRIC_OPTIONS} primaryPeriod={analysis.range} today={today} selectedMetricKeys={report?.selectedMetricKeys ?? LOAD_METRIC_OPTIONS.map((metric) => metric.key)} referenceType={comparisonQuery.referenceType ?? "previous_period"} referencePreset={(comparisonQuery.referencePreset ?? null) as ProgressPeriodPreset | null} referencePeriod={reference.period} initialView={comparisonQuery.initialView} activeMetricKey={report?.activeMetricKey ?? "training.load.sets"} viewParam="comparisonView" triggerLabel="Ajustar comparación" triggerClassName="mt-0" showViewSelection={false} />{comparisonError ? <p className="text-xs text-destructive">{comparisonError}</p> : null}</div>{analytics.selected ? <MuscleDetail detail={analytics.selected} state={state} analysis={analysis} /> : <MuscleList analytics={analytics} state={state} />}</div>;
}
