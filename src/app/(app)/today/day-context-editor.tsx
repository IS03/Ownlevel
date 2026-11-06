"use client";

import { todayInCordoba } from "@/lib/phase2/cordoba-date";
import Link from "next/link";
import { sleepNightCaption } from "@/lib/daily-metrics/sleep-night";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  formatDailyMetricProgress,
  parseDailyMetricValue,
  type DailyMetricWithValue,
} from "@/lib/daily-metrics/core";
import {
  DailyActivityAutosaveQueue,
  type DailyActivityAutosaveState,
  type DailyActivityDraft,
} from "@/lib/nutrition/activity-autosave";
import {
  saveDailyMetricsAction,
  saveExpenditureOverrideAction,
  saveNutritionTargetOverrideAction,
} from "./nutrition-actions";
import { getMetricIcon } from "./day-activity-panel";

type Props = {
  dayLogId: string;
  date: string;
  metrics: DailyMetricWithValue[];
  targetAutomaticInitial: number | null;
  targetOverrideInitial: number | null;
  expenditureAutomaticInitial: number | null;
  expenditureOverrideInitial: number | null;
  onMetricsChange?: (draft: DailyActivityDraft) => void;
};

function initialMetricDraft(metrics: DailyMetricWithValue[]): DailyActivityDraft {
  return Object.fromEntries(metrics.map((metric) => [metric.id, metric.value === null ? "" : String(metric.value)]));
}

function parsedDraftValue(raw: string, metric: DailyMetricWithValue) {
  try {
    return parseDailyMetricValue(raw, metric.value_type);
  } catch {
    return null;
  }
}

function durationParts(raw: string) {
  const total = Number(raw);
  if (!raw || !Number.isInteger(total) || total < 0) return { hours: "", minutes: "" };
  return { hours: String(Math.floor(total / 60)), minutes: String(total % 60) };
}

function automaticKcal(value: number | null) {
  return value === null ? "Sin valor automático" : `Automático · ${value} kcal`;
}

