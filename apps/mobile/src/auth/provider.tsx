import type { AuthChangeEvent, Session, SupabaseClient } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
} from 'react';
import { AppState } from 'react-native';

import { OAuthCallbackGate } from './callback';
import { getMobileSupabaseClient } from './client';
import { NATIVE_AUTH_CALLBACK_URL } from './constants';
import { authMessages } from './errors';
import {
  getNativeApiAccessToken,
  performLocalLogout,
  processNativeAuthCallback,
  revalidateNativeSessionAfterUnauthorized,
  restoreNativeSession,
  syncAuthRefreshWithAppState,
  type MobileApiAccessTokenResult,
  type MobileApiSessionRevalidationResult,
} from './service';
import {
  authenticatedSession,
  initialMobileAuthState,
  mobileAuthReducer,
  type MobileAuthEvent,
  type MobileAuthState,
} from './state';

type MobileAuthContextValue = {
  getAccessTokenForApi: () => Promise<MobileApiAccessTokenResult>;
  handleCallbackUrl: (url: string) => Promise<boolean>;
  revalidateApiSession: (
    rejectedAccessToken: string,
  ) => Promise<MobileApiSessionRevalidationResult>;
  retry: () => Promise<void>;
  session: Session | null;
  signInWithGoogle: () => Promise<void>;
  /** `notice` is shown on the entry screen when the device ends signed out (e.g. after deleting the account). */
  signOut: (notice?: string) => Promise<void>;
  state: MobileAuthState;
};

const MobileAuthContext = createContext<MobileAuthContextValue | null>(null);

