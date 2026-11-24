import { useCallback, useEffect, useState } from 'react';
import { writeAccountRecord } from '@/platform/account-local-data';

/**
 * #537 · «Mantener este esquema»: the patterns this account chose to keep, on this device only (not synced). The key
 * names the pattern (signal, exercise, routine and scheme), so a new scheme shows again. Account-suffixed, so deleting
 * the account removes it (#625). A copy that cannot be read is an empty list: at worst a silenced hint shows again.
 */
export type SilencePort = { getItem: (key: string) => Promise<string | null>; setItem: (key: string, value: string) => Promise<void> };
export const loadPatternSilenceKey = (userId: string) => `ownlevel.training.load-pattern-silence.v1.${encodeURIComponent(userId)}`;
export const LOAD_PATTERN_SILENCE_MAX = 200;

export async function readSilenced(port: SilencePort, userId: string): Promise<string[]> {
  try {
    const raw = await port.getItem(loadPatternSilenceKey(userId));
    const parsed = raw ? JSON.parse(raw) as { version?: unknown; keys?: unknown } : null;
    return parsed?.version === 1 && Array.isArray(parsed.keys) ? parsed.keys.filter((key): key is string => typeof key === 'string').slice(-LOAD_PATTERN_SILENCE_MAX) : [];
  } catch { return []; }
}
/** The newest keys stay; the oldest leave first. */
export async function writeSilenced(port: SilencePort, userId: string, keys: readonly string[]) {
  await writeAccountRecord(port, loadPatternSilenceKey(userId), JSON.stringify({ version: 1, keys: [...new Set(keys)].slice(-LOAD_PATTERN_SILENCE_MAX) }));
}

export function useLoadPatternSilence(port: SilencePort, userId: string) {
  // Kept per account: switching account never shows another one's list, even before its read returns.
  const [state, setState] = useState<{ userId: string; keys: ReadonlySet<string> }>({ userId, keys: new Set() });
  useEffect(() => {
    if (!userId) return;
    let alive = true;
    void readSilenced(port, userId).then(keys => { if (alive) setState(current => ({ userId, keys: new Set([...(current.userId === userId ? current.keys : []), ...keys]) })); });
    return () => { alive = false; };
  }, [port, userId]);
  const silenced = state.userId === userId ? state.keys : EMPTY;
  const silence = useCallback((key: string) => {
    setState(current => ({ userId, keys: new Set(current.userId === userId ? current.keys : []).add(key) }));
    if (!userId) return;
    // Merged with what is stored, so a silence chosen before the first read finished never drops older ones.
    void readSilenced(port, userId).then(stored => writeSilenced(port, userId, [...stored.filter(item => item !== key), key])).catch(() => undefined);
  }, [port, userId]);
  return { silenced, silence };
}
const EMPTY: ReadonlySet<string> = new Set();
