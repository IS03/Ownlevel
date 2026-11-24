type WritePort = { setItem: (key: string, value: string) => Promise<void> };
type CleanupPort = WritePort & { getAllKeys: () => Promise<readonly string[]>; removeItem: (key: string) => Promise<void> };
const states = new WeakMap<WritePort, { deleted: Set<string>; pending: Map<Promise<void>, string> }>();
function stateFor(port: WritePort) {
  let state = states.get(port);
  if (!state) { state = { deleted: new Set(), pending: new Map() }; states.set(port, state); }
  return state;
}
/** Account suffixes are exact; active-session journals put the owner before the session ID. Global preferences stay. */
export function belongsToAccount(key: string, userId: string) {
  if (!userId || !key.startsWith('ownlevel.')) return false;
  const owner = encodeURIComponent(userId);
  return key.endsWith(`.${owner}`) || key.startsWith(`ownlevel.active.v1.${owner}.`);
}
/** All account journals/copies enter here, so late responses cannot recreate a deleted account's data. */
export async function writeAccountRecord(port: WritePort, key: string, value: string): Promise<void> {
  const state = stateFor(port);
  if ([...state.deleted].some(owner => belongsToAccount(key, owner))) throw new Error('Account local data retired');
  const write = port.setItem(key, value);
  state.pending.set(write, key);
  try { await write; } finally { state.pending.delete(write); }
}
/** Called only after deletion has been confirmed, never by normal logout. Failure must not prevent sign-out. */
export async function clearAccountLocalData(port: CleanupPort, userId: string) {
  if (!userId) return;
  const state = stateFor(port);
  state.deleted.add(userId);
  await Promise.allSettled([...state.pending].filter(([, key]) => belongsToAccount(key, userId)).map(([write]) => write));
  try {
    const keys = (await port.getAllKeys()).filter(key => belongsToAccount(key, userId));
    const results = await Promise.allSettled(keys.map(key => port.removeItem(key)));
    const failed = results.filter(result => result.status === 'rejected').length;
    if (failed) console.warn('[account-local-cleanup] Some local records could not be removed', { failed });
  } catch { console.warn('[account-local-cleanup] Local storage could not be enumerated'); }
}
