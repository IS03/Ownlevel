import { act, fireEvent, render, within } from '@testing-library/react-native';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { RefreshControl } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { OwnlevelThemeProvider } from '@/design-system';
import type { MobileApiClient } from '@/api/client';
import type { MobileApiReadResult } from '@/api/results';
import {
  CONNECTION_KEYS, fetchProgressConnections, parseProgressConnections,
  type ConnectionMissing, type ConnectionStory, type ProgressConnections,
} from '@/api/progress-connections';
import type { ProgressOverview, ProgressPeriod } from '@/api/progress';
import { ConnectionsSection } from './connections-section';
import { connectionTitle, connectionsPeriodText } from './connections-model';
import { ProgressOverviewScreen } from './overview-screen';
import { ProgressRangeProvider } from './progress-range-context';
import { addDays, calendarRange, compareRange, daysBetween, initialProgressRange, progressRequest, type DateRange, type ProgressRangeState } from './progress-range';

jest.mock('@react-native-async-storage/async-storage', () => jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }), useFocusEffect: () => undefined, Stack: { Screen: () => null } }));
jest.mock('@/platform/haptics', () => ({ haptics: { selection: jest.fn() }, triggerHaptic: jest.fn() }));
jest.mock('./my-views', () => ({ MyViews: () => null }));
jest.mock('./insight-row', () => ({ InsightRow: () => null }));
type ReadOptions = Parameters<MobileApiClient['read']>[0];
const mockRead = jest.fn<(options: ReadOptions) => Promise<MobileApiReadResult<unknown>>>();
const mockClient = { read: mockRead, request: jest.fn() } as unknown as MobileApiClient;
jest.mock('@/api', () => ({ useMobileApi: () => ({ client: mockClient }) }));

