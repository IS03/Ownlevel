import { ManualMealEntry } from './manual-meal-entry';
import { Alert, KeyboardAvoidingView, Modal, Platform, StyleSheet, TextInput, View } from 'react-native';
import { AppText, Button, Heading, ScrollScreen, Surface, spacing, useOwnlevelTheme } from '@/design-system';
import { displayNutritionDate } from './day-format';
import type { MealDraft } from './meal-form-model';
import type { MealController, MealEditorState } from './meal-controller';

const labels: Partial<Record<keyof MealDraft, string>> = { date: 'Fecha DD/MM/AAAA', title: 'Título', description: 'Descripción',
  calories: 'Calorías', proteinG: 'Proteína (g)', carbsG: 'Carbohidratos (g)', fatG: 'Grasas (g)' };
function ExistingMealEditor({ controller, state }: { controller: MealController; state: MealEditorState }) {
  const { colors } = useOwnlevelTheme();
  const e = state.editor;
  if (!e) return null;
  const locked = !!state.intent || ['pending','loading','blocked','confirmed'].includes(state.phase);
  const running = state.phase === 'pending' || state.phase === 'loading';
  const close = () => {
    if (running) return;
    if (state.intent) { controller.close(); return; }
    if (controller.dirty()) Alert.alert('¿Descartar cambios?', 'Tu borrador no se guardará.', [
      { text: 'Seguir editando', style: 'cancel' }, { text: 'Descartar', style: 'destructive', onPress: () => controller.close() },
    ]);
    else controller.close();
  };
  const confirmDelete = () => Alert.alert('¿Eliminar esta comida?', 'Dejará de contar en el día y desaparecerá de la lista.', [
    { text: 'Cancelar', style: 'cancel' }, { text: 'Eliminar', style: 'destructive', onPress: () => void controller.save(false, true) },
  ]);
  return <Modal animationType="slide" onRequestClose={close} presentationStyle="fullScreen" visible>
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.screen}>
      <ScrollScreen safeAreaEdges={['top','left','right','bottom']} testID="manual-meal-editor">
        <Heading level={2}>{e.mealId ? 'Editar comida' : 'Agregar comida'}</Heading>
        <AppText muted>Calorías enteras, mayores a cero. Macros opcionales: vacío significa sin dato; cero se conserva. Podés usar coma o punto.</AppText>
        {Object.entries(labels).map(([key, label]) => {
          const field = key as Exclude<keyof MealDraft, 'saveToLibrary' | 'mealLabel'>, error = state.errors[field];
          return <View key={field} style={styles.field}>
            <AppText variant="label">{label}</AppText>
            <TextInput accessibilityLabel={label} autoCorrect={field === 'description'} editable={!locked}
              keyboardType={field === 'date' ? 'numbers-and-punctuation' : ['title','description'].includes(field) ? 'default' : 'decimal-pad'}
              multiline={field === 'description'} onChangeText={value => controller.change(field, value)}
              placeholder={field === 'date' ? 'DD/MM/AAAA' : field === 'calories' ? 'Obligatorio' : 'Opcional'}
              placeholderTextColor={colors.textMuted} style={[styles.input, { color: colors.text, borderColor: error ? colors.danger : colors.border }]}
              value={e.draft[field]} />
            {error ? <AppText accessibilityRole="alert" style={{ color: colors.danger }}>{error}</AppText> : null}
          </View>;
        })}
        {state.message ? <AppText accessibilityRole="alert" selectable>{state.message}</AppText> : null}
        {state.phase === 'duplicate' ? <Surface><AppText>Hay una posible comida duplicada. Podés cancelar o confirmarlo.</AppText>
          <Button label="Guardar igual" onPress={() => void controller.save(true)} /></Surface> : null}
        {state.phase === 'conflict' ? <Surface>
          <Heading level={2}>Revisar cambios</Heading>
          {state.truth ? <>
            <AppText selectable>{`Versión del servidor · ${displayNutritionDate(state.truthDate!)}`}</AppText>
            <AppText selectable>{state.truth.title || state.truth.description || 'Comida'}</AppText>
            {state.truth.title && state.truth.description ? <AppText selectable>{state.truth.description}</AppText> : null}
            <AppText selectable>{`Calorías ${state.truth.calories ?? 'sin dato'} · P ${state.truth.proteinG ?? 'sin dato'} · C ${state.truth.carbsG ?? 'sin dato'} · G ${state.truth.fatG ?? 'sin dato'}`}</AppText>
            <Button label="Revisar mi borrador sobre esta versión" onPress={() => controller.reviewWithServerVersion()} variant="secondary" />
          </> : <AppText>No hay una versión editable confirmada. Tu borrador sigue intacto.</AppText>}
          {state.truthDate ? <Button label="Actualizar versión del servidor" onPress={() => void controller.refreshConflict()} variant="secondary" /> : null}
        </Surface> : null}
        {['uncertain','blocked','confirmed'].includes(state.phase) ? <Button label={state.intent?.receipt ? 'Actualizar días confirmados' : 'Comprobar intento guardado'} onPress={() => void controller.recover()} /> : null}
        {['idle','duplicate'].includes(state.phase) ? <Button label="Guardar comida" disabled={locked} onPress={() => void controller.save()} /> : null}
        {state.phase === 'pending' ? <Button disabled label="Procesando…" onPress={() => {}} /> : null}
        {e.mealId && state.phase === 'idle' ? <Button label="Eliminar comida" disabled={locked} onPress={confirmDelete} variant="quiet" /> : null}
        <Button label={state.intent ? 'Volver al día · conservar intento' : 'Cancelar'} disabled={running} onPress={close} variant="quiet" />
      </ScrollScreen>
    </KeyboardAvoidingView>
  </Modal>;
}
const styles = StyleSheet.create({ screen: { flex: 1 }, field: { gap: spacing.xs },
  input: { minHeight: 48, borderWidth: 1, borderRadius: 12, padding: spacing.md, fontSize: 17 } });

export function MealEditor(props: { controller: MealController; state: MealEditorState }) {
  return props.state.editor && !props.state.editor.mealId ? <ManualMealEntry {...props} /> : <ExistingMealEditor {...props} />;
}
