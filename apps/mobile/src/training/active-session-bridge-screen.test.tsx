import { act, fireEvent, render, waitFor, within } from '@testing-library/react-native';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { type ReactElement, useSyncExternalStore } from 'react';
import { AccessibilityInfo, ActionSheetIOS, Alert, AppState, DeviceEventEmitter, Modal, RefreshControl, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { State, GestureHandlerRootView } from 'react-native-gesture-handler';
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';
import Animated, { withSpring, withTiming } from 'react-native-reanimated';
import type { MobileApiClient } from '@/api/client';
import type { SessionDetailDto } from '@/api/active-session';
import { OwnlevelThemeProvider, spacing } from '@/design-system';
import { ActiveSessionController, type ActiveSessionApi } from './active-session-controller';
import { SessionDraftRepository } from './active-session-storage';
import { PostWorkoutScreen } from './post-workout-screen';
import { ActiveSessionView } from './active-session-screen';
import { EXERCISE_ID, NEXT_VERSION, SECOND_ID, SESSION_ID, testDetail, testExercise, testFinished } from './active-session-test-fixtures';
import { DRAG_DELAY, LIFT_SCALE, PRESS_SCALE } from './session-native-interactions';
import { exercisePayload } from './active-session-model';

const mockReplace = jest.fn();
const mockNavigate = jest.fn();
let mockHeaderOptions: { headerRight?: () => ReactElement; headerLeft?: () => ReactElement } = {};
const mockHeaderListeners = new Set<() => void>();
const mockSubscribeHeader = (listener: () => void) => { mockHeaderListeners.add(listener); return () => { mockHeaderListeners.delete(listener); }; };
const mockGetHeader = () => mockHeaderOptions;
const mockSetOptions = jest.fn((options: typeof mockHeaderOptions) => { mockHeaderOptions = options; mockHeaderListeners.forEach(listener => listener()); });
const mockRouter = { replace: mockReplace, navigate: mockNavigate };
const mockNavigation = { dispatch: jest.fn(), setOptions: mockSetOptions };
const mockCatalog = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockSelection = jest.fn();
const mockSuccess = jest.fn();
const mockWarning = jest.fn();
const mockTrigger = jest.fn();
// Native/UI-thread animation is exercised in Simulator; this bridge advances only after a confirmed receipt.
jest.mock('./finish-save-animation', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  return { FinishSaveAnimation: ({ confirmed, onReady }: { confirmed: boolean; onReady: () => void }) => {
    React.useEffect(() => { if (confirmed) { mockTrigger('workoutComplete'); onReady(); } }, [confirmed, onReady]);
    return null;
  } };
});
jest.mock('@/platform/haptics', () => ({ haptics: { selection: () => mockSelection(), success: () => mockSuccess(), warning: () => mockWarning() },
  triggerHaptic: (event: string) => mockTrigger(event) }));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('expo-router', () => {
  const Container = ({ children }: { children?: React.ReactNode }) => children ?? null;
  return { useLocalSearchParams: () => ({}), useRouter: () => mockRouter, useNavigation: () => mockNavigation, useFocusEffect: () => undefined,
    Stack: { Screen: () => null, Toolbar: Object.assign(Container, { Menu: Container, MenuAction: () => null }) } };
});
jest.mock('expo-router/build/react-navigation/core/usePreventRemove', () => ({ usePreventRemove: () => undefined }));
jest.mock('./routine-exercise-picker-body', () => jest.requireActual('./routine-exercise-picker-body.tsx'));
jest.mock('./session-next-options', () => jest.requireActual('./session-next-options.tsx'));
jest.mock('./active-session-native-storage', () => ({ activeSessionStorage: {} }));
jest.mock('@/api', () => ({ fetchMobileTrainingExercises: (...args: unknown[]) => mockCatalog(...args),
  useApiResource: jest.requireActual<typeof import('@/api/resource')>('@/api/resource').useApiResource }));
