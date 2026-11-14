import { act, fireEvent, render } from '@testing-library/react-native';
import { describe, expect, it, jest } from '@jest/globals';
import { StyleSheet, View } from 'react-native';
import { OwnlevelThemeProvider } from '@/design-system';
import { SheetHeader } from './meal-sheet';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
const layout = (width: number) => ({ nativeEvent: { layout: { x: 0, y: 0, width, height: 44 } } });
const mount = (right?: React.ReactNode, subtitle?: string) => render(<OwnlevelThemeProvider initialMode="dark">
  <SheetHeader title="Cargar a mano" subtitle={subtitle} left={<View testID="left" />} right={right} /></OwnlevelThemeProvider>);
const minWidth = (view: ReturnType<typeof mount>, id: string) => StyleSheet.flatten(view.getByTestId(id).props.style).minWidth;
const measured = (view: ReturnType<typeof mount>, id: string, width: number) => act(() => { fireEvent(view.getByTestId(id).parent!, 'layout', layout(width)); });

describe('#515 sheet header centring', () => {
  it('reserves the same width on both sides, so the title stays on the sheet centre with asymmetric controls', () => {
    const view = mount(<View testID="right" />);
    expect(minWidth(view, 'sheet-header-left')).toBe(44); expect(minWidth(view, 'sheet-header-right')).toBe(44);
    measured(view, 'right', 96); measured(view, 'left', 44);
    expect(minWidth(view, 'sheet-header-left')).toBe(96); expect(minWidth(view, 'sheet-header-right')).toBe(96);
  });
  it('follows a wider control on the left and shrinks back when the date control gets narrower', () => {
    const view = mount(<View testID="right" />);
    measured(view, 'right', 96); measured(view, 'right', 70);
    expect(minWidth(view, 'sheet-header-right')).toBe(70);
    measured(view, 'left', 120);
    expect(minWidth(view, 'sheet-header-left')).toBe(120); expect(minWidth(view, 'sheet-header-right')).toBe(120);
  });
  it('keeps the title a header with its subtitle, and the title zone flexible so long text wraps instead of overlapping a button', () => {
    const view = mount(undefined, 'sábado, 14 de noviembre');
    expect(view.getByRole('header')).toHaveTextContent('Cargar a mano');
    expect(view.getByText('sábado, 14 de noviembre')).toBeTruthy();
    expect(StyleSheet.flatten(view.getByTestId('sheet-header-title').props.style).flex).toBe(1);
    expect(StyleSheet.flatten(view.getByTestId('sheet-header-left').props.style).flexShrink).toBe(0);
  });
});
