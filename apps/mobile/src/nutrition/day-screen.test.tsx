import { act, fireEvent, render, waitFor, within } from '@testing-library/react-native';
import { StrictMode } from 'react';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Alert, Modal, AppState, type AppStateStatus, RefreshControl, ScrollView, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import type { MobileApiClient } from '@/api/client';
import type { MobileApiReadResult } from '@/api/results';
import type { MobileNutritionDayResponse } from '@/api/nutrition-day';
import { GlassSurface, OwnlevelThemeProvider, spacing } from '@/design-system';
import { clearConfirmedReads } from '@/api/confirmed-read-cache';
import { NutritionDayScreen } from './day-screen';
import { NutritionConfigurationProvider } from './config-provider';
import { nutritionFixture } from './day-fixture.test-helper';
import { quickOptions, quickPreview, quickReceipt, quickDate } from './quick-fixture.test-helper';
import { personalFood } from './food-fixture.test-helper';
import type { QuickSelection } from '@/api/nutrition-quick';

const mockPush = jest.fn();
const mockNavigate = jest.fn();
let mockParams: Record<string, string> = {};
const mockRead = jest.fn<MobileApiClient['read']>();
const mockRequest = jest.fn<MobileApiClient['request']>();
let mockClient = { read: mockRead, request: mockRequest };
let mockUser = 'owner';
let mockToday = '2026-10-02';
jest.mock('./day-format', () => ({
  ...jest.requireActual<typeof import('./day-format')>('./day-format'), nutritionToday: () => mockToday,
}));
jest.mock('@/api', () => ({ useMobileApi: () => ({ client: mockClient }) }));
jest.mock('@/auth', () => ({ useMobileAuth: () => ({ session: { user: { id: mockUser } } }) }));
jest.mock('expo-router', () => ({ useLocalSearchParams: () => mockParams, useRouter: () => ({ navigate: mockNavigate, push: mockPush }),
  // The day screen is the focused tab.
  useFocusEffect: (callback: () => void | (() => void)) => jest.requireActual<typeof import('react')>('react').useEffect(callback, [callback]) }));
