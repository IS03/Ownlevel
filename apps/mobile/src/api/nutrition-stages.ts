import type { MobileApiClient } from './client';
import {
  parseNutritionStages as parseStagesShape,
  parseStageFields as parseStageFieldsShape,
  parseStagesIntent as parseStagesIntentShape,
  parseStagesResult as parseStagesResultShape,
  type NutritionStagesV2,
  type StageFieldsV2,
  type StagesIntentV2,
  type StagesResultV2,
} from '../../../../src/lib/mobile-api/nutrition-stages-contract';
export type { StageDuration, StageKind } from '../../../../src/lib/mobile-api/nutrition-stages-contract';
// Mobile speaks shape v2 (`?targets=2`): the training extra raises calories and protein, and a stage keeps no
// water of its own (the Agua metric owns that goal). See docs/mobile/nutrition-training-extra-api.md.
export type {
  NutritionStagesV2 as NutritionStages,
  NutritionStageV2 as NutritionStage,
  StageFieldsV2 as StageFields,
  StagesIntentV2 as StagesIntent,
  StagesResultV2 as StagesResult,
} from '../../../../src/lib/mobile-api/nutrition-stages-contract';
const path = '/api/mobile/v1/nutrition/stages?targets=2';
export const parseNutritionStages = (v: unknown): NutritionStagesV2 | undefined => parseStagesShape(v, 2);
export const parseStageFields = (v: unknown): StageFieldsV2 | undefined => parseStageFieldsShape(v, 2);
export const parseStagesIntent = (v: unknown): StagesIntentV2 | undefined => parseStagesIntentShape(v, 2);
export const parseStagesResult = (v: unknown): StagesResultV2 | undefined => parseStagesResultShape(v, 2);
export const fetchNutritionStages = (client: MobileApiClient, signal?: AbortSignal) =>
  client.read({
    path,
    signal,
    parse: parseNutritionStages,
  });
export const mutateNutritionStages = (
  client: MobileApiClient,
  intent: StagesIntentV2,
  signal?: AbortSignal,
) =>
  client.request({
    path,
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
