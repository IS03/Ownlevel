import { fireEvent, render, within } from '@testing-library/react-native';
import { describe, expect, it, jest } from '@jest/globals';
import { StyleSheet } from 'react-native';

import type { MobileHomeResponse } from '@/api/home';
import type { HistoryDay } from '@/api/history';
import type { NutritionReport } from '@/api/nutrition-report';
import type { QuickOption, QuickOptions } from '@/api/nutrition-quick';
import { OwnlevelThemeProvider, type ThemeMode } from '@/design-system';

import { HomeDashboard, type HomeDashboardProps } from './home-dashboard';
import type { HomeTrainingWeek } from './home-data';
import { calorieSplit, homeHabituals } from './home-nutrition';
import type { HomeResource } from './home-resource';
import { homeProgressBody, homeProgressTraining } from './home-test-fixtures';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('@/design-system', () => ({ ...jest.requireActual<object>('@/design-system'), useReduceMotion: () => true }));
// Real glass availability/preferences are covered separately, including accessibility fallback.
jest.mock('expo-glass-effect', () => ({ isGlassEffectAPIAvailable: () => false, isLiquidGlassAvailable: () => false }));
// The native "+" menu has its own test; here a stub exposes its entries as buttons.
jest.mock('./home-add-menu', () => {
  const { Pressable, Text, View } = jest.requireActual<typeof import('react-native')>('react-native');
  return { HomeAddMenu: ({ habituals, onAll, onFood, onHabitual, onManual }: import('./home-add-menu.types').HomeAddMenuProps) => (
    <View testID="home-add-menu">
      <Pressable accessibilityRole="button" onPress={onManual}><Text>Comida manual</Text></Pressable>
      <Pressable accessibilityRole="button" onPress={onFood}><Text>Buscar alimento</Text></Pressable>
      {habituals.map(option => <Pressable accessibilityRole="button" key={option.source.id} onPress={() => onHabitual(option)}><Text>{option.name}</Text></Pressable>)}
      <Pressable accessibilityRole="button" onPress={onAll}><Text>Ver todas</Text></Pressable>
    </View>
  ) };
});

const TODAY = '2026-10-10'; // Saturday
const WEEK = '2026-10-05';
const NOW = Date.parse('2026-10-10T21:23:00.000Z');

const ready = <T,>(data: T): HomeResource<T> => ({ confirmedAt: NOW - 2 * 3_600_000, data, status: 'ready' });
const loading = <T,>(): HomeResource<T> => ({ confirmedAt: null, data: undefined, status: 'loading' });
const unavailable = <T,>(data?: T): HomeResource<T> => ({ confirmedAt: data ? NOW - 2 * 3_600_000 : null, data, status: 'unavailable' });

function home(): MobileHomeResponse {
  return {
    date: TODAY,
    profile: { status: 'ok', data: { displayName: 'Nacho Ownlevel' } },
    nutrition: { status: 'ok', data: { calories: 1840, calorieTarget: 2600, proteinG: 128, proteinTargetG: 160, mealCount: 3, waterL: 2, waterTargetL: 3, energyBalanceKcal: -300 } },
    training: {
      activeSession: { status: 'ok', data: null },
      workoutStartRoutines: { status: 'ok', data: [{ id: 'r1', name: 'Push', color: 'violet', exerciseCount: 6, setCount: 18 }] },
      week: {
        status: 'ok',
        data: {
          summary: { weekStart: WEEK, weekEnd: '2026-10-11', sessions: 3, sets: 54, minutes: 157, routines: { Push: 1 }, muscleGroups: { Pecho: 8 }, trainingDays: ['2026-10-05', '2026-10-06', '2026-10-08'] },
          todaySessions: [],
        },
      },
    },
  };
}

const metric = (id: string, label: string, systemKey: 'sleep' | 'water' | null, value: number | null, isActive = true) => ({
  id, systemKey, label, unit: null, valueType: 'decimal' as const, target: null, value, isActive, updatedAt: null,
});

function todayDay(): HistoryDay {
  return {
    date: TODAY, today: TODAY, discovery: null,
    training: { status: 'ok', data: { sessions: [] } },
    activeSession: { status: 'ok', data: null },
    nutrition: { status: 'ok', data: { dayState: 'recorded', summary: {
      calories: { knownTotal: 1840, missingCount: 0 }, proteinG: { knownTotal: 128, missingCount: 0 },
      carbsG: { knownTotal: 210, missingCount: 0 }, fatG: { knownTotal: 52, missingCount: 0 }, entryCount: 3, mealCount: 3,
    }, context: {} as never } },
    body: { date: TODAY, today: TODAY, weight: { status: 'ok', data: null }, measurement: { status: 'ok', data: null } },
    metrics: { status: 'ok', data: { metrics: [metric('m-archived', 'Mate', null, 1, false), metric('m-sleep', 'Sueño', 'sleep', 7.5), metric('m-energy', 'Energía', null, null), metric('m-water', 'Agua', 'water', 2)] } },
  } as HistoryDay;
}

