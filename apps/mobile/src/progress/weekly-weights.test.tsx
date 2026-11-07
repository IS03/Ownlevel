import { render } from '@testing-library/react-native';
import { describe, expect, it, jest } from '@jest/globals';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { OwnlevelThemeProvider } from '@/design-system';
import { weeklyWeights } from '../../../../src/lib/progress/body-evolution/weekly';
import { WeeklyWeights, weeklyRows } from './weekly-weights';

jest.mock('@react-native-async-storage/async-storage', () => jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));

const w = (date: string, value: number) => ({ date, value });
// 2029-03-05 is a Monday.
const observations = [w('2029-03-05', 80), w('2029-03-07', 80.4), w('2029-03-09', 80.2), w('2029-03-12', 79.6), w('2029-03-14', 79.8), w('2029-03-16', 79.4), w('2029-03-20', 79.5), w('2029-03-26', 79)];
const period = { start: '2029-03-05', end: '2029-03-27' }, today = '2029-03-27';

describe('#367 fase 3: semana a semana en Cuerpo', () => {
  it('shows each closed week newest first, with its median, its dates and the change from the week right before', () => {
    const rows = weeklyRows(weeklyWeights(observations, period, today), today);
    expect(rows.map(row => [row.label, row.value])).toEqual([['Semana 19–25 mar', 'Sin mediana'], ['Semana 12–18 mar', 'Mediana 79,6 kg'], ['Semana 5–11 mar', 'Mediana 80,2 kg']]);
    expect(rows[1]!.detail).toBe('3 pesajes: lun 12, mié 14, vie 16 · ↘ 0,6 kg frente a la semana anterior');
    expect(rows[0]!.detail).toBe('1 pesaje: mar 20 · sin cambio: esta semana tiene menos de 3 pesajes');
    expect(rows[2]!.detail).toBe('3 pesajes: lun 5, mié 7, vie 9');
  });
  it('says what is left out and never judges the change', () => {
    const view = render(<SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
      <OwnlevelThemeProvider initialMode="light"><WeeklyWeights observations={observations} period={period} today={today} /></OwnlevelThemeProvider></SafeAreaProvider>);
    expect(view.getByText(/1 pesaje del período queda fuera por caer en una semana incompleta o en curso/)).toBeTruthy();
    expect(view.queryByText(/mejor|peor|bien|mal|déficit|superávit/i)).toBeNull();
    expect(view.getByLabelText(/Semana 12–18 mar: mediana 79,6 kg\. 3 pesajes/)).toBeTruthy();
  });
  it('says there is no whole closed week rather than showing an empty chart', () => {
    const view = render(<SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
      <OwnlevelThemeProvider initialMode="light"><WeeklyWeights observations={[w('2029-03-26', 79)]} period={{ start: '2029-03-26', end: '2029-03-27' }} today={today} /></OwnlevelThemeProvider></SafeAreaProvider>);
    expect(view.getByTestId('body-weekly-empty')).toBeTruthy();
  });
});
