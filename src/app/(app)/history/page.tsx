import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ChevronRight, Dumbbell, Scale } from "lucide-react";

import { MealList, type TodayMeal } from "@/app/(app)/today/meal-list";
import { DailyHistoryDateNavigator } from "@/components/history/daily-history-date-navigator";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BODY_MEASUREMENT_FIELDS, type BodyMeasurement } from "@/lib/body-measurements";
import { formatDailyMetricValue } from "@/lib/daily-metrics/core";
import { getDailyHistoryDetail, listDailyHistoryDays } from "@/lib/history/daily-history";
import {
  adjacentHistoryDate,
  dailyHistoryDetailHref,
  dailyHistoryReturnTarget,
  dailyHistorySessionHref,
  isHistoryDate,
  parseDailyHistoryOrigin,
} from "@/lib/history/daily-history-navigation";
import type { MealEntry } from "@/lib/phase1/types";
import { nutritionMealTimeSource } from "@/lib/mobile-api/nutrition-meal-time";
import { todayInCordoba } from "@/lib/phase2/cordoba-date";
import { getVerifiedRequestContext } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { HistoricalMetricsEditor } from "./historical-metrics-editor";

export const dynamic = "force-dynamic";
// El loader reconstruye el día sin materializarlo: getNutritionDay(date, { createIfMissing: false }).

const number = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 });
const integer = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 });
const bodyLabels: Record<(typeof BODY_MEASUREMENT_FIELDS)[number], string> = {
  waist_cm: "Cintura",
  abdomen_cm: "Abdomen",
  chest_cm: "Pecho",
  arm_cm: "Brazo",
  arm_right_cm: "Brazo der.",
  arm_left_cm: "Brazo izq.",
  thigh_cm: "Muslo",
  thigh_right_cm: "Muslo der.",
  thigh_left_cm: "Muslo izq.",
  calf_right_cm: "Pantorrilla der.",
  calf_left_cm: "Pantorrilla izq.",
  hip_cm: "Cadera",
};

function formatKcal(value: number | null | undefined) {
  return typeof value === "number" ? `${integer.format(value)} kcal` : "—";
}

function formatGrams(value: number | null | undefined) {
  return typeof value === "number" ? `${number.format(value)} g` : "—";
}

function formatDuration(milliseconds: number | null) {
  if (milliseconds === null) return null;
  const minutes = Math.round(milliseconds / 60_000);
  const hours = Math.floor(minutes / 60);
  return hours
    ? `${hours} h${minutes % 60 ? ` ${minutes % 60} min` : ""}`
    : `${minutes} min`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-AR", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${value}T12:00:00Z`));
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Argentina/Cordoba",
  }).format(new Date(value));
}

function energyBalanceLabel(value: number) {
  if (value < 0) return `−${integer.format(Math.abs(value))} kcal · déficit estimado`;
  if (value > 0) return `+${integer.format(value)} kcal · superávit estimado`;
  return "0 kcal · balance estimado";
}

function historyMeal(meal: MealEntry): TodayMeal {
  const legacy = meal.entry_kind === "legacy_daily_summary";
  const timeSource = nutritionMealTimeSource(meal.raw_input, meal.entry_kind);
  const context = [
    !legacy && timeSource === "explicit" ? formatTime(meal.consumed_at) : null,
    // A meal registered as eaten now keeps its registration time as approximate (#308).
    !legacy && timeSource === "registration" ? `≈ ${formatTime(meal.consumed_at)} · hora de registro` : null,
    !legacy && timeSource === "unknown" ? "Horario no informado" : null,
    legacy ? "Sin desglose de comidas disponible." : null,
    !legacy && (meal.source_type === "sheet_import" || meal.source_type === "chatgpt")
      ? "Importado"
      : null,
  ].filter((value): value is string => Boolean(value));

  return {
    id: meal.id,
    updated_at: meal.updated_at,
    title: legacy ? "Resumen diario histórico" : meal.title,
    description: meal.description,
    final_calories: meal.final_calories,
    final_protein_g: meal.final_protein_g,
    final_carbs_g: meal.final_carbs_g,
    final_fat_g: meal.final_fat_g,
    editable: !legacy,
    contextLabel: context.join(" · ") || null,
  };
}

