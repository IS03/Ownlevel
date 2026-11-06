import {
  BODY_MEASUREMENT_FIELDS,
  BODY_MEASUREMENT_LABELS,
  type BodyMeasurement,
  type BodyMeasurementField,
} from "../body-measurement-types";
import { isValidBodyWeightKg, type WeightHistoryPoint } from "../weight-history";
import {
  BODY_PROGRESS_METRICS,
  bodyMeasurementSamples,
  weightMetricSamples,
  type ProgressComparisonEligibility,
  type ProgressMetricDefinition,
  type ProgressPeriodRange,
} from "./analytics";
import { buildProgressComparison } from "./comparisons";

export type BodyMetricKey = `body.${string}`;
export type BodyObservationProvenance = "manual" | "imported" | "profile";
export type BodyTrendDirection = "increased" | "decreased" | "stable" | "variable" | "unavailable";
export type BodyTrendConfidence = "unavailable" | "limited" | "supported";

export type BodyObservation = {
  id: string;
  date: string;
  value: number;
  unit: "kg" | "cm";
  provenance: BodyObservationProvenance;
  provenanceLabel: string;
  qualityStatus: "verified" | "suspect";
  qualityNote: string | null;
};

export type BodyMetricProgress = {
  key: BodyMetricKey;
  field: "weight_kg" | BodyMeasurementField;
  definition: ProgressMetricDefinition;
  label: string;
  unit: "kg" | "cm";
  latest: BodyObservation | null;
  current: BodyObservation[];
  reference: BodyObservation[];
  change: number | null;
  first: BodyObservation | null;
  last: BodyObservation | null;
  trend: BodyTrendDirection;
  confidence: BodyTrendConfidence;
  comparisonEligibility: ProgressComparisonEligibility;
  /** Change within the reference period (same "change" aggregation), when it has ≥2 observations. */
  referenceChange: number | null;
};

export type BodyProgressInsight = {
  metricKey: BodyMetricKey;
  title: string;
  description: string;
};

export type BodySideDifference = {
  kind: "arms" | "thighs" | "calves";
  label: string;
  right: BodyObservation;
  left: BodyObservation;
  differenceCm: number;
};

export type BodyProgressReport = {
  period: ProgressPeriodRange;
  referencePeriod: ProgressPeriodRange;
  metrics: BodyMetricProgress[];
  state: BodyMetricProgress[];
  insights: BodyProgressInsight[];
  sideDifferences: BodySideDifference[];
  excludedSuspectCount: number;
  /** Weights stored as 0 kg (or otherwise not a weight) inside the period: kept in the history, left out of the analysis. */
  excludedInvalidWeightCount: number;
};

const BODY_PRIORITY = [
  "body.weight",
  "body.waist",
  "body.abdomen",
  "body.chest",
  "body.hip",
  "body.arm_right",
  "body.arm_left",
  "body.thigh_right",
  "body.thigh_left",
  "body.calf_right",
  "body.calf_left",
  "body.arm",
  "body.thigh",
] as const;

const metricByKey = new Map(BODY_PROGRESS_METRICS.map((metric) => [metric.key, metric]));

function finite(value: number | null): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function inRange(date: string, period: ProgressPeriodRange) {
  return date >= period.start && date <= period.end;
}

function measurementProvenance(entry: BodyMeasurement) {
  if (entry.import_run_id || entry.legacy_import_source) {
    return {
      provenance: "imported" as const,
      provenanceLabel: entry.legacy_import_source
        ? `Importado · ${entry.legacy_import_source}`
        : "Dato histórico importado",
    };
  }
  return { provenance: "manual" as const, provenanceLabel: "Registro manual" };
}

