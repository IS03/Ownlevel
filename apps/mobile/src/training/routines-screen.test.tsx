import { act, fireEvent, render, waitFor, within } from '@testing-library/react-native';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Alert, RefreshControl, StyleSheet } from 'react-native';
import * as Reanimated from 'react-native-reanimated';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { MobileTrainingRoutinesResponse } from '@/api/routines';
import { clearConfirmedReads, invalidateConfirmedReads } from '@/api/confirmed-read-cache';
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
/** One account's client, stable across renders (the retained reading is scoped by client). */
const mockClient = { request: jest.fn() };
let mockCurrentClient: object = mockClient;
let mockRealCachedRead = false;
/** Off by default (these screen tests do not model focus); the real-cache tests treat a mounted screen as on screen. */
const mockUseFocusEffect = jest.fn<(effect: () => (() => void) | void) => void>();
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
  return { useFocusEffect: (effect: () => (() => void) | void) => mockUseFocusEffect(effect), useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn() }),
    Stack: { Toolbar, Screen: ({ options }: { options: { headerRight?: () => React.ReactNode } }) => { mockHeaderOptions(options); return options.headerRight?.() ?? null; } } };
});
// These screen tests drive the reading's state directly; the retained reading itself (ConfirmedReadCache, #303 C3a)
// is exercised with the real cache in routines-retention.test.tsx.
jest.mock('@/api/use-cached-read', () => ({
  useCachedRead: (...args: unknown[]) => {
    if (mockRealCachedRead) return (jest.requireActual('@/api/use-cached-read') as typeof import('@/api/use-cached-read')).useCachedRead(...(args as Parameters<typeof import('@/api/use-cached-read').useCachedRead>));
    const resource = mockUseApiResource(...args) as { refresh: () => Promise<void>; state: unknown };
    return { reload: resource.refresh, snapshot: () => resource.state, ...resource };
  },
}));
jest.mock('@/api', () => ({
  duplicateMobileTrainingRoutine: (...args: unknown[]) => mockDuplicate(...args),
  reorderMobileTrainingRoutines: (...args: unknown[]) => mockOrder(...args),
  fetchRoutineDetail: (...args: unknown[]) => mockDetail(...args),
  createMobileTrainingRoutine: (...args: unknown[]) => mockCreate(...args),
  fetchMobileTrainingRoutines: (...args: unknown[]) => mockFetch(...args),
  setMobileTrainingRoutineStatus: (...args: unknown[]) => mockSetStatus(...args),
  useApiResource: (...args: unknown[]) => mockUseApiResource(...args),
  useMobileApi: () => ({ client: mockCurrentClient }),
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
  // Confirmed during this visit (a list version this visit may write with).
  return { status: 'ready' as const, current: { confirmedAt: Number.MAX_SAFE_INTEGER, data }, refreshing: false, trigger: 'initial' as const,
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
    // The real retained reading (ConfirmedReadCache), as in the app.
    clearConfirmedReads(mockClient as never); mockRealCachedRead = true; mockCurrentClient = mockClient;
    mockUseFocusEffect.mockImplementation(effect => {
      (jest.requireActual('react') as typeof import('react')).useEffect(() => effect(), [effect]);
    });
  });
  afterEach(() => { mockRealCachedRead = false; mockUseFocusEffect.mockReset(); clearConfirmedReads(mockClient as never); });
  /** The API client invalidates retained readings when a write settles (client.ts); the mocked write does the same. */
  const settles = (result: unknown) => async () => { invalidateConfirmedReads(mockClient as never, `/api/mobile/v1/training/routines/${routines[1].id}`); return result; };

  it('keeps confirmed archival and the stale warning when the post-write read fails', async () => {
    mockFetch.mockResolvedValueOnce(read()).mockResolvedValue({ status: 'unavailable', reason: 'network', meta });
    mockSetStatus.mockImplementation(settles(statusResult(false)));
    const view = renderScreen(); await waitFor(() => expect(view.getByText('PUSH')).toBeTruthy()); archive(view);
    await waitFor(() => expect(view.getByRole('button', { name: 'Deshacer archivado' })).toBeTruthy());
    expect(view.getByTestId('routines-stale')).toBeTruthy(); expect(view.queryByText('PUSH')).toBeNull(); expect(view.getByText('LEGS')).toBeTruthy();
    expect(mockSetStatus).toHaveBeenCalledTimes(1); expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('drops an older pending read when the write settles and fetches post-mutation server truth; its late answer never wins', async () => {
    let finishOldRead: ((value: unknown) => void) | undefined;
    mockFetch.mockResolvedValueOnce(read()).mockReturnValueOnce(new Promise(resolve => { finishOldRead = resolve; }))
      .mockResolvedValueOnce(read(fixture({ routines: { status: 'ok', data: routines.map(routine => routine.id === routines[1].id ? { ...routine, isActive: false } : routine) } })));
    mockSetStatus.mockImplementation(settles(statusResult(false)));
    const view = renderScreen(); await waitFor(() => expect(view.getByText('PUSH')).toBeTruthy());
    fireEvent(view.UNSAFE_getByType(RefreshControl), 'refresh'); archive(view);
    const oldSignal = mockFetch.mock.calls[1][1] as AbortSignal;
    await waitFor(() => expect(view.getByRole('button', { name: 'Deshacer archivado' })).toBeTruthy());
    expect(oldSignal.aborted).toBe(true); // it may predate the write
    expect(mockFetch).toHaveBeenCalledTimes(3); expect(view.queryByText('PUSH')).toBeNull(); expect(view.getByText('LEGS')).toBeTruthy();
    await act(async () => finishOldRead?.(read())); // the pre-write answer (PUSH still active) arrives last
    expect(view.queryByText('PUSH')).toBeNull();
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });
});

describe('retained routines list (#303 C3a; real cache, simulated request counts)', () => {
  const meta = { durationMs: 1, httpStatus: 200, outcome: 'ok' as const };
  const read = (data = fixture()) => ({ status: 'ok', data, meta });
  let clock = Date.parse('2026-11-13T15:00:00.000Z');
  beforeEach(() => {
    jest.restoreAllMocks();
    mockSwipeDistance = 0;
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    [mockFetch, mockSetStatus, mockStart, mockOrder].forEach(mock => mock.mockReset());
    mockFetch.mockResolvedValue(read());
    clock = Date.parse('2026-11-13T15:00:00.000Z');
    jest.spyOn(Date, 'now').mockImplementation(() => clock);
    clearConfirmedReads(mockClient as never); mockRealCachedRead = true; mockCurrentClient = mockClient;
    mockUseFocusEffect.mockImplementation(effect => {
      (jest.requireActual('react') as typeof import('react')).useEffect(() => effect(), [effect]);
    });
  });
  afterEach(() => { mockRealCachedRead = false; mockUseFocusEffect.mockReset(); clearConfirmedReads(mockClient as never); mockCurrentClient = mockClient; });
  /** A complete visit: open Rutinas (or Archivadas), let its reading settle, leave. */
  async function visit(options: { archivedOnly?: boolean } = {}) {
    const view = renderScreen(options);
    await waitFor(() => expect(view.getByTestId(options.archivedOnly ? 'archived-routines-screen' : 'routines-screen')).toBeTruthy());
    view.unmount();
  }

  it('back within 30 s: the list shows at once with no request; after 30 s it shows and reads again', async () => {
    await visit();
    expect(mockFetch).toHaveBeenCalledTimes(1);
    clock += 20_000;
    const again = renderScreen();
    expect(again.getByText('PUSH')).toBeTruthy(); // no skeleton
    await act(async () => { await Promise.resolve(); });
    expect(mockFetch).toHaveBeenCalledTimes(1); // before C3a: 2
    again.unmount();
    clock += 15_000;
    const later = renderScreen();
    expect(later.getByText('PUSH')).toBeTruthy();
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2));
    later.unmount();
  });

  it('Rutinas and Archivadas share one reading', async () => {
    await visit();
    const archived = renderScreen({ archivedOnly: true });
    expect(archived.getByText('OLD')).toBeTruthy();
    await act(async () => { await Promise.resolve(); });
    expect(mockFetch).toHaveBeenCalledTimes(1); // before C3a: 2
    archived.unmount();
  });

  it.each([
    ['a routine created', '/api/mobile/v1/training/routines'],
    ['a routine edited (template)', `/api/mobile/v1/training/routines/${routines[1].id}/template`],
    ['a routine renamed or recolored', `/api/mobile/v1/training/routines/${routines[1].id}/identity`],
    ['a routine archived or restored', `/api/mobile/v1/training/routines/${routines[1].id}`],
    ['a routine duplicated', `/api/mobile/v1/training/routines/${routines[1].id}/duplicate`],
    ['the order saved', '/api/mobile/v1/training/routines/order'],
    ['an exercise created with routines', '/api/mobile/v1/training/exercises'],
    ['a finished session (routine targets)', '/api/mobile/v1/training/sessions/s1/finish'],
  ])('after %s anywhere, coming back within 30 s reads again', async (_name, path) => {
    await visit();
    invalidateConfirmedReads(mockClient as never, path);
    clock += 1_000;
    const again = renderScreen();
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2));
    again.unmount();
  });

  it('an unrelated write (a weight) keeps the reading', async () => {
    await visit();
    invalidateConfirmedReads(mockClient as never, '/api/mobile/v1/body/weights/2026-11-13');
    clock += 1_000;
    const again = renderScreen();
    await act(async () => { await Promise.resolve(); });
    expect(mockFetch).toHaveBeenCalledTimes(1);
    again.unmount();
  });

  it('CAS: ordering from a retained list reads it again first and sends that list version, never the retained one', async () => {
    await visit(); // listVersion 7
    clock += 5_000;
    mockFetch.mockResolvedValue(read(fixture({ listVersion: { status: 'ok', data: 8 } })));
    mockOrder.mockResolvedValue({ status: 'ok', data: { routineIds: [routines[0].id, routines[1].id], listVersion: 9 } });
    const view = renderScreen({ createIdempotencyKey: () => 'order-key' });
    await act(async () => { await Promise.resolve(); });
    expect(mockFetch).toHaveBeenCalledTimes(1); // shown from the retained reading
    await act(async () => { fireEvent.press(view.getByRole('button', { name: 'Ordenar rutinas' })); });
    await waitFor(() => expect(view.getByRole('button', { name: 'Guardar orden' })).toBeTruthy());
    expect(mockFetch).toHaveBeenCalledTimes(2); // read again before the draft
    moveDown(view);
    await act(async () => { fireEvent.press(view.getByRole('button', { name: 'Guardar orden' })); });
    expect(mockOrder.mock.calls[0]?.[1]).toEqual({ routineIds: [routines[0].id, routines[1].id], expectedListVersion: 8, idempotencyKey: 'order-key' });
    view.unmount();
  });

  it('CAS: if that read fails, no draft opens and nothing is written', async () => {
    await visit();
    clock += 5_000;
    mockFetch.mockResolvedValue({ status: 'unavailable', reason: 'network', meta });
    const view = renderScreen();
    await act(async () => { fireEvent.press(view.getByRole('button', { name: 'Ordenar rutinas' })); });
    await waitFor(() => expect(view.getByText('Actualizá la lista antes de ordenar las rutinas.')).toBeTruthy());
    expect(view.queryByRole('button', { name: 'Guardar orden' })).toBeNull();
    expect(mockOrder).not.toHaveBeenCalled();
    view.unmount();
  });

  it('a manual refresh within 30 s always reads', async () => {
    await visit();
    clock += 1_000;
    const view = renderScreen();
    await act(async () => { fireEvent(view.UNSAFE_getByType(RefreshControl), 'refresh'); });
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2));
    view.unmount();
  });

  it.each([
    ['401', { status: 'unauthorized', meta: { durationMs: 1, httpStatus: 401, outcome: 'unauthorized' } }],
    ['403', { status: 'unavailable', reason: 'server', meta: { durationMs: 1, httpStatus: 403, outcome: 'unavailable' } }],
  ])('%s: the protected list is discarded, not shown as a fallback and never reused', async (_code, denied) => {
    await visit();
    mockFetch.mockResolvedValueOnce(denied);
    clock += 1_000;
    const view = renderScreen();
    await act(async () => { fireEvent(view.UNSAFE_getByType(RefreshControl), 'refresh'); });
    await waitFor(() => expect(view.getByTestId('routines-unavailable')).toBeTruthy());
    expect(view.queryByText('PUSH')).toBeNull();
    view.unmount();
    const again = renderScreen();
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(3));
    again.unmount();
  });

  it('offline keeps the last list as stale (never fresh), is not reused, and recovers', async () => {
    await visit();
    mockFetch.mockResolvedValueOnce({ status: 'unavailable', reason: 'network', meta });
    clock += 1_000;
    const view = renderScreen();
    await act(async () => { fireEvent(view.UNSAFE_getByType(RefreshControl), 'refresh'); });
    await waitFor(() => expect(view.getByTestId('routines-stale')).toBeTruthy());
    expect(view.getByText('PUSH')).toBeTruthy();
    view.unmount();
    const again = renderScreen();
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(3));
    await waitFor(() => expect(again.queryByTestId('routines-stale')).toBeNull());
    again.unmount();
  });

  it('another account never sees this account\'s retained list', async () => {
    await visit();
    const other = { request: jest.fn() };
    mockCurrentClient = other;
    const view = renderScreen();
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2));
    expect(mockFetch.mock.calls[1][0]).toBe(other);
    view.unmount();
    clearConfirmedReads(other as never);
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

it('moves with the order handle accessibility actions and saves the draft order', async () => {
  const view = renderScreen(); fireEvent.press(view.getByRole('button', { name: 'Ordenar rutinas' }));
  expect(view.getByTestId('routine-order-list')).toBeTruthy();
  fireEvent(view.getByLabelText(`Ordenar ${routines[1].name}`), 'accessibilityAction', { nativeEvent: { actionName: 'decrement' } });
  expect(view.getByLabelText(`Ordenar ${routines[1].name}`).props.accessibilityValue).toEqual(expect.objectContaining({ now: 1 }));
});
