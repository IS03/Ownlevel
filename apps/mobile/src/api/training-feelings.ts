import { parseFeelingsResponse, type FeelingsResponse } from '../../../../src/lib/mobile-api/training-feelings-contract';
import { feelingsWireInput, type FeelingsInput, type FeelingsPort } from '../../../../src/lib/mobile-api/training-feelings-journal';
import { parseFeelingsFinishEnvelope } from '../../../../src/lib/mobile-api/training-feelings-finish-contract';
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
    write: async (body: FeelingsInput) => {
      if (body.operation === 'finish' && body.receiptVersion) {
        const result = await client.request({ path: `${path}/finish-with-feelings?routineAdditions=1`, method: 'POST', body: feelingsWireInput(body), parse: value => {
          try { const envelope = parseFeelingsFinishEnvelope(value, parseFeelingsResponse); return envelope.feelings.sessionId === sessionId ? envelope : undefined; } catch { return undefined; }
        } });
        return result.status === 'ok' ? { ...result, data: result.data.feelings, finished: result.data.finished } : result;
      }
      return client.request({ path: `${path}/${body.operation === 'finish' ? 'finish-with-feelings' : 'feelings'}`, method: body.operation === 'finish' ? 'POST' : 'PATCH', body, parse });
    },
  };
}
