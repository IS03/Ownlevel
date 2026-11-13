import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Alert, RefreshControl } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { MobileTrainingExercisesResponse } from '@/api/exercises';
import { clearConfirmedReads, invalidateConfirmedReads } from '@/api/confirmed-read-cache';
import { OwnlevelThemeProvider } from '@/design-system';

import { ExerciseLibraryScreen } from './exercise-library-screen';

const mockCreate = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockFetch = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockRefresh = jest.fn<() => Promise<void>>();
const mockSetStatus = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockUpdate = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockUseApiResource = jest.fn();
/** One account's client, stable across renders (the retained reading is scoped by client). */
const mockClient = { request: jest.fn() };
let mockRealCachedRead = false;
/** Off by default (these screen tests do not model focus); the denial tests treat the mounted screen as on screen. */
const mockUseFocusEffect = jest.fn<(effect: () => (() => void) | void) => void>();
// The «Agregar a una rutina» sheet stands in for the real one (a native editor sheet): it shows the exercise it was given
// and an action on it, which is exactly what must not survive a denial.
jest.mock('./exercise-add-routine-sheet', () => {
  const { Pressable, Text, View } = jest.requireActual<typeof import('react-native')>('react-native');
  return { ExerciseAddRoutineSheet: ({ exercise }: { exercise: { name: string } }) => <View testID="add-routine-sheet">
    <Text>{`Agregar ${exercise.name}`}</Text><Pressable accessibilityRole="button" accessibilityLabel={`Agregar ${exercise.name} a PUSH`} />
  </View> };
});
/** Mocked readings a reload has confirmed again (the harness's stand-in for a new confirmed reading). */
const mockReconfirmed = new WeakSet<object>();

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
const mockPush = jest.fn();
jest.mock('expo-glass-effect', () => ({ isGlassEffectAPIAvailable: () => false, isLiquidGlassAvailable: () => false }));
jest.mock('./routine-form-sheet', () => ({ RoutineFormSheet: ({ children, open }: { children: React.ReactNode; open: boolean }) => (open ? children : null) }));
jest.mock('./routine-context-menu', () => jest.requireActual('./routine-context-menu.tsx'));
jest.mock('./exercise-choice-menu', () => jest.requireActual('./exercise-choice-menu.tsx'));
jest.mock('./exercise-segmented', () => jest.requireActual('./exercise-segmented.tsx'));
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
  return { useRouter: () => ({ push: mockPush }), useFocusEffect: (effect: () => (() => void) | void) => mockUseFocusEffect(effect), Stack: { Toolbar, Screen: ({ options }: { options: { headerSearchBarOptions?: { onChangeText: (event: { nativeEvent: { text: string } }) => void } } }) => options.headerSearchBarOptions ? <TextInput accessibilityLabel="Buscar ejercicio o músculo" onChangeText={text => options.headerSearchBarOptions!.onChangeText({ nativeEvent: { text } })} /> : null } };
});
// These screen tests drive the reading's state directly; the retained reading itself (ConfirmedReadCache, #303 C3a)
// is exercised with the real cache in exercise-library-retention.test.tsx.
jest.mock('@/api/use-cached-read', () => ({
  useCachedRead: (...args: unknown[]) => {
    if (mockRealCachedRead) return (jest.requireActual('@/api/use-cached-read') as typeof import('@/api/use-cached-read')).useCachedRead(...(args as Parameters<typeof import('@/api/use-cached-read').useCachedRead>));
    const resource = mockUseApiResource(...args) as { refresh: () => Promise<void>; state: { status: string; current?: object } };
    // A reload that resolves confirms a NEW reading (same data, new identity), as the cache does after a read.
    return { ...resource,
      reload: async () => { await resource.refresh(); mockReconfirmed.add(resource.state); },
      snapshot: () => mockReconfirmed.has(resource.state) && resource.state.status === 'ready' ? { ...resource.state, current: { ...resource.state.current } } : resource.state };
  },
}));
jest.mock('@/api', () => ({
  createMobileTrainingExercise: (...args: unknown[]) => mockCreate(...args),
  fetchMobileTrainingExercises: (...args: unknown[]) => mockFetch(...args),
  setMobileTrainingExerciseStatus: (...args: unknown[]) => mockSetStatus(...args),
  updateMobileTrainingExerciseIdentity: (...args: unknown[]) => mockUpdate(...args),
  useApiResource: (...args: unknown[]) => mockUseApiResource(...args),
  useMobileApi: () => ({ client: mockClient }),
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
    // Confirmed during this visit (an identity version this visit may write with).
    current: { confirmedAt: Number.MAX_SAFE_INTEGER, data },
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
    mockUseApiResource.mockReturnValue({ refresh: mockRefresh, state: { status: 'unavailable', previous: { data: fixture() },
      result: { status: 'unavailable', reason: 'network', meta: { durationMs: 1, httpStatus: null, outcome: 'unavailable' } } } });
    const view = renderScreen(); expect(view.getByText('Press inclinado')).toBeTruthy(); expect(view.getByText('Mostramos la última lectura confirmada.')).toBeTruthy();
    fireEvent(view.UNSAFE_getByType(RefreshControl), 'refresh'); expect(mockRefresh).toHaveBeenCalled();
  });
});

