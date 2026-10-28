import { createContext, type PropsWithChildren, useCallback, useContext, useEffect, useMemo, useRef } from 'react';
import { useMobileApi } from '@/api';
import { useMobileAuth } from '@/auth';
import { ConfigurationEditor } from './config-editor';
import { useConfigurationController } from './use-config-controller';

type SharedConfiguration = ReturnType<typeof useConfigurationController>;
type ContextValue = { current: SharedConfiguration; subscribeConfirmed: (listener: () => void) => () => void; confirmExternalPlan: () => void };
const ConfigurationContext = createContext<ContextValue | null>(null);

/**
 * The single ConfigurationController of the signed-in user, shared by Nutrition and
 * Settings: one instance, one durable intent (`ownlevel.nutrition.config.v1.<userId>`),
 * one editor. A user switch disposes the previous instance; its intent stays in its
 * own namespace and is never shown to another user.
 */
export function NutritionConfigurationProvider({ children }: PropsWithChildren) {
  const { client } = useMobileApi();
  const { session } = useMobileAuth();
  const userId = session?.user.id ?? null;
  const listeners = useRef(new Set<() => void>());
  // Retained reports are already invalidated by the API client when the plan/config write settles.
  const invalidate = useCallback(() => { listeners.current.forEach(listener => listener()); }, []);
  const current = useConfigurationController(userId ? client : null, userId ?? 'anonymous', invalidate);
  const subscribeConfirmed = useCallback((listener: () => void) => {
    listeners.current.add(listener);
    return () => { listeners.current.delete(listener); };
  }, []);
  const controller = current?.controller;
  const confirmExternalPlan = useCallback(() => { if (controller) void controller.load(); invalidate(); }, [controller, invalidate]);
  const value = useMemo(() => ({ current, subscribeConfirmed, confirmExternalPlan }), [current, subscribeConfirmed, confirmExternalPlan]);
  return <ConfigurationContext.Provider value={value}>
    {children}
    {current ? <ConfigurationEditor controller={current.controller} state={current.state} /> : null}
  </ConfigurationContext.Provider>;
}

/** The shared controller (null while signed out or initializing). `onConfirmed` runs after every confirmed save. */
export function useNutritionConfiguration(onConfirmed?: () => void): SharedConfiguration {
  const value = useContext(ConfigurationContext);
  if (!value) throw new Error('useNutritionConfiguration must be used inside NutritionConfigurationProvider');
  const { subscribeConfirmed } = value;
  useEffect(() => (onConfirmed ? subscribeConfirmed(onConfirmed) : undefined), [onConfirmed, subscribeConfirmed]);
  return value.current;
}

/** Stage writes enter the exact same Home/Nutrition/report invalidation boundary as configuration. */
export function useConfirmExternalPlan() {
  const value = useContext(ConfigurationContext);
  if (!value) throw new Error('useConfirmExternalPlan requires NutritionConfigurationProvider');
  return value.confirmExternalPlan;
}
