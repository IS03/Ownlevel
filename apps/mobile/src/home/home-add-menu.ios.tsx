import { StyleSheet } from 'react-native';
import { Button, Host, Menu, Text } from '@expo/ui/swift-ui';
import { accessibilityLabel, font, foregroundStyle, padding } from '@expo/ui/swift-ui/modifiers';

import { radius, useOwnlevelTheme } from '@/design-system';

import type { HomeAddMenuProps } from './home-add-menu.types';

/** Nutrition's "+ Comida": a native UIMenu (SwiftUI Menu through @expo/ui). */
export function HomeAddMenu({ onFood, onManual, onQuick }: HomeAddMenuProps) {
  const { colors, isDark } = useOwnlevelTheme();
  return (
    <Host colorScheme={isDark ? 'dark' : 'light'} matchContents style={[styles.host, { backgroundColor: colors.brandSubtle }]} testID="home-add-menu">
      <Menu
        label={<Text modifiers={[font({ textStyle: 'subheadline', weight: 'medium' }), foregroundStyle(colors.primary), padding({ horizontal: 12, vertical: 12 })]}>+ Comida</Text>}
        modifiers={[accessibilityLabel('Agregar comida')]}
      >
        <Button label="A mano" onPress={onManual} systemImage="square.and.pencil" />
        <Button label="Rápido" onPress={onQuick} systemImage="bolt" />
        <Button label="Alimento por cantidad" onPress={onFood} systemImage="scalemass" />
      </Menu>
    </Host>
  );
}

const styles = StyleSheet.create({ host: { borderRadius: radius.full, minHeight: 44 } });
