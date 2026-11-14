import { TransientNotice } from '@/design-system';
import { NutritionToast } from './nutrition-toast';
import type { MetricNotice } from './use-metric-entry';
import { previousNoticeLabel } from './previous-notice-label';

/**
 * Thin wrapper over the shared transient notice: the queue ("Ver anteriores · n"), the undo and the dismissal stay owned by `useMetricEntry`.
 * Recovery in progress ("Deshaciendo…") is a pending toast: no actions, not dismissible.
 */
export function MetricSavedNotice({ notice, disabled, onUndo, onClose, onPrevious, pending = false }: {
  notice: MetricNotice; disabled: boolean; pending?: boolean; onUndo: () => void; onClose: () => void; onPrevious?: () => void;
}) {
  return pending ? <NutritionToast testID="nutrition-metric-notice" message={notice.message} state="pending" placement="tab" />
    : <TransientNotice testID="nutrition-metric-notice" placement="tab" state="done" message={notice.message} announce announceKey={notice.id}
      disabled={disabled} onDismiss={onClose} dismissLabel="Descartar confirmación" dismissTestID="metric-notice-dismiss"
      action={notice.undo ? { label: 'Deshacer', accessibilityLabel: 'Deshacer cambio de métrica', disabled, onPress: onUndo } : undefined}
      secondaryAction={notice.queuedCount && onPrevious ? { label: previousNoticeLabel(notice.queuedCount), accessibilityLabel: `Ver confirmación anterior, ${notice.queuedCount} disponibles`, disabled, onPress: onPrevious } : undefined} />;
}
