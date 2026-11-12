import { fireEvent, render, within } from '@testing-library/react-native';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { ReactNode } from 'react';
import type { ReactTestInstance } from 'react-test-renderer';
import { brandTokens, darkColors, lightColors, OwnlevelThemeProvider } from '@/design-system';
import { RoutineExercisePickerBody } from './routine-exercise-picker-body.ios';
import type { RoutineExercisePickerBodyProps } from './routine-exercise-picker-body.types';
import { LONG_NAME, pickerExercise, pickerExercises, pickerProps } from './routine-exercise-picker-body-test-fixtures';

// Keep the installed Expo UI wrappers and their modifier event wiring; replace only the native views.
// Every native view renders as a View whose testID is `native-<ViewName>` and whose props (modifiers, text, ...) stay inspectable.
jest.mock('expo', () => {
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return { ...jest.requireActual<object>('expo'), requireNativeView: (_module: string, name: string) => function NativeView({ children, ...props }: { children?: ReactNode }) {
    return <View {...props} testID={`native-${name}`}>{children}</View>;
  } };
});
// The shared-object state backing the native text field needs the native module: stand in a plain holder.
jest.mock('@expo/ui/swift-ui', () => ({ ...jest.requireActual<object>('@expo/ui/swift-ui'), useNativeState: (value: unknown) => ({ value }) }));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
let mockGlass = false;
jest.mock('expo-glass-effect', () => ({ isGlassEffectAPIAvailable: () => mockGlass, isLiquidGlassAvailable: () => mockGlass }));
// The body has no API: any network access in these tests is a regression.
const fetchSpy = jest.fn();
Object.defineProperty(globalThis, 'fetch', { configurable: true, value: fetchSpy });
beforeEach(() => { mockGlass = false; });

type Modifier = { $type: string; [key: string]: unknown };
const modifiers = (node: ReactTestInstance) => (node.props.modifiers ?? []) as Modifier[];
const modifier = (node: ReactTestInstance, type: string) => modifiers(node).find(item => item.$type === type);
const surfaceOf = (node: ReactTestInstance) => { const item = modifier(node, 'background'); return item && { color: (item.style as { color: string }).color, shape: item.shape, cornerRadius: item.cornerRadius, cornerStyle: item.roundedCornerStyle }; };
const labelOf = (node: ReactTestInstance) => modifier(node, 'accessibilityLabel')?.label as string | undefined;

function body(patch: Partial<RoutineExercisePickerBodyProps> = {}, dark = false) {
  const props = pickerProps(patch), colors = dark ? darkColors : lightColors;
  const view = render(<OwnlevelThemeProvider initialMode={dark ? 'dark' : 'light'}><RoutineExercisePickerBody {...props} /></OwnlevelThemeProvider>);
  /** Exercise rows: the tappable HStacks that carry the button trait. */
  const rows = () => view.getAllByTestId('native-HStackView').filter(node => modifier(node, 'accessibilityAddTraits'));
  const row = (label: string) => { const found = rows().find(node => labelOf(node) === label); if (!found) throw new Error(`No row labelled “${label}”. Rows: ${rows().map(labelOf).join(' | ')}`); return found; };
  const texts = () => view.queryAllByTestId('native-TextView').map(node => node.props.text as string);
  const tap = (node: ReactTestInstance) => fireEvent(node, 'globalEvent', { nativeEvent: { onTapGesture: {} } });
  const create = () => view.queryAllByTestId('native-Button').filter(node => !node.props.label);
  return { props, view, colors, rows, row, texts, tap, create };
}
const session = { session: true } as const;
const isDisabled = (node: ReactTestInstance) => modifier(node, 'disabled')?.disabled === true;
const foreground = (node: ReactTestInstance) => (modifier(node, 'foregroundStyle')?.style as { color?: string } | undefined)?.color ?? modifier(node, 'foregroundStyle')?.style;
const textNode = (view: ReturnType<typeof body>['view'], text: string) => view.getAllByTestId('native-TextView').find(node => node.props.text === text)!;