export function bodyMetricObservations(input: {
  metric: ProgressMetricDefinition;
  weightHistory: readonly WeightHistoryPoint[];
  measurements: readonly BodyMeasurement[];
  includeSuspect?: boolean;
}): BodyObservation[] {
  if (input.metric.source.adapter === "weight_history") {
    return input.weightHistory
      .filter((entry) => isValidBodyWeightKg(entry.weight_kg))
      .map((entry) => ({
        id: entry.id,
        date: entry.log_date,
        value: entry.weight_kg,
        unit: "kg" as const,
        provenance: "manual" as const,
        provenanceLabel: "Registro de peso",
        qualityStatus: "verified" as const,
        qualityNote: null,
      }))
      .sort((left, right) => left.date.localeCompare(right.date));
  }

  const field = input.metric.source.field as BodyMeasurementField;
  return input.measurements
    .filter((entry) => input.includeSuspect || entry.quality_status !== "suspect")
    .flatMap((entry) => {
      const value = entry[field];
      if (!finite(value)) return [];
      const provenance = measurementProvenance(entry);
      return [{
        id: `${entry.id}:${field}`,
        date: entry.measured_on,
        value,
        unit: "cm" as const,
        ...provenance,
        qualityStatus: entry.quality_status,
        qualityNote: entry.quality_note,
      }];
    })
    .sort((left, right) => left.date.localeCompare(right.date));
}

export function bodyTrend(observations: readonly BodyObservation[]): {
  direction: BodyTrendDirection;
  confidence: BodyTrendConfidence;
} {
  if (observations.length < 2) return { direction: "unavailable", confidence: "unavailable" };
  const net = observations.at(-1)!.value - observations[0]!.value;
  if (observations.length === 2) {
    return {
      direction: net === 0 ? "stable" : net > 0 ? "increased" : "decreased",
      confidence: "limited",
    };
  }
  if (net === 0) return { direction: "stable", confidence: "supported" };
  const direction = Math.sign(net);
  const materialSteps = observations.slice(1).map((entry, index) => Math.sign(entry.value - observations[index]!.value));
  const supporting = materialSteps.filter((step) => step === 0 || step === direction).length;
  return {
    direction: supporting / materialSteps.length >= 2 / 3
      ? direction > 0 ? "increased" : "decreased"
      : "variable",
    confidence: "supported",
  };
}

function metricProgress(input: {
  metric: ProgressMetricDefinition;
  weightHistory: readonly WeightHistoryPoint[];
  measurements: readonly BodyMeasurement[];
  period: ProgressPeriodRange;
  referencePeriod: ProgressPeriodRange;
}): BodyMetricProgress {
  const all = bodyMetricObservations(input);
  const current = all.filter((entry) => inRange(entry.date, input.period));
  const reference = all.filter((entry) => inRange(entry.date, input.referencePeriod));
  const trend = bodyTrend(current);
  const field = input.metric.source.adapter === "weight_history"
    ? "weight_kg"
    : input.metric.source.field as BodyMeasurementField;

  return {
    key: input.metric.key as BodyMetricKey,
    field,
    definition: input.metric,
    label: input.metric.label,
    unit: input.metric.unit as "kg" | "cm",
    latest: all.at(-1) ?? null,
    current,
    reference,
    change: current.length >= 2 ? current.at(-1)!.value - current[0]!.value : null,
    first: current[0] ?? null,
    last: current.at(-1) ?? null,
    trend: trend.direction,
    confidence: trend.confidence,
    comparisonEligibility: { status: "insufficient_data", reason: "current_period_empty" },
    referenceChange: null,
  };
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 }).format(value);
}

function insightFor(metric: BodyMetricProgress): BodyProgressInsight | null {
  if (metric.change === null || metric.first === null || metric.last === null) return null;
  if (metric.change === 0) {
    return { metricKey: metric.key, title: metric.label, description: "Se mantuvo sin cambios entre mediciones comparables." };
  }
  const verb = metric.change > 0 ? "subió" : "bajó";
  return {
    metricKey: metric.key,
    title: metric.label,
    description: `${verb[0]!.toUpperCase()}${verb.slice(1)} ${formatNumber(Math.abs(metric.change))} ${metric.unit} entre ${metric.current.length} mediciones reales.`,
  };
}

function sideDifference(
  metrics: readonly BodyMetricProgress[],
  kind: BodySideDifference["kind"],
  label: string,
  rightKey: BodyMetricKey,
  leftKey: BodyMetricKey,
): BodySideDifference | null {
  const right = metrics.find((metric) => metric.key === rightKey)?.latest ?? null;
  const left = metrics.find((metric) => metric.key === leftKey)?.latest ?? null;
  if (!right || !left) return null;
  return { kind, label, right, left, differenceCm: right.value - left.value };
}

