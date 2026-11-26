import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { OwnlevelThemeProvider } from '@/design-system';
import { DEFAULT_MEAL_MOMENT_BANDS } from '@/api/nutrition-moment-bands';
import type { MobileNutritionDayResponse, NutritionDayMeal } from '@/api/nutrition-day';
import { nutritionFixture } from '@/nutrition/day-fixture.test-helper';
import { NoticesSettingsScreen } from '@/settings/notices-screen';
import { defaultMealReminder, mealMomentOf, mealRemindersCategory, registeredMoments } from './meal-reminders';
import { defaultNoticePreferences, noticePreferences, resetNoticePreferencesForTests } from './notice-preferences';
import { planReminders, reminderCategories } from './reminder-engine';

const mockRest = jest.fn(async (_request?: boolean) => 'enabled' as const);
jest.mock('@/auth', () => ({ useMobileAuth: () => ({ session: { user: { id: 'owner' } } }) }));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('@/training/session-rest-alert', () => ({ restAlertStatus: (request?: boolean) => mockRest(request) }));
jest.mock('@/training/session-rest-alert-option', () => ({ RestAlertOption: () => null }));
jest.mock('@react-native-async-storage/async-storage', () => jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'));
afterEach(() => { resetNoticePreferencesForTests(); mockRest.mockClear(); });

const TODAY = '2026-11-25', NOW = Date.parse('2026-11-25T11:00:00Z'), bands = DEFAULT_MEAL_MOMENT_BANDS;
const base = (): NutritionDayMeal => {
  const data = nutritionFixture(TODAY).nutrition;
  if (data.status !== 'ok' || data.data.dayState !== 'recorded') throw new Error('fixture');
  return data.data.meals[0];
};
const meal = (patch: Partial<NutritionDayMeal>): NutritionDayMeal => ({ ...base(), ...patch });
const day = (meals: NutritionDayMeal[]): MobileNutritionDayResponse => {
  const value = nutritionFixture(TODAY);
  if (value.nutrition.status === 'ok' && value.nutrition.data.dayState === 'recorded') value.nutrition.data.meals = meals;
  return value;
};

describe('«Comida por horario» (#639)', () => {
  it('a meal belongs to its declared moment, the server\'s automatic one, or the band of its known time', () => {
    expect(mealMomentOf(meal({ mealLabel: 'dinner', consumedAt: `${TODAY}T15:00:00Z` }), bands)).toBe('dinner');
    expect(mealMomentOf(meal({ mealLabel: null, automaticMealLabel: 'lunch' }), bands)).toBe('lunch');
    // 09:30 in Córdoba is breakfast with the default bands (05:00 to 11:00).
    expect(mealMomentOf(meal({ mealLabel: null, timeKnown: true, consumedAt: `${TODAY}T12:30:00Z` }), bands)).toBe('breakfast');
    // No moment and no known time, an «extra», or late night: no moment by guess.
    expect(mealMomentOf(meal({ mealLabel: null, timeKnown: false, consumedAt: `${TODAY}T12:30:00Z` }), bands)).toBeNull();
    expect(mealMomentOf(meal({ mealLabel: 'extra' }), bands)).toBeNull();
    expect(mealMomentOf(meal({ mealLabel: null, timeKnown: true, consumedAt: `${TODAY}T05:30:00Z` }), bands)).toBeNull();
  });
  it('the moments that already have a meal; a reading that could not tell says nothing', () => {
    expect(registeredMoments(day([meal({ mealLabel: 'breakfast' }), meal({ mealLabel: 'lunch' }), meal({ mealLabel: 'lunch' })]), bands)).toEqual(['breakfast', 'lunch']);
    expect(registeredMoments({ ...day([]), nutrition: { status: 'unavailable' } } as never, bands)).toBeNull();
  });
  it('defaults to half an hour before each moment ends, by the person\'s bands', () => {
    expect(defaultMealReminder('breakfast', bands)).toEqual({ enabled: false, hour: 10, minute: 30 });
    expect(defaultMealReminder('dinner', { ...bands, dinnerUntil: 1410 })).toEqual({ enabled: false, hour: 23, minute: 0 });
  });
  it('only the moments turned on; today\'s is dropped once that moment has a meal', () => {
    const preferences = { ...defaultNoticePreferences, reminders: { 'meal.lunch': { enabled: true, hour: 15, minute: 30 }, 'meal.dinner': { enabled: false, hour: 22, minute: 30 } } };
    const ids = (moments?: ('breakfast' | 'lunch' | 'snack' | 'dinner')[]) => planReminders([mealRemindersCategory], { preferences, now: NOW, today: TODAY,
      todayStatus: moments ? { date: TODAY, closed: false, moments } : null }).map(item => item.id);
    expect(ids()).toHaveLength(7); expect(ids()[0]).toBe('meal.lunch.2026-11-25');
    expect(ids(['lunch'])[0]).toBe('meal.lunch.2026-11-26');
    expect(ids(['breakfast'])[0]).toBe('meal.lunch.2026-11-25');
    const first = planReminders([mealRemindersCategory], { preferences, now: NOW, today: TODAY })[0];
    expect(first).toEqual({ id: 'meal.lunch.2026-11-25', at: Date.parse('2026-11-25T18:30:00Z'), title: '¿Registraste el almuerzo?', path: '/nutrition' });
    expect(reminderCategories.map(category => category.id)).toEqual(['close-day', 'meal', 'training', 'body', 'weekly']);
  });
});

describe('Ajustes → Avisos · Comidas (#639)', () => {
  it('each moment off by default; on asks for notifications and keeps its own time', async () => {
    const view = render(<SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }}>
      <OwnlevelThemeProvider initialMode="light"><NoticesSettingsScreen now={() => NOW} /></OwnlevelThemeProvider></SafeAreaProvider>);
    await act(async () => {});
    for (const name of ['Desayuno', 'Almuerzo', 'Merienda', 'Cena']) expect(view.getByLabelText(name).props.value).toBe(false);
    await act(async () => { fireEvent(view.getByLabelText('Almuerzo'), 'valueChange', true); });
    expect(mockRest).toHaveBeenCalledWith(true);
    expect(view.getByTestId('meal.lunch-time').props.children).toBe('14:30');
    fireEvent.press(view.getByLabelText('Hora de Almuerzo, media hora antes'));
    expect(noticePreferences('owner').getSnapshot().preferences.reminders['meal.lunch']).toEqual({ enabled: true, hour: 14, minute: 0 });
    expect(noticePreferences('owner').getSnapshot().preferences.reminders['meal.dinner']).toBeUndefined();
  });
});