describe('exercise picker body (iOS): structure', () => {
  it('renders search, chips and results as separate zones: results are solid cards on a plain scroll view, not a native List', () => {
    const { view } = body({ rows: pickerExercises(3), ...session });
    expect(view.getAllByTestId('native-ScrollViewComponent')).toHaveLength(2); // chips (horizontal) + results (vertical)
    expect(view.queryByTestId('native-ListView')).toBeNull(); expect(view.queryByTestId('native-ListForEach')).toBeNull();
    const [, results] = view.getAllByTestId('native-ScrollViewComponent');
    expect(modifier(results!, 'scrollDismissesKeyboard')).toMatchObject({ mode: 'immediately' });
    const background = surfaceOf(view.getByTestId('native-LazyVStackView'));
    expect(background).toEqual({ color: brandTokens.palette.light.surface, shape: 'roundedRectangle', cornerRadius: brandTokens.radius.card, cornerStyle: 'continuous' });
  });
  it.each([false, true])('uses theme tokens for the card and the colour scheme (dark=%s)', dark => {
    const { view, colors } = body({ rows: pickerExercises(2), ...session }, dark);
    expect(view.getByTestId('native-HostView').props.colorScheme).toBe(dark ? 'dark' : 'light');
    expect(surfaceOf(view.getByTestId('native-LazyVStackView'))?.color).toBe(colors.surface);
  });
  it('insets the hairline to the text, between rows only (none after the last)', () => {
    const { view } = body({ rows: pickerExercises(3) });
    const lines = view.getAllByTestId('native-RectangleView');
    expect(lines).toHaveLength(2);
    lines.forEach(line => { expect(modifier(line, 'padding')).toMatchObject({ leading: brandTokens.layout.cardPadding }); expect(modifier(line, 'frame')).toMatchObject({ height: 0.5 }); expect(modifier(line, 'accessibilityHidden')).toBeTruthy(); });
  });
  it('lays each row out with at least the input height, a flexible frame and no fixed height', () => {
    const { rows } = body({ rows: [pickerExercise(1)] });
    const frame = modifier(rows()[0]!, 'frame')!;
    expect(frame.minHeight).toBe(brandTokens.layout.inputHeight); expect(frame.minHeight as number).toBeGreaterThanOrEqual(brandTokens.layout.minTouch); expect(frame).not.toHaveProperty('height');
  });
  it('keeps the search field and the chips (glass off): same labels, selected chip, disabled state', () => {
    const { view, props } = body({ group: 'pecho' });
    expect(view.getAllByTestId('native-Button').map(node => node.props.label)).toEqual(['Todos', 'Pecho', 'Espalda', 'Piernas', 'Hombros', 'Bíceps', 'Tríceps', 'Abdomen', 'Cardio']);
    fireEvent(view.getAllByTestId('native-Button').find(node => node.props.label === 'Espalda')!, 'buttonPress'); expect(props.onGroup).toHaveBeenCalledWith('espalda');
    expect(labelOf(view.getByTestId('native-TextFieldView'))).toBe('Buscar ejercicio');
  });
  it('keeps glass on the chips only when available, and never on rows or cards', () => {
    mockGlass = true;
    const { view, rows } = body({ rows: pickerExercises(2), ...session });
    const chips = view.getAllByTestId('native-Button').filter(node => node.props.label);
    expect(chips.every(chip => modifier(chip, 'buttonStyle')?.style === 'glass' || modifier(chip, 'buttonStyle')?.style === 'glassProminent')).toBe(true);
    const glassOwners = view.UNSAFE_getAllByProps({}).filter(node => typeof node.type === 'string' && modifiers(node).some(item => item.$type === 'glassEffect'));
    expect(glassOwners.length).toBeGreaterThan(0); // the search capsule
    rows().forEach(row => expect(modifier(row, 'glassEffect')).toBeUndefined());
    expect(modifier(view.getByTestId('native-LazyVStackView'), 'glassEffect')).toBeUndefined();
  });
});

