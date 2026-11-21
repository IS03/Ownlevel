import { NutritionIntentRepository, type NutritionStoragePort } from './intent-repository';
import { parseQuickIntent, parseQuickResponse, sameQuickSelection, type QuickIntent, type QuickReceipt } from '@/api/nutrition-quick';
import { parsePlateDraft, selectionFromPlate, type PlateDraft } from './plate-model';

/** A plate registration sent (or about to be): kept until its outcome is confirmed, so an unknown result is never re-sent blindly. */
export type StoredPlateIntent = { version: 1; intent: QuickIntent; draft: PlateDraft; receipt?: QuickReceipt };
function parseStored(value: unknown): StoredPlateIntent {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid plate intent');
  const v = value as Record<string, unknown>, intent = parseQuickIntent(v.intent), draft = parsePlateDraft(v.draft);
  const selection = draft ? selectionFromPlate(draft).selection : undefined;
  const receipt = v.receipt ? parseQuickResponse(v.receipt) : undefined;
  if (v.version !== 1 || !intent || intent.source.kind !== 'plate' || intent.operation !== 'register' || !draft || !selection || !sameQuickSelection(intent, selection)
    || v.receipt && (!receipt || 'error' in receipt || receipt.operation !== intent.operation || receipt.date !== intent.date)) throw new Error('Invalid plate intent');
  return { version: 1, intent, draft, ...(receipt && !('error' in receipt) ? { receipt } : {}) };
}
export class PlateIntentRepository extends NutritionIntentRepository<StoredPlateIntent> {
  constructor(port: NutritionStoragePort, userId: string) { super(port, `ownlevel.nutrition.plate.v1.${encodeURIComponent(userId)}`, parseStored); }
}
