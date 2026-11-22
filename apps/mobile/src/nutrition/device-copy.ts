import type { NutritionStoragePort } from './intent-repository';

/**
 * The last complete answer of a list, kept on this device for one account. A screen shows it the moment it opens (as last
 * confirmed, while it reads again); it never replaces that read and never authorizes a write by itself (every add is
 * previewed and checked by version on the server). A copy that does not parse is ignored; losing it only costs the
 * instant list. Writing it adds no request.
 */
export class DeviceCopy<T> {
  constructor(private port: NutritionStoragePort, readonly key: string, private parse: (value: unknown) => T | undefined) {}
  async read(): Promise<T | null> {
    try {
      const raw = await this.port.getItem(this.key);
      if (!raw) return null;
      const stored = JSON.parse(raw) as { version?: unknown; value?: unknown };
      return stored.version === 1 ? this.parse(stored.value) ?? null : null;
    } catch { return null; }
  }
  async write(value: T) {
    try { await this.port.setItem(this.key, JSON.stringify({ version: 1, value })); } catch { /* a cache only */ }
  }
}
