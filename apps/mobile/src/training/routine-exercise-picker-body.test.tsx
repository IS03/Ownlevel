import { act, fireEvent, render, within } from '@testing-library/react-native';
import { describe, expect, it, jest } from '@jest/globals';
import { ActivityIndicator, Dimensions, StyleSheet } from 'react-native';
import { brandTokens, OwnlevelThemeProvider } from '@/design-system';
import type { RoutineExercisePickerBodyProps } from './routine-exercise-picker-body.types';
import { LONG_NAME, pickerExercise, pickerExercises, pickerProps } from './routine-exercise-picker-body-test-fixtures';

// Jest resolves the .ios sibling by default; this file covers the React Native fallback (Android, Web) on purpose.
const { RoutineExercisePickerBody } = jest.requireActual<typeof import('./routine-exercise-picker-body')>('./routine-exercise-picker-body.tsx');
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
// The body has no API: any network access in these tests is a regression.
const fetchSpy = jest.fn();
Object.defineProperty(globalThis, 'fetch', { configurable: true, value: fetchSpy });

function body(patch: Partial<RoutineExercisePickerBodyProps> = {}, dark = false) {
  const props = pickerProps(patch);
  return { props, view: render(<OwnlevelThemeProvider initialMode={dark ? 'dark' : 'light'}><RoutineExercisePickerBody {...props} /></OwnlevelThemeProvider>) };
}
const session = { session: true } as const;

describe('exercise picker body (fallback): empty states', () => {
  it('library not ready: only the refresh message, no create row, no false empty text', () => {
    const { view } = body({ canCreate: false, ...session });
    expect(view.getByText('Actualizá la biblioteca para continuar.')).toBeTruthy(); expect(view.queryByText('No hay ejercicios disponibles')).toBeNull(); expect(view.queryByText('Crear ejercicio nuevo')).toBeNull();
  });
  it('library not ready with a query in the routine picker keeps the refresh message and offers no creation', () => {
    const { view } = body({ canCreate: false, query: 'Nuevo' });
    expect(view.getByText('Actualizá la biblioteca para continuar.')).toBeTruthy(); expect(view.queryByRole('button', { name: 'Crear “Nuevo”' })).toBeNull();
  });
  it('session with no rows: create row first and the neutral empty text', () => {
    const { view } = body({ ...session });
    expect(view.getByRole('button', { name: 'Crear ejercicio nuevo' })).toBeTruthy(); expect(view.getByText('No hay ejercicios disponibles')).toBeTruthy();
  });
  it('routine picker with no rows and no query: only the neutral empty text', () => {
    const { view } = body();
    expect(view.getByText('No hay ejercicios disponibles')).toBeTruthy(); expect(view.queryByText(/Crear/)).toBeNull();
  });
  it('routine picker with a query and no match: only «Crear “…”», which calls onCreate', () => {
    const { view, props } = body({ query: '  Remo  ' });
    expect(view.queryByText('No hay ejercicios disponibles')).toBeNull();
    fireEvent.press(view.getByRole('button', { name: 'Crear “Remo”' })); expect(props.onCreate).toHaveBeenCalledTimes(1);
  });
});

