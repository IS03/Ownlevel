import { Button, Host, HStack, Image, Menu, Spacer, Text } from '@expo/ui/swift-ui';
import { accessibilityLabel, buttonStyle, disabled, font, foregroundStyle, frame, glassEffect, menuIndicator, menuStyle } from '@expo/ui/swift-ui/modifiers';
import { useOwnlevelTheme } from '@/design-system';
import type { NutritionAddMenuProps } from './add-menu-actions';
export { showNutritionAddMenu } from './add-menu-actions';
export function NutritionAddMenu({ onManual, onQuick, onFood }: NutritionAddMenuProps) {
  const { colors, isDark } = useOwnlevelTheme();
  return <Host colorScheme={isDark ? 'dark' : 'light'} style={{ height: 50, width: '100%' }}>
    <Menu label={<HStack spacing={8} modifiers={[frame({ maxWidth: Infinity, height: 50 }), glassEffect({ glass: { variant: 'regular' }, shape: 'roundedRectangle', cornerRadius: 14 })]}>
      <Spacer minLength={0} /><Image systemName="plus" color={colors.primary} size={20} /><Text modifiers={[font({ textStyle: 'headline' }), foregroundStyle(colors.primary)]}>Agregar comida</Text><Spacer minLength={0} />
    </HStack>} // The label is the whole trigger (no button chrome), so the glass keeps the full row width.
      modifiers={[menuStyle('button'), buttonStyle('plain'), menuIndicator('hidden'), frame({ maxWidth: Infinity }), accessibilityLabel('Agregar comida'), disabled(!onManual)]}>
      <Button label="A mano" systemImage="square.and.pencil" onPress={onManual} />
      <Button label="Rápido" systemImage="bolt" onPress={onQuick} />
      <Button label="Alimento por cantidad" systemImage="scalemass" onPress={onFood} />
    </Menu>
  </Host>;
}
