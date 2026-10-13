import { act, fireEvent, render, waitFor, within } from '@testing-library/react-native';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Alert, RefreshControl, DeviceEventEmitter, ScrollView, StyleSheet } from 'react-native';
import { State } from 'react-native-gesture-handler';
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';
import * as Reanimated from 'react-native-reanimated';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { MobileTrainingRoutinesResponse } from '@/api/routines';
import { OwnlevelThemeProvider } from '@/design-system';
import { RoutinesScreen } from './routines-screen';

const mockDuplicate = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockDetail = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockOrder = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockCreate = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockFetch = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockRefresh = jest.fn<() => Promise<void>>();
const mockSetStatus = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockUseApiResource = jest.fn();
const mockPush = jest.fn();
const mockStart = jest.fn();
const mockHeaderOptions = jest.fn();
let mockSwipeDistance = 0;

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('expo-glass-effect', () => ({ isGlassEffectAPIAvailable: () => false, isLiquidGlassAvailable: () => false }));
jest.mock('./routine-context-menu', () => jest.requireActual('./routine-context-menu.tsx'));
jest.mock('./routine-form-sheet', () => ({
  RoutineFormSheet: ({ children, open }: { children: React.ReactNode; open: boolean }) => open ? children : null,
}));
jest.mock('./use-session-starter', () => ({ useSessionStarter: () => ({ element: null, start: mockStart }) }));
jest.mock('./start-confirm', () => jest.requireActual('./start-confirm.tsx'));
jest.mock('react-native-gesture-handler/ReanimatedSwipeable', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const { View } = jest.requireActual('react-native') as typeof import('react-native');
  return { __esModule: true, default: React.forwardRef(function MockSwipeable({ children, renderLeftActions, renderRightActions, enabled, testID, onSwipeableWillOpen }: {
    children: React.ReactNode; renderLeftActions?: (...args: unknown[]) => React.ReactNode; renderRightActions?: (...args: unknown[]) => React.ReactNode; enabled: boolean; testID: string; onSwipeableWillOpen?: (direction: string) => void;
  }, ref: React.Ref<unknown>) {
    React.useImperativeHandle(ref, () => ({ close: jest.fn(), reset: jest.fn() }));
    const value = { value: mockSwipeDistance };
    return <View testID={testID} {...{ onSwipeableWillOpen }}>{children}{enabled ? <>{renderLeftActions?.(value, value)}{renderRightActions?.(value, value)}</> : null}</View>;
  }) };
});
jest.mock('expo-router', () => {
  const { Pressable } = jest.requireActual('react-native') as typeof import('react-native');
  const Toolbar = Object.assign(({ children }: { children: React.ReactNode }) => children, {
    Button: ({ accessibilityLabel, disabled, onPress }: { accessibilityLabel: string; disabled: boolean; onPress: () => void }) =>
      <Pressable accessibilityLabel={accessibilityLabel} accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} />,
  });
  return { useFocusEffect: () => undefined, useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn() }),
    Stack: { Toolbar, Screen: ({ options }: { options: { headerRight?: () => React.ReactNode } }) => { mockHeaderOptions(options); return options.headerRight?.() ?? null; } } };
});
jest.mock('@/api', () => ({
  duplicateMobileTrainingRoutine: (...args: unknown[]) => mockDuplicate(...args),
  reorderMobileTrainingRoutines: (...args: unknown[]) => mockOrder(...args),
  fetchRoutineDetail: (...args: unknown[]) => mockDetail(...args),
  createMobileTrainingRoutine: (...args: unknown[]) => mockCreate(...args),
  fetchMobileTrainingRoutines: (...args: unknown[]) => mockFetch(...args),
  setMobileTrainingRoutineStatus: (...args: unknown[]) => mockSetStatus(...args),
  useApiResource: (...args: unknown[]) => mockUseApiResource(...args),
  useMobileApi: () => ({ client: { request: jest.fn() } }),
}));

