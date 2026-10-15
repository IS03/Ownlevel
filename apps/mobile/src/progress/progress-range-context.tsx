import { createContext, useContext, useMemo, useState, type PropsWithChildren } from 'react';
import { AppState } from 'react-native';
import { useEffect } from 'react';
import { nutritionToday } from '@/nutrition/day-format';
import type { MetricValueType, ProgressComparison, ProgressCompareRange, ProgressQuery } from '@/api/progress';
import { comparisonText } from './progress-format';
import { compareLabel, initialProgressRange, progressRequest, type ProgressRangeState } from './progress-range';

type ProgressRangeValue = {
  state: ProgressRangeState; setState: (next: ProgressRangeState) => void; today: string;
  query: ProgressQuery; compare: ProgressCompareRange; compareOn: boolean; compareText: string | null;
};
const ProgressRangeContext = createContext<ProgressRangeValue | null>(null);

/** One period and one comparison for every Progreso screen: what you set on the hub stays set in Nutrición, Cuerpo… */
export function ProgressRangeProvider({ children, initialToday, initialState }: PropsWithChildren<{ initialToday?: string; initialState?: ProgressRangeState }>) {
  const [today, setToday] = useState(() => initialToday ?? nutritionToday());
  const [state, setState] = useState(() => initialState ?? initialProgressRange(today));
  // A new day (app left open past midnight) moves "today" forward; the chosen period stays.
  useEffect(() => {
    if (initialToday) return; // tests pin the day
    const sub = AppState.addEventListener('change', s => { if (s === 'active') setToday(nutritionToday()); });
    return () => sub.remove();
  }, [initialToday]);
  const value = useMemo(() => {
    const { query, compare } = progressRequest(state, today);
    return { state, setState, today, query, compare, compareOn: compare !== null, compareText: compareLabel(state, today) };
  }, [state, today]);
  return <ProgressRangeContext.Provider value={value}>{children}</ProgressRangeContext.Provider>;
}
export function useProgressRange(): ProgressRangeValue {
  const value = useContext(ProgressRangeContext);
  if (!value) throw new Error('useProgressRange needs ProgressRangeProvider');
  return value;
}

/** Comparison lines only exist while "Comparar" is on, and name the chosen range ("frente a 1–15 sep"). */
export function useComparisonText() {
  const { compareOn, compareText } = useProgressRange();
  return (c: ProgressComparison, unit: string | null, valueType?: MetricValueType) => compareOn && compareText ? comparisonText(c, unit, valueType, compareText) : null;
}