function BodySection({ weight, measurement }: { weight: number | null; measurement: BodyMeasurement | null }) {
  const values = [
    ...(weight === null ? [] : [{ label: "Peso", value: `${number.format(weight)} kg` }]),
    ...(measurement
      ? BODY_MEASUREMENT_FIELDS.flatMap((field) => {
          const value = measurement[field];
          return value === null ? [] : [{ label: bodyLabels[field], value: `${number.format(value)} cm` }];
        })
      : []),
  ];
  if (
    !values.length
    && !measurement?.condition
    && !measurement?.notes
    && measurement?.quality_status !== "suspect"
    && !measurement?.legacy_import_source
  ) return null;

  return (
    <section className="space-y-3" aria-labelledby="body-title">
      <div className="flex items-center gap-2">
        <Scale className="size-4 text-primary" aria-hidden />
        <h2 id="body-title" className="text-base font-semibold tracking-tight">Cuerpo</h2>
      </div>
      <Card className="surface-elevated gap-0 py-0">
        <CardContent className="px-0">
          {values.length ? (
            <div className="divide-y">
              {values.map((item) => (
                <div key={item.label} className="flex min-h-12 items-center justify-between gap-4 px-4 py-3">
                  <p className="text-sm text-muted-foreground">{item.label}</p>
                  <p className="metric-number text-right font-semibold">{item.value}</p>
                </div>
              ))}
            </div>
          ) : null}
          {measurement?.condition || measurement?.notes ? (
            <div className={cn("space-y-2 px-4 py-3", values.length && "border-t")}>
              {measurement.condition ? (
                <div>
                  <p className="text-xs text-muted-foreground">Condición</p>
                  <p className="text-sm">{measurement.condition}</p>
                </div>
              ) : null}
              {measurement.notes ? <p className="text-sm text-muted-foreground">{measurement.notes}</p> : null}
            </div>
          ) : null}
          {measurement?.quality_status === "suspect" ? (
            <p className="border-t px-4 py-3 text-sm text-destructive">
              Medición a revisar{measurement.quality_note ? `: ${measurement.quality_note}` : "."}
            </p>
          ) : null}
          {measurement?.legacy_import_source ? (
            <p className="border-t px-4 py-3 text-xs text-muted-foreground">
              Histórico importado · {measurement.legacy_import_source}
            </p>
          ) : null}
        </CardContent>
      </Card>
    </section>
  );
}