describe('exercise picker body (iOS): empty states', () => {
  it('library not ready: only the refresh message, no create, no list rows', () => {
    const { texts, rows, create } = body({ canCreate: false, ...session });
    expect(texts()).toContain('Actualizá la biblioteca para continuar.'); expect(texts()).not.toContain('No hay ejercicios disponibles'); expect(rows()).toHaveLength(0); expect(create()).toHaveLength(0);
  });
  it('library not ready with a query in the routine picker offers no creation', () => {
    const { texts, create } = body({ canCreate: false, query: 'Nuevo' });
    expect(texts()).toContain('Actualizá la biblioteca para continuar.'); expect(create()).toHaveLength(0);
  });
  it('session with no rows: create first and the neutral empty text, inside the card', () => {
    const { texts, create, view } = body({ ...session });
    expect(create()).toHaveLength(1); expect(texts()).toContain('No hay ejercicios disponibles');
    expect(surfaceOf(view.getAllByTestId('native-VStackView').find(node => modifier(node, 'background'))!)).toMatchObject({ color: brandTokens.palette.light.surface, cornerRadius: brandTokens.radius.card });
  });
  it('routine picker with no rows and no query: only the neutral empty text', () => {
    const { texts, create } = body();
    expect(texts()).toEqual(expect.arrayContaining(['No hay ejercicios disponibles'])); expect(create()).toHaveLength(0);
  });
  it('routine picker with a query and no match: only «Crear “…”» (trimmed), which calls onCreate', () => {
    const { texts, create, props, view } = body({ query: '  Remo  ' });
    expect(texts()).toContain('Crear “Remo”'); expect(texts()).not.toContain('No hay ejercicios disponibles');
    const [button] = create(); expect(labelOf(button!)).toBe('Crear “Remo”');
    fireEvent(button!, 'buttonPress'); expect(props.onCreate).toHaveBeenCalledTimes(1);
    expect(view.getAllByTestId('native-ImageView').some(node => node.props.systemName === 'plus')).toBe(true);
  });
});

describe('exercise picker body (iOS): rows', () => {
  it('renders one row with name (headline) and summary (muted footnote), and toggles it by id', () => {
    const exercise = pickerExercise(1, { name: 'PRESS', implement: 'Barra', weightMode: 'Peso total' }), { view, row, tap, props, colors } = body({ rows: [exercise] });
    expect(modifier(textNode(view, 'PRESS'), 'font')).toMatchObject({ textStyle: 'headline' }); expect(foreground(textNode(view, 'PRESS'))).toBe(colors.text);
    expect(modifier(textNode(view, 'Barra · Peso total'), 'font')).toMatchObject({ textStyle: 'footnote' }); expect(foreground(textNode(view, 'Barra · Peso total'))).toBe(colors.textMuted);
    const node = row('PRESS'); expect(modifier(node, 'accessibilityAddTraits')?.traits).toEqual(['isButton']); expect(isDisabled(node)).toBe(false);
    tap(node); expect(props.onToggle).toHaveBeenCalledTimes(1); expect(props.onToggle).toHaveBeenCalledWith(exercise.id);
  });
  it('a row without implement or mode renders no summary text', () => {
    const { texts } = body({ rows: [pickerExercise(1, { name: 'DOMINADAS', implement: null, weightMode: null })] });
    expect(texts()).toEqual(['DOMINADAS']);
  });
  it('renders 200 rows with unique labels and routes each tap to its own id', () => {
    const rows = pickerExercises(200), started = Date.now(), { rows: nodes, row, tap, props, view } = body({ rows });
    expect(Date.now() - started).toBeLessThan(5000);
    expect(nodes()).toHaveLength(200); expect(new Set(nodes().map(labelOf)).size).toBe(200); expect(view.getAllByTestId('native-RectangleView')).toHaveLength(199);
    tap(row('EJERCICIO 137')); expect(props.onToggle).toHaveBeenCalledTimes(1); expect(props.onToggle).toHaveBeenCalledWith(rows[136]!.id);
  });
  it('keeps a very long name complete: the whole name is the label and the text is allowed to wrap', () => {
    const { view, row } = body({ rows: [pickerExercise(1, { name: LONG_NAME })] });
    const node = row(LONG_NAME), name = textNode(view, LONG_NAME);
    expect(labelOf(node)).toBe(LONG_NAME); expect(modifier(name, 'fixedSize')).toMatchObject({ vertical: true });
    expect(modifiers(name).map(item => item.$type)).not.toContain('lineLimit'); expect(modifiers(name).map(item => item.$type)).not.toContain('truncationMode');
    expect(modifier(name, 'font')).toMatchObject({ textStyle: 'headline' }); // a text style scales with Dynamic Type; no fixed size
  });
});

