import { StyleSheet, View } from 'react-native';
import { Button, Host, HStack, Menu, Spacer } from '@expo/ui/swift-ui';
import { accessibilityLabel, buttonStyle, contentShape, disabled, frame, menuIndicator, menuStyle, shapes } from '@expo/ui/swift-ui/modifiers';
import { useOwnlevelTheme } from '@/design-system';
import type { NutritionAddMenuProps } from './add-menu-actions';
import { NutritionGlassFace } from './day-controls';
export { showNutritionAddMenu } from './add-menu-actions';
/**
 * The glass and its label are React Native (they scroll with the page); the native menu sits over them, next to the
 * glass rather than inside it, with an empty label of its own (only the touch area): a SwiftUI host inside a scroll trails the page.
 */
export function NutritionAddMenu({ onManual, onQuick, onFood }: NutritionAddMenuProps) {
  const { isDark } = useOwnlevelTheme();
  return <View style={styles.wrap}>
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" pointerEvents="none" style={!onManual && styles.disabled}>
      <NutritionGlassFace icon="plus" label="Agregar comida" wide />
    </View>
    <Host colorScheme={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill}>
      <Menu label={<HStack modifiers={[frame({ maxWidth: Infinity, height: 50 }), contentShape(shapes.rectangle())]}><Spacer minLength={0} /></HStack>}
        modifiers={[menuStyle('button'), buttonStyle('plain'), menuIndicator('hidden'), frame({ maxWidth: Infinity }), accessibilityLabel('Agregar comida'), disabled(!onManual)]}>
        <Button label="A mano" systemImage="square.and.pencil" onPress={onManual} />
        <Button label="Rápido" systemImage="bolt" onPress={onQuick} />
        <Button label="Alimento por cantidad" systemImage="scalemass" onPress={onFood} />
      </Menu>
    </Host>
  </View>;
}
const styles = StyleSheet.create({ wrap: { width: '100%', height: 50 }, disabled: { opacity: 0.45 } });
