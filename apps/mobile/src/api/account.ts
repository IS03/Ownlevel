import type { MobileApiClient } from './client';
import {
  ACCOUNT_DELETION_CONFIRMATION, parseAccountDeletionReceipt,
} from '../../../../src/lib/mobile-api/account-deletion-contract';

export * from '../../../../src/lib/mobile-api/account-deletion-contract';
/** Deletes the signed-in account and all its data (Mobile and Web). Safe to repeat after an uncertain result. */
export const deleteAccount = (client: MobileApiClient, signal?: AbortSignal) =>
  client.request({
    method: 'DELETE', path: '/api/mobile/v1/account', body: { confirmation: ACCOUNT_DELETION_CONFIRMATION }, signal,
    parse: parseAccountDeletionReceipt,
  });
