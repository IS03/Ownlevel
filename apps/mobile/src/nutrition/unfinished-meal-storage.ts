import { writeAccountRecord } from '@/platform/account-local-data';
import type { NutritionStoragePort } from './intent-repository';
import { isMealDraft, type MealDraft } from './meal-form-model';
import { parsePlateDraft, type PlateDraft } from './plate-model';

/**
 * #645 · «Continuar carga»: a meal left without saving or discarding, on this device and for this account only. The plate
 * as it was when its sheet closed, and a manual meal left «para después». Never sent anywhere: the meal is written only
 * when the user registers it, through its usual flow.
 */
export type UnfinishedMeals = { plate: { draft: PlateDraft; savedAt: number } | null; manual: { draft: MealDraft; savedAt: number } | null };
const empty: UnfinishedMeals = { plate: null, manual: null };
const stamp = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value > 0;

export function parseUnfinishedMeals(value: unknown): UnfinishedMeals {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return empty;
  const v = value as Record<string, { draft?: unknown; savedAt?: unknown } | undefined>;
  const plate = v.plate && stamp(v.plate.savedAt) ? parsePlateDraft(v.plate.draft) : undefined;
  const manual = v.manual && stamp(v.manual.savedAt) && isMealDraft(v.manual.draft) ? v.manual.draft : undefined;
  return { plate: plate && plate.items.length ? { draft: plate, savedAt: v.plate!.savedAt as number } : null,
    manual: manual ? { draft: manual, savedAt: v.manual!.savedAt as number } : null };
}

export class UnfinishedMealRepository {
  private readonly key: string;
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private port: NutritionStoragePort, userId: string, private now = Date.now) { this.key = `ownlevel.nutrition.unfinished.v1.${encodeURIComponent(userId)}`; }
  private serialize<R>(run: () => Promise<R>): Promise<R> { const job = this.queue.catch(() => undefined).then(run); this.queue = job; return job; }
  private async load() { const raw = await this.port.getItem(this.key); return raw === null ? empty : parseUnfinishedMeals(JSON.parse(raw)); }
  read() { return this.serialize(() => this.load().catch(() => empty)); }
  /** A plate with no items, or null, is no unfinished plate. */
  writePlate(draft: PlateDraft | null) { return this.change(current => ({ ...current, plate: draft?.items.length ? { draft, savedAt: this.now() } : null })); }
  writeManual(draft: MealDraft | null) { return this.change(current => ({ ...current, manual: draft ? { draft, savedAt: this.now() } : null })); }
  private change(update: (current: UnfinishedMeals) => UnfinishedMeals) {
    return this.serialize(async () => {
      const next = update(await this.load().catch(() => empty));
      if (!next.plate && !next.manual) await this.port.removeItem(this.key);
      else await writeAccountRecord(this.port, this.key, JSON.stringify(next));
      return next;
    });
  }
}
