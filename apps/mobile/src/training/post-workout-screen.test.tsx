import { expect, it, jest } from '@jest/globals';
import { act, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { OwnlevelThemeProvider } from '@/design-system';
import type { SessionHighlightsDto } from '@/api/session-highlights';
import { PostWorkoutScreen, postWorkoutRows, type SessionHighlightsLoader } from './post-workout-screen';
import { testFinished, SESSION_ID, EXERCISE_ID } from './active-session-test-fixtures';
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
const result: SessionHighlightsDto = { sessionId: SESSION_ID, volumeKg: 600, highlights: [{ kind: 'record', exerciseId: EXERCISE_ID,
  name: 'Remo', weightMode: 'Peso total', mark: { weightKg: 60, reps: 10 }, previous: { weightKg: 55, reps: 8 } }] };
function screen(readHighlights?: SessionHighlightsLoader) {
  return render(<SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }}>
    <OwnlevelThemeProvider initialMode="dark"><PostWorkoutScreen finished={testFinished({ energyLevel: null, performanceLevel: 4, painLevel: 0, notes: 'Bien' })}
      readHighlights={readHighlights} onHome={() => undefined} onViewSession={() => undefined} /></OwnlevelThemeProvider></SafeAreaProvider>);
}
it('shows confirmed success immediately, then adds only server-confirmed highlights and volume', async () => {
  let resolve!: (value: Awaited<ReturnType<SessionHighlightsLoader>>) => void;
  const read = jest.fn<SessionHighlightsLoader>(() => new Promise(done => { resolve = done; }));
  const view = screen(read);
  expect(view.getByText('Entrenamiento guardado')).toBeTruthy(); expect(view.queryByText('Lo destacado')).toBeNull();
  expect(view.queryByText('kg de volumen')).toBeNull(); expect(view.queryByText('Energía')).toBeNull(); expect(view.getByText('0/10')).toBeTruthy();
  await act(async () => {});
  await act(async () => { resolve({ status: 'ok', data: result, meta: { durationMs: 1, httpStatus: 200, outcome: 'ok' } }); });
  expect(view.getByText('Récord')).toBeTruthy(); expect(view.getByLabelText('600 kg de volumen')).toBeTruthy(); expect(view.getByText('Remo')).toBeTruthy();
});
it.each(['empty', 'unavailable', 'throw'] as const)('keeps F4 useful with %s auxiliary history, without a false empty message or zero volume', async state => {
  const read = jest.fn<SessionHighlightsLoader>(async () => {
    if (state === 'throw') throw new Error('offline');
    return state === 'empty' ? { status: 'ok', data: { ...result, highlights: [], volumeKg: null }, meta: { durationMs: 1, httpStatus: 200, outcome: 'ok' } }
      : { status: 'unavailable', reason: 'network', meta: { durationMs: 1, httpStatus: null, outcome: 'unavailable' } };
  });
  const view = screen(read); await waitFor(() => expect(read).toHaveBeenCalled()); await act(async () => {});
  expect(view.getByText('Entrenamiento guardado')).toBeTruthy(); expect(view.queryByText('Lo destacado')).toBeNull(); expect(view.queryByText('kg de volumen')).toBeNull();
  expect(view.queryByText(/sin destacados/i)).toBeNull();
});
it('orders records, improvements and additions, with four rows maximum', () => {
  const receipt = testFinished(); receipt.routineAdditions = Array.from({ length: 4 }, (_, index) => ({ sessionExerciseId: `added-${index}`, exerciseId: EXERCISE_ID, name: `Added ${index}`, outcome: 'added' as const }));
  const rows = postWorkoutRows(receipt, { ...result, highlights: [{ ...result.highlights[0], kind: 'improvement', exerciseId: SESSION_ID }, result.highlights[0]] });
  expect(rows).toHaveLength(4); expect(rows.map(row => row.kind)).toEqual(['record', 'improvement', 'added', 'added']);
});
