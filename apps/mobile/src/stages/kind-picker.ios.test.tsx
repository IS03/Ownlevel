import { fireEvent, render } from '@testing-library/react-native';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import { OwnlevelThemeProvider } from '@/design-system';
import { KindPicker } from './kind-picker.ios';
import { StageKindField } from './stage-kind-field';
import { kindOptions } from './stages-model';
import type { KindPickerProps } from './kind-picker.types';

let mockFontScale = 1;
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({ __esModule: true,
  default: () => ({ width: 402, height: 874, scale: 3, fontScale: mockFontScale }),
}));
// Keep the SDK's menu, slots and event adapters. Only substitute native views.
jest.mock('expo', () => {
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return { ...jest.requireActual<object>('expo'), requireNativeView: (_module: string, name: string) =>
    function NativeView({ children, ...props }: { children?: ReactNode }) {
      return <View {...props} testID={`native-${name}`}>{children}</View>;
    },
  };
});
jest.mock('./kind-picker', () => jest.requireActual('./kind-picker.ios'));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
beforeEach(() => { mockFontScale = 1; });

const wrap = (node: ReactNode) => <OwnlevelThemeProvider initialMode="dark">{node}</OwnlevelThemeProvider>;
const layout = (width: number, height = 44) => ({ nativeEvent: { layout: { width, height } } });

describe('Native stage type menu', () => {
  it('keeps visible content in RN and gives the whole measured face to the menu', () => {
    const onChange = jest.fn();
    const view = render(wrap(<KindPicker value={null} suggested="maintenance" onChange={onChange} />));
    expect(onChange).not.toHaveBeenCalled();
    expect(view.getByText('Elegí un tipo', { includeHiddenElements: true })).toBeTruthy();
    fireEvent(view.getByTestId('stage-kind-picker'), 'layout', layout(288));
    expect(view.getByTestId('native-HostView').props.matchContentsVertical).toBeUndefined();
    expect(StyleSheet.flatten(view.getByTestId('native-HostView').props.style)).toMatchObject({ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 });
    expect(view.getByTestId('native-HStackView').props.modifiers).toEqual(expect.arrayContaining([
      expect.objectContaining({ $type: 'frame', width: 288, height: 44 }),
      expect.objectContaining({ $type: 'contentShape' }),
    ]));
    expect(view.getByTestId('native-MenuView').props.modifiers).toEqual(expect.arrayContaining([
      expect.objectContaining({ $type: 'accessibilityLabel', label: 'Tipo de plan' }),
      expect.objectContaining({ $type: 'accessibilityValue', value: 'Sin elegir' }),
    ]));
    expect(view.getByTestId('stage-kind-picker').props.accessible).toBe(false);
    expect(view.getAllByTestId('native-Button').map(button => button.props.label)).toContain('Mantenimiento · sugerido');
    expect(onChange).not.toHaveBeenCalled();
  });

  it.each(kindOptions)('chooses $label only on a tap and shows the controlled selection', option => {
    const onChange = jest.fn();
    const view = render(wrap(<KindPicker value={null} suggested={option.value} onChange={onChange} />));
    fireEvent(view.getByTestId('stage-kind-picker'), 'layout', layout(288));
    fireEvent(view.getAllByTestId('native-Button').find(button => button.props.label === `${option.label} · sugerido`)!, 'buttonPress');
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(option.value);
    view.rerender(wrap(<KindPicker value={option.value} suggested={option.value} onChange={onChange} />));
    expect(view.getByText(option.label, { includeHiddenElements: true })).toBeTruthy();
    const selected = view.getAllByTestId('native-Button').find(button => button.props.label === option.label)!;
    expect(selected.props.systemImage).toBe('checkmark');
    fireEvent(selected, 'buttonPress');
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(StyleSheet.flatten(view.getByTestId('stage-kind-picker').props.style).minHeight).toBe(44);
  });

  it('exposes only an inert accessible value while disabled', () => {
    const onChange = jest.fn();
    const view = render(wrap(<KindPicker value="recomposition" suggested={null} disabled onChange={onChange} />));
    fireEvent(view.getByTestId('stage-kind-picker'), 'layout', layout(288));
    expect(view.queryByTestId('native-MenuView')).toBeNull();
    expect(view.getByLabelText('Tipo de plan').props.accessibilityState.disabled).toBe(true);
    expect(view.getByLabelText('Tipo de plan').props.accessibilityValue.text).toBe('Recomposición');
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('Stage type field geometry', () => {
  const props: KindPickerProps = { value: null, suggested: 'maintenance', onChange: jest.fn() };
  it.each([
    { scale: 1, width: 360, direction: 'row' },
    { scale: 1, width: 260, direction: 'column' },
    { scale: 2, width: 360, direction: 'column' },
  ])(
    'fits content width $width and Dynamic Type $scale', ({ scale, width, direction }) => {
      mockFontScale = scale;
      const view = render(wrap(<StageKindField {...props} reserveHint />));
      fireEvent(view.getByTestId('stage-kind-field'), 'layout', layout(width));
      expect(StyleSheet.flatten(view.getByTestId('stage-kind-row').props.style).flexDirection).toBe(direction);
      expect(view.getByText('Elegí un tipo', { includeHiddenElements: true }).props.maxFontSizeMultiplier).toBeUndefined();
    },
  );
  it('keeps helper space, margins and row geometry after choosing without exposing the hidden hint', () => {
    const view = render(wrap(<StageKindField {...props} reserveHint />));
    const fieldStyle = view.getByTestId('stage-kind-field').props.style;
    const rowStyle = view.getByTestId('stage-kind-row').props.style;
    view.rerender(wrap(<StageKindField {...props} value="surplus" reserveHint />));
    expect(view.getByTestId('stage-kind-field').props.style).toEqual(fieldStyle);
    expect(view.getByTestId('stage-kind-row').props.style).toEqual(rowStyle);
    expect(view.getByTestId('stage-kind-hint', { includeHiddenElements: true }).props).toMatchObject({ accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants', style: { opacity: 0 } });
    expect(view.queryByText('Elegí qué tipo de plan es para guardarlo.')).toBeNull();
  });
  it('keeps an existing read-only type out of the menu', () => {
    const view = render(wrap(<StageKindField {...props} value="maintenance" readOnly />));
    expect(view.getByLabelText('Tipo de plan').props.accessibilityValue.text).toBe('Mantenimiento');
    expect(view.queryByTestId('stage-kind-picker')).toBeNull();
  });
});
