import { useState } from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { describe, expect, it, jest } from '@jest/globals';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { OwnlevelThemeProvider } from '@/design-system';
import { sfSymbolNames } from '@/design-system/icon-names';
import { homeMetricIcon, metricIconGroup, metricIconGroups, metricIcons } from '@/home/home-metric-icons';
import { MetricIconPicker, iconGrid } from './metric-icon-picker';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('@/settings/native-segmented', () => jest.requireActual('@/settings/native-segmented.tsx'));

// Keys stored before #535: they must keep rendering as they did.
const STORED = ['water', 'footprints', 'moon', 'mug', 'book', 'dumbbell', 'bike', 'heart', 'pill', 'apple', 'brain', 'sun', 'bed',
  'activity', 'timer', 'smile', 'leaf', 'no-smoking'];

describe('metric icon catalog (#535)', () => {
  it('keeps every stored key, adds new ones in three groups, and every key fits the database format', () => {
    const keys = metricIcons.map(icon => icon.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const key of STORED) expect(keys).toContain(key);
    expect(keys.length).toBeGreaterThan(STORED.length + 12);
    for (const key of keys) {
      expect(key).toMatch(/^[a-z][a-z0-9-]{0,31}$/u); // user_metrics.icon check
      expect(sfSymbolNames[key]).toBeTruthy();
      expect(homeMetricIcon(null, key)).toBe(key);
    }
    for (const group of metricIconGroups) expect(metricIcons.filter(icon => icon.group === group.value).length).toBeGreaterThanOrEqual(8);
    expect(metricIconGroup('unknown-icon')).toBe('activity');
  });
  it('lays the grid edge to edge with round cells of about 40 pt (eight to a row on a phone)', () => {
    expect(iconGrid(370).columns).toBe(8); // iPhone 18 Pro: 402 pt minus the 16 pt margins
    for (const width of [311, 343, 358, 398, 688]) {
      const { columns, cell } = iconGrid(width);
      expect(cell).toBeGreaterThanOrEqual(38);
      expect(columns * cell + 8 * (columns - 1)).toBeLessThanOrEqual(width);
      expect(width - (columns * cell + 8 * (columns - 1))).toBeLessThan(columns);
    }
  });
});

function Harness({ initial, fallback = 'activity' as const }: { initial: string | null; fallback?: 'activity' | 'footprints' }) {
  const [value, setValue] = useState(initial);
  return <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
    <OwnlevelThemeProvider initialMode="light"><MetricIconPicker value={value} fallback={fallback} onChange={setValue} /></OwnlevelThemeProvider>
  </SafeAreaProvider>;
}

describe('MetricIconPicker (#535)', () => {
  it('shows every group at once, so the chosen icon is always in sight; only it is marked', () => {
    const view = render(<Harness initial="wine" />);
    for (const group of metricIconGroups) expect(view.getByText(group.label)).toBeTruthy();
    expect(view.queryByRole('radio', { name: 'Hábitos' })).toBeNull(); // no tabs any more
    expect(view.getByRole('radio', { name: 'Ícono: Alcohol' }).props.accessibilityState.checked).toBe(true);
    expect(view.getAllByRole('radio').filter(r => r.props.accessibilityState.checked)).toHaveLength(1);
    fireEvent.press(view.getByRole('radio', { name: 'Ícono: Temperatura' }));
    expect(view.getByRole('radio', { name: 'Ícono: Temperatura' }).props.accessibilityState.checked).toBe(true);
    expect(view.getByRole('radio', { name: 'Ícono: Alcohol' }).props.accessibilityState.checked).toBe(false);
    // Each round cell keeps a 44 pt touch area.
    const slop = view.getByRole('radio', { name: 'Ícono: Alcohol' }).props.hitSlop as number;
    expect(38 + 2 * slop).toBeGreaterThanOrEqual(44);
  });
  it('with nothing chosen nothing is marked; a second tap on a chosen icon goes back to the default', () => {
    const view = render(<Harness initial={null} fallback="footprints" />);
    expect(view.getAllByRole('radio').filter(r => r.props.accessibilityState.checked)).toHaveLength(0);
    fireEvent.press(view.getByRole('radio', { name: 'Ícono: Natación' }));
    expect(view.getByRole('radio', { name: 'Ícono: Natación' }).props.accessibilityState.checked).toBe(true);
    fireEvent.press(view.getByRole('radio', { name: 'Ícono: Natación' }));
    expect(view.getByRole('radio', { name: 'Ícono: Natación' }).props.accessibilityState.checked).toBe(false);
  });
});