const option = (kind: 'saved' | 'suggestion', id: string, name: string): QuickOption => ({
  source: { kind, id, version: 'a'.repeat(64) }, name, description: null, templateType: null, items: [],
  calories: 300, proteinG: 20, carbsG: 30, fatG: 10, useCount: null, lastUsedDate: null,
});
const breakfast = option('suggestion', '00000000-0000-4000-8000-000000000001', 'Desayuno de siempre');
const quickOptions: QuickOptions = {
  today: TODAY,
  saved: { status: 'ok', items: [option('saved', '00000000-0000-4000-8000-000000000003', 'Avena guardada')] },
  suggested: { status: 'ok', items: [breakfast, option('suggestion', '00000000-0000-4000-8000-000000000002', 'Batido')] },
};

const calorieRow = (date: string, value: number | null, isToday = false) => ({
  date, exists: true, hasNutrition: value !== null, imported: false, isToday, mealCount: value === null ? 0 : 3,
  nutrients: { calories: { value, knownMeals: 3, missingMeals: 0, status: value === null ? 'none' : 'complete' } },
  targetCalories: 2600, targetProteinG: null, expenditureKcal: null, targetDeviationKcal: null, energyBalanceKcal: null, goalStage: null,
});
const report = {
  today: TODAY, range: { start: WEEK, end: TODAY },
  summary: { metrics: { calories: { value: 2410, denominator: 4, partialDays: 0 },
    protein: { value: 140, denominator: 3, partialDays: 1 }, carbs: { value: 0, denominator: 2, partialDays: 0 }, fat: { value: null, denominator: 0, partialDays: 0 } } },
  days: [calorieRow('2026-10-05', 2500), calorieRow('2026-10-06', 2300), calorieRow('2026-10-07', null), calorieRow('2026-10-08', 2400),
    calorieRow('2026-10-09', 2440), calorieRow(TODAY, 1840, true)],
} as unknown as NutritionReport;

const sessionAt = (id: string, logDate: string, completedSets: number, minutes: number | null) => ({
  id, routineId: null, routineName: 'Push', routineColor: null, logDate, startedAt: `${logDate}T12:00:00.000Z`, endedAt: `${logDate}T13:00:00.000Z`,
  durationMilliseconds: minutes === null ? null : minutes * 60_000, exercisesCompleted: 4, completedSets, volumeKg: null,
});
const weekSessions = [
  sessionAt('s1', '2026-10-05', 18, 52), sessionAt('s2', '2026-10-06', 12, 30), sessionAt('s3', '2026-10-06', 8, 28), sessionAt('s4', '2026-10-08', 16, 47),
];
const trainingWeek: HomeTrainingWeek = { weekStart: WEEK, everTrained: true, sessions: weekSessions, recent: weekSessions, historyComplete: false };

function renderHome(overrides: Partial<HomeDashboardProps> = {}, theme: ThemeMode = 'light') {
  const handlers = {
    onConfigureNutrition: jest.fn(), onMealEntry: jest.fn(), onNavigate: jest.fn(), onOpenCalories: jest.fn(), onOpenCompletedSession: jest.fn(),
    onOpenDay: jest.fn(), onOpenProgress: jest.fn(), onOpenSession: jest.fn(), onQuickMeal: jest.fn(), onRefresh: jest.fn(), onRegister: jest.fn(), onStartWorkout: jest.fn(),
  };
  const props: HomeDashboardProps = {
    ...handlers,
    avatarUrl: null,
    calories: ready(report),
    day: { today: TODAY, weekStart: WEEK },
    home: ready(home()),
    progressBody: ready(homeProgressBody()), progressRecords: ready(homeProgressTraining('30')),
    now: () => NOW,
    quick: ready(quickOptions),
    today: ready(todayDay()),
    training: ready(trainingWeek),
    ...overrides,
  };
  const view = render(<OwnlevelThemeProvider initialMode={theme}><HomeDashboard {...props} /></OwnlevelThemeProvider>);
  return { ...view, ...handlers };
}

