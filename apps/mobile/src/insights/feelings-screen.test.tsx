import { act, render, within } from '@testing-library/react-native';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { OwnlevelThemeProvider } from '@/design-system';
import type { MobileApiClient } from '@/api/client';
import { clearConfirmedReads } from '@/api/confirmed-read-cache';
import type { MobileApiReadResult } from '@/api/results';
import { createInsightsSnapshot, insightsFeelingOutcomes } from '../../../../src/lib/progress/insights-engine/read-model';
import type { InsightsSource } from '../../../../src/lib/progress/insights-engine/types';
import { FeelingsScreen } from './feelings-screen';
import { postsText } from './feelings-model';

jest.mock('@react-native-async-storage/async-storage', () => jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn(), back: jest.fn() }), useFocusEffect: () => undefined, useLocalSearchParams: () => ({}) }));
type ReadOptions = Parameters<MobileApiClient['read']>[0];
const mockRead = jest.fn<(options: ReadOptions) => Promise<MobileApiReadResult<unknown>>>();
const mockClient = { read: mockRead, request: jest.fn() } as unknown as MobileApiClient;
jest.mock('@/api', () => ({ useMobileApi: () => ({ client: mockClient }) }));

const meta = { durationMs: 1, httpStatus: 200, outcome: 'ok' as const };
const lost = { status: 'unavailable' as const, reason: 'network' as const, meta: { durationMs: 1, httpStatus: null, outcome: 'unavailable' as const } };
const id = (n: number) => `93670000-0000-4000-8002-${String(n).padStart(12, '0')}`;
type Day = { date: string; energy?: [number | null, number | null]; fatigue?: [number | null, number | null]; lateEnd?: boolean; legacy?: number };
function history(days: Day[]): InsightsSource {
  const sessions: InsightsSource['sessions'][number][] = [], feelings: InsightsSource['feelings'][number][] = [];
  days.forEach((day, index) => {
    sessions.push({ id: id(index), date: day.date, routineId: null, routineName: null, name: null, status: 'completed', startedAt: `${day.date}T18:00:00.000Z`, endedAt: `${day.date}T19:00:00.000Z`,
      performanceLevel: null, painLevel: null, legacyEnergyLevel: day.legacy ?? null });
    const facts: Record<string, unknown> = {};
    for (const kind of ['energy', 'fatigue'] as const) day[kind]?.forEach((value, side) => {
      if (value === null) return;
      const post = side === 1, at = post ? (day.lateEnd ? `${day.date}T23:30:00.000Z` : `${day.date}T19:01:00.000Z`) : `${day.date}T17:55:00.000Z`;
      facts[`${kind}${post ? 'Post' : 'Pre'}`] = { value, instrumentVersion: 'energy-fatigue/1', declaredMoment: post ? 'post' : 'pre', declaredAt: null, capturedAt: at, source: 'mobile' };
    });
    if (Object.keys(facts).length) feelings.push({ sessionId: id(index), revision: 1, facts });
  });
  return { sessions, exercises: [], sets: [], feelings, metricDefinitions: [], metricValues: [], meals: [] };
}
const serve = (source: InsightsSource) => async (options: ReadOptions) => {
  const body = insightsFeelingOutcomes(createInsightsSnapshot(source, { today: '2029-06-01', revision: 'r1', method: 2 }));
  const parsed = options.parse(JSON.parse(JSON.stringify(body)));
  if (parsed === undefined) throw Error(`Contract rejected ${options.path}`);
  return { status: 'ok' as const, data: parsed, meta };
};
const open = async () => {
  const view = render(<SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}><OwnlevelThemeProvider initialMode="light"><FeelingsScreen /></OwnlevelThemeProvider></SafeAreaProvider>);
  await act(async () => { for (let i = 0; i < 3; i++) await new Promise(resolve => setTimeout(resolve, 0)); });
  return view;
};
beforeEach(() => { mockRead.mockReset(); clearConfirmedReads(mockClient); });

describe('#367 cómo terminaste', () => {
  it('reads once when it opens and shows each feeling on its own, by how it started, in words and counts', async () => {
    mockRead.mockImplementation(serve(history([
      { date: '2029-03-01', energy: [2, 4], fatigue: [1, 3] }, { date: '2029-03-02', energy: [4, 4], fatigue: [2, 4] },
      { date: '2029-03-03', energy: [4, 5], fatigue: [2, 4] }, { date: '2029-03-04', energy: [null, 3], fatigue: [null, 2] },
      { date: '2029-03-05', energy: [3, 2], fatigue: [3, 3], lateEnd: true }, { date: '2029-03-06', legacy: 4 },
    ])));
    const view = await open();
    expect(mockRead).toHaveBeenCalledTimes(1);
    expect(String(mockRead.mock.calls[0]![0].path)).toContain('view=feelings');
    const energy = within(view.getByTestId('feelings-energy'));
    // Ending high after starting high and after starting low stay apart.
    expect(energy.getByLabelText('Energía alta antes de entrenar: 2 sesiones. Al terminar, energía muy alta 1, alta 1')).toBeTruthy();
    expect(energy.getByLabelText('Energía baja antes de entrenar: 1 sesión. Al terminar, energía alta 1')).toBeTruthy();
    expect(energy.getByText(/1 sin respuesta antes/)).toBeTruthy();
    expect(energy.getByText('Respondidas más tarde')).toBeTruthy();
    expect(energy.getByText('Solo con el registro anterior de energía')).toBeTruthy();
    expect(energy.getByText(/4 sesiones con respuesta al terminar, de 6 sesiones terminadas/)).toBeTruthy();
    const fatigue = within(view.getByTestId('feelings-fatigue'));
    expect(fatigue.getByLabelText('Fatiga poca antes de entrenar: 2 sesiones. Al terminar, fatiga mucha 2')).toBeTruthy();
    expect(fatigue.queryByText('Solo con el registro anterior de energía')).toBeNull();
    expect(view.getByTestId('feelings-not-published')).toBeTruthy();
    // No number of the scale, average, percentage or score.
    expect(view.queryByText(/%|promedio|puntaje|\b[1-5] de 5\b/)).toBeNull();
  });
  it('lists every answer that occurred, highest first, and nothing for one that did not', () => {
    expect(postsText('energy', [0, 1, 0, 2, 1])).toBe('muy alta 1 · alta 2 · baja 1');
    expect(postsText('fatigue', [3, 0, 0, 0, 0])).toBe('ninguna 3');
  });
  it('is a failed read, not an empty one, when the answer does not arrive', async () => {
    mockRead.mockResolvedValue(lost);
    const view = await open();
    expect(view.getByText('Uy, no pudimos leer tus datos')).toBeTruthy();
    expect(view.queryByTestId('feelings-energy')).toBeNull();
  });
  it('says there is nothing yet, without example numbers, when no session has an end answer', async () => {
    mockRead.mockImplementation(serve(history([{ date: '2029-03-01' }])));
    const view = await open();
    expect(within(view.getByTestId('feelings-energy')).getByText('Todavía no hay respuestas al terminar para mostrar.')).toBeTruthy();
  });
});
