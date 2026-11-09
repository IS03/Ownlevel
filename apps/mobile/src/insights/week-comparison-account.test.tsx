import { act, render } from '@testing-library/react-native';
import { expect, it, jest } from '@jest/globals';
import { RefreshControl } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { OwnlevelThemeProvider } from '@/design-system';
import { MobileApiProvider } from '@/api/provider';
import type { MobileApiClient } from '@/api/client';
import type { MobileApiReadResult } from '@/api/results';
import { periodExploration } from '../../../../src/lib/progress/insights-engine/week-exploration';
import { periodDetailsFixture } from '../../../../src/lib/progress/insights-engine/period-details-fixture';
import { WeekExplorationScreen } from './week-exploration-screen';

let mockOwner = 'a';
const mockAccess = jest.fn(), mockRevalidate = jest.fn();
const mockRead = jest.fn<(owner: string, options: Parameters<MobileApiClient['read']>[0]) => Promise<MobileApiReadResult<unknown>>>();
jest.mock('@react-native-async-storage/async-storage', () => jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('@/auth', () => ({ useMobileAuth: () => ({ session: { user: { id: mockOwner } }, getAccessTokenForApi: mockAccess, revalidateApiSession: mockRevalidate }) }));
jest.mock('@/api/config', () => ({ readMobileApiConfig: () => ({ appEnv: 'development', baseUrl: 'https://example.test', host: 'example.test', timeoutMs: 1000 }) }));
jest.mock('@/api/runtime', () => ({ createMobileClientRuntime: () => ({ appVersion: '1', build: '1', platform: 'ios' }) }));
jest.mock('@/api/client', () => ({ ...jest.requireActual<typeof import('@/api/client')>('@/api/client'), createMobileApiClient: () => { const owner = mockOwner; return { read: (o: Parameters<MobileApiClient['read']>[0]) => mockRead(owner, o), request: jest.fn() }; } }));
jest.mock('@/api', () => jest.requireActual('@/api/provider'));
jest.mock('expo-router', () => ({ useLocalSearchParams: () => ({ asOf: '2026-11-07', week: '2026-08-10', compare: '1', weekA: '2026-08-03', weekB: '2026-08-10' }), useRouter: () => ({ setParams: jest.fn(), navigate: jest.fn(), push: jest.fn() }), useFocusEffect: () => undefined }));
const meta = { durationMs: 1, httpStatus: 200, outcome: 'ok' as const };
const tree = () => <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, right: 0, bottom: 0, left: 0 } }}><OwnlevelThemeProvider initialMode="light"><MobileApiProvider><WeekExplorationScreen /></MobileApiProvider></OwnlevelThemeProvider></SafeAreaProvider>;

it('retires A/B facts and an in-flight reply on a direct account switch through the real provider', async () => {
  const source = periodDetailsFixture(), weights = ['2026-08-03', '2026-08-05', '2026-08-07'].map(date => ({ date, value: 80 }));
  const first = periodExploration(source, weights, '2027-01-02', '2026-11-07', 'same-revision', 2);
  const empty = periodExploration({ ...source, sessions: [], exercises: [], sets: [], feelings: [], meals: [] }, [], '2027-01-02', '2026-11-07', 'same-revision', 2);
  let finishOld!: () => void, finishNew!: () => void;
  mockRead.mockImplementationOnce(async (_owner, o) => ({ status: 'ok', data: o.parse(first), meta }))
    .mockImplementationOnce((_owner, o) => new Promise(resolve => { finishOld = () => resolve({ status: 'ok', data: o.parse(first), meta }); }))
    .mockImplementationOnce((_owner, o) => new Promise(resolve => { finishNew = () => resolve({ status: 'ok', data: o.parse(empty), meta }); }));
  const view = render(tree()); await view.findByText('80 kg');
  act(() => { void view.UNSAFE_getByType(RefreshControl).props.onRefresh(); });
  mockOwner = 'b'; view.rerender(tree());
  expect(view.queryByText('80 kg')).toBeNull(); expect(view.queryByTestId('week-comparison')).toBeNull();
  await act(async () => { finishOld(); });
  expect(view.queryByText('80 kg')).toBeNull();
  await act(async () => { finishNew(); });
  expect(view.getByTestId('week-comparison')).toBeTruthy(); expect(view.queryByText('80 kg')).toBeNull();
  expect(mockRead.mock.calls.map(([owner]) => owner)).toEqual(['a', 'a', 'b']);
  view.unmount();
});
