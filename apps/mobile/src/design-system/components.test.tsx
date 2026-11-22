import { fireEvent, render } from '@testing-library/react-native';
import { describe, expect, it, jest } from '@jest/globals';
import type { ReactNode } from 'react';
import { ActivityIndicator, StyleSheet } from 'react-native';

import { palette } from './brand';
import { TextField } from './form';
import { LinkRow, ListGroup, ListRow } from './list';
import { pressedStyle } from './motion';
import { Button, EmptyState, InlineNotice, Surface, UnavailableState, type ButtonVariant } from './primitives';
import { ChipGroup, SegmentedControl } from './selection';
import { SheetHeader } from './sheet';
import { OwnlevelThemeProvider, type ThemeMode } from './theme';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));

const inTheme = (node: ReactNode, mode: ThemeMode = 'light') => render(<OwnlevelThemeProvider initialMode={mode}>{node}</OwnlevelThemeProvider>);
const flat = (style: unknown) => StyleSheet.flatten(typeof style === 'function' ? style({ pressed: false }) : style) as Record<string, unknown>;

describe('Button', () => {
  it.each([
    ['primary', palette.light.action],
    ['secondary', palette.light.elevated],
    ['quiet', 'transparent'],
    ['destructive', palette.light.errorSoft],
  ] as [ButtonVariant, string][])('%s uses its brand background, height and radius', (variant, background) => {
    const view = inTheme(<Button label="Acción" onPress={() => undefined} variant={variant} />);
    const style = flat(view.getByRole('button', { name: 'Acción' }).props.style);
    expect(style).toMatchObject({ backgroundColor: background, borderRadius: 14, minHeight: variant === 'quiet' ? 44 : 50 });
  });

  it('dark mode primary is the dark champagne', () => {
    const view = inTheme(<Button label="Guardar" onPress={() => undefined} />, 'dark');
    expect(flat(view.getByRole('button', { name: 'Guardar' }).props.style).backgroundColor).toBe(palette.dark.accent);
  });

  it('disabled and loading block presses and expose their state; loading shows progress', () => {
    const onPress = jest.fn();
    const view = inTheme(<><Button disabled label="Uno" onPress={onPress} /><Button loading label="Dos" onPress={onPress} /></>);
    fireEvent.press(view.getByRole('button', { name: 'Uno' }));
    fireEvent.press(view.getByRole('button', { name: 'Dos' }));
    expect(onPress).not.toHaveBeenCalled();
    expect(view.getByRole('button', { name: 'Uno' }).props.accessibilityState).toEqual({ busy: false, disabled: true });
    expect(view.getByRole('button', { name: 'Dos' }).props.accessibilityState).toEqual({ busy: true, disabled: true });
    expect(view.UNSAFE_getAllByType(ActivityIndicator)).toHaveLength(1);
  });

  it('press feedback scales to 95 %, or fades with Reduce Motion', () => {
    expect(pressedStyle(true, false)).toEqual({ transform: [{ scale: 0.95 }] });
    expect(pressedStyle(true, true)).toEqual({ opacity: 0.7 });
    expect(pressedStyle(false, false)).toBeNull();
  });
});

describe('TextField', () => {
  it('label is the accessibility label; error is announced and outlines in brand error; disabled is not editable', () => {
    const view = inTheme(<TextField label="Peso (kg)" value="80" onChangeText={() => undefined} error="Revisá el valor." disabled numeric />);
    const input = view.getByLabelText('Peso (kg)');
    expect(input.props.editable).toBe(false);
    expect(flat(input.props.style)).toMatchObject({
      backgroundColor: palette.light.field, borderColor: palette.light.error, borderRadius: 12, minHeight: 48, fontVariant: ['tabular-nums'],
    });
    expect(view.getByRole('alert').props.children).toBe('Revisá el valor.');
  });

  it('hint shows without an error; hidden label stays accessible', () => {
    const view = inTheme(<TextField label="Buscar ejercicio" hideLabel search hint="Por nombre" value="" onChangeText={() => undefined} />);
    expect(view.queryByText('Buscar ejercicio')).toBeNull();
    expect(view.getByLabelText('Buscar ejercicio').props.returnKeyType).toBe('search');
    expect(view.getByText('Por nombre')).toBeTruthy();
  });
});