const meta = { durationMs: 1, httpStatus: 200, outcome: 'ok' as const };
// fireGestureHandler emits BEGAN and ACTIVE in the same tick, which the handle
// treats as an early (movement) activation, i.e. a scroll. Model the real hold.
function afterHold<T>(run: () => T): T {
  const pressed = Date.now(), spy = jest.spyOn(Date, 'now').mockReturnValueOnce(pressed).mockReturnValue(pressed + DRAG_DELAY);
  try { return run(); } finally { spy.mockRestore(); }
}
function fixture(detail: SessionDetailDto = testDetail()) {
  const store = new Map<string, string>();
  const api: ActiveSessionApi = {
    detail: jest.fn<ActiveSessionApi['detail']>().mockResolvedValue({ status: 'ok', data: detail, meta }),
    sync: jest.fn<ActiveSessionApi['sync']>().mockResolvedValue({ status: 'ok', data: { status: 'active', updatedAt: NEXT_VERSION, payload: detail.exercises[0].payload }, meta }),
    save: jest.fn<ActiveSessionApi['save']>().mockResolvedValue({ status: 'ok', data: { sessionExerciseId: EXERCISE_ID, updatedAt: NEXT_VERSION }, meta }),
    add: jest.fn<ActiveSessionApi['add']>(), remove: jest.fn<ActiveSessionApi['remove']>(),
    cancel: jest.fn<ActiveSessionApi['cancel']>().mockResolvedValue({ status: 'ok', data: { status: 'cancelled', sessionId: SESSION_ID }, meta }),
    reorder: jest.fn<ActiveSessionApi['reorder']>().mockImplementation(async input => ({ status: 'ok', data: {
      status: 'reordered', sessionId: SESSION_ID, sessionUpdatedAt: NEXT_VERSION, orderedSessionExerciseIds: input.orderedSessionExerciseIds }, meta })),
    finish: jest.fn<ActiveSessionApi['finish']>().mockImplementation(async input => ({ status: 'ok', data: testFinished(input.metadata), meta })),
  };
  const repository = new SessionDraftRepository({ getItem: async key => store.get(key) ?? null, setItem: async (key, value) => { store.set(key, value); },
    removeItem: async key => { store.delete(key); }, getAllKeys: async () => [...store.keys()] }, 'owner', SESSION_ID);
  const controller = new ActiveSessionController(api, repository);
  const client = {} as MobileApiClient;
  function Screen() {
    const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
    const header = useSyncExternalStore(mockSubscribeHeader, mockGetHeader, mockGetHeader);
    return <GestureHandlerRootView><SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 83 } }}>
      <OwnlevelThemeProvider initialMode="light"><View>{header.headerLeft?.()}{header.headerRight?.()}</View><ActiveSessionView controller={controller} state={state} client={client} /></OwnlevelThemeProvider>
    </SafeAreaProvider></GestureHandlerRootView>;
  }
  return { controller, api, repository, Screen };
}
// The session opens with every exercise collapsed; most cases work on PRESS's
// rows, so open it like the user does and start haptic counts after that tap.
function renderWithPressOpen(screen: ReactElement) {
  const view = render(screen);
  fireEvent(view.getByLabelText('Expandir PRESS'), 'accessibilityTap'); mockSelection.mockClear();
  return view;
}
describe('native active session screen', () => {
  beforeEach(() => {
    mockHeaderOptions = {}; mockSetOptions.mockClear();
    mockReplace.mockReset(); mockSelection.mockReset(); mockSuccess.mockReset(); mockWarning.mockReset(); mockTrigger.mockReset();
    jest.spyOn(ActionSheetIOS, 'showActionSheetWithOptions').mockImplementation(() => undefined);
  }); afterEach(() => { jest.restoreAllMocks(); jest.useRealTimers(); });
  it('shows loading and real unavailable/not-found states rather than a false inactive session', async () => {
    const { controller, api, Screen } = fixture(); const view = render(<Screen />);
    expect(view.getByTestId('active-session-loading')).toBeTruthy(); expect(view.getByLabelText('Volver a Entrenar')).toBeTruthy();
    (api.detail as jest.MockedFunction<ActiveSessionApi['detail']>).mockResolvedValue({ status: 'unavailable', reason: 'network', meta: { ...meta, outcome: 'unavailable' } });
    await act(async () => { await controller.refresh(); }); expect(view.getByText('No pudimos cargar la sesión')).toBeTruthy();
    (api.detail as jest.MockedFunction<ActiveSessionApi['detail']>).mockResolvedValue({ status: 'not_found', message: 'absent', meta: { ...meta, outcome: 'not_found' } });
    await act(async () => { await controller.refresh(); }); expect(view.getByText('Sesión no disponible')).toBeTruthy();
    controller.dispose();
  });
  it('opens with every exercise collapsed, including partially completed ones', async () => {
    const detail = testDetail(); detail.exercises[0].payload.sets[0].isCompleted = true;
    detail.exercises[0].payload.sets.push({ ...detail.exercises[0].payload.sets[0], setNumber: 2, isCompleted: false });
    const { controller, Screen } = fixture(detail); await controller.refresh(); const view = render(<Screen />);
    expect(view.getByLabelText('Expandir PRESS')).toBeTruthy(); expect(view.getByLabelText('Expandir ROW')).toBeTruthy();
    expect(view.queryByLabelText('Peso serie 1 de PRESS')).toBeNull(); expect(mockSelection).not.toHaveBeenCalled();
    controller.dispose();
  });
  it('renders actuals, targets/RIR and immediate completion; the finish CTA only opens the summary', async () => {
    const { controller, api, Screen } = fixture(); await controller.refresh(); const view = renderWithPressOpen(<Screen />);
    await waitFor(() => expect(view.getByLabelText('Peso serie 1 de PRESS')).toBeTruthy());
    fireEvent.changeText(view.getByLabelText('Peso serie 1 de PRESS'), '45,5');
    fireEvent(view.getByRole('checkbox', { name: 'Serie 1 completada' }), 'accessibilityTap');
    await act(async () => { await controller.flush(EXERCISE_ID); });
    expect(api.save).toHaveBeenCalledWith(EXERCISE_ID, expect.any(String), expect.objectContaining({ isCompleted: true, sets: [expect.objectContaining({ actualWeightKg: 45.5, targetRir: 2 })] }));
    expect(view.getByLabelText('RIR objetivo serie 1: 2')).toBeTruthy();
    fireEvent.press(view.getByRole('button', { name: 'Finalizar entrenamiento' }));
    expect(view.getByTestId('finish-session-sheet')).toBeTruthy(); expect(api.finish).not.toHaveBeenCalled();
    expect(view.queryByText('Descanso · PRESS')).toBeNull();
    controller.dispose();
  });
  it('keeps time visible and pins scroll controls for VoiceOver, Reduce Motion, keyboard, sheets and dialogs', async () => {
    jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(false);
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
    const listeners = new Map<string, Set<(value: boolean) => void>>();
    jest.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation((event, handler) => {
      const group = listeners.get(event) ?? new Set(); const listener = handler as unknown as (value: boolean) => void;
      group.add(listener); listeners.set(event, group);
      const subscription = DeviceEventEmitter.addListener(`session-test-${event}`, listener), remove = subscription.remove.bind(subscription);
      subscription.remove = () => { group.delete(listener); remove(); }; return subscription;
    });
    const { controller, Screen } = fixture(); await controller.refresh(); const view = renderWithPressOpen(<Screen />);
    await act(async () => {});
    const scroll = (y: number) => fireEvent.scroll(view.UNSAFE_getByType(Animated.ScrollView), { nativeEvent: { contentOffset: { y }, contentSize: { height: 2400 }, layoutMeasurement: { height: 844 } } });
    const hidden = () => view.getByTestId('session-header-actions', { includeHiddenElements: true }).props.accessibilityElementsHidden;
    scroll(300); expect(hidden()).toBe(true);
    expect(within(view.getByTestId('session-scroll-header')).getByText(/min.*series/)).toBeVisible();
    for (const [event, value] of [['screenReaderChanged', true], ['screenReaderChanged', false], ['reduceMotionChanged', true], ['reduceMotionChanged', false]] as const) {
      act(() => { listeners.get(event)?.forEach(listener => listener(value)); }); expect(hidden()).toBe(!value);
    }
    act(() => { DeviceEventEmitter.emit('keyboardDidShow', { endCoordinates: { height: 300, screenY: 544 } }); });
    scroll(330); expect(hidden()).toBe(false);
    act(() => { DeviceEventEmitter.emit('keyboardDidHide', { endCoordinates: { height: 0, screenY: 844 } }); }); expect(hidden()).toBe(true);
    fireEvent.press(view.getByRole('button', { name: 'Historial de PRESS' })); expect(hidden()).toBe(false);
    scroll(350); expect(hidden()).toBe(false);
    fireEvent.press(view.getByLabelText('Cerrar Historial')); expect(hidden()).toBe(true);
    scroll(342); expect(hidden()).toBe(false);
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    fireEvent.press(view.getByLabelText('Cancelar entrenamiento')); scroll(360); expect(hidden()).toBe(false);
    act(() => { alert.mock.calls.at(-1)?.[2]?.find(button => button.text === 'Seguir entrenando')?.onPress?.(); }); expect(hidden()).toBe(true);
    expect(within(view.getByTestId('session-scroll-header')).getByText(/min.*series/)).toBeVisible();
    controller.dispose();
  });
  it('adds with one tap, closes the picker and opens the appended exercise with its refreshed history', async () => {
    jest.useFakeTimers();
    const detail = testDetail(), added = testExercise('44444444-4444-4444-8444-444444444444', 3);
    added.nameSnapshot = 'PULLOVER';
    const { controller, api, Screen } = fixture(detail); await controller.refresh(); const view = render(<Screen />);
    mockCatalog.mockResolvedValue({ status: 'ok', data: { catalog: { status: 'ok', data: { exercises: [{ id: added.exerciseId, name: 'PULLOVER', muscleGroup: 'espalda', implement: 'Polea', weightMode: 'Peso total', isActive: true }], routines: [] } } }, meta });
    jest.mocked(api.add).mockImplementation(async () => {
      const updated = { ...detail, exercises: [...detail.exercises, added], quickHistory: { status: 'ok' as const, data: { [added.exerciseId]: [{ sessionId: SECOND_ID, logDate: '2026-10-05', completedAt: null, routineId: EXERCISE_ID, routineName: 'PULL', decision: 'maintain' as const, sets: added.payload.sets.map(set => ({ ...set, isCompleted: true })) }] } } };
      jest.mocked(api.detail).mockResolvedValue({ status: 'ok', data: updated, meta });
      return { status: 'ok', data: { status: 'added', sessionId: SESSION_ID, sessionExerciseId: added.id, exerciseId: added.exerciseId }, meta };
    });
    fireEvent.press(view.getByRole('button', { name: '+ Agregar' }));
    await waitFor(() => expect(view.getByRole('button', { name: 'PULLOVER' })).toBeTruthy());
    fireEvent.press(view.getByRole('button', { name: 'PULLOVER' }));
    await waitFor(() => expect(view.getByLabelText('Contraer PULLOVER')).toBeTruthy());
    expect(view.getByLabelText('Peso serie 1 de PULLOVER').props.value).toBe('40');
    // Advance the picker’s native confirmation delay deterministically.
    await act(async () => { await jest.advanceTimersByTimeAsync(1000); });
    expect(view.queryByLabelText('Buscar ejercicio')).toBeNull(); expect(view.getByText('PULLOVER agregado')).toBeTruthy();
    expect(view.getByRole('button', { name: 'Deshacer' })).toBeTruthy();
    expect(view.getByLabelText(/^La última vez,/)).toBeTruthy(); expect(api.add).toHaveBeenCalledTimes(1); expect(api.save).not.toHaveBeenCalled();
    controller.dispose();
  });
  it('confirms removal of completed sets and undo restores the same session exercise without a write', async () => {
    const detail = testDetail(); detail.exercises[0].payload.sets[0].isCompleted = true;
    const { controller, api, Screen } = fixture(detail); await controller.refresh(); const view = render(<Screen />); await act(async () => {});
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    fireEvent(view.getByLabelText('Expandir PRESS'), 'accessibilityAction', { nativeEvent: { actionName: 'remove' } });
    expect(alert).toHaveBeenCalledWith('¿Quitar PRESS?', expect.any(String), expect.any(Array));
    expect(view.getByTestId(`session-exercise-${EXERCISE_ID}`)).toBeTruthy();
    await act(async () => { alert.mock.calls.at(-1)?.[2]?.find(button => button.text === 'Quitar')?.onPress?.(); });
    expect(view.queryByTestId(`session-exercise-${EXERCISE_ID}`)).toBeNull();
    fireEvent.press(view.getByRole('button', { name: 'Deshacer' }));
    expect(view.getByTestId(`session-exercise-${EXERCISE_ID}`)).toBeTruthy(); expect(controller.getExercise(EXERCISE_ID)?.draft.sets[0].isCompleted).toBe(true);
    expect(api.remove).not.toHaveBeenCalled(); expect(api.add).not.toHaveBeenCalled(); controller.dispose();
  });
  it('persists dismissal of La última vez and does not show it again after a refresh or screen remount', async () => {
    const detail = testDetail(); detail.quickHistory = { status: 'ok', data: { [EXERCISE_ID]: [{ sessionId: SECOND_ID, logDate: '2026-10-05', completedAt: null, routineId: EXERCISE_ID, routineName: 'PULL', decision: 'maintain', sets: detail.exercises[0].payload.sets.map(set => ({ ...set, isCompleted: true })) }] } };
    const { controller, repository, Screen } = fixture(detail); await controller.refresh(); const view = renderWithPressOpen(<Screen />);
    await waitFor(() => expect(view.getByLabelText(/^La última vez,/)).toBeTruthy());
    fireEvent(view.getByLabelText(/^La última vez,/), 'accessibilityAction', { nativeEvent: { actionName: 'dismiss' } });
    expect(view.queryByLabelText(/^La última vez,/)).toBeNull(); expect(await repository.readDismissedHistory()).toEqual([EXERCISE_ID]);
    await act(async () => { await controller.refresh(); }); expect(view.queryByLabelText(/^La última vez,/)).toBeNull(); view.unmount();
    const remounted = renderWithPressOpen(<Screen />); await act(async () => {}); expect(remounted.queryByLabelText(/^La última vez,/)).toBeNull(); controller.dispose();
  });
  it('shows independent quick-history empty/unavailable states in a native modal', async () => {
    const { controller, api, Screen } = fixture(); await controller.refresh(); const view = renderWithPressOpen(<Screen />);
    await waitFor(() => expect(view.getByRole('button', { name: 'Historial de PRESS' })).toBeTruthy());
    fireEvent.press(view.getByRole('button', { name: 'Historial de PRESS' })); expect(view.getByText('Todavía sin registros')).toBeTruthy();
    fireEvent.press(view.getByLabelText('Cerrar Historial'));
    const detail = testDetail(); detail.quickHistory = { status: 'unavailable' };
    (api.detail as jest.MockedFunction<ActiveSessionApi['detail']>).mockResolvedValue({ status: 'ok', data: detail, meta });
    await act(async () => { await controller.refresh(); });
    fireEvent.press(view.getByRole('button', { name: 'Historial de PRESS' }));
    expect(view.getByText(/Podés seguir entrenando/)).toBeTruthy();
    controller.dispose();
  });
  it('starts rest manually and preserves the snapshot duration', async () => {
    const { controller, Screen } = fixture(); await controller.refresh(); const view = renderWithPressOpen(<Screen />);
    await waitFor(() => expect(view.getByRole('button', { name: 'Iniciar descanso' })).toBeTruthy());
    const inlineRest = view.getByTestId(`exercise-rest-${EXERCISE_ID}`);
    fireEvent.press(view.getByRole('button', { name: 'Iniciar descanso' }));
    expect(view.getByText('Descanso · PRESS')).toBeTruthy(); expect(controller.getTimer()).not.toBeNull();
    const floatingTimer = view.getByLabelText('Temporizador de descanso');
    expect(view.getByTestId(`exercise-rest-${EXERCISE_ID}`)).toBe(inlineRest);
    expect(view.getByRole('button', { name: 'Saltar descanso' })).toBeTruthy();
    const end = controller.getTimer()!.endAt;
    fireEvent.press(view.getByLabelText('Sumar 15 segundos')); expect(controller.getTimer()!.endAt).toBe(end + 15000);
    expect(view.getByLabelText('Temporizador de descanso')).toBe(floatingTimer);
    fireEvent.press(view.getByRole('button', { name: 'Saltar' })); expect(controller.getTimer()).toBeNull();
    expect(view.getByTestId(`exercise-rest-${EXERCISE_ID}`)).toBe(inlineRest);
    fireEvent.press(view.getByRole('button', { name: 'Iniciar descanso' }));
    fireEvent.press(view.getByRole('button', { name: 'Saltar descanso' })); expect(controller.getTimer()).toBeNull();
    controller.dispose();
  });
  it('signals the rest deadline once and keeps the timer mounted when adjusting seconds', async () => {
    jest.useFakeTimers();
    const previousAppState = AppState.currentState; AppState.currentState = 'active';
    const { controller, Screen } = fixture();
    try {
      await controller.refresh(); const view = renderWithPressOpen(<Screen />);
      fireEvent.press(view.getByRole('button', { name: 'Iniciar descanso' }));
      fireEvent.press(view.getByLabelText('Restar 15 segundos'));
      expect(mockSelection).toHaveBeenCalledTimes(2);
      expect(mockTrigger).not.toHaveBeenCalled();
      act(() => { jest.advanceTimersByTime(105_000); });
      expect(view.queryByLabelText('Temporizador de descanso')).toBeNull();
      expect(mockTrigger.mock.calls).toEqual([['restEnd']]);
      act(() => { jest.advanceTimersByTime(5000); });
      expect(mockTrigger.mock.calls).toEqual([['restEnd']]);
    } finally {
      controller.dispose(); AppState.currentState = previousAppState; jest.useRealTimers();
    }
  });
  it('requires destructive confirmation and returns only after cancellation is confirmed', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const { controller, api, Screen } = fixture(); await controller.refresh(); const view = renderWithPressOpen(<Screen />);
    fireEvent.press(view.getByRole('button', { name: 'Cancelar entrenamiento' })); expect(api.cancel).not.toHaveBeenCalled();
    const options = alert.mock.calls.at(-1)?.[2];
    await act(async () => { options?.find(option => option.text === 'Cancelar entrenamiento')?.onPress?.(); for (let i = 0; i < 30; i++) await Promise.resolve(); });
    expect(api.cancel).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/(tabs)/train'));
    controller.dispose();
  });
  it('gives one subtle haptic for each expand/collapse, decision and routine toggle; completing a set is the brand setComplete event', async () => {
    const detail = testDetail(); detail.exercises[0].routineExerciseId = detail.exercises[1].id;
    const { controller, Screen } = fixture(detail); await controller.refresh(); const view = renderWithPressOpen(<Screen />);
    fireEvent(view.getByRole('button', { name: 'Contraer PRESS' }), 'accessibilityTap'); expect(mockSelection).toHaveBeenCalledTimes(1);
    expect(view.queryByLabelText('Peso serie 1 de PRESS')).toBeNull();
    fireEvent(view.getByRole('button', { name: 'Expandir PRESS' }), 'accessibilityTap'); expect(mockSelection).toHaveBeenCalledTimes(2);
    fireEvent.press(view.getByRole('button', { name: 'Próxima vez' })); mockSelection.mockClear();
    for (const label of ['Más peso', 'Más peso', 'Más repeticiones', 'Más repeticiones']) {
      fireEvent.press(view.getByRole('checkbox', { name: label })); await act(async () => { await controller.flush(EXERCISE_ID); });
      expect(view.getByLabelText('Cerrar opciones de próxima vez')).toBeTruthy();
    }
    expect(controller.getExercise(EXERCISE_ID)?.draft.decision).toBe('maintain'); expect(mockSelection).toHaveBeenCalledTimes(4);
    fireEvent(view.getByLabelText('Tomar resultado de hoy'), 'valueChange', true); await act(async () => { await controller.flush(EXERCISE_ID); });
    fireEvent(view.getByLabelText('Tomar resultado de hoy'), 'valueChange', false); await act(async () => { await controller.flush(EXERCISE_ID); });
    expect(mockSelection).toHaveBeenCalledTimes(6);
    fireEvent(view.getByRole('checkbox', { name: 'Serie 1 completada' }), 'accessibilityTap'); await act(async () => { await controller.flush(EXERCISE_ID); });
    fireEvent(view.getByRole('checkbox', { name: 'Serie 1 completada' }), 'accessibilityTap'); await act(async () => { await controller.flush(EXERCISE_ID); });
    // Complete → setComplete (impact medium); un-complete is silent. No success/warning.
    expect(mockSelection).toHaveBeenCalledTimes(6); expect(mockTrigger.mock.calls).toEqual([['setComplete']]);
    expect(mockSuccess).not.toHaveBeenCalled(); expect(mockWarning).not.toHaveBeenCalled();
    controller.dispose();
  });
  it('shares all five column widths and preserves touch targets and input gestures', async () => {
    const { controller, Screen } = fixture(); await controller.refresh(); const view = renderWithPressOpen(<Screen />);
    const header = view.getByTestId('series-column-header', { includeHiddenElements: true });
    const row = view.getByTestId('series-column-row');
    const widths = (node: typeof header) => node.children.filter(child => typeof child !== 'string').map(child => StyleSheet.flatten(child.props.style));
    expect(header.children).toHaveLength(5); expect(widths(row)).toEqual(widths(header));
    expect(view.getByLabelText('Peso serie 1 de PRESS').props.onLongPress).toBeUndefined();
    expect(view.getByLabelText('Reps serie 1 de PRESS').props.onLongPress).toBeUndefined();
    expect(StyleSheet.flatten(view.getByLabelText('Peso serie 1 de PRESS').props.style).minHeight).toBeGreaterThanOrEqual(44);
    expect(StyleSheet.flatten(view.getByLabelText('Mover serie 1').props.style).minHeight).toBeGreaterThanOrEqual(44);
    controller.dispose();
  });
  it('switches the next-time adjustment without closing the menu or coupling it to today’s result', async () => {
    const detail = testDetail(); detail.exercises[0].routineExerciseId = SECOND_ID;
    const { controller, api, Screen } = fixture(detail); await controller.refresh(); const view = renderWithPressOpen(<Screen />);
    fireEvent.press(view.getByRole('button', { name: 'Próxima vez' }));
    fireEvent(view.getByLabelText('Tomar resultado de hoy'), 'valueChange', true);
    fireEvent.press(view.getByRole('checkbox', { name: 'Más peso' }));
    await act(async () => { await controller.flush(EXERCISE_ID); });
    expect(controller.getExercise(EXERCISE_ID)?.draft.decision).toBe('increase_weight');
    fireEvent.press(view.getByRole('checkbox', { name: 'Más repeticiones' }));
    await act(async () => { await controller.flush(EXERCISE_ID); });
    expect(view.getByRole('checkbox', { name: 'Más peso' })).not.toBeChecked();
    expect(view.getByRole('checkbox', { name: 'Más repeticiones' })).toBeChecked();
    expect(controller.getExercise(EXERCISE_ID)?.draft.applyToRoutine).toBe(true);
    fireEvent.press(view.getByRole('checkbox', { name: 'Más repeticiones' }));
    await act(async () => { await controller.flush(EXERCISE_ID); });
    expect(api.save).toHaveBeenLastCalledWith(EXERCISE_ID, expect.any(String), expect.objectContaining({ decision: 'maintain', applyToRoutine: true }));
    expect(view.queryByText('Quitar ajuste')).toBeNull();
    fireEvent.press(view.getByLabelText('Cerrar opciones de próxima vez'));
    expect(view.queryByRole('checkbox', { name: 'Más peso' })).toBeNull();
    controller.dispose();
  });
  it('saves the extra exercise opt-in through the existing draft and autosave path', async () => {
    const detail = testDetail(); detail.session.routineId = SECOND_ID; detail.session.routineNameSnapshot = 'PUSH'; detail.session.name = 'Mi sesión';
    const { controller, api, Screen } = fixture(detail); await controller.refresh(); const view = renderWithPressOpen(<Screen />);
    fireEvent.press(view.getByRole('button', { name: 'Próxima vez' }));
    expect(view.getByLabelText('Sumar a PUSH').props.value).toBe(false);
    expect(view.queryByText('Tomar resultado de hoy')).toBeNull();
    fireEvent(view.getByLabelText('Sumar a PUSH'), 'valueChange', true);
    await act(async () => { await controller.flush(EXERCISE_ID); });
    expect(api.save).toHaveBeenLastCalledWith(EXERCISE_ID, expect.any(String), expect.objectContaining({ applyToRoutine: true, decision: 'maintain' }));
    expect(api.finish).not.toHaveBeenCalled(); expect(api.add).not.toHaveBeenCalled();
    controller.dispose();
  });
  it('drags complete series directly, renumbers once, then swipes reset/delete with a minimum of one', async () => {
    const detail = testDetail(); const first = detail.exercises[0].payload.sets[0];
    detail.exercises[0].payload.sets = [first, { ...first, setNumber: 2, actualWeightKg: 17.5, actualReps: 10, targetRir: 1, notes: 'second' }];
    const { controller, api, Screen } = fixture(detail); await controller.refresh(); const view = renderWithPressOpen(<Screen />);
    const ids = controller.getExercise(EXERCISE_ID)!.draft.sets.map(set => set.localId);
    for (const id of ids) fireEvent(view.getByTestId(`drag-item-${id}`), 'layout', { nativeEvent: { layout: { height: 80 } } });
    act(() => afterHold(() => fireGestureHandler(getByGestureTestId(`drag-set-handle-${ids[1]}`), [
      { state: State.BEGAN }, { state: State.ACTIVE, translationY: 0, absoluteY: 100 },
      { state: State.ACTIVE, translationY: -90, absoluteY: 10 }, { state: State.END, translationY: -90, absoluteY: 10 },
    ])));
    await act(async () => { await controller.flush(EXERCISE_ID); });
    expect(controller.getExercise(EXERCISE_ID)?.draft.sets[0]).toMatchObject({ setNumber: 1, actualWeightKg: '17,5', notes: 'second', targetRir: 1 });
    expect(api.save).toHaveBeenCalledTimes(1); expect(mockSelection).toHaveBeenCalledTimes(2);
    expect(ActionSheetIOS.showActionSheetWithOptions).not.toHaveBeenCalled(); expect(view.queryByText('Organizar series')).toBeNull();
    const swipe = (row: string) => act(() => fireGestureHandler(getByGestureTestId(`swipe-set-handle-${row}`), [
      { state: State.BEGAN }, { state: State.ACTIVE, translationX: 0 }, { state: State.ACTIVE, translationX: -120 }, { state: State.END, translationX: -120 },
    ]));
    swipe(ids[1]); fireEvent.press(view.getByLabelText('Resetear · Serie 1')); await act(async () => { await controller.flush(EXERCISE_ID); });
    expect(controller.getExercise(EXERCISE_ID)?.draft.sets[0]).toMatchObject({ actualWeightKg: '', actualReps: '', isCompleted: false, targetRir: 1, notes: null });
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    swipe(ids[1]); fireEvent.press(view.getByLabelText('Eliminar · Serie 1'));
    await act(async () => { alert.mock.calls.at(-1)?.[2]?.find(button => button.text === 'Eliminar')?.onPress?.(); await controller.flush(EXERCISE_ID); });
    expect(controller.getExercise(EXERCISE_ID)?.draft.sets).toHaveLength(1); expect(controller.getExercise(EXERCISE_ID)?.draft.sets[0].setNumber).toBe(1);
    swipe(ids[0]); expect(view.getByLabelText('Eliminar · Serie 1')).toBeDisabled();
    expect(view.queryByText('Más opciones del ejercicio')).toBeNull(); expect(api.detail).toHaveBeenCalledTimes(1);
    expect(api.save).toHaveBeenCalledTimes(3); controller.dispose();
  });
  it('swipes the exercise header for notes/reset/removal, keeping destructive confirmations', async () => {
    const { controller, api, repository, Screen } = fixture(); await controller.refresh(); const view = renderWithPressOpen(<Screen />);
    expect(view.queryByText('Nota de esta sesión')).toBeNull(); expect(view.queryByRole('button', { name: 'Agregar nota' })).toBeNull();
    const swipe = () => act(() => fireGestureHandler(getByGestureTestId(`swipe-exercise-header-${EXERCISE_ID}`), [
      { state: State.BEGAN }, { state: State.ACTIVE, translationX: 0 }, { state: State.ACTIVE, translationX: -180 }, { state: State.END, translationX: -180 },
    ]));
    swipe(); fireEvent.press(view.getByLabelText('Agregar nota · PRESS'));
    fireEvent(view.UNSAFE_getAllByType(Modal).find(node => node.props.visible)!, 'show');
    fireEvent.changeText(view.getByLabelText('Nota de PRESS'), 'nota compacta');
    fireEvent.press(view.getByLabelText('Guardar nota')); await act(async () => { await controller.flush(EXERCISE_ID); });
    expect(view.getByText('Nota')).toBeTruthy(); expect(view.queryByText('nota compacta')).toBeNull();
    swipe(); fireEvent.press(view.getByLabelText('Editar nota · PRESS')); fireEvent(view.UNSAFE_getAllByType(Modal).find(node => node.props.visible)!, 'show'); expect(view.getByLabelText('Nota de PRESS').props.value).toBe('nota compacta');
    fireEvent.press(view.getByLabelText('Cerrar Nota del ejercicio'));
    expect(view.queryByTestId('swipe-PRESS-Descartar cambios')).toBeNull();
    fireEvent.changeText(view.getByLabelText('Peso serie 1 de PRESS'), '.');
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    swipe(); fireEvent.press(view.getByLabelText('Descartar cambios · PRESS')); expect(api.sync).not.toHaveBeenCalled();
    expect(alert).toHaveBeenLastCalledWith('¿Descartar cambios?', 'Se descartarán los cambios de este ejercicio que todavía no están guardados.', expect.any(Array));
    await act(async () => { alert.mock.calls.at(-1)?.[2]?.find(button => button.text === 'Descartar cambios')?.onPress?.(); for (let i = 0; i < 30; i++) await Promise.resolve(); });
    expect(controller.getExercise(EXERCISE_ID)?.draft.notes).toBe(''); expect(await repository.readDraft(EXERCISE_ID)).toBeNull();
    swipe(); fireEvent.press(view.getByLabelText('Quitar · PRESS'));
    await act(async () => { await Promise.resolve(); });
    expect(view.getByText('PRESS quitado')).toBeTruthy(); expect(view.getByRole('button', { name: 'Deshacer' })).toBeTruthy();
    expect(alert).toHaveBeenCalledTimes(1); expect(api.remove).not.toHaveBeenCalled();
    await act(async () => { fireEvent.press(view.getByRole('button', { name: 'Deshacer' })); });
    expect(view.getByTestId(`session-exercise-${EXERCISE_ID}`)).toBeTruthy();
    controller.dispose();
  });
  it('reacts immediately to tap, springs back, and never starts drag from a tap or numeric input', async () => {
    const { controller, api, Screen } = fixture(); await controller.refresh(); const view = renderWithPressOpen(<Screen />);
    jest.mocked(withTiming).mockClear(); jest.mocked(withSpring).mockClear();
    act(() => fireGestureHandler(getByGestureTestId(`tap-exercise-header-${EXERCISE_ID}`), [
      { state: State.BEGAN }, { state: State.ACTIVE }, { state: State.END },
    ]));
    expect(withTiming).toHaveBeenCalledWith(PRESS_SCALE, { duration: 65 }); expect(withSpring).toHaveBeenCalledWith(1, expect.any(Object));
    expect(view.getByLabelText('Expandir PRESS')).toBeTruthy(); expect(controller.getSnapshot().interaction).toBeNull();
    expect(api.reorder).not.toHaveBeenCalled(); expect(mockSelection).toHaveBeenCalledTimes(1);
    fireEvent(view.getByLabelText('Expandir PRESS'), 'accessibilityTap'); mockSelection.mockClear();
    for (const label of ['Peso serie 1 de PRESS', 'Reps serie 1 de PRESS']) {
      const input = view.getByLabelText(label); fireEvent.press(input); fireEvent(input, 'longPress');
      expect(input.props.onLongPress).toBeUndefined();
    }
    expect(controller.getSnapshot().interaction).toBeNull(); expect(mockSelection).not.toHaveBeenCalled(); expect(api.reorder).not.toHaveBeenCalled();
    const row = controller.getExercise(EXERCISE_ID)!.draft.sets[0].localId;
    expect(getByGestureTestId(`drag-set-handle-${row}`).config).toMatchObject({ activateAfterLongPress: DRAG_DELAY });
    act(() => fireGestureHandler(getByGestureTestId(`drag-set-handle-${row}`), [{ state: State.BEGAN }, { state: State.FAILED }]));
    expect(mockSelection).not.toHaveBeenCalled(); expect(api.save).not.toHaveBeenCalled(); controller.dispose();
  });
  it('lifts once, reorders exercises only at drop and preserves expanded state until server confirmation', async () => {
    const { controller, api, Screen } = fixture(); await controller.refresh(); const view = renderWithPressOpen(<Screen />);
    let resolve!: (result: Awaited<ReturnType<ActiveSessionApi['reorder']>>) => void;
    jest.mocked(api.reorder).mockReturnValue(new Promise(done => { resolve = done; }));
    for (const id of [EXERCISE_ID, SECOND_ID]) fireEvent(view.getByTestId(`drag-item-${id}`), 'layout', { nativeEvent: { layout: { height: 160 } } });
    act(() => afterHold(() => fireGestureHandler(getByGestureTestId(`drag-exercise-header-${EXERCISE_ID}`), [
      { state: State.BEGAN }, { state: State.ACTIVE, translationY: 0, absoluteY: 100 },
      { state: State.ACTIVE, translationY: 90, absoluteY: 190 }, { state: State.ACTIVE, translationY: 120, absoluteY: 220 },
      { state: State.END, translationY: 120, absoluteY: 220 },
    ])));
    await act(async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); });
    expect(withSpring).toHaveBeenCalledWith(LIFT_SCALE, expect.any(Object)); expect(mockSelection).toHaveBeenCalledTimes(1);
    expect(api.reorder).toHaveBeenCalledTimes(1); expect(api.reorder).toHaveBeenCalledWith(expect.objectContaining({ orderedSessionExerciseIds: [SECOND_ID, EXERCISE_ID] }));
    expect(controller.getSnapshot().detail!.exercises.map(row => row.id)).toEqual([EXERCISE_ID, SECOND_ID]);
    expect(view.getByLabelText('Contraer PRESS')).toBeTruthy(); expect(view.getByLabelText('Expandir ROW')).toBeTruthy();
    await act(async () => { resolve({ status: 'ok', data: { status: 'reordered', sessionId: SESSION_ID, sessionUpdatedAt: NEXT_VERSION,
      orderedSessionExerciseIds: [SECOND_ID, EXERCISE_ID] }, meta }); for (let i = 0; i < 30; i++) await Promise.resolve(); });
    expect(controller.getSnapshot().detail!.exercises.map(row => row.id)).toEqual([SECOND_ID, EXERCISE_ID]);
    expect(view.getByLabelText('Contraer PRESS')).toBeTruthy(); expect(view.getByLabelText('Peso serie 1 de PRESS')).toBeTruthy();
    expect(mockSelection).toHaveBeenCalledTimes(2); expect(api.detail).toHaveBeenCalledTimes(1); controller.dispose();
  });
  it('rolls visual exercise order back on conflict without a success haptic or losing the expanded draft', async () => {
    const { controller, api, Screen } = fixture(); await controller.refresh(); const view = renderWithPressOpen(<Screen />);
    fireEvent.changeText(view.getByLabelText('Peso serie 1 de PRESS'), '.');
    jest.mocked(api.reorder).mockResolvedValue({ status: 'conflict', code: 'SESSION_CHANGED', message: 'changed', meta: { ...meta, outcome: 'conflict' } });
    for (const id of [EXERCISE_ID, SECOND_ID]) fireEvent(view.getByTestId(`drag-item-${id}`), 'layout', { nativeEvent: { layout: { height: 160 } } });
    act(() => afterHold(() => fireGestureHandler(getByGestureTestId(`drag-exercise-header-${EXERCISE_ID}`), [
      { state: State.BEGAN }, { state: State.ACTIVE, translationY: 0 }, { state: State.ACTIVE, translationY: 120 }, { state: State.END, translationY: 120 },
    ])));
    await act(async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); });
    expect(controller.getSnapshot().detail!.exercises.map(row => row.id)).toEqual([EXERCISE_ID, SECOND_ID]);
    expect(view.getByText(/Se conservó el orden confirmado/)).toBeTruthy();
    expect(view.getByLabelText('Peso serie 1 de PRESS').props.value).toBe('.'); expect(view.getByLabelText('Contraer PRESS')).toBeTruthy();
    expect(mockSelection).toHaveBeenCalledTimes(1); expect(api.reorder).toHaveBeenCalledTimes(1); controller.dispose();
  });
  it('hides idle/saved status, uses a compact saving spinner, and keeps conflicts actionable even collapsed', async () => {
    const { controller, api, Screen } = fixture(); await controller.refresh(); const view = renderWithPressOpen(<Screen />);
    expect(view.queryByText('Sin cambios pendientes')).toBeNull(); expect(view.queryByText('Guardado')).toBeNull();
    let resolve!: (result: Awaited<ReturnType<ActiveSessionApi['save']>>) => void;
    jest.mocked(api.save).mockReturnValueOnce(new Promise(done => { resolve = done; }));
    fireEvent.changeText(view.getByLabelText('Peso serie 1 de PRESS'), '45');
    await act(async () => { void controller.flush(EXERCISE_ID); for (let i = 0; i < 30; i++) await Promise.resolve(); });
    expect(view.getByTestId(`exercise-saving-${EXERCISE_ID}`)).toBeTruthy(); expect(view.queryByText('Guardando…')).toBeNull();
    await act(async () => { resolve({ status: 'ok', data: { sessionExerciseId: EXERCISE_ID, updatedAt: NEXT_VERSION }, meta }); await controller.flush(EXERCISE_ID); });
    expect(view.queryByTestId(`exercise-saving-${EXERCISE_ID}`)).toBeNull(); expect(view.queryByText('Guardado')).toBeNull();
    jest.mocked(api.save).mockResolvedValue({ status: 'conflict', code: 'SESSION_EXERCISE_CHANGED', message: 'changed', meta: { ...meta, outcome: 'conflict' } });
    jest.mocked(api.sync).mockResolvedValue({ status: 'ok', data: { status: 'active', updatedAt: NEXT_VERSION,
      payload: { ...testDetail().exercises[0].payload, notes: 'remote' } }, meta });
    fireEvent.changeText(view.getByLabelText('Peso serie 1 de PRESS'), '46'); await act(async () => { await controller.flush(EXERCISE_ID); });
    fireEvent(view.getByLabelText('Contraer PRESS'), 'accessibilityTap');
    expect(view.getByText('Cambio en otro dispositivo')).toBeTruthy(); expect(view.getByRole('button', { name: 'Comprobar cambios' })).toBeTruthy(); controller.dispose();
  });
  it('keeps unconfirmed/offline writes explicit and provides accessible movement without visual arrow controls', async () => {
    const detail = testDetail(); detail.exercises[0].payload.sets.push({ ...detail.exercises[0].payload.sets[0], setNumber: 2, notes: 'second' });
    const { controller, api, Screen } = fixture(detail); await controller.refresh(); const view = renderWithPressOpen(<Screen />);
    fireEvent(view.getByLabelText('Mover serie 2'), 'accessibilityAction', { nativeEvent: { actionName: 'moveUp' } });
    await act(async () => { await controller.flush(EXERCISE_ID); }); expect(controller.getExercise(EXERCISE_ID)!.draft.sets[0].notes).toBe('second');
    fireEvent(view.getByLabelText('Mover serie 1'), 'accessibilityAction', { nativeEvent: { actionName: 'moveDown' } });
    await act(async () => { await controller.flush(EXERCISE_ID); }); expect(controller.getExercise(EXERCISE_ID)!.draft.sets[1].notes).toBe('second');
    fireEvent(view.getByLabelText('Expandir ROW'), 'accessibilityAction', { nativeEvent: { actionName: 'moveUp' } });
    await act(async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); }); expect(api.reorder).toHaveBeenCalledTimes(1);
    expect(view.queryByLabelText('Mover arriba')).toBeNull(); expect(view.queryByLabelText('Mover abajo')).toBeNull();
    const offline = { status: 'unavailable', reason: 'network', meta: { ...meta, outcome: 'unavailable' } } as const;
    jest.mocked(api.save).mockResolvedValue(offline); jest.mocked(api.sync).mockResolvedValue(offline);
    fireEvent.changeText(view.getByLabelText('Peso serie 1 de PRESS'), '49'); await act(async () => { await controller.flush(EXERCISE_ID); });
    expect(view.getByText('Pendiente de conexión · Guardado sin confirmar')).toBeTruthy(); expect(view.getByRole('button', { name: 'Comprobar cambios' })).toBeTruthy(); controller.dispose();
  });
  it('keeps expanded rows visible across incomplete measurements, expand, drag, swipe, save and foreground reconciliation', async () => {
    const detail = testDetail(); detail.exercises[0].payload.sets.push({ ...detail.exercises[0].payload.sets[0], setNumber: 2, notes: 'second' });
    const { controller, api, Screen } = fixture(detail); await controller.refresh(); const view = renderWithPressOpen(<Screen />);
    const visibleRows = () => {
      expect(view.getByTestId('series-column-header', { includeHiddenElements: true })).toHaveStyle({ flexDirection: 'row' });
      for (const number of [1, 2]) {
        expect(view.getByLabelText(`Peso serie ${number} de PRESS`)).toBeVisible();
        expect(view.getByLabelText(`Reps serie ${number} de PRESS`)).toBeVisible();
      }
      expect(view.getByRole('button', { name: '+ Agregar serie' })).toBeVisible();
    };
    visibleRows();
    let ids = controller.getExercise(EXERCISE_ID)!.draft.sets.map(row => row.localId);
    fireEvent(view.getByTestId(`drag-item-${ids[0]}`), 'layout', { nativeEvent: { layout: { height: 80 } } });
    fireEvent.changeText(view.getByLabelText('Peso serie 1 de PRESS'), '41'); visibleRows();
    await act(async () => { await controller.flush(EXERCISE_ID); }); visibleRows();
    fireEvent(view.getByLabelText('Contraer PRESS'), 'accessibilityTap'); fireEvent(view.getByLabelText('Expandir PRESS'), 'accessibilityTap'); visibleRows();
    ids = controller.getExercise(EXERCISE_ID)!.draft.sets.map(row => row.localId);
    for (const id of ids) fireEvent(view.getByTestId(`drag-item-${id}`), 'layout', { nativeEvent: { layout: { height: 80 } } });
    act(() => afterHold(() => fireGestureHandler(getByGestureTestId(`drag-set-handle-${ids[1]}`), [
      { state: State.BEGAN }, { state: State.ACTIVE, translationY: 0 }, { state: State.ACTIVE, translationY: -90 }, { state: State.END, translationY: -90 },
    ]))); await act(async () => { await controller.flush(EXERCISE_ID); }); visibleRows();
    act(() => fireGestureHandler(getByGestureTestId(`swipe-set-handle-${ids[1]}`), [
      { state: State.BEGAN }, { state: State.ACTIVE, translationX: 0 }, { state: State.ACTIVE, translationX: -120 }, { state: State.END, translationX: -120 },
    ])); fireEvent.press(view.getByLabelText('Resetear · Serie 1')); await act(async () => { await controller.flush(EXERCISE_ID); }); visibleRows();
    for (const id of [EXERCISE_ID, SECOND_ID]) fireEvent(view.getByTestId(`drag-item-${id}`), 'layout', { nativeEvent: { layout: { height: 200 } } });
    act(() => afterHold(() => fireGestureHandler(getByGestureTestId(`drag-exercise-header-${EXERCISE_ID}`), [
      { state: State.BEGAN }, { state: State.ACTIVE, translationY: 0 }, { state: State.ACTIVE, translationY: 120 }, { state: State.END, translationY: 120 },
    ]))); await act(async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); }); visibleRows();
    const fresh = { ...detail, session: { ...detail.session, updatedAt: NEXT_VERSION }, exercises: detail.exercises.map(row => row.id === EXERCISE_ID
      ? { ...row, updatedAt: NEXT_VERSION, payload: exercisePayload(controller.getExercise(EXERCISE_ID)!.draft) } : row).reverse() };
    jest.mocked(api.detail).mockResolvedValue({ status: 'ok', data: fresh, meta });
    await act(async () => { controller.suspend(); await controller.resume(); }); visibleRows();
    await act(async () => { await controller.refresh(); }); visibleRows();
    expect(api.reorder).toHaveBeenCalledTimes(1); controller.dispose();
  });
  it('reconciles normal operations silently and does not reserve a recovery banner during background reads', async () => {
    const { controller, api, Screen } = fixture(); await controller.refresh(); const view = renderWithPressOpen(<Screen />);
    let resolve!: (result: Awaited<ReturnType<ActiveSessionApi['detail']>>) => void;
    jest.mocked(api.detail).mockReturnValueOnce(new Promise(done => { resolve = done; }));
    let refreshing!: Promise<void>;
    act(() => { refreshing = controller.refresh(); });
    expect(view.queryByRole('button', { name: 'Comprobar sesión' })).toBeNull();
    expect(view.getByRole('button', { name: '+ Agregar serie' })).toBeVisible();
    expect(view.UNSAFE_getByType(RefreshControl).props.refreshing).toBe(false);
    await act(async () => { resolve({ status: 'ok', data: testDetail(), meta }); await refreshing; });
    jest.mocked(api.remove).mockResolvedValue({ status: 'ok', data: { status: 'removed', sessionId: SESSION_ID, sessionExerciseId: SECOND_ID }, meta });
    const detail = testDetail(); detail.exercises = [detail.exercises[0]]; jest.mocked(api.detail).mockResolvedValue({ status: 'ok', data: detail, meta });
    await act(async () => { await controller.remove(SECOND_ID); });
    expect(view.queryByText('Ejercicio quitado.')).toBeNull(); expect(view.queryByText('Comprobando operación…')).toBeNull();
    expect(view.queryByRole('button', { name: 'Comprobar sesión' })).toBeNull();
    expect(view.getByLabelText('Peso serie 1 de PRESS')).toBeVisible(); controller.dispose();
  });
  it('has only note/remove in the normal swipe and exposes discard only for meaningful pending changes', async () => {
    const { controller, Screen } = fixture(); await controller.refresh(); const view = renderWithPressOpen(<Screen />);
    expect(view.queryByTestId('swipe-PRESS-Resetear')).toBeNull(); expect(view.queryByTestId('swipe-PRESS-Descartar cambios')).toBeNull();
    expect(view.getByLabelText('Contraer PRESS').props.accessibilityActions.map((action: { name: string }) => action.name)).not.toContain('discard');
    fireEvent.changeText(view.getByLabelText('Peso serie 1 de PRESS'), '.');
    expect(view.getByTestId('swipe-PRESS-Descartar cambios', { includeHiddenElements: true })).toBeTruthy();
    expect(view.getByLabelText('Contraer PRESS').props.accessibilityActions.map((action: { name: string }) => action.name)).toContain('discard');
    controller.dispose();
  });
  it('keeps the held exercise attached to the finger across renders, suspends scrolling only while dragging and submits one drop', async () => {
    const { controller, api, Screen } = fixture(); await controller.refresh(); const view = renderWithPressOpen(<Screen />);
    fireEvent.changeText(view.getByLabelText('Peso serie 1 de PRESS'), '.');
    act(() => controller.startRest(EXERCISE_ID)); const timer = controller.getTimer();
    for (const id of [EXERCISE_ID, SECOND_ID]) fireEvent(view.getByTestId(`drag-item-${id}`), 'layout', { nativeEvent: { layout: { height: 160 } } });
    // Unlike fireGestureHandler's complete event batch, emit separated native
    // phases so lift's React/controller updates finish BEFORE finger movement.
    const send = (state: number, oldState: number | undefined, translationY: number) => {
      const handlerTag = getByGestureTestId(`drag-exercise-header-${EXERCISE_ID}`).handlerTag;
      DeviceEventEmitter.emit(oldState === undefined ? 'onGestureHandlerEvent' : 'onGestureHandlerStateChange', {
        handlerTag, state, ...(oldState === undefined ? {} : { oldState }), translationY, translationX: 0, absoluteY: 100 + translationY,
        absoluteX: 100, x: 20, y: 20, velocityX: 0, velocityY: 0, numberOfPointers: 1,
      });
    };
    const gesture = getByGestureTestId(`drag-exercise-header-${EXERCISE_ID}`);
    afterHold(() => { act(() => send(State.BEGAN, State.UNDETERMINED, 0)); act(() => send(State.ACTIVE, State.BEGAN, 0)); });
    // Lift re-renders the screen; the header's recognizer must not be rebuilt.
    expect(getByGestureTestId(`drag-exercise-header-${EXERCISE_ID}`)).toBe(gesture);
    expect(mockSelection).toHaveBeenCalledTimes(1); expect(controller.getSnapshot().interaction).toBe('exercises');
    expect(view.UNSAFE_getByType(Animated.ScrollView).props.animatedProps.scrollEnabled).toBe(false);
    expect(api.reorder).not.toHaveBeenCalled(); expect(api.save).not.toHaveBeenCalled();
    act(() => send(State.ACTIVE, undefined, 90)); view.rerender(<Screen />);
    expect(StyleSheet.flatten(view.getByTestId(`drag-item-${EXERCISE_ID}`).props.style).transform[0]).toEqual({ translateY: 90 });
    act(() => send(State.ACTIVE, undefined, 120)); view.rerender(<Screen />);
    expect(StyleSheet.flatten(view.getByTestId(`drag-item-${EXERCISE_ID}`).props.style).transform[0]).toEqual({ translateY: 120 });
    expect(api.reorder).not.toHaveBeenCalled(); expect(api.detail).toHaveBeenCalledTimes(1); expect(mockSelection).toHaveBeenCalledTimes(1);
    act(() => send(State.END, State.ACTIVE, 120));
    await act(async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); });
    expect(api.reorder).toHaveBeenCalledTimes(1); expect(api.reorder).toHaveBeenCalledWith(expect.objectContaining({ orderedSessionExerciseIds: [SECOND_ID, EXERCISE_ID] }));
    expect(mockSelection).toHaveBeenCalledTimes(2); expect(controller.getSnapshot().interaction).toBeNull();
    expect(view.UNSAFE_getByType(Animated.ScrollView).props.animatedProps.scrollEnabled).toBe(true);
    expect(view.getByLabelText('Contraer PRESS')).toBeTruthy(); expect(view.getByLabelText('Peso serie 1 de PRESS').props.value).toBe('.');
    expect(controller.getTimer()).toBe(timer); expect(api.save).not.toHaveBeenCalled();
    controller.dispose();
  });
  it('leaves ordinary vertical scrolling enabled without lifting or sending a reorder', async () => {
    const { controller, api, Screen } = fixture(); await controller.refresh(); const view = renderWithPressOpen(<Screen />);
    // Native recognition rejects movement before the 400ms hold. The parent
    // remains a normal scroll view; it is never globally disabled on press-in.
    act(() => fireGestureHandler(getByGestureTestId(`drag-exercise-header-${EXERCISE_ID}`), [
      { state: State.BEGAN, translationY: 0 }, { state: State.FAILED, translationY: 40 },
    ]));
    act(() => fireGestureHandler(getByGestureTestId('session-native-scroll'), [
      { state: State.BEGAN }, { state: State.ACTIVE }, { state: State.END },
    ]));
    expect(view.UNSAFE_getByType(Animated.ScrollView).props.animatedProps.scrollEnabled).toBe(true);
    expect(controller.getSnapshot().interaction).toBeNull(); expect(mockSelection).not.toHaveBeenCalled(); expect(api.reorder).not.toHaveBeenCalled(); controller.dispose();
  });
  it('keeps an early movement activation of the header pan as a scroll: no lift, no claim, no reorder', async () => {
    const { controller, api, Screen } = fixture(); await controller.refresh(); const view = renderWithPressOpen(<Screen />);
    for (const id of [EXERCISE_ID, SECOND_ID]) fireEvent(view.getByTestId(`drag-item-${id}`), 'layout', { nativeEvent: { layout: { height: 160 } } });
    // iOS can activate the long-press pan from fast movement ~40ms after touch
    // down (observed on the Simulator). BEGAN and ACTIVE arrive in the same tick.
    act(() => fireGestureHandler(getByGestureTestId(`drag-exercise-header-${EXERCISE_ID}`), [
      { state: State.BEGAN }, { state: State.ACTIVE, translationY: -20 }, { state: State.ACTIVE, translationY: -200 }, { state: State.END, translationY: -200 },
    ]));
    await act(async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); });
    expect(mockSelection).not.toHaveBeenCalled(); expect(withSpring).not.toHaveBeenCalledWith(LIFT_SCALE, expect.any(Object));
    expect(controller.getSnapshot().interaction).toBeNull();
    expect(view.UNSAFE_getByType(Animated.ScrollView).props.animatedProps.scrollEnabled).toBe(true);
    expect(StyleSheet.flatten(view.getByTestId(`drag-item-${EXERCISE_ID}`).props.style).transform[0]).toEqual({ translateY: 0 });
    expect(api.reorder).not.toHaveBeenCalled(); controller.dispose();
  });
  it('offers cancellation in the header and keeps the list clear of the native tab bar', async () => {
    const { controller, Screen } = fixture(); await controller.refresh(); const view = renderWithPressOpen(<Screen />);
    expect(view.queryByRole('button', { name: 'Más opciones' })).toBeNull();
    const scroll = view.UNSAFE_getByType(Animated.ScrollView);
    expect(StyleSheet.flatten(scroll.props.contentContainerStyle).paddingBottom).toBe(spacing.xl + 83);
    expect(scroll.props.contentInsetAdjustmentBehavior).toBe('never');
    expect(view.getByRole('button', { name: 'Cancelar entrenamiento' })).toBeEnabled(); controller.dispose();
  });
});

