// Pure contract shared with Expo. Dates are Córdoba calendar dates; endsOn is exclusive.
import { isNutritionDate } from './nutrition-day-contract';
import { configRecord as record, parseConfigFields, type PlanFields } from './nutrition-config-contract';

export const stageKinds = ['maintenance', 'deficit', 'surplus', 'recomposition', 'custom'] as const;
export type StageKind = typeof stageKinds[number];
export type StageFields = PlanFields & { kind: StageKind };
/**
 * Shape v2 (opt-in, `?targets=2`): the training extra also raises protein, and a stage may have no water goal of
 * its own (`baseWaterL: null`, then `trainingWaterDeltaL` is 0 and the Agua metric keeps the goal). v1 stays exact.
 */
export type StageFieldsV2 = Omit<PlanFields, 'baseWaterL'> & { baseWaterL: number | null; trainingProteinDeltaG: number; kind: StageKind };
export type StageDuration = { unit: 'weeks' | 'months'; value: number };
type StageMeta = {
  id: string; kind: StageKind | null; startsOn: string; endsOn: string | null;
  sequenceId: string | null; position: number | null; duration: StageDuration | null;
  status: 'past' | 'current' | 'upcoming';
};
export type NutritionStage = PlanFields & StageMeta;
export type NutritionStageV2 = Omit<StageFieldsV2, 'kind'> & StageMeta;
export type PlanSequence = { id: string; name: string; afterEnd: 'keep_last' | 'maintenance'; createdAt: string };
export type StageSuggestions = {
  expenditureKcal: number; maintenance: number; deficit: number; surplus: number;
  recomposition: null; custom: null;
};
export type NutritionStages<S = NutritionStage> = {
  today: string; listVersion: number; current: S | null; upcoming: S[];
  past: S[]; sequences: PlanSequence[]; suggestions: StageSuggestions | null;
};
export type NutritionStagesV2 = NutritionStages<NutritionStageV2>;
type IntentBase = { date: string; expectedListVersion: number; idempotencyKey: string };
export type StagesIntent<F = StageFields> = IntentBase & (
  { operation: 'replace_from_today'; stage: F; future_stages: 'keep' | 'cancel' }
  | { operation: 'schedule_sequence'; name: string; after_end: 'keep_last' | 'maintenance'; start_date: string;
      stages: (F & { duration: StageDuration })[]; maintenanceStage: F | null }
  | { operation: 'update_future'; stageId: string; stage: F; startsOn: string; duration: StageDuration | null }
  | { operation: 'delete_future'; stageId: string }
  | { operation: 'cancel_sequence'; sequenceId: string }
);
export type StagesIntentV2 = StagesIntent<StageFieldsV2>;
export type StagesResult<L = NutritionStages> =
  | { status: 'confirmed'; operation: StagesIntent['operation']; date: string; list: L }
  | { status: 'conflict'; error: 'STAGES_CHANGED' | 'STAGES_DAY_CHANGED' | 'IDEMPOTENCY_KEY_REUSED'; message: string; list: L }
  | { status: 'validation'; message: string };
export type StagesResultV2 = StagesResult<NutritionStagesV2>;
/** 1 = the original exact shape; 2 = the opt-in shape with the protein extra and optional water. */
export type StagesShape = 1 | 2;

const exact = (o: Record<string, unknown>, keys: string[]) => Object.keys(o).length === keys.length && keys.every(k => Object.hasOwn(o, k));
const integer = (v: unknown, min: number, max = Number.MAX_SAFE_INTEGER): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= min && v <= max;
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const kind = (v: unknown): v is StageKind => typeof v === 'string' && stageKinds.includes(v as StageKind);
const planKeys = ['name', 'baseWaterL', 'trainingCalorieDeltaKcal', 'trainingWaterDeltaL', 'weekdays'];
const keysFor = (shape: StagesShape) => shape === 2 ? [...planKeys, 'trainingProteinDeltaG'] : planKeys;
const twoDecimals = (v: unknown, max: number): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max && Math.abs(v * 100 - Math.round(v * 100)) < 1e-7;
/** v1: the configuration plan fields. v2: the same, plus the protein extra; water may be null only with no water extra. */
function plan(v: Record<string, unknown>, shape: StagesShape = 1): PlanFields | Omit<StageFieldsV2, 'kind'> | undefined {
  const noWater = shape === 2 && v.baseWaterL === null;
  const fields = parseConfigFields('plan', Object.fromEntries(planKeys.map(k => [k, noWater && k === 'baseWaterL' ? 0 : v[k]]))) as PlanFields | undefined;
  if (!fields || shape === 1) return fields;
  if (!twoDecimals(v.trainingProteinDeltaG, 1000) || (noWater && fields.trainingWaterDeltaL !== 0)) return;
  return { ...fields, baseWaterL: noWater ? null : fields.baseWaterL, trainingProteinDeltaG: v.trainingProteinDeltaG };
}

