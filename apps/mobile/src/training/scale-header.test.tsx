import { render } from '@testing-library/react-native';
import { describe, expect, it, jest } from '@jest/globals';
import { StyleSheet, View } from 'react-native';
import { OwnlevelThemeProvider } from '@/design-system';
import { ScaleHeader } from './scale-header';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
const mount = (node: React.ReactNode) => render(<OwnlevelThemeProvider initialMode="dark">{node}</OwnlevelThemeProvider>);

describe('#514 ScaleHeader', () => {
  it('shows the label once, with the chosen state after it', () => {
    const view = mount(<ScaleHeader label="Energía" state="Baja" />);
    expect(view.getByText('Energía · Baja')).toBeTruthy();
  });
  it('an unanswered question shows its label alone: no state, no invented answer', () => {
    const view = mount(<ScaleHeader label="Dolor" state={null} />);
    expect(view.getByText('Dolor')).toBeTruthy(); expect(view.queryByText(/·/)).toBeNull();
  });
  it('every question gets the same row and label style, with or without a trailing shortcut', () => {
    const view = mount(<><ScaleHeader label="Energía" state="Alta" /><ScaleHeader label="Rendimiento" state="4 de 5" />
      <ScaleHeader label="Dolor" state="3 de 10"><View testID="shortcut" style={{ height: 32 }} /></ScaleHeader></>);
    const labels = ['Energía · Alta', 'Rendimiento · 4 de 5', 'Dolor · 3 de 10'].map(text => StyleSheet.flatten(view.getByText(text).props.style));
    expect(labels[1]).toEqual(labels[0]); expect(labels[2]).toEqual(labels[0]);
    expect(labels[0]).toMatchObject({ fontWeight: '600' });
    const rows = view.getAllByTestId('scale-header').map(row => StyleSheet.flatten(row.props.style));
    expect(rows[2]).toEqual(rows[0]); expect(rows[0]).toMatchObject({ minHeight: 32 });
  });
});
