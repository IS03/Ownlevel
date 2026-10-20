import { act, fireEvent, render, within } from '@testing-library/react-native';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { AccessibilityInfo, Platform, StyleSheet } from 'react-native';

import type { HistoryDay } from '@/api/history';
import { OwnlevelThemeProvider } from '@/design-system';

import { HomeRegister } from './home-register';
import {definition} from '@/metrics/definitions-fixture.test-helper';

let mockSupported = true;
let mockReduced = false;
let mockFontScale = 1;
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({ __esModule: true,
  default: () => ({ width: 393, height: 852, scale: 3, fontScale: mockFontScale }),
}));
jest.mock('@/design-system', () => ({ ...jest.requireActual<object>('@/design-system'), useReduceMotion: () => mockReduced }));
jest.mock('expo-glass-effect', () => {
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return { GlassView: View, isGlassEffectAPIAvailable: () => mockSupported, isLiquidGlassAvailable: () => mockSupported };
});
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));

const day = { date: '2026-10-08', metrics: { status: 'ok', data: { metrics: Array.from({ length: 6 }, (_, index) => ({
  id: `m${index}`, label: `Métrica ${index}`, systemKey: null, unit: null, valueType: 'decimal', target: null,
  value: index === 0 ? 0 : null, isActive: true, updatedAt: null,
})) } } } as HistoryDay;

async function metrics() {
  const onRegister = jest.fn();
  const view = render(<OwnlevelThemeProvider initialMode="dark"><HomeRegister date={day.date} onRegister={onRegister}
    today={{ status: 'ready', confirmedAt: 1, data: day }} /></OwnlevelThemeProvider>);
  await act(async () => { await Promise.resolve(); });
  return { ...view, onRegister };
}

