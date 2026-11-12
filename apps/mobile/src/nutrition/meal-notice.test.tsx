import { act, fireEvent, render } from '@testing-library/react-native';
import { afterEach, beforeEach, expect, it, jest } from '@jest/globals';
import { ActivityIndicator, Dimensions, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView, State } from 'react-native-gesture-handler';
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';
import { NoticeStack, OwnlevelThemeProvider, brandTokens, spacing } from '@/design-system';
import type { NutritionDayMeal } from '@/api/nutrition-day';
import { MealAddedNotice } from './meal-notice';
import { MetricSavedNotice } from './metric-notice';
import { NutritionToast } from './nutrition-toast';
import type { MealNotice } from './use-meal-notice';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
const original = { window: Dimensions.get('window'), screen: Dimensions.get('screen') };
beforeEach(() => { Dimensions.set({ window: { ...original.window, fontScale: 1 }, screen: original.screen }); });
afterEach(() => { jest.restoreAllMocks(); Dimensions.set(original); });
const notice: MealNotice = { date: '2026-11-07', message: 'Pasta · 250 kcal', meal: { id: 'meal-1' } as NutritionDayMeal };
const tree = (children: React.ReactNode, bottom = 34) => <GestureHandlerRootView><SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 320, height: 700 }, insets: { top: 44, bottom, left: 0, right: 0 } }}>
  <OwnlevelThemeProvider initialMode="dark">{children}</OwnlevelThemeProvider></SafeAreaProvider></GestureHandlerRootView>;
const swipe = (translationY: number) => act(() => fireGestureHandler(getByGestureTestId('transient-notice-dismiss'), [
  { state: State.BEGAN, translationX: 0, translationY: 0 }, { state: State.ACTIVE, translationX: 0, translationY }, { state: State.END, translationX: 0, translationY }]));
const meal = (props: Partial<React.ComponentProps<typeof MealAddedNotice>> = {}) => {
  const onUndo = jest.fn(), onClose = jest.fn();
  return { onUndo, onClose, view: render(tree(<MealAddedNotice notice={notice} disabled={false} pending={false} onUndo={onUndo} onClose={onClose} {...props} />)) };
};

