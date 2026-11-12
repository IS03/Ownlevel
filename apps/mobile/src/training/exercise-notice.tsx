import { TransientNotice } from '@/design-system';
/**
 * `onDismiss` is passed only for a confirmed notice ("X agregado", "X quitado"); `pending` ("Quitando X…") and uncertain/error notices
 * are never dismissible, so a recovery message cannot be swiped away.
 */
export function ExerciseNotice({ message, error, undo, disabled, bottomOffset = 0, pending = false, onDismiss }: {
  message: string; error?: boolean; undo?: () => void; disabled: boolean; bottomOffset?: number; pending?: boolean; onDismiss?: () => void;
}) {
  return <TransientNotice testID="exercise-notice" message={message} state={pending ? 'pending' : error ? 'info' : 'done'} alert={error} bottomOffset={bottomOffset}
    action={undo ? { label: 'Deshacer', accessibilityLabel: 'Deshacer', disabled, onPress: undo } : undefined} onDismiss={onDismiss} />;
}
