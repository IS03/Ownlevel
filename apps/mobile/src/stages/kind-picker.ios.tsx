import { useState } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { Button, Host, HStack, Menu, Spacer } from '@expo/ui/swift-ui';
import {
  accessibilityLabel,
  accessibilityValue,
  buttonStyle,
  contentShape,
  disabled as nativeDisabled,
  frame,
  foregroundStyle,
  menuIndicator,
  menuStyle,
  shapes,
} from "@expo/ui/swift-ui/modifiers";
import { AppIcon, AppText, brandTokens, useOwnlevelTheme } from '@/design-system';
import { kindLabel, kindOptions } from './stages-model';
import type { KindPickerProps } from './kind-picker.types';
export function KindPicker({
  value,
  disabled = false,
  onChange,
  suggested,
}: KindPickerProps) {
  const { colors, isDark } = useOwnlevelTheme();
  const { fontScale } = useWindowDimensions();
  const [size, setSize] = useState({ width: 0, height: 0 });
  const label = value ? kindLabel(value) : 'Elegí un tipo';
  const measured = size.width > 0 && size.height > 0;
  return (
    <View
      testID="stage-kind-picker"
      onLayout={({ nativeEvent: { layout } }) => setSize(previous =>
        previous.width === layout.width && previous.height === layout.height
          ? previous : { width: layout.width, height: layout.height })}
      style={[styles.control, {
        // Same text capacity for every option, including Dynamic Type.
        minHeight: Math.max(brandTokens.layout.minTouch,
          brandTokens.typeScale.body.lineHeight * fontScale * (fontScale > 1.3 ? 2 : 1) + brandTokens.space.xs * 2),
      }]}
      accessible={!measured || disabled}
      accessibilityRole="button"
      accessibilityLabel="Tipo de plan"
      accessibilityValue={{ text: value ? label : 'Sin elegir' }}
      accessibilityState={{ disabled: disabled || !measured }}
    >
      {/* RN owns visible geometry; the native menu owns the touch and popup only. */}
      <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.face}>
        <AppText style={{ color: value ? colors.primary : colors.textMuted, flexShrink: 1 }}>{label}</AppText>
        <AppIcon name="chevronDown" size={17} color={colors.textMuted} />
      </View>
      {measured && !disabled ? (
        <Host colorScheme={isDark ? 'dark' : 'light'} ignoreSafeArea="all" style={StyleSheet.absoluteFill} testID="stage-kind-menu-host">
          <Menu
            label={<HStack modifiers={[frame(size), contentShape(shapes.rectangle())]}><Spacer minLength={0} /></HStack>}
            modifiers={[
              menuStyle('button'), buttonStyle('plain'), menuIndicator('hidden'),
              accessibilityLabel('Tipo de plan'), accessibilityValue(value ? label : 'Sin elegir'),
            ]}
          >
            {kindOptions.map(option => (
              <Button key={option.value}
                label={`${option.label}${suggested === option.value && value !== option.value ? ' · sugerido' : ''}`}
                systemImage={value === option.value ? 'checkmark' : undefined}
                modifiers={[nativeDisabled(disabled), ...(suggested === option.value && value !== option.value ? [foregroundStyle(colors.textMuted)] : [])]}
                onPress={() => { if (!disabled && value !== option.value) onChange(option.value); }}
              />
            ))}
          </Menu>
        </Host>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  control: { alignSelf: 'stretch', justifyContent: 'center', minWidth: 0 },
  face: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: brandTokens.space.xs,
    paddingHorizontal: brandTokens.space.sm, paddingVertical: brandTokens.space.xs },
});