describe('exercise picker body (fallback): rows', () => {
  it('renders one row with its name and summary, and toggles it by id', () => {
    const exercise = pickerExercise(1, { name: 'PRESS', implement: 'Barra', weightMode: 'Peso total' }), { view, props } = body({ rows: [exercise] });
    expect(view.getByText('PRESS')).toBeTruthy(); expect(view.getByText('Barra · Peso total')).toBeTruthy();
    fireEvent.press(view.getByRole('button', { name: 'PRESS' })); expect(props.onToggle).toHaveBeenCalledTimes(1); expect(props.onToggle).toHaveBeenCalledWith(exercise.id);
  });
  it('a row without implement or mode shows no summary line', () => {
    const { view } = body({ rows: [pickerExercise(1, { name: 'DOMINADAS', implement: null, weightMode: null })] });
    expect(view.getByText('DOMINADAS')).toBeTruthy(); expect(view.queryByText(/·/)).toBeNull();
  });
  it('renders 200 rows with the same labels and routes each tap to its own id', () => {
    const rows = pickerExercises(200), started = Date.now(), { view, props } = body({ rows });
    expect(Date.now() - started).toBeLessThan(5000);
    expect(view.getAllByRole('button')).toHaveLength(200); expect(view.getByRole('button', { name: 'EJERCICIO 200' })).toBeTruthy();
    fireEvent.press(view.getByRole('button', { name: 'EJERCICIO 137' })); expect(props.onToggle).toHaveBeenCalledWith(rows[136]!.id);
  });
  it('keeps a very long name complete: wrapped text and the whole name in the accessibility label', () => {
    const { view } = body({ rows: [pickerExercise(1, { name: LONG_NAME })] }), row = view.getByRole('button', { name: LONG_NAME });
    const name = within(row).getByText(LONG_NAME);
    expect(name.props.numberOfLines).toBeUndefined(); expect(name.props.ellipsizeMode).toBeUndefined();
    expect(StyleSheet.flatten(row.props.style)).not.toHaveProperty('height'); // grows with the text and Dynamic Type
  });
  it('keeps at least the input height as the row minimum, without a fixed height', () => {
    const { view } = body({ rows: [pickerExercise(1, { name: 'PRESS' })] }), style = StyleSheet.flatten(view.getByRole('button', { name: 'PRESS' }).props.style);
    expect(style.minHeight).toBe(brandTokens.layout.inputHeight); expect(style).not.toHaveProperty('height');
    expect(style.minHeight).toBeGreaterThanOrEqual(brandTokens.layout.minTouch);
  });
  it.each([[1, 'row'], [1.3, 'row'], [2, 'column']])('at font scale %s the row lays out as a %s: large text stacks instead of squeezing the name', (fontScale, direction) => {
    const original = Dimensions.get('window');
    act(() => { Dimensions.set({ window: { ...original, fontScale } }); });
    try {
      const exercise = pickerExercise(1, { name: 'PRESS' }), { view } = body({ rows: [exercise], existing: new Set([exercise.id]), ...session });
      expect(StyleSheet.flatten(view.getByRole('button', { name: 'PRESS, En la sesión' }).props.style).flexDirection).toBe(direction);
      expect(view.getByText('En la sesión')).toBeTruthy(); expect(view.getByText('PRESS')).toBeTruthy();
    } finally { act(() => { Dimensions.set({ window: original }); }); }
  });
});

describe('exercise picker body (fallback): states', () => {
  it.each([[true, 'En la sesión'], [false, 'En la rutina']])('an existing row is disabled, muted, labelled and never toggled (session=%s)', (isSession, label) => {
    const exercise = pickerExercise(1, { name: 'PRESS' }), { view, props } = body({ rows: [exercise, pickerExercise(2, { name: 'ROW' })], existing: new Set([exercise.id]), session: isSession });
    const row = view.getByRole('button', { name: `PRESS, ${label}` });
    expect(row).toBeDisabled(); expect(view.getByText(label)).toBeTruthy();
    fireEvent.press(row); expect(props.onToggle).not.toHaveBeenCalled();
    fireEvent.press(view.getByRole('button', { name: 'ROW' })); expect(props.onToggle).toHaveBeenCalledTimes(1); expect(props.onToggle).toHaveBeenCalledWith(pickerExercise(2).id);
    // Muted by token color, not dimmed by opacity (a dimmed label would lose contrast).
    expect(StyleSheet.flatten(row.props.style).opacity).toBeUndefined();
    expect(StyleSheet.flatten(within(row).getByText('PRESS').props.style).color).toBe(brandTokens.palette.light.textMuted);
    expect(StyleSheet.flatten(view.getByText('ROW').props.style).color).toBe(brandTokens.palette.light.text);
  });
  it('the state does not rely on color alone: the label stays visible next to the muted check', () => {
    const exercise = pickerExercise(1, { name: 'PRESS' }), { view } = body({ rows: [exercise], existing: new Set([exercise.id]), ...session });
    expect(within(view.getByRole('button', { name: 'PRESS, En la sesión' })).getByText('En la sesión')).toBeTruthy();
  });
  it('shows the adding spinner and then the confirmation without changing the row label', () => {
    const exercise = pickerExercise(1, { name: 'PRESS' }), other = pickerExercise(2, { name: 'ROW' });
    const first = body({ rows: [exercise, other], adding: { id: exercise.id, done: false }, disabled: true, ...session });
    expect(first.view.getByRole('button', { name: 'PRESS' })).toBeTruthy(); expect(first.view.UNSAFE_queryAllByType(ActivityIndicator)).toHaveLength(1);
    first.view.unmount();
    const second = body({ rows: [exercise, other], adding: { id: exercise.id, done: true }, disabled: true, ...session });
    expect(second.view.UNSAFE_queryAllByType(ActivityIndicator)).toHaveLength(0); expect(second.view.getByRole('button', { name: 'PRESS' })).toBeTruthy();
  });
  it('marks a selected row (routine picker) in its label and keeps it toggleable', () => {
    const exercise = pickerExercise(1, { name: 'PRESS' }), { view, props } = body({ rows: [exercise], selected: [exercise.id] });
    fireEvent.press(view.getByRole('button', { name: 'PRESS, seleccionado' })); expect(props.onToggle).toHaveBeenCalledWith(exercise.id);
  });
  it('an existing row wins over a selected one in the label (same precedence as before)', () => {
    const exercise = pickerExercise(1, { name: 'PRESS' }), { view } = body({ rows: [exercise], existing: new Set([exercise.id]), selected: [exercise.id] });
    expect(view.getByRole('button', { name: 'PRESS, En la rutina' })).toBeDisabled();
  });
  it('whole picker disabled: search, chips, rows and create ignore presses', () => {
    const exercise = pickerExercise(1, { name: 'PRESS' }), { view, props } = body({ rows: [exercise], disabled: true, ...session });
    expect(view.getByLabelText('Buscar ejercicio').props.editable).toBe(false);
    fireEvent.press(view.getByRole('button', { name: 'PRESS' })); fireEvent.press(view.getByRole('button', { name: 'Crear ejercicio nuevo' })); fireEvent.press(view.getByRole('radio', { name: 'Pecho' }));
    expect(props.onToggle).not.toHaveBeenCalled(); expect(props.onCreate).not.toHaveBeenCalled(); expect(props.onGroup).not.toHaveBeenCalled();
    expect(view.getByRole('button', { name: 'PRESS' })).toBeDisabled(); expect(view.getByRole('button', { name: 'Crear ejercicio nuevo' })).toBeDisabled(); expect(view.getByRole('radio', { name: 'Pecho' })).toBeDisabled();
  });
});

