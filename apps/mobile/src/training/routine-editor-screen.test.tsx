import { act, fireEvent, render, waitFor, within } from '@testing-library/react-native';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Alert, AppState, RefreshControl, type AppStateStatus } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { RoutineDetail } from '@/api/routine-editor';
import type { MobileTrainingExercise } from '@/api/exercises';
import { detailFixture } from '@/api/routine-editor.fixture';
import { OwnlevelThemeProvider } from '@/design-system';
import { RoutineEditorScreen } from './routine-editor-screen';

const mockFetch = jest.fn<(...args: unknown[]) => Promise<unknown>>(), mockCatalog = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockTemplate = jest.fn<(...args: unknown[]) => Promise<unknown>>(), mockIdentity = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockStatus = jest.fn<(...args: unknown[]) => Promise<unknown>>(), mockDuplicate = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockCreateExercise = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockRequest = jest.fn(), mockPush = jest.fn(), mockDismiss = jest.fn(), mockReplace = jest.fn(), mockDispatch = jest.fn(), mockOptions = jest.fn(), mockStart = jest.fn();
const mockPreventRemove = jest.fn();
let mockConfirmStart: (() => void) | undefined, mockCancelStart: (() => void) | undefined;
let mockIdentityParam: string | undefined, mockRemoveCallback: ((args: { data: { action: object } }) => void) | undefined;
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('expo-glass-effect', () => ({ isGlassEffectAPIAvailable: () => false, isLiquidGlassAvailable: () => false }));
jest.mock('./routine-editor-sheet', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  return { RoutineEditorSheet: function MockSheet({ children, open, onDismissed }: { children: React.ReactNode; open: boolean; onDismissed?: () => void }) {
    React.useEffect(() => { if (!open) onDismissed?.(); }, [open, onDismissed]); return open ? children : null;
  } };
});
jest.mock('./routine-form-sheet', () => ({ RoutineFormSheet: ({ children, open }: { children: React.ReactNode; open: boolean }) => open ? children : null }));
jest.mock('./routine-exercise-picker-body', () => jest.requireActual('./routine-exercise-picker-body.tsx'));
jest.mock('react-native-gesture-handler/ReanimatedSwipeable', () => {
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return { __esModule: true, default: ({ children, renderRightActions }: { children: React.ReactNode; renderRightActions?: () => React.ReactNode }) => <View>{children}{renderRightActions?.()}</View> };
});
jest.mock('expo-router', () => {
  const { Pressable } = jest.requireActual<typeof import('react-native')>('react-native');
  const Container = ({ children }: { children: React.ReactNode }) => children;
  const Toolbar = Object.assign(Container, { Menu: Container, MenuAction: ({ children, onPress }: { children: string; onPress: () => void }) => <Pressable accessibilityLabel={children} accessibilityRole="button" onPress={onPress} />,
    Button: ({ accessibilityLabel, onPress, disabled }: { accessibilityLabel: string; onPress: () => void; disabled: boolean }) => <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} onPress={onPress} disabled={disabled} /> });
  return { Stack: { Toolbar, Screen: ({ options }: { options: object }) => { mockOptions(options); return null; } },
    useLocalSearchParams: () => ({ id: '11111111-1111-4111-8111-111111111111', editIdentity: mockIdentityParam }), useNavigation: () => ({ dispatch: mockDispatch }),
    useRouter: () => ({ push: mockPush, dismissTo: mockDismiss, replace: mockReplace }) };
});
jest.mock('./start-confirm', () => ({ StartConfirm: ({ open, onConfirm, onCancel }: { open: boolean; onConfirm: () => void; onCancel: () => void }) => {
  const { Pressable } = jest.requireActual<typeof import('react-native')>('react-native');
  mockConfirmStart = open ? onConfirm : undefined; mockCancelStart = open ? onCancel : undefined;
  return open ? <><Pressable accessibilityRole="button" accessibilityLabel="Confirmar inicio" onPress={onConfirm} /><Pressable accessibilityRole="button" accessibilityLabel="Cancelar inicio" onPress={onCancel} /></> : null;
} }));
jest.mock('./routine-remove-confirm', () => jest.requireActual('./routine-remove-confirm.tsx'));
jest.mock('./use-session-starter', () => ({ useSessionStarter: () => ({ element: null, start: mockStart }) }));
jest.mock('expo-router/build/react-navigation/core/usePreventRemove', () => ({ usePreventRemove: (blocked: boolean, callback: typeof mockRemoveCallback) => { mockPreventRemove(blocked); mockRemoveCallback = callback; } }));
jest.mock('@/api', () => ({
  useApiResource: jest.requireActual<typeof import('@/api/resource')>('@/api/resource').useApiResource,
  useMobileApi: () => ({ client: { request: mockRequest } }), fetchRoutineDetail: (...args: unknown[]) => mockFetch(...args),
  fetchMobileTrainingExercises: (...args: unknown[]) => mockCatalog(...args), replaceRoutineTemplate: (...args: unknown[]) => mockTemplate(...args),
  updateRoutineIdentity: (...args: unknown[]) => mockIdentity(...args), setMobileTrainingRoutineStatus: (...args: unknown[]) => mockStatus(...args),
  duplicateMobileTrainingRoutine: (...args: unknown[]) => mockDuplicate(...args), createMobileTrainingExercise: (...args: unknown[]) => mockCreateExercise(...args),
}));
const meta = { durationMs: 1, httpStatus: 200, outcome: 'ok' as const };
const loaded = (detail: RoutineDetail = detailFixture) => ({ status: 'ok', data: { kind: 'detail', detail }, meta });
const candidate = (name = 'Dominadas', id = '44444444-4444-4444-8444-444444444444'): MobileTrainingExercise => ({
  id, name, muscleGroup: 'espalda', muscleGroupLabel: null, implement: 'Peso corporal', weightMode: 'Peso corporal',
  suggestedSets: 2, suggestedReps: 8, suggestedWeight: 0, suggestedRir: null, suggestedRestMinSeconds: 90, suggestedRestMaxSeconds: 120,
  notes: null, isActive: true, routineIds: [], updatedAt: '2026-09-28T12:00:00Z',
});
function twoItems(): RoutineDetail { return { ...detailFixture, items: [detailFixture.items[0]!, { ...detailFixture.items[0]!, routineExerciseId: '55555555-5555-4555-8555-555555555555', exerciseOrder: 2,
  exercise: { ...detailFixture.items[0]!.exercise, id: '66666666-6666-4666-8666-666666666666', name: 'Fondos' } }] }; }
