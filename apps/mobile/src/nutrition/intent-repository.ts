import { writeAccountRecord } from '@/platform/account-local-data';
// Shared durable-intent storage. No offline queue or automatic transmission.
export type NutritionStoragePort = { getItem: (key: string) => Promise<string | null>; setItem: (key: string, value: string) => Promise<void>; removeItem: (key: string) => Promise<void> };
const queues = new WeakMap<NutritionStoragePort, Map<string, Promise<unknown>>>();
export class NutritionIntentRepository<T extends { intent: { idempotencyKey: string } }> {
  private readonly queue: Map<string, Promise<unknown>>;
  constructor(private port: NutritionStoragePort, readonly key: string, private parse: (value: unknown) => T) {
    this.queue = queues.get(port) ?? new Map(); queues.set(port, this.queue);
  }
  private serialize<R>(run: () => Promise<R>): Promise<R> {
    const job = (this.queue.get(this.key) ?? Promise.resolve()).catch(() => undefined).then(run);
    this.queue.set(this.key, job);
    void job.finally(() => { if (this.queue.get(this.key) === job) this.queue.delete(this.key); }).catch(() => undefined);
    return job;
  }
  read() { return this.serialize(async (): Promise<T | null> => {
    const raw = await this.port.getItem(this.key);
    return raw === null ? null : this.parse(JSON.parse(raw));
  }); }
  write(record: T) { return this.serialize(async () => {
    const previous = await this.port.getItem(this.key);
    if (previous && this.parse(JSON.parse(previous)).intent.idempotencyKey !== record.intent.idempotencyKey) throw new Error('Another pending nutrition intent');
    await writeAccountRecord(this.port, this.key, JSON.stringify(record));
  }); }
  clear(idempotencyKey: string) { return this.serialize(async () => {
    const previous = await this.port.getItem(this.key);
    if (previous && this.parse(JSON.parse(previous)).intent.idempotencyKey === idempotencyKey) await this.port.removeItem(this.key);
  }); }
}
