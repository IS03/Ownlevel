import { useRef, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Modal, Platform, StyleSheet, TextInput, View } from 'react-native';
import { AppText, brandTokens, useOwnlevelTheme } from '@/design-system';
import { RoutineSheetButton } from './routine-sheet-button';

/** A local editor: X discards this edit; check only updates the existing summary draft. */
export function FinishNoteSheet({ value, onSave, onClose }: { value: string; onSave: (value: string) => void; onClose: () => void }) {
  const { colors } = useOwnlevelTheme();
  const [text, setText] = useState(value);
  const input = useRef<TextInput>(null);
  const close = () => { Keyboard.dismiss(); onClose(); };
  return <Modal visible transparent animationType="fade" presentationStyle="overFullScreen" onRequestClose={close} onShow={() => input.current?.focus()}>
    <View style={styles.root}>
    {/* The sheet's own background pads under the keyboard: its rounded top corners sit on the sheet, not on the dimmed backdrop. */}
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={[styles.keyboard, { backgroundColor: colors.background }]} testID="finish-note-keyboard">
      <View style={styles.sheet} testID="finish-note-sheet">
        <View style={styles.header}>
          <RoutineSheetButton label="Descartar edición de la nota" icon="close" onPress={close} />
          <AppText accessibilityRole="header" variant="headline">Nota</AppText>
          <RoutineSheetButton label="Guardar nota" icon="check" accent onPress={() => { onSave(text); close(); }} />
        </View>
        <TextInput ref={input} autoFocus multiline accessibilityLabel="Nota del entrenamiento" value={text} onChangeText={setText}
          placeholder="Cómo te sentiste, algo para la próxima…" placeholderTextColor={colors.textMuted} scrollEnabled
          style={[styles.input, { backgroundColor: colors.surface, color: colors.text }]} testID="finish-note-input" />
        {/* The session contract has no character cap. Do not import the exercise-note limit or truncate existing text. */}
        <AppText muted numeric variant="caption">{text.length} caracteres</AppText>
      </View>
    </KeyboardAvoidingView>
    </View>
  </Modal>;
}
const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end', backgroundColor: `${brandTokens.palette.dark.bg}66` },
  keyboard: { borderTopLeftRadius: brandTokens.radius.sheet, borderTopRightRadius: brandTokens.radius.sheet },
  sheet: { padding: brandTokens.space.md, gap: brandTokens.space.sm },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  input: { ...brandTokens.typeScale.body, minHeight: 120, maxHeight: 220, padding: brandTokens.space.sm, borderRadius: brandTokens.radius.input, textAlignVertical: 'top' },
});
