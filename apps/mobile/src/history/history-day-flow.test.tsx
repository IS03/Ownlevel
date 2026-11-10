import type { ReactElement } from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { OwnlevelThemeProvider } from '@/design-system';
import type { MobileApiClient } from '@/api/client';
import type { HistoryDay } from '@/api/history';
import { historyDay, historyFact, historyId, historyRange } from '../../../../src/lib/mobile-api/history-fixture.test-helper';
import { HistoryScreen } from './history-screen';
import { nutritionFixture } from '@/nutrition/day-fixture.test-helper';
import { HistoryDayScreen } from './day-screen';
import { HistoryCalendarScreen } from './calendar-screen';

// Real exact-date parser and useHistoryResource; no endpoint, persistence or production account.
type ReadArgs = { path: string; signal?: AbortSignal; parse: (raw: unknown) => unknown };
const mockRead = jest.fn<(args: ReadArgs) => Promise<unknown>>();
const mockClient = { read: mockRead } as unknown as MobileApiClient;
const mockPush = jest.fn(), mockNavigate = jest.fn(), mockReplace = jest.fn();
let mockParams: Record<string, string> = {}, mockOwner: string | null = 'a', mockFocused = true;
const mockFocusListeners = new Set<() => void>();
let mockBytes: number[] = [];
let mockDays = new Map<string, HistoryDay>();
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('@/api', () => ({ useMobileApi: () => ({ client: mockOwner ? mockClient : null }) }));
jest.mock('@/auth', () => ({ useMobileAuth: () => ({ session: mockOwner ? { user: { id: mockOwner } } : null }) }));
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  useRouter: () => ({ push: mockPush, navigate: mockNavigate, replace: mockReplace }),
  useFocusEffect: (callback: () => void | (() => void)) => {
    const { useEffect, useSyncExternalStore } = jest.requireActual<typeof import('react')>('react');
    const focused = useSyncExternalStore(listener => { mockFocusListeners.add(listener); return () => { mockFocusListeners.delete(listener); }; }, () => mockFocused);
    useEffect(() => { if (focused) return callback(); }, [callback, focused]);
  },
}));
const meta = { durationMs: 1, httpStatus: 200, outcome: 'ok' as const };
const ok = (data: unknown) => ({ status: 'ok' as const, data, meta });
const lost = { status: 'unavailable' as const, reason: 'network' as const, meta: { ...meta, httpStatus: null, outcome: 'unavailable' as const } };
const DAY = '2026-09-30';
function dayWithSessions(date = DAY, total = 5) {
  const day = historyDay(date); day.discovery!.days[0].completedSessionsCount = total;
  day.training = { status: 'ok', data: { sessions: Array.from({ length: Math.min(total, 3) }, (_, i) => ({ id: historyId(i + 1), name: `Rutina ${i + 1}` })) } };
  return day;
}
const reply = (args: ReadArgs, raw: unknown) => { mockBytes.push(Buffer.byteLength(JSON.stringify(raw))); const data = args.parse(raw); return data ? ok(data) : lost; };
const wrapped = (element: ReactElement) => <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }}><OwnlevelThemeProvider>{element}</OwnlevelThemeProvider></SafeAreaProvider>;
const flush = () => act(async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); });
const focus = (value: boolean) => act(() => { mockFocused = value; mockFocusListeners.forEach(listener => listener()); });
beforeEach(() => {
  jest.clearAllMocks(); mockRead.mockReset(); mockBytes = []; mockOwner = 'a'; mockFocused = true; mockFocusListeners.clear();
  mockParams = { date: DAY, historyMonth: '2026-09' }; mockDays = new Map([[DAY, dayWithSessions()]]);
  mockRead.mockImplementation(async args => {
    if (args.path.includes('from=2026-10-01')) { const range = historyRange(Array.from({ length: 4 }, (_, i) => historyFact(`2026-10-0${i + 1}`))); range.requestedRange = { from: '2026-10-01', to: '2026-10-31' }; return reply(args, range); }
    if (args.path.startsWith('/api/mobile/v1/history/calendar')) return reply(args, historyRange(Array.from({ length: 30 }, (_, i) => historyFact(`2026-09-${String(i + 1).padStart(2, '0')}`, { completedSessionsCount: i === 29 ? 5 : 0 }))));
    const date = args.path.split('/').at(-1)!;
    return reply(args, mockDays.get(date) ?? historyDay(date));
  });
});

