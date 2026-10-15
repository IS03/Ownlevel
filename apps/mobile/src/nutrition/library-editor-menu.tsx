import { Alert, Pressable } from 'react-native';
import { AppIcon, GlassSurface, useOwnlevelTheme } from '@/design-system';
import type { TrainingMenuAction } from '@/training/routine-context-menu.types';
export type LibraryEditorMenuProps = { actions: TrainingMenuAction[]; disabled: boolean; label?: string };
export function LibraryEditorMenu({ actions, disabled, label = 'Acciones del editor' }: LibraryEditorMenuProps) {
  const { colors } = useOwnlevelTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      accessibilityActions={disabled ? [] : actions.map((a) => ({ name: a.label, label: a.label }))}
      onAccessibilityAction={(e) => {
        if (!disabled) actions.find((a) => a.label === e.nativeEvent.actionName)?.onPress();
      }}
      onPress={() =>
        Alert.alert('Acciones', undefined, [
          ...actions.map((a) => ({
            text: a.label,
            style: a.destructive ? ('destructive' as const) : ('default' as const),
            onPress: a.onPress,
          })),
          { text: 'Cancelar', style: 'cancel' },
        ])
      }
    >
      <GlassSurface
        interactive
        style={{ width: 44, height: 44, borderRadius: 999, alignItems: 'center', justifyContent: 'center' }}
      >
        <AppIcon name="more" color={colors.text} size={20} />
      </GlassSurface>
    </Pressable>
  );
}
