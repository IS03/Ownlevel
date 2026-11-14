import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { clearConfirmedReads, invalidateConfirmedReads } from '@/api/confirmed-read-cache';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { OwnlevelThemeProvider } from '@/design-system';
import { ExerciseDetailScreen } from './exercise-detail-screen';
const mockLibrary = jest.fn(), mockLast = jest.fn(), mockPush = jest.fn(), mockRefresh = jest.fn();
const mockFetchExercises = jest.fn<(...args: unknown[]) => Promise<unknown>>();
/** One account's client, stable across renders (the retained reading is scoped by client). */
const mockClient = { request: jest.fn() };
let mockRealLibrary = false;
/** Off by default; the denial tests treat the mounted detail as on screen. */
const mockUseFocusEffect = jest.fn<(effect: () => (() => void) | void) => void>();
// Stands in for the real sheet (a native editor sheet): it shows the exercise it was given and an action on it.
jest.mock('./exercise-add-routine-sheet', () => {
  const { Pressable, Text, View } = jest.requireActual<typeof import('react-native')>('react-native');
  return { ExerciseAddRoutineSheet: ({ exercise }: { exercise: { name: string } }) => <View testID="add-routine-sheet">
    <Text>{`Agregar ${exercise.name}`}</Text><Pressable accessibilityRole="button" accessibilityLabel={`Agregar ${exercise.name} a PUSH`} />
  </View> };
});
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('expo-glass-effect', () => ({ isGlassEffectAPIAvailable: () => false, isLiquidGlassAvailable: () => false }));
jest.mock('./use-exercise-library', () => {
  const actual = jest.requireActual<typeof import('./use-exercise-library')>('./use-exercise-library');
  return { useExerciseLibrary: () => mockRealLibrary ? actual.useExerciseLibrary() : mockLibrary(), exerciseUnavailable: actual.exerciseUnavailable };
});
jest.mock('@/api', () => ({ useApiResource: () => ({ state: mockLast(), refresh: mockRefresh }), useMobileApi: () => ({ client: mockClient }),
  fetchMobileTrainingExercises: (...args: unknown[]) => mockFetchExercises(...args), createMobileTrainingExercise: jest.fn(),
  setMobileTrainingExerciseStatus: jest.fn(), updateMobileTrainingExerciseIdentity: jest.fn() }));
jest.mock('expo-router', () => {
  const Container = ({ children }: { children: React.ReactNode }) => children;
  return { useRouter: () => ({ push: mockPush }), useLocalSearchParams: () => ({ id: 'exercise' }), useFocusEffect: (effect: () => (() => void) | void) => mockUseFocusEffect(effect),
    Stack: { Screen: () => null, Toolbar: Object.assign(Container, { Menu: Container, MenuAction: () => null }) } };
});
const exercise = { id: 'exercise', name: 'Press', muscleGroup: 'pecho', implement: 'Máquina', weightMode: 'Peso total', routineIds: ['routine'], isActive: true, notes: 'Agarre cómodo' };
beforeEach(() => {
  mockLibrary.mockReturnValue({ exercises: [exercise], catalog: {}, routines: [{ id: 'routine', name: 'PUSH', color: 'blue' }], state: { status: 'ready' }, client: {}, refresh: mockRefresh, busy: { current: false }, pending: false, notice: null });
  mockLast.mockReturnValue({ status: 'ready', current: { data: { latest: null, sets: [] } } }); mockPush.mockReset();
});
function setup() { return render(<OwnlevelThemeProvider initialMode="light"><ExerciseDetailScreen /></OwnlevelThemeProvider>); }
it('shows true history empty and routes to routine/history without inventing position or set counts', () => {
  const view = setup(); expect(view.getByText('Todavía no lo hiciste.')).toBeTruthy(); expect(view.queryByText(/Ejercicio 4/)).toBeNull(); expect(view.getByText('Agarre cómodo')).toBeTruthy();
  fireEvent.press(view.getByRole('button', { name: 'PUSH' })); expect(mockPush).toHaveBeenCalledWith({ pathname: '/(tabs)/train/routines/[id]', params: { id: 'routine' } });
  fireEvent.press(view.getByRole('button', { name: 'Ver historial completo' })); expect(mockPush).toHaveBeenLastCalledWith('/(tabs)/train/history/exercise/exercise');
});
it('never renders history empty on an unavailable read', () => {
  mockLast.mockReturnValue({ status: 'unavailable' }); const view = setup(); expect(view.getByText('No pudimos cargar la última vez.')).toBeTruthy(); expect(view.queryByText('Todavía no lo hiciste.')).toBeNull();
});
it('keeps confirmed history visible with a stale notice on failed refresh', () => {
  mockLast.mockReturnValue({ status: 'unavailable', previous: { data: { latest: { logDate: '2026-10-13', routineName: 'PULL' }, sets: [{ setNumber: 1, actualWeightKg: 55, actualReps: 12 }], weightMode: 'Peso total' } } });
  const view = setup(); expect(view.getByText('55 kg × 12')).toBeTruthy(); expect(view.getByText('Mostramos la última lectura confirmada del historial.')).toBeTruthy();
});