describe('exact-date history continuity with real reader', () => {
  it.each(['day', 'calendar', 'recent'] as const)('reading budget: %s loads once and never fetches session details for its preview', async surface => {
    if (surface === 'calendar') mockParams = { month: '2026-09' };
    const view = render(wrapped(surface === 'day' ? <HistoryDayScreen /> : surface === 'calendar' ? <HistoryCalendarScreen /> : <HistoryScreen />)); await flush();
    expect(mockRead).toHaveBeenCalledTimes(1);
    const before = mockRead.mock.calls.length;
    if (surface === 'day') {
      // Older clients can show the same preview text. This measurement runs unchanged on the base too.
      expect(view.getByText(/^Rutina 1(?: · terminada)?$/)).toBeTruthy();
    } else fireEvent.press(view.getByLabelText(surface === 'calendar' ? /2026-09-30\. (?:Entrenamiento|Training)/ : /30 sep 2026\. (?:Entrenamiento|Training)/));
    expect(mockRead).toHaveBeenCalledTimes(before);
    expect(mockRead.mock.calls.some(([args]) => args.path.includes('/training/sessions/'))).toBe(false);
    console.info('HISTORY_READ_BUDGET', JSON.stringify({ surface, responseBytes: mockBytes, initialGroupedReads: before, sessionDetailReads: 0, readsAfterCalendarTap: mockRead.mock.calls.length - before }));
  });
  it('opening an original is explicit, carries the exact day/month, and does not fan out to the other previews', async () => {
    const view = render(wrapped(<HistoryDayScreen />)); await flush();
    expect(mockPush).not.toHaveBeenCalled();
    fireEvent.press(view.getByTestId(`history-day-session-${historyId(2)}`));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/(tabs)/train/history/[id]', params: { id: historyId(2), historyDate: DAY, historyMonth: '2026-09' } });
    expect(mockRead).toHaveBeenCalledTimes(1);
  });
  it('re-reads the same date on return after correction/discard, then removes the final fact on a confirmed empty read', async () => {
    const view = render(wrapped(<HistoryDayScreen />)); await flush();
    focus(false);
    const corrected = dayWithSessions(DAY, 4);
    corrected.training = { status: 'ok', data: { sessions: [{ id: historyId(2), name: 'Nombre corregido' }, { id: historyId(3), name: 'Rutina 3' }, { id: historyId(4), name: 'Rutina 4' }] } };
    mockDays.set(DAY, corrected); focus(true); await flush();
    expect(mockRead).toHaveBeenCalledTimes(2);
    expect(view.queryByTestId(`history-day-session-${historyId(1)}`)).toBeNull(); expect(view.getByText('Nombre corregido')).toBeTruthy();
    expect(view.getByText('Vista previa: 3 de 4 sesiones. Consultá todas en Entrenamiento del día.')).toBeTruthy();
    expect(mockRead.mock.calls.every(([args]) => args.path.endsWith(DAY))).toBe(true);
    focus(false); mockRead.mockResolvedValueOnce(lost); focus(true); await flush();
    expect(view.getByText('Mostramos la última lectura de esta fecha. No pudo actualizarse.')).toBeTruthy();
    expect(view.getByText('Nombre corregido')).toBeTruthy(); expect(view.queryByTestId('global-day-empty')).toBeNull();
    mockDays.set(DAY, historyDay(DAY));
    fireEvent.press(view.getByRole('button', { name: 'Reintentar' })); await flush();
    expect(view.queryByText('Nombre corregido')).toBeNull(); expect(view.getByTestId('global-day-empty')).toBeTruthy();
    expect(view.getByText('0 sesiones terminadas')).toBeTruthy();
    fireEvent.press(view.getByRole('button', { name: 'Volver al calendario' }));
    expect(mockNavigate).toHaveBeenCalledWith({ pathname: '/history/calendar', params: { month: '2026-09' } });
  });
  it.each(['date', 'account', 'logout'] as const)('retires a late response after changing %s', async change => {
    let settle!: (value: unknown) => void;
    mockRead.mockImplementationOnce(() => new Promise(resolve => { settle = resolve; }));
    const view = render(wrapped(<HistoryDayScreen />)); await flush();
    if (change === 'date') mockParams = { date: '2026-10-01', historyMonth: '2026-09' };
    else { mockOwner = change === 'logout' ? null : 'b'; mockDays.set(DAY, historyDay(DAY)); }
    view.rerender(wrapped(<HistoryDayScreen />)); await flush();
    await act(async () => { settle(ok(dayWithSessions())); }); await flush();
    expect(view.queryByText('Rutina 1')).toBeNull(); expect(view.queryByTestId(`history-day-session-${historyId(1)}`)).toBeNull();
    if (change === 'logout') expect(view.queryByTestId('global-day-empty')).toBeNull();
    else expect(view.getByTestId('global-day-empty')).toBeTruthy();
  });
  it('rejects neighboring-date substitutions rather than showing an older weight/session on an empty chosen date', async () => {
    mockRead.mockImplementationOnce(async args => {
      const other = dayWithSessions('2026-09-29'); other.body.weight = { status: 'ok', data: { date: other.date, weightKg: 88 } };
      return reply(args, other);
    });
    const view = render(wrapped(<HistoryDayScreen />)); await flush();
    expect(view.getByText('No pudimos cargar esta fecha. Elegí una fecha hasta hoy.')).toBeTruthy();
    expect(view.queryByText('Peso: 88 kg')).toBeNull(); expect(view.queryByText('Rutina 1')).toBeNull(); expect(view.queryByTestId('global-day-empty')).toBeNull();
  });
  it.each(['2026-02-30', 'not-a-date'])('never reads invalid date %s', async date => {
    mockParams = { date }; const view = render(wrapped(<HistoryDayScreen />)); await flush();
    expect(view.getByText('Fecha inválida.')).toBeTruthy(); expect(mockRead).not.toHaveBeenCalled();
  });
});


