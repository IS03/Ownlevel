import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppText, Button, Heading, spacing, useOwnlevelTheme, brandTokens } from '@/design-system';
import { inputNutritionDate, parseInputNutritionDate } from './day-format';

export function NutritionDateSelector({ date, onClose, onSelect }: {
  date: string; onClose: () => void; onSelect: (date: string) => void;
}) {
  const { colors } = useOwnlevelTheme();
  const [input, setInput] = useState(inputNutritionDate(date));
  const [error, setError] = useState(false);
  const select = () => {
    const selected = parseInputNutritionDate(input);
    if (!selected) { setError(true); return; }
    onSelect(selected);
    onClose();
  };
  return (
    <Modal animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet" visible>
      <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.screen}>
          <View style={styles.form}>
            <Heading level={2}>Elegir fecha</Heading>
            <AppText muted>Usá el formato DD/MM/AAAA.</AppText>
            <TextInput accessibilityLabel="Fecha DD/MM/AAAA" autoFocus autoCorrect={false}
              keyboardType="numbers-and-punctuation" maxLength={10} onChangeText={value => { setInput(value); setError(false); }}
              onSubmitEditing={select} placeholder="DD/MM/AAAA" placeholderTextColor={colors.textMuted}
              returnKeyType="done" style={[styles.input, { color: colors.text, borderColor: error ? colors.danger : colors.border }]}
              value={input} />
            {error ? <AppText accessibilityRole="alert" style={{ color: colors.danger }}>Ingresá una fecha válida.</AppText> : null}
            <Button label="Consultar fecha" onPress={select} />
            <Button label="Cancelar" onPress={onClose} variant="quiet" />
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1 }, form: { padding: spacing.xl, gap: spacing.lg },
  input: { minHeight: 48, borderWidth: 1, borderRadius: 12, paddingHorizontal: spacing.lg, fontSize: brandTokens.typeScale.body.fontSize },
});