export function buildBodyProgressReport(input: {
  weightHistory: readonly WeightHistoryPoint[];
  currentWeightKg: number | null;
  measurements: readonly BodyMeasurement[];
  period: ProgressPeriodRange;
  referencePeriod: ProgressPeriodRange;
  selectedMetricKeys?: readonly string[];
}): BodyProgressReport {
  const rawMetrics = BODY_PRIORITY.flatMap((key) => {
    const definition = metricByKey.get(key);
    if (!definition) return [];
    return [metricProgress({ ...input, metric: definition })];
  });
  const samplesByMetric = new Map(rawMetrics.map((metric) => [
    metric.key,
    metric.definition.source.adapter === "weight_history"
      ? weightMetricSamples(input.weightHistory)
      : bodyMeasurementSamples(metric.field as BodyMeasurementField, input.measurements),
  ]));
  const comparison = buildProgressComparison({
    metrics: rawMetrics.map((metric) => metric.definition),
    selectedMetricKeys: rawMetrics.map((metric) => metric.key),
    samplesByMetric,
    primaryPeriod: input.period,
    primaryLabel: "Período actual",
    reference: { type: "other_period", period: input.referencePeriod, label: "Referencia" },
  });
  const comparisonByKey = new Map(comparison.results.map((result) => [result.metric.key, result]));
  const metrics = rawMetrics.map((metric) => ({
    ...metric,
    comparisonEligibility: comparisonByKey.get(metric.key)?.eligibility ?? metric.comparisonEligibility,
    referenceChange: comparisonByKey.get(metric.key)?.valueB ?? null,
  }));
  const weight = metrics.find((metric) => metric.key === "body.weight");
  if (weight && !weight.latest && isValidBodyWeightKg(input.currentWeightKg)) {
    weight.latest = {
      id: "profile-current-weight",
      date: "",
      value: input.currentWeightKg,
      unit: "kg",
      provenance: "profile",
      provenanceLabel: "Peso actual del perfil",
      qualityStatus: "verified",
      qualityNote: null,
    };
  }
  const selected = new Set(input.selectedMetricKeys ?? []);
  const insightCandidates = metrics.filter((metric) => selected.size === 0 || selected.has(metric.key));
  const changed = insightCandidates.filter((metric) => metric.change !== null && metric.change !== 0);
  const stable = insightCandidates.filter((metric) => metric.change === 0);
  const insights = [...changed, ...stable].flatMap((metric) => {
    const insight = insightFor(metric);
    return insight ? [insight] : [];
  }).slice(0, 3);
  const sideDifferences = [
    sideDifference(metrics, "arms", "Brazos", "body.arm_right", "body.arm_left"),
    sideDifference(metrics, "thighs", "Muslos", "body.thigh_right", "body.thigh_left"),
    sideDifference(metrics, "calves", "Pantorrillas", "body.calf_right", "body.calf_left"),
  ].filter((value): value is BodySideDifference => value !== null);

  return {
    period: input.period,
    referencePeriod: input.referencePeriod,
    metrics,
    state: metrics.filter((metric) => metric.latest !== null),
    insights,
    sideDifferences,
    excludedSuspectCount: input.measurements.filter((entry) => (
      entry.quality_status === "suspect" && inRange(entry.measured_on, input.period)
    )).length,
    excludedInvalidWeightCount: input.weightHistory.filter((entry) => (
      !isValidBodyWeightKg(entry.weight_kg) && inRange(entry.log_date, input.period)
    )).length,
  };
}

export function bodyAvailableMetricDefinitions(input: {
  weightHistory: readonly WeightHistoryPoint[];
  currentWeightKg: number | null;
  measurements: readonly BodyMeasurement[];
}): ProgressMetricDefinition[] {
  return BODY_PROGRESS_METRICS.filter((metric) => {
    // Any stored weight keeps the metric listed, a 0 kg one included: its record must stay reachable to correct it.
    if (metric.key === "body.weight") return input.weightHistory.length > 0 || isValidBodyWeightKg(input.currentWeightKg);
    return bodyMetricObservations({ metric, weightHistory: input.weightHistory, measurements: input.measurements }).length > 0;
  });
}

export function bodyMetricLabel(field: BodyMeasurementField) {
  return BODY_MEASUREMENT_LABELS[field];
}

export const BODY_ANALYTICS_FIELDS = BODY_MEASUREMENT_FIELDS;
