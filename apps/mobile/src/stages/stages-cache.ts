import type { MobileApiClient } from "@/api/client";
import type { NutritionStages } from "@/api/nutrition-stages";
const cache = new WeakMap<
  MobileApiClient,
  { userId: string; list: NutritionStages }
>();
const listeners = new WeakMap<
  MobileApiClient,
  Set<{ userId: string; onChange: (list: NutritionStages) => void }>
>();
export function cachedStages(client: MobileApiClient, userId: string) {
  const entry = cache.get(client);
  return entry?.userId === userId ? entry.list : null;
}
export function rememberStages(
  client: MobileApiClient,
  userId: string,
  list: NutritionStages,
) {
  const previous = cachedStages(client, userId);
  if (
    previous === list ||
    (previous &&
      (list.today < previous.today || list.listVersion < previous.listVersion))
  )
    return;
  cache.set(client, { userId, list });
  listeners.get(client)?.forEach((listener) => {
    if (listener.userId === userId) listener.onChange(list);
  });
}
export function subscribeStagesCache(
  client: MobileApiClient,
  userId: string,
  onChange: (list: NutritionStages) => void,
) {
  const entries = listeners.get(client) ?? new Set();
  const listener = { userId, onChange };
  entries.add(listener);
  listeners.set(client, entries);
  return () => {
    entries.delete(listener);
  };
}
