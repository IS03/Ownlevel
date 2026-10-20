import { act, fireEvent, render, within } from '@testing-library/react-native';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Alert } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { OwnlevelThemeProvider } from '@/design-system';
import { MetricDefinitionsScreen } from './definitions-screen';
import { defId, definition, fixtureDefinitions } from './definitions-fixture.test-helper';

const mockRead = jest.fn<(client: unknown) => Promise<unknown>>();
const mockMutate = jest.fn<(client: unknown, intent: unknown) => Promise<unknown>>();
const mockReorder = jest.fn<(client: unknown, intent: unknown) => Promise<unknown>>();
const mockStore = new Map<string, string>();
const mockFocus: (() => void)[] = [];
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('@/settings/native-segmented',()=>jest.requireActual('@/settings/native-segmented.tsx'));
jest.mock('@/design-system/app-sheet',()=>{
 const React=jest.requireActual<typeof import('react')>('react');
 const {View}=jest.requireActual<typeof import('react-native')>('react-native');
 const Context=React.createContext<()=>void>(()=>{});
 return {AppSheet:({children,onClose,testID}:{children:React.ReactNode;onClose:()=>void;testID:string})=><Context.Provider value={onClose}><View testID={testID}>{children}</View></Context.Provider>,useAppSheetDismiss:()=>{const close=React.useContext(Context);return(after?:()=>void)=>{close();after?.();};}};
});
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }), useFocusEffect: (effect: () => void) => { mockFocus.push(effect); } }));
jest.mock('@/auth', () => ({ useMobileAuth: () => ({ session: { user: { id: 'owner' } } }) }));
const mockClient = { request: jest.fn(), read: jest.fn() };
jest.mock('@/api', () => ({ useMobileApi: () => ({ client: mockClient }) }));
jest.mock('@/api/metric-definitions', () => ({ ...jest.requireActual<object>('@/api/metric-definitions'),
  fetchMetricDefinitions: (c: unknown) => mockRead(c), mutateMetricDefinition: (c: unknown, i: unknown) => mockMutate(c, i),
  reorderMetricDefinitions: (c: unknown, i: unknown) => mockReorder(c, i) }));
jest.mock('@react-native-async-storage/async-storage', () => ({ __esModule: true, default: {
  getItem: async (k: string) => mockStore.get(k) ?? null, setItem: async (k: string, v: string) => { mockStore.set(k, v); }, removeItem: async (k: string) => { mockStore.delete(k); },
} }));

const meta = { durationMs: 1, httpStatus: 200, outcome: 'ok' as const };
const flush = () => act(async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); });
const wrap = () => render(<SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }}>
  <OwnlevelThemeProvider initialMode="light"><MetricDefinitionsScreen /></OwnlevelThemeProvider></SafeAreaProvider>);

beforeEach(() => {
  jest.clearAllMocks(); mockStore.clear(); mockFocus.length = 0;
  mockRead.mockResolvedValue({ status: 'ok', data: { definitions: fixtureDefinitions() }, meta });
  mockMutate.mockImplementation(async (_c, i) => {
    const intent = i as { operation: string; metricId: string | null };
    return { status: 'ok', data: { status: 'confirmed', operation: intent.operation, metricId: intent.metricId ?? defId(99),
      definition: intent.operation === 'delete' ? null : definition({ id: intent.metricId ?? defId(99) }) }, meta };
  });
  mockReorder.mockImplementation(async (_c, i) => ({ status: 'ok', data: { status: 'confirmed', operation: 'reorder', metricIds: (i as { metricIds: string[] }).metricIds }, meta }));
});

