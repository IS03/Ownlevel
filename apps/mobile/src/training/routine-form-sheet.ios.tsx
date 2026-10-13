import { cloneElement, useState } from 'react';
import { useWindowDimensions } from 'react-native';
import { BottomSheet, Group, Host, RNHostView } from '@expo/ui/swift-ui';
import { frame, onGeometryChange, interactiveDismissDisabled, presentationBackground, presentationCornerRadius, presentationDragIndicator } from '@expo/ui/swift-ui/modifiers';
import { radius, useOwnlevelTheme } from '@/design-system';
import type { RoutineFormSheetProps } from './routine-form-sheet.types';

/** The sheet measures its hosted RN content. SwiftUI keeps it above the keyboard. */
export function RoutineFormSheet({ children, onClose, open, pending }: RoutineFormSheetProps) {
  const { colors, isDark } = useOwnlevelTheme();
  const { width: windowWidth } = useWindowDimensions();
  const [sheetWidth, setSheetWidth] = useState<number | null>(null);
  const content = cloneElement(children, { style: [children.props.style, { width: sheetWidth ?? windowWidth }] });
  return (
    <Host colorScheme={isDark ? 'dark' : 'light'} style={{ height: 0, position: 'absolute', width: 0 }}>
      <BottomSheet fitToContents isPresented={open} onIsPresentedChange={presented => { if (!presented && !pending) onClose(); }}>
        <Group modifiers={[frame({ maxWidth: Infinity, alignment: 'center' }), onGeometryChange(({ width }) => { if (width > 0) setSheetWidth(previous => previous === width ? previous : width); }), presentationBackground(colors.background), presentationCornerRadius(radius.sheet), presentationDragIndicator('visible'), interactiveDismissDisabled(pending)]}>
          <RNHostView matchContents>{content}</RNHostView>
        </Group>
      </BottomSheet>
    </Host>
  );
}
