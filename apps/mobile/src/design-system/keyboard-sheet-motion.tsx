import { View, type ViewProps } from 'react-native';

export type KeyboardSheetMotionProps = ViewProps & {
  sheetHeight: number;
  bottomInset: number;
  presented: boolean;
  closing: boolean;
  reduceMotion: boolean;
  /** Opt-in viewport sizing by UIKit, for taller scrollable forms. */
  boundedViewport?: boolean;
  topInset?: number;
  onClosed: () => void;
};

/** Non-iOS fallback; native coordination is opt-in in AppSheet. */
export function KeyboardSheetMotion({ children, style }: KeyboardSheetMotionProps) {
  return <View style={style}>{children}</View>;
}
