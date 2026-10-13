import { Button, ConfirmationDialog, Host, Rectangle, Text } from '@expo/ui/swift-ui';
import { foregroundStyle, frame } from '@expo/ui/swift-ui/modifiers';
import { StyleSheet } from 'react-native';
import { useOwnlevelTheme } from '@/design-system';
import { useHoldStartConfirmLock } from './start-confirm-lock';
import { routineRemoveMessage, type RoutineRemoveConfirmProps } from './routine-remove-confirm.types';
export function RoutineRemoveConfirm({ name, routineName, open, onCancel, onConfirm }: RoutineRemoveConfirmProps) {
  const { isDark, colors } = useOwnlevelTheme(); useHoldStartConfirmLock(open);
  return <Host colorScheme={isDark ? 'dark' : 'light'} pointerEvents="none" style={StyleSheet.absoluteFill}>
    <ConfirmationDialog isPresented={open} title={`¿Quitar ${name}?`} titleVisibility="visible" onIsPresentedChange={value => { if (!value) onCancel(); }}>
      <ConfirmationDialog.Trigger><Rectangle modifiers={[foregroundStyle('clear'), frame({ maxHeight: Infinity, maxWidth: Infinity })]} /></ConfirmationDialog.Trigger>
      <ConfirmationDialog.Message><Text>{routineRemoveMessage}</Text></ConfirmationDialog.Message>
      <ConfirmationDialog.Actions><Button modifiers={[foregroundStyle(colors.danger)]} role="destructive" label={`Quitar de ${routineName}`} onPress={onConfirm} /><Button role="cancel" label="Cancelar" onPress={onCancel} /></ConfirmationDialog.Actions>
    </ConfirmationDialog>
  </Host>;
}
