import { StyleSheet, View } from 'react-native';
import { Button, HStack, Host, Image, Menu, Spacer, Text } from '@expo/ui/swift-ui';
import { accessibilityLabel, buttonStyle, disabled as disabledModifier, foregroundColor, frame, menuIndicator, menuStyle, padding } from '@expo/ui/swift-ui/modifiers';
import { useOwnlevelTheme } from '@/design-system';
import { foodUnitOptions } from './food-model';
import { unitStyles, type UnitMenuProps } from './unit-menu-shared';

/** iOS: the unit field opens the system menu, with a check on the current one. Same look as the other fields. */
export function UnitMenu({ value, onChange, disabled }: UnitMenuProps) {
  const { colors, isDark } = useOwnlevelTheme();
  return <View style={[unitStyles.field, { backgroundColor: colors.field, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.fieldBorder, paddingHorizontal: 0 }, disabled && { opacity: 0.45 }]} testID="food-unit-menu">
    <Host colorScheme={isDark ? 'dark' : 'light'} matchContents={{ vertical: true }} style={{ flex: 1 }}>
      <Menu
        label={<HStack modifiers={[frame({ maxWidth: 10000, minHeight: 48, alignment: 'leading' }), padding({ horizontal: 12 })]}>
          <Text modifiers={[foregroundColor(colors.text)]}>{value || 'Unidad'}</Text>
          <Spacer />
          <Image systemName="chevron.up.chevron.down" size={13} color={colors.textMuted} />
        </HStack>}
        modifiers={[menuStyle('button'), buttonStyle('plain'), menuIndicator('hidden'), accessibilityLabel(`Unidad, ${value || 'sin elegir'}`), disabledModifier(!!disabled)]}
      >
        {foodUnitOptions(value).map(unit => <Button key={unit} label={unit} systemImage={unit === value ? 'checkmark' : undefined} onPress={() => onChange(unit)} />)}
      </Menu>
    </Host>
  </View>;
}
