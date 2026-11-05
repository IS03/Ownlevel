import type { ReactElement } from 'react';
import type { ViewProps } from 'react-native';

export type RoutineFormSheetProps = {
  children: ReactElement<ViewProps>;
  open: boolean;
  pending: boolean;
  onClose: () => void;
  /** iOS: runs only once the native presentation has fully dismissed. */
  onDismissed?: () => void;
};
