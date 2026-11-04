import { parseFeelingsResponse } from '../mobile-api/training-feelings-contract';
import { feelingsWireInput, type FeelingsInput, type FeelingsPort } from '../mobile-api/training-feelings-journal';
import { parseFeelingsFinishEnvelope } from '../mobile-api/training-feelings-finish-contract';

/** Web uses the same Bearer routes; cookie identity never comes from a journal payload. */
export function webTrainingFeelingsApi(userId: string, sessionId: string,
  access: () => Promise<{ userId: string; accessToken: string } | null>, fetcher: typeof fetch = fetch): FeelingsPort {
  const request = async (input?: FeelingsInput) => {
    try {
      const session = await access();
      if (session?.userId !== userId) return { status: 'auth_required' };
      const negotiated = input?.operation === 'finish' && !!input.receiptVersion;
      const response = await fetcher(`/api/mobile/v1/training/sessions/${encodeURIComponent(sessionId)}/${input?.operation === 'finish' ? 'finish-with-feelings' : 'feelings'}${negotiated ? '?routineAdditions=1' : ''}`, {
        method: input ? input.operation === 'finish' ? 'POST' : 'PATCH' : 'GET',
        headers: { Authorization: `Bearer ${session.accessToken}`, 'Content-Type': 'application/json' },
        cache: 'no-store', signal: AbortSignal.timeout(15000), ...(input ? { body: JSON.stringify(feelingsWireInput(input)) } : {}),
      });
      if (response.status === 409) return { status: 'conflict' };
      if (!response.ok) return { status: 'unavailable' };
      const raw = await response.json();
      if (negotiated) {
        const result = parseFeelingsFinishEnvelope(raw, parseFeelingsResponse);
        return result.feelings.sessionId === sessionId ? { status: 'ok' as const, data: result.feelings, finished: result.finished } : { status: 'unavailable' };
      }
      const data = parseFeelingsResponse(raw);
      return data.sessionId === sessionId ? { status: 'ok' as const, data } : { status: 'unavailable' };
    } catch { return { status: 'unavailable' }; }
  };
  return { read: () => request(), write: request };
}
