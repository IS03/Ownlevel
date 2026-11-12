import { act, fireEvent, render } from '@testing-library/react-native';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { ReactNode } from 'react';
import type { ReactTestInstance } from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { detailFixture } from '@/api/routine-editor.fixture';
import { OwnlevelThemeProvider } from '@/design-system';
import { SessionExercisePicker } from './active-session-sheets';
import { RoutineExercisePicker } from './routine-exercise-picker';
import { pickerExercise } from './routine-exercise-picker-body-test-fixtures';

// Both consumers mount the iOS body here (jest resolves the .ios sibling), over the real Expo UI wrappers with native views replaced.
const mockResource = jest.fn();
jest.mock('expo', () => {
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return { ...jest.requireActual<object>('expo'), requireNativeView: (_module: string, name: string) => function NativeView({ children, ...props }: { children?: ReactNode }) {
    return <View {...props} testID={`native-${name}`}>{children}</View>;
  } };
});
jest.mock('@expo/ui/swift-ui', () => ({ ...jest.requireActual<object>('@expo/ui/swift-ui'), useNativeState: (value: unknown) => ({ value }) }));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('expo-glass-effect', () => ({ isGlassEffectAPIAvailable: () => false, isLiquidGlassAvailable: () => false }));
jest.mock('@/api', () => ({ fetchMobileTrainingExercises: jest.fn(), createMobileTrainingExercise: jest.fn(), useApiResource: () => mockResource() }));
jest.mock('./routine-editor-sheet', () => ({ RoutineEditorSheet: ({ children }: { children: ReactNode }) => children }));

type Modifier = { $type: string; [key: string]: unknown };
const modifier = (node: ReactTestInstance, type: string) => ((node.props.modifiers ?? []) as Modifier[]).find(item => item.$type === type);
const labelOf = (node: ReactTestInstance) => modifier(node, 'accessibilityLabel')?.label as string | undefined;
const wrap = (children: ReactNode) => <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 83 } }}><OwnlevelThemeProvider initialMode="light">{children}</OwnlevelThemeProvider></SafeAreaProvider>;
const ready = (exercises: unknown[]) => ({ state: { status: 'ready', current: { data: { catalog: { status: 'ok', data: { exercises, routines: [] } } } } }, refresh: jest.fn() });
const rowLabels = (view: ReturnType<typeof render>) => view.getAllByTestId('native-HStackView').filter(node => modifier(node, 'accessibilityAddTraits')).map(labelOf);
const rowNode = (view: ReturnType<typeof render>, label: string) => view.getAllByTestId('native-HStackView').find(node => labelOf(node) === label)!;
const tap = (node: ReactTestInstance) => fireEvent(node, 'globalEvent', { nativeEvent: { onTapGesture: {} } });
const search = (view: ReturnType<typeof render>, value: string) => fireEvent(view.getByTestId('native-TextFieldView'), 'textChange', { nativeEvent: { value } });

