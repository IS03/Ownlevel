import { useRef, useState } from 'react';
import { Alert, Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, TextInput, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenStack, ScreenStackItem } from 'react-native-screens';
import { AppIcon, AppText, radius, sizes, spacing, useOwnlevelTheme, brandTokens } from '@/design-system';

export function SessionNoteSheet({ name, value, editable, onSave, onClose }: {
  name: string; value: string; editable: boolean; onSave: (notes: string) => Promise<boolean>; onClose: () => void;
}) {
  const { colors } = useOwnlevelTheme(), { height } = useWindowDimensions();
  const [initial] = useState(value), [text, setText] = useState(value);
  const [saving, setSaving] = useState(false), [error, setError] = useState<string | null>(null);
  const [hostReady, setHostReady] = useState(false);
  const [inputHeight, setInputHeight] = useState(144);
  const input = useRef<TextInput>(null), saveFlight = useRef(false);
  const changed = text !== initial;
  const close = () => { Keyboard.dismiss(); onClose(); };
  const requestClose = () => {
    if (saveFlight.current) return;
    if (!changed) { close(); return; }
    Alert.alert(error ? '¿Cerrar la nota?' : '¿Cerrar sin guardar?', error
      ? 'La nota pendiente se conservará en el ejercicio para revisar su guardado.' : 'Se perderán los cambios de esta nota que todavía no guardaste.', [
      { text: 'Seguir editando', style: 'cancel' }, { text: error ? 'Cerrar' : 'Descartar', style: 'destructive', onPress: close },
    ]);
  };
  const save = async () => {
    if (!editable || !changed || saveFlight.current) return;
    saveFlight.current = true; setSaving(true); setError(null);
    try {
      if (await onSave(text)) { close(); return; }
      setError('No pudimos confirmar el guardado. La nota se conserva; revisá los cambios del ejercicio.');
    } catch { setError('No pudimos confirmar el guardado. Conservamos tu nota.'); }
    finally { saveFlight.current = false; setSaving(false); }
  };
  const body = <SafeAreaView edges={['bottom']} style={[styles.sheet, { backgroundColor: colors.background }]}>
    {/* Header is outside keyboard avoidance/scrolling: Guardar never moves below the keyboard. */}
    <View testID="note-sheet-header" style={[styles.header, { borderBottomColor: colors.border }]}>
      <Pressable accessibilityRole="button" accessibilityLabel="Cerrar Nota del ejercicio" disabled={saving} onPress={requestClose} style={styles.close}>
        <AppIcon name="close" color={colors.textMuted} size={20} />
      </Pressable>
      <AppText accessibilityRole="header" variant="label" style={styles.title}>Nota del ejercicio</AppText>
      <Pressable accessibilityRole="button" accessibilityLabel="Guardar nota" accessibilityState={{ disabled: !editable || !changed || saving }}
        disabled={!editable || !changed || saving} onPress={() => void save()} style={styles.save}>
        <AppText variant="label" style={{ color: colors.primary, opacity: !editable || !changed || saving ? 0.4 : 1 }}>Guardar</AppText>
      </Pressable>
    </View>
    <KeyboardAvoidingView testID="note-keyboard-body" style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.body}>
        <AppText muted variant="caption">{name}</AppText>
        <TextInput ref={input} accessibilityLabel={`Nota de ${name}`} editable={editable && !saving} multiline value={text} onChangeText={setText}
          onContentSizeChange={event => setInputHeight(Math.max(144, Math.min(220, event.nativeEvent.contentSize.height)))}
          placeholder="Algo para recordar…" placeholderTextColor={colors.textMuted}
          style={[styles.input, { height: inputHeight, backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]} />
        {error ? <AppText accessibilityRole="alert" variant="caption" style={{ color: colors.danger }}>{error}</AppText> : null}
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
  if (Platform.OS === 'ios') return <Modal visible transparent presentationStyle="overFullScreen" animationType="none" onRequestClose={requestClose}
    onShow={() => setHostReady(true)}>
    {/* Stable RNScreens formSheet is already compiled into the app. The transparent
        RN host only supplies a full-window presenter; no router/focus handoff. */}
    {hostReady ? <ScreenStack style={styles.flex}>
      <ScreenStackItem screenId="note-presenter" activityState={2} headerConfig={{ hidden: true }} style={{ backgroundColor: 'transparent' }}><View /></ScreenStackItem>
      <ScreenStackItem screenId="exercise-note" activityState={2} stackPresentation="formSheet" headerConfig={{ hidden: true }}
        contentStyle={{ height: height * 0.75 }}
        sheetAllowedDetents={[0.75]} sheetInitialDetentIndex={0} sheetLargestUndimmedDetentIndex="none" sheetGrabberVisible sheetCornerRadius={24}
        preventNativeDismiss={changed || saving} onNativeDismissCancelled={requestClose} onDismissed={close} onAppear={() => input.current?.focus()}
        style={{ backgroundColor: colors.background }}>{body}</ScreenStackItem>
    </ScreenStack> : null}
  </Modal>;
  return <Modal visible transparent animationType="slide" onRequestClose={requestClose} onShow={() => input.current?.focus()}>
    <View style={styles.backdrop}><Pressable accessibilityLabel="Cerrar nota" style={StyleSheet.absoluteFill} onPress={requestClose} />
      <View style={[styles.fallback, { height: height * 0.75 }]}>{body}</View>
    </View>
  </Modal>;
}
const styles = StyleSheet.create({
  flex: { flex: 1 }, sheet: { flex: 1, paddingTop: spacing.lg }, header: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, paddingHorizontal: spacing.sm },
  close: { minWidth: 72, minHeight: sizes.touchTarget, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, textAlign: 'center' }, save: { minWidth: 72, minHeight: sizes.touchTarget, alignItems: 'center', justifyContent: 'center' },
  body: { padding: spacing.lg, gap: spacing.md }, input: { minHeight: 144, maxHeight: 220, borderWidth: 1, borderRadius: radius.md, padding: spacing.md, fontSize: brandTokens.typeScale.body.fontSize, textAlignVertical: 'top' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }, fallback: { borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet, overflow: 'hidden' },
});
