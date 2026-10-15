import { act, fireEvent, render } from '@testing-library/react-native';
import { describe, expect, it, jest } from '@jest/globals';
import { Alert } from 'react-native';
import Swipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import { OwnlevelThemeProvider } from '@/design-system';
import { SavedController, type SavedApi } from './saved-controller';
import { SavedIntentRepository } from './saved-storage';
import { SavedEditor } from './saved-editor';
import { personalSaved, savedReceipt } from './saved-fixture.test-helper';
import { personalFood } from './food-fixture.test-helper';
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual<object>('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
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
function chooseCreate(view: ReturnType<typeof render>, index: number) {
  const alert = jest.spyOn(Alert, 'alert');
  fireEvent.press(view.getByLabelText('Nueva comida'));
  act(() => alert.mock.calls.at(-1)![2]![index].onPress!());
  alert.mockRestore();
}
function fixture() {
  const map = new Map<string, string>(),
    port = {
      getItem: async (k: string) => map.get(k) ?? null,
      setItem: async (k: string, v: string) => {
        map.set(k, v);
      },
      removeItem: async (k: string) => {
        map.delete(k);
      },
    };
  const api: SavedApi = {
    list: jest
      .fn<SavedApi['list']>()
      .mockResolvedValue({ status: 'ok', data: { status: 'ok', meals: [personalSaved] }, meta }),
    detail: async () => ({ status: 'ok', data: { status: 'ok', meal: personalSaved }, meta }),
    foods: async () => ({ status: 'ok', data: { status: 'ok', foods: [personalFood] }, meta }),
    write: jest.fn<SavedApi['write']>().mockImplementation(async (i) => ({
      status: 'ok',
      data: {
        ...savedReceipt,
        operation: i.operation,
        ...(i.operation === 'delete' ? { version: null, updatedAt: null } : {}),
      },
      meta,
    })),
  };
  const c = new SavedController(api, new SavedIntentRepository(port, 'owner'));
  const element = () => (
    <OwnlevelThemeProvider initialMode="light">
      <SavedEditor controller={c} state={c.getSnapshot()} />
    </OwnlevelThemeProvider>
  );
  const view = render(element());
  c.subscribe(() => view.rerender(element()));
  return {
    c,
    api,
    view,
    open: async () =>
      act(async () => {
        await c.initialize();
        c.open();
      }),
  };
}
describe('Native Saved Meal management', () => {
  it('list filters and manual create preserve unknown versus zero and save', async () => {
    const f = fixture();
    await f.open();
    await act(async () => {
      fireEvent.press(f.view.getByText('Archivadas'));
    });
    expect(f.api.list).toHaveBeenLastCalledWith('archived', '');
    chooseCreate(f.view, 1);
    fireEvent.changeText(f.view.getByLabelText('Nombre'), 'Manual');
    fireEvent.changeText(f.view.getByLabelText('Proteína (g)'), '0');
    expect(f.view.getByLabelText('Calorías').props.value).toBe('');
    await act(async () => {
      fireEvent.press(f.view.getByText('Guardar'));
    });
    expect(f.api.write).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'create',
        fields: expect.objectContaining({ calories: null, proteinG: 0 }),
      }),
    );
  });
  it('composed uses personal Food picker, 2-decimal quantity and canonical totals', async () => {
    const f = fixture();
    await f.open();
    chooseCreate(f.view, 2);
    fireEvent.changeText(f.view.getByLabelText('Nombre'), 'Compuesta');
    await act(async () => {
      fireEvent.press(f.view.getByText('Agregar ingrediente'));
    });
    fireEvent.press(f.view.getByLabelText(/^Elegir CAFÉ,/));
    expect(f.view.getByLabelText('Cantidad 1').props.value).toBe('');
    fireEvent.changeText(f.view.getByLabelText('Cantidad 1'), '0,25');
    fireEvent.press(f.view.getByLabelText('Sumar CAFÉ'));
    expect(f.view.getByLabelText('Cantidad 1').props.value).toBe('0,38');
    fireEvent.press(f.view.getByLabelText('Restar CAFÉ'));
    expect(f.view.getByLabelText('Cantidad 1').props.value).toBe('0,25');
    expect(f.view.getAllByText('45 kcal').length).toBeGreaterThan(0);
    expect(f.view.getByText('P — · C 2,22 · G 0')).toBeTruthy();
    await act(async () => {
      fireEvent.press(f.view.getByText('Guardar'));
    });
    expect(f.api.write).toHaveBeenCalledWith(
      expect.objectContaining({
        fields: expect.objectContaining({
          templateType: 'composite',
          items: [{ kind: 'food', id: personalFood.id, version: personalFood.version, quantity: 0.25 }],
        }),
      }),
    );
  });
  it('refresh cannot destroy the editor draft and pending locks the form', async () => {
    const f = fixture();
    await f.open();
    fireEvent.press(f.view.getByLabelText(/^Editar CAFÉ,/));
    fireEvent.changeText(f.view.getByLabelText('Calorías'), '100');
    await act(async () => {
      await f.c.load();
    });
    expect(f.view.getByLabelText('Calorías').props.value).toBe('100');
    (f.api.write as jest.Mock<SavedApi['write']>).mockImplementation(() => new Promise(() => {}));
    await act(async () => {
      fireEvent.press(f.view.getByText('Guardar'));
    });
    expect(f.view.getByLabelText('Calorías').props.editable).toBe(false);
  });
  it('unavailable stays distinct from empty', async () => {
    const f = fixture();
    (f.api.list as jest.Mock<SavedApi['list']>).mockResolvedValue({
      status: 'unavailable',
      reason: 'server',
      meta: { ...meta, httpStatus: 503, outcome: 'unavailable' },
    });
    await f.open();
    expect(f.view.getByText(/No pudimos actualizar las guardadas/)).toBeTruthy();
    expect(f.view.queryByText('No tenés guardadas en este filtro.')).toBeNull();
  });
});

