import { act, fireEvent, render } from '@testing-library/react-native';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { ReactNode } from 'react';
import { StyleSheet } from 'react-native';

import { OwnlevelThemeProvider } from '@/design-system';
import { weekDates } from '@/home/home-day';

import { buildTrainingMonth } from './calendar';
import { monthCells, pickerYears, weekMarks } from './training-hub-model';
import { TrainingWeekCalendar } from './training-week-calendar.ios';
import type { TrainingWeekCalendarProps } from './training-week-calendar.types';

let mockGlass = true;
let mockGeometry: ((frame: { height: number }) => void) | undefined;
type MockProps = { children?: ReactNode; modifiers?: Record<string, unknown>[]; style?: unknown; testID?: string; systemName?: string };
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('expo-glass-effect', () => ({ GlassView: () => null, isGlassEffectAPIAvailable: () => mockGlass, isLiquidGlassAvailable: () => mockGlass }));
// SwiftUI views are native: each renders its children; a tap modifier becomes a pressable with its label.
jest.mock('@expo/ui/swift-ui/modifiers', () => {
  const marker = (key: string) => (value?: unknown) => ({ [key]: value });
  return {
    Animation: { easeIn: () => ({ delay: () => ({}) }), easeInOut: () => ({}), easeOut: () => ({}), smooth: () => ({}) },
    accessibilityAddTraits: marker('traits'), accessibilityLabel: marker('label'), animation: marker('animation'), blur: marker('blur'), contentShape: marker('shape'), fixedSize: marker('fixed'), opacity: marker('opacity'), scaleEffect: marker('scale'),
    font: marker('font'), foregroundStyle: marker('fg'), frame: marker('frame'), glassEffect: marker('glass'), monospacedDigit: marker('mono'),
    onGeometryChange: marker('onGeometry'), onTapGesture: marker('onTap'), padding: marker('padding'), pickerStyle: marker('pickerStyle'), shapes: { rectangle: () => ({}) },
    strokeBorder: marker('stroke'), tag: marker('tag'),
  };
});
jest.mock('@expo/ui/swift-ui', () => {
  const { Pressable, Text: RNText, View } = jest.requireActual<typeof import('react-native')>('react-native');
  const find = (modifiers: MockProps['modifiers'], key: string) => modifiers?.find(modifier => key in modifier)?.[key];
  const container = ({ children, modifiers, testID }: MockProps) => {
    const onTap = find(modifiers, 'onTap') as (() => void) | undefined;
    const onGeometry = find(modifiers, 'onGeometry') as typeof mockGeometry;
    if (onGeometry) mockGeometry = onGeometry;
    const label = find(modifiers, 'label') as string | undefined;
    return onTap ? <Pressable accessibilityLabel={label} accessibilityRole="button" onPress={onTap} testID={testID}>{children}</Pressable>
      : <View accessibilityLabel={label} testID={testID}>{children}</View>;
  };
  const Grid = Object.assign(container, { Row: container });
  return {
    Circle: () => null, GlassEffectContainer: container, Grid, HStack: container,
    Host: ({ children, style, testID }: MockProps) => <View style={style as object} testID={testID}>{children}</View>, Spacer: () => null, VStack: container, ZStack: container,
    Image: ({ modifiers, systemName }: MockProps) => container({ children: <RNText>{systemName}</RNText>, modifiers }),
    Picker: ({ children }: MockProps) => <View testID="native-wheel">{children}</View>,
    Text: ({ children, modifiers }: MockProps) => container({ children: <RNText>{children}</RNText>, modifiers }),
  };
});

const TODAY = '2026-10-09';
const handlers = { onCollapse: jest.fn(), onExpand: jest.fn(), onMonth: jest.fn(), onOpenDay: jest.fn() };
function calendarProps(overrides: Partial<TrainingWeekCalendarProps> = {}): TrainingWeekCalendarProps {
  const trained = new Set(['2026-10-05', '2026-10-08']);
  return {
    ...handlers, expanded: false, marks: weekMarks(weekDates('2026-10-05'), TODAY, trained, new Set(['2026-10'])), month: '2026-10',
    monthCells: monthCells(buildTrainingMonth('2026-10'), TODAY, trained), monthStatus: 'ready', today: TODAY, years: pickerYears(TODAY),
    ...overrides,
  };
}
function renderCalendar(overrides: Partial<TrainingWeekCalendarProps> = {}) {
  Object.values(handlers).forEach(handler => handler.mockReset());
  const view = render(<OwnlevelThemeProvider initialMode="light"><TrainingWeekCalendar {...calendarProps(overrides)} /></OwnlevelThemeProvider>);
  return { ...view, ...handlers };
}