describe('Home header', () => {
  it('date above the large title "Hoy"; the avatar opens Profile/Settings; no isotype', () => {
    const view = renderHome();
    expect(view.getByText('Sábado 10 de octubre')).toBeTruthy();
    expect(view.getByRole('header', { name: 'Hoy' })).toBeTruthy();
    expect(view.queryByTestId('home-isotype')).toBeNull();
    fireEvent.press(view.getByRole('button', { name: 'Abrir perfil y ajustes' }));
    expect(view.onNavigate).toHaveBeenCalledWith('settings');
  });

  it('uses the Google photo when there is one, the initial when it fails', () => {
    const view = renderHome({ avatarUrl: 'https://lh3.googleusercontent.com/a/photo' });
    const photo = view.getByTestId('home-avatar-photo', { includeHiddenElements: true });
    expect(photo.props.source).toEqual({ uri: 'https://lh3.googleusercontent.com/a/photo' });
    expect(StyleSheet.flatten(photo.props.style)).toMatchObject({ height: 44, width: 44 });
    fireEvent(photo, 'error');
    const avatar = view.getByTestId('home-avatar', { includeHiddenElements: true });
    expect(within(avatar).getByText('N', { includeHiddenElements: true })).toBeTruthy();
  });
});

describe('Today\'s training: states by priority, no gradients', () => {
  it('active session first: routine row with minutes and exercises and a solid "Volver a la sesión"', () => {
    const data = home();
    data.training.activeSession = { status: 'ok', data: { id: 'act', name: 'Push', logDate: TODAY, startedAt: '2026-10-10T21:00:00.000Z',
      exercisesCompleted: 3, totalExercises: 6, completedSets: 9, totalSets: 18, progressPercent: 50 } };
    if (data.training.week.status === 'ok') data.training.week.data.todaySessions = [{ id: 'done', name: 'Pull', startedAt: '2026-10-10T11:00:00.000Z',
      endedAt: '2026-10-10T12:00:00.000Z', durationMilliseconds: 3_600_000, exercisesCompleted: 4, completedSets: 12, status: 'completed' }];
    const view = renderHome({ home: ready(data) });
    expect(view.getByText('Sesión en curso')).toBeTruthy();
    expect(view.getByText('23 min · 3 de 6 ejercicios')).toBeTruthy();
    expect(view.queryByText('Entrenaste hoy')).toBeNull();
    expect(view.queryByTestId('home-hero-active')).toBeNull();
    fireEvent.press(view.getByRole('button', { name: 'Push. 23 min · 3 de 6 ejercicios' }));
    fireEvent.press(view.getByRole('button', { name: 'Volver a la sesión' }));
    expect(view.onOpenSession.mock.calls).toEqual([['act'], ['act']]);
  });

  it('trained today: one row per session (oldest first) to its detail, and "+ Nueva sesión" opens the start sheet', () => {
    const data = home();
    if (data.training.week.status === 'ok') data.training.week.data.todaySessions = [
      { id: 'late', name: 'Push', startedAt: '2026-10-10T18:00:00.000Z', endedAt: '2026-10-10T18:55:00.000Z', durationMilliseconds: 55 * 60_000, exercisesCompleted: 6, completedSets: 18, status: 'completed' },
      { id: 'early', name: 'Movilidad', startedAt: '2026-10-10T10:00:00.000Z', endedAt: '2026-10-10T10:20:00.000Z', durationMilliseconds: 20 * 60_000, exercisesCompleted: 3, completedSets: 6, status: 'completed' },
    ];
    const view = renderHome({ home: ready(data) });
    expect(view.getByRole('header', { name: 'Entrenaste hoy' })).toBeTruthy();
    const rows = within(view.getByTestId('home-trained-today')).getAllByRole('button').map(button => button.props.accessibilityLabel);
    expect(rows).toEqual(['Movilidad. 20 min · 6 series', 'Push. 55 min · 18 series', '+ Nueva sesión']);
    fireEvent.press(view.getByRole('button', { name: 'Push. 55 min · 18 series' }));
    fireEvent.press(view.getByRole('button', { name: 'Movilidad. 20 min · 6 series' }));
    expect(view.onOpenCompletedSession.mock.calls).toEqual([['late'], ['early']]);
    fireEvent.press(view.getByRole('button', { name: '+ Nueva sesión' }));
    expect(view.onStartWorkout).toHaveBeenCalledTimes(1);
    expect(view.queryByRole('button', { name: 'Arrancar rutina' })).toBeNull();
  });

  it('not trained yet: only a solid "Arrancar rutina" that opens the start sheet (with or without routines)', () => {
    const view = renderHome();
    expect(view.queryByText(/Hoy te toca|Día libre/i)).toBeNull();
    const button = view.getByRole('button', { name: 'Arrancar rutina' });
    expect(StyleSheet.flatten(button.props.style)).toMatchObject({ backgroundColor: '#7D6A3C', minHeight: 50, borderRadius: 999 });
    fireEvent.press(button);
    expect(view.onStartWorkout).toHaveBeenCalledTimes(1);
    expect(view.onNavigate).not.toHaveBeenCalled();
    view.unmount();
    const data = home();
    data.training.workoutStartRoutines = { status: 'ok', data: [] };
    expect(renderHome({ home: ready(data) }).getByRole('button', { name: 'Arrancar rutina' })).toBeTruthy();
  });

  it('an unverifiable active-session state never offers a start', () => {
    const data = home();
    data.training.activeSession = { status: 'unavailable' };
    const view = renderHome({ home: ready(data) });
    expect(view.getByText('Estado no disponible')).toBeTruthy();
    expect(view.queryByRole('button', { name: 'Arrancar rutina' })).toBeNull();
    expect(view.queryByRole('button', { name: '+ Nueva sesión' })).toBeNull();
    fireEvent.press(view.getByRole('button', { name: 'Reintentar' }));
    expect(view.onRefresh).toHaveBeenCalledTimes(1);
  });
});

