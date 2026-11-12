import { TransientNotice } from '@/design-system';
import type { MealNotice } from './use-meal-notice';
/** "comida · kcal · Deshacer": dismissible by swipe or the VoiceOver action (only hides it; the 10 s undo window is the owner's). Pending shows no actions. */
export function MealAddedNotice({ notice, disabled, pending, onUndo, onClose }: { notice: MealNotice; disabled: boolean; pending: boolean; onUndo: () => void; onClose: () => void }) {
  return <TransientNotice testID="nutrition-meal-notice" placement="tab" message={pending ? 'Deshaciendo…' : notice.message} state={pending ? 'pending' : 'done'}
    action={{ label: 'Deshacer', accessibilityLabel: 'Deshacer comida agregada', disabled, onPress: onUndo }} onDismiss={onClose} dismissLabel="Descartar aviso de comida" />;
}
