import { TransientNotice } from '@/design-system';
import { NutritionToast } from './nutrition-toast';
import type { MetricNotice } from './use-metric-entry';

/**
 * Thin wrapper over the shared transient notice: the undo and the dismissal stay owned by `useMetricEntry`. One at a time (#635):
 * render it with `key={notice.id}`, so a replacement is a new element and a touch begun on the old one never reaches it.
 * Recovery in progress ("Deshaciendo…") is a pending toast: no actions, not dismissible.
 */
export function MetricSavedNotice({ notice, disabled, onUndo, onClose, pending = false }: {
  notice: MetricNotice; disabled: boolean; pending?: boolean; onUndo: () => void; onClose: () => void;
}) {
  return pending ? <NutritionToast testID="nutrition-metric-notice" message={notice.message} state="pending" placement="tab" />
    : <TransientNotice testID="nutrition-metric-notice" placement="tab" state="done" message={notice.message} announce announceKey={notice.id}
      disabled={disabled} onDismiss={onClose} dismissLabel="Descartar confirmación" dismissTestID="metric-notice-dismiss"
      action={notice.undo ? { label: 'Deshacer', accessibilityLabel: 'Deshacer cambio de métrica', disabled, onPress: onUndo } : undefined} />;
}
