import type { ProgressMetricDefinition, ProgressMetricSample } from "../analytics";
import type {
  RelationshipPair,
  RelationshipRole,
  RelationshipTemporalProfile,
  RelationshipVariable,
} from "./types";

export const TRAINING_PERFORMANCE_RELATIONSHIP_KEY = "training.performance.comparable";

const EXCLUDED_METRICS = new Set([
  "nutrition.calorie_target",
  "nutrition.expenditure",
  "training.load.sets_per_session",
  "training.load.volume",
  "training.performance.best_weight",
  "training.performance.best_reps",
  "training.performance.reps_same_load",
  "training.performance.best_set",
  "training.performance.session_volume",
  "training.performance.prs",
]);

const NUTRITION_EXPOSURES = new Set([
  "nutrition.calories",
  "nutrition.protein",
  "nutrition.carbs",
  "nutrition.fat",
  "nutrition.energy_balance",
]);

function systemKey(metric: ProgressMetricDefinition): string | null {
  return typeof metric.metadata?.systemKey === "string" ? metric.metadata.systemKey : null;
}

function rolesFor(metric: ProgressMetricDefinition): readonly RelationshipRole[] {
  if (metric.domain === "body") return ["outcome"];
  if (metric.domain === "training") return ["outcome"];
  if (metric.domain === "nutrition") return ["exposure"];
  return ["exposure", "outcome"];
}

export function buildRelationshipVariableCatalog(input: {
  metrics: readonly ProgressMetricDefinition[];
  samplesByMetric: ReadonlyMap<string, readonly ProgressMetricSample[]>;
  performanceSampleSize: number;
}): RelationshipVariable[] {
  const variables = input.metrics
    .filter((metric) => !EXCLUDED_METRICS.has(metric.key))
    .filter((metric) => metric.domain !== "nutrition" || NUTRITION_EXPOSURES.has(metric.key))
    .map((metric): RelationshipVariable => ({
      key: metric.key,
      metricKey: metric.key,
      domain: metric.domain,
      label: metric.label,
      unit: metric.unit,
      metric,
      roles: rolesFor(metric),
      valueKind: "numeric",
      systemKey: systemKey(metric),
      isActive: metric.metadata?.isActive !== false,
      sampleSize: (input.samplesByMetric.get(metric.key) ?? []).filter((sample) => sample.value !== null).length,
    }));

  variables.push({
    key: TRAINING_PERFORMANCE_RELATIONSHIP_KEY,
    metricKey: TRAINING_PERFORMANCE_RELATIONSHIP_KEY,
    domain: "training",
    label: "Rendimiento comparable",
    unit: "% que subió",
    metric: null,
    roles: ["outcome"],
    valueKind: "training_performance",
    systemKey: null,
    isActive: true,
    sampleSize: input.performanceSampleSize,
  });

  return variables.sort((left, right) => {
    const domainOrder = { nutrition: 0, training: 1, body: 2, activity: 3 };
    if (left.isActive !== right.isActive) return left.isActive ? -1 : 1;
    return domainOrder[left.domain] - domainOrder[right.domain] || left.label.localeCompare(right.label, "es-AR");
  });
}

const sameDay: RelationshipTemporalProfile = {
  family: "acute",
  kind: "same_day",
  label: "Registros del mismo día",
};

function nextSession(label: string): RelationshipTemporalProfile {
  return { family: "acute", kind: "same_day_or_next_session", maximumLagDays: 1, label };
}

function chronic(
  windowDays: 7 | 14 | 28,
  unit: "week" | "measurement",
  label: string,
  options: { exposureAggregation?: "average" | "sum"; outcomeAggregation?: "median" | "sum" } = {},
): RelationshipTemporalProfile {
  return {
    family: "chronic",
    kind: "trailing_window",
    windowDays,
    unit,
    exposureAggregation: options.exposureAggregation ?? "average",
    outcomeAggregation: options.outcomeAggregation ?? "median",
    label,
  };
}

/**
 * Compatibility is explicit and identity-based. Metric labels and free-text
 * units never decide temporal semantics.
 */
