import { StyleSheet, TextInput, View } from 'react-native';

import { layout } from './brand';
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
  field: { height: layout.inputHeight, borderRadius: radius.sm, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingLeft: spacing.md },
  // No vertical padding or min height of its own: the text sits on the field's center line.
  input: { flex: 1, height: layout.inputHeight, paddingVertical: 0, paddingRight: spacing.md, fontSize: 17, includeFontPadding: false, textAlignVertical: 'center' },
});
