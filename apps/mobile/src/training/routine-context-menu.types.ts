import type { ReactElement } from 'react';
import type { ViewProps } from 'react-native';
import type { MobileTrainingRoutine } from '@/api/routines';

export type RoutineContextMenuProps = {
  children: ReactElement<{ onLongPress?: () => void; onPress?: () => void; pointerEvents?: ViewProps['pointerEvents'] }>;
  disabled: boolean;
  width: number;
  routine: MobileTrainingRoutine;
  onStart: () => void;
  onEdit: () => void;
  onColor: () => void;
  onDuplicate: () => void;
  onStatus: () => void;
};

export type TrainingMenuAction = { label: string; symbol?: 'play.fill' | 'pencil' | 'doc.on.doc' | 'paintpalette' | 'archivebox' | 'archivebox.fill' | 'plus' | 'arrow.2.squarepath' | 'bookmark' | 'trash'; onPress: () => void; separated?: boolean; destructive?: boolean };
export type TrainingContextMenuProps = Pick<RoutineContextMenuProps, 'children' | 'disabled' | 'width'> & { name: string; openOnTap?: boolean; onOpen: () => void; actions: TrainingMenuAction[] };
export function routineMenuActions(props: RoutineContextMenuProps): TrainingMenuAction[] {
  return [ ...(props.routine.isActive ? [{ label: 'Empezar entrenamiento', symbol: 'play.fill' as const, onPress: props.onStart }] : []),
    { label: 'Editar rutina', symbol: 'pencil', onPress: props.onEdit }, { label: 'Duplicar', symbol: 'doc.on.doc', onPress: props.onDuplicate },
    ...(props.routine.isActive ? [{ label: 'Cambiar color', symbol: 'paintpalette' as const, onPress: props.onColor }] : []),
    { label: props.routine.isActive ? 'Archivar' : 'Restaurar', symbol: 'archivebox', onPress: props.onStatus, separated: true } ];
}