export function relationshipPairFor(
  a: RelationshipVariable,
  b: RelationshipVariable,
): RelationshipPair | null {
  if (a.key === b.key || !a.roles.includes("exposure") || !b.roles.includes("outcome")) return null;

  if (a.domain === "activity" && b.domain === "activity") {
    return { aKey: a.key, bKey: b.key, temporal: sameDay, symmetric: true, relevance: 40 };
  }
  if (a.domain === "nutrition" && b.domain === "activity") {
    return { aKey: a.key, bKey: b.key, temporal: sameDay, symmetric: false, relevance: 48 };
  }
  if (a.domain === "activity" && b.domain === "nutrition") {
    return { aKey: a.key, bKey: b.key, temporal: sameDay, symmetric: false, relevance: 44 };
  }

  if (b.key === TRAINING_PERFORMANCE_RELATIONSHIP_KEY) {
    if (a.key === "nutrition.carbs") {
      return { aKey: a.key, bKey: b.key, temporal: nextSession("Valor del día o del día previo → próxima sesión"), symmetric: false, relevance: 100 };
    }
    if (a.domain === "activity" && (a.systemKey === "sleep" || a.systemKey === "water")) {
      return { aKey: a.key, bKey: b.key, temporal: nextSession("Métrica diaria → próxima sesión"), symmetric: false, relevance: 95 };
    }
    if (a.key === "nutrition.protein" || a.key === "nutrition.energy_balance") {
      return { aKey: a.key, bKey: b.key, temporal: chronic(a.key === "nutrition.protein" ? 14 : 28, "week", "Exposición previa → rendimiento semanal comparable", { exposureAggregation: a.key === "nutrition.energy_balance" ? "sum" : "average" }), symmetric: false, relevance: 90 };
    }
  }

  if (b.domain === "training" && b.valueKind === "numeric") {
    if (b.key === "training.load.sessions" && (a.key === "nutrition.calories" || a.domain === "activity" && a.systemKey !== null)) {
      return { aKey: a.key, bKey: b.key, temporal: chronic(7, "week", "Exposición de la semana previa → sesiones semanales", { outcomeAggregation: "sum" }), symmetric: false, relevance: 60 };
    }
    if (a.key === "nutrition.carbs" || a.key === "nutrition.calories") {
      return { aKey: a.key, bKey: b.key, temporal: nextSession("Nutrición del día o día previo → próxima sesión"), symmetric: false, relevance: 72 };
    }
    if (a.domain === "activity" && (a.systemKey === "sleep" || a.systemKey === "water")) {
      return { aKey: a.key, bKey: b.key, temporal: nextSession("Métrica diaria → próxima sesión"), symmetric: false, relevance: 70 };
    }
  }

  if (b.domain === "body" && a.domain === "nutrition") {
    const days = a.key === "nutrition.energy_balance" ? 28 : 14;
    return { aKey: a.key, bKey: b.key, temporal: chronic(days, "measurement", `${a.key === "nutrition.energy_balance" ? "Balance acumulado" : "Promedio"} de los ${days} días previos → cambio entre mediciones reales`, { exposureAggregation: a.key === "nutrition.energy_balance" ? "sum" : "average" }), symmetric: false, relevance: a.key === "nutrition.energy_balance" && b.key === "body.weight" ? 98 : 78 };
  }

  return null;
}

export function buildRelationshipPairs(variables: readonly RelationshipVariable[]): RelationshipPair[] {
  return variables.flatMap((a) => variables.flatMap((b) => {
    const pair = relationshipPairFor(a, b);
    return pair ? [pair] : [];
  }));
}

export function compatibleRelationshipOutcomes(
  aKey: string,
  variables: readonly RelationshipVariable[],
  pairs: readonly RelationshipPair[],
): RelationshipVariable[] {
  const keys = new Set(pairs.filter((pair) => pair.aKey === aKey).map((pair) => pair.bKey));
  return variables.filter((variable) => keys.has(variable.key));
}