const TODAY = '2026-10-17', MONTH = initialProgressRange(TODAY);
const metadata = { durationMs: 1, httpStatus: 200, outcome: 'ok' as const };
const ok = <T,>(data: T) => ({ status: 'ok' as const, data, meta: metadata });
const lost = { status: 'unavailable' as const, reason: 'network' as const, meta: { durationMs: 1, httpStatus: null, outcome: 'unavailable' as const } };
function period(range: DateRange, previous?: DateRange): ProgressPeriod {
  const length = daysBetween(range.start, range.end);
  const b = previous ?? { start: addDays(range.start, -length), end: addDays(range.start, -1) };
  return { preset: 'custom', ...range, days: length, previousStart: b.start, previousEnd: b.end,
    bucket: length > 14 ? 'week' : 'day', includesToday: range.end === TODAY };
}
function weeks(range: DateRange, food: number) {
  const out = [];
  for (let start = range.start; start <= range.end;) {
    const end = [calendarRange('week', start).end, range.end].sort()[0];
    const eligible = daysBetween(start, end) - (end === TODAY ? 1 : 0);
    out.push({ start, end, food: eligible ? food : null, days: eligible, eligible }); start = addDays(end, 1);
  }
  return out;
}
function fixture(a: DateRange = { start: '2026-10-01', end: TODAY }, b: DateRange = { start: '2026-09-01', end: '2026-09-17' }): ProgressConnections {
  const exercises = ['Sentadilla', 'Press banca', 'Remo', 'Press militar', 'Peso muerto', 'Dominadas'].map((name, i) => ({
    exerciseId: `exercise-${i}`, name, previousE1rm: 97.5 - i * 5, currentE1rm: i < 4 ? 102.5 - i * 5 : 97.5 - i * 5,
    status: i < 4 ? 'improved' as const : 'stable' as const,
  }));
  const strength = { kind: 'strength' as const, improved: 4, comparable: 6,
    top: { exerciseId: exercises[0].exerciseId, name: exercises[0].name, previousE1rm: 97.5, currentE1rm: 102.5 } };
  const stories = CONNECTION_KEYS.map((key): ConnectionStory => {
    const isKcal = key === 'kcal_weight', protein = key === 'protein_strength';
    const current = isKcal ? 2240 : protein ? 142 : 268, previous = isKcal ? 2420 : protein ? 124 : 233;
    const base = { key, status: 'ready' as const, missing: null,
      food: { key: isKcal ? 'nutrition.kcal' as const : protein ? 'nutrition.protein' as const : 'nutrition.carbs' as const,
        unit: isKcal ? 'kcal' as const : 'g' as const, current, previous,
        coverage: { current: { days: daysBetween(a.start, a.end) - (a.end === TODAY ? 1 : 0), eligible: daysBetween(a.start, a.end) - (a.end === TODAY ? 1 : 0) },
          previous: { days: daysBetween(b.start, b.end), eligible: daysBetween(b.start, b.end) } } },
      weeks: weeks(a, current), weeksPrevious: weeks(b, previous) };
    if (key === 'carbs_energy') return { ...base, key, outcome: { kind: 'energy', current: 4.1, previous: 3.5, scaleMaximum: 5, sessions: { current: 3, previous: 3 } } };
    if (key === 'kcal_weight') return { ...base, key, outcome: { kind: 'weight', current: 62.7, previous: 63.3,
      perWeekCurrent: -0.2, perWeekPrevious: -0.1, weighIns: { current: 4, previous: 4 } },
      weightWeeks: base.weeks.map(w => ({ start: w.start, end: w.end, trend: 62.7 })),
      weightWeeksPrevious: base.weeksPrevious.map(w => ({ start: w.start, end: w.end, trend: 63.3 })) };
    return { ...base, key, outcome: { ...strength }, exercises };
  });
  return { today: TODAY, period: period(a, b), reference: period(b), stories, ranking: [...CONNECTION_KEYS] };
}
const overview = (a: DateRange, b?: DateRange): ProgressOverview => ({
  today: TODAY, period: period(a, b), evolution: [], changes: [], training: { status: 'unavailable' },
  nutrition: { status: 'unavailable' }, metrics: { status: 'ok', data: { items: [] } },
  body: { status: 'ok', data: { excludedSuspect: 0, trackedMetrics: 1 } },
  sparks: { training: null, nutrition: null, weight: { first: 80, last: 79.5, referenceLast: null, reference: null,
    current: [{ start: a.start, end: a.start, value: 80 }, { start: a.end, end: a.end, value: 79.5 }] } },
});
const changeStory = (dto: ProgressConnections, key: ConnectionStory['key'], missing: ConnectionMissing) => {
  const story = dto.stories.find(s => s.key === key)!;
  story.status = 'insufficient'; story.missing = missing; story.food.current = null; story.food.previous = null;
  dto.ranking = dto.ranking.filter(k => k !== key); return dto;
};
function unavailable(dto: ProgressConnections, key: ConnectionStory['key']) {
  const s = dto.stories.find(s => s.key === key)!; s.status = 'unavailable';
  s.missing = { side: 'food', reason: 'food_days', have: null, need: 4, period: 'current' };
  s.food.current = null; s.food.previous = null;
  s.weeks = s.weeks.map(w => ({ ...w, food: null })); s.weeksPrevious = s.weeksPrevious.map(w => ({ ...w, food: null }));
  if (s.outcome.kind === 'strength' && (s.key === 'protein_strength' || s.key === 'carbs_strength')) {
    s.outcome = { kind: 'strength', top: null, comparable: null, improved: null }; s.exercises = [];
  } else if (s.outcome.kind === 'energy') {
    s.outcome = { kind: 'energy', current: null, previous: null, scaleMaximum: 5, sessions: { current: null, previous: null } };
  } else if (s.key === 'kcal_weight') {
    s.outcome = { kind: 'weight', current: null, previous: null, perWeekCurrent: null, perWeekPrevious: null, weighIns: { current: null, previous: null } };
    s.weightWeeks = s.weightWeeks.map(w => ({ ...w, trend: null })); s.weightWeeksPrevious = s.weightWeeksPrevious.map(w => ({ ...w, trend: null }));
  }
  dto.ranking = dto.ranking.filter(k => k !== key); return dto;
}
let mockTransform: (d: ProgressConnections) => ProgressConnections;
let mockFailure: boolean, mockPending: boolean;
let mockReleases: (() => void)[];
beforeEach(() => {
  jest.clearAllMocks(); mockTransform = d => d; mockFailure = false; mockPending = false; mockReleases = [];
  mockRead.mockImplementation(async options => {
    const url = new URL(options.path, 'https://www.ownlevel.fit');
    const range = { start: url.searchParams.get('from')!, end: url.searchParams.get('to')! };
    const previous = url.searchParams.has('compareFrom') ? { start: url.searchParams.get('compareFrom')!, end: url.searchParams.get('compareTo')! } : undefined;
    const connections = url.pathname.endsWith('/connections');
    if (connections && mockFailure) return lost;
    const result = () => {
      const raw = connections ? mockTransform(fixture(range, previous)) : overview(range, previous);
      const parsed = options.parse(raw); return parsed === undefined ? lost : ok(parsed);
    };
    return connections && mockPending ? new Promise(resolve => { mockReleases.push(() => resolve(result())); }) : result();
  });
});
const flush = () => act(async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); });
const tree = (child: React.ReactNode, state = MONTH) => <SafeAreaProvider initialMetrics={{
  frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 },
}}><OwnlevelThemeProvider initialMode="light"><ProgressRangeProvider initialToday={TODAY} initialState={state}>{child}</ProgressRangeProvider></OwnlevelThemeProvider></SafeAreaProvider>;
const open = async (state = MONTH) => { const view = render(tree(<ProgressOverviewScreen />, state)); await flush(); return view; };
const connectionCalls = () => mockRead.mock.calls.map(([o]) => o).filter(o => o.path.startsWith('/api/mobile/v1/progress/connections?'));
function direct(dto: ProgressConnections) {
  return render(tree(<ConnectionsSection resource={{ data: dto, refresh: async () => {},
    state: { status: 'ready', refreshing: false, trigger: 'initial', current: { data: dto, confirmedAt: 1 }, result: ok(dto) } }} />));
}