export function MobileAuthProvider({ children }: PropsWithChildren) {
  const [state, dispatch] = useReducer(mobileAuthReducer, initialMobileAuthState);
  const stateRef = useRef(state);
  const clientRef = useRef<SupabaseClient | null>(null);
  const callbackGateRef = useRef(new OAuthCallbackGate());
  const signInPendingRef = useRef(false);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const dispatchIfMounted = useCallback((event: MobileAuthEvent) => {
    dispatch(event);
  }, []);

  const handleCallbackUrl = useCallback(async (url: string) => {
    const client = clientRef.current;
    if (!client) {
      dispatchIfMounted({
        type: 'TRANSIENT_FAILURE',
        message: authMessages.configurationMissing,
        session: null,
      });
      return false;
    }

    const result = await processNativeAuthCallback(url, client, callbackGateRef.current);
    if (result.event) {
      dispatchIfMounted(result.event);
    }
    return result.handled;
  }, [dispatchIfMounted]);

  const restore = useCallback(async (client: SupabaseClient) => {
    const event = await restoreNativeSession(client);
    dispatchIfMounted(event.type === 'TRANSIENT_FAILURE' ? { ...event, session: event.session ?? undefined } : event);
  }, [dispatchIfMounted]);

  useEffect(() => {
    let cancelled = false;
    let client: SupabaseClient;

    try {
      client = getMobileSupabaseClient();
      clientRef.current = client;
    } catch {
      dispatch({
        type: 'TRANSIENT_FAILURE',
        message: authMessages.configurationMissing,
        session: null,
      });
      return;
    }

    const onAuthStateChange = (event: AuthChangeEvent, session: Session | null) => {
      if (cancelled || event === 'INITIAL_SESSION') {
        return;
      }

      if (
        session &&
        (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED')
      ) {
        dispatch({ type: 'SESSION_CONFIRMED', session });
      } else if (event === 'SIGNED_OUT') {
        dispatch({ type: 'SESSION_INVALID' });
      }
    };

    const { data: authListener } = client.auth.onAuthStateChange(onAuthStateChange);
    const appStateListener = AppState.addEventListener('change', (nextState) => {
      void syncAuthRefreshWithAppState(client, nextState).catch(() => {
        if (!cancelled) {
          dispatch({
            type: 'TRANSIENT_FAILURE',
            message: authMessages.restoreFailed,
          });
        }
      });

      if (nextState === 'active' && stateRef.current.status === 'TRANSIENT_ERROR') {
        void restore(client);
      }
    });

    async function bootstrap() {
      try {
        await syncAuthRefreshWithAppState(client, AppState.currentState);
        const initialUrl = await Linking.getInitialURL();
        const callbackResult = initialUrl
          ? await processNativeAuthCallback(initialUrl, client, callbackGateRef.current)
          : { event: null, handled: false };

        if (cancelled) {
          return;
        }

        if (callbackResult.handled) {
          if (callbackResult.event) {
            dispatch(callbackResult.event);
          }
          return;
        }

        await restore(client);
      } catch {
        if (!cancelled) {
          dispatch({
            type: 'TRANSIENT_FAILURE',
            message: authMessages.restoreFailed,
          });
        }
      }
    }

    void bootstrap();

    return () => {
      cancelled = true;
      authListener.subscription.unsubscribe();
      appStateListener.remove();
      void client.auth.stopAutoRefresh();
    };
  }, [restore]);

  const retry = useCallback(async () => {
    const client = clientRef.current;
    if (!client) {
      dispatchIfMounted({
        type: 'TRANSIENT_FAILURE',
        message: authMessages.configurationMissing,
        session: null,
      });
      return;
    }

    dispatchIfMounted({ type: 'BOOTSTRAP_STARTED' });
    await restore(client);
  }, [dispatchIfMounted, restore]);

  const getAccessTokenForApi = useCallback(async () => {
    const client = clientRef.current;
    if (!client) {
      return { status: 'unavailable', session: null } as const;
    }

    const result = await getNativeApiAccessToken(client);
    if (result.status === 'auth_required') {
      dispatchIfMounted({ type: 'SESSION_INVALID' });
    } else if (result.status === 'unavailable') {
      dispatchIfMounted({
        type: 'TRANSIENT_FAILURE',
        message: authMessages.restoreFailed,
        // Unavailable + null means unknown, not a confirmed sign-out.
        session: result.session ?? undefined,
      });
    }
    return result;
  }, [dispatchIfMounted]);

  const revalidateApiSession = useCallback(async (rejectedAccessToken: string) => {
    const client = clientRef.current;
    if (!client) {
      return { status: 'unavailable', session: null } as const;
    }

    const result = await revalidateNativeSessionAfterUnauthorized(
      client,
      rejectedAccessToken,
    );
    if (result.status === 'invalid') {
      dispatchIfMounted({ type: 'SESSION_INVALID' });
    } else if (result.status === 'unavailable') {
      dispatchIfMounted({
        type: 'TRANSIENT_FAILURE',
        message: authMessages.restoreFailed,
        session: result.session ?? undefined,
      });
    } else {
      dispatchIfMounted({ type: 'SESSION_CONFIRMED', session: result.session });
    }
    return result;
  }, [dispatchIfMounted]);

  const signInWithGoogle = useCallback(async () => {
    const client = clientRef.current;
    if (!client || signInPendingRef.current) {
      return;
    }

    signInPendingRef.current = true;
    dispatchIfMounted({ type: 'SIGN_IN_STARTED' });

    try {
      const { data, error } = await client.auth.signInWithOAuth({
        provider: 'google',
        options: {
          queryParams: { prompt: 'select_account' },
          redirectTo: NATIVE_AUTH_CALLBACK_URL,
          skipBrowserRedirect: true,
        },
      });

      if (error || !data.url) {
        dispatchIfMounted({
          type: 'TRANSIENT_FAILURE',
          message: authMessages.signInFailed,
          session: null,
        });
        return;
      }

      const result = await WebBrowser.openAuthSessionAsync(data.url, NATIVE_AUTH_CALLBACK_URL);

      if (result.type === 'success') {
        await handleCallbackUrl(result.url);
      } else if (!authenticatedSession(stateRef.current)) {
        dispatchIfMounted({ type: 'SESSION_MISSING', notice: authMessages.oauthCancelled });
      }
    } catch {
      dispatchIfMounted({
        type: 'TRANSIENT_FAILURE',
        message: authMessages.signInFailed,
        session: null,
      });
    } finally {
      signInPendingRef.current = false;
    }
  }, [dispatchIfMounted, handleCallbackUrl]);

  const signOut = useCallback(async (notice?: string) => {
    const client = clientRef.current;
    if (!client) {
      return;
    }

    const event = await performLocalLogout(client);
    dispatchIfMounted(notice && event.type === 'SESSION_MISSING' ? { ...event, notice } : event);
  }, [dispatchIfMounted]);

  const value = useMemo<MobileAuthContextValue>(
    () => ({
      getAccessTokenForApi,
      handleCallbackUrl,
      revalidateApiSession,
      retry,
      session: authenticatedSession(state),
      signInWithGoogle,
      signOut,
      state,
    }),
    [getAccessTokenForApi, handleCallbackUrl, revalidateApiSession, retry, signInWithGoogle, signOut, state],
  );

  return <MobileAuthContext.Provider value={value}>{children}</MobileAuthContext.Provider>;
}

export function useMobileAuth(): MobileAuthContextValue {
  const value = useContext(MobileAuthContext);

  if (!value) {
    throw new Error('useMobileAuth must be used inside MobileAuthProvider');
  }

  return value;
}