describe('Nutrition', () => {
  it('title and "+ Comida"; consumed / target with what is left; calorie and protein bars', () => {
    const view = renderHome();
    expect(view.getByRole('header', { name: 'Nutrición' })).toBeTruthy();
    expect(view.getByTestId('home-add-menu')).toBeTruthy();
    expect(view.getByLabelText('Calorías consumidas: 1.840 de 2.600 kcal, 760 restantes')).toBeTruthy();
    expect(view.queryByTestId('home-calories-left')).toBeNull();
    expect(view.getByText('128 / 160 g')).toBeTruthy();
    expect(StyleSheet.flatten(view.getByTestId('home-calorie-bar').props.style)).toMatchObject({ height: 8, backgroundColor: '#EAE7DF' });
    expect(StyleSheet.flatten(view.getByTestId('home-calorie-bar-fill').props.style)).toMatchObject({ backgroundColor: '#7D6A3C' });
    expect(StyleSheet.flatten(view.getByTestId('home-protein-bar').props.style)).toMatchObject({ height: 5 });
    expect(view.queryByTestId('home-calorie-ring')).toBeNull();
  });

  it('calorie split uses 4/4/9 kcal per gram, with grams and the share of each macro', () => {
    // 128 g protein = 512, 210 g carbs = 840, 52 g fat = 468 → 1.820 kcal.
    const view = renderHome();
    const split = within(view.getByTestId('home-calorie-split'));
    expect(split.getByText('128 g · 28 %')).toBeTruthy();
    expect(split.getByText('210 g · 46 %')).toBeTruthy();
    expect(split.getByText('52 g · 26 %')).toBeTruthy();
    expect(calorieSplit(10, 10, 0)).toEqual({ carbs: 0.5, fat: 0, protein: 0.5 });
    expect(calorieSplit(0, 0, 0)).toBeNull();
    expect(calorieSplit(10, null, 5)).toBeNull();
  });

  it('over the target says so (same color, full bar)', () => {
    const data = home();
    if (data.nutrition.status === 'ok') data.nutrition.data.calories = 2720;
    expect(renderHome({ home: ready(data) }).getByLabelText('Calorías consumidas: 2.720 de 2.600 kcal, 120 de más')).toBeTruthy();
  });

  it('nothing logged today: an empty bar with the whole target left, 0 / target and 0 g macros without a share', () => {
    const data = home();
    if (data.nutrition.status === 'ok') Object.assign(data.nutrition.data, { calories: 0, proteinG: 0, mealCount: 0 });
    const day = todayDay();
    day.nutrition = { status: 'ok', data: { dayState: 'missing', summary: null, context: null } } as HistoryDay['nutrition'];
    const view = renderHome({ home: ready(data), today: ready(day) });
    expect(view.getByLabelText('Calorías consumidas: 0 de 2.600 kcal, 2.600 restantes')).toBeTruthy();
    expect(view.queryByTestId('home-calorie-bar-fill')).toBeNull();
    expect(within(view.getByTestId('home-calorie-split')).getAllByText('0 g')).toHaveLength(3);
  });

  it('without a calorie target: only what was eaten and a link to configure it', () => {
    const data = home();
    if (data.nutrition.status === 'ok') data.nutrition.data.calorieTarget = null;
    const view = renderHome({ home: ready(data) });
    expect(view.getByLabelText('Calorías consumidas: 1.840 kcal')).toBeTruthy();
    expect(view.queryByTestId('home-calorie-bar')).toBeNull();
    fireEvent.press(view.getByRole('button', { name: /Configurá tu objetivo/ }));
    expect(view.onConfigureNutrition).toHaveBeenCalledTimes(1);
  });

  it('habituals: the 2 suggested (server frequency order) first, saved only to fill', () => {
    expect(homeHabituals(quickOptions).map(o => o.name)).toEqual(['Desayuno de siempre', 'Batido']);
    expect(homeHabituals({ ...quickOptions, suggested: { status: 'ok', items: [breakfast] } }).map(o => o.name)).toEqual(['Desayuno de siempre', 'Avena guardada']);
    expect(homeHabituals({ ...quickOptions, suggested: { status: 'unavailable' } }).map(o => o.name)).toEqual(['Avena guardada']);
  });

  it('the "+" menu opens the existing flows: manual, food search, a habitual (A2) and the full list', () => {
    const view = renderHome();
    const menu = within(view.getByTestId('home-add-menu'));
    fireEvent.press(menu.getByText('Comida manual'));
    fireEvent.press(menu.getByText('Buscar alimento'));
    fireEvent.press(menu.getByText('Batido'));
    fireEvent.press(menu.getByText('Ver todas'));
    expect(view.onMealEntry.mock.calls).toEqual([['manual'], ['food'], ['quick']]);
    expect(view.onQuickMeal.mock.calls[0][0]).toMatchObject({ name: 'Batido', source: { kind: 'suggestion' } });
  });

  it('carbs and fat show "—" when their read fails; the training block does not wait for nutrition', () => {
    const view = renderHome({ today: unavailable() });
    expect(within(view.getByTestId('home-calorie-split')).getAllByText('—')).toHaveLength(2);
    expect(view.getByRole('button', { name: 'Arrancar rutina' })).toBeTruthy();
  });

  it('touching either goal changes both together, without changing consumed bars or macros', () => {
    const view = renderHome();
    fireEvent.press(view.getByTestId('home-calories'));
    expect(view.getByLabelText('Calorías restantes: 760 kcal, objetivo 2.600')).toBeTruthy();
    expect(view.getByLabelText('Proteína restante: 32 de 160 g')).toBeTruthy();
    const bar = StyleSheet.flatten(view.getByTestId('home-calorie-bar-fill').props.style);
    expect(bar.width).toBe(`${1840 / 2600 * 100}%`);
    expect(within(view.getByTestId('home-calorie-split')).getByText('128 g · 28 %')).toBeTruthy();
    fireEvent.press(view.getByTestId('home-protein'));
    expect(StyleSheet.flatten(view.getByTestId('home-calorie-bar-fill').props.style)).toEqual(bar);
    expect(view.getByText('Calorías consumidas')).toBeTruthy();
    expect(view.getByLabelText('Proteína: 128 de 160 g')).toBeTruthy();
  });

  it('remaining mode distinguishes exceeding a goal from zero remaining, without judgment colors', () => {
    const data = home();
    if (data.nutrition.status === 'ok') Object.assign(data.nutrition.data, { calories: 2720, proteinG: 174 });
    const view = renderHome({ home: ready(data) });
    fireEvent.press(view.getByTestId('home-protein'));
    expect(view.getByLabelText('Calorías por encima del objetivo: 120 kcal, objetivo 2.600')).toBeTruthy();
    expect(view.getByLabelText('Proteína por encima: 14 de 160 g')).toBeTruthy();
    expect(StyleSheet.flatten(view.getByTestId('home-calorie-bar-fill').props.style).backgroundColor).toBe('#7D6A3C');
  });

  it('a missing goal never manufactures remaining values; no goals disables toggling', () => {
    const data = home();
    if (data.nutrition.status === 'ok') data.nutrition.data.calorieTarget = null;
    const view = renderHome({ home: ready(data) });
    fireEvent.press(view.getByTestId('home-protein'));
    expect(view.getByLabelText('Calorías consumidas: 1.840 kcal')).toBeTruthy();
    expect(view.getByLabelText('Proteína restante: 32 de 160 g')).toBeTruthy();
    view.unmount();
    if (data.nutrition.status === 'ok') data.nutrition.data.proteinTargetG = null;
    const noGoals = renderHome({ home: ready(data) });
    expect(noGoals.getByTestId('home-calories')).toBeDisabled();
    expect(noGoals.getByTestId('home-protein')).toBeDisabled();
    expect(noGoals.getByLabelText('Proteína: 128 g')).toBeTruthy();
  });
});