describe('connections client and independent resource', () => {
  it('uses the shared query builder, forwards cancellation, and rejects another A or B', async () => {
    expect(parseProgressConnections(fixture())).toBeDefined();
    const { query } = progressRequest(MONTH, TODAY), b = compareRange({ ...MONTH, compare: { kind: 'previous' } }, TODAY)!;
    const signal = new AbortController().signal;
    expect((await fetchProgressConnections(mockClient, query, b, signal)).status).toBe('ok');
    const request = connectionCalls()[0];
    expect(request.path).toBe('/api/mobile/v1/progress/connections?period=custom&from=2026-10-01&to=2026-10-17&compareFrom=2026-09-01&compareTo=2026-09-17');
    expect(request.signal).toBe(signal);
    expect(request.parse(fixture({ start: '2026-10-02', end: TODAY }))).toBeUndefined();
    expect(request.parse(fixture({ start: '2026-10-01', end: '2026-10-16' }))).toBeUndefined();
    expect(request.parse(fixture(undefined, { start: '2026-08-01', end: '2026-08-17' }))).toBeUndefined();
  });
  it.each([{ kind: 'none' }, { kind: 'last_year' }, { kind: 'custom', range: { start: '2026-08-01', end: '2026-08-17' } }] as ProgressRangeState['compare'][])(
    'always reads the previous equivalent period when the general comparison is $kind', async compare => {
      await open({ ...MONTH, compare });
      expect(connectionCalls()).toHaveLength(1);
      const p = new URL(connectionCalls()[0].path, 'https://ownlevel.invalid').searchParams;
      expect(p.get('compareFrom')).toBe('2026-09-01'); expect(p.get('compareTo')).toBe('2026-09-17');
    });
  it('refreshes connections with the overview and keeps the last confirmed stories while updating', async () => {
    const view = await open(); mockPending = true;
    fireEvent(view.UNSAFE_getByType(RefreshControl), 'refresh'); await flush();
    expect(connectionCalls()).toHaveLength(2);
    expect(view.getByTestId('connection-protein_strength')).toBeTruthy();
    expect(view.getByLabelText('Actualizando estas historias')).toBeTruthy();
    expect(view.UNSAFE_getByType(RefreshControl).props.refreshing).toBe(true);
    await act(async () => mockReleases[0]()); await flush();
    expect(view.queryByLabelText('Actualizando estas historias')).toBeNull();
  });
  it('hides the old scope as soon as the period changes and ignores a late response from it', async () => {
    mockPending = true;
    const view = await open();
    expect(view.getByTestId('connections-loading')).toBeTruthy();
    expect(view.queryByText('TODAVÍA NO ALCANZA')).toBeNull();
    fireEvent.press(view.getByTestId('progress-unit-week')); await flush();
    expect(connectionCalls()).toHaveLength(2);
    expect(connectionCalls()[1].path).toContain('from=2026-10-12&to=2026-10-17&compareFrom=2026-10-05&compareTo=2026-10-10');
    await act(async () => mockReleases[0]()); await flush();
    expect(view.getByTestId('connections-loading')).toBeTruthy();
    expect(view.queryByTestId('connection-protein_strength')).toBeNull();
    await act(async () => mockReleases[1]()); await flush();
    expect(view.getByTestId('connection-protein_strength')).toBeTruthy();
  });
  it('a failed connection read leaves the overview usable and retries only its own resource', async () => {
    mockFailure = true; const view = await open();
    expect(view.getByTestId('progress-area-body').props.accessibilityLabel).toContain('80 → 79,5 kg');
    const section = within(view.getByTestId('progress-connections'));
    expect(section.getByText('No pudimos cargar lo que se movió junto.')).toBeTruthy();
    expect(section.queryByText('TODAVÍA NO ALCANZA')).toBeNull();
    const before = mockRead.mock.calls.length; mockFailure = false;
    fireEvent.press(section.getByRole('button', { name: 'Reintentar' })); await flush();
    expect(mockRead.mock.calls.length).toBe(before + 1);
    expect(view.getByTestId('connection-protein_strength')).toBeTruthy();
  });
  it('shows unavailable stories separately and lets the remaining ready stories render', async () => {
    mockTransform = d => unavailable(d, 'kcal_weight');
    const view = await open();
    expect(view.getByText('No pudimos cargar calorías y peso. Reintentá más tarde.')).toBeTruthy();
    expect(view.queryByText('TODAVÍA NO ALCANZA')).toBeNull();
    expect(view.getByTestId('connection-protein_strength')).toBeTruthy();
  });
});

