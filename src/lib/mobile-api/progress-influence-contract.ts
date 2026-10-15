import { addProgressIsoDays, progressRangeDays } from "../progress/analytics/periods";
import { isNutritionDate } from "./nutrition-day-contract";
import { parseProgressPeriod, type MetricValueType, type ProgressPeriod } from "./progress-contract";
import { EXPLORE_NUTRITION, EXPLORE_TRAINING, parseExploreMeasure, type ExploreMeasure } from "./progress-explore-contract";

export const INFLUENCE_SPLITS = [...EXPLORE_NUTRITION, ...EXPLORE_TRAINING, "metric.<uuid>", "day.training", "day.work"] as const;
export const INFLUENCE_OUTCOMES = [...EXPLORE_NUTRITION, ...EXPLORE_TRAINING, "metric.<uuid>"] as const;
export type InfluenceMeasure = Exclude<ExploreMeasure, { kind: "body" | "exercise" }> | { kind: "day"; key: "day.training" | "day.work" };
export type InfluenceDefinition = { split: string; cut: string; lag: 0 | 1 | 2; outcome: string };
export type InfluenceMeasureInfo = { key: string; label: string; unit: string | null; valueType: MetricValueType | "boolean" };
export type InfluenceEvidence = "low" | "moderate" | "clear";
/** Group dates are split-day D, inside the selected period; the outcome belongs to D + lag. */
export type InfluenceResult = {
  status: "insufficient"; pairs: number; needed: 14; perGroupNeeded: 5; missing: "split" | "outcome";
  cut: number | null; low: { days: string[] }; high: { days: string[] };
} | {
  status: "ok"; pairs: number; cut: number | null; low: { days: string[]; average: number }; high: { days: string[]; average: number };
  difference: number; differencePercent: number | null; evidence: InfluenceEvidence;
};
export type InfluenceReading = {
  definition: InfluenceDefinition; measure: { split: InfluenceMeasureInfo; outcome: InfluenceMeasureInfo };
  current: InfluenceResult; reference: InfluenceResult | null;
};
export type ProgressInfluence = InfluenceReading & { today: string; period: ProgressPeriod };
export const INFLUENCE_SUGGESTED_KEYS = ["sleep_sets", "carbs_sets", "training_kcal", "steps_sleep", "training_water"] as const;
export type InfluenceSuggestedKey = typeof INFLUENCE_SUGGESTED_KEYS[number];
export type ProgressInfluenceSuggested = { today: string; period: ProgressPeriod; questions: (InfluenceReading & { key: InfluenceSuggestedKey })[] };

