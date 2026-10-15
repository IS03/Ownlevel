import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Switch, TextInput, View } from 'react-native';
import { AppText, Button, Surface, useOwnlevelTheme } from '@/design-system';
import type { MealController, MealEditorState } from './meal-controller';
import { validateMealDraft } from './meal-form-model';
import { MealSheet, mealShown, mealSheetStyles as shared } from './meal-sheet';
import { MealTiming } from './meal-timing';
import { MealDateControl } from './meal-date-control';
import { inputNutritionDate, parseInputNutritionDate } from './day-format';
export function ManualMealEntry({ controller, state }: { controller: MealController; state: MealEditorState }) {
  const { colors } = useOwnlevelTheme();
  const [note, setNote] = useState(false);
  const editor = state.editor;
  useEffect(() => {
    if (state.phase === 'duplicate') Alert.alert('¿Lo cargaste dos veces?', 'Ya hay una comida reciente con los mismos datos. Si es otra, agregala igual.', [
      { text: 'Cancelar', style: 'cancel', onPress: () => controller.cancelDuplicate() },
      { text: 'Agregar igual', onPress: () => void controller.save(true) },
    ], { cancelable: false });
  }, [controller, state.phase]);
  if (!editor) return null;
  const draft = editor.draft, date = parseInputNutritionDate(draft.date) ?? editor.sourceDate;
  const locked = !!state.intent || state.phase !== 'idle', running = state.phase === 'pending';
  const parsed = validateMealDraft(draft);
  const editing = !!editor.mealId; // D3: editing reuses this screen with the meal's values.
  const confirmDelete = () => Alert.alert('¿Eliminar esta comida?', 'Deja de contar en el día y desaparece de la lista.', [
    { text: 'Cancelar', style: 'cancel' }, { text: 'Eliminar', style: 'destructive', onPress: () => void controller.save(false, true) },
  ]);
  const close = () => {
    if (running) return;
    if (state.intent || !controller.dirty()) controller.close();
    else Alert.alert('¿Descartar cambios?', 'Tu borrador no se guardará.', [{ text: 'Seguir editando', style: 'cancel' }, { text: 'Descartar', style: 'destructive', onPress: () => controller.close() }]);
  };
  const input = (key: 'title' | 'description' | 'calories' | 'proteinG' | 'carbsG' | 'fatG', label: string, big = false) => <TextInput accessibilityLabel={label} placeholder={key === 'title' ? '¿Qué comiste? (opcional)' : key === 'description' ? 'Detalle (opcional)' : big ? '0' : '—'} placeholderTextColor={colors.textMuted}
    value={draft[key]} editable={!locked} keyboardType={['title', 'description'].includes(key) ? 'default' : key === 'calories' ? 'number-pad' : 'decimal-pad'} selectTextOnFocus={!['title', 'description'].includes(key)}
    onChangeText={value => controller.change(key, value)} style={[big ? shared.number : shared.input, { color: colors.text }, !big && { backgroundColor: colors.surface }]} />;
  return <MealSheet title={editing ? 'Editar comida' : 'Cargar a mano'} subtitle={new Intl.DateTimeFormat('es-AR', { timeZone: 'UTC', weekday: 'long', day: 'numeric' }).format(new Date(`${date}T12:00:00Z`))} onClose={close} running={running} testID="manual-meal-editor" right={<MealDateControl date={date} disabled={locked} onChange={next => { controller.change('date', inputNutritionDate(next)); if (draft.consumedAt) controller.timing(draft.mealLabel ?? null, `${next}T${new Date(Date.parse(draft.consumedAt) - 10800000).toISOString().slice(11,16)}:00-03:00`); }} />}>
    {input('title', 'Título')}
    <View style={{ alignItems: 'center', gap: 4 }}><View style={styles.calories}>{input('calories', 'Calorías', true)}<AppText muted variant="title2">kcal</AppText></View><AppText muted variant="caption">Calorías · obligatorio</AppText></View>
    <View style={styles.macros}>{(['proteinG', 'carbsG', 'fatG'] as const).map((key, i) => <View key={key} style={[styles.macro, { backgroundColor: colors.surface }]}><AppText muted variant="caption">{['Proteína', 'Carbos', 'Grasas'][i]}</AppText>{input(key, ['Proteína (g)', 'Carbohidratos (g)', 'Grasas (g)'][i])}</View>)}</View>
    {note || draft.description ? input('description', 'Descripción') : <Button label="Agregar detalle opcional" variant="quiet" disabled={locked} onPress={() => setNote(true)} />}
    <MealTiming date={date} value={draft} disabled={locked} onChange={(label, time) => controller.timing(label, time)} />
    {editing ? null : <View style={shared.row}><View style={shared.text}><AppText>Guardar en mis comidas</AppText><AppText muted variant="caption">Para cargarla con un toque la próxima</AppText></View><Switch accessibilityLabel="Guardar en mis comidas" disabled={locked} value={draft.saveToLibrary ?? false} onValueChange={value => controller.saveToLibrary(value)} trackColor={{ true: colors.primary, false: colors.border }} /></View>}
    {Object.entries(state.errors).map(([key, message]) => <AppText key={key} accessibilityRole="alert">{message}</AppText>)}
    {state.message ? <AppText accessibilityRole="alert">{state.message}</AppText> : null}
    {state.phase === 'conflict' && !editing ? <Surface><AppText>Conservamos tu borrador. Revisá los datos antes de volver a agregar.</AppText><Button label="Revisar borrador" onPress={() => controller.reviseCreate()} /></Surface> : null}
    {/* Edited elsewhere meanwhile: never overwrite silently. Show the server's version and let the user re-apply. */}
    {state.phase === 'conflict' && editing ? <Surface style={{ gap: 8 }}><AppText variant="headline">La comida cambió</AppText>
      {state.truth ? <><AppText muted numeric>{`Ahora: ${state.truth.title || state.truth.description || 'Comida'} · ${state.truth.calories ?? 'sin dato'} kcal`}</AppText>
        <Button label="Revisar mis cambios sobre esta versión" variant="secondary" onPress={() => controller.reviewWithServerVersion()} /></>
        : <AppText muted>Ya no está disponible para editar. Tu borrador sigue acá.</AppText>}
      {state.truthDate ? <Button label="Actualizar" variant="quiet" onPress={() => void controller.refreshConflict()} /> : null}
    </Surface> : null}
    {editing && state.phase === 'idle' && !state.intent ? <Pressable accessibilityRole="button" disabled={locked} onPress={confirmDelete} style={{ minHeight: 44, alignItems: 'center', justifyContent: 'center' }}><AppText variant="headline" style={{ color: colors.danger }}>Eliminar comida</AppText></Pressable> : null}
    {['uncertain', 'confirmed', 'blocked'].includes(state.phase) ? <Button label={state.intent?.receipt ? 'Actualizar días confirmados' : 'Comprobar intento guardado'} onPress={() => void controller.recover()} /> : null}
    <View style={shared.footer}><Button disabled={locked || !parsed.fields || (editing && !controller.dirty())} label={running ? 'Guardando…' : editing ? 'Guardar cambios' : `Agregar al día${parsed.fields ? ` · ${mealShown(parsed.fields.calories)} kcal` : ''}`} onPress={() => void controller.save()} />{state.intent ? <Button label="Volver al día · conservar intento" onPress={close} disabled={running} variant="quiet" /> : null}</View>
  </MealSheet>;
}
const styles = StyleSheet.create({ calories: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center' }, macros: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' }, macro: { flex: 1, minWidth: 90, borderRadius: 12, padding: 8 } });
