import type { MobileApiClient } from './client';
import { parseProgressStages } from '../../../../src/lib/mobile-api/progress-stages-contract';

export * from '../../../../src/lib/mobile-api/progress-stages-contract';
/** Progreso › Tus etapas: the current stage and the past ones, each measured per day or per week. */
export const fetchProgressStages = (client: MobileApiClient, signal?: AbortSignal) =>
  client.read({ path: '/api/mobile/v1/progress/stages', signal, parse: parseProgressStages });
