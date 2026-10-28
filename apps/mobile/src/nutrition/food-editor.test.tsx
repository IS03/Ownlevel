import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { describe, expect, it, jest } from '@jest/globals';
import { Alert, Modal } from 'react-native';
import { OwnlevelThemeProvider } from '@/design-system';
import { foodQuickOption } from '@/api/nutrition-food';
import { FoodController, type FoodApi } from './food-controller';
import { FoodIntentRepository } from './food-storage';
import { FoodEditor } from './food-editor';
import { QuickController, type QuickApi } from './quick-controller';
import { QuickIntentRepository } from './quick-storage';
import { quickDate, quickOptions, quickPreview, quickReceipt } from './quick-fixture.test-helper';
import { personalFood, foodReceipt } from './food-fixture.test-helper';
import { nutritionFixture } from './day-fixture.test-helper';
jest.mock('./day-resource', () => ({ useNutritionDayResource: () => ({ state: { status: 'loading' } }) }));
jest.mock('@/api', () => ({ useMobileApi: () => ({ client: null }) }));
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual<object>('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  initialWindowMetrics: { frame: { x: 0, y: 0, width: 402, height: 874 }, insets: { top: 0, bottom: 0, left: 0, right: 0 } },
}));
jest.mock('@/training/exercise-segmented', () => ({
  ExerciseSegmented: ({
    options,
    onChange,
  }: {
    options: { value: string; label: string }[];
    onChange: (v: string) => void;
  }) => {
    const { Pressable, Text } = jest.requireActual<typeof import('react-native')>('react-native');
    return (
      <>
        {options.map((o) => (
          <Pressable key={o.value} onPress={() => onChange(o.value)}>
            <Text>{o.label}</Text>
          </Pressable>
        ))}
      </>
    );
  },
}));
jest.mock('./library-editor-menu', () => jest.requireActual('./library-editor-menu.tsx'));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
const meta = { durationMs: 1, httpStatus: 200, outcome: 'ok' as const };
function fixture() {
  const map = new Map<string, string>(),
    storage = {
      getItem: async (k: string) => map.get(k) ?? null,
      setItem: async (k: string, v: string) => {
        map.set(k, v);
      },
      removeItem: async (k: string) => {
        map.delete(k);
      },
    };
  const api: FoodApi = {
    list: jest
      .fn<FoodApi['list']>()
      .mockResolvedValue({ status: 'ok', data: { status: 'ok', foods: [personalFood] }, meta }),
    detail: jest
      .fn<FoodApi['detail']>()
      .mockResolvedValue({ status: 'ok', data: { status: 'ok', food: personalFood }, meta }),
    write: jest.fn<FoodApi['write']>().mockImplementation(async (i) => ({
      status: 'ok',
      data: {
        ...foodReceipt,
        operation: i.operation,
        ...(i.operation === 'delete' ? { version: null, updatedAt: null } : {}),
      },
      meta,
    })),
  };
  const qapi: QuickApi = {
    food: (id) => api.detail(id),
    options: async () => ({ status: 'ok', data: quickOptions(), meta }),
    preview: jest
      .fn<QuickApi['preview']>()
      .mockImplementation(async (s) => ({ status: 'ok', data: quickPreview(s), meta })),
    confirm: jest.fn<QuickApi['confirm']>().mockResolvedValue({ status: 'ok', data: quickReceipt, meta }),
    read: async (d) => ({ status: 'ok', data: nutritionFixture(d), meta }),
  };
  const c = new FoodController(api, new FoodIntentRepository(storage, 'owner')),
    q = new QuickController(qapi, new QuickIntentRepository(storage, 'owner'), () => {});
  const element = () => (
    <OwnlevelThemeProvider initialMode="light">
      <FoodEditor
        controller={c}
        state={c.getSnapshot()}
        quick={{ controller: q, state: q.getSnapshot() }}
        onChoose={(food) => {
          q.open(c.getSnapshot().date!, foodQuickOption(food));
          c.registration();
        }}
      />
    </OwnlevelThemeProvider>
  );
  const view = render(element());
  c.subscribe(() => view.rerender(element()));
  q.subscribe(() => view.rerender(element()));
  const open = async (date: string | null = null) =>
    act(async () => {
      await c.initialize();
      await q.initialize();
      c.open(date);
    });
  return { c, q, api, qapi, view, open };
}
describe('Native Food surfaces', () => {
  it('personal catalog supports search/filters, create/edit and unknown versus zero fields', async () => {
    const f = fixture();
    await f.open();
    expect(f.view.getByText('Alimentos')).toBeTruthy();
    await act(async () => {
      fireEvent.changeText(f.view.getByLabelText('Buscar alimento'), 'cafe');
      fireEvent.press(f.view.getByText('Archivadas'));
    });
    expect(f.api.list).toHaveBeenLastCalledWith('archived', 'cafe');
    fireEvent.press(f.view.getByLabelText(/^Editar CAFÉ,/));
    expect(f.view.getByLabelText('Cantidad base').props.value).toBe('0,125');
    expect(f.view.getByLabelText('Proteína (g)').props.value).toBe('');
    expect(f.view.getByLabelText('Grasas (g)').props.value).toBe('0');
    fireEvent.changeText(f.view.getByLabelText('Calorías'), '25,75');
    await act(async () => {
      await f.c.load();
    });
    expect(f.view.getByLabelText('Calorías').props.value).toBe('25,75');
    await act(async () => {
      fireEvent.press(f.view.getByText('Guardar'));
    });
    expect(f.api.write).toHaveBeenCalledWith(
      expect.objectContaining({ operation: 'update', fields: expect.objectContaining({ calories: 25.75 }) }),
    );
    fireEvent.press(f.view.getByText('Nuevo alimento'));
    expect(f.view.getByLabelText('Cantidad base').props.value).toBe('1');
  });
  it('food quantity reuses preview/receipt pipeline and closes after exact-day refresh', async () => {
    const f = fixture();
    await f.open(quickDate);
    await act(async () => {
      fireEvent.press(f.view.getByLabelText('Usar CAFÉ'));
    });
    expect(f.view.getByText('CAFÉ')).toBeTruthy();
    expect(f.view.getByLabelText('Cantidad de CAFÉ').props.value).toBe('0,125');
    fireEvent.changeText(f.view.getByLabelText('Cantidad de CAFÉ'), '0,375');
    await f.view.findByTestId('quick-preview');
    await act(async () => {
      fireEvent.press(f.view.getByText(/Agregar al día ·/));
    });
    await waitFor(() => expect(f.view.queryByTestId('quick-meal-editor')).toBeNull());
    expect(f.qapi.confirm).toHaveBeenCalledWith(
      expect.objectContaining({
        date: quickDate,
        source: expect.objectContaining({ kind: 'food' }),
        quantities: [{ itemId: personalFood.id, quantity: 0.375 }],
      }),
    );
    expect(f.api.write).not.toHaveBeenCalled();
  });
  it('source conflict retains quantity, fetches actual food and requires a new preview after review', async () => {
    const f = fixture();
    await f.open(quickDate);
    await act(async () => {
      fireEvent.press(f.view.getByLabelText('Usar CAFÉ'));
    });
    fireEvent.changeText(f.view.getByLabelText('Cantidad de CAFÉ'), '0,375');
    await f.view.findByTestId('quick-preview');
    const truth = { ...personalFood, servingQuantity: 0.5, version: 'b'.repeat(64) };
    (f.api.detail as jest.Mock<FoodApi['detail']>).mockResolvedValue({
      status: 'ok',
      data: { status: 'ok', food: truth },
      meta,
    });
    (f.qapi.confirm as jest.Mock<QuickApi['confirm']>).mockResolvedValueOnce({
      status: 'conflict',
      code: 'QUICK_SOURCE_CHANGED',
      message: 'changed',
      meta: { ...meta, outcome: 'conflict' },
    });
    await act(async () => {
      fireEvent.press(f.view.getByText(/Agregar al día ·/));
    });
    expect(f.view.getByLabelText('Cantidad de CAFÉ').props.value).toBe('0,375');
    await act(async () => {
      fireEvent.press(f.view.getByText('Revisar la versión actual'));
    });
    expect(f.qapi.confirm).toHaveBeenCalledTimes(1);
    expect(f.view.getByTestId('quick-preview')).toBeTruthy();
    expect(f.q.getSnapshot().draft?.option.source.version).toBe(truth.version);
    expect(f.view.getByLabelText('Cantidad de CAFÉ').props.value).toBe('0,375');
  });
  it('delete/archive/reactivate require deliberate native confirmation and empty differs from unavailable', async () => {
    const f = fixture();
    await f.open();
    fireEvent.press(f.view.getByLabelText(/^Editar CAFÉ,/));
    const alert = jest.spyOn(Alert, 'alert');
    fireEvent(f.view.getByLabelText('Acciones del editor'), 'accessibilityAction', {
      nativeEvent: { actionName: 'Eliminar alimento' },
    });
    expect(f.api.write).not.toHaveBeenCalled();
    expect(alert).toHaveBeenCalledWith('¿Eliminar alimento?', expect.any(String), expect.any(Array));
    await act(async () => {
      alert.mock.calls.at(-1)![2]![1].onPress!();
    });
    expect(f.api.write).toHaveBeenCalledWith(expect.objectContaining({ operation: 'delete' }));
    (f.api.list as jest.Mock<FoodApi['list']>).mockResolvedValueOnce({
      status: 'ok',
      data: { status: 'ok', foods: [] },
      meta,
    });
    await act(async () => {
      await f.c.load();
    });
    expect(
      f.view.getByText('Todavía no creaste alimentos. Agregá uno con su porción y valores nutricionales.'),
    ).toBeTruthy();
    (f.api.list as jest.Mock<FoodApi['list']>).mockResolvedValueOnce({
      status: 'unavailable',
      reason: 'network',
      meta: { ...meta, outcome: 'unavailable' },
    });
    await act(async () => {
      await f.c.load();
    });
    expect(f.view.getByText('No pudimos actualizar el catálogo. Mostramos la última lectura.')).toBeTruthy();
    expect(
      f.view.queryByText('Todavía no creaste alimentos. Agregá uno con su porción y valores nutricionales.'),
    ).toBeNull();
  });
});