export function parseInfluenceMeasure(key: string, role: "split" | "outcome"): InfluenceMeasure | undefined {
  if (role === "split" && (key === "day.training" || key === "day.work")) return { kind: "day", key };
  const measure = parseExploreMeasure(key);
  return measure && measure.kind !== "body" && measure.kind !== "exercise" ? measure : undefined;
}
export function influenceCutValue(cut: string): number | undefined {
  if (!/^gte:[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(cut)) return;
  const n = Number(cut.slice(4));
  return Number.isFinite(n) ? n : undefined;
}
export function validInfluenceDefinition(d: InfluenceDefinition): boolean {
  const split = parseInfluenceMeasure(d.split, "split"), outcome = parseInfluenceMeasure(d.outcome, "outcome");
  return !!split && !!outcome && [0, 1, 2].includes(d.lag) && !(d.split === d.outcome && d.lag === 0)
    && (split.kind === "day" ? d.cut === "yes" : d.cut === "median" || influenceCutValue(d.cut) !== undefined);
}

const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const keys = (v: Record<string, unknown>, names: readonly string[]) => Object.keys(v).length === names.length && names.every(n => n in v);
const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const count = (v: unknown): v is number => num(v) && Number.isInteger(v) && v >= 0;
const close = (a: number, b: number) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
function definition(v: unknown): InfluenceDefinition | undefined {
  if (!record(v) || !keys(v, ["split", "cut", "lag", "outcome"]) || typeof v.split !== "string" || typeof v.cut !== "string" || typeof v.outcome !== "string" || !num(v.lag)) return;
  return validInfluenceDefinition(v as InfluenceDefinition) ? v as InfluenceDefinition : undefined;
}
function measure(v: unknown, key: string, role: "split" | "outcome"): InfluenceMeasureInfo | undefined {
  if (!record(v) || !keys(v, ["key", "label", "unit", "valueType"]) || v.key !== key || typeof v.label !== "string" || !v.label.trim()
    || !(v.unit === null || typeof v.unit === "string")) return;
  const m = parseInfluenceMeasure(key, role);
  if (!m || !(m.kind === "day" ? v.valueType === "boolean" : ["integer", "decimal", "duration"].includes(String(v.valueType)))) return;
  return v as InfluenceMeasureInfo;
}
function result(v: unknown, range: { start: string; end: string }, d: InfluenceDefinition, today: string): InfluenceResult | undefined {
  if (!record(v) || !count(v.pairs) || !(v.cut === null || num(v.cut))) return;
  const ok = v.status === "ok";
  if (!keys(v, ok ? ["status", "pairs", "cut", "low", "high", "difference", "differencePercent", "evidence"]
    : ["status", "pairs", "cut", "low", "high", "needed", "perGroupNeeded", "missing"])) return;
  if (d.cut === "yes" ? v.cut !== null : d.cut === "median" ? (v.pairs === 0) !== (v.cut === null) : v.cut !== influenceCutValue(d.cut)) return;
  const groups: { days: string[]; average?: number }[] = [];
  for (const group of [v.low, v.high]) {
    if (!record(group) || !keys(group, ok ? ["days", "average"] : ["days"]) || !Array.isArray(group.days) || (ok && !num(group.average))) return;
    const ds: string[] = [];
    for (const day of group.days) {
      if (!isNutritionDate(day) || day < range.start || day > range.end || addProgressIsoDays(day, d.lag) >= today || (ds.length && day <= ds[ds.length - 1])) return;
      ds.push(day);
    }
    groups.push({ days: ds, ...(ok ? { average: group.average as number } : {}) });
  }
  const allDays = groups.flatMap(g => g.days);
  if (allDays.length !== v.pairs || new Set(allDays).size !== allDays.length) return;
  const sufficient = v.pairs >= 14 && groups.every(g => g.days.length >= 5);
  if (ok) {
    if (!sufficient || !["low", "moderate", "clear"].includes(String(v.evidence)) || !num(v.difference)
      || !(v.differencePercent === null || num(v.differencePercent))) return;
    const low = groups[0].average!, high = groups[1].average!;
    if (!close(v.difference, high - low) || (low === 0 ? v.differencePercent !== null
      : !num(v.differencePercent) || !close(v.differencePercent, (high - low) / low * 100)) || (v.evidence === "clear" && v.pairs < 30)) return;
  } else if (v.status !== "insufficient" || sufficient || v.needed !== 14 || v.perGroupNeeded !== 5 || !["split", "outcome"].includes(String(v.missing))) return;
  return v as InfluenceResult;
}
function reading(v: Record<string, unknown>, period: ProgressPeriod, today: string): InfluenceReading | undefined {
  const d = definition(v.definition), m = v.measure;
  if (!d || !record(m) || !keys(m, ["split", "outcome"])) return;
  const split = measure(m.split, d.split, "split"), outcome = measure(m.outcome, d.outcome, "outcome");
  const current = result(v.current, period, d, today);
  const reference = v.reference === null ? null : result(v.reference, { start: period.previousStart, end: period.previousEnd }, d, today);
  return split && outcome && current && reference !== undefined ? { definition: d, measure: { split, outcome }, current, reference } : undefined;
}
function header(v: Record<string, unknown>): { today: string; period: ProgressPeriod } | undefined {
  const period = parseProgressPeriod(v.period);
  return isNutritionDate(v.today) && period && period.end <= v.today && period.previousStart <= period.previousEnd
    && period.days === progressRangeDays(period) && period.includesToday === (period.end === v.today) ? { today: v.today, period } : undefined;
}
export function parseProgressInfluence(v: unknown): ProgressInfluence | undefined {
  if (!record(v) || !keys(v, ["today", "period", "definition", "measure", "current", "reference"])) return;
  const h = header(v); if (!h) return;
  const r = reading(v, h.period, h.today);
  return r ? { ...h, ...r } : undefined;
}
export function parseProgressInfluenceSuggested(v: unknown): ProgressInfluenceSuggested | undefined {
  if (!record(v) || !keys(v, ["today", "period", "questions"]) || !Array.isArray(v.questions)) return;
  const h = header(v); if (!h) return;
  const questions: ProgressInfluenceSuggested["questions"] = [];
  for (const q of v.questions) {
    if (!record(q) || !keys(q, ["key", "definition", "measure", "current", "reference"]) || !(INFLUENCE_SUGGESTED_KEYS as readonly unknown[]).includes(q.key)) return;
    const r = reading(q, h.period, h.today); if (!r) return;
    if (questions.some(x => x.key === q.key) || (questions.length > 0 && (questions[0].reference === null) !== (r.reference === null))) return;
    questions.push({ key: q.key as InfluenceSuggestedKey, ...r });
  }
  return { ...h, questions };
}
