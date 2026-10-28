import {
  createContext,
  type PropsWithChildren,
  useContext,
  useMemo,
  useLayoutEffect,
  useRef,
} from 'react';

import { useMobileAuth } from '@/auth';

import { createMobileApiClient, type MobileApiClient } from './client';
import { readMobileApiConfig, type MobileApiConfig } from './config';
import { createMobileClientRuntime, type MobileClientRuntime } from './runtime';
import { clearConfirmedReads } from './confirmed-read-cache';

type MobileApiContextValue = {
  client: MobileApiClient | null;
  config: MobileApiConfig | null;
  configurationError: boolean;
  runtime: MobileClientRuntime | null;
};

const MobileApiContext = createContext<MobileApiContextValue | null>(null);

export function MobileApiProvider({ children }: PropsWithChildren) {
  const { getAccessTokenForApi, revalidateApiSession, session } = useMobileAuth();
  const owner = session?.user.id ?? null;

  const value = useMemo<MobileApiContextValue>(() => {
    try {
      const config = readMobileApiConfig();
      const runtime = createMobileClientRuntime();
      return {
        client: owner ? createMobileApiClient({
          auth: {
            getAccessToken: getAccessTokenForApi,
            revalidateAfterUnauthorized: revalidateApiSession,
          },
          config,
          runtime,
        }) : null,
        config,
        configurationError: false,
        runtime,
      };
    } catch {
      return {
        client: null,
        config: null,
        configurationError: true,
        runtime: null,
      };
    }
  }, [getAccessTokenForApi, revalidateApiSession, owner]);
  const previous = useRef<MobileApiClient | null>(null);
  useLayoutEffect(() => {
    if (previous.current && previous.current !== value.client) clearConfirmedReads(previous.current);
    previous.current = value.client;
  }, [value.client]);

  // Account changes also retire screen-local readers that do not share this cache.
  return <MobileApiContext.Provider key={owner ?? 'signed-out'} value={value}>{children}</MobileApiContext.Provider>;
}

export function useMobileApi(): MobileApiContextValue {
  const value = useContext(MobileApiContext);
  if (!value) {
    throw new Error('useMobileApi must be used inside MobileApiProvider');
  }
  return value;
}
