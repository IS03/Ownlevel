"use client";

import { AlertTriangle, ChevronRight, Scale } from "lucide-react";
import { useMemo, useState } from "react";

import { BodyMeasurements } from "@/components/body/body-measurements";
import { BodyProgressChart } from "@/components/body/body-progress-chart";
import { WeightHistory } from "@/components/body/weight-history";
import { Card, CardContent } from "@/components/ui/card";
import type { BodyMeasurement } from "@/lib/body-measurement-types";
import {
  buildBodyProgressReport,
  type BodyMetricKey,
  type BodyMetricProgress,
} from "@/lib/progress/body";
import type { ProgressPeriodRange } from "@/lib/progress/analytics";
import type { WeightHistoryPoint } from "@/lib/weight-history";

function number(value: number) {
  return new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 }).format(value);
}

function date(value: string) {
  if (!value) return "sin fecha histórica";
  return new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short", year: "numeric", timeZone: "America/Argentina/Cordoba" })
    .format(new Date(`${value}T12:00:00Z`)).replaceAll(" de ", " ").replace(".", "");
}

function changeLabel(metric: BodyMetricProgress) {
  if (metric.change === null) return "Sin comparación suficiente";
  if (metric.change === 0) return "Sin cambio entre mediciones";
  return `${metric.change > 0 ? "+" : "−"}${number(Math.abs(metric.change))} ${metric.unit}`;
}

function currentMetric(metric: BodyMetricProgress) {
  if (!metric.latest) return null;
  return <div className="min-w-0">
    <p className="text-xs text-muted-foreground">{metric.label}</p>
    <p className="metric-number mt-0.5 text-xl font-semibold">{number(metric.latest.value)} {metric.unit}</p>
    <p className="mt-1 truncate text-[11px] text-muted-foreground">Último registro · {date(metric.latest.date)}</p>
    {metric.latest.provenance === "imported" ? <p className="mt-0.5 text-[11px] text-muted-foreground">{metric.latest.provenanceLabel}</p> : null}
  </div>;
}

