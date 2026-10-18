import { fireEvent, render } from '@testing-library/react-native';
import { describe, expect, it, jest } from '@jest/globals';
import { OwnlevelThemeProvider } from '@/design-system';
import type { ApiResourceState } from '@/api/resource';
import type { MobileHomeResponse } from '@/api/home';
import DiagnosticsScreen from '../../app/settings/diagnostics';

let mockState: ApiResourceState<MobileHomeResponse> = { status: 'loading', trigger: 'initial' };
const mockRefresh = jest.fn();
jest.mock('@/api', () => ({
  useMobileApi: () => ({ client: {}, config: { host: 'example.com', appEnv: 'development' }, runtime: { platform: 'ios' }, configurationError: false }),
  useApiResource: () => ({ state: mockState, refresh: mockRefresh }),
}));
jest.mock('@/auth', () => ({ useMobileAuth: () => ({ session: {} }) }));
const screen = () => render(<OwnlevelThemeProvider initialMode="light"><DiagnosticsScreen /></OwnlevelThemeProvider>);
describe('Diagnostics QA', () => {
  it('has a shaped loading state and a busy button, without raw request states', () => {
    mockState = { status: 'loading', trigger: 'initial' };
    const view = screen();
    expect(view.getByText('Diagnóstico')).toBeTruthy();
    expect(view.getByLabelText('Comprobar conexión').props.accessibilityState.busy).toBe(true);
    expect(view.queryByText(/payload|Runtime|pending|loading|Refresh|Consultando Mobile/)).toBeNull();
  });
  it('unavailable is not empty and retry keeps the existing read path', () => {
    mockState = { status: 'unavailable', reason: 'network', result: { status: 'unavailable', reason: 'network', meta: { durationMs: 14, httpStatus: null, outcome: 'unavailable' } } };
    const view = screen();
    expect(view.getByText('No pudimos comprobar la conexión. Podés volver a probar.')).toBeTruthy();
    fireEvent.press(view.getByLabelText('Comprobar conexión'));
    expect(mockRefresh).toHaveBeenCalled();
    expect(view.queryByText('0 ms')).toBeNull();
  });
});