describe('exercise picker body (iOS): states', () => {
  it.each([[true, 'En la sesión'], [false, 'En la rutina']])('an existing row is disabled, muted, labelled and never toggled (session=%s)', (isSession, label) => {
    const exercise = pickerExercise(1, { name: 'PRESS' }), { view, row, tap, props, colors, texts } = body({ rows: [exercise, pickerExercise(2, { name: 'ROW' })], existing: new Set([exercise.id]), session: isSession });
    const node = row(`PRESS, ${label}`);
    expect(isDisabled(node)).toBe(true); expect(texts()).toContain(label); expect(foreground(textNode(view, label))).toBe(colors.textMuted); expect(foreground(textNode(view, 'PRESS'))).toBe(colors.textMuted);
    expect(foreground(textNode(view, 'ROW'))).toBe(colors.text);
    tap(node); expect(props.onToggle).not.toHaveBeenCalled(); // the guard also holds if the native disabled flag were bypassed
    tap(row('ROW')); expect(props.onToggle).toHaveBeenCalledTimes(1); expect(props.onToggle).toHaveBeenCalledWith(pickerExercise(2).id);
  });
  it('the state does not rely on color alone: the text label plus a muted check, both non-accent', () => {
    const exercise = pickerExercise(1, { name: 'PRESS' }), { view, colors } = body({ rows: [exercise], existing: new Set([exercise.id]), ...session });
    const checks = view.getAllByTestId('native-ImageView').filter(node => node.props.systemName === 'checkmark');
    expect(checks).toHaveLength(1); expect(modifiers(checks[0]!).find(item => item.$type === 'foregroundStyle')).toBeTruthy(); expect(foreground(checks[0]!)).toBe(colors.textMuted);
    expect(modifier(checks[0]!, 'accessibilityHidden')).toBeTruthy(); expect(foreground(textNode(view, 'En la sesión'))).not.toBe(colors.primary);
  });
  it('shows the adding spinner and then the confirmation, keeping the row label and meaning', () => {
    const exercise = pickerExercise(1, { name: 'PRESS' }), other = pickerExercise(2, { name: 'ROW' });
    const first = body({ rows: [exercise, other], adding: { id: exercise.id, done: false }, disabled: true, ...session });
    expect(first.view.getAllByTestId('native-ProgressView')).toHaveLength(1); expect(first.view.queryAllByTestId('native-ImageView').filter(node => node.props.systemName === 'checkmark.circle.fill')).toHaveLength(0);
    expect(labelOf(first.row('PRESS'))).toBe('PRESS'); first.view.unmount();
    const second = body({ rows: [exercise, other], adding: { id: exercise.id, done: true }, disabled: true, ...session });
    expect(second.view.queryAllByTestId('native-ProgressView')).toHaveLength(0);
    const done = second.view.getAllByTestId('native-ImageView').filter(node => node.props.systemName === 'checkmark.circle.fill'); expect(done).toHaveLength(1); expect(foreground(done[0]!)).toBe(second.colors.primary);
    second.tap(second.row('PRESS')); expect(second.props.onToggle).not.toHaveBeenCalled();
  });
  it('marks a selected row (routine picker) with the champagne check and “, seleccionado”, and keeps it toggleable', () => {
    const exercise = pickerExercise(1, { name: 'PRESS' }), { view, row, tap, props, colors } = body({ rows: [exercise, pickerExercise(2, { name: 'ROW' })], selected: [exercise.id] });
    const node = row('PRESS, seleccionado'); expect(isDisabled(node)).toBe(false);
    const checks = view.getAllByTestId('native-ImageView').filter(item => item.props.systemName === 'checkmark.circle.fill'); expect(checks).toHaveLength(1); expect(foreground(checks[0]!)).toBe(colors.primary);
    tap(node); expect(props.onToggle).toHaveBeenCalledWith(exercise.id);
    // No plus affordance in the routine picker (multi-select shows nothing until picked).
    expect(view.queryAllByTestId('native-ImageView').filter(item => item.props.systemName === 'plus')).toHaveLength(0);
  });
  it('shows a quiet muted plus on the session rows only', () => {
    const { view, colors } = body({ rows: pickerExercises(2), ...session });
    const plus = view.getAllByTestId('native-ImageView').filter(node => node.props.systemName === 'plus'); expect(plus).toHaveLength(2); plus.forEach(node => expect(foreground(node)).toBe(colors.textMuted));
  });
  it('an existing row wins over a selected one in the label (same precedence as before)', () => {
    const exercise = pickerExercise(1, { name: 'PRESS' }), { row } = body({ rows: [exercise], existing: new Set([exercise.id]), selected: [exercise.id] });
    expect(isDisabled(row('PRESS, En la rutina'))).toBe(true);
  });
  it('whole picker disabled: search, chips, rows and create are all disabled and ignore taps', () => {
    const exercise = pickerExercise(1, { name: 'PRESS' }), { view, row, tap, props, create } = body({ rows: [exercise], disabled: true, ...session });
    expect(isDisabled(view.getByTestId('native-TextFieldView'))).toBe(true);
    view.getAllByTestId('native-Button').forEach(node => expect(isDisabled(node)).toBe(true));
    expect(isDisabled(row('PRESS'))).toBe(true); expect(create()).toHaveLength(1);
    tap(row('PRESS')); expect(props.onToggle).not.toHaveBeenCalled();
  });
});

