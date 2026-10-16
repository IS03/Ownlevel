import {
  METRIC_DEFINITION_VALUE_TYPES, parseMetricDefinition, parseMetricDefinitionIntent, parseMetricDefinitionReceipt, parseMetricOrderIntent, parseMetricOrderReceipt,
  type MetricDefinition, type MetricDefinitionIntent, type MetricDefinitionReceipt, type MetricOrderIntent, type MetricOrderReceipt,
} from '@/api/metric-definitions';
import { NutritionIntentRepository, type NutritionStoragePort } from '@/nutrition/intent-repository';
import type { DefinitionDraft } from './definitions-model';

// One durable definitions intent at a time, persisted BEFORE sending. No queue,
// no automatic transmission: recovery replays the same key only on request.
export type DefinitionEditor = { mode: 'create' | 'edit'; baseline: MetricDefinition | null; draft: DefinitionDraft };
export type StoredDefinitionIntent =
  | { version: 1; kind: 'definition'; intent: MetricDefinitionIntent; editor: DefinitionEditor | null; receipt?: MetricDefinitionReceipt }
  | { version: 1; kind: 'order'; intent: MetricOrderIntent; receipt?: MetricOrderReceipt };

const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const DRAFT_KEYS = ['name', 'valueType', 'unit', 'target', 'hours', 'minutes'] as const;
function parseEditor(v: unknown): DefinitionEditor | null | undefined {
  if (v === null) return null;
  if (!record(v) || (v.mode !== 'create' && v.mode !== 'edit') || !record(v.draft)) return;
  const draft = v.draft;
  const extended = Object.hasOwn(draft,'icon');
  if (Object.keys(draft).length !== DRAFT_KEYS.length + (extended ? 4 : 0) || !DRAFT_KEYS.every(k => typeof draft[k] === 'string')
    || (extended && !((draft.icon===null || typeof draft.icon==='string') && ['quickValue','quickHours','quickMinutes'].every(k=>typeof draft[k]==='string')))
    || !METRIC_DEFINITION_VALUE_TYPES.includes(draft.valueType as never)) return;
  const baseline = v.baseline === null ? null : parseMetricDefinition(v.baseline);
  if (baseline === undefined || (v.mode === 'edit') !== (baseline !== null)) return;
  return { mode: v.mode, baseline, draft: {...draft,...(!extended ? {icon:baseline?.icon??null,quickValue:'',quickHours:'',quickMinutes:''}: {})} as DefinitionDraft };
}
export function parseStoredDefinitionIntent(v: unknown): StoredDefinitionIntent {
  if (!record(v) || v.version !== 1) throw new Error('Invalid definitions intent');
  if (v.kind === 'definition') {
    const intent = parseMetricDefinitionIntent(v.intent), editor = parseEditor(v.editor);
    const receipt = v.receipt === undefined ? undefined : parseMetricDefinitionReceipt(v.receipt);
    if (intent && editor !== undefined && (v.receipt === undefined || (receipt && receipt.operation === intent.operation))) {
      return { version: 1, kind: 'definition', intent, editor, ...(receipt ? { receipt } : {}) };
    }
  }
  if (v.kind === 'order') {
    const intent = parseMetricOrderIntent(v.intent), receipt = v.receipt === undefined ? undefined : parseMetricOrderReceipt(v.receipt);
    if (intent && (v.receipt === undefined || receipt)) return { version: 1, kind: 'order', intent, ...(receipt ? { receipt } : {}) };
  }
  throw new Error('Invalid definitions intent');
}
export class DefinitionIntentRepository extends NutritionIntentRepository<StoredDefinitionIntent> {
  constructor(port: NutritionStoragePort, userId: string) {
    super(port, `ownlevel.metrics.definitions.intent.v1.${encodeURIComponent(userId)}`, parseStoredDefinitionIntent);
  }
}