it('secondary facts are local, remain current after editing/deleting a meal and disappear on account change', async () => {
  const day = dayWithSessions(), n = nutritionFixture(DAY);
  if (n.nutrition.status === 'ok') { const { meals: _meals, ...data } = n.nutrition.data; day.nutrition = { status: 'ok', data }; }
  day.discovery!.days[0].nutritionEntriesCount = 1;
  mockDays.set(DAY, day);
  const view = render(wrapped(<HistoryDayScreen />)); await flush();
  fireEvent.press(view.getByRole('button', { name: 'Objetivo y balance de esta fecha' }));
  expect(mockRead).toHaveBeenCalledTimes(1); expect(view.getByText('Objetivo: 1.800 kcal')).toBeTruthy();
  fireEvent.press(view.getByRole('button', { name: 'Abrir Nutrición del día' }));
  expect(mockNavigate).toHaveBeenCalledWith({ pathname: '/(tabs)/nutrition', params: { date: DAY, historyDate: DAY, historyMonth: '2026-09' } });
  focus(false); if (day.nutrition.status === 'ok' && day.nutrition.data.dayState === 'recorded') day.nutrition.data.summary.calories.knownTotal = 300;
  focus(true); await flush(); expect(view.getByText('Consumo: 300 kcal')).toBeTruthy();
  focus(false); mockDays.set(DAY, historyDay(DAY)); focus(true); await flush();
  expect(view.queryByText('Objetivo: 1.800 kcal')).toBeNull(); expect(view.getByText('Sin registro nutricional.')).toBeTruthy();
  mockOwner = 'b'; view.rerender(wrapped(<HistoryDayScreen />)); await flush();
  expect(view.queryByText('Consumo: 300 kcal')).toBeNull(); expect(view.queryByText('Rutina 1')).toBeNull();
});

it('calendar without month retains its two grouped discovery/month reads and no reads on a date tap', async () => {
  mockParams = {};
  const view = render(wrapped(<HistoryCalendarScreen />)); await flush();
  expect(mockRead).toHaveBeenCalledTimes(2);
  expect(mockRead.mock.calls.map(([args]) => args.path)).toEqual(['/api/mobile/v1/history/calendar', '/api/mobile/v1/history/calendar?from=2026-10-01&to=2026-10-31']);
  fireEvent.press(view.getByLabelText('2026-10-04. Sin actividad'));
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/history/day/[date]', params: { date: '2026-10-04', historyMonth: '2026-10' } });
  expect(mockRead).toHaveBeenCalledTimes(2);
  console.info('HISTORY_READ_BUDGET', JSON.stringify({surface:'calendar-without-month',initialGroupedReads:2,responseBytes:mockBytes,extraReadsOnTap:0}));
});
