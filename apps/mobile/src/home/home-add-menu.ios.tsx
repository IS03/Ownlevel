import { StyleSheet, View } from 'react-native';
import { Button, Host, HStack, Menu, Spacer } from '@expo/ui/swift-ui';
import { accessibilityLabel, buttonStyle, contentShape, frame, menuIndicator, menuStyle, shapes } from '@expo/ui/swift-ui/modifiers';

import { AppText, useOwnlevelTheme, brandTokens } from '@/design-system';
import { HomeActionSurface } from './home-ui';

import type { HomeAddMenuProps } from './home-add-menu.types';

/**
 * Nutrition's "+ Comida": a native UIMenu (SwiftUI Menu through @expo/ui). The visible label is drawn by React Native:
 * a SwiftUI host inside a scroll view trails the page, so the native menu sits over the glass with an empty label that only takes the tap.
 */
export function HomeAddMenu({ onFood, onManual, onQuick }: HomeAddMenuProps) {
  const { colors, isDark } = useOwnlevelTheme();
  return (
    <View>
      <HomeActionSurface testID="home-add-menu-glass">
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" pointerEvents="none" style={styles.label}>
          <AppText style={[styles.text, { color: colors.primary }]}>+ Comida</AppText>
        </View>
      </HomeActionSurface>
      <Host colorScheme={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} testID="home-add-menu">
        <Menu
          label={<HStack modifiers={[frame({ maxWidth: Infinity, maxHeight: Infinity }), contentShape(shapes.rectangle())]}><Spacer minLength={0} /></HStack>}
          modifiers={[menuStyle('button'), buttonStyle('plain'), menuIndicator('hidden'), accessibilityLabel('Agregar comida')]}
        >
          <Button label="A mano" onPress={onManual} systemImage="square.and.pencil" />
          <Button label="Rápido" onPress={onQuick} systemImage="bolt" />
          <Button label="Alimento por cantidad" onPress={onFood} systemImage="scalemass" />
        </Menu>
      </Host>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { minHeight: 44, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
  text: { ...brandTokens.typeScale.subheadline, fontWeight: '500' },
});
