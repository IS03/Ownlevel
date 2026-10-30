import { fireEvent, render, within } from '@testing-library/react-native';
import { describe, expect, it, jest } from '@jest/globals';

import { parseProgressBody, parseProgressTrainingRecords, type ProgressBody, type ProgressTrainingRecords } from '@/api/progress';
import { OwnlevelThemeProvider } from '@/design-system';

import { HomeProgress } from './home-progress';
import type { HomeResource } from './home-resource';
import { homeProgressBody, homeProgressRecords } from './home-test-fixtures';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));

const ready = <T,>(data: T): HomeResource<T> => ({ data, confirmedAt: 1, status: 'ready' });
const unavailable = <T,>(data?: T): HomeResource<T> => ({ data, confirmedAt: data ? 1 : null, status: 'unavailable' });
const loading = <T,>(): HomeResource<T> => ({ data: undefined, confirmedAt: null, status: 'loading' });

function show(overrides: Partial<React.ComponentProps<typeof HomeProgress>> = {}) {
  const onOpen = jest.fn(), onRetry = jest.fn(), onAll = jest.fn();
  const props = { body: ready(homeProgressBody()), date: '2026-10-10', records: ready(homeProgressRecords()), onOpen, onRetry, onAll, ...overrides };
  return { ...render(<OwnlevelThemeProvider initialMode="light"><HomeProgress {...props} /></OwnlevelThemeProvider>), onOpen, onRetry, onAll };
}

describe('Home progress (grouped list)', () => {
  it('uses contract-valid snapshots: records of the last 30 days and the last weight with its date; no 7-day trainings card', () => {
    expect(parseProgressBody(homeProgressBody())).toBeDefined();
    expect(parseProgressTrainingRecords(homeProgressRecords())).toBeDefined();
    const view = show();
    const records = within(view.getByTestId('home-progress-records'));
    expect(records.getByText('1 récord en 30 días')).toBeTruthy();
    expect(records.getByText('Press banca')).toBeTruthy();
    const weight = within(view.getByTestId('home-progress-weight'));
    expect(weight.getByText('78,4 kg')).toBeTruthy();
    expect(weight.getByText('Último registro: hoy')).toBeTruthy();
    expect(view.queryByTestId('home-progress-training')).toBeNull();
    expect(view.queryByText(/volumen|mejor peso corporal/i)).toBeNull();
  });

  it('several records: two names + "y N más", routed to the training list', () => {
    const records = homeProgressRecords();
    for (const name of ['Sentadilla', 'Remo', 'Dominadas']) records.personalRecords.push({ exerciseId: `${name}-id`, name, description: 'Nuevo mejor peso' });
    const view = show({ records: ready(records) });
    expect(view.getByText('4 récords en 30 días')).toBeTruthy();
    expect(view.getByText('Press banca, Sentadilla y 2 más')).toBeTruthy();
    fireEvent.press(view.getByTestId('home-progress-records'));
    fireEvent.press(view.getByTestId('home-progress-weight'));
    expect(view.onOpen.mock.calls).toEqual([[{ kind: 'training', period: '30' }], [{ kind: 'body', period: '7' }]]);
  });

  it('a weight from another day says when it was logged', () => {
    const body = homeProgressBody();
    Object.assign(body.metrics[0], { latest: { ...body.metrics[0].latest!, date: '2026-10-03' } });
    expect(show({ body: ready(body) }).getByText('Último registro: 3 oct')).toBeTruthy();
  });

  it.each(['improved', 'declined'] as const)('without a PR shows a real %s exercise signal with its native units', status => {
    const records = homeProgressRecords(); records.personalRecords = [];
    records.exercises = [{ id: 'machine-id', name: 'Remo', muscleLabel: 'Espalda', weightMode: 'unit_reps', status, reason: 'comparable',
      signal: { kind: 'load', description: '8 lingotes × 6 reps', currentValue: 8, referenceValue: 7, contextValue: 6 },
      isPersonalRecord: false, sessions: 3, sets: 9, lastDate: '2026-10-09' }];
    const view = show({ records: ready(records) });
    expect(view.getByText(`${status === 'improved' ? '↑' : '↓'} Remo · 8 lingotes × 6 reps`)).toBeTruthy();
    fireEvent.press(view.getByTestId('home-progress-records'));
    expect(view.onOpen).toHaveBeenCalledWith({ kind: 'exercise', period: '30', exerciseId: 'machine-id' });
  });

  it('empty data and incomparable exercises stay neutral without fake records', () => {
    const body = homeProgressBody(); body.metrics = [];
    const records = homeProgressRecords(); records.personalRecords = [];
    records.performance.comparable = 0;
    const view = show({ body: ready(body), records: ready(records) });
    expect(view.getByText('Sin registros')).toBeTruthy();
    expect(view.getByText('Sin récords en 30 días')).toBeTruthy();
    expect(view.getByText('Faltan entrenamientos comparables')).toBeTruthy();
  });

  it('each read is independent: unavailable weight can retry while records render', () => {
    const view = show({ body: unavailable<ProgressBody>() });
    expect(view.queryByText('78,4 kg')).toBeNull();
    expect(view.getByText('Press banca')).toBeTruthy();
    fireEvent.press(within(view.getByTestId('home-progress-weight')).getByRole('button', { name: 'Reintentar' }));
    expect(view.onRetry).toHaveBeenCalledTimes(1);
  });

  it('initial reads show placeholders; a failed refresh marks the retained snapshot as not updated', () => {
    const view = show({ body: unavailable(homeProgressBody()), records: loading<ProgressTrainingRecords>() });
    expect(view.queryByText('Press banca')).toBeNull();
    expect(within(view.getByTestId('home-progress-weight')).getByText('Sin actualizar · Reintentar')).toBeTruthy();
  });

  it('never shows yesterday\'s rolling-period values as today\'s', () => {
    const view = show({ date: '2026-10-11' });
    expect(view.queryByText('78,4 kg')).toBeNull();
    expect(view.queryByText('Press banca')).toBeNull();
  });
});
