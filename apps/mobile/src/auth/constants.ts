import { iosVariant } from '../config/ios-variant';

export const NATIVE_AUTH_CALLBACK_URL = `${iosVariant().scheme}://auth/callback`;
export const MOBILE_AUTH_STORAGE_KEY = 'ownlevel-mobile-auth-v1';
export const AUTH_OPERATION_TIMEOUT_MS = 12_000;