describe('Saved library presentation safeguards', () => {
  it('disables an unchanged or invalid draft and shows Guardado only after catalog verification', async () => {
    const f = fixture();
    await f.open();
    fireEvent.press(f.view.getByLabelText(/^Editar CAFÉ,/));
    expect(f.view.getByText('Guardar')).toBeDisabled();
    fireEvent.changeText(f.view.getByLabelText('Nombre'), '');
    expect(f.view.getByText('Guardar')).toBeDisabled();
    fireEvent.changeText(f.view.getByLabelText('Nombre'), 'Nombre nuevo');
    let finish!: (r: Awaited<ReturnType<SavedApi['detail']>>) => void;
    f.api.detail = () =>
      new Promise((resolve) => {
        finish = resolve;
      });
    await act(async () => {
      fireEvent.press(f.view.getByText('Guardar'));
    });
    expect(f.view.queryByText('Guardado')).toBeNull();
    expect(f.c.getSnapshot().phase).toBe('confirmed');
    await act(async () => finish({ status: 'ok', data: { status: 'ok', meal: personalSaved }, meta }));
    expect(f.view.getByText('Guardado')).toBeTruthy();
    expect(f.view.queryByLabelText('Nombre')).toBeNull();
    expect(f.view.queryByText('Deshacer')).toBeNull();
  });
  it('exposes neutral archive and restore accessibility actions with native confirmation and the same version', async () => {
    const f = fixture();
    await f.open();
    const alert = jest.spyOn(Alert, 'alert');
    fireEvent(f.view.getByLabelText(/^Editar CAFÉ,/), 'accessibilityAction', {
      nativeEvent: { actionName: 'Archivar' },
    });
    expect(f.api.write).not.toHaveBeenCalled();
    expect(alert.mock.calls.at(-1)?.[0]).toBe('¿Archivar comida guardada?');
    await act(async () => alert.mock.calls.at(-1)![2]![1].onPress!());
    expect(f.api.write).toHaveBeenLastCalledWith(
      expect.objectContaining({ operation: 'archive', expectedVersion: personalSaved.version, fields: null }),
    );
    (f.api.list as jest.Mock<SavedApi['list']>).mockResolvedValue({
      status: 'ok',
      data: { status: 'ok', meals: [{ ...personalSaved, isActive: false }] },
      meta,
    });
    await act(async () => f.c.setFilter('archived'));
    fireEvent(f.view.getByLabelText(/^Editar CAFÉ,/), 'accessibilityAction', {
      nativeEvent: { actionName: 'Restaurar' },
    });
    await act(async () => alert.mock.calls.at(-1)![2]![1].onPress!());
    expect(f.api.write).toHaveBeenLastCalledWith(
      expect.objectContaining({ operation: 'reactivate', expectedVersion: personalSaved.version, fields: null }),
    );
    alert.mockRestore();
  });
  it('keeps an uncertain intent and the draft until explicit recovery, and retains conflict review', async () => {
    const f = fixture();
    await f.open();
    fireEvent.press(f.view.getByLabelText(/^Editar CAFÉ,/));
    fireEvent.changeText(f.view.getByLabelText('Calorías'), '222');
    (f.api.write as jest.Mock<SavedApi['write']>).mockRejectedValueOnce(new Error('offline'));
    await act(async () => fireEvent.press(f.view.getByText('Guardar')));
    expect(f.view.getByLabelText('Calorías').props.editable).toBe(false);
    expect(f.view.getByText('Comprobar intento guardado')).toBeTruthy();
    expect(f.api.write).toHaveBeenCalledTimes(1);
    await act(async () => fireEvent.press(f.view.getByText('Comprobar intento guardado')));
    expect(f.api.write).toHaveBeenCalledTimes(2);
    const calls = (f.api.write as jest.Mock<SavedApi['write']>).mock.calls;
    expect(calls[1][0]).toEqual(calls[0][0]);
    fireEvent.press(f.view.getByLabelText(/^Editar CAFÉ,/));
    fireEvent.changeText(f.view.getByLabelText('Calorías'), '333');
    (f.api.write as jest.Mock<SavedApi['write']>).mockResolvedValueOnce({
      status: 'conflict',
      code: 'SAVED_CHANGED',
      message: 'La comida cambió.',
      meta: { ...meta, outcome: 'conflict' },
    });
    await act(async () => fireEvent.press(f.view.getByText('Guardar')));
    expect(f.view.getByText('Revisar borrador con versión actual')).toBeTruthy();
    expect(f.view.getByLabelText('Calorías').props.value).toBe('333');
    fireEvent.press(f.view.getByText('Revisar borrador con versión actual'));
    expect(f.c.getSnapshot().phase).toBe('idle');
    expect(f.view.getByLabelText('Calorías').props.value).toBe('333');
  });
});

describe('Library swipe archive', () => {
  it('closes the swipe and asks for native confirmation before archiving', async () => {
    const f = fixture();
    await f.open();
    const close = jest.fn(),
      reset = jest.fn(),
      alert = jest.spyOn(Alert, 'alert');
    const swipe = f.view.UNSAFE_getAllByType(Swipeable)[0];
    const action = render(
      <OwnlevelThemeProvider initialMode="light">
        {swipe.props.renderRightActions({ value: 1 }, { value: -120 }, { close, reset })}
      </OwnlevelThemeProvider>,
    );
    fireEvent.press(action.getByLabelText('Archivar'));
    expect(close).toHaveBeenCalledTimes(1);
    expect(f.api.write).not.toHaveBeenCalled();
    expect(alert.mock.calls.at(-1)?.[0]).toBe('¿Archivar comida guardada?');
    await act(async () => alert.mock.calls.at(-1)![2]![1].onPress!());
    expect(f.api.write).toHaveBeenLastCalledWith(expect.objectContaining({ operation: 'archive', fields: null }));
    action.unmount();
    alert.mockRestore();
  });
});