const routines = [
  { id: '22222222-2222-4222-8222-222222222222', name: 'LEGS', color: 'green' as const, order: 2, isActive: true, exerciseCount: 6, setCount: 18 },
  { id: '11111111-1111-4111-8111-111111111111', name: 'PUSH', color: 'violet' as const, order: 1, isActive: true, exerciseCount: 7, setCount: 21 },
  { id: '33333333-3333-4333-8333-333333333333', name: 'OLD', color: 'orange' as const, order: 3, isActive: false, exerciseCount: 3, setCount: 9 },
];
function fixture(overrides: Partial<MobileTrainingRoutinesResponse> = {}): MobileTrainingRoutinesResponse {
  return { routines: { status: 'ok', data: [...routines].sort((a, b) => a.order - b.order) }, listVersion: { status: 'ok', data: 7 }, initialPlan: { status: 'ok', data: { imported: true, routinesFound: 3 } }, ...overrides };
}
function readyState(data = fixture()) {
  return { status: 'ready' as const, current: { confirmedAt: 1, data }, refreshing: false, trigger: 'initial' as const,
    result: { status: 'ok' as const, data, meta: { durationMs: 12, httpStatus: 200, outcome: 'ok' as const } } };
}
function renderScreen(options: { archivedOnly?: boolean; createIdempotencyKey?: () => string; dark?: boolean } = {}) {
  return render(<SafeAreaProvider initialMetrics={{ frame: { height: 844, width: 390, x: 0, y: 0 }, insets: { bottom: 34, left: 0, right: 0, top: 47 } }}>
    <OwnlevelThemeProvider initialMode={options.dark ? 'dark' : 'light'}><RoutinesScreen archivedOnly={options.archivedOnly} createIdempotencyKey={options.createIdempotencyKey} /></OwnlevelThemeProvider>
  </SafeAreaProvider>);
}
function pickMenu(text: string) {
  const buttons = jest.mocked(Alert.alert).mock.calls.at(-1)?.[2];
  act(() => buttons?.find(button => button.text === text)?.onPress?.());
}
function archive(view: ReturnType<typeof renderScreen>, name = 'PUSH') {
  fireEvent(view.getByRole('button', { name: new RegExp(`Abrir rutina ${name}`) }), 'accessibilityAction', { nativeEvent: { actionName: 'status' } });
}
function statusResult(isActive: boolean) {
  return { status: 'ok', data: { routine: { id: routines[1].id, isActive, updatedAt: '2026-10-12T12:00:00Z' } } };
}

  beforeEach(() => {
    jest.restoreAllMocks();
    mockSwipeDistance = 0;
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    mockDuplicate.mockReset(); mockDetail.mockReset(); mockOrder.mockReset();
    mockCreate.mockReset(); mockFetch.mockReset(); mockRefresh.mockReset(); mockSetStatus.mockReset(); mockUseApiResource.mockReset(); mockPush.mockReset(); mockStart.mockReset();
    mockRefresh.mockResolvedValue(undefined);
    mockUseApiResource.mockReturnValue({ refresh: mockRefresh, state: readyState() });
  });

