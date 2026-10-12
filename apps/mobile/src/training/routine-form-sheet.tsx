import { KeyboardAvoidingView, Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { radius, useOwnlevelTheme } from '@/design-system';
import type { RoutineFormSheetProps } from './routine-form-sheet.types';

/** RN fallback: content-height sheet, keyboard avoidance and a solid brand surface. */
export function RoutineFormSheet({ children, onClose, open, pending }: RoutineFormSheetProps) {
  const { colors } = useOwnlevelTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal animationType="fade" onRequestClose={() => { if (!pending) onClose(); }} statusBarTranslucent transparent visible={open}>
      <KeyboardAvoidingView behavior="height" style={styles.fill}>
        <Pressable accessibilityLabel="Cerrar nueva rutina" accessibilityRole="button" disabled={pending} onPress={onClose} style={[StyleSheet.absoluteFill, styles.scrim]} />
        <View style={[styles.sheet, { backgroundColor: colors.background, paddingBottom: insets.bottom }]}>{children}</View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, justifyContent: 'flex-end' },
  scrim: { backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: { borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet, maxHeight: '100%' },
});