describe('authorization denial on a mounted exercise detail (#303 C3a review; real retained reading)', () => {
  const okRead = { status: 'ok', data: { catalog: { status: 'ok', data: { exercises: [{ ...exercise, updatedAt: 'v1' }], routines: [{ id: 'routine', name: 'PUSH', color: 'blue' }] } } }, meta: { durationMs: 1, httpStatus: 200, outcome: 'ok' } };
  beforeEach(() => { mockFetchExercises.mockReset(); clearConfirmedReads(mockClient as never); mockRealLibrary = true; });
  afterEach(() => { mockRealLibrary = false; mockUseFocusEffect.mockReset(); clearConfirmedReads(mockClient as never); });
  it.each([
    ['401', { status: 'unauthorized', meta: { durationMs: 1, httpStatus: 401, outcome: 'unauthorized' } }],
    ['403', { status: 'unavailable', reason: 'server', meta: { durationMs: 1, httpStatus: 403, outcome: 'unavailable' } }],
  ])('«Agregar a una rutina» open → %s: the sheet and its actions disappear and do not come back after recovery', async (_code, denied) => {
    mockUseFocusEffect.mockImplementation(effect => {
      (jest.requireActual('react') as typeof import('react')).useEffect(() => effect(), [effect]);
    });
    mockFetchExercises.mockResolvedValueOnce(okRead);
    const view = setup();
    await waitFor(() => expect(view.getByText('Agarre cómodo')).toBeTruthy());
    fireEvent.press(view.getByRole('button', { name: 'Agregar a una rutina' }));
    expect(view.getByTestId('add-routine-sheet')).toBeTruthy();
    // On screen, a settled training write revalidates the library at once: that read is denied.
    mockFetchExercises.mockResolvedValueOnce(denied);
    await act(async () => { invalidateConfirmedReads(mockClient as never, '/api/mobile/v1/training/routines/order'); });
    await waitFor(() => expect(view.getByText('No pudimos cargar el ejercicio.')).toBeTruthy());
    expect(view.queryByTestId('add-routine-sheet')).toBeNull();
    expect(view.queryByRole('button', { name: 'Agregar Press a PUSH' })).toBeNull();
    mockFetchExercises.mockResolvedValueOnce(okRead);
    await act(async () => { fireEvent.press(view.getByRole('button', { name: 'Reintentar' })); });
    await waitFor(() => expect(view.getByText('Agarre cómodo')).toBeTruthy());
    expect(view.queryByTestId('add-routine-sheet')).toBeNull();
    view.unmount();
  });
  it.each([
    ['401', { status: 'unauthorized', meta: { durationMs: 1, httpStatus: 401, outcome: 'unauthorized' } }],
    ['403', { status: 'unavailable', reason: 'server', meta: { durationMs: 1, httpStatus: 403, outcome: 'unavailable' } }],
  ])('exercise shown → %s: no name, routine, notes or actions remain; an authorized read recovers it', async (_code, denied) => {
    mockFetchExercises.mockResolvedValueOnce(okRead);
    const view = setup();
    await waitFor(() => expect(view.getByText('Agarre cómodo')).toBeTruthy());
    expect(view.getByRole('button', { name: 'PUSH' })).toBeTruthy();
    mockFetchExercises.mockResolvedValueOnce(denied);
    await act(async () => { fireEvent(view.UNSAFE_getByProps({ refreshing: false }), 'refresh'); });
    await waitFor(() => expect(view.getByText('No pudimos cargar el ejercicio.')).toBeTruthy());
    expect(view.queryByText('Agarre cómodo')).toBeNull();
    expect(view.queryByRole('button', { name: 'PUSH' })).toBeNull();
    mockFetchExercises.mockResolvedValueOnce(okRead);
    await act(async () => { fireEvent.press(view.getByRole('button', { name: 'Reintentar' })); });
    await waitFor(() => expect(view.getByText('Agarre cómodo')).toBeTruthy());
    view.unmount();
  });
});