describe('connections editorial stories', () => {
  it('renders ranked ready facts, with one complete VoiceOver label and no navigation affordance', async () => {
    mockTransform = d => ({ ...d, ranking: ['kcal_weight', 'protein_strength', 'carbs_energy', 'carbs_strength'] });
    const view = await open();
    expect(view.getAllByTestId(/^connection-(protein_strength|carbs_strength|carbs_energy|kcal_weight)$/).map(n => n.props.testID)).toEqual([
      'connection-kcal_weight', 'connection-protein_strength', 'connection-carbs_energy', 'connection-carbs_strength',
    ]);
    const protein = view.getByTestId('connection-protein_strength');
    expect(protein.props.accessibilityLabel).toBe('Proteína y fuerza. 142 gramos de proteína por día, 18 gramos más. 4 de 6 ejercicios mejoraron.');
    expect(within(protein).getByText('142 g')).toBeTruthy(); expect(within(protein).getByText('4 de 6')).toBeTruthy();
    expect(within(protein).queryAllByRole('button')).toHaveLength(0);
    expect(view.getByText('Octubre frente a septiembre, a la misma altura del mes.')).toBeTruthy();
    expect(view.getByText('Pasaron al mismo tiempo: no quiere decir que una cosa cause la otra.')).toBeTruthy();
    expect(mockPush).not.toHaveBeenCalled();
  });
  it.each([
    ['protein_strength', 'food_days', 'previous', 3, 4, 'Hacen falta comidas en 4 días del período anterior. Tenés 3.'],
    ['protein_strength', 'comparable_exercises', 'current', 0, 1, 'Hace falta repetir un ejercicio en los dos períodos.'],
    ['carbs_energy', 'energy_sessions', 'previous', 1, 2, 'Hacen falta 2 entrenamientos con la energía cargada en cada período. El anterior tiene 1.'],
    ['kcal_weight', 'weigh_ins', 'current', 2, 3, 'Hacen falta 3 pesajes en cada período. Este tiene 2.'],
    ['kcal_weight', 'weigh_in_span', 'previous', 2, 4, 'Hacen falta pesajes separados por al menos 4 días. Los del período anterior abarcan 2 días.'],
  ] as [ConnectionStory['key'], ConnectionMissing['reason'], ConnectionMissing['period'], number, number, string][])(
    'puts %s with %s below ready stories and explains the actual missing side', async (key, reason, period, have, need, message) => {
      mockTransform = d => changeStory(d, key, { side: reason === 'food_days' ? 'food' : 'outcome', reason, period, have, need });
      const view = await open();
      expect(view.getByText('TODAVÍA NO ALCANZA')).toBeTruthy();
      expect(within(view.getByTestId(`connection-missing-${key}`)).getByText(message)).toBeTruthy();
      expect(view.queryByTestId(`connection-${key}`)).toBeNull();
      expect(view.queryByTestId('connections-view-month')).toBeNull();
    });
  it('four insufficient stories in Semana offer Ver el mes and change the shared period', async () => {
    mockTransform = d => {
      for (const key of CONNECTION_KEYS) changeStory(d, key, { side: 'food', reason: 'food_days', have: 1, need: 4, period: 'current' });
      return d;
    };
    const view = await open({ ...MONTH, unit: 'week' });
    expect(view.queryByTestId('connection-protein_strength')).toBeNull();
    expect(view.getAllByTestId(/^connection-missing-/)).toHaveLength(4);
    expect(view.getAllByText('Hacen falta comidas en 4 días de esta semana. Tenés 1.')).toHaveLength(4);
    fireEvent.press(view.getByRole('button', { name: 'Ver el mes' })); await flush();
    expect(view.getByText('Tu octubre')).toBeTruthy();
    expect(connectionCalls().at(-1)!.path).toContain('from=2026-10-01&to=2026-10-17&compareFrom=2026-09-01&compareTo=2026-09-17');
    expect(view.queryByTestId('connections-view-month')).toBeNull();
  });
  it('defensively renders null as Sin dato, and preserves an explicitly recorded zero', async () => {
    const dto = fixture(), protein = dto.stories[0], energy = dto.stories[2];
    protein.food.current = null;
    if (energy.outcome.kind === 'energy') energy.outcome.current = null;
    const view = direct(dto); await flush();
    expect(within(view.getByTestId('connection-protein_strength')).getByText('Sin dato')).toBeTruthy();
    expect(within(view.getByTestId('connection-carbs_energy')).getByText('Sin dato')).toBeTruthy();
    expect(view.queryByText('0 g')).toBeNull(); expect(view.queryByText('0 de 5')).toBeNull();
    protein.food.current = 0;
    view.rerender(tree(<ConnectionsSection resource={{ data: dto, refresh: async () => {},
      state: { status: 'ready', refreshing: false, trigger: 'initial', current: { data: dto, confirmedAt: 1 }, result: ok(dto) } }} />));
    await flush();
    expect(within(view.getByTestId('connection-protein_strength')).getByText('0 g')).toBeTruthy();
  });
});

