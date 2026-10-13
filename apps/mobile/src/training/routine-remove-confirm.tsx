import { useEffect } from 'react';
import { Alert } from 'react-native';
import { routineRemoveMessage, type RoutineRemoveConfirmProps } from './routine-remove-confirm.types';
export function RoutineRemoveConfirm({ name, routineName, open, onCancel, onConfirm }: RoutineRemoveConfirmProps) {
  useEffect(() => { if (open) Alert.alert(`¿Quitar ${name}?`, routineRemoveMessage, [{ text: 'Cancelar', style: 'cancel', onPress: onCancel }, { text: `Quitar de ${routineName}`, style: 'destructive', onPress: onConfirm }], { cancelable: true, onDismiss: onCancel }); }, [name, onCancel, onConfirm, open, routineName]);
  return null;
}
