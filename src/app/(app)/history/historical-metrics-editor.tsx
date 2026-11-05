"use client";

import { todayInCordoba } from "@/lib/phase2/cordoba-date";
import { useMemo, useState, useTransition } from "react";
import { sleepNightCaption } from "@/lib/daily-metrics/sleep-night";
import { useRouter } from "next/navigation";
import { ResponsiveDialog } from "@/app/(app)/today/responsive-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDateFieldValue } from "@/lib/date-field-display";
import type { DailyMetricWithValue } from "@/lib/daily-metrics/core";
import { saveHistoricalDailyMetricsAction } from "./historical-metrics-actions";

type Props = {
  date: string;
  metrics: DailyMetricWithValue[];
};

function initialValues(metrics: DailyMetricWithValue[]) {
  return Object.fromEntries(metrics.map((metric) => [metric.id, metric.value === null ? "" : String(metric.value)]));
}

function durationParts(raw: string) {
  const total = Number(raw);
  if (!raw || !Number.isInteger(total) || total < 0) return { hours: "", minutes: "" };
  return { hours: String(Math.floor(total / 60)), minutes: String(total % 60) };
}

export function HistoricalMetricsEditor({ date, metrics }: Props) {
  const router = useRouter();
  const initial = useMemo(() => initialValues(metrics), [metrics]);
  const [values, setValues] = useState(initial);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function change(metricId: string, value: string) {
    setValues((current) => ({ ...current, [metricId]: value }));
  }

  function changeDuration(metricId: string, hours: string, minutes: string) {
    if (!hours && !minutes) return change(metricId, "");
    const parsedHours = Number(hours || 0);
    const parsedMinutes = Number(minutes || 0);
    if (!Number.isInteger(parsedHours) || !Number.isInteger(parsedMinutes) || parsedHours < 0 || parsedMinutes < 0 || parsedMinutes > 59) return;
    change(metricId, String(parsedHours * 60 + parsedMinutes));
  }

  function onOpenChange(next: boolean) {
    if (next) {
      setValues(initial);
      setError(null);
    }
    setOpen(next);
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await saveHistoricalDailyMetricsAction({ date, values, declaresSleepNight: true }); // The sleep field always shows which night it is (#367).
      if (!result.ok) return setError(result.error);
      setOpen(false);
      router.refresh();
    });
  }

  if (!metrics.length) return null;
  const hasRecordedValues = metrics.some((metric) => metric.value !== null);
  return (
    <>
      <Button type="button" variant="ghost" size="sm" className="-mr-2" onClick={() => onOpenChange(true)}>
        {hasRecordedValues ? "Editar" : "Agregar"}
      </Button>
      <ResponsiveDialog
        open={open}
        onOpenChange={onOpenChange}
        title="Editar métricas del día"
        description={formatDateFieldValue(date)}
        closeLabel="Cerrar edición de métricas"
      >
        <form className="space-y-4 pb-[env(safe-area-inset-bottom)]" onSubmit={submit}>
          <div className="space-y-3">
            {metrics.map((metric) => {
              const raw = values[metric.id] ?? "";
              const duration = durationParts(raw);
              return (
                <div key={metric.id}>
                  {metric.value_type === "duration" ? (
                    <fieldset className="group rounded-xl border border-input bg-background px-3 pb-1.5 transition-[border-color,box-shadow] focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/35 dark:bg-input/30">
                      <legend className="ml-[-0.25rem] px-1 text-xs font-normal leading-4 text-muted-foreground transition-colors group-focus-within:text-primary">
                        {metric.name}
                      </legend>
                      {metric.system_key === "sleep" ? <p className="pt-1 text-xs text-muted-foreground">{sleepNightCaption(date, todayInCordoba())}</p> : null}
                      <div className="grid grid-cols-2 divide-x">
                        <div className="flex min-w-0 items-center gap-2 pr-3">
                          <Input
                            id={`history-metric-${metric.id}-hours`}
                            aria-label={`${metric.name}, horas`}
                            inputMode="numeric"
                            min={0}
                            value={duration.hours}
                            onChange={(event) => changeDuration(metric.id, event.target.value, duration.minutes)}
                            placeholder="—"
                            className="h-10 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0 dark:bg-transparent"
                          />
                          <span className="shrink-0 text-sm text-muted-foreground">h</span>
                        </div>
                        <div className="flex min-w-0 items-center gap-2 pl-3">
                          <Input
                            id={`history-metric-${metric.id}-minutes`}
                            aria-label={`${metric.name}, minutos`}
                            inputMode="numeric"
                            min={0}
                            max={59}
                            value={duration.minutes}
                            onChange={(event) => changeDuration(metric.id, duration.hours, event.target.value)}
                            placeholder="—"
                            className="h-10 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0 dark:bg-transparent"
                          />
                          <span className="shrink-0 text-sm text-muted-foreground">min</span>
                        </div>
                      </div>
                    </fieldset>
                  ) : (
                    <fieldset className="group rounded-xl border border-input bg-background px-3 pb-1.5 transition-[border-color,box-shadow] focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/35 dark:bg-input/30">
                      <legend className="ml-[-0.25rem] px-1 text-xs font-normal leading-4 text-muted-foreground transition-colors group-focus-within:text-primary">
                        {metric.name}
                      </legend>
                      <div className="flex min-w-0 items-center gap-2">
                        <Input
                          id={`history-metric-${metric.id}`}
                          aria-label={metric.name}
                          inputMode={metric.value_type === "integer" ? "numeric" : "decimal"}
                          value={raw}
                          onChange={(event) => change(metric.id, event.target.value)}
                          placeholder="—"
                          className="h-10 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0 dark:bg-transparent"
                        />
                        {metric.unit ? <span className="shrink-0 text-sm text-muted-foreground">{metric.unit}</span> : null}
                      </div>
                    </fieldset>
                  )}
                </div>
              );
            })}
          </div>
          {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
          <Button type="submit" className="w-full" disabled={pending}>{pending ? "Guardando…" : "Guardar cambios"}</Button>
        </form>
      </ResponsiveDialog>
    </>
  );
}