describe('routine library', () => {


  it('preserves loading, unavailable and stale states', () => {
    mockUseApiResource.mockReturnValue({ refresh: mockRefresh, state: { status: 'loading' } });
    const loading = renderScreen(); expect(loading.getByTestId('routines-loading')).toBeTruthy(); loading.unmount();
    mockUseApiResource.mockReturnValue({ refresh: mockRefresh, state: { status: 'unavailable' } });
    const unavailable = renderScreen(); expect(unavailable.getByTestId('routines-unavailable')).toBeTruthy(); expect(unavailable.queryByText('No tenés rutinas activas.')).toBeNull(); unavailable.unmount();
    mockUseApiResource.mockReturnValue({ refresh: mockRefresh, state: { status: 'unavailable', previous: { data: fixture() } } });
    const stale = renderScreen(); expect(stale.getByTestId('routines-stale')).toBeTruthy(); expect(stale.getByText('PUSH')).toBeTruthy();
  });

  it.each([false, true])('shows counts and sorted rows, with no strip for null (dark=%s)', dark => {
    mockUseApiResource.mockReturnValue({ refresh: mockRefresh, state: readyState(fixture({ routines: { status: 'ok', data: [...routines].sort((a, b) => a.order - b.order).map(routine => routine.name === 'LEGS' ? { ...routine, color: null } : routine) } })) });
    const view = renderScreen({ dark });
    expect(view.getAllByTestId('routine-name').map(node => node.props.children)).toEqual(['PUSH', 'LEGS']);
    expect(view.getByText('7 ejercicios · 21 series')).toBeTruthy(); expect(view.getByText('2')).toBeTruthy();
    expect(view.queryByTestId(`routine-color-${routines[0].id}-none`)).toBeNull();
    expect(view.queryByText('Opciones avanzadas')).toBeNull(); expect(view.queryByText('Restaurar plan inicial')).toBeNull();
  });

  it('gives hosted rows a measured full width and positive stripe height', async () => {
    const view = renderScreen();
    fireEvent(view.getByTestId(`routine-row-${routines[1].id}`), 'layout', { nativeEvent: { layout: { width: 358, height: 82, x: 0, y: 0 } } });
    expect(view.getByRole('button', { name: /Abrir rutina PUSH/ })).toHaveStyle({ width: 358 });
    expect(view.getByTestId(`routine-color-${routines[1].id}-violet`, { includeHiddenElements: true })).toHaveStyle({ width: 4, height: 44 });
    await act(async () => undefined);
  });

  it('uses the current native large-title option and a transparent iOS header', async () => {
    renderScreen();
    expect(mockHeaderOptions).toHaveBeenLastCalledWith(expect.objectContaining({
      title: 'Rutinas', headerLargeTitleEnabled: true, headerStyle: { backgroundColor: 'transparent' }, headerLargeStyle: { backgroundColor: 'transparent' },
    }));
    await act(async () => undefined);
  });

  it('keeps a failed list distinct from an empty list in both routes', () => {
    for (const archivedOnly of [false, true]) {
      mockUseApiResource.mockReturnValue({ refresh: mockRefresh, state: readyState(fixture({ routines: { status: 'unavailable' } })) });
      const view = renderScreen({ archivedOnly });
      expect(view.getByText('No pudimos cargar la lista de rutinas.')).toBeTruthy();
      expect(view.queryByText('No tenés rutinas archivadas.')).toBeNull(); expect(view.queryByText('No tenés rutinas activas.')).toBeNull(); view.unmount();
    }
  });

  it('opens Archivadas as a route and shows only archived rows there', () => {
    const active = renderScreen(); fireEvent.press(active.getByRole('button', { name: 'Archivadas, 1' }));
    expect(mockPush).toHaveBeenCalledWith('/(tabs)/train/routines/archived'); active.unmount();
    const archived = renderScreen({ archivedOnly: true });
    expect(archived.getByText('OLD')).toBeTruthy(); expect(archived.queryByText('PUSH')).toBeNull(); expect(archived.queryByText('ARCHIVADA')).toBeNull();
    expect(archived.queryByRole('button', { name: 'Empezar' })).toBeNull(); expect(archived.queryByRole('button', { name: 'Nueva rutina' })).toBeNull();
  });

  it('renders the real archived empty state', () => {
    mockUseApiResource.mockReturnValue({ refresh: mockRefresh, state: readyState(fixture({ routines: { status: 'ok', data: [] } })) });
    expect(renderScreen({ archivedOnly: true }).getByText('No tenés rutinas archivadas.')).toBeTruthy();
  });

  it('archives immediately and offers undo after confirmation, including refresh failure', async () => {
    mockSetStatus.mockResolvedValueOnce(statusResult(false)).mockResolvedValueOnce(statusResult(true));
    const view = renderScreen(); archive(view);
    expect(Alert.alert).not.toHaveBeenCalled();
    await waitFor(() => expect(view.getByText('PUSH archivada')).toBeTruthy());
    expect(view.queryByText('PUSH')).toBeNull();
    fireEvent.press(view.getByRole('button', { name: 'Deshacer archivado' }));
    await waitFor(() => expect(view.getByText('PUSH restaurada')).toBeTruthy());
    expect(mockSetStatus.mock.calls.map(call => call.slice(1))).toEqual([[routines[1].id, false], [routines[1].id, true]]);
    expect(view.getByText('PUSH')).toBeTruthy();
  });

  it('never claims success on an ambiguous archive and refreshes instead of retrying the write', async () => {
    mockSetStatus.mockResolvedValue({ status: 'unavailable', reason: 'network' });
    const view = renderScreen(); archive(view);
    await waitFor(() => expect(view.getByText(/No pudimos confirmar el cambio/)).toBeTruthy());
    expect(view.queryByRole('button', { name: 'Deshacer archivado' })).toBeNull(); expect(view.getByText('PUSH')).toBeTruthy();
    expect(mockRefresh).toHaveBeenCalled(); expect(mockSetStatus).toHaveBeenCalledTimes(1);
  });

  it('reports a failed undo and keeps the confirmed archived status', async () => {
    mockSetStatus.mockResolvedValueOnce(statusResult(false)).mockResolvedValueOnce({ status: 'unavailable', reason: 'server' });
    const view = renderScreen(); archive(view); await waitFor(() => expect(view.getByText('PUSH archivada')).toBeTruthy());
    fireEvent.press(view.getByRole('button', { name: 'Deshacer archivado' }));
    await waitFor(() => expect(view.getByText(/No pudimos confirmar el cambio/)).toBeTruthy()); expect(view.queryByText('PUSH')).toBeNull();
  });

  it('blocks all row mutations while another write is in flight', async () => {
    let finish: ((result: unknown) => void) | undefined;
    mockSetStatus.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const view = renderScreen(); archive(view); archive(view, 'LEGS');
    expect(mockSetStatus).toHaveBeenCalledTimes(1); expect(view.getByRole('button', { name: 'Nueva rutina' })).toBeDisabled();
    await act(async () => finish?.(statusResult(false)));
  });

  it('long press exposes actions and changing color opens the editor identity modal', () => {
    const view = renderScreen(); fireEvent(view.getByRole('button', { name: /Abrir rutina PUSH/ }), 'longPress');
    const menu = within(view.getByTestId('routine-menu'));
    for (const name of ['Empezar entrenamiento', 'Editar rutina', 'Duplicar', 'Cambiar color', 'Archivar', 'Cancelar']) expect(menu.getByRole('button', { name })).toBeTruthy();
    expect(menu.getByText('Duplicar')).toBeTruthy();
    fireEvent.press(menu.getByRole('button', { name: 'Cambiar color' })); expect(mockPush).toHaveBeenCalledWith({ pathname: '/(tabs)/train/routines/[id]', params: { id: routines[1].id, editIdentity: '1' } });
  });

  it('opens the editor on tap without writes', () => {
    const view = renderScreen(); fireEvent.press(view.getByRole('button', { name: /Abrir rutina PUSH/ }));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/(tabs)/train/routines/[id]', params: { id: routines[1].id } }); expect(mockSetStatus).not.toHaveBeenCalled();
  });

  it.each([false, true])('keeps the pressed row opaque so swipe actions cannot bleed through (dark=%s)', dark => {
    const view = renderScreen({ dark });
    let row = view.getByRole('button', { name: /Abrir rutina PUSH/ }).parent;
    while (row && typeof row.props.style !== 'function') row = row.parent;
    expect(row).not.toBeNull();
    const style = StyleSheet.flatten(row!.props.style({ pressed: true }));
    expect(style.opacity ?? 1).toBe(1);
    expect(style.backgroundColor).toBe(dark ? '#27272A' : '#EAE7DF');
  });

  it('requires confirmation before passing a swipe action to the shared starter', async () => {
    const view = renderScreen(); fireEvent.press(view.getAllByRole('button', { name: 'Empezar' })[0]);
    expect(mockStart).not.toHaveBeenCalled(); pickMenu('Empezar'); expect(mockStart).toHaveBeenCalledWith({ routineId: routines[1].id });
    await act(async () => undefined);
  });

  it('a partial swipe reveals the action without committing it', async () => {
    mockSwipeDistance = 80;
    jest.spyOn(Reanimated, 'useAnimatedReaction').mockImplementation(((prepare: () => boolean, reaction: (value: boolean) => void) => reaction(prepare())) as never);
    const view = renderScreen();
    fireEvent(view.getByTestId(`routine-swipe-${routines[1].id}`), 'swipeableWillOpen', 'left');
    expect(mockSetStatus).not.toHaveBeenCalled(); expect(mockStart).not.toHaveBeenCalled(); expect(Alert.alert).not.toHaveBeenCalled();
    await act(async () => undefined);
  });

  it('a full left swipe archives and a full right swipe only asks to start', async () => {
    mockSwipeDistance = 280;
    jest.spyOn(Reanimated, 'useAnimatedReaction').mockImplementation(((prepare: () => boolean, reaction: (value: boolean) => void) => reaction(prepare())) as never);
    mockSetStatus.mockResolvedValue(statusResult(false));
    const archiveView = renderScreen();
    fireEvent(archiveView.getByTestId(`routine-swipe-${routines[1].id}`), 'swipeableWillOpen', 'left');
    await waitFor(() => expect(mockSetStatus).toHaveBeenCalledWith(expect.anything(), routines[1].id, false));
    expect(Alert.alert).not.toHaveBeenCalled(); archiveView.unmount();
    const startView = renderScreen();
    fireEvent(startView.getByTestId(`routine-swipe-${routines[1].id}`), 'swipeableWillOpen', 'right');
    expect(mockStart).not.toHaveBeenCalled(); pickMenu('Empezar');
    expect(mockStart).toHaveBeenCalledWith({ routineId: routines[1].id });
    await act(async () => undefined);
  });

  it('restores an archived routine through the existing desired-state write', async () => {
    mockSetStatus.mockResolvedValue(statusResult(true)); const view = renderScreen({ archivedOnly: true }); archive(view, 'OLD');
    await waitFor(() => expect(mockSetStatus).toHaveBeenCalledWith(expect.anything(), routines[2].id, true)); expect(Alert.alert).not.toHaveBeenCalled();
  });

  it('enables create only for a valid name and keeps the idempotency key on retry', async () => {
    mockCreate.mockResolvedValueOnce({ status: 'unavailable', reason: 'network' }).mockResolvedValueOnce({ status: 'ok', data: { routine: routines[0] } });
    const key = jest.fn(() => 'stable-key'); const view = renderScreen({ createIdempotencyKey: key });
    fireEvent.press(view.getByRole('button', { name: 'Nueva rutina' })); expect(view.getByRole('button', { name: 'Crear rutina' })).toBeDisabled();
    fireEvent.changeText(view.getByLabelText('Nombre de la rutina'), '  '); expect(view.getByRole('button', { name: 'Crear rutina' })).toBeDisabled();
    fireEvent.changeText(view.getByLabelText('Nombre de la rutina'), 'x'.repeat(121)); expect(view.getByRole('button', { name: 'Crear rutina' })).toBeDisabled();
    fireEvent.changeText(view.getByLabelText('Nombre de la rutina'), '  Push B  ');
    expect(view.getByText('Push B')).toBeTruthy(); fireEvent.press(view.getByRole('button', { name: 'Crear rutina' }));
    await waitFor(() => expect(view.getByText(/No pudimos confirmar la creación/)).toBeTruthy());
    fireEvent.press(view.getByRole('button', { name: 'Crear rutina' })); await waitFor(() => expect(mockCreate).toHaveBeenCalledTimes(2));
    expect(mockCreate.mock.calls.map(call => call[1])).toEqual([{ name: 'Push B', color: 'violet', idempotencyKey: 'stable-key' }, { name: 'Push B', color: 'violet', idempotencyKey: 'stable-key' }]); expect(key).toHaveBeenCalledTimes(1);
  });

  it('uses twelve 48pt color targets and prevents double creation', async () => {
    let finish: ((result: unknown) => void) | undefined;
    mockCreate.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const view = renderScreen(); fireEvent.press(view.getByRole('button', { name: 'Nueva rutina' }));
    expect(view.getAllByRole('radio')).toHaveLength(12); expect(view.getAllByTestId('routine-color-row')).toHaveLength(2);
    for (const target of view.getAllByRole('radio')) expect(target).toHaveStyle({ height: 48, width: 48 });
    fireEvent.changeText(view.getByLabelText('Nombre de la rutina'), 'Push B'); fireEvent.press(view.getByRole('button', { name: 'Crear rutina' }));
    expect(view.getByRole('button', { name: 'Creando…' })).toBeDisabled(); fireEvent.press(view.getByRole('button', { name: 'Creando…' })); expect(mockCreate).toHaveBeenCalledTimes(1);
    await act(async () => finish?.({ status: 'unavailable', reason: 'network' }));
  });

  it('expires undo four seconds after it becomes available', async () => {
    jest.useFakeTimers();
    try {
      mockSetStatus.mockResolvedValue(statusResult(false)); const view = renderScreen(); archive(view);
      await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });
      expect(view.getByRole('button', { name: 'Deshacer archivado' })).toBeTruthy();
      act(() => jest.advanceTimersByTime(3_999)); expect(view.getByRole('button', { name: 'Deshacer archivado' })).toBeTruthy();
      act(() => jest.advanceTimersByTime(1)); expect(view.queryByRole('button', { name: 'Deshacer archivado' })).toBeNull();
      view.unmount();
    } finally { jest.useRealTimers(); }
  });

  it('supports pull to refresh with confirmed rows visible', () => {
    const view = renderScreen(); fireEvent(view.UNSAFE_getByType(RefreshControl), 'refresh'); expect(view.getByText('PUSH')).toBeTruthy(); expect(mockRefresh).toHaveBeenCalledTimes(1);
  });
});