describe('Administrar métricas', () => {
  it('lists active definitions in order and archived ones apart, with system/custom/history state', async () => {
    const view = wrap(); await flush();
    const active = within(view.getByTestId('metric-definitions-active'));
    expect(active.getAllByText(/^(Pasos|Agua|Sueño|Lectura|Correr)$/).map(n => n.props.children)).toEqual(['Pasos', 'Agua', 'Sueño', 'Lectura', 'Correr']);
    expect(within(view.getByTestId(`metric-definition-${defId(1)}`)).getByText('Sistema · Con historial')).toBeTruthy();
    expect(within(view.getByTestId(`metric-definition-${defId(1)}`)).getByText('Número entero · pasos · Objetivo 10.000 pasos')).toBeTruthy();
    expect(within(view.getByTestId(`metric-definition-${defId(3)}`)).getByText('Duración (h y min) · Objetivo 8 h 0 min')).toBeTruthy();
    expect(within(view.getByTestId(`metric-definition-${defId(11)}`)).getByText('Decimal · km · Sin objetivo')).toBeTruthy();
    fireEvent.press(view.getByText('Archivadas · 1'));
    const archived = within(view.getByTestId('metric-definitions-archived'));
    expect(archived.getByText('Mate')).toBeTruthy(); expect(archived.getByText('Sistema · Archivada · Con historial')).toBeTruthy();
    expect(view.getByLabelText('Editar Pasos').props.accessibilityActions).not.toContainEqual({name:'moveUp',label:'Mover arriba'});
    expect(view.getByLabelText('Editar Correr').props.accessibilityActions).not.toContainEqual({name:'moveDown',label:'Mover abajo'});
  });
  it('a system definition only exposes the target; no delete, archive is offered', async () => {
    const view = wrap(); await flush();
    fireEvent.press(view.getByRole('button', { name: 'Editar Pasos' }));
    const editor = within(view.getByTestId('metric-definition-editor'));
    expect(editor.getByLabelText('Nombre').props.editable).toBe(false);
    expect(editor.getByLabelText('Unidad').props.editable).toBe(false);
    expect(editor.getByRole('radio', { name: 'Decimal' })).toBeDisabled();
    expect(editor.getByLabelText('Objetivo (opcional)').props.editable).toBe(true);
    expect(editor.queryByRole('button', { name: 'Eliminar métrica' })).toBeNull();
    const alert=jest.spyOn(Alert,'alert');
    expect(editor.queryByLabelText('Más opciones de métrica')).toBeNull();
    fireEvent.press(editor.getByLabelText('Archivar métrica'));
    expect(alert.mock.calls.at(-1)?.[2]?.map(b=>b.text)).toContain('Archivar');
    expect(alert.mock.calls.at(-1)?.[2]?.map(b=>b.text)).not.toContain('Eliminar métrica');
    expect(editor.getByLabelText('Ícono: Libro')).toBeEnabled();
    // No "use default" button: only a chosen icon is marked, and tapping it again goes back to the default.
    expect(editor.queryByText('Usar ícono predeterminado')).toBeNull();
    expect(editor.getByLabelText('Ícono: Libro').props.accessibilityState.checked).toBe(false);
    fireEvent.press(editor.getByLabelText('Ícono: Libro'));
    expect(editor.getByLabelText('Ícono: Libro').props.accessibilityState.checked).toBe(true);
    fireEvent.press(editor.getByLabelText('Ícono: Libro'));
    expect(editor.getByLabelText('Ícono: Libro').props.accessibilityState.checked).toBe(false);
    expect(editor.getByText(/Podés elegir su ícono, objetivo y carga rápida/)).toBeTruthy();alert.mockRestore();
  });
  it('custom with history: type/unit frozen and explained, archive instead of delete; without history delete is offered', async () => {
    const view = wrap(); await flush();
    fireEvent.press(view.getByRole('button', { name: 'Editar Correr' }));
    let editor = within(view.getByTestId('metric-definition-editor'));
    expect(editor.getByLabelText('Nombre').props.editable).toBe(true);
    expect(editor.getByLabelText('Unidad').props.editable).toBe(false);
    expect(editor.getByText(/el tipo y la unidad quedan como estaban/)).toBeTruthy();
    expect(editor.queryByRole('button', { name: 'Eliminar métrica' })).toBeNull();
    fireEvent.press(editor.getByRole('button', { name: 'Cerrar' }));
    fireEvent.press(view.getByRole('button', { name: 'Editar Lectura' }));
    editor = within(view.getByTestId('metric-definition-editor'));
    const alert = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => { buttons?.find(b => b.text === 'Eliminar métrica'||b.text==='Eliminar')?.onPress?.(); });
    await act(async () => { fireEvent.press(editor.getByRole('button', { name: /^(Archivar|Eliminar) métrica$/ })); }); await flush();
    expect(alert).toHaveBeenCalled();
    expect(mockMutate.mock.calls[0][1]).toMatchObject({ operation: 'delete', metricId: defId(10), fields: null });
    expect(view.getByText('Métrica eliminada.')).toBeTruthy();
    alert.mockRestore();
  });
  it('creates a custom metric from the form and re-reads server truth', async () => {
    const view = wrap(); await flush();
    fireEvent.press(view.getByRole('button', { name: 'Crear métrica' }));
    const editor = within(view.getByTestId('metric-definition-editor'));
    fireEvent.changeText(editor.getByLabelText('Nombre'), 'Agua con gas');
    fireEvent.press(editor.getByRole('radio', { name: 'Decimal' }));
    fireEvent.changeText(editor.getByLabelText('Unidad'), 'L');
    fireEvent.changeText(editor.getByLabelText('Objetivo (opcional)'), '0,5');
    const created = [...fixtureDefinitions().slice(0, 5), definition({ id: defId(99), name: 'Agua con gas', unit: 'L', valueType: 'decimal', target: 0.5, sortOrder: 5 }), fixtureDefinitions()[5]];
    mockRead.mockResolvedValue({ status: 'ok', data: { definitions: created }, meta });
    await act(async () => { fireEvent.press(editor.getByRole('button', { name: 'Crear métrica' })); }); await flush();
    expect(mockMutate).toHaveBeenCalledTimes(1);
    expect(mockMutate.mock.calls[0][1]).toMatchObject({ operation: 'create', fields: { name: 'Agua con gas', valueType: 'decimal', unit: 'L', target: 0.5 } });
    expect(view.getByLabelText('Guardado')).toBeTruthy();
    expect(within(view.getByTestId(`metric-definition-${defId(99)}`)).getByText('Decimal · L · Objetivo 0,5 L')).toBeTruthy();
  });
  it('reorders with one full-list move and refreshes on focus', async () => {
    const view = wrap(); await flush();
    await act(async () => { fireEvent(view.getByLabelText('Editar Pasos'),'accessibilityAction',{nativeEvent:{actionName:'moveDown'}}); }); await flush();
    expect(mockReorder.mock.calls[0][1]).toMatchObject({ metricIds: [defId(2), defId(1), defId(3), defId(10), defId(11)], expectedMetricIds: [defId(1), defId(2), defId(3), defId(10), defId(11)] });
    const reads = mockRead.mock.calls.length;
    await act(async () => { mockFocus.at(-1)!(); }); await flush();
    expect(mockRead.mock.calls.length).toBe(reads + 1);
  });
  it('unavailable first read is an explicit error, never an empty list', async () => {
    mockRead.mockResolvedValue({ status: 'unavailable', reason: 'network', meta: { durationMs: 1, httpStatus: null, outcome: 'unavailable' } });
    const view = wrap(); await flush();
    expect(view.getByText('No pudimos cargar tus métricas.')).toBeTruthy();
    expect(view.queryByText('No tenés métricas activas.')).toBeNull();
  });
});
