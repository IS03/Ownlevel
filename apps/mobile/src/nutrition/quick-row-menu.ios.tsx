import { cloneElement } from 'react';
import { View } from 'react-native';
import { Button, ContextMenu, Divider, Group, Host, Menu, RNHostView } from '@expo/ui/swift-ui';
import { contentShape, onTapGesture, shapes } from '@expo/ui/swift-ui/modifiers';
import { useOwnlevelTheme } from '@/design-system';
import type { QuickRowMenuProps } from './quick-row-menu.types';
export { QUICK_MENU_TIMES } from './quick-row-menu.types';

/**
 * The native context menu over one Rápido meal: tap still opens its review; holding lifts the row and shows the menu
 * (Liquid Glass on iOS 26). Agregar · Agregar varias veces ›(×2…×5) · Fijar arriba / Desfijar · Editar.
 */
export function QuickRowMenu({ children, disabled, width, onOpen, onAdd, times, onTimes, pin, onEdit }: QuickRowMenuProps) {
  const { isDark } = useOwnlevelTheme();
  if (disabled || width <= 0) return children;
  return <Host ignoreSafeArea="container" colorScheme={isDark ? 'dark' : 'light'} matchContents={{ vertical: true }} style={{ width }}><ContextMenu>
    <ContextMenu.Trigger><Group modifiers={[contentShape(shapes.rectangle()), onTapGesture(onOpen)]}><RNHostView matchContents><View style={{ width }}>{cloneElement(children, { pointerEvents: 'none' })}</View></RNHostView></Group></ContextMenu.Trigger>
    <ContextMenu.Items>
      <Button label="Agregar" systemImage="plus" onPress={onAdd} />
      {onTimes ? <Menu label="Agregar varias veces" systemImage="plus.square.on.square">
        {times.map(n => <Button key={n} label={`×${n}`} onPress={() => onTimes(n)} />)}
      </Menu> : null}
      {pin ? <><Divider />{pin.pinned ? <Button label="Desfijar" systemImage="pin.slash" onPress={pin.onToggle} />
        : <Button label={pin.full ? 'Fijadas completas (6)' : 'Fijar arriba'} systemImage="pin" onPress={pin.onToggle} />}</> : null}
      {onEdit ? <Button label="Editar" systemImage="pencil" onPress={onEdit} /> : null}
    </ContextMenu.Items>
  </ContextMenu></Host>;
}