function screen(dark = false) { return render(<SafeAreaProvider initialMetrics={{ frame: { height: 844, width: 390, x: 0, y: 0 }, insets: { bottom: 34, left: 0, right: 0, top: 47 } }}>
  <OwnlevelThemeProvider initialMode={dark ? 'dark' : 'light'}><RoutineEditorScreen createIdempotencyKey={() => 'intent-key'} /></OwnlevelThemeProvider></SafeAreaProvider>); }
async function ready(view: ReturnType<typeof screen>) { await waitFor(() => expect(view.getByTestId('routine-editor-screen')).toBeTruthy()); await act(async () => undefined); }
function press(view: ReturnType<typeof screen>, name: string) { fireEvent.press(view.getAllByRole('button', { name }).at(-1)!); }
function confirm(label: string) { act(() => jest.mocked(Alert.alert).mock.calls.at(-1)?.[2]?.find(button => button.text === label)?.onPress?.()); }
function catalog(exercises: MobileTrainingExercise[]) { mockCatalog.mockResolvedValue({ status: 'ok', data: { catalog: { status: 'ok', data: { exercises, routines: [] } } }, meta }); }
beforeEach(() => {
  jest.restoreAllMocks(); jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  [mockFetch, mockCatalog, mockTemplate, mockIdentity, mockStatus, mockDuplicate, mockCreateExercise, mockRequest, mockPush, mockDismiss, mockReplace, mockDispatch, mockOptions, mockStart, mockPreventRemove].forEach(fn => fn.mockReset());
  mockIdentityParam = undefined; mockRemoveCallback = undefined; mockFetch.mockResolvedValue(loaded());
});
describe('routine editor sheets and native list', () => {
  it.each([false, true])('uses a native routine title and confirmed counts without row colors/cards (dark=%s)', async dark => {
    const view = screen(dark); await ready(view);
    expect(mockOptions).toHaveBeenLastCalledWith(expect.objectContaining({ title: 'PUSH', headerLargeTitleEnabled: true, headerStyle: { backgroundColor: 'transparent' } }));
    expect(view.getByText('1 ejercicio · 1 serie')).toBeTruthy(); expect(view.getByText('Ejercicio archivado')).toBeTruthy();
    expect(view.queryByText('Abrí uno para editarlo')).toBeNull(); expect(view.queryByText('Hay cambios sin guardar')).toBeNull();
    press(view, 'Volver a Rutinas'); expect(mockDismiss).toHaveBeenCalledWith('/(tabs)/train/routines');
  });
  it('requires confirmation and keeps the shared starter', async () => {
    const view = screen(); await ready(view); expect(mockStart).not.toHaveBeenCalled(); press(view, 'Iniciar entrenamiento');
    expect(mockStart).not.toHaveBeenCalled(); const confirm = mockConfirmStart; act(() => { confirm?.(); confirm?.(); }); expect(mockStart).toHaveBeenCalledWith({ routineId: detailFixture.routine.id }); expect(mockStart).toHaveBeenCalledTimes(1);
  });
  it('saves one sheet with template CAS, null/zero and hidden notes preserved', async () => {
    mockTemplate.mockResolvedValue({ status: 'ok', data: { ...detailFixture, routine: { ...detailFixture.routine, templateVersion: 4 } }, meta });
    const view = screen(); await ready(view); press(view, 'Editar Press'); expect(view.getByTestId('routine-targets-sheet')).toBeTruthy();
    expect(view.getByRole('button', { name: 'Guardar objetivos' })).toBeDisabled();
    expect(view.getByLabelText('Serie 1, peso').props.value).toBe(''); expect(view.getByLabelText('Serie 1, RIR').props.value).toBe('0');
    fireEvent.changeText(view.getByLabelText('Serie 1, reps'), '9'); await act(async () => press(view, 'Guardar objetivos'));
    await waitFor(() => expect(view.queryByTestId('routine-targets-sheet')).toBeNull());
    expect(mockTemplate).toHaveBeenCalledWith(expect.anything(), detailFixture.routine.id, expect.objectContaining({ expectedTemplateVersion: 3,
      items: [expect.objectContaining({ routineExerciseId: detailFixture.items[0]!.routineExerciseId, targets: expect.objectContaining({ nextAdjustment: 'custom', nextAdjustmentNote: 'Más control', notes: 'Agarre',
        sets: [expect.objectContaining({ targetReps: 9, targetWeightKg: null, targetRir: 0, notes: 'Legacy set note' })] }) })] }));
    expect(view.getByText('Objetivos guardados')).toBeTruthy();
  });
  it('keeps discard decisions scoped to the open sheet and History navigation', async () => {
    const view = screen(); await ready(view); press(view, 'Editar Press'); fireEvent.changeText(view.getByLabelText('Serie 1, reps'), '12');
    press(view, 'Cerrar ejercicio'); confirm('Seguir editando'); expect(view.getByDisplayValue('12')).toBeTruthy();
    press(view, 'Historial del ejercicio'); expect(mockPush).not.toHaveBeenCalled(); confirm('Salir sin guardar');
    expect(mockPush).toHaveBeenCalledWith(`/(tabs)/train/history/exercise/${detailFixture.items[0]!.exercise.id}`);
    expect(view.queryByTestId('routine-targets-sheet')).toBeNull(); expect(mockTemplate).not.toHaveBeenCalled();
  });
  it('guards native back while dirty and redispatches exactly once on discard', async () => {
    const view = screen(); await ready(view); press(view, 'Editar Press'); fireEvent.changeText(view.getByLabelText('Serie 1, reps'), '12');
    expect(mockPreventRemove).toHaveBeenLastCalledWith(true); const action = { type: 'GO_BACK' };
    act(() => mockRemoveCallback?.({ data: { action } })); confirm('Seguir editando'); expect(mockDispatch).not.toHaveBeenCalled();
    act(() => mockRemoveCallback?.({ data: { action } })); confirm('Salir sin guardar'); expect(mockDispatch).toHaveBeenCalledTimes(1); expect(mockDispatch).toHaveBeenCalledWith(action);
  });
  it('validates next to fields, enforces one last set and copies the last values', async () => {
    const view = screen(); await ready(view); press(view, 'Editar Press');
    expect(view.getByRole('button', { name: 'Quitar serie 1' })).toBeDisabled(); press(view, 'Quitar serie 1'); expect(view.getByLabelText('Serie 1, reps')).toBeTruthy();
    press(view, 'Agregar serie'); expect(view.getByLabelText('Serie 2, reps').props.value).toBe('0'); expect(view.getByLabelText('Serie 2, peso').props.value).toBe('');
    fireEvent.changeText(view.getByLabelText('Serie 1, reps'), '1.5'); await act(async () => press(view, 'Guardar objetivos')); expect(view.getByText(/Repeticiones debe estar/)).toBeTruthy(); expect(mockTemplate).not.toHaveBeenCalled();
    fireEvent.changeText(view.getByLabelText('Serie 1, reps'), '7'); press(view, 'Quitar serie 1'); expect(view.queryByLabelText('Serie 2, reps')).toBeNull();
  });
  it('keeps custom adjustment untouched until selecting and can toggle back to maintain', async () => {
    const view = screen(); await ready(view); press(view, 'Editar Press'); expect(view.getByText('Ajuste personalizado anterior conservado.')).toBeTruthy();
    press(view, 'Más reps'); expect(view.getByText(/Subir repeticiones/)).toBeTruthy(); expect(view.queryByText('Ajuste personalizado anterior conservado.')).toBeNull();
    press(view, 'Más reps'); expect(view.getByText(/Sin marcar, se mantiene igual/)).toBeTruthy();
  });
  it('preserves drafts after an ambiguous write and never overwrites them with refresh', async () => {
    mockTemplate.mockResolvedValue({ status: 'unavailable', reason: 'network', meta });
    const view = screen(); await ready(view); press(view, 'Editar Press'); fireEvent.changeText(view.getByLabelText('Serie 1, reps'), '15');
    fireEvent(view.UNSAFE_getByType(RefreshControl), 'refresh'); expect(mockFetch).toHaveBeenCalledTimes(1);
    await act(async () => press(view, 'Guardar objetivos')); await waitFor(() => expect(view.getAllByText(/No pudimos confirmar el cambio/).length).toBeGreaterThan(0));
    expect(view.getByDisplayValue('15')).toBeTruthy(); expect(mockTemplate).toHaveBeenCalledTimes(1);
  });
  it('closes a conflicting draft and fetches authoritative state without retrying the write', async () => {
    mockTemplate.mockResolvedValue({ status: 'conflict', code: 'ROUTINE_TEMPLATE_CHANGED', message: 'changed', meta });
    const view = screen(); await ready(view); press(view, 'Editar Press'); fireEvent.changeText(view.getByLabelText('Serie 1, reps'), '9');
    const updated = { ...detailFixture, routine: { ...detailFixture.routine, templateVersion: 4, name: 'Servidor' } }; mockFetch.mockResolvedValue(loaded(updated));
    await act(async () => press(view, 'Guardar objetivos')); await waitFor(() => expect(view.queryByTestId('routine-targets-sheet')).toBeNull());
    await waitFor(() => expect(mockOptions).toHaveBeenLastCalledWith(expect.objectContaining({ title: 'Servidor' })));
    expect(mockTemplate).toHaveBeenCalledTimes(1); expect(view.getByText(/Los cambios no se guardaron/)).toBeTruthy();
  });
  it('distinguishes valid empty, not found and unavailable and keeps stale detail', async () => {
    mockFetch.mockResolvedValueOnce(loaded({ ...detailFixture, items: [] })); const empty = screen(); await waitFor(() => expect(empty.getByText('Todavía no tiene ejercicios')).toBeTruthy()); empty.unmount();
    mockFetch.mockResolvedValueOnce({ status: 'ok', data: { kind: 'not_found' }, meta }); const missing = screen(); await waitFor(() => expect(missing.getByText('No encontramos la rutina')).toBeTruthy()); missing.unmount();
    mockFetch.mockResolvedValueOnce({ status: 'unavailable', reason: 'network', meta }); const unavailable = screen(); await waitFor(() => expect(unavailable.getByText('No pudimos cargar la rutina')).toBeTruthy()); expect(unavailable.queryByText('Todavía no tiene ejercicios')).toBeNull(); unavailable.unmount();
    mockFetch.mockResolvedValueOnce(loaded()).mockResolvedValueOnce({ status: 'unavailable', reason: 'network', meta }); const stale = screen(); await ready(stale); fireEvent(stale.UNSAFE_getByType(RefreshControl), 'refresh'); await waitFor(() => expect(stale.getByText('Mostramos la última lectura confirmada.')).toBeTruthy()); expect(stale.getByRole('button', { name: 'Editar Press' })).toBeTruthy();
  });
  it('archives without a confirmation and offers undo, without Start when archived', async () => {
    mockStatus.mockImplementation(async (_client, _id, active) => ({ status: 'ok', data: { routine: { id: detailFixture.routine.id, isActive: active, updatedAt: detailFixture.routine.updatedAt } }, meta }));
    const view = screen(); await ready(view); mockFetch.mockResolvedValue(loaded({ ...detailFixture, routine: { ...detailFixture.routine, isActive: false } }));
    await act(async () => press(view, 'Archivar rutina')); await waitFor(() => expect(view.getByText('PUSH archivada')).toBeTruthy()); expect(Alert.alert).not.toHaveBeenCalled(); expect(view.queryByRole('button', { name: 'Iniciar entrenamiento' })).toBeNull();
    mockFetch.mockResolvedValue(loaded()); await act(async () => press(view, 'Deshacer cambio de estado')); await waitFor(() => expect(mockStatus).toHaveBeenCalledTimes(2));
    expect(mockStatus.mock.calls.map(call => call[2])).toEqual([false, true]);
  });
  it('uses the shared identity sheet, 12 colors and timestamp CAS', async () => {
    mockIdentity.mockResolvedValue({ status: 'ok', data: { routine: { ...detailFixture.routine, name: 'PUSH B', color: null } }, meta });
    const view = screen(); await ready(view); press(view, 'Cambiar nombre y color'); fireEvent.changeText(view.getByLabelText('Nombre de la rutina'), 'PUSH B');
    expect(view.getByRole('radio', { name: /arena/i })).toBeTruthy(); fireEvent.press(view.getByRole('radio', { name: 'Sin color' })); await act(async () => press(view, 'Guardar cambios'));
    await waitFor(() => expect(mockIdentity).toHaveBeenCalledWith(expect.anything(), detailFixture.routine.id, { name: 'PUSH B', color: null, expectedUpdatedAt: detailFixture.routine.updatedAt }));
  });
  it('handles identity conflict and future colors without silently clearing them', async () => {
    mockFetch.mockResolvedValue(loaded({ ...detailFixture, routine: { ...detailFixture.routine, color: null, unrecognizedColor: 'future-color' } }));
    mockIdentity.mockResolvedValue({ status: 'conflict', code: 'ROUTINE_CHANGED', message: 'changed', meta });
    const view = screen(); await ready(view); press(view, 'Cambiar nombre y color'); fireEvent.changeText(view.getByLabelText('Nombre de la rutina'), 'Otra');
    expect(view.getByRole('button', { name: 'Guardar cambios' })).toBeDisabled(); fireEvent.press(view.getByRole('radio', { name: 'Sin color' })); await act(async () => press(view, 'Guardar cambios'));
    await waitFor(() => expect(view.queryByLabelText('Nombre de la rutina')).toBeNull()); expect(mockIdentity).toHaveBeenCalledTimes(1); expect(view.getByText(/La rutina cambió en otro lugar/)).toBeTruthy();
  });
  it('opens identity from the library once and never reopens after close/refresh', async () => {
    mockIdentityParam = '1'; const view = screen(); await waitFor(() => expect(view.getByLabelText('Nombre de la rutina')).toBeTruthy()); press(view, 'Cerrar identidad');
    await waitFor(() => expect(view.queryByLabelText('Nombre de la rutina')).toBeNull()); fireEvent(view.UNSAFE_getByType(RefreshControl), 'refresh'); await act(async () => undefined); expect(view.queryByLabelText('Nombre de la rutina')).toBeNull();
  });
  it('duplicates with the same sheet and reuses the idempotency intent on an ambiguous retry', async () => {
    mockDuplicate.mockResolvedValueOnce({ status: 'unavailable', reason: 'network', meta }).mockResolvedValueOnce({ status: 'ok', data: { routine: { id: 'new', name: 'PUSH copia', color: 'violet', order: 2, isActive: true, exerciseCount: 1, setCount: 1 } }, meta });
    const view = screen(); await ready(view); await act(async () => press(view, 'Duplicar rutina')); await waitFor(() => expect(view.getByDisplayValue('PUSH copia')).toBeTruthy()); await act(async () => press(view, 'Duplicar rutina'));
    await waitFor(() => expect(view.getByText(/No pudimos confirmar la copia/)).toBeTruthy()); await act(async () => press(view, 'Duplicar rutina')); await waitFor(() => expect(mockDuplicate).toHaveBeenCalledTimes(2));
    expect(mockDuplicate.mock.calls[0]?.[2]).toEqual(mockDuplicate.mock.calls[1]?.[2]); expect(mockDuplicate.mock.calls[0]?.[2]).toMatchObject({ expectedUpdatedAt: detailFixture.routine.updatedAt, expectedTemplateVersion: 3, idempotencyKey: 'intent-key' });
  });
  it('adds multiple selected exercises in selection order, keeps existing rows disabled', async () => {
    const first = candidate(), second = candidate('Aperturas', '77777777-7777-4777-8777-777777777777'); catalog([first, second, { ...first, id: detailFixture.items[0]!.exercise.id, name: 'Press' }]); mockTemplate.mockResolvedValue({ status: 'ok', data: detailFixture, meta });
    const view = screen(); await ready(view); press(view, 'Agregar ejercicios'); await waitFor(() => expect(view.getByRole('button', { name: 'Press, En la rutina' })).toBeTruthy());
    expect(view.getByRole('button', { name: 'Press, En la rutina' })).toBeDisabled(); press(view, 'Dominadas'); press(view, 'Aperturas');
    await act(async () => press(view, 'Agregar 2 ejercicios')); await waitFor(() => expect(mockTemplate).toHaveBeenCalledTimes(1));
    const payload = mockTemplate.mock.calls[0]?.[2] as { items: { exerciseId: string }[]; expectedTemplateVersion: number };
    expect(payload.expectedTemplateVersion).toBe(3); expect(payload.items.map(item => item.exerciseId)).toEqual([detailFixture.items[0]!.exercise.id, first.id, second.id]);
  });
  it('keeps catalog failures distinct from no results and never offers Create on failure', async () => {
    mockCatalog.mockResolvedValue({ status: 'ok', data: { catalog: { status: 'unavailable' } }, meta }); const view = screen(); await ready(view); press(view, 'Agregar ejercicios');
    await waitFor(() => expect(view.getByText('No pudimos cargar la biblioteca.')).toBeTruthy()); expect(view.queryByText(/Crear “/)).toBeNull(); expect(view.getByRole('button', { name: 'Agregar 0 ejercicios' })).toBeDisabled();
  });
  it('reorders accessibly with CAS and returns to server order on conflict', async () => {
    const two = twoItems(); mockFetch.mockResolvedValue(loaded(two)); mockTemplate.mockResolvedValue({ status: 'conflict', code: 'ROUTINE_TEMPLATE_CHANGED', message: 'changed', meta });
    const view = screen(); await ready(view); fireEvent(view.getByRole('button', { name: 'Editar Fondos' }), 'accessibilityAction', { nativeEvent: { actionName: 'moveUp' } });
    await waitFor(() => expect(mockTemplate).toHaveBeenCalledTimes(1)); expect((mockTemplate.mock.calls[0]?.[2] as { items: { exerciseId: string }[] }).items[0]!.exerciseId).toBe(two.items[1]!.exercise.id);
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2)); const list = within(view.getByTestId('routine-exercise-list')); expect(list.getAllByRole('button', { name: /Editar / }).map(node => node.props.accessibilityLabel)).toEqual(['Editar Press', 'Editar Fondos']);
  });
  it('requires explicit removal confirmation and never edits the exercise library', async () => {
    mockTemplate.mockResolvedValue({ status: 'ok', data: { ...detailFixture, items: [] }, meta }); const view = screen(); await ready(view); press(view, 'Quitar Press');
    expect(Alert.alert).toHaveBeenCalledWith('¿Quitar Press?', expect.stringContaining('Se pierden sus series y objetivos'), expect.any(Array), expect.any(Object)); expect(mockTemplate).not.toHaveBeenCalled(); await act(async () => confirm('Quitar de PUSH'));
    await waitFor(() => expect(mockTemplate).toHaveBeenCalledWith(expect.anything(), detailFixture.routine.id, { expectedTemplateVersion: 3, items: [] })); expect(mockRequest).not.toHaveBeenCalled();
  });
  it('creates from no results idempotently without direct assignment and leaves the new exercise selected', async () => {
    const callbacks: ((state: AppStateStatus) => void)[] = [];
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, callback) => { callbacks.push(callback); return { remove: jest.fn() }; });
    catalog([]); const created = candidate('Nuevo ejercicio');
    mockCreateExercise.mockResolvedValueOnce({ status: 'unavailable', reason: 'network', meta }).mockResolvedValueOnce({ status: 'ok', data: { exercise: created }, meta });
    const view = screen(); await ready(view); press(view, 'Agregar ejercicios');
    await waitFor(() => expect(view.getByLabelText('Buscar ejercicio')).toBeTruthy()); fireEvent.changeText(view.getByLabelText('Buscar ejercicio'), 'Nuevo ejercicio');
    press(view, 'Crear “Nuevo ejercicio”'); await waitFor(() => expect(view.getByRole('button', { name: 'Crear ejercicio' })).toBeTruthy());
    await act(async () => press(view, 'Crear ejercicio')); await waitFor(() => expect(view.getByText(/No pudimos confirmar el alta/)).toBeTruthy());
    await act(async () => press(view, 'Crear ejercicio')); await waitFor(() => expect(view.getByRole('button', { name: 'Agregar 1 ejercicio' })).not.toBeDisabled());
    expect(mockCreateExercise).toHaveBeenCalledTimes(2); expect(mockCreateExercise.mock.calls[0]?.[1]).toEqual(mockCreateExercise.mock.calls[1]?.[1]);
    expect(mockCreateExercise.mock.calls[0]?.[1]).toMatchObject({ routineIds: [], idempotencyKey: 'intent-key', exercise: { name: 'Nuevo ejercicio' } });
    expect(mockTemplate).not.toHaveBeenCalled();
    catalog([{ ...created, isActive: false, updatedAt: '2026-10-12T12:00:00Z' }]);
    await act(async () => { callbacks.forEach(callback => callback('background')); callbacks.forEach(callback => callback('active')); });
    expect(view.queryByRole('button', { name: 'Nuevo ejercicio, seleccionado' })).toBeNull();
    expect(view.getByRole('button', { name: 'Agregar 0 ejercicios' })).toBeDisabled();
  });
  it('keeps not_found authoritative after a write without producing an empty routine', async () => {
    mockTemplate.mockResolvedValue({ status: 'not_found', message: 'missing', meta });
    const view = screen(); await ready(view); press(view, 'Editar Press'); fireEvent.changeText(view.getByLabelText('Serie 1, reps'), '9');
    mockFetch.mockResolvedValue({ status: 'ok', data: { kind: 'not_found' }, meta }); await act(async () => press(view, 'Guardar objetivos'));
    await waitFor(() => expect(view.getByText('No encontramos la rutina')).toBeTruthy()); expect(view.queryByText('Todavía no tiene ejercicios')).toBeNull(); expect(view.queryByTestId('routine-targets-sheet')).toBeNull();
  });
  it('blocks concurrent actions while a template write is in flight and preserves a late read barrier', async () => {
    let finish: ((value: unknown) => void) | undefined;
    mockTemplate.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const view = screen(); await ready(view); press(view, 'Editar Press'); fireEvent.changeText(view.getByLabelText('Serie 1, reps'), '10'); await act(async () => press(view, 'Guardar objetivos'));
    expect(view.getByRole('button', { name: 'Guardando…' })).toBeDisabled(); expect(view.getByRole('button', { name: 'Cerrar ejercicio' })).toBeDisabled();
    await act(async () => press(view, 'Archivar rutina')); expect(mockStatus).not.toHaveBeenCalled();
    await act(async () => finish?.({ status: 'ok', data: { ...detailFixture, routine: { ...detailFixture.routine, templateVersion: 4 } }, meta }));
    expect(mockTemplate).toHaveBeenCalledTimes(1); expect(view.queryByTestId('routine-targets-sheet')).toBeNull();
  });

  it('shows exactly one accessible Add control and hides the floating control when a sheet is open', async () => {
    const view = screen(); await ready(view);
    fireEvent(view.getByTestId('routine-exercises-header'), 'layout', { nativeEvent: { layout: { y: 200, height: 44 } } });
    fireEvent(view.getByTestId('routine-editor-screen'), 'scroll', { nativeEvent: { contentOffset: { y: 300 }, contentInset: { top: 0, bottom: 34 }, contentSize: { height: 1200 }, layoutMeasurement: { height: 700 } } });
    expect(view.getAllByRole('button', { name: 'Agregar ejercicios' })).toHaveLength(1);
    catalog([]); press(view, 'Agregar ejercicios'); await waitFor(() => expect(view.getByTestId('routine-exercise-picker')).toBeTruthy());
    expect(view.queryByRole('button', { name: 'Agregar ejercicios' })).toBeNull();
  });

  it('never lets a read started before a write overwrite the acknowledged template', async () => {
    let resolveOldRead: ((value: unknown) => void) | undefined;
    const acknowledged = { ...detailFixture, routine: { ...detailFixture.routine, name: 'Guardada', templateVersion: 4 } };
    mockFetch.mockResolvedValueOnce(loaded()).mockImplementationOnce(() => new Promise(resolve => { resolveOldRead = resolve; })).mockResolvedValue(loaded(acknowledged));
    mockTemplate.mockResolvedValue({ status: 'ok', data: acknowledged, meta });
    const view = screen(); await ready(view); fireEvent(view.UNSAFE_getByType(RefreshControl), 'refresh');
    press(view, 'Editar Press'); fireEvent.changeText(view.getByLabelText('Serie 1, reps'), '11'); await act(async () => press(view, 'Guardar objetivos'));
    expect(mockOptions).toHaveBeenLastCalledWith(expect.objectContaining({ title: 'Guardada' }));
    await act(async () => resolveOldRead?.(loaded({ ...detailFixture, routine: { ...detailFixture.routine, name: 'Lectura vieja' } })));
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(3));
    expect(mockOptions).toHaveBeenLastCalledWith(expect.objectContaining({ title: 'Guardada' })); expect(mockTemplate).toHaveBeenCalledTimes(1);
  });

  it('ignores a late native cancellation after a new sheet acquires the read barrier', async () => {
    const view = screen(); await ready(view); press(view, 'Iniciar entrenamiento'); const cancel = mockCancelStart;
    await act(async () => cancel?.()); expect(mockFetch).toHaveBeenCalledTimes(2);
    press(view, 'Cambiar nombre y color'); fireEvent.changeText(view.getByLabelText('Nombre de la rutina'), 'Nombre local');
    await act(async () => cancel?.()); fireEvent(view.UNSAFE_getByType(RefreshControl), 'refresh');
    expect(mockFetch).toHaveBeenCalledTimes(2); expect(view.getByDisplayValue('Nombre local')).toBeTruthy(); expect(mockIdentity).not.toHaveBeenCalled();
  });

  it('does not offer Create or a false empty search when a previously confirmed catalog cannot refresh', async () => {
    const callbacks: ((state: AppStateStatus) => void)[] = [];
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, callback) => { callbacks.push(callback); return { remove: jest.fn() }; });
    catalog([]); const view = screen(); await ready(view); press(view, 'Agregar ejercicios');
    await waitFor(() => expect(view.getByLabelText('Buscar ejercicio')).toBeTruthy()); fireEvent.changeText(view.getByLabelText('Buscar ejercicio'), 'Nuevo');
    expect(view.getByRole('button', { name: 'Crear “Nuevo”' })).toBeTruthy();
    mockCatalog.mockResolvedValue({ status: 'unavailable', reason: 'network', meta });
    await act(async () => { callbacks.forEach(callback => callback('background')); callbacks.forEach(callback => callback('active')); });
    expect(view.queryByRole('button', { name: 'Crear “Nuevo”' })).toBeNull(); expect(view.getByText('Actualizá la biblioteca para continuar.')).toBeTruthy();
    expect(view.getByText('Mostramos la última lectura confirmada.')).toBeTruthy(); expect(mockCreateExercise).not.toHaveBeenCalled();
  });

});
