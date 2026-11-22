import { TrainingContextMenu } from '@/training/routine-context-menu';
import type { QuickRowMenuProps } from './quick-row-menu.types';
export { QUICK_MENU_TIMES } from './quick-row-menu.types';

/** Outside iOS: the same actions in the app's own long-press sheet (multiples flattened). */
export function QuickRowMenu({ children, disabled, width, name, onOpen, onAdd, times, onTimes, pin, onEdit }: QuickRowMenuProps) {
  const actions = [
    { label: 'Agregar', onPress: onAdd },
    ...(onTimes ? times.map(n => ({ label: `Agregar ×${n}`, onPress: () => onTimes(n) })) : []),
    ...(pin ? [{ label: pin.pinned ? 'Desfijar' : pin.full ? 'Fijadas completas (6)' : 'Fijar arriba', onPress: pin.onToggle, separated: true }] : []),
    ...(onEdit ? [{ label: 'Editar', onPress: onEdit }] : []),
  ];
  return <TrainingContextMenu disabled={disabled} width={width} name={name} onOpen={onOpen} actions={actions}>{children}</TrainingContextMenu>;
}