describe('story titles and period copy', () => {
  it('uses more/less/same food with a strict 3% threshold and neutral outcome signs', () => {
    const dto = fixture(), protein = dto.stories[0], carbs = dto.stories[1], energy = dto.stories[2], weight = dto.stories[3];
    expect(connectionTitle(protein)).toBe('Más proteína y 4 ejercicios que mejoraron');
    protein.food.current = 120; if (protein.outcome.kind === 'strength') protein.outcome.improved = 0;
    expect(connectionTitle(protein)).toBe('Menos proteína y ningún ejercicio mejoró');
    protein.food.current = 125; expect(connectionTitle(protein)).toBe('Misma proteína y ningún ejercicio mejoró');
    expect(connectionTitle(carbs)).toBe('Más carbos y más peso en Sentadilla');
    if (carbs.outcome.kind === 'strength' && carbs.outcome.top) carbs.outcome.top.currentE1rm = 95;
    expect(connectionTitle(carbs)).toBe('Más carbos y menos peso en Sentadilla');
    if (carbs.outcome.kind === 'strength' && carbs.outcome.top) carbs.outcome.top.currentE1rm = 97.5;
    carbs.food.current = 234; expect(connectionTitle(carbs)).toBe('Mismos carbos y Sentadilla igual');
    expect(connectionTitle(energy)).toBe('Más carbos y más energía al terminar');
    if (energy.outcome.kind === 'energy') energy.outcome.current = 3;
    expect(connectionTitle(energy)).toBe('Más carbos y menos energía al terminar');
    expect(connectionTitle(weight)).toBe('Menos calorías y menos peso');
    weight.food.previous = 2000;
    expect(connectionTitle(weight)).toBe('Más calorías y menos peso');
    weight.food.current = 2059; expect(connectionTitle(weight)).toBe('Mismas calorías y menos peso');
    weight.food.current = 2060; expect(connectionTitle(weight)).toBe('Más calorías y menos peso');
  });
  it('describes a historical month, current week and custom dates using the independent previous period', () => {
    expect(connectionsPeriodText({ ...MONTH, anchor: '2026-09-15' }, TODAY)).toBe('Septiembre frente a agosto.');
    expect(connectionsPeriodText({ ...MONTH, unit: 'week' }, TODAY)).toBe('Esta semana frente a la anterior, a la misma altura de la semana.');
    expect(connectionsPeriodText({ ...MONTH, unit: 'custom', custom: { start: '2026-10-04', end: '2026-10-10' } }, TODAY)).toBe('4–10 oct frente a 27 sep – 3 oct.');
  });
});
