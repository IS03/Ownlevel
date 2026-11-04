import { parseFeelingsResponse, type FeelingsResponse } from '../../../../src/lib/mobile-api/training-feelings-contract';
import type { FeelingsInput, FeelingsPort } from '../../../../src/lib/mobile-api/training-feelings-journal';
import type { MobileApiClient } from './client';
export { TrainingFeelingsJournal, FEELING_LABELS, feelingKeysFor } from '../../../../src/lib/mobile-api/training-feelings-journal';
export type { FeelingKey, FeelingsFinishInput } from '../../../../src/lib/mobile-api/training-feelings-contract';
export type { FeelingsSnapshot } from '../../../../src/lib/mobile-api/training-feelings-journal';

export function trainingFeelingsApi(client: MobileApiClient, sessionId: string): FeelingsPort {
  const path = `/api/mobile/v1/training/sessions/${encodeURIComponent(sessionId)}` as const;
  const parse = (value: unknown): FeelingsResponse | undefined => {
    try { const data = parseFeelingsResponse(value); return data.sessionId === sessionId ? data : undefined; } catch { return undefined; }
  };
  return {
    read: () => client.read({ path: `${path}/feelings`, parse }),
    write: (body: FeelingsInput) => client.request({ path: `${path}/${body.operation === 'finish' ? 'finish-with-feelings' : 'feelings'}`,
      method: body.operation === 'finish' ? 'POST' : 'PATCH', body, parse }),
  };
}