describe('authorization denial on a mounted library (#303 C3a review; real retained reading)', () => {
  const okRead = (data = fixture()) => ({ status: 'ok', data, meta: { durationMs: 1, httpStatus: 200, outcome: 'ok' } });
  beforeEach(() => {
    jest.restoreAllMocks(); jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    [mockFetch, mockSetStatus, mockUpdate, mockCreate].forEach(fn => fn.mockReset());
    clearConfirmedReads(mockClient as never); mockRealCachedRead = true;
    mockUseFocusEffect.mockImplementation(effect => {
      (jest.requireActual('react') as typeof import('react')).useEffect(() => effect(), [effect]);
    });
  });
  afterEach(() => { mockRealCachedRead = false; mockUseFocusEffect.mockReset(); clearConfirmedReads(mockClient as never); });
  /** With the library on screen, a settled training write revalidates it at once: that read is answered with `answer`. */
  const revalidateWith = async (answer: unknown) => {
    mockFetch.mockResolvedValueOnce(answer);
    await act(async () => { invalidateConfirmedReads(mockClient as never, '/api/mobile/v1/training/routines/order'); });
  };
  const DENIALS: [string, unknown][] = [
    ['401', { status: 'unauthorized', meta: { durationMs: 1, httpStatus: 401, outcome: 'unauthorized' } }],
    ['403', { status: 'unavailable', reason: 'server', meta: { durationMs: 1, httpStatus: 403, outcome: 'unavailable' } }],
  ];
  it.each(DENIALS)('editor open with a protected exercise → %s: it closes and is discarded in that render, and does not come back after recovery', async (_code, denied) => {
    mockFetch.mockResolvedValueOnce(okRead());
    const view = renderScreen();
    await waitFor(() => expect(view.getByText('Press inclinado')).toBeTruthy());
    fireEvent(view.getByRole('button', { name: 'Abrir Press inclinado' }), 'accessibilityAction', { nativeEvent: { actionName: 'edit' } });
    expect(view.getByLabelText('Nombre del ejercicio').props.value).toBe('Press inclinado');
    fireEvent.changeText(view.getByLabelText('Nombre del ejercicio'), 'Press borrador');
    await revalidateWith(denied);
    await waitFor(() => expect(view.getByText('Biblioteca no disponible')).toBeTruthy());
    expect(view.queryByLabelText('Nombre del ejercicio')).toBeNull();
    expect(view.queryByRole('button', { name: 'Guardar ejercicio' })).toBeNull();
    expect(view.queryByDisplayValue('Press inclinado')).toBeNull();
    expect(view.queryByDisplayValue('Press borrador')).toBeNull();
    expect(view.queryByText('Press inclinado')).toBeNull();
    mockFetch.mockResolvedValueOnce(okRead());
    await act(async () => { fireEvent.press(view.getByRole('button', { name: 'Reintentar' })); });
    await waitFor(() => expect(view.getByText('Press inclinado')).toBeTruthy()); // the list is back…
    expect(view.queryByLabelText('Nombre del ejercicio')).toBeNull(); // …the editor is not
    expect(view.queryByDisplayValue('Press borrador')).toBeNull();
    expect(mockUpdate).not.toHaveBeenCalled();
    // Opening it again starts from the authorized reading, not from the discarded draft.
    fireEvent(view.getByRole('button', { name: 'Abrir Press inclinado' }), 'accessibilityAction', { nativeEvent: { actionName: 'edit' } });
    expect(view.getByLabelText('Nombre del ejercicio').props.value).toBe('Press inclinado');
    view.unmount();
  });
  it.each(DENIALS)('«Agregar a una rutina» open → %s: the sheet and its actions disappear and do not come back after recovery', async (_code, denied) => {
    mockFetch.mockResolvedValueOnce(okRead());
    const view = renderScreen();
    await waitFor(() => expect(view.getByText('Press inclinado')).toBeTruthy());
    fireEvent(view.getByRole('button', { name: 'Abrir Press inclinado' }), 'accessibilityAction', { nativeEvent: { actionName: 'add' } });
    expect(view.getByTestId('add-routine-sheet')).toBeTruthy();
    await revalidateWith(denied);
    await waitFor(() => expect(view.getByText('Biblioteca no disponible')).toBeTruthy());
    expect(view.queryByTestId('add-routine-sheet')).toBeNull();
    expect(view.queryByText('Agregar Press inclinado')).toBeNull();
    expect(view.queryByRole('button', { name: 'Agregar Press inclinado a PUSH' })).toBeNull();
    mockFetch.mockResolvedValueOnce(okRead());
    await act(async () => { fireEvent.press(view.getByRole('button', { name: 'Reintentar' })); });
    await waitFor(() => expect(view.getByText('Press inclinado')).toBeTruthy());
    expect(view.queryByTestId('add-routine-sheet')).toBeNull();
    view.unmount();
  });
  it('a network failure with the editor and its draft open keeps them (not a denial)', async () => {
    mockFetch.mockResolvedValueOnce(okRead());
    const view = renderScreen();
    await waitFor(() => expect(view.getByText('Press inclinado')).toBeTruthy());
    fireEvent(view.getByRole('button', { name: 'Abrir Press inclinado' }), 'accessibilityAction', { nativeEvent: { actionName: 'edit' } });
    fireEvent.changeText(view.getByLabelText('Nombre del ejercicio'), 'Press borrador');
    await revalidateWith({ status: 'unavailable', reason: 'network', meta: { durationMs: 1, httpStatus: null, outcome: 'unavailable' } });
    await waitFor(() => expect(view.getByText('Mostramos la última lectura confirmada.')).toBeTruthy());
    expect(view.getByLabelText('Nombre del ejercicio').props.value).toBe('Press borrador');
    view.unmount();
  });
  it.each([
    ['401', { status: 'unauthorized', meta: { durationMs: 1, httpStatus: 401, outcome: 'unauthorized' } }],
    ['403', { status: 'unavailable', reason: 'server', meta: { durationMs: 1, httpStatus: 403, outcome: 'unavailable' } }],
  ])('catalog OK → %s: no name, routine or action of the protected catalog; an authorized read recovers it', async (_code, denied) => {
    mockFetch.mockResolvedValueOnce(okRead());
    const view = renderScreen();
    await waitFor(() => expect(view.getByText('Press inclinado')).toBeTruthy());
    mockFetch.mockResolvedValueOnce(denied);
    await act(async () => { fireEvent(view.UNSAFE_getByType(RefreshControl), 'refresh'); });
    await waitFor(() => expect(view.getByText('Biblioteca no disponible')).toBeTruthy());
    for (const name of ['Press inclinado', 'Curl']) expect(view.queryByText(name)).toBeNull();
    expect(view.queryByRole('button', { name: /Abrir / })).toBeNull(); // no row, so no action on protected data
    expect(view.queryByText('Mostramos la última lectura confirmada.')).toBeNull(); // not offered as stale data either
    mockFetch.mockResolvedValueOnce(okRead());
    await act(async () => { fireEvent.press(view.getByRole('button', { name: 'Reintentar' })); });
    await waitFor(() => expect(view.getByText('Press inclinado')).toBeTruthy());
    view.unmount();
  });
  it('a network failure keeps the last catalog, clearly marked as not updated', async () => {
    mockFetch.mockResolvedValueOnce(okRead());
    const view = renderScreen();
    await waitFor(() => expect(view.getByText('Press inclinado')).toBeTruthy());
    mockFetch.mockResolvedValueOnce({ status: 'unavailable', reason: 'network', meta: { durationMs: 1, httpStatus: null, outcome: 'unavailable' } });
    await act(async () => { fireEvent(view.UNSAFE_getByType(RefreshControl), 'refresh'); });
    await waitFor(() => expect(view.getByText('Mostramos la última lectura confirmada.')).toBeTruthy());
    expect(view.getByText('Press inclinado')).toBeTruthy();
    view.unmount();
  });
});