describe('Training week calendar (iOS)', () => {
  beforeEach(() => { mockGlass = true; mockGeometry = undefined; });

  it('React Native sizes the host: open before the glass grows, kept open while it closes, then the measured strip', () => {
    jest.useFakeTimers();
    const onCollapsedHeight = jest.fn();
    const view = renderCalendar({ onCollapsedHeight });
    const height = () => StyleSheet.flatten(view.getByTestId('training-week-calendar').props.style).height as number;
    act(() => mockGeometry?.({ height: 100 }));
    expect(onCollapsedHeight).toHaveBeenCalledWith(100);
    expect(height()).toBe(100);
    view.rerender(<OwnlevelThemeProvider initialMode="light"><TrainingWeekCalendar {...calendarProps({ expanded: true, onCollapsedHeight })} /></OwnlevelThemeProvider>);
    expect(height()).toBeGreaterThan(400); // estimated before the month is measured
    act(() => mockGeometry?.({ height: 480 }));
    expect(height()).toBe(480);
    view.rerender(<OwnlevelThemeProvider initialMode="light"><TrainingWeekCalendar {...calendarProps({ onCollapsedHeight })} /></OwnlevelThemeProvider>);
    expect(height()).toBe(480); // the glass is still animating closed
    act(() => { jest.advanceTimersByTime(450); });
    expect(height()).toBe(100);
    jest.useRealTimers();
  });

  it('iOS 26: SwiftUI with Liquid Glass; tapping the week opens the month (no navigation)', () => {
    const view = renderCalendar();
    expect(view.queryByTestId('training-month-calendar')).toBeNull(); // the RN fallback is not used
    fireEvent.press(view.getByRole('button', { name: 'Semana, abrir calendario' }));
    expect(view.onExpand).toHaveBeenCalledTimes(1);
    expect(view.onOpenDay).not.toHaveBeenCalled();
  });

  it('expanded: the week stays on top; past days open History, future ones do nothing; arrows change month; the title opens the native wheels', () => {
    const view = renderCalendar({ expanded: true });
    fireEvent.press(view.getByRole('button', { name: 'Semana, cerrar calendario' }));
    expect(view.onCollapse).toHaveBeenCalledTimes(1);
    expect(view.queryByText(/días entrenados/)).toBeNull();
    fireEvent.press(view.getByRole('button', { name: 'Lunes 5, entrenaste' }));
    expect(view.onOpenDay).toHaveBeenCalledWith('2026-10-05');
    expect(view.queryByRole('button', { name: 'Sábado 10' })).toBeNull();
    fireEvent.press(view.getByRole('button', { name: 'Mes anterior' }));
    fireEvent.press(view.getByRole('button', { name: 'Mes siguiente' }));
    expect(view.onMonth.mock.calls).toEqual([['2026-09'], ['2026-11']]);
    expect(view.queryByRole('button', { name: 'Mes anterior' })).toBeTruthy();
    fireEvent.press(view.getByRole('button', { name: 'Octubre 2026, elegir mes y año' }));
    expect(view.getAllByTestId('native-wheel')).toHaveLength(2); // the wheels cross-fade in (always mounted)
    expect(view.queryByRole('button', { name: 'Mes anterior' })).toBeNull();
    expect(view.getByText('Septiembre')).toBeTruthy();
    expect(view.getByText('2027')).toBeTruthy();
  });

  it('no "Ir a hoy" or trained-days count, in any month', () => {
    const view = renderCalendar({ expanded: true, month: '2026-08', monthCells: monthCells(buildTrainingMonth('2026-08'), TODAY, new Set()) });
    expect(view.queryByText('Ir a hoy')).toBeNull();
    expect(view.queryByText(/días entrenados/)).toBeNull();
  });

  it('without Liquid Glass (older iOS): the React Native version on the brand surface', () => {
    mockGlass = false;
    const view = renderCalendar({ expanded: true });
    expect(view.getByTestId('training-month-calendar')).toBeTruthy();
  });
});
