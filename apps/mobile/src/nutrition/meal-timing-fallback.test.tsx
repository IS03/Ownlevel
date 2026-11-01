import { fireEvent, render } from '@testing-library/react-native';
import { describe, expect, it, jest } from '@jest/globals';
import { OwnlevelThemeProvider } from '@/design-system';

// Explicitly exercise the non-iOS implementation; Jest otherwise resolves the .ios file.
const { MealTiming } = jest.requireActual<typeof import('./meal-timing')>('./meal-timing.tsx');

describe('confirmed timing in the fallback editor (#308)', () => {
  it('shows registration provenance without turning a placeholder into a declared time on blur', () => {
    const change = jest.fn();
    const view = render(<OwnlevelThemeProvider initialMode="light"><MealTiming date="2026-10-15" value={{ mealLabel: null }} disabled={false}
      reference={{ date: '2026-10-15', consumedAt: '2026-10-15T23:15:00Z', timeKnown: false, timeSource: 'registration', automaticMealLabel: 'dinner' }} onChange={change} /></OwnlevelThemeProvider>);
    expect(view.getByText('Cena (automática)')).toBeTruthy();
    expect(view.getByPlaceholderText('≈ 20:15 · hora de registro')).toBeTruthy();
    fireEvent(view.getByLabelText('Hora HH:MM'), 'endEditing', { nativeEvent: { text: '' } });
    expect(change).not.toHaveBeenCalled();
    fireEvent(view.getByLabelText('Hora HH:MM'), 'endEditing', { nativeEvent: { text: '13:00' } });
    expect(change).toHaveBeenCalledWith(null, '2026-10-15T13:00:00-03:00');
  });
});