export function parseStageDuration(v: unknown): StageDuration | undefined {
  return record(v) && exact(v, ['unit', 'value']) && (v.unit === 'weeks' || v.unit === 'months') && integer(v.value, 1, v.unit === 'weeks' ? 104 : 24) ? v as StageDuration : undefined;
}
export function parseStageFields(v: unknown): StageFields | undefined;
export function parseStageFields(v: unknown, shape: 2): StageFieldsV2 | undefined;
export function parseStageFields(v: unknown, shape: StagesShape = 1): StageFields | StageFieldsV2 | undefined {
  if (!record(v) || !exact(v, [...keysFor(shape), 'kind']) || !kind(v.kind)) return;
  const fields = plan(v, shape);
  return fields && fields.name.length <= 80 ? { ...fields, kind: v.kind } as StageFields | StageFieldsV2 : undefined;
}
export function parseStagesIntent(v: unknown): StagesIntent | undefined;
export function parseStagesIntent(v: unknown, shape: 2): StagesIntentV2 | undefined;
export function parseStagesIntent(v: unknown, shape: StagesShape = 1): StagesIntent | StagesIntentV2 | undefined {
  const fields = (raw: unknown) => shape === 2 ? parseStageFields(raw, 2) : parseStageFields(raw);
  if (!record(v) || !isNutritionDate(v.date) || !integer(v.expectedListVersion, 0) || typeof v.idempotencyKey !== 'string' || !/^[A-Za-z0-9._:-]{1,128}$/.test(v.idempotencyKey)) return;
  const base = ['operation', 'date', 'expectedListVersion', 'idempotencyKey'];
  if (v.operation === 'replace_from_today' && exact(v, [...base, 'stage', 'future_stages']) && ['keep', 'cancel'].includes(String(v.future_stages))) {
    const stage = fields(v.stage);
    if (stage) return { ...v, stage } as StagesIntent;
  }
  if (v.operation === 'schedule_sequence' && exact(v, [...base, 'name', 'after_end', 'start_date', 'stages', 'maintenanceStage']) && typeof v.name === 'string' && v.name.trim().length >= 1 && v.name.trim().length <= 80
    && ['keep_last', 'maintenance'].includes(String(v.after_end)) && isNutritionDate(v.start_date) && Array.isArray(v.stages) && v.stages.length >= 1 && v.stages.length <= 24) {
    const stages = v.stages.map(s => {
      if (!record(s) || !exact(s, [...keysFor(shape), 'kind', 'duration'])) return;
      const { duration: raw, ...rest } = s, stage = fields(rest), duration = parseStageDuration(raw);
      return stage && duration ? { ...stage, duration } : undefined;
    });
    const maintenance = v.after_end === 'maintenance' ? fields(v.maintenanceStage) : null;
    if (stages.every(s => s !== undefined) && (v.after_end === 'maintenance' ? maintenance?.kind === 'maintenance' : v.maintenanceStage === null)) {
      return { ...v, name: v.name.trim(), stages, maintenanceStage: maintenance } as StagesIntent;
    }
  }
  if (v.operation === 'update_future' && exact(v, [...base, 'stageId', 'stage', 'startsOn', 'duration']) && uuid(v.stageId) && isNutritionDate(v.startsOn)) {
    const stage = fields(v.stage), duration = v.duration === null ? null : parseStageDuration(v.duration);
    if (stage && duration !== undefined) return { ...v, stage, duration } as StagesIntent;
  }
  if (v.operation === 'delete_future' && exact(v, [...base, 'stageId']) && uuid(v.stageId)) return v as StagesIntent;
  if (v.operation === 'cancel_sequence' && exact(v, [...base, 'sequenceId']) && uuid(v.sequenceId)) return v as StagesIntent;
}