describe('Esta semana', () => {
  it('big number of trainings, sets and time, then the linear calendar; "Progreso →" opens Progreso', () => {
    const view = renderHome();
    expect(view.getByLabelText('3 entrenos esta semana, 54 series · 2 h 37 min')).toBeTruthy();
    expect(view.getByText('54 series · 2 h 37 min')).toBeTruthy();
    expect(view.queryByText(/Pecho|Músculos|Rutinas/)).toBeNull();
    fireEvent.press(view.getByRole('button', { name: 'Progreso' }));
    expect(view.onNavigate).toHaveBeenCalledWith('progress');
  });

  it('calories per day: the reports average, "k de 7 días con datos", and the row opens this week\'s report', () => {
    const view = renderHome();
    expect(view.queryByTestId('home-week-calories')).toBeNull();
    fireEvent.press(view.getByTestId('home-week-page-1'));
    const calories = within(view.getByTestId('home-week-calories'));
    expect(calories.getByText('2.410')).toBeTruthy();
    expect(calories.getByText('4 de 7 días')).toBeTruthy();
    fireEvent.press(view.getByTestId('home-week-calories'));
    expect(view.onOpenCalories).toHaveBeenCalledTimes(1);
  });

  it('7 equal capsules: accent when trained (2 sessions = 1 capsule), track otherwise; today\'s letter in accent', () => {
    const view = renderHome();
    expect(view.getByLabelText('Lunes, entrenaste')).toBeTruthy();
    expect(view.getByLabelText('Martes, entrenaste')).toBeTruthy();
    expect(view.getByLabelText('Miércoles, sin entreno')).toBeTruthy();
    expect(view.getByLabelText('Sábado, hoy, sin entreno')).toBeTruthy();
    expect(view.getByLabelText('Domingo, sin entreno')).toBeTruthy();
    for (const date of ['2026-10-05', '2026-10-06', '2026-10-08']) expect(view.getByTestId(`home-week-marker-${date}-fill`)).toBeTruthy();
    for (const date of ['2026-10-07', '2026-10-09', TODAY, '2026-10-11']) {
      expect(view.queryByTestId(`home-week-marker-${date}-fill`)).toBeNull();
      expect(StyleSheet.flatten(view.getByTestId(`home-week-marker-${date}`).props.style)).toMatchObject({ backgroundColor: '#EAE7DF', height: 8, borderRadius: 999 });
    }
    const today = view.getByTestId('home-week-today');
    expect(today.props.children).toBe('S');
    expect(StyleSheet.flatten(today.props.style)).toMatchObject({ color: '#7D6A3C', fontWeight: '600', fontSize: 13 });
    fireEvent.press(view.getByTestId('home-week-day-2026-10-06'));
    expect(view.onOpenDay).toHaveBeenCalledWith('2026-10-06');
    fireEvent.press(view.getByTestId('home-week-day-2026-10-11'));
    expect(view.onOpenDay).toHaveBeenCalledTimes(1);
  });

  it('a week without sessions: 7 track capsules and "0 entrenos"', () => {
    const data = home();
    if (data.training.week.status === 'ok') data.training.week.data.summary = { ...data.training.week.data.summary, sessions: 0, sets: 0, minutes: 0, trainingDays: [] };
    const view = renderHome({ home: ready(data), training: ready({ ...trainingWeek, sessions: [] }) });
    expect(view.getByLabelText('0 entrenos esta semana, 0 series · 0 min')).toBeTruthy();
    expect(view.queryAllByTestId(/home-week-marker-.*-fill/)).toHaveLength(0);
  });

  it('each part keeps its own unavailable state', () => {
    const view = renderHome({ calories: unavailable(), training: unavailable() });
    expect(view.getByText('No pudimos cargar el detalle por día.')).toBeTruthy();
    expect(view.getByLabelText('3 entrenos esta semana, 54 series · 2 h 37 min')).toBeTruthy();
    fireEvent.press(view.getByTestId('home-week-page-1'));
    expect(view.getByText('No pudimos cargar Nutrición de esta semana.')).toBeTruthy();
    expect(view.queryByTestId('home-week-page-2')).toBeNull();
  });

  it('a user who never trained sees a greyed EJEMPLO week', () => {
    const view = renderHome({ training: ready({ weekStart: WEEK, everTrained: false, sessions: [], recent: [], historyComplete: true }) });
    expect(view.getByText('EJEMPLO')).toBeTruthy();
    expect(view.getByText('Con tu primer entrenamiento, esto pasa a ser tuyo.')).toBeTruthy();
    expect(view.queryByTestId('home-week-calories')).toBeNull();
  });

  it('weekly macros retain the server averages and each metric\'s coverage: missing is not zero', () => {
    const view = renderHome();
    fireEvent.press(view.getByTestId('home-week-page-1'));
    expect(view.getByTestId('home-week-calories').props.accessibilityHint).toContain('días terminados');
    expect(view.getByLabelText('Proteína: 140 g. Promedio de 3 de 7 días con datos, 1 día parcial')).toBeTruthy();
    expect(view.getByLabelText('Carbos: 0 g. Promedio de 2 de 7 días con datos')).toBeTruthy();
    expect(view.getByLabelText('Grasas: —. Promedio de 0 de 7 días con datos')).toBeTruthy();
    expect(view.queryByTestId('home-week-summary')).toBeNull();
  });

  it('cached nutrition is marked; a report from another week is not rendered as this week', () => {
    const view = renderHome({ calories: unavailable(report) });
    fireEvent.press(view.getByTestId('home-week-page-1'));
    expect(view.getByText('Sin actualizar · Última lectura disponible')).toBeTruthy();
    view.unmount();
    const stale = renderHome({ calories: ready({ ...report, range: { ...report.range, start: '2026-09-28' } }) });
    fireEvent.press(stale.getByTestId('home-week-page-1'));
    expect(stale.getByText('No pudimos cargar Nutrición de esta semana.')).toBeTruthy();
    expect(stale.queryByTestId('home-week-calories')).toBeNull();
  });
});

