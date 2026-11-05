import { parseConfigurationsResponse, type ConfigurationInput } from '../mobile-api/training-exercise-configuration-contract';
import type { ConfigurationPort, ConfigurationResult } from '../mobile-api/training-exercise-configuration-journal';

/** Web uses the same Bearer route as Mobile; cookie identity never comes from a journal payload. */
export function webExerciseConfigurationApi(userId: string, sessionId: string,
  access: () => Promise<{ userId: string; accessToken: string } | null>, fetcher: typeof fetch = fetch): ConfigurationPort {
  const request = async (input?: ConfigurationInput): Promise<ConfigurationResult> => {
    try {
      const session = await access();
      if (session?.userId !== userId) return { status: 'auth_required' };
      const response = await fetcher(`/api/mobile/v1/training/sessions/${encodeURIComponent(sessionId)}/exercise-configurations`, {
        method: input ? 'PATCH' : 'GET', headers: { Authorization: `Bearer ${session.accessToken}`, 'Content-Type': 'application/json' },
        cache: 'no-store', signal: AbortSignal.timeout(15000), ...(input ? { body: JSON.stringify(input) } : {}),
      });
      // Only these say nothing was written, or that the saved value changed. Anything else stays pending and is replayed as is.
      if (response.status === 409) return { status: 'conflict' };
      if (response.status === 400) return { status: 'validation' };
      if (response.status === 404) return { status: 'not_found' };
      if (!response.ok) return { status: 'unavailable' };
      const data = parseConfigurationsResponse(await response.json());
      return data.sessionId === sessionId.toLowerCase() ? { status: 'ok', data } : { status: 'unavailable' };
    } catch { return { status: 'unavailable' }; }
  };
  return { read: () => request(), write: request };
}
