import { describe, expect, it, jest } from '@jest/globals';

// redirectTo sent to Supabase must match the scheme each iOS variant registers.
function callbackFor(variant: string | undefined) {
  const previous = process.env.EXPO_PUBLIC_IOS_VARIANT;
  try {
    if (variant === undefined) delete process.env.EXPO_PUBLIC_IOS_VARIANT;
    else process.env.EXPO_PUBLIC_IOS_VARIANT = variant;
    let url = '';
    jest.isolateModules(() => {
      url = jest.requireActual<typeof import('./constants')>('./constants').NATIVE_AUTH_CALLBACK_URL;
    });
    return url;
  } finally {
    if (previous === undefined) delete process.env.EXPO_PUBLIC_IOS_VARIANT;
    else process.env.EXPO_PUBLIC_IOS_VARIANT = previous;
  }
}

describe('NATIVE_AUTH_CALLBACK_URL', () => {
  it('keeps the Development callback by default', () => {
    expect(callbackFor(undefined)).toBe('ownlevel-dev://auth/callback');
    expect(callbackFor('development')).toBe('ownlevel-dev://auth/callback');
  });

  it('uses the Diario callback only for the daily variant', () => {
    expect(callbackFor('daily')).toBe('ownlevel-daily://auth/callback');
  });
});