describe('Métricas', () => {
  it('all active metrics, preserving order and today\'s state; Más lives inside the scroll', () => {
    const view = renderHome();
    const register = view.getByTestId('home-register');
    expect(within(register).getByRole('header', { name: 'Métricas' })).toBeTruthy();
    expect(within(register).getAllByRole('button').map(button => button.props.accessibilityLabel))
      .toEqual(['Sueño, 7,5', 'Energía, Cargar', 'Agua, 2', 'Más, Métricas']);
    expect(within(view.getByTestId('home-register-scroll')).getByRole('button', { name: 'Más, Métricas' })).toBeTruthy();
    expect(within(register).queryByText('Peso')).toBeNull();
    expect(within(register).getByRole('button', { name: 'Sueño, 7,5' }).props.accessibilityState).toEqual({ checked: true });
    expect(within(register).getByRole('button', { name: 'Energía, Cargar' }).props.accessibilityState).toEqual({ checked: false });
    fireEvent.press(within(register).getByRole('button', { name: 'Sueño, 7,5' }));
    fireEvent.press(within(register).getByRole('button', { name: 'Más, Métricas' }));
    expect(view.onRegister.mock.calls).toEqual([[{ kind: 'metric', metricId: 'm-sleep' }], [{ kind: 'more' }]]);
  });

  it('an unavailable, stale or previous-day read never claims "Cargar" nor a check', () => {
    const oldDay = todayDay(); oldDay.date = '2026-10-09';
    for (const today of [unavailable(todayDay()), ready(oldDay)]) {
      const view = renderHome({ today });
      const register = within(view.getByTestId('home-register'));
      for (const button of register.getAllByRole('button')) expect(button.props.accessibilityState).toEqual({ checked: false });
      expect(register.queryByRole('button', { name: /Cargar/ })).toBeNull();
      view.unmount();
    }
  });
});

