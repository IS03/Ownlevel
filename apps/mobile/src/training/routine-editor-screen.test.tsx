import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Alert, RefreshControl } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { RoutineDetail } from '@/api/routine-editor';
import { detailFixture } from '@/api/routine-editor.fixture';
import { OwnlevelThemeProvider } from '@/design-system';

import { RoutineEditorScreen } from './routine-editor-screen';

const mockFetch = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockCatalog = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockTemplate = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockIdentity = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockStatus = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockRequest = jest.fn();
const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockDispatch = jest.fn();
const mockStackOptions = jest.fn();
const mockUsePreventRemove = jest.fn();
let mockEditIdentity: string | undefined;
let mockPreventRemoveCallback: ((options: { data: { action: object } }) => void) | undefined;

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('expo-router', () => ({
  Stack: { Screen: ({ options }: { options: object }) => {
    mockStackOptions(options);
    return null;
  } },
  useLocalSearchParams: () => ({ id: '11111111-1111-4111-8111-111111111111', editIdentity: mockEditIdentity }),
  useNavigation: () => ({
    dispatch: mockDispatch,
  }),
  useRouter: () => ({ back: mockBack, replace: mockReplace }),
}));
const mockStartSession = jest.fn();
// The native confirmation and the starter have their own tests; here they record what was asked.
jest.mock('./start-confirm', () => ({
  StartConfirm: ({ onConfirm, open, routineName }: { onConfirm: () => void; open: boolean; routineName: string }) => {
    const { Pressable, Text } = jest.requireActual('react-native') as typeof import('react-native');
    return open ? <Pressable accessibilityRole="button" onPress={onConfirm}><Text>Empezar {routineName}</Text></Pressable> : null;
  },
}));
jest.mock('./use-session-starter', () => ({ useSessionStarter: () => ({ element: null, start: (request: unknown) => mockStartSession(request) }) }));
jest.mock('expo-router/build/react-navigation/core/usePreventRemove', () => ({
  usePreventRemove: (preventRemove: boolean, callback: typeof mockPreventRemoveCallback) => {
    mockUsePreventRemove(preventRemove);
    mockPreventRemoveCallback = callback;
  },
}));
jest.mock('@/api', () => ({
  useApiResource: (jest.requireActual('@/api/resource') as typeof import('@/api/resource')).useApiResource,
  useMobileApi: () => ({ client: { request: mockRequest } }),
  fetchRoutineDetail: (...args: unknown[]) => mockFetch(...args),
  fetchMobileTrainingExercises: (...args: unknown[]) => mockCatalog(...args),
  replaceRoutineTemplate: (...args: unknown[]) => mockTemplate(...args),
  updateRoutineIdentity: (...args: unknown[]) => mockIdentity(...args),
  setMobileTrainingRoutineStatus: (...args: unknown[]) => mockStatus(...args),
}));
jest.mock('@/platform/haptics', () => ({ haptics: { selection: jest.fn() } }));

const meta = { durationMs: 1, httpStatus: 200, outcome: 'ok' as const };
const loaded = (detail: RoutineDetail = detailFixture) => ({
  status: 'ok' as const, data: { kind: 'detail' as const, detail }, meta,
});

function renderScreen() {
  return render(
    <SafeAreaProvider initialMetrics={{
      frame: { height: 844, width: 390, x: 0, y: 0 },
      insets: { bottom: 34, left: 0, right: 0, top: 47 },
    }}>
      <OwnlevelThemeProvider initialMode="light"><RoutineEditorScreen /></OwnlevelThemeProvider>
    </SafeAreaProvider>,
  );
}

function confirmAlert(label: string) {
  const call = jest.mocked(Alert.alert).mock.calls.at(-1);
  const button = Array.isArray(call?.[2]) ? call?.[2].find((item) => item.text === label) : undefined;
  act(() => button?.onPress?.());
}

