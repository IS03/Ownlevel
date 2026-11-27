import type { Ref } from 'react';
import { StyleSheet, TextInput, type TextInputProps, type TextStyle, View, type ViewStyle } from 'react-native';

import { layout } from './brand';
import { AppText } from './primitives';
import { radius, spacing, typography } from './tokens';
import { useOwnlevelTheme } from './theme';
import { useFieldSurface } from './field-surface';

type TextFieldProps = Omit<TextInputProps, 'editable' | 'style'> & {
  /** Visible label; also the input's accessibility label unless one is given. */
  label: string;
  /** Keeps the label for accessibility only (search boxes, compact numeric cells). */
  hideLabel?: boolean;
  /** Muted unit next to the label (e.g. kg). */
  unit?: string;
  hint?: string;
  /** Validation or write error for this field, announced as an alert. */
  error?: string;
  disabled?: boolean;
  /** Tabular figures for numeric entry. */
  numeric?: boolean;
  /** Search box behavior (search return key, no autocorrect, clear button). */
  search?: boolean;
  style?: ViewStyle;
  inputStyle?: TextStyle;
  inputRef?: Ref<TextInput>;
};

/**
 * Canonical input (IDENTIDAD.md § Sistema): height 48, radius 12, solid brand
 * "elevated" surface, no glass. Form logic stays in the caller.
 */
export function TextField({
  accessibilityLabel, disabled = false, error, hideLabel = false, hint, inputRef, inputStyle, label, multiline, numeric = false,
  search = false, style, unit, ...props
}: TextFieldProps) {
  const { colors } = useOwnlevelTheme();
  const fieldSurface = useFieldSurface();
  return (
    <View style={[styles.field, style]}>
      {hideLabel ? null : (
        <AppText variant="subheadline">
          {label}{unit ? <AppText muted variant="subheadline">{`  ${unit}`}</AppText> : null}
        </AppText>
      )}
      <TextInput
        ref={inputRef}
        accessibilityHint={hint}
        accessibilityLabel={accessibilityLabel ?? label}
        accessibilityState={{ disabled }}
        autoCorrect={search ? false : props.autoCorrect}
        clearButtonMode={search ? 'while-editing' : props.clearButtonMode}
        editable={!disabled}
        multiline={multiline}
        placeholderTextColor={colors.textMuted}
        returnKeyType={search ? 'search' : props.returnKeyType}
        {...props}
        style={[
          styles.input,
          multiline && styles.multiline,
          numeric && styles.numeric,
          {
            ...fieldSurface,
            borderColor: error ? colors.danger : colors.fieldBorder,
            color: colors.text,
          },
          disabled && styles.disabled,
          inputStyle,
        ]}
      />
      {hint && !error ? <AppText muted variant="footnote">{hint}</AppText> : null}
      {error ? <AppText accessibilityRole="alert" style={{ color: colors.danger }} variant="footnote">{error}</AppText> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: spacing.xs },
  input: {
    ...typography.body,
    borderRadius: radius.input,
    borderWidth: 1,
    minHeight: layout.inputHeight,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  multiline: { minHeight: layout.inputHeight * 2, textAlignVertical: 'top' },
  numeric: { fontVariant: ['tabular-nums'] },
  disabled: { opacity: 0.6 },
});
