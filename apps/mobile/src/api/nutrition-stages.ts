import type { MobileApiClient } from './client';
import {
  parseNutritionStages,
  parseStagesResult,
  type StagesIntent,
} from '../../../../src/lib/mobile-api/nutrition-stages-contract';
export {
  parseStagesIntent,
  parseStagesResult,
  parseStageFields,
} from '../../../../src/lib/mobile-api/nutrition-stages-contract';
export type {
  StagesIntent,
  StagesResult,
  StageFields,
  StageDuration,
} from '../../../../src/lib/mobile-api/nutrition-stages-contract';
export type {
  NutritionStages,
  NutritionStage,
  StageKind,
} from '../../../../src/lib/mobile-api/nutrition-stages-contract';
export const fetchNutritionStages = (client: MobileApiClient, signal?: AbortSignal) =>
  client.read({
    path: '/api/mobile/v1/nutrition/stages',
    signal,
    parse: parseNutritionStages,
  });
export const mutateNutritionStages = (
  client: MobileApiClient,
  intent: StagesIntent,
  signal?: AbortSignal,
) =>
  client.request({
    path: '/api/mobile/v1/nutrition/stages',
    method: 'POST',
    body: intent,
    signal,
    parse: (value) => {
      const result = parseStagesResult(value);
      return result?.status === 'confirmed' &&
        (result.operation !== intent.operation ||
          result.date !== intent.date ||
          result.list.listVersion < intent.expectedListVersion)
        ? undefined
        : result;
    },
  });
