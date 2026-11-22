import { StyleSheet, type ViewStyle } from 'react-native';
import { fieldGradient } from './atmosphere';
import { useOwnlevelTheme } from './theme';

/**
 * The surface of fields, search and quick tiles: never a flat white (IDENTIDAD.md § Campos y acción). The solid
 * `field` color stays underneath as the fallback where gradients are not drawn.
 */
export function useFieldSurface(kind: 'field' | 'tile' = 'field'): ViewStyle {
  const { colors, isDark } = useOwnlevelTheme();
  return {
    backgroundColor: colors.field,
    experimental_backgroundImage: fieldGradient(isDark ? 'dark' : 'light', kind === 'tile'),
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.fieldBorder,
  };
}
