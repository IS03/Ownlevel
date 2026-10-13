import type { ReactElement } from 'react';
import type { ViewProps } from 'react-native';
export type RoutineEditorSheetProps = {
  children: ReactElement<ViewProps>; open: boolean; pending: boolean; dirty?: boolean; onClose: () => void; onDismissed?: () => void;
};
