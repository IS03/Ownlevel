import { act, fireEvent, render } from '@testing-library/react-native';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Alert, RefreshControl } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { MobileTrainingExercisesResponse } from '@/api/exercises';
import { OwnlevelThemeProvider } from '@/design-system';

import { ExerciseLibraryScreen } from './exercise-library-screen';

const mockCreate = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockFetch = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockRefresh = jest.fn<() => Promise<void>>();
const mockSetStatus = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockUpdate = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockUseApiResource = jest.fn();

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
const mockPush = jest.fn();
jest.mock('expo-glass-effect', () => ({ isGlassEffectAPIAvailable: () => false, isLiquidGlassAvailable: () => false }));
jest.mock('./routine-form-sheet', () => ({ RoutineFormSheet: ({ children }: { children: React.ReactNode }) => children }));
jest.mock('./routine-context-menu', () => jest.requireActual('./routine-context-menu.tsx'));
jest.mock('./exercise-choice-menu', () => jest.requireActual('./exercise-choice-menu.tsx'));
jest.mock('react-native-gesture-handler/ReanimatedSwipeable', () => {
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return { __esModule: true, default: ({ children }: { children: React.ReactNode }) => <View>{children}</View> };
});
jest.mock('expo-router', () => {
  const { Pressable, TextInput } = jest.requireActual<typeof import('react-native')>('react-native');
  const Toolbar = Object.assign(({ children }: { children: React.ReactNode }) => children, {
    Badge: () => null,
    Button: ({ accessibilityLabel, onPress, disabled }: { accessibilityLabel: string; onPress: () => void; disabled: boolean }) => <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} onPress={onPress} disabled={disabled} />,
  });
  return { useRouter: () => ({ push: mockPush }), useFocusEffect: () => undefined, Stack: { Toolbar, Screen: ({ options }: { options: { headerSearchBarOptions?: { onChangeText: (event: { nativeEvent: { text: string } }) => void } } }) => options.headerSearchBarOptions ? <TextInput accessibilityLabel="Buscar ejercicio o músculo" onChangeText={text => options.headerSearchBarOptions!.onChangeText({ nativeEvent: { text } })} /> : null } };
});
jest.mock('@/api', () => ({
  createMobileTrainingExercise: (...args: unknown[]) => mockCreate(...args),
  fetchMobileTrainingExercises: (...args: unknown[]) => mockFetch(...args),
  setMobileTrainingExerciseStatus: (...args: unknown[]) => mockSetStatus(...args),
  updateMobileTrainingExerciseIdentity: (...args: unknown[]) => mockUpdate(...args),
  useApiResource: (...args: unknown[]) => mockUseApiResource(...args),
  useMobileApi: () => ({ client: { request: jest.fn() } }),
}));
jest.mock('@/platform/haptics', () => ({ haptics: { selection: jest.fn() } }));

const pushId = '11111111-1111-4111-8111-111111111111';
const pullId = '22222222-2222-4222-8222-222222222222';
const pressId = '33333333-3333-4333-8333-333333333333';
const curlId = '44444444-4444-4444-8444-444444444444';

const press = {
  id: pressId,
  name: 'Press inclinado',
  muscleGroup: 'pecho' as const,
  muscleGroupLabel: 'Pectoral mayor',
  implement: 'Mancuernas',
  weightMode: 'Por mancuerna',
  suggestedSets: 3,
  suggestedReps: 10,
  suggestedWeight: 22.5,
  suggestedRir: 2,
  suggestedRestMinSeconds: 90,
  suggestedRestMaxSeconds: 120,
  notes: 'Controlado',
  isActive: true,
  routineIds: [pushId],
  updatedAt: '2026-09-28T12:00:00.000Z',
};
const curl = {
  ...press,
  id: curlId,
  name: 'Curl bíceps',
  muscleGroup: 'bíceps' as const,
  muscleGroupLabel: null,
  implement: 'Polea',
  weightMode: 'Peso total',
  isActive: false,
  routineIds: [pullId],
};
const routines = [
  { id: pushId, name: 'PUSH', color: 'violet' as const },
  { id: pullId, name: 'PULL', color: 'blue' as const },
];

function fixture(overrides: Partial<MobileTrainingExercisesResponse> = {}): MobileTrainingExercisesResponse {
  return {
    catalog: { status: 'ok', data: { exercises: [press, curl], routines } },
    ...overrides,
  };
}

function readyState(data = fixture()) {
  return {
    status: 'ready' as const,
    current: { confirmedAt: 1, data },
    refreshing: false,
    trigger: 'initial' as const,
    result: {
      status: 'ok' as const,
      data,
      meta: { durationMs: 10, httpStatus: 200, outcome: 'ok' as const },
    },
  };
}

