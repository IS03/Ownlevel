// Portable negotiated receipt. The v1 body and installed-client responses stay unchanged.
export const FEELINGS_FINISH_RECEIPT = 'training-feelings-finish/2' as const;
export type FeelingsFinishedReceipt = {
  status: 'finished'; sessionId: string; sessionStatus: 'completed'; name: string; routineId: string | null;
  logDate: string; startedAt: string; endedAt: string; sessionUpdatedAt: string;
  metadata: { energyLevel: number | null; performanceLevel: number | null; painLevel: number | null; notes: string | null };
  exerciseCount: number; completedExerciseCount: number; completedSetCount: number;
  routineAdditions: { sessionExerciseId: string; exerciseId: string; name: string; outcome: 'added' | 'already_in_routine' | 'routine_unavailable' | 'no_completed_sets' }[];
};
function object(v: unknown, keys: string[]): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v) || Object.keys(v).length !== keys.length || keys.some(k => !Object.hasOwn(v, k))) throw Error('Invalid finish receipt');
  return v as Record<string, unknown>;
}
const id = (v: unknown) => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const time = (v: unknown) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(v) && Number.isFinite(Date.parse(v));
const scale = (v: unknown, min: number, max: number) => v === null || typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
export function parseFeelingsFinishedReceipt(value: unknown): FeelingsFinishedReceipt {
  const r = object(value, ['status','sessionId','sessionStatus','name','routineId','logDate','startedAt','endedAt','sessionUpdatedAt','metadata','exerciseCount','completedExerciseCount','completedSetCount','routineAdditions']);
  const m = object(r.metadata, ['energyLevel','performanceLevel','painLevel','notes']);
  if (r.status !== 'finished' || r.sessionStatus !== 'completed' || !id(r.sessionId) || r.routineId !== null && !id(r.routineId) || typeof r.name !== 'string' || !r.name.trim()
    || typeof r.logDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(r.logDate) || !time(r.startedAt) || !time(r.endedAt) || !time(r.sessionUpdatedAt)
    || !scale(m.energyLevel,1,5) || !scale(m.performanceLevel,1,5) || !scale(m.painLevel,0,10) || m.notes !== null && typeof m.notes !== 'string'
    || ['exerciseCount','completedExerciseCount','completedSetCount'].some(k => typeof r[k] !== 'number' || !Number.isSafeInteger(r[k]) || (r[k] as number) < 0)
    || !Array.isArray(r.routineAdditions)) throw Error('Invalid finish receipt');
  const ids = new Set<string>();
  for (const raw of r.routineAdditions) {
    const row = object(raw, ['sessionExerciseId','exerciseId','name','outcome']);
    if (!id(row.sessionExerciseId) || !id(row.exerciseId) || typeof row.name !== 'string' || !row.name.trim()
      || !['added','already_in_routine','routine_unavailable','no_completed_sets'].includes(String(row.outcome)) || ids.has(String(row.sessionExerciseId))) throw Error('Invalid routine addition receipt');
    ids.add(String(row.sessionExerciseId));
  }
  return r as FeelingsFinishedReceipt;
}
export function parseFeelingsFinishEnvelope<T extends { sessionId: string; sessionStatus: string; endedAt: string | null; sessionUpdatedAt: string }>(value: unknown, parseFeelings: (v: unknown) => T) {
  const r = object(value, ['contractVersion','feelings','finished']);
  if (r.contractVersion !== FEELINGS_FINISH_RECEIPT) throw Error('Unsupported finish receipt');
  const feelings = parseFeelings(r.feelings), finished = parseFeelingsFinishedReceipt(r.finished);
  if (feelings.sessionStatus !== 'completed' || feelings.sessionId !== finished.sessionId || feelings.endedAt !== finished.endedAt || feelings.sessionUpdatedAt !== finished.sessionUpdatedAt) throw Error('Mismatched finish receipt');
  return { contractVersion: FEELINGS_FINISH_RECEIPT, feelings, finished };
}
