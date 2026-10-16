import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { describe, expect, it, jest } from '@jest/globals';
import { OwnlevelThemeProvider } from '@/design-system';
import { QuickEditor } from './quick-editor';
import { QuickController, type QuickApi } from './quick-controller';
import { QuickIntentRepository } from './quick-storage';
import { quickDate, quickOptions, quickPreview, quickReceipt } from './quick-fixture.test-helper';
import { nutritionFixture } from './day-fixture.test-helper';
jest.mock('./day-resource', () => ({ useNutritionDayResource: () => ({ state: { status: 'loading' } }) }));
jest.mock('@/api', () => ({ useMobileApi: () => ({ client: null }) }));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
const meta = { durationMs: 1, httpStatus: 200, outcome: 'ok' as const };
function fixture() {
  const map = new Map<string,string>();
  const api: QuickApi = { options: jest.fn<QuickApi['options']>().mockResolvedValue({ status: 'ok', data: quickOptions(), meta }),
    preview: jest.fn<QuickApi['preview']>().mockImplementation(async s => ({ status: 'ok', data: quickPreview(s), meta })),
    confirm: jest.fn<QuickApi['confirm']>().mockImplementation(async i => ({ status: 'ok', data: i.operation === 'register' ? quickReceipt : { ...quickReceipt, operation: 'saveSuggestion', status: 'habitual_saved' }, meta })),
    read: jest.fn<QuickApi['read']>().mockImplementation(async d => ({ status: 'ok', data: nutritionFixture(d), meta })) };
  const c = new QuickController(api, new QuickIntentRepository({ getItem: async k => map.get(k) ?? null, setItem: async(k,v) => { map.set(k,v); }, removeItem: async k => { map.delete(k); } }, 'owner'), () => {});
  const view = render(<OwnlevelThemeProvider initialMode="light"><QuickEditor suggestions controller={c} state={c.getSnapshot()} /></OwnlevelThemeProvider>);
  c.subscribe(() => view.rerender(<OwnlevelThemeProvider initialMode="light"><QuickEditor suggestions controller={c} state={c.getSnapshot()} /></OwnlevelThemeProvider>));
  return { c, api, view };
}
describe('Native quick editor', () => {
  it('shows saved/suggested, explicit date, previews adjusted quantities and confirms', async () => {
    const { c, api, view } = fixture(); await act(async () => { await c.initialize(); c.open(quickDate); });
    expect(view.getByText('Guardadas')).toBeTruthy(); expect(view.getByText('Para vos')).toBeTruthy(); expect(view.getByText('Destino · sábado, 3 de octubre de 2026')).toBeTruthy();
    await act(async () => { fireEvent.press(view.getAllByLabelText('Revisar PASTA').at(-1)!); });
    expect(view.getByLabelText('Cantidad de INGREDIENTE').props.value).toBe('100'); expect(view.getByTestId('quick-preview')).toBeTruthy();
    fireEvent.changeText(view.getByLabelText('Cantidad de INGREDIENTE'), '150,25'); expect(view.queryByTestId('quick-preview')).toBeNull();
    await view.findByTestId('quick-preview');
    await act(async () => { fireEvent.press(view.getByText(/Agregar al día ·/)); });
    await waitFor(() => expect(view.queryByTestId('quick-meal-editor')).toBeNull());
    expect(api.confirm).toHaveBeenCalledWith(expect.objectContaining({ quantities: [{ itemId: '42100000-0000-4000-8000-000000000001', quantity: 150.25 }] }));
  });
  it('shows independent unavailable/empty and saves suggested as habitual without a day write', async () => {
    const f = fixture(); (f.api.options as jest.Mock<QuickApi['options']>).mockResolvedValueOnce({ status: 'ok', data: { ...quickOptions(), saved: { status: 'unavailable' } }, meta });
    await act(async () => { await f.c.initialize(); f.c.open(quickDate); }); expect(f.view.getByText('No pudimos cargar estas opciones.')).toBeTruthy();
    await act(async () => { fireEvent.press(f.view.getByLabelText('Revisar PASTA')); });
    expect(f.view.queryByLabelText('Cantidad de INGREDIENTE')).toBeNull();
    await act(async () => { fireEvent.press(f.view.getByText('Guardar como habitual')); });
    expect(f.api.confirm).toHaveBeenCalledWith(expect.objectContaining({ operation: 'saveSuggestion' })); expect(f.api.read).not.toHaveBeenCalled();
  });
  it('foreground/options refresh preserves an open quantity draft', async () => {
    const f = fixture(); await act(async () => { await f.c.initialize(); f.c.open(quickDate); });
    await act(async () => { fireEvent.press(f.view.getAllByLabelText('Revisar PASTA').at(-1)!); });
    fireEvent.changeText(f.view.getByLabelText('Cantidad de INGREDIENTE'), '200');
    await act(async () => { await f.c.loadOptions(); }); expect(f.view.getByLabelText('Cantidad de INGREDIENTE').props.value).toBe('200');
  });
});
