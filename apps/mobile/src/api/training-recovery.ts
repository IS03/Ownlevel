import type { MobileApiClient } from './client';
import { progressQueryParams, progressResponseMatches, type ProgressQuery } from './progress';
import { parseProgressTrainingRecovery, type RecoverySelection } from '../../../../src/lib/mobile-api/progress-training-recovery-contract';
export * from '../../../../src/lib/mobile-api/progress-training-recovery-contract';
export const recoveryReadKey = (query: ProgressQuery, selection: RecoverySelection) => `training-recovery/1|${progressQueryParams(query)}|${JSON.stringify(selection)}`;
export const fetchTrainingRecovery = (client: MobileApiClient, query: ProgressQuery, selection: RecoverySelection, signal?: AbortSignal) => {
  const params = new URLSearchParams(progressQueryParams(query)); params.set('scope', selection.scope);
  if (selection.routine !== null) params.set('routine', selection.routine);
  if (selection.bin !== null) params.set('bin', String(selection.bin));
  if (selection.offset) params.set('offset', String(selection.offset));
  return client.read({ path: `/api/mobile/v1/progress/training/recovery?${params}`, signal, parse: (raw: unknown) => {
    const data = parseProgressTrainingRecovery(raw);
    return data && progressResponseMatches(data.period, query) && (query.period !== 'custom' || data.period.end === (query.to! > data.today ? data.today : query.to))
      && data.selection.scope === selection.scope && data.selection.routine === selection.routine && data.selection.bin === selection.bin && data.selection.offset === selection.offset ? data : undefined;
  } });
};
