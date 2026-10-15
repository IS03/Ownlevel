import { fireEvent, render } from '@testing-library/react-native';
import { describe, expect, it, jest } from '@jest/globals';
import { Modal, StyleSheet } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { OwnlevelThemeProvider } from '@/design-system';
import { NutritionDayDetails } from './day-details';
import { NutritionDayDetailSheet } from './day-panel';
import { nutritionFixture } from './day-fixture.test-helper';
import type { NutritionDayContext, MobileNutritionDayResponse } from '@/api/nutrition-day';
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
function fixture(patch: Partial<NutritionDayContext> = {}) {
  const data = nutritionFixture();
  if (data.nutrition.status === 'ok' && data.nutrition.data.dayState === 'recorded')
    Object.assign(data.nutrition.data.context, patch);
  return data;
}
const wrap = (body: React.ReactNode, mode: 'light' | 'dark' = 'light') => (
  <SafeAreaInsetsContext.Provider value={{ top: 0, bottom: 0, left: 0, right: 0 }}>
    <OwnlevelThemeProvider initialMode={mode}>{body}</OwnlevelThemeProvider>
  </SafeAreaInsetsContext.Provider>
);
describe('Nutrition day energy and explanation', () => {
  it('uses a shared scale, marks the target and labels expenditure as an estimate', () => {
    const view = render(wrap(<NutritionDayDetails data={fixture()} />));
    expect(view.getByText('Comiste')).toBeTruthy();
    expect(view.getByText('Gasto estimado')).toBeTruthy();
    expect(view.getByText('según tu plan')).toBeTruthy();
    expect(view.getByText('↘ 2.000 kcal')).toBeTruthy();
    expect(StyleSheet.flatten(view.getByTestId('day-intake-bar').props.style).width).toBe(`${(200 / 2200) * 100}%`);
    expect(StyleSheet.flatten(view.getByTestId('day-target-mark').props.style).left).toBe(`${(1800 / 2200) * 100}%`);
    expect(view.queryByText('Gastaste')).toBeNull();
    expect(view.queryByText('Actividad')).toBeNull();
    expect(view.queryByText('Agua')).toBeNull();
  });
  it('distinguishes real zero, all-missing calories and partial sums', () => {
    const data = fixture();
    if (data.nutrition.status !== 'ok' || data.nutrition.data.dayState !== 'recorded') throw new Error('fixture');
    const n = data.nutrition.data;
    n.summary.calories.knownTotal = 0;
    n.context.energyBalanceKcal = -2200;
    const view = render(wrap(<NutritionDayDetails data={data} />));
    expect(StyleSheet.flatten(view.getByTestId('day-intake-bar').props.style).width).toBe('0%');
    n.summary.calories.missingCount = 1;
    view.rerender(wrap(<NutritionDayDetails data={{ ...data }} />));
    expect(view.queryByTestId('day-intake-track')).toBeNull();
    expect(view.queryByTestId('day-target-mark')).toBeNull();
    expect(view.getByTestId('day-expenditure-track')).toBeTruthy();
    expect(view.getAllByText('—')).toHaveLength(2);
    n.summary.entryCount = 2;
    n.summary.calories.knownTotal = 200;
    view.rerender(wrap(<NutritionDayDetails data={{ ...data }} />));
    expect(view.getByText('200 kcal · parcial')).toBeTruthy();
  });
  it('missing expenditure does not render a bar or a fake balance', () => {
    const view = render(
      wrap(<NutritionDayDetails data={fixture({ expenditureKcal: null, energyBalanceKcal: null })} />),
    );
    expect(view.queryByTestId('day-expenditure-track')).toBeNull();
    expect(view.getAllByText('—')).toHaveLength(2);
  });
  it('configured inactive factors keep zero contributions and complete VoiceOver rows', () => {
    const data = fixture({
      breakdown: {
        baseTargetKcal: 1800,
        baseExpenditureKcal: 2200,
        expenditureMode: 'extras',
        factors: [{ key: 'training', appliesTo: 'both', deltaKcal: 0, active: false, source: 'none' }],
      },
    });
    const view = render(wrap(<NutritionDayDetails data={data} />));
    expect(
      view.getByLabelText('Entrenamiento, No hubo sesión hoy, más 0 kilocalorías al objetivo y al gasto'),
    ).toBeTruthy();
    expect(view.getByText('+0 kcal')).toBeTruthy();
    expect(view.queryByText('Día laboral')).toBeNull();
    expect(view.getByText('Base del plan 1.800 kcal objetivo · 2.200 kcal gasto')).toBeTruthy();
  });
  it('groups unequal training allocations in one factor row and supports future factors', () => {
    const view = render(
      wrap(
        <NutritionDayDetails
          data={fixture({
            breakdown: {
              baseTargetKcal: 1550,
              baseExpenditureKcal: 1850,
              expenditureMode: 'extras',
              factors: [
                { key: 'training', appliesTo: 'target', deltaKcal: 250, active: true, source: 'workout' },
                { key: 'training', appliesTo: 'expenditure', deltaKcal: 350, active: true, source: 'workout' },
                { key: 'cycle', appliesTo: 'target', deltaKcal: 0, active: false, source: 'plan' },
              ],
            },
          })}
        />,
      ),
    );
    expect(view.getAllByText('Entrenamiento')).toHaveLength(1);
    expect(
      view.getByLabelText(/más 250 kilocalorías al objetivo, Sí, hubo sesión hoy, más 350 kilocalorías al gasto/),
    ).toBeTruthy();
    expect(view.getByText('Extra del plan')).toBeTruthy();
  });
  it.each(['light', 'dark'] as const)('fixed plan is flat and neutral in %s', (mode) => {
    const view = render(
      wrap(
        <NutritionDayDetails
          data={fixture({
            breakdown: { baseTargetKcal: 1800, baseExpenditureKcal: 2200, expenditureMode: 'fixed', factors: [] },
          })}
        />,
        mode,
      ),
    );
    expect(view.getByText('De dónde sale')).toBeTruthy();
    expect(view.getByText('Fijo, todos los días')).toBeTruthy();
    expect(view.getByText('Automático')).toBeTruthy();
    expect(view.queryByTestId('day-factors')).toBeNull();
  });
  it('does not describe a BMR-derived base as fixed every day', () => {
    const view = render(
      wrap(
        <NutritionDayDetails
          data={fixture({
            breakdown: {
              baseTargetKcal: 1800,
              baseExpenditureKcal: 2200,
              expenditureMode: 'fixed',
              baseExpenditureMode: 'automatic',
              factors: [],
            },
          })}
        />,
      ),
    );
    expect(view.getByText('Base automática, sin extras')).toBeTruthy();
    expect(view.queryByText('Fijo, todos los días')).toBeNull();
  });
  it('manual overrides expose separate reset actions; missing breakdown invents no source', () => {
    const data = fixture({ targetOverrideKcal: 1900, expenditureOverrideKcal: 2300, breakdown: null }),
      onContext = jest.fn();
    const view = render(wrap(<NutritionDayDetails data={data} onContext={onContext} />));
    expect(view.getAllByText('Ajustado hoy')).toHaveLength(2);
    expect(view.queryByText('Qué cambia hoy')).toBeNull();
    expect(view.queryByText('De dónde sale')).toBeNull();
    fireEvent.press(view.getByLabelText('Volver al automático: objetivo'));
    expect(onContext).toHaveBeenLastCalledWith(data, 'target');
    fireEvent.press(view.getByLabelText('Volver al automático: gasto'));
    expect(onContext).toHaveBeenLastCalledWith(data, 'expenditure');
  });
  it('unavailable and a date without a day keep every unknown value absent', () => {
    for (const data of [
      { ...fixture(), nutrition: { status: 'unavailable' } },
      {
        ...fixture(),
        nutrition: { status: 'ok', data: { dayState: 'missing', summary: null, context: null, meals: [] } },
      },
    ] as MobileNutritionDayResponse[]) {
      const view = render(wrap(<NutritionDayDetails data={data} />));
      expect(view.queryByTestId('day-intake-track')).toBeNull();
      expect(view.queryByTestId('day-expenditure-track')).toBeNull();
      expect(view.queryByTestId('day-fixed-origin')).toBeNull();
      view.unmount();
    }
  });
  it('the sheet opens the existing context editor with the visible date, and has no metric editor', () => {
    const data = fixture(),
      onContext = jest.fn(),
      onClose = jest.fn();
    const view = render(wrap(<NutritionDayDetailSheet data={data} onContext={onContext} onClose={onClose} />));
    fireEvent.press(view.getByLabelText('Ajustar hoy'));
    expect(onContext).not.toHaveBeenCalled();
    fireEvent(view.UNSAFE_getByType(Modal), 'dismiss');
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onContext).toHaveBeenCalledWith(data, undefined);
    expect(view.queryByText('Editar actividad')).toBeNull();
  });
});
