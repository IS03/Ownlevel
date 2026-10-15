import { Button, Host, Image, Menu } from '@expo/ui/swift-ui';
import {
  accessibilityLabel,
  buttonStyle,
  disabled,
  frame,
  glassEffect,
  menuIndicator,
  menuStyle,
} from '@expo/ui/swift-ui/modifiers';
import { useOwnlevelTheme } from '@/design-system';
import type { LibraryEditorMenuProps } from './library-editor-menu';
export function LibraryEditorMenu({
  actions,
  disabled: locked,
  label = 'Acciones del editor',
}: LibraryEditorMenuProps) {
  const { colors, isDark } = useOwnlevelTheme();
  return (
    <Host colorScheme={isDark ? 'dark' : 'light'} style={{ width: 44, height: 44 }}>
      <Menu
        label={
          <Image
            systemName="ellipsis"
            color={colors.text}
            size={20}
            modifiers={[
              frame({ width: 44, height: 44 }),
              glassEffect({ glass: { variant: 'regular' }, shape: 'circle' }),
            ]}
          />
        }
        modifiers={[
          menuStyle('button'),
          buttonStyle('plain'),
          menuIndicator('hidden'),
          accessibilityLabel(label),
          disabled(locked),
        ]}
      >
        {actions.map((action) => (
          <Button
            key={action.label}
            label={action.label}
            systemImage={action.symbol}
            role={action.destructive ? 'destructive' : undefined}
            onPress={action.onPress}
          />
        ))}
      </Menu>
    </Host>
  );
}
