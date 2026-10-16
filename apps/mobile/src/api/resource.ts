import { useCallback, useEffect, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import type { MobileApiReadResult, MobileApiUnavailableReason } from './results';

export type ResourceRefreshTrigger = 'foreground' | 'initial' | 'manual';

export type ConfirmedResourceData<T> = {
  confirmedAt: number;
  data: T;
};

export type ApiResourceState<T> =
  | { status: 'loading'; trigger: ResourceRefreshTrigger }
  | {
      status: 'ready';
      current: ConfirmedResourceData<T>;
      refreshing: boolean;
      trigger: ResourceRefreshTrigger;
      result: Extract<MobileApiReadResult<T>, { status: 'ok' }>;
    }
  | {
      status: 'auth_required' | 'unauthorized';
      previous?: ConfirmedResourceData<T>;
      result: Extract<
        MobileApiReadResult<T>,
        { status: 'auth_required' | 'unauthorized' }
      >;
    }
  | {
      status: 'unavailable';
      previous?: ConfirmedResourceData<T>;
      reason: MobileApiUnavailableReason;
      result: Extract<MobileApiReadResult<T>, { status: 'unavailable' }>;
    };

type ResourceLoader<T> = (signal: AbortSignal) => Promise<MobileApiReadResult<T>>;
type ResourceListener<T> = (state: ApiResourceState<T>) => void;

export function shouldRefreshOnForeground(
  previous: AppStateStatus,
  next: AppStateStatus,
): boolean {
  return previous !== 'active' && next === 'active';
}

export class ApiResourceController<T> {
  private abortController: AbortController | null = null;
  private confirmed: ConfirmedResourceData<T> | undefined;
  private confirmedResult:
    | Extract<MobileApiReadResult<T>, { status: 'ok' }>
    | undefined;
  private disposed = false;
  private inFlight: Promise<void> | null = null;
  private readonly listeners = new Set<ResourceListener<T>>();
  private state: ApiResourceState<T> = { status: 'loading', trigger: 'initial' };

  constructor(
    private readonly load: ResourceLoader<T>,
    private readonly now: () => number = Date.now,
    /** A reading confirmed earlier (cache): shown at once as ready, and the first refresh revalidates it. */
    initial?: { confirmedAt: number; result: Extract<MobileApiReadResult<T>, { status: 'ok' }> },
  ) {
    if (initial) {
      this.confirmed = { confirmedAt: initial.confirmedAt, data: initial.result.data };
      this.confirmedResult = initial.result;
      this.state = { status: 'ready', current: this.confirmed, refreshing: false, trigger: 'initial', result: initial.result };
    }
  }

  getSnapshot(): ApiResourceState<T> {
    return this.state;
  }

  subscribe(listener: ResourceListener<T>): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * A read that must reflect a write confirmed just now: a read already in flight may predate that write, so it is
   * aborted and its result ignored instead of being reused.
   */
  reload(trigger: ResourceRefreshTrigger): Promise<void> {
    if (this.disposed) {
      return Promise.resolve();
    }
    this.abortController?.abort();
    this.inFlight = null;
    return this.refresh(trigger);
  }

  refresh(trigger: ResourceRefreshTrigger): Promise<void> {
    if (this.disposed) {
      return Promise.resolve();
    }
    if (this.inFlight) {
      return this.inFlight;
    }

    this.abortController = new AbortController();
    if (this.confirmed && this.confirmedResult) {
      this.update({
        status: 'ready',
        current: this.confirmed,
        refreshing: true,
        trigger,
        result: this.confirmedResult,
      });
    } else {
      this.update({ status: 'loading', trigger });
    }

    const operation = this.load(this.abortController.signal)
      .then((result) => {
        // A superseded read (see reload) never replaces newer truth.
        if (this.disposed || this.inFlight !== operation) {
          return;
        }

        if (result.status === 'ok') {
          this.confirmed = { confirmedAt: this.now(), data: result.data };
          this.confirmedResult = result;
          this.update({
            status: 'ready',
            current: this.confirmed,
            refreshing: false,
            trigger,
            result,
          });
        } else if (result.status === 'unavailable') {
          this.update({
            status: 'unavailable',
            previous: this.confirmed,
            reason: result.reason,
            result,
          });
        } else {
          this.update({
            status: result.status,
            previous: this.confirmed,
            result,
          });
        }
      })
      .finally(() => {
        if (this.inFlight === operation) {
          this.inFlight = null;
          this.abortController = null;
        }
      });

    this.inFlight = operation;
    return operation;
  }

  dispose(): void {
    this.disposed = true;
    this.abortController?.abort();
    this.listeners.clear();
  }

  private update(state: ApiResourceState<T>): void {
    this.state = state;
    this.listeners.forEach((listener) => listener(state));
  }
}

export function useApiResource<T>(loader: ResourceLoader<T>) {
  const [controller] = useState(() => new ApiResourceController(loader));
  const [state, setState] = useState<ApiResourceState<T>>(
    controller.getSnapshot(),
  );

  useEffect(() => {
    const unsubscribe = controller.subscribe(setState);
    void controller.refresh('initial');
    let previousAppState = AppState.currentState;
    const appStateSubscription = AppState.addEventListener('change', (nextState) => {
      if (shouldRefreshOnForeground(previousAppState, nextState)) {
        void controller.refresh('foreground');
      }
      previousAppState = nextState;
    });

    return () => {
      appStateSubscription.remove();
      unsubscribe();
      controller.dispose();
    };
  }, [controller]);

  const refresh = useCallback(
    () => controller.refresh('manual'),
    [controller],
  );

  const reload = useCallback(() => controller.reload('manual'), [controller]);
  return { refresh, reload, state };
}
