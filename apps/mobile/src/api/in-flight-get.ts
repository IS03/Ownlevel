type Pending<T> = {
  controller: AbortController;
  consumers: number;
  settled: boolean;
  result: Promise<T>;
};

/** Pending transport only: no confirmed data, persistence, TTL or global account scope. */
export class InFlightGet<T> {
  private readonly pending = new Map<string, Pending<T>>();

  constructor(private readonly aborted: () => Error) {}

  run(key: string, signal: AbortSignal | undefined, load: (signal: AbortSignal) => Promise<T>): Promise<T> {
    if (signal?.aborted) return Promise.reject(this.aborted());
    let entry = this.pending.get(key);
    if (!entry) {
      const controller = new AbortController();
      const created: Pending<T> = {
        controller, consumers: 0, settled: false,
        result: Promise.resolve().then(() => load(controller.signal)).finally(() => {
          created.settled = true;
          if (this.pending.get(key) === created) this.pending.delete(key);
        }),
      };
      this.pending.set(key, created);
      entry = created;
    }
    const current = entry;
    current.consumers++;
    return new Promise<T>((resolve, reject) => {
      let finished = false;
      const release = () => {
        finished = true;
        signal?.removeEventListener('abort', onAbort);
        current.consumers--;
        if (!current.settled && current.consumers === 0) {
          // Retire first: a new caller must not join a transport that is being aborted.
          if (this.pending.get(key) === current) this.pending.delete(key);
          current.controller.abort();
        }
      };
      const onAbort = () => {
        if (finished) return;
        release(); reject(this.aborted());
      };
      signal?.addEventListener('abort', onAbort, { once: true });
      current.result.then(value => {
        if (finished) return;
        release(); resolve(value);
      }, error => {
        if (finished) return;
        release(); reject(error);
      });
    });
  }
}