describe('routine writes with real resource reads', () => {
  const meta = { durationMs: 1, httpStatus: 200, outcome: 'ok' as const };
  const read = (data = fixture()) => ({ status: 'ok', data, meta });
  beforeEach(() => {
    jest.restoreAllMocks();
    mockSwipeDistance = 0;
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    mockFetch.mockReset(); mockSetStatus.mockReset(); mockStart.mockReset();
    const resource = jest.requireActual('@/api/resource') as typeof import('@/api/resource');
    mockUseApiResource.mockImplementation(resource.useApiResource as never);
  });

  it('keeps confirmed archival and the stale warning when the post-write read fails', async () => {
    mockFetch.mockResolvedValueOnce(read()).mockResolvedValue({ status: 'unavailable', reason: 'network', meta });
    mockSetStatus.mockResolvedValue(statusResult(false));
    const view = renderScreen(); await waitFor(() => expect(view.getByText('PUSH')).toBeTruthy()); archive(view);
    await waitFor(() => expect(view.getByRole('button', { name: 'Deshacer archivado' })).toBeTruthy());
    expect(view.getByTestId('routines-stale')).toBeTruthy(); expect(view.queryByText('PUSH')).toBeNull(); expect(view.getByText('LEGS')).toBeTruthy();
    expect(mockSetStatus).toHaveBeenCalledTimes(1); expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('waits for an older coalesced read and then fetches post-mutation server truth', async () => {
    let finishOldRead: ((value: unknown) => void) | undefined;
    mockFetch.mockResolvedValueOnce(read()).mockReturnValueOnce(new Promise(resolve => { finishOldRead = resolve; }))
      .mockResolvedValueOnce(read(fixture({ routines: { status: 'ok', data: routines.map(routine => routine.id === routines[1].id ? { ...routine, isActive: false } : routine) } })));
    mockSetStatus.mockResolvedValue(statusResult(false));
    const view = renderScreen(); await waitFor(() => expect(view.getByText('PUSH')).toBeTruthy());
    fireEvent(view.UNSAFE_getByType(RefreshControl), 'refresh'); archive(view);
    await waitFor(() => expect(mockSetStatus).toHaveBeenCalledTimes(1));
    expect(view.queryByRole('button', { name: 'Deshacer archivado' })).toBeNull();
    await act(async () => finishOldRead?.(read()));
    await waitFor(() => expect(view.getByRole('button', { name: 'Deshacer archivado' })).toBeTruthy());
    expect(mockFetch).toHaveBeenCalledTimes(3); expect(view.queryByText('PUSH')).toBeNull(); expect(view.getByText('LEGS')).toBeTruthy();
  });
});

const copyDetail = (name = 'PUSH', color: string | null = 'sand') => ({
  status: 'ok', data: { kind: 'detail', detail: { routine: {
    id: routines[1].id, name, color, isActive: true, updatedAt: '2026-10-12T12:00:00.123456Z', templateVersion: 9,
  }, items: [{ targets: { sets: [{}, {}] } }, { targets: { sets: [{}] } }] } },
});
function duplicate(view: ReturnType<typeof renderScreen>, name = 'PUSH') {
  fireEvent(view.getByRole('button', { name: new RegExp(`Abrir rutina ${name}`) }), 'accessibilityAction', { nativeEvent: { actionName: 'duplicate' } });
}
function moveDown(view: ReturnType<typeof renderScreen>, name = 'PUSH') {
  fireEvent(view.getByLabelText(`Ordenar ${name}`), 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
}

it('opens a duplication using fresh detail, editable name/color and real template counts', async () => {
  mockDetail.mockResolvedValue(copyDetail('PUSH actual'));
  mockDuplicate.mockResolvedValue({ status: 'ok', data: { routine: { ...routines[1], id: '44444444-4444-4444-8444-444444444444', name: 'PUSH B' } } });
  const view = renderScreen({ createIdempotencyKey: () => 'duplicate-key' }); duplicate(view);
  await waitFor(() => expect(view.getByText('Duplicar PUSH actual')).toBeTruthy());
  expect(view.getByLabelText('Nombre de la rutina').props.value).toBe('PUSH actual copia');
  expect(view.getByText('2 ejercicios · 3 series')).toBeTruthy();
  expect(view.getByText('Se copian los 2 ejercicios con sus series. PUSH actual queda igual.')).toBeTruthy();
  expect(view.getByRole('radio', { name: 'arena' }).props.accessibilityState.checked).toBe(true);
  fireEvent.changeText(view.getByLabelText('Nombre de la rutina'), 'PUSH B');
  fireEvent.press(view.getByRole('radio', { name: 'piedra' }));
  fireEvent.press(view.getByRole('button', { name: 'Duplicar rutina' }));
  await waitFor(() => expect(view.getByText('Rutina duplicada')).toBeTruthy());
  expect(mockDuplicate.mock.calls[0]?.slice(1)).toEqual([routines[1].id, {
    name: 'PUSH B', color: 'stone', idempotencyKey: 'duplicate-key', expectedUpdatedAt: '2026-10-12T12:00:00.123456Z', expectedTemplateVersion: 9,
  }]);
  expect(view.getAllByTestId('routine-name').map(node => node.props.children)).toEqual(['PUSH', 'PUSH B', 'LEGS']);
  expect(mockCreate).not.toHaveBeenCalled(); expect(mockSetStatus).not.toHaveBeenCalled(); expect(mockStart).not.toHaveBeenCalled();
});

it.each([null, 'graphite'])('duplicates an archived routine with its original color %s', async color => {
  const result = copyDetail('OLD', color); result.data.detail.routine.id = routines[2].id;
  result.data.detail.routine.isActive = false;
  mockDetail.mockResolvedValue(result); mockDuplicate.mockResolvedValue({ status: 'ok', data: { routine: { ...routines[2], isActive: true } } });
  const view = renderScreen({ archivedOnly: true }); duplicate(view, 'OLD');
  await waitFor(() => expect(view.getByText('Duplicar OLD')).toBeTruthy());
  fireEvent.press(view.getByRole('button', { name: 'Duplicar rutina' }));
  await waitFor(() => expect(mockDuplicate).toHaveBeenCalledTimes(1));
  expect(mockDuplicate.mock.calls[0]?.[2]).toMatchObject({ name: 'OLD copia', color });
});

it('never opens a duplication sheet with fabricated data when detail fails', async () => {
  mockDetail.mockResolvedValue({ status: 'unavailable', reason: 'server' });
  const view = renderScreen(); duplicate(view);
  await waitFor(() => expect(view.getByText(/No pudimos cargar la rutina para copiarla/)).toBeTruthy());
  expect(view.queryByTestId('create-routine-sheet')).toBeNull(); expect(mockDuplicate).not.toHaveBeenCalled();
});

it('keeps duplication retries idempotent and blocks other mutations during a pending request', async () => {
  const key = jest.fn(() => 'retry-copy'); mockDetail.mockResolvedValue(copyDetail());
  let finish: ((value: unknown) => void) | undefined;
  mockDuplicate.mockReturnValueOnce(new Promise(resolve => { finish = resolve; })).mockResolvedValueOnce({ status: 'unavailable', reason: 'network' });
  const view = renderScreen({ createIdempotencyKey: key }); duplicate(view);
  await waitFor(() => expect(view.getByRole('button', { name: 'Duplicar rutina' })).toBeTruthy());
  fireEvent.press(view.getByRole('button', { name: 'Duplicar rutina' }));
  expect(view.getByRole('button', { name: 'Duplicando…' })).toBeDisabled();
  archive(view, 'LEGS'); expect(mockSetStatus).not.toHaveBeenCalled();
  await act(async () => finish?.({ status: 'unavailable', reason: 'network' }));
  fireEvent.press(view.getByRole('button', { name: 'Duplicar rutina' }));
  await waitFor(() => expect(mockDuplicate).toHaveBeenCalledTimes(2));
  expect(mockDuplicate.mock.calls[1]?.[2]).toEqual(mockDuplicate.mock.calls[0]?.[2]); expect(key).toHaveBeenCalledTimes(1);
});

it.each([false, true])('hides ordering for fewer than two active routines and archived route (%s)', archivedOnly => {
  mockUseApiResource.mockReturnValue({ refresh: mockRefresh, state: readyState(fixture({ routines: { status: 'ok', data: [routines[1], routines[2]] } })) });
  expect(renderScreen({ archivedOnly }).queryByRole('button', { name: 'Ordenar rutinas' })).toBeNull();
});

it('requires a confirmed list version before entering order mode', async () => {
  mockUseApiResource.mockReturnValue({ refresh: mockRefresh, state: readyState(fixture({ listVersion: undefined })) });
  const view = renderScreen(); fireEvent.press(view.getByRole('button', { name: 'Ordenar rutinas' }));
  expect(view.queryByTestId('routine-order-list')).toBeNull(); expect(mockOrder).not.toHaveBeenCalled();
  expect(view.getByText('Actualizá la lista antes de ordenar las rutinas.')).toBeTruthy();
  await waitFor(() => expect(mockRefresh).toHaveBeenCalled());
});

it.each([false, true])('keeps an optimistic order and sends exact IDs, server version and one intent on Listo (dark=%s)', async dark => {
  let finish: ((value: unknown) => void) | undefined;
  mockOrder.mockReturnValue(new Promise(resolve => { finish = resolve; }));
  const view = renderScreen({ dark, createIdempotencyKey: () => 'order-key' });
  fireEvent.press(view.getByRole('button', { name: 'Ordenar rutinas' }));
  expect(view.queryByRole('button', { name: 'Nueva rutina' })).toBeNull();
  expect(view.queryByText('Archivadas')).toBeNull();
  expect(view.queryByRole('button', { name: /Abrir rutina/ })).toBeNull();
  moveDown(view);
  expect(view.getByLabelText('Ordenar PUSH').props.accessibilityValue.now).toBe(2);
  expect(mockOrder).not.toHaveBeenCalled();
  fireEvent.press(view.getByRole('button', { name: 'Guardar orden' }));
  expect(view.getByRole('button', { name: 'Guardar orden' })).toBeDisabled();
  fireEvent.press(view.getByRole('button', { name: 'Guardar orden' }));
  expect(mockOrder).toHaveBeenCalledTimes(1);
  expect(mockOrder.mock.calls[0]?.[1]).toEqual({ routineIds: [routines[0].id, routines[1].id], expectedListVersion: 7, idempotencyKey: 'order-key' });
  await act(async () => finish?.({ status: 'ok', data: { routineIds: [routines[0].id, routines[1].id], listVersion: 9 } }));
  expect(view.getByText('Orden guardado')).toBeTruthy();
  expect(view.getAllByTestId('routine-name').map(node => node.props.children)).toEqual(['LEGS', 'PUSH']);
});

it.each(['conflict', 'unavailable'])('rolls back an unconfirmed order to server rows and reads again after %s', async status => {
  mockOrder.mockResolvedValue(status === 'conflict' ? { status, code: 'ROUTINE_LIST_CHANGED' } : { status, reason: 'network' });
  const view = renderScreen(); fireEvent.press(view.getByRole('button', { name: 'Ordenar rutinas' })); moveDown(view);
  await act(async () => { fireEvent.press(view.getByRole('button', { name: 'Guardar orden' })); });
  expect(mockOrder).toHaveBeenCalledTimes(1);
  await waitFor(() => expect(view.queryByTestId('routine-order-list')).toBeNull());
  expect(view.getAllByTestId('routine-name').map(node => node.props.children)).toEqual(['PUSH', 'LEGS']);
  expect(mockRefresh).toHaveBeenCalled(); expect(mockOrder).toHaveBeenCalledTimes(1);
  expect(view.getByText(status === 'conflict' ? /La lista cambió/ : /No pudimos confirmar el orden/)).toBeTruthy();
});

it('moves via the real JS gesture and preserves its recognizer across React renders', async () => {
  const view = renderScreen(); fireEvent.press(view.getByRole('button', { name: 'Ordenar rutinas' }));
  for (const row of routines.filter(row => row.isActive)) fireEvent(view.getByTestId(`order-row-${row.id}`), 'layout', { nativeEvent: { layout: { height: 76 } } });
  const key = `order-drag-${routines[1].id}`, gesture = getByGestureTestId(key);
  const send = (state: number, oldState: number | undefined, dy: number) => DeviceEventEmitter.emit(oldState === undefined ? 'onGestureHandlerEvent' : 'onGestureHandlerStateChange', {
    handlerTag: getByGestureTestId(key).handlerTag, state, ...(oldState === undefined ? {} : { oldState }),
    translationY: dy, translationX: 0, absoluteY: 350 + dy, absoluteX: 300, x: 20, y: 20, velocityX: 0, velocityY: 0, numberOfPointers: 1,
  });
  act(() => send(State.BEGAN, State.UNDETERMINED, 0)); act(() => send(State.ACTIVE, State.BEGAN, 0));
  expect(view.UNSAFE_getByType(ScrollView).props.scrollEnabled).toBe(false);
  expect(view.getByRole('button', { name: 'Guardar orden' })).toBeDisabled();
  act(() => send(State.ACTIVE, undefined, 65));
  expect(getByGestureTestId(key)).toBe(gesture);
  expect(view.getByTestId(`order-row-${routines[1].id}`)).toHaveStyle({ transform: [{ translateY: 65 }], shadowOpacity: 0.16 });
  expect(view.getByLabelText('Ordenar PUSH').props.accessibilityValue.now).toBe(2);
  act(() => send(State.END, State.ACTIVE, 65));
  expect(view.UNSAFE_getByType(ScrollView).props.scrollEnabled).toBe(true);
  expect(mockOrder).not.toHaveBeenCalled();
  await act(async () => undefined);
});

it('restores the pre-drag draft on a cancelled gesture', async () => {
  const view = renderScreen(); fireEvent.press(view.getByRole('button', { name: 'Ordenar rutinas' }));
  act(() => fireGestureHandler(getByGestureTestId(`order-drag-${routines[1].id}`), [
    { state: State.BEGAN }, { state: State.ACTIVE, translationY: 0, absoluteY: 350 },
    { state: State.ACTIVE, translationY: 65, absoluteY: 415 }, { state: State.CANCELLED, translationY: 65, absoluteY: 415 },
  ]));
  expect(view.getByLabelText('Ordenar PUSH').props.accessibilityValue.now).toBe(1);
  expect(view.UNSAFE_getByType(ScrollView).props.scrollEnabled).toBe(true);
  await act(async () => undefined);
});

it.each([false, true])('does not scroll when grabbing a handle before viewport measurement or away from edges (dark=%s)', async dark => {
  jest.useFakeTimers();
  try {
    const scrollTo = jest.spyOn(ScrollView.prototype, 'scrollTo').mockImplementation(() => undefined);
    const view = renderScreen({ dark });
    jest.spyOn(ScrollView.prototype, 'getNativeScrollRef').mockReturnValue({ measureInWindow: (callback: (x: number, y: number, width: number, height: number) => void) => callback(0, 0, 390, 300) } as ReturnType<ScrollView['getNativeScrollRef']>);
    fireEvent(view.getByTestId('routines-screen'), 'contentSizeChange', 390, 1200);
    fireEvent.press(view.getByRole('button', { name: 'Ordenar rutinas' }));
    const key = `order-drag-${routines[1].id}`;
    const send = (state: number, oldState?: number) => DeviceEventEmitter.emit(oldState === undefined ? 'onGestureHandlerEvent' : 'onGestureHandlerStateChange', {
      handlerTag: getByGestureTestId(key).handlerTag, state, ...(oldState === undefined ? {} : { oldState }),
      translationY: 0, translationX: 0, absoluteY: 350, absoluteX: 300, x: 20, y: 20, velocityX: 0, velocityY: 0, numberOfPointers: 1,
    });
    act(() => { send(State.BEGAN, State.UNDETERMINED); send(State.ACTIVE, State.BEGAN); });
    act(() => jest.advanceTimersByTime(160));
    expect(scrollTo).not.toHaveBeenCalled();
    // Fabric's event excludes the automatic iOS inset even at a negative offset.
    fireEvent.scroll(view.UNSAFE_getByType(ScrollView), { nativeEvent: {
      contentOffset: { x: 0, y: -152 }, contentInset: { top: 0, bottom: 0, left: 0, right: 0 },
      contentSize: { width: 390, height: 1200 }, layoutMeasurement: { width: 390, height: 844 },
    } });
    act(() => jest.advanceTimersByTime(160));
    expect(scrollTo).not.toHaveBeenCalled();
    expect(view.getByTestId(`order-row-${routines[1].id}`)).toHaveStyle({ transform: [{ translateY: 0 }] });
    act(() => send(State.END, State.ACTIVE));
    view.unmount();
    await act(async () => undefined);
  } finally { jest.useRealTimers(); }
});

it('scrolls down and back above zero during the same drag, then stops at the native origin', async () => {
  jest.useFakeTimers();
  try {
    const scrollTo = jest.spyOn(ScrollView.prototype, 'scrollTo').mockImplementation(() => undefined);
    const view = renderScreen();
    const scrollEvent = (y: number) => fireEvent.scroll(view.UNSAFE_getByType(ScrollView), { nativeEvent: {
      contentOffset: { x: 0, y }, contentInset: { top: 0, bottom: 0, left: 0, right: 0 },
      contentSize: { width: 390, height: 1200 }, layoutMeasurement: { width: 390, height: 844 },
    } });
    scrollEvent(-152);
    fireEvent.press(view.getByRole('button', { name: 'Ordenar rutinas' }));
    const key = `order-drag-${routines[1].id}`;
    const send = (state: number, oldState: number | undefined, dy: number, absoluteY: number) => DeviceEventEmitter.emit(oldState === undefined ? 'onGestureHandlerEvent' : 'onGestureHandlerStateChange', {
      handlerTag: getByGestureTestId(key).handlerTag, state, ...(oldState === undefined ? {} : { oldState }),
      translationY: dy, translationX: 0, absoluteY, absoluteX: 300, x: 20, y: 20, velocityX: 0, velocityY: 0, numberOfPointers: 1,
    });
    act(() => { send(State.BEGAN, State.UNDETERMINED, 0, 350); send(State.ACTIVE, State.BEGAN, 0, 350); });
    scrollEvent(100);
    act(() => { send(State.ACTIVE, undefined, 400, 750); jest.advanceTimersByTime(16); });
    expect(scrollTo).toHaveBeenLastCalledWith({ y: 112, animated: false });
    act(() => { send(State.ACTIVE, undefined, -250, 100); jest.advanceTimersByTime(16); });
    expect(scrollTo).toHaveBeenLastCalledWith({ y: 100, animated: false });
    act(() => jest.advanceTimersByTime(1000));
    expect(scrollTo).toHaveBeenLastCalledWith({ y: -152, animated: false });
    const callsAtTop = scrollTo.mock.calls.length;
    act(() => jest.advanceTimersByTime(160));
    expect(scrollTo).toHaveBeenCalledTimes(callsAtTop);
    expect(view.getByLabelText('Ordenar PUSH').props.accessibilityValue.now).toBe(1);
    act(() => send(State.END, State.ACTIVE, -250, 100));
    expect(view.UNSAFE_getByType(ScrollView).props.scrollEnabled).toBe(true);
    expect(mockOrder).not.toHaveBeenCalled();
    view.unmount();
    await act(async () => undefined);
  } finally { jest.useRealTimers(); }
});
