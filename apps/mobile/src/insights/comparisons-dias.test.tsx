import { fireEvent, render, within } from '@testing-library/react-native';
import { describe, expect, it, jest } from '@jest/globals';
import { OwnlevelThemeProvider } from '@/design-system';
import { SessionChart } from './comparison-parts';
import { foodFacts } from './comparison-change';

/** Días más claros: the chart of sessions and the bar against each day's target. Fictitious values only. */
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('@/platform/haptics', () => ({ haptics: { selection: jest.fn() }, triggerHaptic: jest.fn() }));
const sessions = [
  { sessionId: 'c', date: '2026-11-17', label: 'PULL', routine: 'PULL', pct: -2 },
  { sessionId: 'b', date: '2026-11-14', label: 'PULL', routine: 'PULL', pct: null },
  { sessionId: 'a', date: '2026-11-10', label: 'PULL', routine: 'PULL', pct: 3 },
];
const wrap = (node: React.ReactElement) => render(<OwnlevelThemeProvider initialMode="light">{node}</OwnlevelThemeProvider>);

describe('gráfico de sesiones', () => {
  it('draws the oldest first, says a session without a change as such, and chooses with a tap', () => {
    const onSelect = jest.fn(), onEarlier = jest.fn();
    const view = wrap(<SessionChart sessions={sessions} selected="c" onSelect={onSelect} onEarlier={onEarlier} />);
    const bars = within(view.getByTestId('comparisons-session-strip')).getAllByTestId(/^comparisons-strip-/);
    expect(bars.map(bar => bar.props.testID)).toEqual(['comparisons-strip-a', 'comparisons-strip-b', 'comparisons-strip-c']);
    expect(view.getByLabelText(/14 nov: sin cambio medido$/)).toBeTruthy();
    expect(view.getByRole('button', { selected: true }).props.accessibilityLabel).toMatch(/17 nov: −2 %$/);
    fireEvent.press(view.getByTestId('comparisons-strip-a'));
    expect(onSelect).toHaveBeenCalledWith(sessions[2]);
    // Earlier sessions are read only on a tap.
    fireEvent.press(view.getByTestId('comparisons-earlier'));
    expect(onEarlier).toHaveBeenCalledTimes(1);
  });
  it('shows no «Anteriores» when there is nothing before, and nothing at all without sessions', () => {
    expect(wrap(<SessionChart sessions={sessions} selected={null} onSelect={jest.fn()} />).queryByTestId('comparisons-earlier')).toBeNull();
    expect(wrap(<SessionChart sessions={[]} selected={null} onSelect={jest.fn()} />).queryByTestId('comparisons-session-strip')).toBeNull();
  });
});

describe('barra contra el objetivo', () => {
  const nutrition = (calories: number) => ({ activeMeals: 2, calories: { recorded: calories, missing: 0 }, proteinG: { recorded: 0, missing: 0 }, carbsG: { recorded: 0, missing: 0 }, fatG: { recorded: 0, missing: 0 } });
  const session = { context: { carbsPre3h: { value: null, state: 'no_registered_meal_in_window' } } } as never;
  it('fills to its share of that day\'s target and stops a little past it; without a target there is no bar', () => {
    const day = (calories: number, target: number | null) => ({ context: { metrics: [], nutrition: nutrition(calories), target: { calories: target, proteinG: null } } }) as never;
    expect(foodFacts(session, day(1150, 2300))[2]!.share).toBe(0.5);
    expect(foodFacts(session, day(4000, 2000))[2]!.share).toBe(1.2);
    expect(foodFacts(session, day(1150, null))[2]!.share).toBeUndefined();
  });
});
