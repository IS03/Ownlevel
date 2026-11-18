import type { MobileApiClient } from './client';
import { parseMealMomentBandsConflict, parseMealMomentBandsRead, parseMealMomentBandsSnapshot, type MealMomentBandsConflict,
  type MealMomentBandsSnapshot, type MealMomentBandsWrite } from '../../../../src/lib/mobile-api/nutrition-moment-bands-contract';
export * from '../../../../src/lib/mobile-api/nutrition-moment-bands-contract';
/** The person's meal moment bands. `unavailable` is not «the defaults»: the app keeps using the fixed ones meanwhile. */
export function fetchMealMomentBands(client: MobileApiClient, signal?: AbortSignal) {
  return client.read({ path: '/api/mobile/v1/nutrition/moment-bands', signal, parse: parseMealMomentBandsRead });
}
/**
 * The five limits against the revision last read. A 409 carries the server's truth in `data` (`current`, or null). An unknown
 * outcome is `unavailable`: the same body with the same key can be sent again and is never applied twice.
 */
export function putMealMomentBands(client: MobileApiClient, write: MealMomentBandsWrite, signal?: AbortSignal) {
  return client.request<MealMomentBandsSnapshot | MealMomentBandsConflict>({ method: 'PUT', path: '/api/mobile/v1/nutrition/moment-bands', body: write, signal,
    parse: v => {
      const conflict = parseMealMomentBandsConflict(v); if (conflict) return conflict;
      const receipt = parseMealMomentBandsSnapshot(v);
      return receipt?.bands && JSON.stringify(receipt.bands) === JSON.stringify(write.bands) && receipt.revision >= write.expectedRevision ? receipt : undefined;
    } });
}