it('shows the meal with Deshacer, no ✕, a check and the tab-bar-safe placement', () => {
  const { view } = meal();
  expect(view.getByLabelText('Pasta · 250 kcal')).toBeTruthy(); expect(view.getByRole('button', { name: 'Deshacer comida agregada' })).toBeTruthy();
  expect(view.queryByRole('button', { name: 'Cerrar aviso de comida' })).toBeNull(); expect(view.getByTestId('nutrition-meal-notice-icon')).toBeTruthy();
  expect(StyleSheet.flatten(view.getByTestId('nutrition-meal-notice').props.style).bottom).toBeGreaterThanOrEqual(brandTokens.layout.tabBarHeight + brandTokens.layout.tabBarInset + spacing.sm);
});
it('undo calls only onUndo; swipe and the VoiceOver action call only onClose and never the undo', () => {
  const { view, onUndo, onClose } = meal();
  fireEvent.press(view.getByRole('button', { name: 'Deshacer comida agregada' })); expect(onUndo).toHaveBeenCalledTimes(1); expect(onClose).not.toHaveBeenCalled();
  onUndo.mockClear();
  swipe(20); expect(onClose).not.toHaveBeenCalled();
  swipe(brandTokens.layout.minTouch); expect(onClose).toHaveBeenCalledTimes(1);
  const text = view.getByLabelText('Pasta · 250 kcal'); expect(text.props.accessibilityActions).toEqual([{ name: 'dismiss', label: 'Descartar aviso de comida' }]);
  fireEvent(text, 'accessibilityAction', { nativeEvent: { actionName: 'dismiss' } }); expect(onClose).toHaveBeenCalledTimes(2);
  expect(onUndo).not.toHaveBeenCalled();
});
it('locks the undo while the day is busy but still lets the user hide the notice, as the old ✕ did', () => {
  const { view, onUndo, onClose } = meal({ disabled: true });
  fireEvent.press(view.getByRole('button', { name: 'Deshacer comida agregada' })); expect(onUndo).not.toHaveBeenCalled();
  swipe(60); expect(onClose).toHaveBeenCalledTimes(1);
});
it('pending reads "Deshaciendo…" with a spinner, no Deshacer, no gesture and no dismiss action', () => {
  const { view, onClose } = meal({ pending: true });
  expect(view.getByLabelText('Deshaciendo…')).toBeTruthy(); expect(view.UNSAFE_queryByType(ActivityIndicator)).not.toBeNull();
  expect(view.queryByRole('button')).toBeNull(); expect(() => getByGestureTestId('transient-notice-dismiss')).toThrow();
  expect(view.getByLabelText('Deshaciendo…').props.accessibilityActions).toBeUndefined(); expect(onClose).not.toHaveBeenCalled();
});
it('goes added, then undoing, then a brief non-dismissible result, one distinct state at a time', () => {
  const { view, onClose } = meal();
  expect(view.getByLabelText('Pasta · 250 kcal')).toBeTruthy();
  view.rerender(tree(<NutritionToast testID="nutrition-meal-pending" state="pending" message="Deshaciendo…" />));
  expect(view.queryByLabelText('Pasta · 250 kcal')).toBeNull(); expect(view.UNSAFE_queryByType(ActivityIndicator)).not.toBeNull();
  view.rerender(tree(<NutritionToast testID="nutrition-meal-result" state="done" message="Deshecho" />));
  expect(view.getByLabelText('Deshecho')).toBeTruthy(); expect(view.UNSAFE_queryByType(ActivityIndicator)).toBeNull();
  expect(() => getByGestureTestId('transient-notice-dismiss')).toThrow(); expect(onClose).not.toHaveBeenCalled();
});
it('a metric confirmation and a meal confirmation in the same stack both stay visible, one above the other', () => {
  const view = render(tree(<NoticeStack placement="tab" testID="stack">
    <MetricSavedNotice notice={{ date: notice.date, message: 'Agua: 0,5 L', undo: null }} disabled={false} onUndo={jest.fn()} onClose={jest.fn()} />
    <MealAddedNotice notice={notice} disabled={false} pending={false} onUndo={jest.fn()} onClose={jest.fn()} />
  </NoticeStack>));
  expect(view.getByLabelText('Agua: 0,5 L')).toBeTruthy(); expect(view.getByLabelText('Pasta · 250 kcal')).toBeTruthy();
  for (const id of ['nutrition-metric-notice', 'nutrition-meal-notice']) expect(StyleSheet.flatten(view.getByTestId(id).props.style).position).toBeUndefined();
  expect(StyleSheet.flatten(view.getByTestId('stack').props.style).position).toBe('absolute');
});
it.each([83, 34, 0])('a metric notice and a meal toast share one bottom in a tab host (inset %s)', bottom => {
  const view = render(tree(<>
    <MetricSavedNotice notice={{ date: notice.date, message: 'Agua: 0,5 L', undo: null }} disabled={false} onUndo={jest.fn()} onClose={jest.fn()} />
    <MealAddedNotice notice={notice} disabled={false} pending={false} onUndo={jest.fn()} onClose={jest.fn()} />
    <NutritionToast testID="pending-toast" state="pending" message="Deshaciendo…" placement="tab" />
  </>, bottom));
  const bottoms = ['nutrition-metric-notice', 'nutrition-meal-notice', 'pending-toast'].map(id => StyleSheet.flatten(view.getByTestId(id).props.style).bottom);
  expect(new Set(bottoms).size).toBe(1); expect(bottoms[0]).toBe(Math.max(bottom, brandTokens.layout.tabBarHeight + brandTokens.layout.tabBarInset) + spacing.sm);
});
