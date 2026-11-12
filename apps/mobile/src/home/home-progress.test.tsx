import { fireEvent, render, within } from '@testing-library/react-native';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { StyleSheet } from 'react-native';

import { parseProgressBody, parseProgressTrainingRecords, type ProgressBody, type ProgressBodyMetric, type ProgressTrainingRecords } from '@/api/progress';
import { OwnlevelThemeProvider } from '@/design-system';

import { HomeProgress } from './home-progress';
import type { HomeResource } from './home-resource';
import { homeProgressBody, homeProgressRecords } from './home-test-fixtures';

let mockFontScale = 1;
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({ __esModule: true,
  default: () => ({ width: 393, height: 852, scale: 3, fontScale: mockFontScale }),
}));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
beforeEach(() => { mockFontScale = 1; });

const ready = <T,>(data: T): HomeResource<T> => ({ data, confirmedAt: 1, status: 'ready' });
const unavailable = <T,>(data?: T): HomeResource<T> => ({ data, confirmedAt: data ? 1 : null, status: 'unavailable' });
const loading = <T,>(): HomeResource<T> => ({ data: undefined, confirmedAt: null, status: 'loading' });

function show(overrides: Partial<React.ComponentProps<typeof HomeProgress>> = {}, theme: 'dark' | 'light' = 'light') {
  const onOpen = jest.fn(), onRetry = jest.fn(), onAll = jest.fn();
  const props = { body: ready(homeProgressBody()), date: '2026-10-10', records: ready(homeProgressRecords()), onOpen, onRetry, onAll, ...overrides };
  return { ...render(<OwnlevelThemeProvider initialMode={theme}><HomeProgress {...props} /></OwnlevelThemeProvider>), onOpen, onRetry, onAll };
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

const waist = (date: string, value = 90.5): ProgressBodyMetric => {
  const latest = { date, value, imported: false, provenanceLabel: 'Registro' };
  return { key: 'body.waist', label: 'Cintura', unit: 'cm', latest, first: latest, last: latest, change: null, referenceChange: null, trend: 'unavailable',
    confidence: 'unavailable', observations: [latest], referenceCount: 0, comparison: { status: 'insufficient_data', reason: 'insufficient_previous_samples' } };
};
function bodyWithWaist(date = '2026-10-07') {
  const body = homeProgressBody(); body.metrics.push(waist(date)); return body;
}

describe('Home progress (contextual third note)', () => {
  it('renders the measure under the two stable rows and opens that measure\'s detail', () => {
    const view = show({ body: ready(bodyWithWaist()) });
    expect(view.getAllByTestId(/^home-progress-(records|weight|measure)$/).map(row => row.props.testID)).toEqual(['home-progress-records', 'home-progress-weight', 'home-progress-measure']);
    const measure = within(view.getByTestId('home-progress-measure'));
    expect(measure.getByText('Cintura')).toBeTruthy();
    expect(measure.getByText('90,5 cm')).toBeTruthy();
    expect(measure.getByText('Último registro: 7 oct')).toBeTruthy();
    fireEvent.press(view.getByTestId('home-progress-measure'));
    expect(view.onOpen).toHaveBeenLastCalledWith({ kind: 'body', period: '7', metric: 'body.waist', from: '2026-09-10', to: '2026-10-10' });
  });

  it('each row opens its own detail with its own target', () => {
    const view = show({ body: ready(bodyWithWaist()) });
    for (const id of ['records', 'weight', 'measure']) fireEvent.press(view.getByTestId(`home-progress-${id}`));
    expect(view.onOpen.mock.calls).toEqual([
      [{ kind: 'exercise', period: '30', exerciseId: 'bench-id' }],
      [{ kind: 'body', period: '7' }],
      [{ kind: 'body', period: '7', metric: 'body.waist', from: '2026-09-10', to: '2026-10-10' }],
    ]);
  });

  it('a weight-only user, a stale read and a loading read show no third row and no placeholder', () => {
    expect(show().queryByTestId('home-progress-measure')).toBeNull();
    expect(show({ body: unavailable(bodyWithWaist()) }).queryByTestId('home-progress-measure')).toBeNull();
    expect(show({ body: loading<ProgressBody>() }).queryByTestId('home-progress-measure')).toBeNull();
    expect(show({ body: ready(bodyWithWaist('2026-09-09')) }).queryByTestId('home-progress-measure')).toBeNull();
  });

  it('the order follows the evidence: a newer weight goes above the records, and they swap back with older data', () => {
    const records = homeProgressRecords();
    records.exercises = [{ id: 'bench-id', name: 'Press banca', muscleLabel: 'Pecho', weightMode: 'load_reps', status: 'stable', reason: 'comparable', signal: null,
      isPersonalRecord: true, sessions: 2, sets: 6, lastDate: '2026-10-08' }];
    const newer = show({ records: ready(records) });
    expect(newer.getAllByTestId(/^home-progress-(records|weight)$/).map(row => row.props.testID)).toEqual(['home-progress-weight', 'home-progress-records']);
    records.exercises[0].lastDate = '2026-10-10';
    const tie = show({ records: ready(records) });
    expect(tie.getAllByTestId(/^home-progress-(records|weight)$/).map(row => row.props.testID)).toEqual(['home-progress-records', 'home-progress-weight']);
  });

  it('never states a change for the measure and keeps the same neutral shape', () => {
    const body = bodyWithWaist();
    Object.assign(body.metrics[1], { trend: 'increased', confidence: 'supported', change: 4.1 });
    const view = show({ body: ready(body) });
    expect(view.queryByText(/4,1|subió|aument|mejor|peor/i)).toBeNull();
  });

  it('keeps the spoken label of each row in the same shape and the hint', () => {
    const view = show({ body: ready(bodyWithWaist()) });
    const measure = view.getByTestId('home-progress-measure');
    expect(measure.props.accessibilityLabel).toBe('Cintura. Último registro: 7 oct. 90,5 cm');
    expect(measure.props.accessibilityHint).toBe('Abre el detalle');
    expect(measure.props.accessibilityRole).toBe('button');
    expect(view.getByTestId('home-progress-weight').props.accessibilityLabel).toBe('Peso. Último registro: hoy. 78,4 kg');
    expect(view.getByTestId('home-progress-records').props.accessibilityLabel).toBe('1 récord en 30 días. Press banca');
  });

  it('every row keeps the 44 pt minimum height', () => {
    const view = show({ body: ready(bodyWithWaist()) });
    for (const id of ['records', 'weight', 'measure']) {
      const row = view.getByTestId(`home-progress-${id}`).children[0] as unknown as { props: { style: unknown } };
      expect(StyleSheet.flatten(row.props.style as never)).toMatchObject({ minHeight: 44 });
    }
  });

  it.each(['light', 'dark'] as const)('renders the three rows and the retry affordance in %s', theme => {
    const view = show({ body: ready(bodyWithWaist()) }, theme);
    expect(view.getByTestId('home-progress-measure')).toBeTruthy();
    expect(view.getByText('Ver todo')).toBeTruthy();
    const failed = show({ body: unavailable(homeProgressBody()) }, theme);
    expect(within(failed.getByTestId('home-progress-weight')).getByText('Sin actualizar · Reintentar')).toBeTruthy();
  });

  it('large text keeps every note whole: nothing is truncated and the label and value stay on screen', () => {
    mockFontScale = 2;
    const view = show({ body: ready(bodyWithWaist()) });
    for (const text of ['Cintura', '90,5 cm', 'Último registro: 7 oct', '78,4 kg', 'Press banca']) {
      expect(view.getByText(text).props.numberOfLines).toBeUndefined();
    }
  });

  it('"Ver todo" still goes to Progreso', () => {
    const view = show({ body: ready(bodyWithWaist()) });
    fireEvent.press(view.getByRole('button', { name: 'Ver todo' }));
    expect(view.onAll).toHaveBeenCalledTimes(1);
  });
});