describe('native routine editor', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    mockFetch.mockReset();
    mockCatalog.mockReset();
    mockTemplate.mockReset();
    mockIdentity.mockReset();
    mockStatus.mockReset();
    mockRequest.mockReset();
    mockBack.mockReset();
    mockReplace.mockReset();
    mockDispatch.mockReset();
    mockStackOptions.mockReset();
    mockUsePreventRemove.mockReset();
    mockPreventRemoveCallback = undefined;
    mockEditIdentity = undefined;
    mockFetch.mockResolvedValue(loaded());
  });

  it('shows real detail and starts this routine only after confirming, without starting on entry', async () => {
    const view = renderScreen();
    await waitFor(() => expect(view.getByText('PUSH')).toBeTruthy());
    expect(view.getByText('1 ejercicio · 1 serie')).toBeTruthy();
    expect(view.getByText('Ejercicio archivado')).toBeTruthy();
    mockStartSession.mockReset();
    fireEvent.press(view.getByRole('button', { name: 'Iniciar entrenamiento' }));
    expect(mockStartSession).not.toHaveBeenCalled(); // it asks first
    fireEvent.press(view.getByRole('button', { name: 'Empezar PUSH' }));
    expect(mockStartSession).toHaveBeenCalledWith({ routineId: '11111111-1111-4111-8111-111111111111' });
    expect(mockTemplate).not.toHaveBeenCalled();
    expect(mockRequest).not.toHaveBeenCalled();
  });

  it('sends complete desired state with CAS and preserved hidden notes', async () => {
    mockTemplate.mockResolvedValue({ status: 'ok', data: { ...detailFixture, routine: { ...detailFixture.routine, templateVersion: 4 } }, meta });
    const view = renderScreen();
    await waitFor(() => expect(view.getByText('PUSH')).toBeTruthy());
    fireEvent.press(view.getByRole('button', { name: 'Press, expandir' }));
    expect(view.getByText('Reps', { includeHiddenElements: true })).toBeTruthy();
    expect(view.getByText('Peso', { includeHiddenElements: true })).toBeTruthy();
    expect(view.getByText('RIR', { includeHiddenElements: true })).toBeTruthy();
    // mm:ss needs ":", which the decimal and number pads do not offer on iOS.
    expect(view.getByLabelText('Mínimo (mm:ss)').props.keyboardType).toBe('numbers-and-punctuation');
    expect(view.getByLabelText('Máximo (mm:ss)').props.keyboardType).toBe('numbers-and-punctuation');
    fireEvent.changeText(view.getByLabelText('Serie 1, reps'), '9');
    expect(view.getByText('Cambios sin guardar')).toBeTruthy();
    fireEvent.press(view.getByRole('button', { name: 'Guardar objetivos' }));
    await waitFor(() => expect(mockTemplate).toHaveBeenCalledTimes(1));
    expect(mockTemplate.mock.calls[0]?.[2]).toMatchObject({
      expectedTemplateVersion: 3,
      items: [{
        routineExerciseId: detailFixture.items[0]!.routineExerciseId,
        exerciseId: detailFixture.items[0]!.exercise.id,
        targets: {
          nextAdjustment: 'custom', nextAdjustmentNote: 'Más control', notes: 'Agarre',
          sets: [{ targetReps: 9, targetWeightKg: null, targetRir: 0, notes: 'Legacy set note' }],
        },
      }],
    });
  });

  it('keeps dirty navigation on screen when cancellation is selected', async () => {
    const view = renderScreen();
    await waitFor(() => expect(view.getByText('PUSH')).toBeTruthy());
    fireEvent.press(view.getByRole('button', { name: 'Press, expandir' }));
    fireEvent.changeText(view.getByLabelText('Serie 1, reps'), '10');
    fireEvent.press(view.getByRole('button', { name: 'Iniciar entrenamiento' }));
    expect(view.queryByText(/Empezar PUSH/)).toBeNull();
    fireEvent.press(view.getByRole('button', { name: '+ Agregar ejercicio' }));
    expect(view.getByText(/Guardá los objetivos pendientes/)).toBeTruthy();
    expect(mockCatalog).not.toHaveBeenCalled();
    expect(mockUsePreventRemove).toHaveBeenLastCalledWith(true);
    act(() => mockPreventRemoveCallback?.({ data: { action: { type: 'GO_BACK' } } }));
    confirmAlert('Seguir editando');
    expect(mockDispatch).not.toHaveBeenCalled();
    expect(view.getByDisplayValue('10')).toBeTruthy();
  });

  it('re-dispatches the blocked dirty action exactly once when discard is confirmed', async () => {
    const view = renderScreen();
    await waitFor(() => expect(view.getByText('PUSH')).toBeTruthy());
    fireEvent.press(view.getByRole('button', { name: 'Press, expandir' }));
    fireEvent.changeText(view.getByLabelText('Serie 1, reps'), '10');
    const action = { type: 'GO_BACK', source: 'routine-editor' };
    act(() => mockPreventRemoveCallback?.({ data: { action } }));
    confirmAlert('Salir sin guardar');
    expect(mockDispatch).toHaveBeenCalledTimes(1);
    expect(mockDispatch).toHaveBeenCalledWith(action);
  });

  it('uses one supported remove guard and a non-duplicated Rutinas header', async () => {
    renderScreen();
    await waitFor(() => expect(mockStackOptions).toHaveBeenCalledWith({
      headerBackButtonMenuEnabled: false,
      title: 'Rutinas',
    }));
    expect(mockPreventRemoveCallback).toEqual(expect.any(Function));
  });

  it('handles template CAS conflict without automatic retry or lost-update merge', async () => {
    mockTemplate.mockResolvedValue({ status: 'conflict', code: 'ROUTINE_TEMPLATE_CHANGED', message: 'changed', meta });
    const view = renderScreen();
    await waitFor(() => expect(view.getByText('PUSH')).toBeTruthy());
    fireEvent.press(view.getByRole('button', { name: 'Press, expandir' }));
    fireEvent.changeText(view.getByLabelText('Serie 1, reps'), '9');
    fireEvent.press(view.getByRole('button', { name: 'Guardar objetivos' }));
    await waitFor(() => expect(view.getByText(/La rutina cambió en otro lugar/)).toBeTruthy());
    expect(mockTemplate).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2));
  });

  it('shows a real empty template and 404 separately', async () => {
    mockFetch.mockResolvedValueOnce(loaded({ ...detailFixture, items: [] }));
    const empty = renderScreen();
    await waitFor(() => expect(empty.getByText('Todavía no tiene ejercicios')).toBeTruthy());
    empty.unmount();
    mockFetch.mockResolvedValueOnce({ status: 'ok', data: { kind: 'not_found' }, meta });
    const missing = renderScreen();
    await waitFor(() => expect(missing.getByText('No encontramos la rutina')).toBeTruthy());
  });

  it('opens identity settings with server timestamp CAS and archives with desired-state PATCH', async () => {
    mockIdentity.mockResolvedValue({ status: 'ok', data: { routine: { ...detailFixture.routine, name: 'PUSH B' } }, meta });
    mockStatus.mockResolvedValue({ status: 'ok', data: { routine: { id: detailFixture.routine.id, isActive: false, updatedAt: detailFixture.routine.updatedAt } }, meta });
    const view = renderScreen();
    await waitFor(() => expect(view.getByText('PUSH')).toBeTruthy());
    fireEvent.press(view.getByRole('button', { name: 'Editar identidad de rutina' }));
    fireEvent.changeText(view.getByLabelText('Nombre de la rutina'), 'PUSH B');
    fireEvent.press(view.getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() => expect(mockIdentity).toHaveBeenCalledWith(expect.anything(), detailFixture.routine.id, {
      name: 'PUSH B', color: 'violet', expectedUpdatedAt: detailFixture.routine.updatedAt,
    }));
    fireEvent.press(view.getByRole('button', { name: 'Opciones de rutina' }));
    fireEvent.press(view.getByRole('button', { name: 'Archivar rutina' }));
    confirmAlert('Archivar');
    await waitFor(() => expect(mockStatus).toHaveBeenCalledWith(expect.anything(), detailFixture.routine.id, false));
  });

  it('offers Sin color as an explicit accessible identity option', async () => {
    mockIdentity.mockResolvedValue({
      status: 'ok',
      data: { routine: { ...detailFixture.routine, color: null } },
      meta,
    });
    const view = renderScreen();
    await waitFor(() => expect(view.getByText('PUSH')).toBeTruthy());
    fireEvent.press(view.getByRole('button', { name: 'Editar identidad de rutina' }));
    const noColor = view.getByRole('radio', { name: 'Sin color' });
    expect(noColor.props.accessibilityState).toMatchObject({ checked: false });
    fireEvent.press(noColor);
    expect(view.getByRole('radio', { name: 'Sin color' }).props.accessibilityState).toMatchObject({ checked: true });
    fireEvent.press(view.getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() => expect(mockIdentity).toHaveBeenCalledWith(
      expect.anything(),
      detailFixture.routine.id,
      expect.objectContaining({ color: null }),
    ));
  });

  it('adds an active catalog exercise through one full-template PUT with a null relation id', async () => {
    const candidate = {
      id: '44444444-4444-4444-8444-444444444444', name: 'Dominadas',
      muscleGroup: 'espalda', muscleGroupLabel: null, implement: 'Peso corporal',
      weightMode: 'Peso corporal', suggestedSets: 2, suggestedReps: 8,
      suggestedWeight: 0, suggestedRir: null, suggestedRestMinSeconds: 90,
      suggestedRestMaxSeconds: 120, notes: null, isActive: true, routineIds: [],
      updatedAt: '2026-09-28T12:00:00Z',
    };
    mockCatalog.mockResolvedValue({ status: 'ok', data: { catalog: { status: 'ok', data: { exercises: [candidate], routines: [] } } }, meta });
    mockTemplate.mockResolvedValue({ status: 'ok', data: detailFixture, meta });
    const view = renderScreen();
    await waitFor(() => expect(view.getByText('PUSH')).toBeTruthy());
    fireEvent.press(view.getByRole('button', { name: '+ Agregar ejercicio' }));
    await waitFor(() => expect(view.getByRole('radio', { name: 'Dominadas' })).toBeTruthy());
    fireEvent.press(view.getByRole('radio', { name: 'Dominadas' }));
    fireEvent.press(view.getByRole('button', { name: 'Agregar a la rutina' }));
    await waitFor(() => expect(mockTemplate).toHaveBeenCalledTimes(1));
    expect(mockTemplate.mock.calls[0]?.[2]).toMatchObject({
      expectedTemplateVersion: 3,
      items: [
        { routineExerciseId: detailFixture.items[0]!.routineExerciseId },
        { routineExerciseId: null, exerciseId: candidate.id, targets: { sets: [{ setNumber: 1 }, { setNumber: 2 }] } },
      ],
    });
  });

  it('supports structural reorder and removal without editing the exercise library', async () => {
    const second = {
      ...detailFixture.items[0]!, routineExerciseId: '55555555-5555-4555-8555-555555555555', exerciseOrder: 2,
      exercise: { ...detailFixture.items[0]!.exercise, id: '66666666-6666-4666-8666-666666666666', name: 'Fondos' },
    };
    const two = { ...detailFixture, items: [detailFixture.items[0]!, second] };
    mockFetch.mockResolvedValue(loaded(two));
    mockTemplate.mockResolvedValue({ status: 'ok', data: two, meta });
    const view = renderScreen();
    await waitFor(() => expect(view.getByText('Fondos')).toBeTruthy());
    fireEvent.press(view.getByRole('button', { name: 'Más acciones para Fondos' }));
    confirmAlert('Mover arriba');
    await waitFor(() => expect(mockTemplate).toHaveBeenCalledTimes(1));
    expect((mockTemplate.mock.calls[0]?.[2] as { items: { exerciseId: string }[] }).items[0]!.exerciseId).toBe(second.exercise.id);
    fireEvent.press(view.getByRole('button', { name: 'Más acciones para Fondos' }));
    confirmAlert('Quitar de la rutina');
    confirmAlert('Quitar');
    await waitFor(() => expect(mockTemplate).toHaveBeenCalledTimes(2));
    expect((mockTemplate.mock.calls[1]?.[2] as { items: unknown[] }).items).toHaveLength(1);
  });

  it('keeps another exercise draft local when saving one exercise', async () => {
    const second = {
      ...detailFixture.items[0]!, routineExerciseId: '55555555-5555-4555-8555-555555555555', exerciseOrder: 2,
      exercise: { ...detailFixture.items[0]!.exercise, id: '66666666-6666-4666-8666-666666666666', name: 'Fondos' },
    };
    const two = { ...detailFixture, items: [detailFixture.items[0]!, second] };
    mockFetch.mockResolvedValue(loaded(two));
    mockTemplate.mockResolvedValue({ status: 'ok', data: { ...two, routine: { ...two.routine, templateVersion: 4 } }, meta });
    const view = renderScreen();
    await waitFor(() => expect(view.getByText('Fondos')).toBeTruthy());
    fireEvent.press(view.getByRole('button', { name: 'Press, expandir' }));
    fireEvent.changeText(view.getByLabelText('Serie 1, reps'), '10');
    fireEvent.press(view.getByRole('button', { name: 'Fondos, expandir' }));
    fireEvent.changeText(view.getByLabelText('Serie 1, reps'), '12');
    fireEvent.press(view.getByRole('button', { name: 'Guardar objetivos' }));
    await waitFor(() => expect(mockTemplate).toHaveBeenCalledTimes(1));
    fireEvent.press(view.getByRole('button', { name: 'Press, expandir' }));
    expect(view.getByDisplayValue('10')).toBeTruthy();
    expect(view.getByText('Cambios sin guardar')).toBeTruthy();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('shows archived routine without Start and keeps structure editable', async () => {
    mockFetch.mockResolvedValue(loaded({ ...detailFixture, routine: { ...detailFixture.routine, isActive: false } }));
    const view = renderScreen();
    await waitFor(() => expect(view.getByText('Rutina archivada')).toBeTruthy());
    expect(view.queryByRole('button', { name: 'Iniciar entrenamiento' })).toBeNull();
    expect(view.getByRole('button', { name: 'Press, expandir' })).toBeTruthy();
    expect(view.getByRole('button', { name: 'Restaurar rutina' })).toBeTruthy();
  });

  it('separates initial unavailable from valid empty and keeps stale detail visible', async () => {
    mockFetch.mockResolvedValueOnce({ status: 'unavailable', reason: 'network', meta });
    const unavailable = renderScreen();
    await waitFor(() => expect(unavailable.getByText('No pudimos cargar la rutina')).toBeTruthy());
    unavailable.unmount();

    mockFetch.mockResolvedValueOnce(loaded()).mockResolvedValueOnce({ status: 'unavailable', reason: 'server', meta });
    const stale = renderScreen();
    await waitFor(() => expect(stale.getByText('PUSH')).toBeTruthy());
    fireEvent(stale.UNSAFE_getByType(RefreshControl), 'refresh');
    await waitFor(() => expect(stale.getByText('Mostramos la última lectura confirmada.')).toBeTruthy());
    expect(stale.getByText('PUSH')).toBeTruthy();
  });

  it('does not replace dirty drafts on refresh and preserves them after a failed write', async () => {
    mockTemplate.mockResolvedValue({ status: 'unavailable', reason: 'network', meta });
    const view = renderScreen();
    await waitFor(() => expect(view.getByText('PUSH')).toBeTruthy());
    fireEvent.press(view.getByRole('button', { name: 'Press, expandir' }));
    fireEvent.changeText(view.getByLabelText('Serie 1, reps'), '15');
    fireEvent(view.UNSAFE_getByType(RefreshControl), 'refresh');
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(view.getByDisplayValue('15')).toBeTruthy();
    fireEvent.press(view.getByRole('button', { name: 'Guardar objetivos' }));
    await waitFor(() => expect(view.getByText('No pudimos guardar. Revisá la conexión e intentá nuevamente.')).toBeTruthy());
    expect(view.getByDisplayValue('15')).toBeTruthy();
    expect(mockTemplate).toHaveBeenCalledTimes(1);
  });

  it('refetches on identity CAS conflict without overwriting blindly', async () => {
    mockIdentity.mockResolvedValue({ status: 'conflict', code: 'ROUTINE_CHANGED', message: 'changed', meta });
    const view = renderScreen();
    await waitFor(() => expect(view.getByText('PUSH')).toBeTruthy());
    fireEvent.press(view.getByRole('button', { name: 'Editar identidad de rutina' }));
    fireEvent.changeText(view.getByLabelText('Nombre de la rutina'), 'PUSH B');
    fireEvent.press(view.getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() => expect(view.getByText(/La rutina cambió en otro lugar/)).toBeTruthy());
    expect(mockIdentity).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2));
  });
});