export function DayContextEditor({
  dayLogId,
  date,
  metrics,
  targetAutomaticInitial,
  targetOverrideInitial,
  expenditureAutomaticInitial,
  expenditureOverrideInitial,
  onMetricsChange,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const initialDraft = useMemo(() => initialMetricDraft(metrics), [metrics]);
  const [values, setValues] = useState<DailyActivityDraft>(initialDraft);
  const [target, setTarget] = useState(String(targetOverrideInitial ?? targetAutomaticInitial ?? ""));
  const [expenditure, setExpenditure] = useState(String(expenditureOverrideInitial ?? expenditureAutomaticInitial ?? ""));
  const [targetCorrected, setTargetCorrected] = useState(targetOverrideInitial !== null);
  const [expenditureCorrected, setExpenditureCorrected] = useState(expenditureOverrideInitial !== null);
  const [notice, setNotice] = useState<string | null>(null);
  const [autosave, setAutosave] = useState<DailyActivityAutosaveState>({ phase: "idle", error: null });
  const mountedRef = useRef(true);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queueRef = useRef<DailyActivityAutosaveQueue | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    const queue = new DailyActivityAutosaveQueue({
      debounceMs: 650,
      initial: initialDraft,
      save: async (draft) => {
        const result = await saveDailyMetricsAction({ date, values: draft, declaresSleepNight: true }); // The sleep field always shows which night it is (#367).
        if (!result.ok) throw new Error(result.error);
      },
      onStateChange: (state) => {
        if (!mountedRef.current) return;
        if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
        setAutosave(state);
        if (state.phase === "saved") {
          savedTimerRef.current = setTimeout(() => {
            if (mountedRef.current) setAutosave({ phase: "idle", error: null });
          }, 2200);
        }
      },
    });
    queueRef.current = queue;
    return () => {
      mountedRef.current = false;
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
      queue.dispose();
      if (queueRef.current === queue) queueRef.current = null;
    };
  }, [date, initialDraft]);

  function changeMetric(metricId: string, value: string) {
    const next = { ...values, [metricId]: value };
    setValues(next);
    onMetricsChange?.(next);
    queueRef.current?.change(next);
  }

  function changeDuration(metricId: string, hours: string, minutes: string) {
    if (!hours && !minutes) {
      changeMetric(metricId, "");
      return;
    }
    const parsedHours = Number(hours || 0);
    const parsedMinutes = Number(minutes || 0);
    if (!Number.isInteger(parsedHours) || !Number.isInteger(parsedMinutes) || parsedHours < 0 || parsedMinutes < 0 || parsedMinutes > 59) return;
    changeMetric(metricId, String(parsedHours * 60 + parsedMinutes));
  }

  function submit(
    task: () => Promise<{ ok: true } | { ok: false; error: string }>,
    onSuccess: () => void,
  ) {
    setNotice(null);
    startTransition(async () => {
      const result = await task();
      setNotice(result.ok ? "Cambios guardados." : result.error);
      if (result.ok) {
        onSuccess();
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-5">
      <section className="space-y-3" aria-labelledby="daily-activity-inputs">
        <h3 id="daily-activity-inputs" className="text-sm font-semibold">Registrar</h3>
        {metrics.length ? (
          <div className="overflow-hidden rounded-xl border bg-background/35">
            {metrics.map((metric, index) => {
              const Icon = getMetricIcon(metric.system_key, metric.value_type);
              const raw = values[metric.id] ?? "";
              const value = parsedDraftValue(raw, metric);
              const duration = durationParts(raw);
              return (
                <div key={metric.id} className={`space-y-3 p-3 ${index ? "border-t" : ""}`}>
                  <div className="flex items-center gap-2.5">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Icon className="size-4" aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{metric.name}</p>
                      <p className="metric-number truncate text-xs text-muted-foreground">
                        {formatDailyMetricProgress(value, metric)}
                      </p>
                    </div>
                  </div>

                  {metric.system_key === "sleep" ? <p className="text-xs text-muted-foreground">{sleepNightCaption(date, todayInCordoba())}</p> : null}
                  {metric.value_type === "duration" ? (
                    <div className="space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <Label htmlFor={`daily-metric-${metric.id}-hours`} className="text-xs">Horas</Label>
                          <Input
                            id={`daily-metric-${metric.id}-hours`}
                            inputMode="numeric"
                            min={0}
                            value={duration.hours}
                            onChange={(event) => changeDuration(metric.id, event.target.value, duration.minutes)}
                            onBlur={() => void queueRef.current?.flush()}
                            placeholder="—"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor={`daily-metric-${metric.id}-minutes`} className="text-xs">Minutos</Label>
                          <Input
                            id={`daily-metric-${metric.id}-minutes`}
                            inputMode="numeric"
                            min={0}
                            max={59}
                            value={duration.minutes}
                            onChange={(event) => changeDuration(metric.id, duration.hours, event.target.value)}
                            onBlur={() => void queueRef.current?.flush()}
                            placeholder="—"
                          />
                        </div>
                      </div>
                      {raw ? (
                        <Button type="button" size="sm" variant="ghost" className="h-8 px-2 text-xs" onClick={() => changeMetric(metric.id, "")}>
                          Quitar registro
                        </Button>
                      ) : null}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Input
                        id={`daily-metric-${metric.id}`}
                        aria-label={`Valor de ${metric.name}`}
                        inputMode={metric.value_type === "integer" ? "numeric" : "decimal"}
                        value={raw}
                        onChange={(event) => changeMetric(metric.id, event.target.value)}
                        onBlur={() => void queueRef.current?.flush()}
                        placeholder="—"
                      />
                      {metric.unit ? <span className="shrink-0 text-sm text-muted-foreground">{metric.unit}</span> : null}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
            No tenés métricas activas. <Link className="font-medium text-primary hover:underline" href="/settings/metrics">Configurarlas</Link>
          </div>
        )}
        <p
          className={`min-h-4 text-xs leading-4 ${autosave.phase === "error" ? "text-destructive" : autosave.phase === "saved" ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}`}
          role="status"
          aria-live="polite"
        >
          {autosave.phase === "scheduled" || autosave.phase === "saving"
            ? "Guardando…"
            : autosave.phase === "saved"
              ? "Guardado"
              : autosave.phase === "error"
                ? autosave.error
                : null}
        </p>
      </section>

      <details className="group/corrections rounded-xl border">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
          Correcciones del día
          <span className="shrink-0 text-muted-foreground transition-transform duration-200 group-open/corrections:rotate-90 motion-reduce:transition-none">
            <ChevronRight className="size-4" aria-hidden />
          </span>
        </summary>
        <div className="space-y-4 border-t px-3 pb-3 pt-3">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="nutrition-target-override">Objetivo nutricional</Label>
              {targetCorrected ? <span className="text-xs font-medium text-primary">Corregido para este día</span> : null}
            </div>
            <p className="text-xs text-muted-foreground">{automaticKcal(targetAutomaticInitial)}</p>
            <div className="flex items-center gap-2">
              <Input id="nutrition-target-override" inputMode="numeric" value={target} onChange={(event) => setTarget(event.target.value)} placeholder="—" />
              <span className="text-sm text-muted-foreground">kcal</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="outline" disabled={pending}
                onClick={() => submit(() => saveNutritionTargetOverrideAction({ dayLogId, kcal: target }), () => setTargetCorrected(true))}>
                Guardar objetivo
              </Button>
              {targetCorrected ? (
                <Button type="button" size="sm" variant="ghost" disabled={pending}
                  onClick={() => submit(() => saveNutritionTargetOverrideAction({ dayLogId, kcal: "" }), () => {
                    setTarget(String(targetAutomaticInitial ?? ""));
                    setTargetCorrected(false);
                  })}>
                  Usar valor automático
                </Button>
              ) : null}
            </div>
          </div>

          <div className="space-y-2 border-t pt-3">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="expenditure-override">Gasto estimado</Label>
              {expenditureCorrected ? <span className="text-xs font-medium text-primary">Corregido para este día</span> : null}
            </div>
            <p className="text-xs text-muted-foreground">{automaticKcal(expenditureAutomaticInitial)}</p>
            <div className="flex items-center gap-2">
              <Input id="expenditure-override" inputMode="numeric" value={expenditure} onChange={(event) => setExpenditure(event.target.value)} placeholder="—" />
              <span className="text-sm text-muted-foreground">kcal</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="outline" disabled={pending}
                onClick={() => submit(() => saveExpenditureOverrideAction({ dayLogId, kcal: expenditure }), () => setExpenditureCorrected(true))}>
                Guardar gasto
              </Button>
              {expenditureCorrected ? (
                <Button type="button" size="sm" variant="ghost" disabled={pending}
                  onClick={() => submit(() => saveExpenditureOverrideAction({ dayLogId, kcal: "" }), () => {
                    setExpenditure(String(expenditureAutomaticInitial ?? ""));
                    setExpenditureCorrected(false);
                  })}>
                  Usar valor automático
                </Button>
              ) : null}
            </div>
          </div>

          <p className="text-xs text-muted-foreground">Estas correcciones modifican únicamente esta fecha.</p>
        </div>
      </details>
      <div className="text-xs text-muted-foreground" role="status" aria-live="polite">
        {notice ? <p>{notice}</p> : null}
      </div>
    </div>
  );
}
