import { NutritionToast } from './nutrition-toast';
import type { MetricNotice } from './use-metric-entry';

export function MetricSavedNotice({ notice, disabled, onUndo, onClose, pending = false }: { notice: MetricNotice; disabled: boolean; pending?: boolean; onUndo: () => void; onClose: () => void }) {
  return <NutritionToast testID="nutrition-metric-notice" message={notice.message} state={pending ? 'pending' : 'info'}
    action={notice.undo ? { label: 'Deshacer', accessibilityLabel: 'Deshacer cambio de métrica', disabled, onPress: onUndo } : undefined}
    onClose={onClose} closeLabel="Cerrar aviso de métrica" />;
}
