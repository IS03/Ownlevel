import type { MobileApiClient } from './client';
import { progressQueryParams, progressResponseMatches, type ProgressQuery } from './progress';
import { parseProgressTrainingTimes, type TrainingTimeSelection } from '../../../../src/lib/mobile-api/progress-training-times-contract';
export * from '../../../../src/lib/mobile-api/progress-training-times-contract';

export const trainingTimesKey = (query: ProgressQuery, selection: TrainingTimeSelection) => `training-times/1|${progressQueryParams(query)}|${JSON.stringify(selection)}`;
export const fetchTrainingTimes = (client: MobileApiClient, query: ProgressQuery, selection: TrainingTimeSelection, signal?: AbortSignal) => {
  const params = new URLSearchParams(progressQueryParams(query));
  if (selection.routine !== null) params.set('routine', selection.routine);
  if (selection.execution !== null) params.set('execution', selection.execution);
  if (selection.bin !== null) params.set('bin', String(selection.bin));
  if (selection.offset) params.set('offset', String(selection.offset));
  return client.read({ path: `/api/mobile/v1/progress/training/times?${params}`, signal, parse: (raw: unknown) => {
    const parsed = parseProgressTrainingTimes(raw);
    return parsed && progressResponseMatches(parsed.period, query)
      && (query.period !== 'custom' || parsed.period.end === (query.to! > parsed.today ? parsed.today : query.to))
      && parsed.selection.routine === selection.routine && parsed.selection.execution === selection.execution && parsed.selection.bin === selection.bin && parsed.selection.offset === selection.offset ? parsed : undefined;
  } });
};
