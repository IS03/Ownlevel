import { describe, expect, it } from "vitest";

import type { MetricReportDefinition } from "@/lib/daily-metrics/reports-core";
import type { NutritionReportSummary } from "@/lib/nutrition/reports-core";
import type { BodyProgressReport } from "@/lib/progress/body";
import type { ProgressComparisonReport } from "@/lib/progress/comparisons";
import type { HighlightedRelationship } from "@/lib/progress/relationships";
import type { TrainingGeneralAnalytics } from "@/lib/progress/training-performance";
import {
  PROGRESS_HOME_SECTION_ORDER,
  buildProgressHomeModel,
  progressHomeDestinationHref,
  progressHomeHref,
} from "./home";
import { resolveProgressPeriod } from "./analytics";

const today = "2026-09-13";
const period = resolveProgressPeriod({ preset: "4w" }, today);

function comparison(input: Array<{
  key: string;
  label: string;
  definitionId?: string;
  value: number | null;
  insight?: string;
  active?: boolean;
  coverage?: number;
}>): ProgressComparisonReport {
  const results = input.map((item) => ({
    metric: { key: item.key, label: item.label, metadata: { definitionId: item.definitionId, isActive: item.active ?? true } },
    valueA: item.value,
    formattedValueA: item.value === null ? "—" : String(item.value),
    primary: {
      coverage: {
        sampleSize: item.value === null ? 0 : 1,
        registeredCount: item.value === null ? 0 : 1,
        eligibleCount: 27,
        coverageRatio: item.coverage ?? (item.value === null ? 0 : 1),
      },
    },
    relevanceScore: 25,
  }));
  return {
    results,
    insights: input.flatMap((item) => item.insight ? [{ metricKey: item.key, title: item.label, description: item.insight, change: "increased" as const }] : []),
  } as unknown as ProgressComparisonReport;
}

function training(): TrainingGeneralAnalytics {
  return {
    performance: {
      summary: { improved: 7, stable: 2, declined: 1, comparable: 10, insufficient: 2, headline: "7 de 10 ejercicios subieron", context: null },
      exercises: [],
      findings: [{
        exerciseId: "press",
        name: "Press inclinado",
        muscleKey: "chest",
        muscleLabel: "Pecho",
        weightMode: "Peso total",
        status: "improved",
        reason: "comparable",
        signal: { kind: "more_load_same_reps", description: "+2,5 kg manteniendo 10 reps", currentValue: 20, referenceValue: 17.5, contextValue: 10 },
        primarySampleSize: 4,
        referenceSampleSize: 4,
        isPersonalRecord: false,
      }],
    },
    loadComparison: {} as ProgressComparisonReport,
    feelings: [],
  };
}

const customDefinition: MetricReportDefinition = {
  id: "focus-id",
  system_key: null,
  name: "Concentración",
  unit: "/ 10",
  value_type: "decimal",
  target_value: null,
  sort_order: 0,
  is_active: true,
  archived_at: null,
};

function baseInput() {
  return {
    period,
    training: null,
    nutrition: null,
    body: null,
    activity: null,
    relationships: [] as HighlightedRelationship[],
  };
}

