import type { ReactElement } from 'react';
import type { MobileTrainingRoutine } from '@/api/routines';

export type RoutineContextMenuProps = {
  children: ReactElement<{ onLongPress?: () => void }>;
  disabled: boolean;
  width: number;
  routine: MobileTrainingRoutine;
  onStart: () => void;
  onEdit: () => void;
  onColor: () => void;
  onStatus: () => void;
};