describe('exercise picker body (iOS): create row', () => {
  it('shows it only for session && canCreate, first, as its own card, and calls onCreate', () => {
    const rows = [pickerExercise(1, { name: 'PRESS' })], created = body({ rows, ...session });
    const [button] = created.create(); expect(labelOf(button!)).toBe('Crear ejercicio nuevo');
    const children = within(button!); expect(foreground(children.getAllByTestId('native-TextView')[0]!)).toBe(created.colors.primary);
    expect(surfaceOf(children.getByTestId('native-HStackView'))).toMatchObject({ color: created.colors.surface, cornerRadius: brandTokens.radius.card });
    expect(modifier(button!, 'buttonStyle')).toMatchObject({ style: 'plain' }); expect(modifier(children.getByTestId('native-HStackView'), 'glassEffect')).toBeUndefined();
    expect(created.view.getAllByTestId('native-Button').filter(node => !node.props.label)[0]).toBe(button); // before the first exercise row
    fireEvent(button!, 'buttonPress'); expect(created.props.onCreate).toHaveBeenCalledTimes(1); created.view.unmount();
    expect(body({ rows }).create()).toHaveLength(0); // routine picker with results
    expect(body({ rows, canCreate: false, ...session }).create()).toHaveLength(0); // library not ready
  });
  it('names the search in the create row, trimmed', () => {
    const { create, texts } = body({ rows: [pickerExercise(1)], query: ' Nuevo ', ...session });
    expect(labelOf(create()[0]!)).toBe('Crear “Nuevo”'); expect(texts()).toContain('Crear “Nuevo”'); expect(texts()).not.toContain('Crear ejercicio nuevo');
  });
  it('is the only champagne text in the list; exercise names never use the accent', () => {
    const { view, colors } = body({ rows: [pickerExercise(1, { name: 'PRESS' })], ...session });
    const accented = view.getAllByTestId('native-TextView').filter(node => foreground(node) === colors.primary).map(node => node.props.text);
    expect(accented).toEqual(['Crear ejercicio nuevo']);
  });
  it('forwards the search text from the native field', () => {
    const { view, props } = body();
    fireEvent(view.getByTestId('native-TextFieldView'), 'textChange', { nativeEvent: { value: 'pre' } }); expect(props.onQuery).toHaveBeenCalledWith('pre');
  });
});

describe('exercise picker body (iOS): isolation', () => {
  it('has no network access', () => {
    body({ rows: pickerExercises(5), ...session }); expect(fetchSpy).not.toHaveBeenCalled();
  });
});
