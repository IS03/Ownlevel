import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppSheet, AppText, Button, Heading, TextField, brandTokens, spacing, useAppSheetDismiss, useOwnlevelTheme } from '@/design-system';
import type { DayWriteController, DayWriteState } from './day-write-controller';
import { amount, displayNutritionDate } from './day-format';
import { NutritionGlassButton } from './day-controls';

export function DayContextEditor({ controller, state }: { controller: DayWriteController; state: DayWriteState }) {
  const { colors } = useOwnlevelTheme(), insets = useSafeAreaInsets();
  const running = state.phase === 'pending' || state.phase === 'confirmed' && state.message === null;
  const beforeDismiss = (proceed: () => void) => {
    if (!state.intent && controller.dirty()) Alert.alert('¿Descartar cambios?', 'Tu borrador no se guardará.', [
      { text: 'Seguir editando', style: 'cancel' }, { text: 'Descartar', style: 'destructive', onPress: proceed },
    ]); else proceed();
  };
  return <AppSheet onClose={() => controller.close()} closeLabel="Cerrar ajustes de la fecha" locked={running} beforeDismiss={beforeDismiss}
    nativeKeyboard={Platform.OS === 'ios'} keyboardViewport keyboardTopInset={insets.top + spacing.md} dismissKeyboardOnClose
    style={{ backgroundColor: colors.background, maxHeight: '100%', flexShrink: 1 }} testID="nutrition-context-sheet">
    <ContextForm controller={controller} state={state} running={running} />
  </AppSheet>;
}
function ContextForm({ controller, state, running }: { controller: DayWriteController; state: DayWriteState; running: boolean }) {
  const { colors } = useOwnlevelTheme(), insets = useSafeAreaInsets(), dismiss = useAppSheetDismiss(), d = state.draft!;
  const { fontScale } = useWindowDimensions();
  const c = d.baseline.nutrition.status === 'ok' && d.baseline.nutrition.data.dayState === 'recorded' ? d.baseline.nutrition.data.context : null;
  const truth = state.truth?.nutrition.status === 'ok' && state.truth.nutrition.data.dayState === 'recorded' ? state.truth.nutrition.data.context : null;
  const editable = state.phase === 'idle' && !state.intent;
  return <KeyboardAvoidingView enabled={Platform.OS === 'android'} behavior="height" style={styles.shrink}>
    <View style={styles.header}><Heading level={2} style={styles.title}>Ajustes del día</Heading><NutritionGlassButton icon="close" label="Cancelar" onPress={running ? undefined : () => dismiss()} /></View>
    <ScrollView testID="nutrition-day-write-editor" style={styles.shrink} contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.md }]} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive">
      <AppText numeric>{displayNutritionDate(d.baseline.date)}</AppText>
      <AppText muted>Solo cambia esta fecha. Tu plan general no se modifica.</AppText>
      {c ? (['target', 'expenditure'] as const).map(field => {
        const target = field === 'target', title = target ? 'Objetivo de calorías' : 'Gasto estimado';
        return <View key={field} style={[styles.section, { borderColor: colors.border }]}>
          <AppText variant="headline" accessibilityRole="header">{title}</AppText>
          <View style={{ flexDirection: fontScale > 1.3 ? 'column' : 'row', flexWrap: 'wrap', gap: spacing.xs }}>
            <AppText numeric muted variant="subheadline">Guardado: {amount(target ? c.calorieTarget : c.expenditureKcal, 'kcal')}</AppText>
            <AppText numeric muted variant="subheadline">Automático: {amount(target ? c.targetAutomaticKcal : c.expenditureAutomaticKcal, 'kcal')}</AppText>
          </View>
          <TextField label={`${title} (kcal)`} value={d[field]} onChangeText={value => controller.changeContext(field, value)} disabled={!editable} keyboardType="number-pad" placeholder="Automático" numeric error={state.errors[field]} />
          <AppText muted variant="footnote">{d[field].trim() ? 'Ajuste manual para esta fecha' : 'Se usará el valor automático'}</AppText>
          <Button variant="quiet" label={target ? 'Usar objetivo automático' : 'Usar gasto automático'} disabled={!editable || !d[field].trim()} onPress={() => controller.changeContext(field, '')} />
        </View>;
      }) : <AppText accessibilityRole="alert">No hay una lectura confirmada del contexto. Conservamos el borrador.</AppText>}
      {state.errors.form ? <AppText accessibilityRole="alert" style={{ color: colors.danger }}>{state.errors.form}</AppText> : null}
      {state.message ? <AppText accessibilityRole="alert">{state.message}</AppText> : null}
      {state.phase === 'conflict' ? <View style={styles.section}>
        <AppText variant="headline" accessibilityRole="header">Valores actuales de esa fecha</AppText>
        {truth ? <><AppText numeric>Objetivo: {amount(truth.calorieTarget, 'kcal')}</AppText><AppText numeric>Gasto estimado: {amount(truth.expenditureKcal, 'kcal')}</AppText></> : <AppText>No pudimos leer los valores actuales. Tu borrador sigue intacto.</AppText>}
        <Button label="Actualizar versión del servidor" variant="secondary" onPress={() => void controller.refreshConflict()} />
        {truth ? <Button label="Revisar mi borrador sobre esta versión" variant="secondary" onPress={() => controller.reviewWithServerVersion()} /> : null}
      </View> : null}
      {editable ? <Button label="Guardar cambios" disabled={!c || !controller.dirty()} onPress={() => void controller.save()} /> : null}
      {running ? <Button disabled label={state.phase === 'confirmed' ? 'Actualizando fecha…' : 'Guardando…'} onPress={() => {}} /> : null}
      {!running && ['uncertain', 'confirmed', 'blocked'].includes(state.phase) ? <Button label={state.intent?.receipt ? 'Actualizar fecha confirmada' : 'Comprobar intento guardado'} onPress={() => void controller.recover()} /> : null}
      {state.intent && !running ? <Button variant="quiet" label="Volver al día · conservar intento" onPress={() => dismiss()} /> : null}
    </ScrollView>
  </KeyboardAvoidingView>;
}
const styles = StyleSheet.create({ shrink: { flexShrink: 1 }, header: { paddingHorizontal: brandTokens.layout.screenPadding, paddingVertical: spacing.xs, flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, title: { flex: 1 }, content: { padding: brandTokens.layout.screenPadding, gap: spacing.md }, section: { gap: spacing.sm, paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth } });
