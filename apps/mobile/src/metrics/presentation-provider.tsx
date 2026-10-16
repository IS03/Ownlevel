import { createContext, useContext, type PropsWithChildren } from 'react';
import type { MetricDefinition } from '@/api/metric-definitions';
import { useMetricPresentation } from './presentation-resource';
const Context = createContext<MetricDefinition[]>([]);
export function MetricPresentationProvider({ children }: PropsWithChildren) {
  const definitions = useMetricPresentation();
  return <Context.Provider value={definitions}>{children}</Context.Provider>;
}
export const useMetricPresentations = () => useContext(Context);
