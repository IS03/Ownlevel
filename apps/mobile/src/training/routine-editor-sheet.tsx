import { useEffect, useLayoutEffect, useRef } from 'react';
import { KeyboardAvoidingView, Modal, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { radius, useOwnlevelTheme, useReduceMotion } from '@/design-system';
import type { RoutineEditorSheetProps } from './routine-editor-sheet.types';
export function RoutineEditorSheet({ children, open, pending, onClose, onDismissed }: RoutineEditorSheetProps) {
  const dismiss = useRef(onDismissed); useLayoutEffect(() => { dismiss.current = onDismissed; });
  useEffect(() => { if (!open) dismiss.current?.(); }, [open]);
  const { colors } = useOwnlevelTheme(), reduceMotion = useReduceMotion();
  return <Modal animationType={reduceMotion ? 'fade' : 'slide'} presentationStyle="pageSheet" visible={open} onRequestClose={() => { if (!pending) onClose(); }}>
    <SafeAreaView edges={['top', 'bottom']} style={[styles.root, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView behavior="height" style={styles.root}><View style={styles.root}>{children}</View></KeyboardAvoidingView>
    </SafeAreaView>
  </Modal>;
}
const styles = StyleSheet.create({ root: { flex: 1, borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet } });
