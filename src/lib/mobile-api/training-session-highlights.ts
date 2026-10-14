// Additive read contract. Never added to the persisted finish/idempotency receipt.
export const KG_WEIGHT_MODES = ['Peso total', 'Por mancuerna', 'Por brazo', 'Total con barra'] as const;
export const HIGHLIGHT_WEIGHT_MODES = [...KG_WEIGHT_MODES, 'Lingotes (no kg)'] as const;
export const isKgWeightMode = (mode: string | null): boolean => KG_WEIGHT_MODES.some(value => value === mode);
export type SessionHighlightMark = { weightKg: number; reps: number };
export type SessionHighlight = {
  kind: 'record' | 'improvement'; exerciseId: string; name: string; mark: SessionHighlightMark; weightMode: string;
  previous: SessionHighlightMark;
};
export type SessionHighlightsDto = { sessionId: string; volumeKg: number | null; highlights: SessionHighlight[] };
const object = (value: unknown, keys: string[]): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const positive = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0;
function mark(value: unknown): value is SessionHighlightMark {
  return object(value, ['weightKg', 'reps']) && positive(value.weightKg) && positive(value.reps) && Number.isInteger(value.reps);
}
export function parseSessionHighlights(value: unknown): SessionHighlightsDto | undefined {
  if (!object(value, ['sessionId', 'volumeKg', 'highlights']) || !uuid(value.sessionId)
    || !(value.volumeKg === null || typeof value.volumeKg === 'number' && Number.isFinite(value.volumeKg) && value.volumeKg >= 0)
    || !Array.isArray(value.highlights)) return;
  const ids = new Set<string>();
  for (const row of value.highlights) {
    if (!object(row, ['kind', 'exerciseId', 'name', 'mark', 'weightMode', 'previous']) || !uuid(row.exerciseId) || ids.has(row.exerciseId)
      || typeof row.name !== 'string' || !row.name.trim() || typeof row.weightMode !== 'string'
      || !HIGHLIGHT_WEIGHT_MODES.some(mode => mode === row.weightMode) || !mark(row.mark) || !mark(row.previous)) return;
    if (row.kind === 'record' ? row.mark.weightKg <= row.previous.weightKg : row.kind !== 'improvement'
      || !(row.mark.weightKg > row.previous.weightKg || row.mark.weightKg === row.previous.weightKg && row.mark.reps > row.previous.reps)) return;
    ids.add(row.exerciseId);
  }
  return value as SessionHighlightsDto;
}