describe('Selection', () => {
  const options = [{ value: 'low', label: 'Baja' }, { value: 'high', label: 'Alta' }] as const;
  it('chips expose checked state, use accentSoft for the selection and report changes', () => {
    const onChange = jest.fn();
    const view = inTheme(<ChipGroup accessibilityLabel="Actividad" options={options} value="low" onChange={onChange} />);
    const [low, high] = view.getAllByRole('radio');
    expect(low.props.accessibilityState).toEqual({ checked: true, disabled: false });
    expect(high.props.accessibilityState).toEqual({ checked: false, disabled: false });
    expect(flat(low.props.style)).toMatchObject({ backgroundColor: palette.light.accentSoft, borderColor: palette.light.accent, borderRadius: 10 });
    expect(flat(high.props.style).backgroundColor).toBe(palette.light.elevated);
    fireEvent.press(view.getByText('Alta'));
    expect(onChange).toHaveBeenCalledWith('high');
  });

  it('segmented control marks the selected option and respects disabled', () => {
    const onChange = jest.fn();
    const view = inTheme(<SegmentedControl accessibilityLabel="Tema" options={options} value="high" onChange={onChange} disabled />);
    expect(view.getByRole('radio', { name: 'Alta' }).props.accessibilityState).toEqual({ checked: true, disabled: true });
    fireEvent.press(view.getByRole('radio', { name: 'Baja' }));
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('Rows, surfaces and sheets', () => {
  it('pressable rows are buttons with min touch 44; groups separate rows', () => {
    const onPress = jest.fn();
    const view = inTheme(<ListGroup>
      <ListRow title="Perfil físico" subtitle="Altura y peso" onPress={onPress} />
      <ListRow title="Bloqueada" onPress={onPress} disabled />
      <ListRow title="Versión" value="1.0" numericValue />
    </ListGroup>);
    const row = view.getByRole('button', { name: 'Perfil físico' });
    expect(flat(row.props.style).minHeight).toBe(44);
    fireEvent.press(row);
    fireEvent.press(view.getByRole('button', { name: 'Bloqueada' }));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(view.getByRole('button', { name: 'Bloqueada' }).props.accessibilityState).toEqual({ disabled: true });
    expect(view.getByText('1.0').props.style).toEqual(expect.arrayContaining([{ fontVariant: ['tabular-nums'] }]));
  });

  it('link rows navigate, open or pick without a banner: no fill, no border, min touch 44', () => {
    const onPress = jest.fn();
    const view = inTheme(<>
      <LinkRow label="Ver tus pesajes" onPress={onPress} />
      <LinkRow kind="disclosure" expanded label="Comparar dos registros" onPress={onPress} />
      <LinkRow label="Medida" value="Cintura" onPress={onPress} />
    </>);
    const row = view.getByRole('button', { name: 'Ver tus pesajes' });
    const style = flat(row.props.style);
    expect(style.minHeight).toBe(44);
    expect(style.backgroundColor).toBeUndefined();
    expect(style.borderWidth).toBeUndefined();
    expect(view.getByRole('button', { name: 'Comparar dos registros' }).props.accessibilityState).toEqual({ disabled: false, expanded: true });
    fireEvent.press(view.getByRole('button', { name: 'Medida, Cintura' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('cards use radius 20 and padding 18', () => {
    const view = inTheme(<Surface testID="card" />);
    expect(flat(view.getByTestId('card').props.style)).toMatchObject({ borderRadius: 20, padding: 18 });
  });

  it('sheet header closes through an accessible icon button', () => {
    const onClose = jest.fn();
    const view = inTheme(<SheetHeader title="Historial" subtitle="Press banca" onClose={onClose} />);
    fireEvent.press(view.getByRole('button', { name: 'Cerrar Historial' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(view.getByRole('header').props.children).toBe('Historial');
  });
});

describe('Feedback states keep distinct semantics', () => {
  it('a notice keeps the caller action (no generic retry) and only system errors use the error color', () => {
    const recover = jest.fn();
    const view = inTheme(<>
      <InlineNotice message="Hay un cambio sin resultado confirmado."><Button label="Comprobar intento guardado" onPress={recover} /></InlineNotice>
      <InlineNotice tone="error" message="No pudimos sincronizar." />
    </>);
    fireEvent.press(view.getByRole('button', { name: 'Comprobar intento guardado' }));
    expect(recover).toHaveBeenCalledTimes(1);
    expect(view.queryByText('Reintentar')).toBeNull();
    expect(flat(view.getByText('Hay un cambio sin resultado confirmado.').props.style).color).toBe(palette.light.text);
    expect(flat(view.getByText('No pudimos sincronizar.').props.style).color).toBe(palette.light.error);
  });

  it('empty can preview an EJEMPLO, unavailable never looks empty', () => {
    const view = inTheme(<>
      <EmptyState title="Sin registros" description="Con dos entrenamientos esta línea pasa a ser tuya." example={<Surface />} />
      <UnavailableState title="No pudimos cargar" description="Tus datos siguen seguros." />
    </>);
    expect(view.getByText('EJEMPLO')).toBeTruthy();
    expect(view.getByLabelText('Ejemplo')).toBeTruthy();
    expect(view.getByText('No pudimos cargar')).toBeTruthy();
  });
});
