import { StyleSheet, TextInput, View } from 'react-native';

import { layout, typeScale } from './brand';
import { AppIcon, appIconSize } from './icons';
import { radius, spacing } from './tokens';
import { useOwnlevelTheme } from './theme';

/**
 * Search field with the system look: filled (never glass: IDENTIDAD.md keeps glass for controls), magnifier at
 * inline size, text centered on the field's height, clear button while typing and a "Buscar" return key.
 */
export function SearchField({ value, onChange, label, testID }: { value: string; onChange: (value: string) => void; label: string; testID?: string }) {
  const { colors } = useOwnlevelTheme();
  return <View style={[styles.field, { backgroundColor: colors.surfaceRaised }]}>
    <AppIcon name="search" color={colors.textMuted} size={appIconSize.inline} />
    <TextInput accessibilityLabel={label} placeholder={label} placeholderTextColor={colors.textMuted} value={value} onChangeText={onChange}
      autoCorrect={false} autoCapitalize="none" returnKeyType="search" clearButtonMode="while-editing" enablesReturnKeyAutomatically
      style={[styles.input, { color: colors.text }]} testID={testID} />
  </View>;
}

const styles = StyleSheet.create({
  field: { minHeight: layout.inputHeight, borderRadius: radius.sm, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingLeft: spacing.md },
  // Every text attribute is explicit: iOS recycles text fields, and one that came from a big number input
  // (line height 68) pushed this text down. It stretches to the field, which centers the line.
  input: { flex: 1, alignSelf: 'stretch', paddingVertical: 0, paddingRight: spacing.md, fontSize: typeScale.body.fontSize, lineHeight: typeScale.body.lineHeight, fontWeight: typeScale.body.fontWeight,
    letterSpacing: 0, includeFontPadding: false, textAlignVertical: 'center' },
});
