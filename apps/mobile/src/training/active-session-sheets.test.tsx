import { act, fireEvent, render, within } from '@testing-library/react-native';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { QuickSessionHistoryDto } from '@/api/active-session';
import { brandTokens, OwnlevelThemeProvider } from '@/design-system';
import { SessionExercisePicker, SessionQuickHistory } from './active-session-sheets';
import { EXERCISE_ID, SECOND_ID, testExercise, testPayload } from './active-session-test-fixtures';
const mockResource = jest.fn();
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('expo-glass-effect', () => ({ isGlassEffectAPIAvailable: () => false, isLiquidGlassAvailable: () => false }));
jest.mock('@/api', () => ({ fetchMobileTrainingExercises: jest.fn(), useApiResource: () => mockResource() }));
// Like the native sheet: closing lowers it, and the screen hears about it once it is down.
jest.mock('./routine-editor-sheet', () => {
  const { useEffect } = jest.requireActual<typeof import('react')>('react');
  return { RoutineEditorSheet: ({ children, open, onDismissed }: { children: React.ReactNode; open: boolean; onDismissed?: () => void }) => {
    useEffect(() => { if (!open) onDismissed?.(); }, [open, onDismissed]);
    return children;
  } };
});
jest.mock('./routine-exercise-picker-body', () => jest.requireActual('./routine-exercise-picker-body.tsx'));
function historical(index: number, routineId: string | null = 'push'): QuickSessionHistoryDto {
  const set = { ...testPayload().sets[0], actualWeightKg: 17.5, actualReps: 10, targetRir: 2, isCompleted: true };
  return { sessionId: `44444444-4444-4444-8444-${String(index).padStart(12, '0')}`, logDate: index === 0 ? '2026-09-28' : '2026-09-24', completedAt: null,
    routineId, routineName: routineId === 'pull' ? 'PULL' : 'PUSH', decision: 'increase_weight', sets: [set, { ...set, setNumber: 2, targetRir: 1 }, { ...set, setNumber: 3, isCompleted: false }] };
}
function wrapper(children: React.ReactNode) { return <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 83 } }}><OwnlevelThemeProvider initialMode="light">{children}</OwnlevelThemeProvider></SafeAreaProvider>; }
describe('session quick history', () => {
  it('starts in the current routine, filters locally, keeps six neutral sessions and copies only on Use', () => {
    const sessions = Array.from({ length: 7 }, (_, i) => historical(i, i === 0 ? 'pull' : 'push')), use = jest.fn();
    const view = render(wrapper(<SessionQuickHistory exercise={testExercise()} routineId="push" routineName="PUSH" history={{ status: 'ok', data: { [EXERCISE_ID]: sessions } }} onClose={jest.fn()} onRefresh={jest.fn()} onUse={use} />));
    expect(view.getAllByTestId(/^quick-history-session-/)).toHaveLength(5); expect(view.queryByText('Última sesión')).toBeNull(); expect(use).not.toHaveBeenCalled();
    fireEvent.press(view.getByRole('checkbox', { name: 'Todas' })); expect(view.getAllByTestId(/^quick-history-session-/)).toHaveLength(6);
    const row = within(view.getByTestId(`quick-history-session-${sessions[0].sessionId}`));
    expect(row.getAllByText('17,5 kg × 10')).toHaveLength(2); expect(row.getByText('RIR obj. 2')).toBeTruthy(); expect(row.getByText('RIR obj. 1')).toBeTruthy(); expect(row.getByText(' · PULL')).toBeTruthy();
    expect(row.getByText('Pediste más peso para la próxima')).toBeTruthy(); fireEvent.press(row.getByRole('button', { name: 'Usar' })); expect(use).toHaveBeenCalledWith(sessions[0]);
    expect(view.queryByText('Ver historial completo')).toBeNull();
  });
  it('keeps each card compact: «Usar» is a text action with a 44 pt target, disabled when nothing can be copied (#305)', () => {
    const done = historical(0), empty = historical(1); empty.sets = empty.sets.map(set => ({ ...set, isCompleted: false }));
    const use = jest.fn();
    const view = render(wrapper(<SessionQuickHistory exercise={testExercise()} history={{ status: 'ok', data: { [EXERCISE_ID]: [done, empty] } }} onClose={jest.fn()} onRefresh={jest.fn()} onUse={use} />));
    const action = within(view.getByTestId(`quick-history-session-${done.sessionId}`)).getByRole('button', { name: 'Usar' });
    // hitSlop is clipped to the header row: the action must allocate the minimum target itself.
    const target = StyleSheet.flatten(action.props.style);
    expect(target).not.toHaveProperty('height'); // Dynamic Type can still grow the header.
    expect(target.minHeight).toBeGreaterThanOrEqual(brandTokens.layout.minTouch);
    expect(target.minWidth).toBeGreaterThanOrEqual(brandTokens.layout.minTouch);
    const blocked = within(view.getByTestId(`quick-history-session-${empty.sessionId}`)).getByRole('button', { name: 'Usar' });
    expect(blocked.props.accessibilityState).toMatchObject({ disabled: true });
    fireEvent.press(blocked); expect(use).not.toHaveBeenCalled();
    fireEvent.press(action); expect(use).toHaveBeenCalledWith(done);
  });
  it('disables «Usar» when the exercise cannot be edited right now', () => {
    const use = jest.fn(), session = historical(0);
    const view = render(wrapper(<SessionQuickHistory exercise={testExercise()} canUse={false} history={{ status: 'ok', data: { [EXERCISE_ID]: [session] } }} onClose={jest.fn()} onRefresh={jest.fn()} onUse={use} />));
    fireEvent.press(view.getByRole('button', { name: 'Usar' })); expect(use).not.toHaveBeenCalled();
  });
  it('preserves unknown actuals and zero without substituting targets', () => {
    const session = historical(0); session.sets[0] = { ...session.sets[0], actualWeightKg: null, actualReps: null, targetRir: null }; session.sets[1] = { ...session.sets[1], actualWeightKg: 0, actualReps: 0 };
    const view = render(wrapper(<SessionQuickHistory exercise={testExercise()} history={{ status: 'ok', data: { [EXERCISE_ID]: [session] } }} onClose={jest.fn()} onRefresh={jest.fn()} onUse={jest.fn()} />));
    expect(view.getByText('Sin carga ni reps registradas')).toBeTruthy(); expect(view.getByText('0 kg × 0')).toBeTruthy(); expect(view.queryByText(/RIR obj\. —/)).toBeNull(); expect(view.getByText('RIR obj. 1')).toBeTruthy(); expect(view.queryByText('40 kg × 8')).toBeNull();
  });
  it('groups identical sets, states the shared target RIR once, keeps notes and numbering gaps (#513)', () => {
    const session = historical(0), set = { ...session.sets[0], actualWeightKg: 80, actualReps: 8, targetRir: 2 };
    session.sets = [set, { ...set, setNumber: 2 }, { ...set, setNumber: 3, notes: 'Pausa de 2 s abajo' }, { ...set, setNumber: 4, isCompleted: false }, { ...set, setNumber: 5 }, { ...set, setNumber: 6, actualReps: 6 }];
    const empty = historical(1); empty.sets = empty.sets.map(item => ({ ...item, isCompleted: false }));
    const view = render(wrapper(<SessionQuickHistory exercise={testExercise()} routineId="push" routineName="PUSH" history={{ status: 'ok', data: { [EXERCISE_ID]: [session, empty] } }} onClose={jest.fn()} onRefresh={jest.fn()} onUse={jest.fn()} />));
    const card = within(view.getByTestId(`quick-history-session-${session.sessionId}`));
    expect(card.getByText('5 series · RIR obj. 2')).toBeTruthy(); expect(card.queryByText(/^RIR obj\. 2$/)).toBeNull();
    expect(card.getByLabelText('Series 1 a 2: 80 kg × 8')).toBeTruthy();
    expect(card.getByLabelText('Serie 3: 80 kg × 8. Nota: Pausa de 2 s abajo')).toBeTruthy(); expect(card.getByText('Pausa de 2 s abajo')).toBeTruthy();
    expect(card.getByLabelText('Serie 5: 80 kg × 8')).toBeTruthy(); expect(card.getByLabelText('Serie 6: 80 kg × 6')).toBeTruthy(); expect(card.queryByTestId('quick-history-row-4')).toBeNull();
    expect(card.queryByText(' · PUSH')).toBeNull(); // the filter already names the routine
    expect(within(view.getByTestId(`quick-history-session-${empty.sessionId}`)).getByText('Sin series completadas')).toBeTruthy();
    fireEvent.press(view.getByRole('checkbox', { name: 'Todas' })); expect(card.getByText(' · PUSH')).toBeTruthy();
  });
  it('folds sessions with more than six rows to five, expands visually and still uses the whole session', () => {
    const session = historical(0), set = { ...session.sets[0], actualWeightKg: 80, targetRir: 2 }, use = jest.fn();
    session.sets = Array.from({ length: 12 }, (_, i) => ({ ...set, setNumber: i + 1, actualReps: 8 - (i % 3), targetRir: i % 2 ? 1 : null }));
    const view = render(wrapper(<SessionQuickHistory exercise={testExercise()} history={{ status: 'ok', data: { [EXERCISE_ID]: [session] } }} onClose={jest.fn()} onRefresh={jest.fn()} onUse={use} />));
    expect(view.getByText('12 series')).toBeTruthy(); expect(view.getByLabelText('Serie 2: 80 kg × 7, RIR objetivo 1')).toBeTruthy(); expect(view.getByLabelText('Serie 1: 80 kg × 8')).toBeTruthy();
    expect(view.getByTestId('quick-history-row-5')).toBeTruthy(); expect(view.queryByTestId('quick-history-row-6')).toBeNull();
    const more = view.getByRole('button', { name: 'Ver 7 series más' });
    expect(StyleSheet.flatten(more.props.style).minHeight).toBeGreaterThanOrEqual(brandTokens.layout.minTouch);
    fireEvent.press(more); expect(view.getByTestId('quick-history-row-12')).toBeTruthy(); expect(view.queryByRole('button', { name: /series más/ })).toBeNull();
    fireEvent.press(view.getByRole('button', { name: 'Usar' })); expect(use).toHaveBeenCalledWith(session); expect(use.mock.calls[0][0]).toHaveProperty('sets.length', 12);
  });
  it('keeps six or fewer rows unfolded', () => {
    const session = historical(0), set = { ...session.sets[0], actualWeightKg: 80, actualReps: 8 };
    session.sets = Array.from({ length: 6 }, (_, i) => ({ ...set, setNumber: i + 1, actualReps: 8 - i }));
    const view = render(wrapper(<SessionQuickHistory exercise={testExercise()} history={{ status: 'ok', data: { [EXERCISE_ID]: [session] } }} onClose={jest.fn()} onRefresh={jest.fn()} onUse={jest.fn()} />));
    expect(view.getByTestId('quick-history-row-6')).toBeTruthy(); expect(view.queryByRole('button', { name: /series más/ })).toBeNull();
  });
  it('distinguishes unavailable, true empty and an empty routine filter with access to Todas', () => {
    const refresh = jest.fn(), close = jest.fn();
    const renderSheet = (history: Parameters<typeof SessionQuickHistory>[0]['history']) => wrapper(<SessionQuickHistory exercise={testExercise()} routineId="push" routineName="PUSH" history={history} onClose={close} onRefresh={refresh} onUse={jest.fn()} />);
    const view = render(renderSheet({ status: 'ok', data: { [EXERCISE_ID]: [historical(0, 'pull')] } }));
    expect(view.getByText('Todavía no lo hiciste en PUSH')).toBeTruthy(); fireEvent.press(view.getByRole('button', { name: 'Ver todas' })); expect(view.getAllByTestId(/^quick-history-session-/)).toHaveLength(1);
    view.rerender(renderSheet({ status: 'unavailable' })); expect(view.queryByText('Todavía sin registros')).toBeNull(); fireEvent.press(view.getByRole('button', { name: 'Reintentar' })); expect(refresh).toHaveBeenCalledTimes(1);
    fireEvent.press(view.getByLabelText('Cerrar Historial')); expect(close).toHaveBeenCalledTimes(1);
    view.rerender(renderSheet({ status: 'ok', data: {} })); expect(view.getByText('Todavía sin registros')).toBeTruthy();
  });
});
describe('session exercise picker', () => {
  beforeEach(() => { mockResource.mockReset(); });
  const exercise = { id: EXERCISE_ID, name: 'PRESS', muscleGroup: 'pecho', isActive: true, implement: 'Barra', weightMode: 'Peso total' };
  const ready = (exercises: unknown[]) => ({ state: { status: 'ready', current: { data: { catalog: { status: 'ok', data: { exercises, routines: [] } } } } }, refresh: jest.fn() });
  function sheet(onAdd = jest.fn(), onCreate = jest.fn()) { return render(wrapper(<SessionExercisePicker visible client={{} as never} existingIds={new Set([EXERCISE_ID])} onClose={jest.fn()} onDismiss={jest.fn()} onCreate={onCreate} onAdd={onAdd as never} />)); }
  it('shows existing rows disabled and adds exactly once on a single tap without a confirm footer', async () => {
    mockResource.mockReturnValue(ready([exercise, { ...exercise, id: SECOND_ID, name: 'ROW' }])); const add = jest.fn(), view = sheet(add);
    expect(view.getByRole('button', { name: 'PRESS, En la sesión' })).toBeDisabled(); expect(view.queryByText('Agregar a la sesión')).toBeNull();
    await act(async () => { fireEvent.press(view.getByRole('button', { name: 'ROW' })); fireEvent.press(view.getByRole('button', { name: 'ROW' })); }); expect(add).toHaveBeenCalledTimes(1);
  });
  it('offers creation first, forwards the search name, and never treats an unavailable read as empty', () => {
    mockResource.mockReturnValue(ready([exercise])); const create = jest.fn(), view = sheet(jest.fn(), create);
    expect(view.getByText('Crear ejercicio nuevo')).toBeTruthy(); fireEvent.changeText(view.getByLabelText('Buscar ejercicio'), 'Nuevo'); fireEvent.press(view.getByRole('button', { name: 'Crear “Nuevo”' })); expect(create).toHaveBeenCalledWith('Nuevo');
    view.unmount(); mockResource.mockReturnValue({ state: { status: 'unavailable' }, refresh: jest.fn() }); const failed = sheet(); expect(failed.getByText('No pudimos cargar la biblioteca.')).toBeTruthy(); expect(failed.queryByText('No hay ejercicios disponibles')).toBeNull();
  });
});
