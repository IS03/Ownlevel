export type SessionResumeMeasurement = {
  stage: 'local' | 'revalidated';
  elapsedMs: number;
  hasSnapshot: boolean;
  editable: boolean;
  outcome: 'pending' | 'ready' | 'unavailable' | 'blocked';
};

/** Development diagnostics only: timing/state, never IDs, drafts, tokens or payloads. */
export function recordSessionResume(measurement: SessionResumeMeasurement) {
  if (__DEV__) console.info('[OWNLEVEL Session Resume]', measurement);
}
