/**
 * Keeps what one consistent read produced, so more days or a relation of the same revision need no second read. Local to this
 * process and best effort: a miss only means a full read. The key comes from the token's identity and the revision just read
 * under RLS, so an entry can never reach another account or outlive a change in the data.
 */
export class InsightsSnapshotCache<T> {
  private entries = new Map<string, { revision: string; today: string; expiresAt: number; value: T }>();
  constructor(private readonly options: { maxEntries: number; ttlMs: number; now?: () => number }) {}
  private time() { return this.options.now?.() ?? Date.now(); }

  get(userId: string, revision: string, today: string): T | null {
    const entry = this.entries.get(userId);
    if (!entry) return null;
    if (entry.revision !== revision || entry.today !== today || entry.expiresAt <= this.time()) { this.entries.delete(userId); return null; }
    // Most recently used goes last; that is the Map's iteration order.
    this.entries.delete(userId); this.entries.set(userId, entry);
    return entry.value;
  }

  set(userId: string, revision: string, today: string, value: T) {
    this.entries.delete(userId);
    this.entries.set(userId, { revision, today, expiresAt: this.time() + this.options.ttlMs, value });
    while (this.entries.size > this.options.maxEntries) this.entries.delete(this.entries.keys().next().value!);
  }

  clear() { this.entries.clear(); }
}
