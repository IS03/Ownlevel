import { NATIVE_AUTH_CALLBACK_URL } from './constants';

const EXPECTED_PROTOCOL = new URL(NATIVE_AUTH_CALLBACK_URL).protocol;
const EXPECTED_HOST = 'auth';
const EXPECTED_PATH = '/callback';
const EXPECTED_PARAMETERS = new Set([
  'code',
  'error',
  'error_code',
  'error_description',
  'sb_flow_id',
]);
const FLOW_ID_PATTERN = /^[a-zA-Z0-9_-]{8,64}$/;

export type NativeAuthCallback =
  | { kind: 'code'; code: string; flowId: string | null }
  | { kind: 'oauth_error'; reason: 'cancelled' | 'provider_error' }
  | { kind: 'invalid' };

export function parseNativeAuthCallback(rawUrl: string): NativeAuthCallback | null {
  let url: URL;

  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }

  if (
    url.protocol !== EXPECTED_PROTOCOL ||
    url.hostname !== EXPECTED_HOST ||
    url.pathname !== EXPECTED_PATH
  ) {
    return null;
  }

  if (url.username || url.password || url.port || url.hash) {
    return { kind: 'invalid' };
  }

  for (const key of url.searchParams.keys()) {
    if (!EXPECTED_PARAMETERS.has(key) || url.searchParams.getAll(key).length !== 1) {
      return { kind: 'invalid' };
    }
  }

  const oauthError = url.searchParams.get('error');
  const code = url.searchParams.get('code')?.trim() ?? '';
  const flowId = url.searchParams.get('sb_flow_id')?.trim() ?? null;

  if (oauthError) {
    if (code || flowId) {
      return { kind: 'invalid' };
    }

    return {
      kind: 'oauth_error',
      reason: oauthError === 'access_denied' ? 'cancelled' : 'provider_error',
    };
  }

  if (
    !code ||
    url.searchParams.has('error_code') ||
    url.searchParams.has('error_description') ||
    (flowId !== null && !FLOW_ID_PATTERN.test(flowId))
  ) {
    return { kind: 'invalid' };
  }

  return { kind: 'code', code, flowId };
}

export class OAuthCallbackGate {
  private readonly claimed = new Set<string>();

  claim(callback: Extract<NativeAuthCallback, { kind: 'code' }>): boolean {
    const identifier = callback.flowId ?? callback.code;

    if (this.claimed.has(identifier)) {
      return false;
    }

    this.claimed.add(identifier);
    return true;
  }
}

type RouteParameter = string | string[] | undefined;

export function callbackUrlFromRouteParameters(
  parameters: Record<string, RouteParameter>,
): string {
  const url = new URL(NATIVE_AUTH_CALLBACK_URL);

  for (const [key, value] of Object.entries(parameters)) {
    if (Array.isArray(value)) {
      value.forEach((item) => url.searchParams.append(key, item));
    } else if (value !== undefined) {
      url.searchParams.append(key, value);
    }
  }

  return url.toString();
}