describe('library identity entry and future colors', () => {
  beforeEach(() => { mockEditIdentity = undefined; mockFetch.mockReset(); mockIdentity.mockReset(); mockUsePreventRemove.mockReset(); mockFetch.mockResolvedValue(loaded()); });

it('opens identity from the library route only once, with the loaded CAS token', async () => {
  mockEditIdentity = '1';
  mockFetch.mockResolvedValue(loaded());
  const view = renderScreen();
  await waitFor(() => expect(view.getByLabelText('Nombre de la rutina')).toBeTruthy());
  expect(mockIdentity).not.toHaveBeenCalled();
  fireEvent.press(view.getByRole('button', { name: 'Cerrar Editar rutina' }));
  await waitFor(() => expect(view.queryByLabelText('Nombre de la rutina')).toBeNull());
  fireEvent(view.UNSAFE_getByType(RefreshControl), 'refresh');
  await act(async () => undefined);
  expect(view.queryByLabelText('Nombre de la rutina')).toBeNull();
});

it('requires explicit color selection before saving an unrecognized color', async () => {
  mockFetch.mockResolvedValue(loaded({ ...detailFixture, routine: { ...detailFixture.routine, color: null, unrecognizedColor: 'sand' } }));
  const view = renderScreen();
  await waitFor(() => expect(view.getByText('PUSH')).toBeTruthy());
  fireEvent.press(view.getByRole('button', { name: 'Editar identidad de rutina' }));
  fireEvent.changeText(view.getByLabelText('Nombre de la rutina'), 'PUSH B');
  expect(view.getByRole('button', { name: 'Guardar cambios' })).toBeDisabled();
  fireEvent.press(view.getByRole('button', { name: 'Guardar cambios' }));
  expect(mockIdentity).not.toHaveBeenCalled();
  fireEvent.press(view.getByRole('radio', { name: 'Sin color' }));
  expect(view.getByRole('button', { name: 'Guardar cambios' })).not.toBeDisabled();
});

});
