import { fireEvent, render } from '@testing-library/react-native';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { StyleSheet } from 'react-native';

import { habitWeekRange, type ProgressHabitWeek } from '@/api/progress';
import { OwnlevelThemeProvider } from '@/design-system';

import { HomeHabits, habitDirection } from './home-habits';
import type { HomeResource } from './home-resource';
import { homeProgressHabits } from './home-test-fixtures';

let mockFontScale = 1;
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({ __esModule: true,
  default: () => ({ width: 393, height: 852, scale: 3, fontScale: mockFontScale }),
}));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
const base = homeProgressHabits();
const items = [base.items[0],
  { ...base.items[0], id: 'steps', name: 'Pasos', systemKey: 'steps', unit: null, valueType: 'integer' as const, average: 8420 },
  { ...base.items[0], id: 'sleep', name: 'Sueño', systemKey: 'sleep', unit: 'min', valueType: 'duration' as const, average: 430.2 },
  ...Array.from({ length: 3 }, (_, i) => ({ ...base.items[0], id: `extra-${i}`, name: `Extra ${i}` })),
];
const ready = (data: ProgressHabitWeek): HomeResource<ProgressHabitWeek> => ({ data, status: 'ready', confirmedAt: 1 });
function habits(resource = ready({ ...base, items }), theme: 'dark' | 'light' = 'light') {
  const onOpen = jest.fn(), onMetrics = jest.fn();
  const view = render(<OwnlevelThemeProvider initialMode={theme}><HomeHabits habits={resource} onOpen={onOpen} onMetrics={onMetrics}
    today={base.today} weekStart={base.weekStart} /></OwnlevelThemeProvider>);
  return { ...view, onOpen, onMetrics };
}

beforeEach(() => { mockFontScale = 1; });

describe('Home weekly habits', () => {
  it.each(['light', 'dark'] as const)('shows three ordered rows, faithful formats and a neutral arrow in %s', theme => {
    const view = habits(ready({ ...base, items }), theme);
    expect(view.getAllByTestId(/^home-habit-(m1|steps|sleep)$/).map(row => row.props.testID)).toEqual(['home-habit-m1', 'home-habit-steps', 'home-habit-sleep']);
    expect(view.getByText('2,1 L')).toBeTruthy();
    expect(view.getByText('8.420')).toBeTruthy();
    expect(view.getByText('7 h 10 min')).toBeTruthy();
    expect(StyleSheet.flatten(view.getByTestId('home-habit-m1-direction').props.style).color).toBe(theme === 'dark' ? '#9F9FA9' : '#62626A');
    fireEvent.press(view.getByTestId('home-habit-steps'));
    expect(view.onOpen).toHaveBeenCalledWith('steps');
    expect(view.getByText('y 3 más')).toBeTruthy();
    fireEvent.press(view.getByTestId('home-habits-more'));
    expect(view.onMetrics).toHaveBeenCalledTimes(1);
  });

  it('missing values have no arrow and remain distinct from a registered zero', () => {
    const missing = { ...items[0], average: null, coverage: { registered: 0, eligible: 5, ratio: 0 } };
    const zero = { ...items[1], average: 0, comparison: { ...items[1].comparison, status: 'insufficient_data' as const } };
    const view = habits(ready({ ...base, items: [missing, zero] }));
    expect(view.getByText('—')).toBeTruthy();
    expect(view.getByText('0')).toBeTruthy();
    expect(view.getByText('Promedio · 0 de 7 días')).toBeTruthy();
    expect(view.queryAllByTestId(/-direction$/)).toHaveLength(0);
    expect(view.queryByTestId('home-habits-more')).toBeNull();
  });

  it('only comparable increases/decreases show an arrow; stable and insufficient comparisons do not', () => {
    const item = items[0];
    expect(habitDirection(item)).toBe('↗');
    expect(habitDirection({ ...item, comparison: { ...item.comparison, change: 'decreased' } })).toBe('↘');
    expect(habitDirection({ ...item, comparison: { ...item.comparison, change: 'stable' } })).toBeNull();
    expect(habitDirection({ ...item, comparison: { ...item.comparison, status: 'not_comparable' } })).toBeNull();
    expect(habitDirection({ ...item, comparison: { ...item.comparison, status: 'insufficient_data' } })).toBeNull();
  });

  it('no active metrics offers a useful neutral way to enable them', () => {
    const view = habits(ready({ ...base, items: [] }));
    expect(view.getByText('Activá una métrica para ver acá tus promedios.')).toBeTruthy();
    fireEvent.press(view.getByText('Ir a Métricas'));
    expect(view.onMetrics).toHaveBeenCalledTimes(1);
    expect(view.queryAllByTestId(/^home-habit-/)).toHaveLength(0);
  });

  it('loading, unavailable, stale and a response from another week never turn into a false empty state', () => {
    const loading = habits({ status: 'loading', data: undefined, confirmedAt: null });
    expect(loading.getByTestId('home-habits-loading')).toBeTruthy(); loading.unmount();
    const unavailable = habits({ status: 'unavailable', data: undefined, confirmedAt: null });
    expect(unavailable.getByText('No pudimos cargar Hábitos de esta semana.')).toBeTruthy(); unavailable.unmount();
    const stale = habits({ status: 'unavailable', data: { ...base, items }, confirmedAt: 1 });
    expect(stale.getByText('Sin actualizar · Última lectura disponible')).toBeTruthy();
    expect(stale.getByText('y 4 más')).toBeTruthy(); stale.unmount();
    const wrong = habits(ready({ ...base, ...habitWeekRange('2026-09-28'), today: '2026-09-28' }));
    expect(wrong.getByText('No pudimos cargar Hábitos de esta semana.')).toBeTruthy();
    expect(wrong.queryByTestId('home-habits-empty')).toBeNull();
  });

  it('large type reduces rows while keeping the exact remaining count and access', () => {
    mockFontScale = 2;
    const view = habits();
    expect(view.queryByTestId('home-habit-sleep')).toBeNull();
    expect(view.getByText('y 4 más')).toBeTruthy();
  });
});
