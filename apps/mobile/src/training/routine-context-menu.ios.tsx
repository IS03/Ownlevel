import { Button, ContextMenu, Divider, Host, RNHostView } from '@expo/ui/swift-ui';
import { useOwnlevelTheme } from '@/design-system';
import type { RoutineContextMenuProps } from './routine-context-menu.types';

/** Native long-press menu. No fabricated exercise preview or detail reads on every row. */
export function RoutineContextMenu({ children, disabled, width, routine, onStart, onEdit, onColor, onStatus }: RoutineContextMenuProps) {
  const { isDark } = useOwnlevelTheme();
  if (disabled || width <= 0) return children;
  return (
    <Host colorScheme={isDark ? 'dark' : 'light'} matchContents={{ vertical: true }} style={{ width }}>
      <ContextMenu>
        <ContextMenu.Trigger><RNHostView matchContents>{children}</RNHostView></ContextMenu.Trigger>
        <ContextMenu.Items>
          {routine.isActive ? <Button label="Empezar entrenamiento" systemImage="play.fill" onPress={onStart} /> : null}
          <Button label="Editar rutina" systemImage="pencil" onPress={onEdit} />
          {routine.isActive ? <Button label="Cambiar color" systemImage="paintpalette" onPress={onColor} /> : null}
          <Divider />
          <Button label={routine.isActive ? 'Archivar' : 'Restaurar'} systemImage={routine.isActive ? 'archivebox' : 'archivebox.fill'} onPress={onStatus} />
        </ContextMenu.Items>
      </ContextMenu>
    </Host>
  );
}
