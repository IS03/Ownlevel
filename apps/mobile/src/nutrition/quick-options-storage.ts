import { parseQuickOptions, type QuickOptions } from '@/api/nutrition-quick';
import type { NutritionStoragePort } from './intent-repository';

export const quickOptionsStorageKey = (userId: string) => `ownlevel.nutrition.quick-options.v1.${encodeURIComponent(userId)}`;
/**
 * The last complete quick-options answer, kept on this device for this account only. Rápido shows it the moment it opens
 * (as last confirmed, with «Actualizando…») while it reads again; it never replaces that read, never authorizes a write by
 * itself (every add is previewed and checked by version on the server, pins are verified first) and a copy that does not
 * parse is ignored. Writing it adds no request.
 */
export class QuickOptionsSnapshot {
  constructor(private port: NutritionStoragePort, private userId: string) {}
  async read(): Promise<QuickOptions | null> {
    try {
      const raw = await this.port.getItem(quickOptionsStorageKey(this.userId));
      if (!raw) return null;
      const stored = JSON.parse(raw) as { version?: unknown; options?: unknown };
      return stored.version === 1 ? parseQuickOptions(stored.options) ?? null : null;
    } catch { return null; }
  }
  async write(options: QuickOptions) {
    try { await this.port.setItem(quickOptionsStorageKey(this.userId), JSON.stringify({ version: 1, options })); } catch { /* a cache: losing it only costs the instant list */ }
  }
}
