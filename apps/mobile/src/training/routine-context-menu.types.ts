import type { ReactElement } from 'react';
import type { ViewProps } from 'react-native';
import type { MobileTrainingRoutine } from '@/api/routines';

export type RoutineContextMenuProps = {
  children: ReactElement<{ onLongPress?: () => void; pointerEvents?: ViewProps['pointerEvents'] }>;
  disabled: boolean;
  width: number;
  routine: MobileTrainingRoutine;
  onStart: () => void;
  onEdit: () => void;
  onColor: () => void;
  onDuplicate: () => void;
  onStatus: () => void;
};