jest.mock('@/api/nutrition-report', () => ({
  ...jest.requireActual<typeof import('@/api/nutrition-report')>('@/api/nutrition-report'),
  fetchNutritionReport: (_client: unknown, query: import('@/api/nutrition-report').ReportQuery) => Promise.resolve({
    status: 'ok', data: jest.requireActual<typeof import('./report-fixture.test-helper')>('./report-fixture.test-helper').reportFixture(query), meta: { durationMs: 1, httpStatus: 200, outcome: 'ok' },
  }),
}));
jest.mock('@expo/ui/swift-ui', () => {
  const { Pressable, Text, View } = jest.requireActual<typeof import('react-native')>('react-native');
  return { Host: View, Picker: View, HStack: View, Spacer: () => null, Text, DatePicker: () => null, Menu: ({ label, children }: { label?: import('react').ReactNode; children: import('react').ReactNode }) => <View>{label}{children}</View>, Image: () => null, Button: ({ label, onPress }: { label: string; onPress?: () => void }) => <Pressable onPress={onPress}><Text>{label}</Text></Pressable> };
});
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('@react-native-async-storage/async-storage', () => jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'));
const ok = (date: string, data = nutritionFixture(date)): MobileApiReadResult<MobileNutritionDayResponse> => ({
  status: 'ok', data, meta: { durationMs: 10, httpStatus: 200, outcome: 'ok' },
});
const failure: MobileApiReadResult<MobileNutritionDayResponse> = { status: 'unavailable', reason: 'network',
  meta: { durationMs: 1, httpStatus: null, outcome: 'unavailable' } };
const element = () => <SafeAreaInsetsContext.Provider value={{ top: 0, bottom: 0, left: 0, right: 0 }}><OwnlevelThemeProvider initialMode="light"><NutritionConfigurationProvider><NutritionDayScreen /></NutritionConfigurationProvider></OwnlevelThemeProvider></SafeAreaInsetsContext.Provider>;
function finishMonthDismissal(view: ReturnType<typeof render>) {
  const sheet = view.UNSAFE_getAllByType(Modal).find(m => m.props.testID === 'nutrition-month-sheet-modal');
  if (sheet) fireEvent(sheet, 'dismiss');
}
function finishMealDismissal(view: ReturnType<typeof render>) {
  const sheet = view.UNSAFE_getAllByType(Modal).find(m => m.props.testID === 'meal-detail-sheet-modal');
  if (sheet) fireEvent(sheet, 'dismiss');
}
function finishDetailDismissal(view: ReturnType<typeof render>) {
  const sheet = view.UNSAFE_getAllByType(Modal).find(m => m.props.testID === 'nutrition-day-detail-sheet-modal');
  if (sheet) fireEvent(sheet,'dismiss');
}
const appStateListeners: ((state: AppStateStatus) => void)[] = [];
describe('Native Nutrition day', () => {
  beforeEach(async () => {
    mockParams = {}; mockNavigate.mockReset();
    clearConfirmedReads(mockClient as unknown as MobileApiClient);
    await AsyncStorage.clear(); mockRequest.mockReset();
    mockRead.mockReset(); mockUser = 'owner'; mockClient = { read: mockRead, request: mockRequest }; mockToday = '2026-10-02';
    appStateListeners.length = 0;
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
      appStateListeners.push(listener);
      return { remove: () => { const index = appStateListeners.indexOf(listener); if (index >= 0) appStateListeners.splice(index, 1); } };
    });
  });
  it('opens the period food date from Insights and returns to that exact three-month detail across New Year', async () => {
    mockToday = '2027-01-02';
    mockParams = { date: '2026-08-11', insightsReturn: '1', insightsPeriod: 'nutrition', insightsAsOf: '2026-11-07', insightsRevision: 'r1' };
    mockRead.mockImplementation(async options => {
      const date = options.path.split('/').pop()!;
      return ok(date, { ...nutritionFixture(date), today: mockToday }) as never;
    });
    const view = render(element());
    await view.findByRole('button', { name: 'Volver a las comidas del período' });
    await waitFor(() => expect(mockRead.mock.calls.some(([o]) => o.path === '/api/mobile/v1/nutrition/days/2026-08-11')).toBe(true));
    expect(mockRead.mock.calls.some(([o]) => o.path === '/api/mobile/v1/nutrition/days/2027-01-02')).toBe(false);
    fireEvent.press(view.getByRole('button', { name: 'Volver a las comidas del período' }));
    expect(mockNavigate).toHaveBeenLastCalledWith({ pathname: '/(tabs)/train/insights/period-nutrition', params: { asOf: '2026-11-07', revision: 'r1' } });
    expect(mockRequest).not.toHaveBeenCalled();
  });
  it('the calendar is just the month: no average and no report shortcut', async () => {
    mockRead.mockImplementation(async options => ok(options.path.split('/').pop()!) as never);
    const view = render(element()); await view.findByText('Hoy');
    expect(view.queryByText('Reporte')).toBeNull();
    fireEvent.press(view.getByLabelText('Elegir fecha')); await view.findByTestId('nutrition-month');
    expect(view.queryByText('Ver reporte')).toBeNull(); expect(view.queryByText('Promedio del mes')).toBeNull();
  });
  it('quick composition survives foreground refresh and registers against the displayed destination', async () => {
    mockToday = quickDate;
    mockRead.mockImplementation(async options => options.path.endsWith('quick-options')
      ? { status: 'ok', data: quickOptions(), meta: { durationMs: 1, httpStatus: 200, outcome: 'ok' } } as never
      : ok(options.path.split('/').pop()!, { ...nutritionFixture(options.path.split('/').pop()!), today: quickDate }) as never);
    mockRequest.mockImplementation(async options => {
      if (options.path.endsWith('meal-preview')) return { status: 'ok', data: quickPreview(options.body as QuickSelection), meta: { durationMs: 1, httpStatus: 200, outcome: 'ok' } } as never;
      expect((options.body as QuickSelection).date).toBe(quickDate);
      expect(await AsyncStorage.getItem('ownlevel.nutrition.quick.v1.owner')).not.toBeNull();
      return { status: 'ok', data: quickReceipt, meta: { durationMs: 1, httpStatus: 201, outcome: 'ok' } } as never;
    });
    const view = render(element()); await view.findByText('Agregar comida', { includeHiddenElements: true });
    fireEvent.press(view.getByText('Agregar comida', { includeHiddenElements: true })); await act(async () => { fireEvent.press(view.getByText('Rápido')); });
    await act(async () => { fireEvent.press(view.getAllByLabelText('Revisar PASTA').at(-1)!); });
    fireEvent.changeText(view.getByLabelText('Cantidad de INGREDIENTE'), '150,25');
    await act(async () => { appStateListeners.forEach(f => f('background')); appStateListeners.forEach(f => f('active')); });
    expect(view.getByLabelText('Cantidad de INGREDIENTE').props.value).toBe('150,25');
    await view.findByTestId('quick-preview');
    await act(async () => { fireEvent.press(view.getByText(/Agregar al día ·/)); });
    await waitFor(() => expect(view.queryByTestId('quick-meal-editor')).toBeNull());
    expect(mockRequest.mock.calls.filter(([o]) => o.path.endsWith('meal-registrations'))).toHaveLength(1);
    expect(await AsyncStorage.getItem('ownlevel.nutrition.quick.v1.owner')).toBeNull();
  });
  it('Alimento uses the captured destination and rereads Nutrition after registration', async () => {
    mockRead.mockImplementation(async options => options.path.includes('/foods')
      ? { status: 'ok', data: { status: 'ok', foods: [personalFood] }, meta: { durationMs: 1, httpStatus: 200, outcome: 'ok' } } as never
      : ok(options.path.split('/').pop()!) as never);
    mockRequest.mockImplementation(async options => {
      const selection = options.body as QuickSelection;
      return { status: 'ok', data: options.path.endsWith('meal-preview') ? quickPreview(selection) : { ...quickReceipt, date: selection.date }, meta: { durationMs: 1, httpStatus: 200, outcome: 'ok' } } as never;
    });
    const view = render(element()); await view.findByText('Agregar comida', { includeHiddenElements: true });
    fireEvent.press(view.getByText('Agregar comida', { includeHiddenElements: true })); await act(async () => { fireEvent.press(view.getByText('Alimento por cantidad')); });
    await act(async () => { fireEvent.press(view.getByLabelText('Usar CAFÉ')); });
    expect(view.getByLabelText('Destino: Hoy')).toBeTruthy();
    fireEvent.changeText(view.getByLabelText('Cantidad de CAFÉ'), '0,375');
    await act(async () => { appStateListeners.forEach(f => f('background')); appStateListeners.forEach(f => f('active')); });
    expect(view.getByLabelText('Cantidad de CAFÉ').props.value).toBe('0,375');
    await view.findByTestId('quick-preview');
    await act(async () => { fireEvent.press(view.getByText(/Agregar al día ·/)); });
    await waitFor(() => expect(view.queryByTestId('quick-meal-editor')).toBeNull());
    expect(mockRequest.mock.calls.filter(([o]) => o.path.endsWith('meal-registrations'))[0][0].body).toMatchObject({ date: mockToday, source: { kind: 'food' } });
    expect(await AsyncStorage.getItem('ownlevel.nutrition.quick.v1.owner')).toBeNull();
  });
  it('activity draft survives foreground and confirms only changed canonical values', async () => {
    let latest = nutritionFixture();
    mockRead.mockImplementation(async () => ok(mockToday, latest) as never);
    mockRequest.mockImplementation(async options => {
      const body = options.body as { operation: string; date: string; changes: { value: number | null }[] };
      expect(body.operation).toBe('metrics'); expect(body.changes).toHaveLength(1); expect(body.changes[0].value).toBe(3.5);
      latest = nutritionFixture(); if (latest.activity.status === 'ok') latest.activity.data.metrics[0].value = 3.5;
      return { status: 'ok', data: { status: 'saved', operation: body.operation, date: body.date }, meta: { durationMs: 1, httpStatus: 200, outcome: 'ok' } } as never;
    });
    const view = render(element()); await view.findByLabelText(/Agua: 0 L/); fireEvent.press(view.getByLabelText(/Agua: 0 L/));
    fireEvent.changeText(view.getByLabelText('Valor de Agua'), '3,5');
    await act(async () => { appStateListeners.forEach(f => f('active')); });
    expect(view.getByLabelText('Valor de Agua').props.value).toBe('3,5');
    await act(async () => { fireEvent.press(view.getByLabelText('Guardar Agua')); });
    await waitFor(() => expect(view.queryByTestId('nutrition-metric-sheet')).toBeNull(), { timeout: 4000 });
    expect(await view.findByText('3,5 L')).toBeTruthy(); expect(mockRequest).toHaveBeenCalledTimes(1);
  });
  it('context shows automatic/override/effective and restores automatic explicitly', async () => {
    let latest = nutritionFixture();
    mockRead.mockImplementation(async () => ok(mockToday, latest) as never);
    mockRequest.mockImplementation(async options => {
      const body = options.body as { operation: string; date: string; changes: { target: { action: string; value?: number } } };
      latest = nutritionFixture(); if (latest.nutrition.status === 'ok' && latest.nutrition.data.dayState === 'recorded') {
        latest.nutrition.data.context.targetOverrideKcal = body.changes.target.action === 'clear' ? null : body.changes.target.value!;
        latest.nutrition.data.context.calorieTarget = latest.nutrition.data.context.targetOverrideKcal ?? 1800;
      }
      return { status: 'ok', data: { status: 'saved', operation: body.operation, date: body.date }, meta: { durationMs: 1, httpStatus: 200, outcome: 'ok' } } as never;
    });
    const view = render(element()); await view.findByText('Detalle'); fireEvent.press(view.getByText('Detalle')); await view.findByText('Ajustar hoy'); fireEvent.press(view.getByText('Ajustar hoy')); expect(view.queryByTestId('nutrition-context-sheet')).toBeNull(); finishDetailDismissal(view);
    expect(view.getByText('Guardado: 1.800 kcal')).toBeTruthy();expect(view.getByText('Automático: 1.800 kcal')).toBeTruthy();
    fireEvent.changeText(view.getByLabelText('Objetivo de calorías (kcal)'), '1900'); await act(async () => { fireEvent.press(view.getByText('Guardar cambios')); });
    await waitFor(() => expect(view.queryByTestId('nutrition-day-write-editor')).toBeNull());
    fireEvent.press(await view.findByText('Detalle')); fireEvent.press(await view.findByText('Ajustar hoy')); finishDetailDismissal(view); expect(view.getByText(/Guardado: 1.900 kcal/)).toBeTruthy(); expect(view.getByLabelText('Objetivo de calorías (kcal)').props.value).toBe('1900');
    fireEvent.press(view.getByText('Usar objetivo automático')); await act(async () => { fireEvent.press(view.getByText('Guardar cambios')); });
    await waitFor(() => expect(view.queryByTestId('nutrition-day-write-editor')).toBeNull());
    expect(mockRequest.mock.calls[1][0].body).toMatchObject({ operation: 'context', changes: { target: { action: 'clear' } } });
  });
  it('Volver al automático clears only the chosen override through the existing persisted CAS write', async () => {
    let latest = nutritionFixture();
    if (latest.nutrition.status === 'ok' && latest.nutrition.data.dayState === 'recorded') {
      Object.assign(latest.nutrition.data.context, { targetOverrideKcal: 1900, calorieTarget: 1900, expenditureOverrideKcal: 2300, expenditureKcal: 2300, breakdown: null });
    }
    mockRead.mockImplementation(async () => ok(mockToday, latest) as never);
    mockRequest.mockImplementation(async options => {
      expect(options.body).toMatchObject({ operation: 'context', date: mockToday, expectedUpdatedAt: `${mockToday}T12:00:00.123456Z`, changes: { target: { action: 'clear' } } });
      expect((options.body as { changes: object }).changes).toEqual({ target: { action: 'clear' } });
      expect(await AsyncStorage.getItem('ownlevel.nutrition.day-write.v1.owner')).not.toBeNull();
      latest = nutritionFixture();
      if (latest.nutrition.status === 'ok' && latest.nutrition.data.dayState === 'recorded') Object.assign(latest.nutrition.data.context, { expenditureOverrideKcal: 2300, expenditureKcal: 2300 });
      return { status: 'ok', data: { status: 'saved', operation: 'context', date: mockToday }, meta: { durationMs: 1, httpStatus: 200, outcome: 'ok' } } as never;
    });
    const view = render(element()); fireEvent.press(await view.findByText('Detalle'));
    await act(async () => { fireEvent.press(view.getByLabelText('Volver al automático: objetivo')); });
    // The sheet first runs its exit; iOS then reports the Modal gone.
    await act(async () => { finishDetailDismissal(view); });
    await waitFor(() => expect(view.queryByTestId('nutrition-day-write-editor')).toBeNull());
    expect(mockRequest).toHaveBeenCalledTimes(1);
  });
  it('undo from the notice deletes without opening the editor: running, then a brief confirmation', async () => {
    mockRead.mockImplementation(async () => ok(mockToday) as never);
    const saved = { status: 'ok', data: { status: 'saved', mealId: '41100000-0000-4000-8000-000000000002', sourceDate: mockToday, destinationDate: mockToday, updatedAt: `${mockToday}T13:00:00Z` }, meta: { durationMs: 1, httpStatus: 201, outcome: 'ok' } };
    let finishDelete!: (r: unknown) => void;
    mockRequest.mockResolvedValueOnce(saved as never).mockImplementationOnce(() => new Promise(resolve => { finishDelete = resolve as (r: unknown) => void; }));
    const view = render(element()); await view.findByText('Agregar comida', { includeHiddenElements: true });
    fireEvent.press(view.getByText('Agregar comida', { includeHiddenElements: true })); fireEvent.press(view.getByText('A mano'));
    fireEvent.changeText(view.getByLabelText('Calorías'), '250');
    await act(async () => { fireEvent.press(view.getByText(/Agregar al día ·/)); });
    expect(await view.findByTestId('nutrition-meal-notice')).toBeTruthy();
    expect(view.queryByText('Comida guardada.')).toBeNull();
    await act(async () => { fireEvent.press(view.getByLabelText('Deshacer comida agregada')); });
    expect(view.getByText('Deshaciendo…')).toBeTruthy();
    expect(view.queryByTestId('manual-meal-editor')).toBeNull();
    await act(async () => { finishDelete({ ...saved, data: { ...saved.data, status: 'deleted' } }); });
    expect(await view.findByText('Deshecho')).toBeTruthy();
    expect(view.queryByTestId('manual-meal-editor')).toBeNull(); expect(view.queryByText('Comida eliminada.')).toBeNull();
    expect((mockRequest.mock.calls[1][0].body as { operation: string }).operation).toBe('delete');
  });
  it('the edit form has no delete button: deleting lives in the detail trash', async () => {
    mockRead.mockImplementation(async () => ok(mockToday) as never);
    const alert = jest.spyOn(Alert, 'alert');
    const view = render(element()); await view.findByText('Comida 2026-10-02');
    fireEvent.press(view.getByText('Comida 2026-10-02'));
    fireEvent.press(await view.findByText('Editar')); finishMealDismissal(view);
    expect(await view.findByTestId('manual-meal-editor')).toBeTruthy();
    expect(view.queryByText('Eliminar comida')).toBeNull();
    alert.mockRestore();
  });
  it('the detail trash still deletes the meal after one confirmation', async () => {
    mockRead.mockImplementation(async () => ok(mockToday) as never);
    const alert = jest.spyOn(Alert, 'alert');
    const view = render(element()); await view.findByText('Comida 2026-10-02');
    mockRequest.mockResolvedValueOnce({ status: 'ok', data: { status: 'deleted', mealId: '41100000-0000-4000-8000-000000000001', sourceDate: mockToday, destinationDate: mockToday, updatedAt: `${mockToday}T13:00:00Z` }, meta: { durationMs: 1, httpStatus: 200, outcome: 'ok' } } as never);
    fireEvent.press(view.getByText('Comida 2026-10-02'));
    fireEvent.press(within(await view.findByTestId('meal-detail-sheet')).getByLabelText('Eliminar comida'));
    expect(alert).toHaveBeenCalledWith('¿Eliminar esta comida?', expect.any(String), expect.any(Array));
    const confirm = (alert.mock.calls.at(-1)![2] as { text: string; onPress?: () => void }[]).find(b => b.text === 'Eliminar')!;
    act(() => confirm.onPress!());
    await act(async () => { finishMealDismissal(view); });
    await waitFor(() => expect((mockRequest.mock.calls[0][0].body as { operation: string }).operation).toBe('delete'));
    alert.mockRestore();
  });
  it('keeps a form draft through refresh and fences the pre-write response after confirmed create', async () => {
    let latest = nutritionFixture();
    mockRead.mockImplementation(async () => ({ status: 'ok', data: latest, meta: { durationMs: 1, httpStatus: 200, outcome: 'ok' } }) as never);
    const view = render(element()); await view.findByText('Agregar comida', { includeHiddenElements: true });
    fireEvent.press(view.getByText('Agregar comida', { includeHiddenElements: true })); fireEvent.press(view.getByText('A mano'));
    fireEvent.changeText(view.getByLabelText('Título'), 'My draft');
    fireEvent.changeText(view.getByLabelText('Calorías'), '350');
    let finishOld!: (r: unknown) => void;
    mockRead.mockImplementationOnce(() => new Promise(resolve => { finishOld = resolve as (r: unknown) => void; }));
    await act(async () => { view.UNSAFE_getByType(RefreshControl).props.onRefresh(); });
    expect(view.getByLabelText('Título').props.value).toBe('My draft');
    mockRequest.mockImplementation(async options => {
      const body = options.body as { idempotencyKey: string };
      expect(await AsyncStorage.getItem('ownlevel.nutrition.meal.v1.owner')).toContain(body.idempotencyKey);
      latest = nutritionFixture();
      if (latest.nutrition.status === 'ok' && latest.nutrition.data.dayState === 'recorded') {
        latest.nutrition.data.meals[0].title = 'MY DRAFT'; latest.nutrition.data.meals[0].calories = 350;
        latest.nutrition.data.summary.calories.knownTotal = 350;
      }
      return { status: 'ok', data: { status: 'saved', mealId: '41100000-0000-4000-8000-000000000002', sourceDate: mockToday, destinationDate: mockToday, updatedAt: `${mockToday}T13:00:00Z` }, meta: { durationMs: 1, httpStatus: 201, outcome: 'ok' } } as never;
    });
    await act(async () => { fireEvent.press(view.getByText(/Agregar al día ·/)); });
    await view.findByText('MY DRAFT');
    await act(async () => { finishOld(ok(mockToday)); });
    expect(view.getByText('MY DRAFT')).toBeTruthy(); expect(view.queryByText('Comida 2026-10-02')).toBeNull();
    expect(mockRequest).toHaveBeenCalledTimes(1);
  });
  it('uncertain save may return to the day and is only replayed by explicit recovery', async () => {
    mockRead.mockImplementation(async options => ok(options.path.split('/').pop()!) as never);
    mockRequest.mockResolvedValueOnce(failure as never).mockResolvedValueOnce({ status: 'ok',
      data: { status: 'saved', mealId: '41100000-0000-4000-8000-000000000002', sourceDate: mockToday, destinationDate: mockToday, updatedAt: `${mockToday}T13:00:00Z` },
      meta: { durationMs: 1, httpStatus: 201, outcome: 'ok' } } as never);
    const view = render(element()); await view.findByText('Agregar comida', { includeHiddenElements: true }); fireEvent.press(view.getByText('Agregar comida', { includeHiddenElements: true })); fireEvent.press(view.getByText('A mano'));
    fireEvent.changeText(view.getByLabelText('Calorías'), '250'); fireEvent.press(view.getByText(/Agregar al día ·/));
    await view.findByText('Comprobar intento guardado');
    fireEvent.press(view.getByText('Volver al día · conservar intento')); await view.findByText('Revisar intento guardado');
    await act(async () => { appStateListeners.forEach(f => f('background')); appStateListeners.forEach(f => f('active')); });
    expect(mockRequest).toHaveBeenCalledTimes(1);
    fireEvent.press(view.getByText('Revisar intento guardado'));
    expect(view.getByLabelText('Calorías').props.value).toBe('250');
    await act(async () => { fireEvent.press(view.getByText('Comprobar intento guardado')); }); expect(await view.findByTestId('nutrition-meal-notice')).toBeTruthy(); expect(view.queryByText('Comida guardada.')).toBeNull();
    expect(mockRequest).toHaveBeenCalledTimes(2);
    expect(mockRequest.mock.calls[1][0].body).toEqual(mockRequest.mock.calls[0][0].body);
  });
  it('keeps the last meal clear of the measured Today control, without changing native insets (#348)', async () => {
    mockRead.mockImplementation(async options => ok(options.path.split('/').pop()!) as never);
    const view = render(element()); await view.findByText('Comida 2026-10-02');
    const scroll = () => view.getByTestId('nutrition-day-screen').findByType(ScrollView);
    const padding = () => { const style = StyleSheet.flatten(scroll().props.contentContainerStyle); return style.paddingBottom ?? style.padding; };
    const normalPadding = padding();
    fireEvent.press(view.getByTestId('nutrition-week-2026-10-01')); await view.findByText('Comida 2026-10-01');
    const controlHeight = StyleSheet.flatten(within(view.getByTestId('nutrition-today-pill')).UNSAFE_getByType(GlassSurface).props.style).minHeight;
    expect(padding()).toBe(normalPadding + controlHeight + spacing.sm);
    // Measured height, rather than assuming the minimum touch target (Dynamic Type can make it taller).
    fireEvent(view.getByTestId('nutrition-today-dock'), 'layout', { nativeEvent: { layout: { height: 72 } } });
    expect(padding()).toBe(normalPadding + 72 + spacing.sm);
    expect(scroll().props.contentInsetAdjustmentBehavior).toBe('automatic');
    expect(scroll().props.contentInset).toBeUndefined();
    const backing = view.getByTestId('nutrition-today-backing', { includeHiddenElements: true });
    expect(backing.props).toMatchObject({ pointerEvents: 'none', accessibilityElementsHidden: true });
    expect(StyleSheet.flatten(backing.props.style).backgroundColor).toBeTruthy();
    fireEvent.press(view.getByTestId('nutrition-today-pill')); await view.findByText('Comida 2026-10-02');
    expect(padding()).toBe(normalPadding);
    expect(view.queryByTestId('nutrition-today-dock')).toBeNull();
  });
  it('loads today, distinguishes target/balance and navigates to date and back', async () => {
    mockRead.mockImplementation(async options => ok(options.path.split('/').pop()!) as never);
    const view = render(element());
    await view.findByText('Comida 2026-10-02');
    fireEvent.press(view.getByText('Detalle')); expect(view.getByText('Comiste')).toBeTruthy();
    expect(view.getByText('Balance del día')).toBeTruthy();
    expect(view.queryByText('Editar actividad')).toBeNull(); fireEvent.press(view.getByLabelText('Cerrar Detalle del día')); finishDetailDismissal(view);
    fireEvent.press(view.getByTestId('nutrition-week-2026-10-01'));
    await view.findByText('Comida 2026-10-01');
    expect(view.queryByText('Comida 2026-10-02')).toBeNull();
    fireEvent.press(view.getByTestId('nutrition-today-pill'));
    await view.findByText('Comida 2026-10-02');
    // A far date: the month title opens the month/year picker, then the day.
    fireEvent.press(view.getByLabelText('Elegir fecha')); fireEvent.press(await view.findByTestId('nutrition-month-title'));
    fireEvent(view.UNSAFE_getByProps({ label: 'Mes' }), 'selectionChange', 9); fireEvent.press(view.getByTestId('nutrition-month-title'));
    await act(async () => { fireEvent.press(await view.findByTestId('nutrition-month-2026-09-20')); });
    await act(async () => { finishMonthDismissal(view); });
    await view.findByText('Comida 2026-09-20');
    const tiny = nutritionFixture('2026-09-20');
    if (tiny.activity.status === 'ok') tiny.activity.data.metrics[0].value = 0.0001;
    mockRead.mockResolvedValueOnce(ok('2026-09-20', tiny) as never);
    await act(async () => { view.UNSAFE_getByType(RefreshControl).props.onRefresh(); });
    expect(view.getByText('0,0001 L')).toBeTruthy();
  });
  it('loads correctly when effects are replayed in Strict Mode', async () => {
    mockRead.mockImplementation(async options => ok(options.path.split('/').pop()!) as never);
    const view = render(<StrictMode>{element()}</StrictMode>);
    await view.findByText('Comida 2026-10-02');
  });
  it('aborts the old date and ignores a late response after fast changes', async () => {
    const pending: { signal?: AbortSignal; resolve: (r: unknown) => void; date: string }[] = [];
    mockRead.mockImplementation(options => new Promise(resolve => pending.push({ signal: options.signal,
      date: options.path.split('/').pop()!, resolve: resolve as (r: unknown) => void })));
    const view = render(element());
    expect(view.getByText('Cargando día nutricional')).toBeTruthy();
    fireEvent.press(view.getByTestId('nutrition-week-2026-10-01'));
    fireEvent.press(view.getByTestId('nutrition-week-2026-09-30'));
    await act(async () => {});
    expect(pending[0].signal?.aborted).toBe(true);
    expect(pending[1].signal?.aborted).toBe(true);
    await act(async () => { pending[2].resolve(ok(pending[2].date)); });
    await act(async () => { pending[0].resolve(ok(pending[0].date)); pending[1].resolve(ok(pending[1].date)); });
    expect(view.getByText('Comida 2026-09-30')).toBeTruthy();
    expect(view.queryByText('Comida 2026-10-02')).toBeNull();
  });
  it('shows the server automatic moment in list and detail, alongside the approximate time (#308)', async () => {
    const day = nutritionFixture('2026-10-02'), data = day.nutrition.status === 'ok' && day.nutrition.data.dayState === 'recorded' ? day.nutrition.data : undefined;
    const registered = { ...data!.meals[0], timeKnown: false, timeSource: 'registration' as const, automaticMealLabel: 'breakfast' as const, sourceType: 'chatgpt' as const };
    mockRead.mockResolvedValue(ok('2026-10-02', { ...day, nutrition: { status: 'ok', data: { ...data!, meals: [registered] } } }) as never);
    const view = render(element()); await view.findByText('Comida 2026-10-02');
    expect(view.getByText(/^09:00 · P /)).toBeTruthy();
    expect(view.getByText('Desayuno')).toBeTruthy();
    expect(view.queryByText(/^Sin hora/)).toBeNull();
    fireEvent.press(view.getByText('Comida 2026-10-02'));
    expect(await view.findByText('Desayuno · 09:00')).toBeTruthy();
  });
  it('keeps older servers compatible without inferring a moment on the phone (#308)', async () => {
    const day = nutritionFixture('2026-10-02'), data = day.nutrition.status === 'ok' && day.nutrition.data.dayState === 'recorded' ? day.nutrition.data : undefined;
    const registered = { ...data!.meals[0], timeKnown: false, timeSource: 'registration' as const, sourceType: 'chatgpt' as const };
    mockRead.mockResolvedValue(ok('2026-10-02', { ...day, nutrition: { status: 'ok', data: { ...data!, meals: [registered] } } }) as never);
    const view = render(element()); await view.findByText('Comida 2026-10-02');
    expect(view.queryByText(/automática|sugerido/)).toBeNull();
    expect(view.getByText(/^09:00 · P /)).toBeTruthy();
  });
  it('keeps confirmed automatic timing visible in the editor without promoting it on a title-only save (#308)', async () => {
    const day = nutritionFixture('2026-10-02');
    if (day.nutrition.status !== 'ok' || day.nutrition.data.dayState !== 'recorded') throw new Error('fixture');
    const data = day.nutrition.data;
    const registered = { ...data.meals[0], mealLabel: null, timeKnown: false, timeSource: 'registration' as const,
      automaticMealLabel: 'breakfast' as const, sourceType: 'chatgpt' as const };
    mockRead.mockResolvedValue(ok('2026-10-02', { ...day, nutrition: { status: 'ok', data: { ...data, meals: [registered] } } }) as never);
    const view = render(element());
    await view.findByText('Comida 2026-10-02');
    fireEvent.press(view.getByText('Comida 2026-10-02'));
    fireEvent.press(await view.findByText('Editar')); finishMealDismissal(view);
    await view.findByTestId('manual-meal-editor');
    expect(view.getByLabelText('Cambiar hora 09:00')).toBeTruthy();
    expect(within(view.getByTestId('manual-meal-editor')).getAllByText('Desayuno')).toHaveLength(2);
    fireEvent.changeText(view.getByLabelText('Título'), 'Otro título');
    mockRequest.mockImplementation(async options => {
      expect((options.body as { fields: object }).fields).toMatchObject({ mealLabel: null });
      expect((options.body as { fields: object }).fields).not.toHaveProperty('consumedAt');
      return { status: 'unavailable', reason: 'network', meta: { durationMs: 1, httpStatus: null, outcome: 'unavailable' } } as never;
    });
    fireEvent.press(view.getByText('Guardar cambios'));
    await waitFor(() => expect(mockRequest).toHaveBeenCalledTimes(1));
  });
  it('keeps a meal without a time as Sin hora (#308)', async () => {
    const day = nutritionFixture('2026-10-02'), data = day.nutrition.status === 'ok' && day.nutrition.data.dayState === 'recorded' ? day.nutrition.data : undefined;
    const unknown = { ...data!.meals[0], timeKnown: false, timeSource: 'unknown' as const, sourceType: 'chatgpt' as const };
    mockRead.mockResolvedValue(ok('2026-10-02', { ...day, nutrition: { status: 'ok', data: { ...data!, meals: [unknown] } } }) as never);
    const view = render(element()); await view.findByText('Comida 2026-10-02');
    expect(view.getByText(/^Sin hora · P /)).toBeTruthy();
  });
  it('refreshes the selected date and keeps its last reading explicitly stale', async () => {
    mockRead.mockResolvedValueOnce(ok('2026-10-02') as never).mockResolvedValueOnce(failure as never);
    const view = render(element()); await view.findByText('Comida 2026-10-02');
    await act(async () => { view.UNSAFE_getByType(RefreshControl).props.onRefresh(); });
    expect(view.getByText('Comida 2026-10-02')).toBeTruthy();
    expect(view.getByText('No pudimos actualizar. Mostramos la última lectura de esta fecha.')).toBeTruthy();
    expect(mockRead.mock.calls.every(([options]) => options.path.endsWith('2026-10-02'))).toBe(true);
  });
  it('refreshes on foreground and follows Cordoba midnight when viewing today', async () => {
    mockRead.mockImplementation(async options => {
      const date = options.path.split('/').pop()!;
      return ok(date, { ...nutritionFixture(date), today: date }) as never;
    });
    const view = render(element()); await view.findByText('Comida 2026-10-02');
    act(() => { appStateListeners.slice().forEach(listener => listener('background')); });
    await act(async () => { appStateListeners.slice().forEach(listener => listener('active')); });
    expect(mockRead.mock.calls.length).toBeGreaterThanOrEqual(2);
    mockToday = '2026-10-03';
    await act(async () => { appStateListeners.slice().forEach(listener => listener('background')); appStateListeners.slice().forEach(listener => listener('active')); });
    await view.findByText('Comida 2026-10-03');
  });
  it('isolates previous private data when the authenticated user changes', async () => {
    mockRead.mockResolvedValueOnce(ok('2026-10-02') as never).mockResolvedValue(failure as never);
    const view = render(element()); await view.findByText('Comida 2026-10-02');
    // A different account always gets a different API client (MobileApiProvider): nothing retained crosses over.
    mockUser = 'second-user'; mockClient = { read: mockRead, request: mockRequest }; view.rerender(element());
    await view.findByText('No pudimos cargar este día');
    expect(view.queryByText('Comida 2026-10-02')).toBeNull();
  });
  it('distinguishes missing day, no meals, partial sections and total failure', async () => {
    const missing = nutritionFixture();
    missing.nutrition = { status: 'ok', data: { dayState: 'missing', summary: null, context: null, meals: [] } };
    mockRead.mockResolvedValueOnce(ok('2026-10-02', missing) as never);
    const view = render(element()); await view.findByText('Sin día registrado');
    const empty = nutritionFixture('2026-10-01');
    if (empty.nutrition.status === 'ok' && empty.nutrition.data.dayState === 'recorded') {
      empty.nutrition.data.meals = [];
      empty.nutrition.data.summary = { entryCount: 0, mealCount: 0,
        calories: { knownTotal: 0, missingCount: 0 }, proteinG: { knownTotal: 0, missingCount: 0 },
        carbsG: { knownTotal: 0, missingCount: 0 }, fatG: { knownTotal: 0, missingCount: 0 } };
      empty.nutrition.data.context.deltaVsTargetKcal = -1800;
      empty.nutrition.data.context.energyBalanceKcal = -2200;
    }
    empty.activity = { status: 'unavailable' };
    mockRead.mockResolvedValueOnce(ok('2026-10-01', empty) as never);
    fireEvent.press(view.getByTestId('nutrition-week-2026-10-01'));
    await view.findByText('Sin comidas registradas');
    expect(view.getByText('Las métricas de esta fecha no están disponibles. Deslizá para reintentar.')).toBeTruthy();
    mockRead.mockResolvedValueOnce(failure as never);
    fireEvent.press(view.getByTestId('nutrition-week-2026-09-30'));
    await waitFor(() => expect(view.getByText('No pudimos cargar este día')).toBeTruthy());
    expect(view.queryByText('Sin comidas registradas')).toBeNull();
  });
});
