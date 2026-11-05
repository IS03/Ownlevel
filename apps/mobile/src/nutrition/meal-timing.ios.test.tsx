import { fireEvent, render } from '@testing-library/react-native';
import { describe, expect, it, jest } from '@jest/globals';
import { OwnlevelThemeProvider } from '@/design-system';
import { MealTiming } from './meal-timing.ios';

jest.mock('@expo/ui/swift-ui', () => {
  const { View, Text, Pressable } = jest.requireActual<typeof import('react-native')>('react-native');
  return { Host: View, HStack: View, Text, Image: () => null,
    Menu: ({ label, children }: { label: import('react').ReactNode; children: import('react').ReactNode }) => <View>{label}{children}</View>,
    Button: ({ label, onPress }: { label: string; onPress: () => void }) => <Pressable onPress={onPress}><Text>{label}</Text></Pressable>,
    DatePicker: (props: object) => <View {...props} testID="native-timing-clock" /> };
});

const reference = { date: '2026-10-15', consumedAt: '2026-10-15T23:15:00.123456Z', timeKnown: false,
  timeSource: 'registration' as const, automaticMealLabel: 'dinner' as const };
const element = (onChange: () => void) => <OwnlevelThemeProvider initialMode="light">
  <MealTiming date={reference.date} value={{ mealLabel: null }} reference={reference} disabled={false} onChange={onChange} />
</OwnlevelThemeProvider>;

describe('iOS confirmed automatic timing (#308)', () => {
  it('shows approximate time and automatic moment; opening/canceling the picker never declares them', () => {
    const change = jest.fn(); const view = render(element(change));
    expect(view.getAllByText('Cena')).toHaveLength(2);
    expect(view.getByText('20:15')).toBeTruthy();
    fireEvent.press(view.getByLabelText('Cambiar hora 20:15'));
    expect(view.getByTestId('native-timing-clock').props.selection.getHours()).toBe(20);
    expect(view.getByTestId('native-timing-clock').props.selection.getMinutes()).toBe(15);
    fireEvent.press(view.getByText('Cancelar'));
    expect(change).not.toHaveBeenCalled();
    fireEvent.press(view.getByText('Almuerzo'));
    expect(change).toHaveBeenCalledWith('lunch', undefined);
  });
  it('makes a time explicit only after deliberate confirmation', () => {
    const change = jest.fn(); const view = render(element(change));
    fireEvent.press(view.getByLabelText('Cambiar hora 20:15'));
    expect(change).not.toHaveBeenCalled();
    fireEvent.press(view.getByText('Elegir esta hora'));
    expect(change).toHaveBeenCalledWith(null, '2026-10-15T20:15:00-03:00', true);
  });
});
