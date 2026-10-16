import { act, fireEvent, render } from '@testing-library/react-native';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import type { MobileApiClient } from '@/api/client';
import type { MobileApiRequestResult } from '@/api/results';
import { OwnlevelThemeProvider } from '@/design-system';
import { DELETED_NOTICE, DeleteAccountScreen } from './delete-account-screen';

const mockRequest = jest.fn<MobileApiClient['request']>();
const mockSignOut = jest.fn(async (_notice?: string) => undefined);
const mockBack = jest.fn();
jest.mock('@/api', () => ({ useMobileApi: () => ({ client: { read: jest.fn(), request: mockRequest } }) }));
jest.mock('@/auth', () => ({ useMobileAuth: () => ({ signOut: mockSignOut }) }));
jest.mock('expo-router', () => ({ useRouter: () => ({ back: mockBack }) }));
jest.mock('expo-router/react-navigation', () => ({ usePreventRemove: () => {} }));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));

const meta = { durationMs: 1, httpStatus: 200, outcome: 'ok' as const };
const ok = { status: 'ok', data: { status: 'deleted' }, meta } as MobileApiRequestResult<unknown>;
const unavailable = { status: 'unavailable', reason: 'network', meta: { ...meta, httpStatus: null, outcome: 'unavailable' } } as MobileApiRequestResult<unknown>;
const unauthorized = { status: 'unauthorized', meta: { ...meta, httpStatus: 401, outcome: 'unauthorized' } } as MobileApiRequestResult<unknown>;
const screen = () => render(
  <SafeAreaInsetsContext.Provider value={{ top: 0, right: 0, bottom: 0, left: 0 }}>
    <OwnlevelThemeProvider><DeleteAccountScreen /></OwnlevelThemeProvider>
  </SafeAreaInsetsContext.Provider>,
);
const button = (view: ReturnType<typeof screen>, name: RegExp) => view.getByRole('button', { name });
const press = async (view: ReturnType<typeof screen>, name: RegExp) => { await act(async () => { fireEvent.press(button(view, name)); }); };

beforeEach(() => { jest.clearAllMocks(); });

describe('Eliminar cuenta (AJ7)', () => {
  it('says what is deleted and only enables the action after typing ELIMINAR', async () => {
    const view = screen();
    expect(view.getByText(/en esta app y en la Web/)).toBeTruthy();
    expect(view.getByText('Comidas, alimentos y comidas guardadas')).toBeTruthy();
    expect(button(view, /Eliminar mi cuenta/).props.accessibilityState.disabled).toBe(true);
    await press(view, /Eliminar mi cuenta/);
    expect(mockRequest).not.toHaveBeenCalled();
    fireEvent.changeText(view.getByLabelText('Para confirmar, escribí ELIMINAR'), 'eliminar');
    expect(button(view, /Eliminar mi cuenta/).props.accessibilityState.disabled).toBe(false);
  });

  it('deletes with the exact confirmation and signs out with a neutral notice', async () => {
    mockRequest.mockResolvedValue(ok);
    const view = screen();
    fireEvent.changeText(view.getByLabelText('Para confirmar, escribí ELIMINAR'), 'ELIMINAR');
    await press(view, /Eliminar mi cuenta/);
    expect(mockRequest).toHaveBeenCalledWith(expect.objectContaining({
      method: 'DELETE', path: '/api/mobile/v1/account', body: { confirmation: 'ELIMINAR' },
    }));
    expect(mockSignOut).toHaveBeenCalledWith(DELETED_NOTICE);
  });

  it('an uncertain result offers a safe retry; a rejected token after that means it is gone', async () => {
    mockRequest.mockResolvedValueOnce(unavailable).mockResolvedValueOnce(unauthorized);
    const view = screen();
    fireEvent.changeText(view.getByLabelText('Para confirmar, escribí ELIMINAR'), 'ELIMINAR');
    await press(view, /Eliminar mi cuenta/);
    expect(view.getByText(/No pudimos confirmar si se eliminó/)).toBeTruthy();
    expect(mockSignOut).not.toHaveBeenCalled();
    await press(view, /Probar de nuevo/);
    expect(mockRequest).toHaveBeenCalledTimes(2);
    expect(mockSignOut).toHaveBeenCalledWith(DELETED_NOTICE);
  });

  it('a rejected token on the first try is an expired session, not a deletion', async () => {
    mockRequest.mockResolvedValue(unauthorized);
    const view = screen();
    fireEvent.changeText(view.getByLabelText('Para confirmar, escribí ELIMINAR'), 'ELIMINAR');
    await press(view, /Eliminar mi cuenta/);
    expect(mockSignOut).toHaveBeenCalledWith(expect.stringContaining('Tu sesión venció'));
  });

  it('"Mejor no" goes back without deleting', async () => {
    const view = screen();
    await press(view, /Mejor no/);
    expect(mockBack).toHaveBeenCalled();
    expect(mockRequest).not.toHaveBeenCalled();
  });
});