function renderScreen(createIdempotencyKey = jest.fn(() => 'exercise-key')) {
  return render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { height: 844, width: 390, x: 0, y: 0 },
        insets: { bottom: 34, left: 0, right: 0, top: 47 },
      }}
    >
      <OwnlevelThemeProvider initialMode="light">
        <ExerciseLibraryScreen createIdempotencyKey={createIdempotencyKey} />
      </OwnlevelThemeProvider>
    </SafeAreaProvider>,
  );
}

describe('exercise library polish', () => {
  beforeEach(() => {
    jest.restoreAllMocks(); jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    [mockCreate, mockFetch, mockRefresh, mockSetStatus, mockUpdate, mockPush, mockUseApiResource].forEach(fn => fn.mockReset());
    mockRefresh.mockResolvedValue(undefined); mockFetch.mockResolvedValue({ status: 'ok', data: fixture(), meta: { durationMs: 1, httpStatus: 200, outcome: 'ok' } });
    mockUseApiResource.mockReturnValue({ refresh: mockRefresh, state: readyState() });
  });
  it('distinguishes loading, failed catalog and real empty', () => {
    mockUseApiResource.mockReturnValue({ refresh: mockRefresh, state: { status: 'loading' } });
    const loading = renderScreen(); expect(loading.getByTestId('exercise-library-loading')).toBeTruthy(); loading.unmount();
    mockUseApiResource.mockReturnValue({ refresh: mockRefresh, state: readyState(fixture({ catalog: { status: 'unavailable' } })) });
    const failed = renderScreen(); expect(failed.getByText('Biblioteca no disponible')).toBeTruthy(); expect(failed.queryByText('No tenés ejercicios')).toBeNull(); failed.unmount();
    mockUseApiResource.mockReturnValue({ refresh: mockRefresh, state: readyState(fixture({ catalog: { status: 'ok', data: { exercises: [], routines } } })) });
    expect(renderScreen().getByText('No tenés ejercicios')).toBeTruthy();
  });
  it('groups without accordions, searches implements and opens the new detail route', () => {
    const view = renderScreen(); expect(view.getAllByText('Pecho')).toHaveLength(2);
    expect(view.queryByRole('button', { name: /Contraer/ })).toBeNull();
    fireEvent.changeText(view.getByLabelText('Buscar ejercicio o músculo'), 'mancuernas');
    expect(view.getByText('Press inclinado')).toBeTruthy(); expect(mockFetch).not.toHaveBeenCalled();
    fireEvent.press(view.getByRole('button', { name: 'Abrir Press inclinado' }));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/(tabs)/train/exercises/[id]', params: { id: pressId } });
    expect(view.getByLabelText('En PUSH')).toBeTruthy();
  });
  it('selects multiple muscle chips and Todos clears them', () => {
    mockUseApiResource.mockReturnValue({ refresh: mockRefresh, state: readyState(fixture({ catalog: { status: 'ok', data: { exercises: [press, { ...curl, isActive: true }], routines } } })) });
    const view = renderScreen(); fireEvent.press(view.getByRole('checkbox', { name: 'Pecho' }));
    expect(view.queryByText('Curl bíceps')).toBeNull(); fireEvent.press(view.getByRole('checkbox', { name: 'Bíceps' }));
    expect(view.getByText('Curl bíceps')).toBeTruthy(); expect(view.getByRole('checkbox', { name: 'Pecho' }).props.accessibilityState.checked).toBe(true);
    fireEvent.press(view.getByRole('checkbox', { name: 'Todos' })); expect(view.getByRole('checkbox', { name: 'Bíceps' }).props.accessibilityState.checked).toBe(false);
  });
  it('keeps filters isolated until applying their real count and includes all implement choices', () => {
    const view = renderScreen(); fireEvent.press(view.getByRole('button', { name: 'Filtros, 0 activos' }));
    fireEvent.press(view.getByRole('radio', { name: 'Archivados' })); expect(view.getByRole('button', { name: 'Ver 1 ejercicio' })).toBeTruthy();
    expect(view.getByText('Press inclinado')).toBeTruthy(); expect(view.getByRole('button', { name: 'Polea con barra' })).toBeTruthy();
    fireEvent.press(view.getByRole('button', { name: 'Ver 1 ejercicio' })); expect(view.queryByText('Press inclinado')).toBeNull(); expect(view.getByText('Curl bíceps')).toBeTruthy();
  });
  it('creates with null defaults, no assignments, warning and an idempotent retry', async () => {
    const key = jest.fn(() => 'one-intent'); mockCreate.mockResolvedValueOnce({ status: 'unavailable', reason: 'network' }).mockResolvedValueOnce({ status: 'ok', data: { exercise: { ...press, id: 'new', name: 'Nuevo', routineIds: [] }, warning: 'Hay un nombre parecido.' } });
    const view = renderScreen(key); fireEvent.press(view.getByRole('button', { name: 'Nuevo ejercicio' }));
    expect(view.queryByText('Valores por defecto')).toBeNull(); expect(view.getByRole('button', { name: 'Crear ejercicio' })).toBeDisabled();
    fireEvent.changeText(view.getByLabelText('Nombre del ejercicio'), 'Nuevo'); await act(async () => fireEvent.press(view.getByRole('button', { name: 'Crear ejercicio' })));
    await act(async () => fireEvent.press(view.getByRole('button', { name: 'Crear ejercicio' })));
    expect(mockCreate.mock.calls[0]?.[1]).toEqual(mockCreate.mock.calls[1]?.[1]); expect(key).toHaveBeenCalledTimes(1);
    expect(mockCreate.mock.calls[0]?.[1]).toMatchObject({ routineIds: [], idempotencyKey: 'one-intent', exercise: { suggestedSets: null, suggestedReps: null, suggestedWeight: null, suggestedRir: null, suggestedRestMinSeconds: null, suggestedRestMaxSeconds: null } });
    expect(view.getByText('Hay un nombre parecido.')).toBeTruthy(); expect(view.getByText('Nuevo')).toBeTruthy();
  });
  it('edits identity without erasing saved defaults or memberships', async () => {
    mockUpdate.mockResolvedValue({ status: 'ok', data: { exercise: { ...press, name: 'Nuevo nombre' } } });
    const view = renderScreen(); fireEvent(view.getByRole('button', { name: 'Abrir Press inclinado' }), 'accessibilityAction', { nativeEvent: { actionName: 'edit' } });
    fireEvent.changeText(view.getByLabelText('Nombre del ejercicio'), 'Nuevo nombre'); await act(async () => fireEvent.press(view.getByRole('button', { name: 'Guardar ejercicio' })));
    expect(mockUpdate).toHaveBeenCalledWith(expect.anything(), pressId, expect.objectContaining({ name: 'Nuevo nombre', suggestedSets: 3, suggestedWeight: 22.5, suggestedReps: 10, suggestedRir: 2, suggestedRestMinSeconds: 90, suggestedRestMaxSeconds: 120 }), press.updatedAt);
  });
  it('reloads after an atomic identity conflict without retrying the write', async () => {
    mockUpdate.mockResolvedValue({ status: 'conflict', code: 'EXERCISE_CHANGED', message: 'El ejercicio cambió en otro lugar.' });
    mockFetch.mockResolvedValue({ status: 'ok', data: fixture({ catalog: { status: 'ok', data: { exercises: [{ ...press, updatedAt: '2026-10-13T12:00:00Z', suggestedSets: 7 }], routines } } }) });
    const view = renderScreen(); fireEvent(view.getByRole('button', { name: 'Abrir Press inclinado' }), 'accessibilityAction', { nativeEvent: { actionName: 'edit' } });
    fireEvent.changeText(view.getByLabelText('Nombre del ejercicio'), 'Local'); await act(async () => fireEvent.press(view.getByRole('button', { name: 'Guardar ejercicio' })));
    expect(mockUpdate).toHaveBeenCalledTimes(1); expect(mockRefresh).toHaveBeenCalled(); expect(view.getByText(/El ejercicio cambió en otro lugar/)).toBeTruthy();
  });
  it('archives immediately with an undo and survives a failed refresh without losing confirmed truth', async () => {
    mockSetStatus.mockResolvedValueOnce({ status: 'ok', data: { exercise: { id: pressId, isActive: false, updatedAt: press.updatedAt } } }).mockResolvedValueOnce({ status: 'ok', data: { exercise: { id: pressId, isActive: true, updatedAt: press.updatedAt } } });
    const view = renderScreen(); await act(async () => fireEvent(view.getByRole('button', { name: 'Abrir Press inclinado' }), 'accessibilityAction', { nativeEvent: { actionName: 'status' } }));
    expect(Alert.alert).not.toHaveBeenCalled(); expect(view.queryByText('Press inclinado')).toBeNull();
    await act(async () => fireEvent.press(view.getByRole('button', { name: 'Deshacer' })));
    expect(mockSetStatus).toHaveBeenLastCalledWith(expect.anything(), pressId, true); expect(view.getByText('Press inclinado')).toBeTruthy();
  });
  it('keeps stale rows and pull to refresh', () => {
    mockUseApiResource.mockReturnValue({ refresh: mockRefresh, state: { status: 'unavailable', previous: { data: fixture() } } });
    const view = renderScreen(); expect(view.getByText('Press inclinado')).toBeTruthy(); expect(view.getByText('Mostramos la última lectura confirmada.')).toBeTruthy();
    fireEvent(view.UNSAFE_getByType(RefreshControl), 'refresh'); expect(mockRefresh).toHaveBeenCalled();
  });
});