export function BodyProgressWorkspace({
  initialWeightHistory,
  initialCurrentWeightKg,
  initialMeasurements,
  period,
  referencePeriod,
  referenceLabel,
  initialMetricKey,
  selectedMetricKeys,
  today,
}: {
  initialWeightHistory: WeightHistoryPoint[];
  initialCurrentWeightKg: number | null;
  initialMeasurements: BodyMeasurement[];
  period: ProgressPeriodRange;
  referencePeriod: ProgressPeriodRange;
  referenceLabel: string;
  initialMetricKey: string | null;
  selectedMetricKeys: string[];
  today: string;
}) {
  const [weightHistory, setWeightHistory] = useState(initialWeightHistory);
  const [currentWeightKg, setCurrentWeightKg] = useState(initialCurrentWeightKg);
  const [measurements, setMeasurements] = useState(initialMeasurements);
  const report = useMemo(() => buildBodyProgressReport({
    weightHistory,
    currentWeightKg,
    measurements,
    period,
    referencePeriod,
    selectedMetricKeys,
  }), [currentWeightKg, measurements, period, referencePeriod, selectedMetricKeys, weightHistory]);
  const weight = report.metrics.find((metric) => metric.key === "body.weight") ?? null;
  const measureMetrics = report.metrics.filter((metric) => metric.key !== "body.weight" && metric.latest !== null);
  const defaultMeasure = measureMetrics.find((metric) => metric.key === initialMetricKey)
    ?? measureMetrics.find((metric) => metric.key === "body.waist")
    ?? measureMetrics[0]
    ?? null;
  const [selectedMeasureKey, setSelectedMeasureKey] = useState<BodyMetricKey | null>(defaultMeasure?.key ?? null);
  const selectedMeasure = measureMetrics.find((metric) => metric.key === selectedMeasureKey) ?? defaultMeasure;
  const primaryState = report.state.slice(0, 4);

  return <div className="space-y-7">
    <section className="space-y-3" aria-labelledby="body-current-title">
      <div><h2 id="body-current-title" className="text-lg font-semibold tracking-tight">Estado actual</h2><p className="text-sm text-muted-foreground">Última observación válida conocida de cada métrica.</p></div>
      {primaryState.length ? <Card className="surface-elevated"><CardContent className="grid grid-cols-2 gap-x-5 gap-y-5 pt-1 sm:grid-cols-4">{primaryState.map((metric) => <div key={metric.key}>{currentMetric(metric)}</div>)}</CardContent></Card> : <Card><CardContent className="py-7 text-center text-sm text-muted-foreground">Todavía no hay datos corporales válidos. Podés registrar peso o medidas al final.</CardContent></Card>}
    </section>

    <section className="space-y-3" aria-labelledby="body-changes-title">
      <div><h2 id="body-changes-title" className="text-lg font-semibold tracking-tight">Qué cambió</h2><p className="text-sm text-muted-foreground">Cambios descriptivos entre observaciones reales del período.</p></div>
      <Card><CardContent className="divide-y pt-0">{report.insights.length ? report.insights.map((insight) => <div key={insight.metricKey} className="py-3"><p className="text-sm font-semibold">{insight.title}</p><p className="mt-0.5 text-sm text-muted-foreground">{insight.description}</p></div>) : <p className="py-5 text-sm text-muted-foreground">No hubo cambios comparables con datos suficientes en este período.</p>}</CardContent></Card>
      {report.excludedInvalidWeightCount > 0 ? <p className="flex items-start gap-2 rounded-xl bg-muted/40 px-3 py-2.5 text-xs text-muted-foreground"><AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />{report.excludedInvalidWeightCount === 1 ? "Un pesaje en 0 kg no cuenta" : `${report.excludedInvalidWeightCount} pesajes en 0 kg no cuentan`} en el gráfico ni en el cambio: no es un peso. Sigue en el historial para corregirlo o borrarlo.</p> : null}
      {report.excludedSuspectCount > 0 ? <p className="flex items-start gap-2 rounded-xl bg-amber-500/10 px-3 py-2.5 text-xs text-amber-800 dark:text-amber-200"><AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />{report.excludedSuspectCount} {report.excludedSuspectCount === 1 ? "registro fue excluido" : "registros fueron excluidos"} del análisis por estar marcado para revisión. Sigue disponible en el historial.</p> : null}
    </section>

    <section className="space-y-3" aria-labelledby="weight-trend-title">
      <div><h2 id="weight-trend-title" className="text-lg font-semibold tracking-tight">Tendencia de peso</h2><p className="text-sm text-muted-foreground">Puntos reales por fecha; no se completan los huecos.</p></div>
      <Card className="surface-elevated"><CardContent className="pt-1">{weight ? <BodyProgressChart metrics={[weight]} initialMetricKey="body.weight" period={period} referencePeriod={referencePeriod} referenceLabel={referenceLabel} /> : <p className="py-7 text-center text-sm text-muted-foreground">Todavía no hay registros de peso.</p>}</CardContent></Card>
    </section>

    <section className="space-y-3" aria-labelledby="body-measures-title">
      <div><h2 id="body-measures-title" className="text-lg font-semibold tracking-tight">Medidas corporales</h2><p className="text-sm text-muted-foreground">Cada medida usa su propio último valor y su propio baseline.</p></div>
      {measureMetrics.length ? <div className="divide-y overflow-hidden rounded-xl bg-card shadow-sm ring-1 ring-foreground/8">{measureMetrics.map((metric) => <button key={metric.key} type="button" onClick={() => setSelectedMeasureKey(metric.key)} className="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left outline-none hover:bg-muted/40 focus-visible:bg-muted/40">
        <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{metric.label}</span><span className="metric-number mt-0.5 block text-sm text-muted-foreground">{number(metric.latest!.value)} {metric.unit} · {changeLabel(metric)}</span><span className="mt-0.5 block text-[11px] text-muted-foreground">{metric.current.length} {metric.current.length === 1 ? "medición" : "mediciones"} en el período</span></span><ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      </button>)}</div> : <p className="rounded-xl border bg-card px-4 py-6 text-sm text-muted-foreground">Todavía no hay medidas corporales válidas.</p>}
    </section>

    {selectedMeasure ? <section className="space-y-3" aria-labelledby="measure-detail-title">
      <div><h2 id="measure-detail-title" className="text-lg font-semibold tracking-tight">Evolución · {selectedMeasure.label}</h2><p className="text-sm text-muted-foreground">Valor actual, cambio y registros reales de esta medida.</p></div>
      <Card><CardContent className="pt-1"><BodyProgressChart metrics={measureMetrics} initialMetricKey={selectedMeasure.key} period={period} referencePeriod={referencePeriod} referenceLabel={referenceLabel} onMetricChange={setSelectedMeasureKey} /></CardContent></Card>
    </section> : null}

    {report.sideDifferences.length ? <section className="space-y-3" aria-labelledby="body-sides-title">
      <div><h2 id="body-sides-title" className="text-lg font-semibold tracking-tight">Diferencias entre lados</h2><p className="text-sm text-muted-foreground">Lectura descriptiva de los últimos valores; no es un diagnóstico.</p></div>
      <div className="divide-y overflow-hidden rounded-xl border bg-card">{report.sideDifferences.map((item) => <div key={item.kind} className="grid grid-cols-[1fr_auto] gap-3 px-4 py-3"><div><p className="text-sm font-semibold">{item.label}</p><p className="mt-0.5 text-xs text-muted-foreground">Der. {number(item.right.value)} cm · Izq. {number(item.left.value)} cm</p></div><p className="metric-number self-center text-sm font-medium">{number(Math.abs(item.differenceCm))} cm</p></div>)}</div>
    </section> : null}

    <section className="space-y-4" aria-labelledby="body-history-title">
      <div className="flex items-center gap-2"><Scale className="size-4 text-primary" aria-hidden /><div><h2 id="body-history-title" className="text-lg font-semibold tracking-tight">Historial y registros</h2><p className="text-sm text-muted-foreground">Auditá, registrá o editá los datos que explican el análisis.</p></div></div>
      <div className="space-y-5 rounded-xl bg-muted/25 p-3 sm:p-4"><WeightHistory entries={weightHistory} currentWeightKg={currentWeightKg} today={today} onEntriesChange={setWeightHistory} onCurrentWeightChange={setCurrentWeightKg} /><div className="border-t pt-5"><BodyMeasurements entries={measurements} today={today} onEntriesChange={setMeasurements} /></div></div>
    </section>
  </div>;
}
