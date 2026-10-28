import type { MobileApiClient } from '@/api/client';
import type { MobileApiReadResult } from '@/api/results';
import { useCachedRead } from '@/api/use-cached-read';

/**
 * Progress readings outside the four main screens (views, connections, insight, Explorar, meal times, stages,
 * influence, exercise detail). One retained reading per account, Córdoba day and key: keys are unique per kind of
 * read (prefixed by it). A new key never shows another scope; settled writes invalidate them (`progress-extra`).
 */
export function useProgressResource<T>(client: MobileApiClient | null, key: string,
  load: (client: MobileApiClient, signal: AbortSignal) => Promise<MobileApiReadResult<T>>) {
  const { state, data, refresh } = useCachedRead(client, 'progress-extra', key, load);
  return { state, data, refresh };
}
