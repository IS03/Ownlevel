import { fireEvent, render } from '@testing-library/react-native';
import { beforeEach, expect, it, jest } from '@jest/globals';
import { OwnlevelThemeProvider } from '@/design-system';
import { ExerciseDetailScreen } from './exercise-detail-screen';
const mockLibrary = jest.fn(), mockLast = jest.fn(), mockPush = jest.fn(), mockRefresh = jest.fn();
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('expo-glass-effect', () => ({ isGlassEffectAPIAvailable: () => false, isLiquidGlassAvailable: () => false }));
jest.mock('./use-exercise-library', () => ({ useExerciseLibrary: () => mockLibrary(), exerciseUnavailable: { status: 'unavailable' } }));
jest.mock('@/api', () => ({ useApiResource: () => ({ state: mockLast(), refresh: mockRefresh }) }));
jest.mock('expo-router', () => {
  const Container = ({ children }: { children: React.ReactNode }) => children;
  return { useRouter: () => ({ push: mockPush }), useLocalSearchParams: () => ({ id: 'exercise' }), useFocusEffect: () => undefined,
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
