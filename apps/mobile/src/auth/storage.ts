import * as SecureStore from 'expo-secure-store';
import type { SupportedStorage } from '@supabase/supabase-js';
import { iosVariant } from '../config/ios-variant';

const AUTH_KEYCHAIN_SERVICE = iosVariant().keychainService;

type SecureStorePort = Pick<
  typeof SecureStore,
  'deleteItemAsync' | 'getItemAsync' | 'isAvailableAsync' | 'setItemAsync'
>;

export class AuthStorageUnavailableError extends Error {
  constructor() {
    super('Secure authentication storage is unavailable');
    this.name = 'AuthStorageUnavailableError';
  }
}

export function createExpoSecureStoreAdapter(
  secureStore: SecureStorePort = SecureStore,
): SupportedStorage {
  const options: SecureStore.SecureStoreOptions = {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    keychainService: AUTH_KEYCHAIN_SERVICE,
  };
  const available = secureStore.isAvailableAsync();

  async function ensureAvailable() {
    if (!(await available)) {
      throw new AuthStorageUnavailableError();
    }
  }

  return {
    async getItem(key) {
      await ensureAvailable();
      return secureStore.getItemAsync(key, options);
    },
    async setItem(key, value) {
      await ensureAvailable();
      await secureStore.setItemAsync(key, value, options);
    },
    async removeItem(key) {
      await ensureAvailable();
      await secureStore.deleteItemAsync(key, options);
    },
  };
}

export const mobileAuthStorage = createExpoSecureStoreAdapter();