function parseStage(v: unknown, today: string, status: NutritionStage['status'], shape: StagesShape): NutritionStage | NutritionStageV2 | undefined {
  if (!record(v) || !exact(v, [...keysFor(shape), 'id', 'kind', 'startsOn', 'endsOn', 'sequenceId', 'position', 'duration', 'status']) || !uuid(v.id)
    || (v.kind !== null && !kind(v.kind)) || !isNutritionDate(v.startsOn) || (v.endsOn !== null && (!isNutritionDate(v.endsOn) || v.endsOn <= v.startsOn))
    || (v.sequenceId === null ? v.position !== null || v.duration !== null : !uuid(v.sequenceId) || !integer(v.position, 1, 25))
    || (v.duration !== null && !parseStageDuration(v.duration)) || v.status !== status) return;
  if (status === 'upcoming' ? v.startsOn <= today : status === 'current' ? v.startsOn > today || (v.endsOn !== null && v.endsOn <= today) : v.endsOn === null || v.endsOn > today) return;
  const fields = plan(v, shape);
  return fields ? { ...v, ...fields } as NutritionStage | NutritionStageV2 : undefined;
}
export function parseNutritionStages(v: unknown): NutritionStages | undefined;
export function parseNutritionStages(v: unknown, shape: 2): NutritionStagesV2 | undefined;
export function parseNutritionStages(v: unknown, shape: StagesShape = 1): NutritionStages | NutritionStagesV2 | undefined {
  if (!record(v) || !exact(v, ['today', 'listVersion', 'current', 'upcoming', 'past', 'sequences', 'suggestions']) || !isNutritionDate(v.today) || !integer(v.listVersion, 0)
    || !Array.isArray(v.upcoming) || !Array.isArray(v.past) || v.past.length > 24 || !Array.isArray(v.sequences)) return;
  const current = v.current === null ? null : parseStage(v.current, v.today, 'current', shape);
  const upcoming = v.upcoming.map(s => parseStage(s, v.today as string, 'upcoming', shape));
  const past = v.past.map(s => parseStage(s, v.today as string, 'past', shape));
  if (current === undefined || upcoming.some(s => !s) || past.some(s => !s)) return;
  const all = [...past].reverse().concat(current ? [current] : [], upcoming) as StageMeta[];
  if (new Set(all.map(s => s.id)).size !== all.length || all.some((s, i) => i < all.length - 1 ? s.endsOn !== all[i + 1].startsOn || s.startsOn >= all[i + 1].startsOn : s.endsOn !== null)) return;
  if (v.sequences.some(s => !record(s) || !exact(s, ['id', 'name', 'afterEnd', 'createdAt']) || !uuid(s.id) || typeof s.name !== 'string' || !s.name.trim()
    || !['keep_last', 'maintenance'].includes(String(s.afterEnd)) || typeof s.createdAt !== 'string' || !Number.isFinite(Date.parse(s.createdAt)))) return;
  const sequences = v.sequences as PlanSequence[];
  if (new Set(sequences.map(s => s.id)).size !== sequences.length || all.some(s => s.sequenceId !== null && !sequences.some(q => q.id === s.sequenceId))) return;
  if (v.suggestions !== null) {
    const s = v.suggestions;
    if (!record(s) || !exact(s, ['expenditureKcal', 'maintenance', 'deficit', 'surplus', 'recomposition', 'custom']) || !integer(s.expenditureKcal, 1, 50000)
      || s.maintenance !== s.expenditureKcal || s.deficit !== Math.round(s.expenditureKcal * 0.9) || s.surplus !== Math.round(s.expenditureKcal * 1.05) || s.recomposition !== null || s.custom !== null) return;
  }
  return { ...v, current, upcoming, past } as NutritionStages | NutritionStagesV2;
}
export function parseStagesResult(v: unknown): StagesResult | undefined;
export function parseStagesResult(v: unknown, shape: 2): StagesResultV2 | undefined;
export function parseStagesResult(v: unknown, shape: StagesShape = 1): StagesResult | StagesResultV2 | undefined {
  const parseList = (raw: unknown) => shape === 2 ? parseNutritionStages(raw, 2) : parseNutritionStages(raw);
  if (!record(v)) return;
  if (v.status === 'validation' && exact(v, ['status', 'message']) && typeof v.message === 'string' && v.message.length > 0) return v as StagesResult;
  if (v.status === 'confirmed' && exact(v, ['status', 'operation', 'date', 'list']) && ['replace_from_today', 'schedule_sequence', 'update_future', 'delete_future', 'cancel_sequence'].includes(String(v.operation)) && isNutritionDate(v.date)) {
    const list = parseList(v.list);
    if (list && list.today === v.date) return { ...v, list } as StagesResult | StagesResultV2;
  }
  if (v.status === 'conflict' && exact(v, ['status', 'error', 'message', 'list']) && ['STAGES_CHANGED', 'STAGES_DAY_CHANGED', 'IDEMPOTENCY_KEY_REUSED'].includes(String(v.error)) && typeof v.message === 'string' && v.message.length > 0) {
    const list = parseList(v.list);
    if (list) return { ...v, list } as StagesResult | StagesResultV2;
  }
}
