import type { ReactElement } from 'react';
import type { ViewProps } from 'react-native';

/**
 * Long press on a meal in Rápido: the system context menu (Liquid Glass on iOS 26) with what can be done with it.
 * `times` lists the multiples offered under «Agregar varias veces» (each adds the meal ×N as one meal).
 */
export type QuickRowMenuProps = {
  children: ReactElement<{ onLongPress?: () => void; onPress?: () => void; pointerEvents?: ViewProps['pointerEvents'] }>;
  disabled: boolean;
  width: number;
  name: string;
  onOpen: () => void;
  onAdd: () => void;
  times: readonly number[];
  onTimes: ((times: number) => void) | null;
  pin: null | { pinned: boolean; full: boolean; onToggle: () => void };
  onEdit: (() => void) | null;
};
export const QUICK_MENU_TIMES = [2, 3, 4, 5] as const;