describe('exercise picker body (fallback): create row, search and filters', () => {
  it('shows «Crear ejercicio nuevo» only for session && canCreate, and calls onCreate', () => {
    const rows = [pickerExercise(1, { name: 'PRESS' })], created = body({ rows, ...session });
    fireEvent.press(created.view.getByRole('button', { name: 'Crear ejercicio nuevo' })); expect(created.props.onCreate).toHaveBeenCalledTimes(1); created.view.unmount();
    expect(body({ rows }).view.queryByText(/Crear/)).toBeNull(); // routine picker with results
    expect(body({ rows, canCreate: false, ...session }).view.queryByText(/Crear/)).toBeNull(); // library not ready
  });
  it('names the search in the create row, trimmed, with the exact label and text', () => {
    const { view } = body({ rows: [pickerExercise(1)], query: ' Nuevo ', ...session });
    expect(view.getByRole('button', { name: 'Crear “Nuevo”' })).toBeTruthy(); expect(view.getByText('Crear “Nuevo”')).toBeTruthy(); expect(view.queryByText('Crear ejercicio nuevo')).toBeNull();
  });
  it('only the create row carries the champagne accent as text; exercise names never do', () => {
    const { view } = body({ rows: [pickerExercise(1, { name: 'PRESS' })], ...session }), accent = brandTokens.palette.light.accent;
    expect(StyleSheet.flatten(view.getByText('Crear ejercicio nuevo').props.style).color).toBe(accent);
    expect(StyleSheet.flatten(view.getByText('PRESS').props.style).color).not.toBe(accent);
  });
  it('forwards search text and the muscle filter, and reflects the selected chip', () => {
    const { view, props } = body({ group: 'pecho', rows: [pickerExercise(1)] });
    fireEvent.changeText(view.getByLabelText('Buscar ejercicio'), 'pre'); expect(props.onQuery).toHaveBeenCalledWith('pre');
    expect(view.getByRole('radio', { name: 'Pecho' }).props.accessibilityState).toMatchObject({ checked: true });
    fireEvent.press(view.getByRole('radio', { name: 'Todos' })); expect(props.onGroup).toHaveBeenCalledWith(null);
  });
  it.each([false, true])('renders in light and dark using theme tokens only (dark=%s)', dark => {
    const { view } = body({ rows: pickerExercises(3), ...session }, dark), scheme = brandTokens.palette[dark ? 'dark' : 'light'];
    expect(view.getAllByRole('button')).toHaveLength(4);
    expect(StyleSheet.flatten(view.getByText('EJERCICIO 1').props.style).color).toBe(scheme.text);
    expect(StyleSheet.flatten(view.getByText('Crear ejercicio nuevo').props.style).color).toBe(scheme.accent);
  });
  it('has no network access', () => {
    body({ rows: pickerExercises(5), ...session }); expect(fetchSpy).not.toHaveBeenCalled();
  });
});