describe('native finish screen (M3.4-2)', () => {
  beforeEach(() => { mockReplace.mockReset(); mockNavigate.mockReset(); mockSetOptions.mockClear(); mockSelection.mockReset(); mockSuccess.mockReset(); mockTrigger.mockReset(); });
  afterEach(() => { jest.restoreAllMocks(); });
  const completedDetail = () => { const detail = testDetail(); detail.exercises[0].payload.sets[0].isCompleted = true; detail.exercises[0].payload.isCompleted = true;
    detail.session = { ...detail.session, status: 'completed', endedAt: '2026-09-30T13:05:00.000000+00:00',
      metadata: { ...detail.session.metadata, energyLevel: 4, painLevel: 0 } }; return detail; };
  async function completeSet(view: ReturnType<typeof render>, controller: ActiveSessionController) {
    fireEvent(view.getByRole('checkbox', { name: 'Serie 1 completada' }), 'accessibilityTap');
    await act(async () => { await controller.flush(EXERCISE_ID); });
  }
  it('finishes with the summary, then shows the post-workout base and the read-only completed session', async () => {
    const { controller, api, Screen } = fixture(); await controller.refresh(); const view = renderWithPressOpen(<Screen />);
    await completeSet(view, controller);
    jest.mocked(api.detail).mockResolvedValue({ status: 'ok', data: completedDetail(), meta });
    fireEvent.press(view.getByRole('button', { name: 'Finalizar entrenamiento' }));
    expect(view.queryByText('Quitar')).toBeNull(); // Re-tapping a value clears it; no extra control shifts the layout.
    expect(view.getByText('320')).toBeTruthy(); expect(view.getByText('kg de volumen')).toBeTruthy();
    fireEvent.press(view.getByTestId('summary-energyLevel-4'));
    fireEvent(view.getByTestId('summary-painLevel-slider'), 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
    fireEvent.press(view.getByTestId('summary-performanceLevel-3')); fireEvent.press(view.getByTestId('summary-performanceLevel-3'));
    await act(async () => { fireEvent.press(view.getByRole('button', { name: 'Guardar entrenamiento' })); for (let i = 0; i < 40; i++) await Promise.resolve(); });
    expect(api.finish).toHaveBeenCalledTimes(1);
    expect(api.finish).toHaveBeenCalledWith({ metadata: { energyLevel: 4, performanceLevel: null, painLevel: 0, notes: null }, idempotencyKey: expect.any(String) });
    expect(mockTrigger.mock.calls.filter(([event]) => event === 'workoutComplete')).toHaveLength(1);
    expect(view.getByTestId('post-workout-screen')).toBeTruthy(); expect(view.getByText('Entrenamiento guardado')).toBeTruthy();
    const sheet = within(view.getByTestId('post-workout-screen'));
    expect(sheet.getByLabelText('1 series')).toBeTruthy(); expect(sheet.getByText('4/5')).toBeTruthy(); expect(sheet.getByText('0/10')).toBeTruthy();
    expect(sheet.queryByText('Rendimiento')).toBeNull();
    fireEvent.press(view.getByRole('button', { name: 'Ver sesión' }));
    expect(view.queryByTestId('post-workout-screen')).toBeNull(); expect(view.getByTestId('completed-session')).toBeTruthy();
    expect(view.queryByRole('button', { name: 'Finalizar entrenamiento' })).toBeNull(); expect(view.queryByLabelText('Peso serie 1 de PRESS')).toBeNull();
    expect(view.getByText('40×8 kg')).toBeTruthy();
    controller.dispose();
  });
  it('keeps null distinct from zero, clears selected scales and stages note edits locally', async () => {
    const detail = testDetail(); detail.exercises[0].payload.sets[0].isCompleted = true;
    const { controller, Screen } = fixture(detail); await controller.refresh(); const view = render(<Screen />);
    fireEvent.press(view.getByRole('button', { name: 'Finalizar entrenamiento' }));
    expect(controller.getSnapshot().summary.energyLevel).toBeNull();
    fireEvent.press(view.getByTestId('summary-energyLevel-4')); expect(controller.getSnapshot().summary.energyLevel).toBe(4);
    fireEvent.press(view.getByTestId('summary-energyLevel-4')); expect(controller.getSnapshot().summary.energyLevel).toBeNull();
    fireEvent.press(view.getByRole('button', { name: 'Sin dolor' })); expect(controller.getSnapshot().summary.painLevel).toBe(0);
    fireEvent.press(view.getByRole('button', { name: 'Sin dolor' })); expect(controller.getSnapshot().summary.painLevel).toBeNull();
    fireEvent.press(view.getByTestId('finish-open-note')); fireEvent.changeText(view.getByTestId('finish-note-input'), 'Borrador');
    fireEvent.press(view.getByLabelText('Descartar edición de la nota')); expect(controller.getSnapshot().summary.notes).toBe('');
    fireEvent.press(view.getByTestId('finish-open-note')); fireEvent.changeText(view.getByTestId('finish-note-input'), 'Rodilla bien');
    fireEvent.press(view.getByLabelText('Guardar nota')); expect(controller.getSnapshot().summary.notes).toBe('Rodilla bien');
    expect(view.getByText('Rodilla bien')).toBeTruthy(); controller.dispose();
  });
  it('returns to the session without finishing when no set is checked and uses the existing discard confirmation', async () => {
    const { controller, api, Screen } = fixture(); await controller.refresh(); const view = render(<Screen />);
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    fireEvent.press(view.getByRole('button', { name: 'Finalizar entrenamiento' }));
    expect(view.getByTestId('finish-no-sets')).toBeTruthy(); expect(view.queryByRole('button', { name: 'Guardar entrenamiento' })).toBeNull();
    expect(view.getByTestId('summary-energyLevel-4', { includeHiddenElements: true }).props.accessibilityState.disabled).toBe(true);
    fireEvent.press(view.getByRole('button', { name: '← Volver a la sesión' })); expect(view.queryByTestId('finish-session-sheet')).toBeNull();
    fireEvent.press(view.getByRole('button', { name: 'Finalizar entrenamiento' }));
    fireEvent.press(view.getByRole('button', { name: 'Descartar entrenamiento' })); expect(alert).toHaveBeenCalled(); expect(api.finish).not.toHaveBeenCalled();
    controller.dispose();
  });
  it('routes Listo to Training after a confirmed finish', async () => {
    const { controller, api, Screen } = fixture(); await controller.refresh(); const view = renderWithPressOpen(<Screen />);
    await completeSet(view, controller); jest.mocked(api.detail).mockResolvedValue({ status: 'ok', data: completedDetail(), meta });
    await act(async () => { await controller.finish(); for (let i = 0; i < 40; i++) await Promise.resolve(); });
    fireEvent.press(view.getByRole('button', { name: 'Listo' }));
    // The sheet must close: the Train stack stays mounted behind the Home tab.
    expect(view.queryByTestId('post-workout-screen')).toBeNull();
    expect(mockReplace).toHaveBeenCalledWith('/(tabs)/train'); expect(mockNavigate).not.toHaveBeenCalled(); controller.dispose();
  });
  it('records pain on an iOS-style slider: no default, values including 0, Sin dolor twice returns to unanswered', async () => {
    const { controller, Screen } = fixture(); await controller.refresh(); const view = renderWithPressOpen(<Screen />);
    await completeSet(view, controller);
    fireEvent.press(view.getByRole('button', { name: 'Finalizar entrenamiento' }));
    const slider = view.getByTestId('summary-painLevel-slider');
    fireEvent(slider, 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 328, height: 44 } } });
    await act(async () => { await Promise.resolve(); }); // RNGH applies handler updates in a microtask
    expect(controller.getSnapshot().summary.painLevel).toBeNull();
    // Track travel = 328 - 28 = 300pt → 30pt per step; the thumb center starts at 14pt.
    act(() => fireGestureHandler(getByGestureTestId('summary-painLevel-tap'), [{ state: State.BEGAN, x: 14 }, { state: State.ACTIVE, x: 14 }, { state: State.END, x: 14 }]));
    await act(async () => { await Promise.resolve(); });
    expect(controller.getSnapshot().summary.painLevel).toBe(0); expect(view.queryByText('0/10')).toBeNull();
    mockSelection.mockClear(); mockTrigger.mockClear();
    act(() => fireGestureHandler(getByGestureTestId('summary-painLevel-pan'), [{ state: State.BEGAN, x: 14 }, { state: State.ACTIVE, x: 104 }, { state: State.ACTIVE, x: 200 }, { state: State.END, x: 200 }]));
    expect(controller.getSnapshot().summary.painLevel).toBe(6); expect(mockTrigger.mock.calls).toEqual([['stepperChange']]);
    fireEvent.press(view.getByRole('button', { name: 'Sin dolor' })); expect(controller.getSnapshot().summary.painLevel).toBe(0);
    fireEvent.press(view.getByRole('button', { name: 'Sin dolor' })); expect(controller.getSnapshot().summary.painLevel).toBeNull();
    controller.dispose();
  });
  it('keeps an unknown finish outcome explicit and recovers it from the sheet with the same key', async () => {
    const { controller, api, Screen } = fixture(); await controller.refresh(); const view = renderWithPressOpen(<Screen />);
    await completeSet(view, controller);
    jest.mocked(api.finish).mockResolvedValueOnce({ status: 'unavailable', reason: 'network', meta: { ...meta, outcome: 'unavailable' } });
    fireEvent.press(view.getByRole('button', { name: 'Finalizar entrenamiento' }));
    await act(async () => { fireEvent.press(view.getByRole('button', { name: 'Guardar entrenamiento' })); for (let i = 0; i < 40; i++) await Promise.resolve(); });
    expect(view.getByText(/No pudimos confirmar si el entrenamiento se guardó/)).toBeTruthy();
    expect(view.queryByTestId('post-workout-screen')).toBeNull(); expect(mockTrigger).not.toHaveBeenCalledWith('workoutComplete');
    jest.mocked(api.detail).mockResolvedValue({ status: 'ok', data: completedDetail(), meta });
    await act(async () => { fireEvent.press(view.getByRole('button', { name: 'Comprobar entrenamiento' })); for (let i = 0; i < 40; i++) await Promise.resolve(); });
    expect(jest.mocked(api.finish).mock.calls[1][0]).toEqual(jest.mocked(api.finish).mock.calls[0][0]);
    expect(view.getByTestId('post-workout-screen')).toBeTruthy(); controller.dispose();
  });
  it('opens an already completed session read-only without the active editor or a post-workout sheet', async () => {
    const { controller, Screen } = fixture(completedDetail()); await controller.refresh(); const view = render(<Screen />);
    expect(view.getByTestId('completed-session')).toBeTruthy(); expect(view.queryByText('SESIÓN FINALIZADA')).toBeNull();
    expect(mockSetOptions).toHaveBeenLastCalledWith(expect.objectContaining({ title: 'Sesión finalizada', headerRight: undefined }));
    expect(view.queryByTestId('post-workout-screen')).toBeNull(); expect(view.queryByRole('button', { name: 'Finalizar entrenamiento' })).toBeNull();
    expect(view.getByLabelText('Energía: 4 de 5')).toBeTruthy(); expect(view.getByLabelText('Dolor: 0 de 10')).toBeTruthy(); expect(view.queryByText('Rendimiento')).toBeNull();
    controller.dispose();
  });
  it('shows a discarded session as such, never as a fresh completion', async () => {
    const detail = completedDetail(); detail.session.status = 'discarded';
    const { controller, Screen } = fixture(detail); await controller.refresh(); const view = render(<Screen />);
    expect(view.getByTestId('discarded-session')).toBeTruthy(); expect(view.getByText('Esta sesión fue eliminada del historial. Se muestra sólo como referencia.')).toBeTruthy(); controller.dispose();
  });
});


describe('server-confirmed routine additions receipt', () => {
  it.each(['light', 'dark'] as const)('shows only confirmed additions in %s mode', mode => {
    const finished = { ...testFinished(), routineAdditions: [
      { sessionExerciseId: EXERCISE_ID, exerciseId: EXERCISE_ID, name: 'PRESS', outcome: 'added' as const },
      { sessionExerciseId: SECOND_ID, exerciseId: SECOND_ID, name: 'ROW', outcome: 'routine_unavailable' as const },
    ] };
    const view = render(<SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }}><OwnlevelThemeProvider initialMode={mode}><PostWorkoutScreen finished={finished} onHome={() => {}} onViewSession={() => {}} /></OwnlevelThemeProvider></SafeAreaProvider>);
    expect(view.getByText('PRESS se sumó a Sesión libre')).toBeTruthy();
    expect(view.queryByText(/ROW: no se sumó/)).toBeNull();
  });
});
