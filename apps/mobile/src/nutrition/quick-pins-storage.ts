import { NutritionIntentRepository, type NutritionStoragePort } from './intent-repository';
import { parseQuickPinsSnapshot, parseQuickPinsWrite, type QuickPinsSnapshot, type QuickPinsWrite } from '@/api/nutrition-quick';

/**
 * #479: the one pins write of this person that has not been confirmed yet, frozen with its key before it is sent, so a lost
 * answer or a closed app replays the identical request. Its own key per user: never mixed with the meal registration journals.
 */
export type StoredQuickPinsIntent = { version: 1; intent: QuickPinsWrite; base: QuickPinsSnapshot };

function parseStored(value: unknown): StoredQuickPinsIntent {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid quick pins intent');
  const v = value as Record<string, unknown>, intent = parseQuickPinsWrite(v.intent), base = parseQuickPinsSnapshot(v.base);
  if (v.version !== 1 || Object.keys(v).length !== 3 || !intent || !base || base.revision !== intent.expectedRevision) throw new Error('Invalid quick pins intent');
  return { version: 1, intent, base };
}

export const quickPinsStorageKey = (userId: string) => `ownlevel.nutrition.quick-pins.v1.${encodeURIComponent(userId)}`;

export class QuickPinsIntentRepository extends NutritionIntentRepository<StoredQuickPinsIntent> {
  constructor(port: NutritionStoragePort, userId: string) { super(port, quickPinsStorageKey(userId), parseStored); }
}