describe('session exercise picker on the iOS body', () => {
  beforeEach(() => { mockResource.mockReset(); });
  const press = pickerExercise(1, { name: 'PRESS' }), row = pickerExercise(2, { name: 'ROW' });
  const sheet = (onAdd = jest.fn(), onCreate = jest.fn()) => ({ onAdd, onCreate, view: render(wrap(<SessionExercisePicker visible client={{} as never} existingIds={new Set([press.id])} onClose={jest.fn()} onDismiss={jest.fn()} onCreate={onCreate} onAdd={onAdd as never} />)) });
  it('lists the session rows, keeps an existing one disabled and adds exactly once on tap', async () => {
    mockResource.mockReturnValue(ready([press, row])); const { view, onAdd } = sheet();
    expect(rowLabels(view)).toEqual(['PRESS, En la sesión', 'ROW']); expect(modifier(rowNode(view, 'PRESS, En la sesión'), 'disabled')).toMatchObject({ disabled: true });
    await act(async () => { tap(rowNode(view, 'PRESS, En la sesión')); }); expect(onAdd).not.toHaveBeenCalled();
    await act(async () => { tap(rowNode(view, 'ROW')); tap(rowNode(view, 'ROW')); }); expect(onAdd).toHaveBeenCalledTimes(1); expect(onAdd).toHaveBeenCalledWith(row);
  });
  it('offers creation first and forwards the typed name; an unavailable read never shows the empty text', () => {
    mockResource.mockReturnValue(ready([press, row])); const { view, onCreate } = sheet();
    const create = () => view.getAllByTestId('native-Button').find(node => !node.props.label)!;
    expect(labelOf(create())).toBe('Crear ejercicio nuevo'); search(view, 'Nuevo'); expect(labelOf(create())).toBe('Crear “Nuevo”');
    fireEvent(create(), 'buttonPress'); expect(onCreate).toHaveBeenCalledWith('Nuevo'); view.unmount();
    mockResource.mockReturnValue({ state: { status: 'unavailable' }, refresh: jest.fn() }); const failed = sheet().view;
    expect(failed.getByText('No pudimos cargar la biblioteca.')).toBeTruthy(); expect(failed.queryAllByTestId('native-LazyVStackView')).toHaveLength(0);
  });
  it('filters rows by the search without changing the others', () => {
    mockResource.mockReturnValue(ready([press, row])); const { view } = sheet();
    search(view, 'row'); expect(rowLabels(view)).toEqual(['ROW']);
  });
});

describe('routine exercise picker on the iOS body', () => {
  beforeEach(() => { mockResource.mockReset(); });
  const existing = detailFixture.items[0]!.exercise, one = pickerExercise(10, { name: 'Dominadas' }), two = pickerExercise(11, { name: 'Aperturas' });
  const open = (onAdd = jest.fn()) => ({ onAdd, view: render(wrap(<RoutineExercisePicker client={null} detail={detailFixture} onAdd={onAdd} onClose={jest.fn()} pending={false} createIdempotencyKey={() => 'key'} />)) });
  it('multi-selects, marks selections and existing rows, and adds the picked exercises', () => {
    mockResource.mockReturnValue(ready([{ ...pickerExercise(1, { name: 'Press' }), id: existing.id }, one, two])); const { view, onAdd } = open();
    expect(rowLabels(view)).toEqual(['Aperturas', 'Dominadas', 'Press, En la rutina']); expect(view.getByRole('button', { name: 'Agregar 0 ejercicios' })).toBeDisabled();
    tap(rowNode(view, 'Press, En la rutina')); expect(view.getByRole('button', { name: 'Agregar 0 ejercicios' })).toBeDisabled(); // existing rows never select
    tap(rowNode(view, 'Dominadas')); tap(rowNode(view, 'Aperturas'));
    expect(rowLabels(view)).toEqual(['Aperturas, seleccionado', 'Dominadas, seleccionado', 'Press, En la rutina']);
    fireEvent.press(view.getByRole('button', { name: 'Agregar 2 ejercicios' })); expect(onAdd).toHaveBeenCalledWith([one, two]);
    tap(rowNode(view, 'Dominadas, seleccionado')); expect(rowLabels(view)).toContain('Dominadas');
  });
  it('a search without matches offers only «Crear “…”»; a non-ready library asks to refresh', () => {
    mockResource.mockReturnValue(ready([one])); const { view } = open();
    search(view, 'zzz'); expect(rowLabels(view)).toEqual([]); expect(view.getAllByTestId('native-TextView').map(node => node.props.text)).toContain('Crear “zzz”');
    expect(view.getAllByTestId('native-TextView').map(node => node.props.text)).not.toContain('No hay ejercicios disponibles'); view.unmount();
    mockResource.mockReturnValue({ ...ready([one]), state: { status: 'refreshing', previous: { data: { catalog: { status: 'ok', data: { exercises: [one], routines: [] } } } } } });
    const stale = open().view; search(stale, 'zzz');
    expect(stale.getAllByTestId('native-TextView').map(node => node.props.text)).toContain('Actualizá la biblioteca para continuar.');
  });
});