describe('Screen states', () => {
  it('loading: blocks that need Home show their own skeleton; independent reads still render', () => {
    const view = renderHome({ home: loading() });
    expect(view.getByTestId('home-nutrition-loading')).toBeTruthy();
    expect(view.getByText('Sábado 10 de octubre')).toBeTruthy();
    expect(view.getByTestId('home-register')).toBeTruthy();
  });

  it('offline with a cached read: notice with its age and retry', () => {
    const view = renderHome({ home: unavailable(home()) });
    expect(view.getByText('Uy, no pudimos actualizar')).toBeTruthy();
    expect(view.getByText('Te mostramos lo último que cargó, de hace 2 h. Tus datos están guardados.')).toBeTruthy();
    fireEvent.press(within(view.getByTestId('home-offline')).getByRole('button', { name: 'Reintentar' }));
    expect(view.onRefresh).toHaveBeenCalledTimes(1);
  });

  it('progress closes Home and links to the existing overview', () => {
    const view = renderHome();
    expect(view.getByTestId('home-progress')).toBeTruthy();
    fireEvent.press(view.getByRole('button', { name: 'Ver todo' }));
    expect(view.onNavigate).toHaveBeenCalledWith('progress');
  });

  it('sections sit on the background, without the old faded Nutrition band', () => {
    const view = renderHome();
    for (const id of ['home-week', 'home-register', 'home-progress']) {
      const style = StyleSheet.flatten(view.getByTestId(id).props.style);
      expect(style.backgroundColor).toBeUndefined();
      expect(style.borderWidth ?? 0).toBe(0);
      expect(style).toMatchObject({ paddingLeft: 16, paddingRight: 16 });
    }
    const band = StyleSheet.flatten(view.getByTestId('home-nutrition').props.style);
    expect(band).toMatchObject({ paddingLeft: 16, paddingRight: 16, paddingBottom: 0 });
    expect(band.backgroundColor).toBeUndefined();
    expect(band.borderRadius ?? 0).toBe(0);
    expect(band.borderWidth ?? 0).toBe(0);
    for (const id of ['home-band-fade-top', 'home-band-solid', 'home-band-fade-bottom']) expect(view.queryByTestId(id)).toBeNull();
    expect(StyleSheet.flatten(view.getByTestId('home-calorie-split').props.style)).toMatchObject({ borderTopColor: '#E0DCD0', paddingTop: 16 });
    expect(StyleSheet.flatten(view.getByText('Calorías consumidas').props.style)).toMatchObject({ color: '#6A6A72' });
  });

  it('dark: no band; brand tracks and secondary grey', () => {
    const view = renderHome({}, 'dark');
    expect(view.queryByTestId('home-band-solid')).toBeNull();
    expect(StyleSheet.flatten(view.getByTestId('home-calorie-bar').props.style)).toMatchObject({ backgroundColor: '#27272A' });
    expect(StyleSheet.flatten(view.getByText('Calorías consumidas').props.style)).toMatchObject({ color: '#9F9FA9' });
  });

  it.each(['light', 'dark'] as const)('%s: exact nutrition ratios and trained days are painted immediately, in either nutrition mode', theme => {
    const view = renderHome({}, theme);
    const textColor = theme === 'dark' ? '#F4F4F5' : '#18181B';
    const accent = theme === 'dark' ? '#C9B68A' : '#7D6A3C';
    expect(StyleSheet.flatten(view.getByText('1.840').props.style).color).toBe(textColor);
    expect(StyleSheet.flatten(view.getByText('128 / 160 g').props.style).color).toBe(textColor);
    expect(StyleSheet.flatten(view.getByTestId('home-calorie-bar-fill').props.style).width).toBe(`${1840 / 2600 * 100}%`);
    expect(StyleSheet.flatten(view.getByTestId('home-protein-bar-fill').props.style).width).toBe('80%');
    for (const date of ['2026-10-05', '2026-10-06', '2026-10-08']) {
      expect(StyleSheet.flatten(view.getByTestId(`home-week-marker-${date}-fill`).props.style)).toMatchObject({ backgroundColor: accent, width: '100%' });
    }
    expect(view.queryByTestId('home-week-marker-2026-10-07-fill')).toBeNull();
    fireEvent.press(view.getByTestId('home-calories'));
    expect(StyleSheet.flatten(view.getByText('760').props.style).color).toBe(textColor);
    expect(StyleSheet.flatten(view.getByText('32 / 160 g').props.style).color).toBe(textColor);
    expect(StyleSheet.flatten(view.getByTestId('home-calorie-bar-fill').props.style).width).toBe(`${1840 / 2600 * 100}%`);
  });

  it('0 kcal: no faded layers; empty bars still render', () => {
    const data = home();
    if (data.nutrition.status === 'ok') Object.assign(data.nutrition.data, { calories: 0, proteinG: 0 });
    const view = renderHome({ home: ready(data) });
    expect(view.queryByTestId('home-band-solid')).toBeNull();
    expect(view.getByTestId('home-calorie-bar')).toBeTruthy();
    expect(view.queryByTestId('home-calorie-bar-fill')).toBeNull();
  });

  it.each(['dark', 'light', 'system'] as const)('renders in %s mode', theme => {
    expect(renderHome({}, theme).getByTestId('real-home-dashboard')).toBeTruthy();
  });
});
// Data/empty/error-state assertions use the Android/web control. UIKit is tested separately.
jest.mock('./home-page-control', () => jest.requireActual('./home-page-control.tsx'));
