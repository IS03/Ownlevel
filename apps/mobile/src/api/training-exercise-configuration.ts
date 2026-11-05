import { parseConfigurationsResponse, type ConfigurationInput, type ConfigurationsResponse } from '../../../../src/lib/mobile-api/training-exercise-configuration-contract';
import type { ConfigurationPort } from '../../../../src/lib/mobile-api/training-exercise-configuration-journal';
import type { MobileApiClient } from './client';
export { ExerciseConfigurationJournal } from '../../../../src/lib/mobile-api/training-exercise-configuration-journal';
export type { ConfigurationView } from '../../../../src/lib/mobile-api/training-exercise-configuration-journal';
export { CONFIGURATION_AFTER_NOTE, CONFIGURATION_HINT, CONFIGURATION_LABEL_MAX, CONFIGURATION_MIXED_NOTE, normalizeConfigurationLabel, sameConfiguration } from '../../../../src/lib/mobile-api/training-exercise-configuration-contract';
export type { ConfigurationValue, PreviousConfiguration } from '../../../../src/lib/mobile-api/training-exercise-configuration-contract';

/** #367: what the person recorded about the variant of each exercise in one session. */
export function exerciseConfigurationApi(client: MobileApiClient, sessionId: string): ConfigurationPort {
  const path = `/api/mobile/v1/training/sessions/${encodeURIComponent(sessionId)}/exercise-configurations` as const;
  const parse = (value: unknown): ConfigurationsResponse | undefined => {
    try { const data = parseConfigurationsResponse(value); return data.sessionId === sessionId.toLowerCase() ? data : undefined; } catch { return undefined; }
  };
  return {
    read: () => client.read({ path, parse }),
    write: (body: ConfigurationInput) => client.request({ path, method: 'PATCH', body, parse }),
  };
}
