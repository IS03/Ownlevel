import type { MobileApiClient } from './client';
import { parseNutritionStages } from '../../../../src/lib/mobile-api/nutrition-stages-contract';
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