export default async function HistoryPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = (await searchParams) ?? {};
  const requestedDate = typeof sp.date === "string" ? sp.date : null;
  const origin = parseDailyHistoryOrigin(sp);
  const today = todayInCordoba();
  const auth = await getVerifiedRequestContext();
  if (!auth) redirect("/login");

  if (!requestedDate) {
    const days = await listDailyHistoryDays({ today, context: auth, limit: 60 });
    return (
      <div className="space-y-6">
        <header className="space-y-3">
          <Link href="/progress" className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-primary hover:underline">
            <ArrowLeft className="size-4" aria-hidden /> Progreso
          </Link>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight lg:text-3xl">Historial diario</h1>
            <p className="mt-1 text-sm text-muted-foreground">Revisá qué registraste e hiciste en una fecha.</p>
          </div>
        </header>
        <div className="space-y-6 lg:grid lg:grid-cols-12 lg:items-start lg:gap-5 lg:space-y-0">
          <Card className="lg:order-2 lg:col-span-4 lg:sticky lg:top-8">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Ir a una fecha</CardTitle>
            </CardHeader>
            <CardContent>
              <DailyHistoryDateNavigator value={today} today={today} origin={{ source: "history" }} adjacent={false} />
            </CardContent>
          </Card>
          <section className="space-y-3 lg:order-1 lg:col-span-8" aria-labelledby="recent-days-title">
            <h2 id="recent-days-title" className="text-base font-semibold tracking-tight">Últimos días</h2>
            {days.length === 0 ? <p className="text-sm text-muted-foreground">Todavía no hay información registrada.</p> : (
              <div className="space-y-2 lg:grid lg:grid-cols-2 lg:gap-3 lg:space-y-0">
                {days.map((day) => {
                  const hasNutrition = day.mealCount > 0;
                  return (
                    <Link key={day.date} href={dailyHistoryDetailHref(day.date, { source: "history" })} className="group block rounded-xl bg-card px-4 py-3 shadow-sm ring-1 ring-foreground/8 outline-none transition-[background-color,transform] hover:bg-muted/45 focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.99]">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold capitalize">{formatDate(day.date)}</p>
                          <div className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-xs text-muted-foreground">
                            {hasNutrition ? <span>{formatKcal(day.dayLog?.total_calories_consumed)}{day.dayLog?.targetKcal == null ? "" : ` / ${integer.format(day.dayLog.targetKcal)}`}</span> : null}
                            {hasNutrition && day.dayLog?.total_protein_g ? <span>{formatGrams(day.dayLog.total_protein_g)} proteína</span> : null}
                            {day.workoutNames.length ? <span>Entrenamiento · {day.workoutNames.join(", ")}</span> : null}
                            {day.metricCount ? <span>{day.metricCount} {day.metricCount === 1 ? "métrica" : "métricas"}</span> : null}
                            {day.dayLog?.weight_kg !== null && day.dayLog?.weight_kg !== undefined ? <span>{number.format(day.dayLog.weight_kg)} kg</span> : null}
                            {day.measurement ? <span>Medidas</span> : null}
                          </div>
                        </div>
                        <ChevronRight className="mt-1 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </div>
    );
  }

  if (!isHistoryDate(requestedDate) || requestedDate > today) redirect("/history");
  const returnTarget = dailyHistoryReturnTarget(origin);
  const { nutrition, sessions, measurement, events, metrics } = await getDailyHistoryDetail(requestedDate, auth);
  const { dayLog, context } = nutrition;
  const hasNutrition = nutrition.meals.some(
    (meal) => meal.entry_kind === "meal" || meal.entry_kind === "legacy_daily_summary",
  );
  const hasBody = Boolean(
    (dayLog?.weight_kg !== null && dayLog?.weight_kg !== undefined) || measurement,
  );
  const hasAnything = hasNutrition || Boolean(
    sessions.length
    || metrics.recorded.length
    || measurement
    || events.length
    || (dayLog?.weight_kg !== null && dayLog?.weight_kg !== undefined),
  );
  const measurementCount = measurement
    ? BODY_MEASUREMENT_FIELDS.filter((field) => measurement[field] !== null).length
    : 0;
  const summary = [
    dayLog && context && hasNutrition
      ? {
          label: "Calorías",
          value: context.targets.calories === null
            ? formatKcal(dayLog.total_calories_consumed)
            : `${integer.format(dayLog.total_calories_consumed)} / ${integer.format(context.targets.calories)} kcal`,
        }
      : null,
    dayLog && context && hasNutrition
      ? {
          label: "Proteína",
          value: context.targets.proteinG === null
            ? formatGrams(dayLog.total_protein_g)
            : `${number.format(dayLog.total_protein_g)} / ${number.format(context.targets.proteinG)} g`,
        }
      : null,
    sessions.length
      ? { label: "Entrenamiento", value: sessions.length === 1 ? sessions[0].name : `${sessions.length} sesiones` }
      : null,
    metrics.recorded.length
      ? { label: "Métricas", value: `${metrics.recorded.length} ${metrics.recorded.length === 1 ? "registrada" : "registradas"}` }
      : null,
    dayLog?.weight_kg !== null && dayLog?.weight_kg !== undefined
      ? { label: "Peso", value: `${number.format(dayLog.weight_kg)} kg` }
      : null,
    measurementCount
      ? { label: "Medidas", value: `${measurementCount} ${measurementCount === 1 ? "registro" : "registros"}` }
      : null,
  ].filter((value): value is { label: string; value: string } => value !== null);
  const mealItems = nutrition.meals.map(historyMeal);

  return (
    <div className="space-y-6 pb-2">
      <header className="space-y-3">
        <Link href={returnTarget.href} className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-primary hover:underline">
          <ArrowLeft className="size-4" aria-hidden /> {returnTarget.label}
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight lg:text-3xl">Historial diario</h1>
          {requestedDate === today ? (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">Hoy · en curso</span>
          ) : null}
        </div>
        <DailyHistoryDateNavigator value={requestedDate} today={today} origin={origin} />
      </header>

      {!hasAnything ? (
        <div className="rounded-xl border border-dashed px-4 py-5">
          <p className="font-medium">No hay registros para este día.</p>
          <p className="mt-1 text-sm text-muted-foreground">Podés completar las métricas disponibles sin crear datos ficticios.</p>
        </div>
      ) : null}

      {summary.length ? (
        <section className="rounded-xl border bg-card px-4 py-3" aria-labelledby="summary-title" data-history-section="summary">
          <h2 id="summary-title" className="text-sm font-semibold tracking-tight">Resumen del día</h2>
          <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
            {summary.map((item) => (
              <div key={item.label} className="min-w-0">
                <p className="text-xs text-muted-foreground">{item.label}</p>
                <p className="metric-number mt-0.5 break-words text-sm font-semibold">{item.value}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {metrics.editable.length ? (
        <section className="space-y-3" aria-labelledby="metrics-title" data-history-section="metrics">
          <div className="flex items-center justify-between gap-3">
            <h2 id="metrics-title" className="text-base font-semibold tracking-tight">Métricas</h2>
            <HistoricalMetricsEditor date={requestedDate} metrics={metrics.editable} />
          </div>
          {metrics.recorded.length ? (
            <Card className="surface-elevated gap-0 py-0">
              <CardContent className="divide-y px-0">
                {metrics.recorded.map((metric) => (
                  <div key={metric.id} className="flex min-h-12 items-center justify-between gap-4 px-4 py-3">
                    <p className="min-w-0 break-words text-sm text-muted-foreground">{metric.name}</p>
                    <p className="metric-number shrink-0 text-right font-semibold">{formatDailyMetricValue(metric.value, metric)}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : (
            <p className="rounded-xl border border-dashed px-4 py-3 text-sm text-muted-foreground">No registraste métricas este día.</p>
          )}
        </section>
      ) : null}

      {sessions.length ? (
        <section className="space-y-3" aria-labelledby="training-title" data-history-section="training">
          <div className="flex items-center gap-2">
            <Dumbbell className="size-4 text-primary" aria-hidden />
            <h2 id="training-title" className="text-base font-semibold tracking-tight">Entrenamiento</h2>
          </div>
          <div className="divide-y overflow-hidden rounded-xl border bg-card shadow-sm">
            {sessions.map((session) => {
              const feedback = [
                session.feedback.energy === null ? null : `Energía ${session.feedback.energy}/5`,
                session.feedback.performance === null ? null : `Rendimiento ${session.feedback.performance}/5`,
                session.feedback.pain === null ? null : `Dolor ${session.feedback.pain}/10`,
              ].filter((value): value is string => Boolean(value));
              return (
                <Link key={session.id} href={dailyHistorySessionHref(session.id, requestedDate, origin)} className="group flex min-h-[76px] items-center gap-3 px-4 py-3 outline-none transition-colors hover:bg-muted/45 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring" aria-label={`Ver sesión ${session.name}`}>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="break-words font-semibold">{session.name}</p>
                      <p className="shrink-0 text-xs text-muted-foreground">{formatTime(session.startedAt)}</p>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {[
                        formatDuration(session.durationMilliseconds),
                        `${session.completedExercises} ${session.completedExercises === 1 ? "ejercicio" : "ejercicios"}`,
                        `${session.completedSets} ${session.completedSets === 1 ? "serie" : "series"}`,
                        session.volumeKg > 0 ? `${integer.format(session.volumeKg)} kg volumen` : null,
                      ].filter(Boolean).join(" · ")}
                    </p>
                    {feedback.length ? <p className="mt-1 text-xs text-muted-foreground">{feedback.join(" · ")}</p> : null}
                  </div>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
                </Link>
              );
            })}
          </div>
        </section>
      ) : null}

      {dayLog && context && hasNutrition ? (
        <section className="space-y-3" aria-labelledby="nutrition-title" data-history-section="nutrition">
          <h2 id="nutrition-title" className="text-base font-semibold tracking-tight">Nutrición</h2>
          <Card className="surface-elevated gap-0 py-0">
            <CardContent className="divide-y px-0">
              <div className="flex items-end justify-between gap-4 px-4 py-3">
                <div>
                  <p className="text-xs text-muted-foreground">Calorías consumidas</p>
                  <p className="metric-number mt-0.5 text-xl font-semibold">{formatKcal(dayLog.total_calories_consumed)}</p>
                </div>
                {context.targets.calories !== null ? (
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">Objetivo{dayLog.nutrition_target_override_kcal !== null ? " ajustado" : ""}</p>
                    <p className="metric-number mt-0.5 text-sm font-semibold">{formatKcal(context.targets.calories)}</p>
                  </div>
                ) : null}
              </div>
              <div className="grid grid-cols-3 gap-3 px-4 py-3">
                <div><p className="text-xs text-muted-foreground">Proteína</p><p className="metric-number mt-0.5 font-semibold">{formatGrams(dayLog.total_protein_g)}</p></div>
                <div><p className="text-xs text-muted-foreground">Carbos</p><p className="metric-number mt-0.5 font-semibold">{formatGrams(dayLog.total_carbs_g)}</p></div>
                <div><p className="text-xs text-muted-foreground">Grasas</p><p className="metric-number mt-0.5 font-semibold">{formatGrams(dayLog.total_fat_g)}</p></div>
              </div>
              {context.expenditureKcal !== null || context.metrics.energyBalanceKcal !== null || context.metrics.deltaVsNutritionTarget !== null ? (
                <div className="grid gap-3 px-4 py-3 sm:grid-cols-3">
                  {context.expenditureKcal !== null ? (
                    <div><p className="text-xs text-muted-foreground">Gasto estimado{dayLog.expenditure_override_kcal !== null ? " ajustado" : ""}</p><p className="metric-number mt-0.5 font-semibold">{formatKcal(context.expenditureKcal)}</p></div>
                  ) : null}
                  {context.metrics.energyBalanceKcal !== null ? (
                    <div><p className="text-xs text-muted-foreground">Balance energético</p><p className="metric-number mt-0.5 font-semibold">{energyBalanceLabel(context.metrics.energyBalanceKcal)}</p></div>
                  ) : null}
                  {context.metrics.deltaVsNutritionTarget !== null ? (
                    <div><p className="text-xs text-muted-foreground">Diferencia vs objetivo</p><p className="metric-number mt-0.5 font-semibold">{context.metrics.deltaVsNutritionTarget >= 0 ? "+" : ""}{integer.format(context.metrics.deltaVsNutritionTarget)} kcal</p></div>
                  ) : null}
                </div>
              ) : null}
            </CardContent>
          </Card>
        </section>
      ) : null}

      {mealItems.length ? (
        <div data-history-section="meals"><MealList meals={mealItems} date={requestedDate} /></div>
      ) : null}

      {hasBody ? <BodySection weight={dayLog?.weight_kg ?? null} measurement={measurement} /> : null}

      {events.length ? (
        <section className="space-y-3" aria-labelledby="events-title">
          <h2 id="events-title" className="text-base font-semibold tracking-tight">Eventos / contexto</h2>
          {events.map((event) => (
            <Card key={event.id} size="sm">
              <CardContent className="space-y-1">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="font-medium">{event.event_type}</p>
                  {event.intensity ? <span className="text-xs text-muted-foreground">{event.intensity}</span> : null}
                </div>
                <p className="text-xs text-muted-foreground">Planificado: {event.planned == null ? "No informado" : event.planned ? "Sí" : "No"} · Alcohol: {event.alcohol == null ? "No informado" : event.alcohol ? "Sí" : "No"}</p>
                {event.context ? <p className="text-sm text-muted-foreground">{event.context}</p> : null}
                {event.notes ? <p className="text-sm text-muted-foreground">{event.notes}</p> : null}
              </CardContent>
            </Card>
          ))}
        </section>
      ) : null}

      <nav className="grid grid-cols-2 gap-2 pt-1" aria-label="Navegación por fecha al final del día" data-history-section="navigation">
        <Link href={dailyHistoryDetailHref(adjacentHistoryDate(requestedDate, -1), origin)} scroll={false} className={cn(buttonVariants({ variant: "outline" }), "h-11")}>Día anterior</Link>
        {requestedDate < today ? (
          <Link href={dailyHistoryDetailHref(adjacentHistoryDate(requestedDate, 1), origin)} scroll={false} className={cn(buttonVariants({ variant: "outline" }), "h-11")}>Día siguiente</Link>
        ) : (
          <span aria-disabled="true" className={cn(buttonVariants({ variant: "outline" }), "h-11 cursor-not-allowed opacity-50")}>Día siguiente</span>
        )}
      </nav>
    </div>
  );
}
