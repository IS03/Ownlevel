import { BottomSheet, Group, Host, RNHostView } from '@expo/ui/swift-ui';
import { frame, interactiveDismissDisabled, presentationBackground, presentationCornerRadius, presentationDetents, presentationDragIndicator } from '@expo/ui/swift-ui/modifiers';
import { radius, useOwnlevelTheme } from '@/design-system';
import type { RoutineEditorSheetProps } from './routine-editor-sheet.types';

/** Full native detent. A dirty draft is dismissed only through the explicit discard decision. */
export function RoutineEditorSheet({ children, open, pending, dirty, onClose, onDismissed }: RoutineEditorSheetProps) {
  const { colors, isDark } = useOwnlevelTheme();
  return <Host colorScheme={isDark ? 'dark' : 'light'} style={{ height: 0, width: 0, position: 'absolute' }}>
    <BottomSheet onDismiss={onDismissed} isPresented={open} onIsPresentedChange={value => { if (!value && !pending && !dirty) onClose(); }}>
      <Group modifiers={[frame({ maxWidth: Infinity, maxHeight: Infinity }), presentationDetents(['large']), presentationDragIndicator('visible'),
        presentationBackground(colors.background), presentationCornerRadius(radius.sheet), interactiveDismissDisabled(pending || Boolean(dirty))]}>
        <RNHostView>{children}</RNHostView>
      </Group>
    </BottomSheet>
  </Host>;
}