describe("Progress Home V2 composition", () => {
  it("keeps the approved conceptual order", () => {
    expect(PROGRESS_HOME_SECTION_ORDER).toEqual([
      "Tu evolución",
      "Qué cambió",
      "Relaciones",
      "Tus hábitos",
      "Explorar tu progreso",
      "Revisar datos",
    ]);
  });

  it("prioritizes canonical training performance and concrete findings without repeating the summary", () => {
    const model = buildProgressHomeModel({ ...baseInput(), training: training() });
    expect(model.evolution[0]).toMatchObject({ id: "training.performance", value: "7 de 10 ejercicios subieron" });
    expect(model.changes[0]).toMatchObject({ label: "Press inclinado", description: "+2,5 kg manteniendo 10 reps" });
    expect(model.changes.some((item) => item.description === model.evolution[0]?.value)).toBe(false);
  });

  it("uses only comparable body changes and does not create empty rows for excluded data", () => {
    const body = {
      metrics: [
        { key: "body.weight", label: "Peso", unit: "kg", last: { value: 65.8 }, change: -1.2, current: [{}, {}] },
        { key: "body.waist", label: "Cintura", unit: "cm", last: null, change: null, current: [] },
      ],
      insights: [],
    } as unknown as BodyProgressReport;
    const model = buildProgressHomeModel({ ...baseInput(), body });
    expect(model.evolution).toHaveLength(1);
    expect(model.evolution[0]).toMatchObject({ id: "body.weight", value: "65,8 kg", detail: "−1,2 kg en el período" });
  });

  it("selects at most three cross-domain changes and ignores archived dynamic metrics", () => {
    const activityComparison = comparison([
      { key: "activity.daily.focus-id", label: "Concentración", definitionId: "focus-id", value: 8, insight: "6 → 8" },
      { key: "activity.daily.old", label: "Archivada", definitionId: "old", value: 5, insight: "4 → 5", active: false },
    ]);
    const nutritionComparison = comparison([{ key: "nutrition.protein", label: "Proteína", value: 151, insight: "133 g → 151 g" }]);
    const model = buildProgressHomeModel({
      ...baseInput(),
      training: training(),
      activity: { definitions: [customDefinition, { ...customDefinition, id: "old", name: "Archivada", is_active: false }], comparison: activityComparison },
      nutrition: {
        summary: {
          calories: { averageConsumed: null },
          protein: { averageConsumed: null },
        } as NutritionReportSummary,
        comparison: nutritionComparison,
      },
    });
    expect(model.changes).toHaveLength(3);
    expect(model.changes.map((item) => item.domain)).toEqual(["training", "activity", "nutrition"]);
    expect(model.changes.some((item) => item.label === "Archivada")).toBe(false);
  });

  it("keeps an explicit zero custom metric and excludes missing values", () => {
    const activityComparison = comparison([
      { key: "activity.daily.focus-id", label: "Concentración", definitionId: "focus-id", value: 0 },
      { key: "activity.daily.missing", label: "Sin dato", definitionId: "missing", value: null },
    ]);
    const model = buildProgressHomeModel({
      ...baseInput(),
      activity: { definitions: [customDefinition, { ...customDefinition, id: "missing", name: "Sin dato", sort_order: 1 }], comparison: activityComparison },
    });
    expect(model.habits).toHaveLength(1);
    expect(model.habits[0]).toMatchObject({ label: "Concentración", value: "0 / 10" });
  });

  it("limits relationship highlights without manufacturing fallback signals", () => {
    const highlights = Array.from({ length: 4 }, (_, index) => ({ pair: { aKey: `a${index}`, bKey: `b${index}` } })) as HighlightedRelationship[];
    expect(buildProgressHomeModel({ ...baseInput(), relationships: highlights }).relationships).toHaveLength(3);
    expect(buildProgressHomeModel(baseInput()).relationships).toEqual([]);
  });
});

describe("Progress Home period inheritance", () => {
  it("preserves native presets and exact dates for destinations without that preset", () => {
    const eightWeeks = resolveProgressPeriod({ preset: "8w" }, today);
    expect(progressHomeDestinationHref("training", eightWeeks)).toContain("period=8w");
    expect(progressHomeDestinationHref("relationships", eightWeeks)).toContain("period=8w");
    const nutrition = progressHomeDestinationHref("nutrition", eightWeeks);
    expect(nutrition).toContain("period=custom");
    expect(nutrition).toContain(`from=${eightWeeks.current.start}`);
    expect(nutrition).toContain(`to=${eightWeeks.current.end}`);
  });

  it("preserves a custom range across every analytical destination", () => {
    const custom = resolveProgressPeriod({ preset: "custom", from: "2026-08-01", to: "2026-08-31" }, today);
    for (const destination of ["training", "nutrition", "body", "activity", "relationships"] as const) {
      const href = progressHomeDestinationHref(destination, custom);
      expect(href).toContain("period=custom");
      expect(href).toContain("from=2026-08-01");
      expect(href).toContain("to=2026-08-31");
    }
  });

  it("returns from every domain without losing the resolved period", () => {
    expect(progressHomeHref({ preset: "8w", start: "2026-07-20", end: today })).toBe("/progress?period=8w");
    expect(progressHomeHref({ preset: "30", start: "2026-08-15", end: today })).toBe("/progress?period=30d");
    expect(progressHomeHref({ preset: "custom", start: "2026-08-01", end: "2026-08-31" })).toBe(
      "/progress?period=custom&from=2026-08-01&to=2026-08-31",
    );
  });
});