describe('Home metric controls', () => {
  it('a portion uses the exact displayed snapshot, long press keeps full entry, and pending disables repeat taps',()=>{
    const onRegister=jest.fn(),props={date:day.date,onRegister,today:{status:'ready' as const,confirmedAt:1,data:day},metricDefinitions:[definition({id:'m0',quickValue:0.25,icon:'book',valueType:'decimal',unit:null})]};
    const view=render(<OwnlevelThemeProvider initialMode="dark"><HomeRegister {...props}/></OwnlevelThemeProvider>);
    const circle=view.getByTestId('home-register-metric-m0');
    // A quick-entry metric says so before the first tap; the others carry no "+".
    expect(view.getByTestId('home-register-metric-m0-quick')).toBeTruthy();
    expect(view.queryAllByTestId(/^home-register-metric-(?!m0).*-quick$/)).toHaveLength(0);
    fireEvent.press(circle);expect(onRegister).toHaveBeenLastCalledWith({kind:'metric',metricId:'m0',quick:{value:0,updatedAt:null,definitionUpdatedAt:undefined,portion:0.25,date:day.date}});
    fireEvent(circle,'longPress');expect(onRegister).toHaveBeenLastCalledWith({kind:'metric',metricId:'m0'});
    view.rerender(<OwnlevelThemeProvider initialMode="dark"><HomeRegister {...props} metricBusyId="m0" metricsLocked/></OwnlevelThemeProvider>);
    expect(view.getByTestId('home-register-metric-m0')).toBeDisabled();expect(view.getByTestId('home-register-metric-m0').props.accessibilityState.busy).toBe(true);
    fireEvent.press(view.getByTestId('home-register-metric-m0'));expect(onRegister).toHaveBeenCalledTimes(2);
  });
  beforeEach(() => { jest.restoreAllMocks(); mockSupported = true; mockReduced = false; mockFontScale = 1; });

  it('all six metrics remain reachable, zero is logged, and Más scrolls after the metrics', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceTransparencyEnabled').mockResolvedValue(false);
    const view = await metrics();
    expect(view.getAllByTestId(/home-register-metric-m\d$/)).toHaveLength(6);
    expect(view.getByRole('button', { name: 'Métrica 0, 0' }).props.accessibilityState).toMatchObject({ checked: true });
    fireEvent.press(view.getByTestId('home-register-metric-m5'));
    expect(view.onRegister).toHaveBeenCalledWith({ kind: 'metric', metricId: 'm5' });
    fireEvent.press(view.getByTestId('home-register-more'));
    expect(view.onRegister).toHaveBeenCalledWith({ kind: 'more' });
    expect(view.getByTestId('home-register-scroll').props.horizontal).toBe(true);
    expect(within(view.getByTestId('home-register-scroll')).getByTestId('home-register-more')).toBeTruthy();
    expect(view.getByTestId('home-register-more-glass').props.colorScheme).toBe('dark');
  });

  it('Reduce Transparency uses solid controls and responds to changes while open', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceTransparencyEnabled').mockResolvedValue(true);
    const listener = jest.spyOn(AccessibilityInfo, 'addEventListener');
    const view = await metrics();
    expect(view.queryByTestId('home-register-more-glass')).toBeNull();
    const calls = listener.mock.calls as unknown as [string, (value: boolean) => void][];
    const callback = calls.find(call => call[0] === 'reduceTransparencyChanged')![1];
    act(() => callback(false));
    expect(view.getByTestId('home-register-more-glass')).toBeTruthy();
    act(() => callback(true));
    expect(view.queryByTestId('home-register-more-glass')).toBeNull();
  });

  it('native expansion has top headroom and is not combined with a second press scale', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceTransparencyEnabled').mockResolvedValue(false);
    const view = await metrics();
    const scroller = view.getByTestId('home-register-scroll');
    expect(StyleSheet.flatten(scroller.props.contentContainerStyle).paddingTop).toBe(20);
    expect(scroller.props.removeClippedSubviews).toBe(false);
    expect(StyleSheet.flatten(scroller.props.contentContainerStyle).paddingBottom).toBe(8);
    expect(StyleSheet.flatten(view.getByTestId('home-register-row').props.style).marginRight).toBe(-16);
    expect(view.getByTestId('home-register-metric-m0-glass').props.isInteractive).toBe(true);
    fireEvent(view.getByTestId('home-register-metric-m0'), 'pressIn');
    expect(StyleSheet.flatten(view.getByTestId('home-register-metric-m0').props.style).transform).toBeUndefined();
  });

  it('Reduce Motion disables native expansion while retaining the metric action', async () => {
    mockReduced = true;
    jest.spyOn(AccessibilityInfo, 'isReduceTransparencyEnabled').mockResolvedValue(false);
    const view = await metrics();
    expect(view.getByTestId('home-register-metric-m0-glass').props.isInteractive).toBe(false);
    fireEvent.press(view.getByTestId('home-register-metric-m0'));
    expect(view.onRegister).toHaveBeenCalledWith({ kind: 'metric', metricId: 'm0' });
  });

  it('unsupported systems and Android never mount native glass', async () => {
    mockSupported = false;
    const view = await metrics();
    expect(view.queryByTestId('home-register-more-glass')).toBeNull();
    view.unmount();
    mockSupported = true;
    jest.replaceProperty(Platform, 'OS', 'android');
    const android = await metrics();
    expect(android.queryByTestId('home-register-more-glass')).toBeNull();
  });

  it('two metrics and Más distribute across three equal columns', async () => {
    mockSupported = false;
    const view = render(<OwnlevelThemeProvider initialMode="light"><HomeRegister date={day.date} onRegister={() => undefined}
      today={{ status: 'ready', confirmedAt: 1, data: { ...day, metrics: { status: 'ok', data: { metrics: day.metrics.status === 'ok' ? day.metrics.data.metrics.slice(0, 2) : [] } } } }} /></OwnlevelThemeProvider>);
    fireEvent(view.getByTestId('home-register-row'), 'layout', { nativeEvent: { layout: { width: 376 } } });
    expect(StyleSheet.flatten(view.getByTestId('home-register-more').props.style).width).toBe(120);
    expect(StyleSheet.flatten(view.getByTestId('home-register-metric-m0').props.style).width).toBe(120);
  });

  it('larger type widens every item, including Más', async () => {
    mockFontScale = 2;
    const view = await metrics();
    expect(StyleSheet.flatten(view.getByTestId('home-register-more').props.style).width).toBe(160);
    expect(StyleSheet.flatten(view.getByTestId('home-register-metric-m0').props.style).width).toBe(160);
  });

  it('no active metrics keeps Más as the only action inside the scroller', () => {
    mockSupported = false;
    const view = render(<OwnlevelThemeProvider><HomeRegister date={day.date} onRegister={() => undefined}
      today={{ status: 'ready', confirmedAt: 1, data: { ...day, metrics: { status: 'ok', data: { metrics: [] } } } }} /></OwnlevelThemeProvider>);
    expect(within(view.getByTestId('home-register-scroll')).getAllByRole('button')).toHaveLength(1);
    expect(within(view.getByTestId('home-register-scroll')).getByTestId('home-register-more')).toBeTruthy();
  });

  it('a failed preference read stays solid rather than assuming transparency is allowed', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceTransparencyEnabled').mockRejectedValue(new Error('unavailable'));
    const view = await metrics();
    expect(view.queryByTestId('home-register-more-glass')).toBeNull();
  });
});