describe('Food library presentation safeguards', () => {
  it('keeps save disabled for unchanged or invalid data and confirms the notice after refresh', async () => {
    const f = fixture();
    await f.open();
    fireEvent.press(f.view.getByLabelText(/^Editar CAFÉ,/));
    expect(f.view.getByText('Guardar')).toBeDisabled();
    fireEvent.changeText(f.view.getByLabelText('Cantidad base'), '0');
    expect(f.view.getByText('Guardar')).toBeDisabled();
    fireEvent.changeText(f.view.getByLabelText('Cantidad base'), '2');
    await act(async () => fireEvent.press(f.view.getByText('Guardar')));
    expect(f.view.getByText('Guardado')).toBeTruthy();
    expect(f.view.queryByLabelText('Cantidad base')).toBeNull();
    expect(f.view.queryByText('Deshacer')).toBeNull();
  });
  it('archives and restores through the row actions using the existing CAS operation', async () => {
    const f = fixture();
    await f.open();
    const alert = jest.spyOn(Alert, 'alert');
    fireEvent(f.view.getByLabelText(/^Editar CAFÉ,/), 'accessibilityAction', {
      nativeEvent: { actionName: 'Archivar' },
    });
    expect(f.api.write).not.toHaveBeenCalled();
    await act(async () => alert.mock.calls.at(-1)![2]![1].onPress!());
    expect(f.api.write).toHaveBeenLastCalledWith(
      expect.objectContaining({ operation: 'archive', expectedVersion: personalFood.version, fields: null }),
    );
    (f.api.list as jest.Mock<FoodApi['list']>).mockResolvedValue({
      status: 'ok',
      data: { status: 'ok', foods: [{ ...personalFood, isActive: false }] },
      meta,
    });
    await act(async () => f.c.setFilter('archived'));
    fireEvent(f.view.getByLabelText(/^Editar CAFÉ,/), 'accessibilityAction', {
      nativeEvent: { actionName: 'Restaurar' },
    });
    await act(async () => alert.mock.calls.at(-1)![2]![1].onPress!());
    expect(f.api.write).toHaveBeenLastCalledWith(
      expect.objectContaining({ operation: 'reactivate', expectedVersion: personalFood.version, fields: null }),
    );
    alert.mockRestore();
  });
  it('retains uncertain and conflict drafts and recovers with the original idempotency key', async () => {
    const f = fixture();
    await f.open();
    fireEvent.press(f.view.getByLabelText(/^Editar CAFÉ,/));
    fireEvent.changeText(f.view.getByLabelText('Calorías'), '222');
    (f.api.write as jest.Mock<FoodApi['write']>).mockRejectedValueOnce(new Error('offline'));
    await act(async () => fireEvent.press(f.view.getByText('Guardar')));
    expect(f.view.getByLabelText('Calorías').props.editable).toBe(false);
    expect(f.api.write).toHaveBeenCalledTimes(1);
    await act(async () => fireEvent.press(f.view.getByText('Comprobar intento de catálogo')));
    const calls = (f.api.write as jest.Mock<FoodApi['write']>).mock.calls;
    expect(calls[1][0]).toEqual(calls[0][0]);
    fireEvent.press(f.view.getByLabelText(/^Editar CAFÉ,/));
    fireEvent.changeText(f.view.getByLabelText('Calorías'), '333');
    (f.api.write as jest.Mock<FoodApi['write']>).mockResolvedValueOnce({
      status: 'conflict',
      code: 'FOOD_CHANGED',
      message: 'El alimento cambió.',
      meta: { ...meta, outcome: 'conflict' },
    });
    await act(async () => fireEvent.press(f.view.getByText('Guardar')));
    expect(f.view.getByText('Revisar mi borrador con esta versión')).toBeTruthy();
    expect(f.view.getByLabelText('Calorías').props.value).toBe('333');
    fireEvent.press(f.view.getByText('Revisar mi borrador con esta versión'));
    expect(f.c.getSnapshot().phase).toBe('idle');
    expect(f.view.getByLabelText('Calorías').props.value).toBe('333');
  });
});

describe('Food creation from the day picker', () => {
  it('keeps one modal when opening a new food and returning to the day picker', async () => {
    const f = fixture();
    await f.open(quickDate);
    expect(f.view.UNSAFE_getAllByType(Modal)).toHaveLength(1);
    fireEvent.press(f.view.getByText('Nuevo alimento'));
    expect(f.view.getByLabelText('Cantidad base').props.value).toBe('1');
    expect(f.view.UNSAFE_getAllByType(Modal)).toHaveLength(1);
    fireEvent.press(f.view.getByLabelText('Cerrar edición'));
    expect(f.view.getByLabelText('Usar CAFÉ')).toBeTruthy();
    expect(f.view.UNSAFE_getAllByType(Modal)).toHaveLength(1);
  });
});
