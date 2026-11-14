import { TransientNotice } from '@/design-system';
import type { MealNotice } from './use-meal-notice';
import { previousNoticeLabel } from './previous-notice-label';
/** "comida · kcal · Deshacer": dismissible by swipe or the VoiceOver action (only hides it; the 10 s undo window is the owner's). Pending shows no actions. */
export function MealAddedNotice({ notice, disabled, pending, onUndo, onClose, queuedCount, onPrevious }: { notice: MealNotice; disabled: boolean; pending: boolean; onUndo: () => void; onClose: () => void;
  /** Other confirmations of this day still within their own 10 s ("Ver anteriores · n" brings the previous one to the front). */
  queuedCount?: number; onPrevious?: () => void }) {
  return <TransientNotice testID="nutrition-meal-notice" placement="tab" message={pending ? 'Deshaciendo…' : notice.message} state={pending ? 'pending' : 'done'}
    action={{ label: 'Deshacer', accessibilityLabel: 'Deshacer comida agregada', disabled, onPress: onUndo }} onDismiss={onClose} dismissLabel="Descartar aviso de comida"
    secondaryAction={!pending && queuedCount && queuedCount > 0 && onPrevious ? { label: previousNoticeLabel(queuedCount), accessibilityLabel: `Ver comida anterior, ${queuedCount} disponibles`, disabled, onPress: onPrevious } : undefined} />;
}
