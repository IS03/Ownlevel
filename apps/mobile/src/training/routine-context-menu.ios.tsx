import { cloneElement, Fragment } from 'react';
import { View } from 'react-native';
import { Button, ContextMenu, Divider, Group, Host, RNHostView } from '@expo/ui/swift-ui';
import { contentShape, onTapGesture, shapes } from '@expo/ui/swift-ui/modifiers';
import { useOwnlevelTheme } from '@/design-system';
import { routineMenuActions, type RoutineContextMenuProps, type TrainingContextMenuProps } from './routine-context-menu.types';
export function TrainingContextMenu({ children, disabled, width, onOpen, actions }: TrainingContextMenuProps) {
  const { isDark } = useOwnlevelTheme();
  if (disabled || width <= 0) return children;
  return <Host colorScheme={isDark ? 'dark' : 'light'} matchContents={{ vertical: true }} style={{ width }}><ContextMenu>
    <ContextMenu.Trigger><Group modifiers={[contentShape(shapes.rectangle()), onTapGesture(onOpen)]}><RNHostView matchContents><View style={{ width }}>{cloneElement(children, { pointerEvents: 'none' })}</View></RNHostView></Group></ContextMenu.Trigger>
    <ContextMenu.Items>{actions.map(action => <Fragment key={action.label}>{action.separated ? <Divider /> : null}<Button label={action.label} systemImage={action.symbol} onPress={action.onPress} /></Fragment>)}</ContextMenu.Items>
  </ContextMenu></Host>;
}
export function RoutineContextMenu(props: RoutineContextMenuProps) { return <TrainingContextMenu {...props} name={props.routine.name} onOpen={props.onEdit} actions={routineMenuActions(props)} />; }
