import { useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import {
  AppSheet,
  AppText,
  Button,
  Heading,
  TextField,
  brandTokens,
  sizes,
  spacing,
  useAppSheetDismiss,
  useOwnlevelTheme,
} from '@/design-system';
import { SettingsSegmented } from '@/settings/native-segmented';
import { EditorialExpansion, EditorialMove } from '@/settings/editorial';
import { SaveButton } from '@/nutrition/save-button';
import { NutritionGlassButton } from '@/nutrition/day-controls';
import { homeMetricIcon } from '@/home/home-metric-icons';
import { RegisterCircle, useRegisterGlass } from '@/home/home-register';
import { MetricDuration } from '@/nutrition/metric-duration';
import { MetricIconPicker } from './metric-icon-picker';
import type {
  DefinitionsController,
  DefinitionsState,
} from './definitions-controller';
import type { DefinitionEditor } from './definitions-storage';
import { VALUE_TYPE_LABELS, quickAmount } from './definitions-model';
import { metricInputValue } from '@/nutrition/day-write-model';
type Props = {
  editor: DefinitionEditor;
  state: DefinitionsState;
  controller: DefinitionsController;
  onClosed?: () => void;
};
export function DefinitionEditorSheet(props: Props) {
  const { colors } = useOwnlevelTheme();
  const beforeDismiss = (proceed: () => void) => {
    if (!props.controller.dirty()) {
      proceed();
      return;
    }
    Alert.alert('¿Descartar cambios?', 'Todavía no guardaste esta métrica.', [
      { text: 'Seguir editando', style: 'cancel' },
      { text: 'Descartar', style: 'destructive', onPress: proceed },
    ]);
  };
  return (
    <AppSheet
      dismissKeyboardOnClose
      closeLabel="Cerrar edición de métrica"
      beforeDismiss={beforeDismiss}
      onClose={() => {
        props.controller.close();
        props.onClosed?.();
      }}
      locked={props.state.phase === 'pending' || !!props.state.intent}
      style={{ backgroundColor: colors.background, maxHeight: '92%' }}
      testID="metric-definition-editor"
    >
      <EditorBody {...props} />
    </AppSheet>
  );
}
function EditorBody({ editor, state, controller }: Props) {
  const dismiss = useAppSheetDismiss(),
    { colors } = useOwnlevelTheme();
  const b = editor.baseline,
    d = editor.draft,
    done = !!state.notice && !state.editor;
  const busy =
    state.phase === 'pending' ||
    (state.phase === 'confirmed' && !state.message);
  const editable = state.phase === 'idle' && !state.intent && !done;
  const quick = metricInputValue(
    { value: d.quickValue, hours: d.quickHours, minutes: d.quickMinutes },
    d.valueType,
  );
  const icon = homeMetricIcon(b?.systemKey ?? null, d.icon);
  const glass = useRegisterGlass();
  const hasQuick = quick != null && quick > 0;
  const quickText = hasQuick ? quickAmount({ valueType: d.valueType, unit: d.unit || null }, quick!) : '';
  const fixedMeaning = !!b && !b.actions.editMeaning;
  // The duration value whose wheel is open under its row (one at a time).
  const [openValue, setOpenValue] = useState<'target' | 'quick' | null>(null);
  // The icon a metric shows when none is chosen (its system icon, else the generic one).
  const fallbackIcon = homeMetricIcon(b?.systemKey ?? null, null);
  useEffect(() => {
    if (done) {
      const t = setTimeout(() => dismiss(), 300);
      return () => clearTimeout(t);
    }
  }, [done, dismiss]);
  const close = () => {
    if (!editable) return;
    dismiss();
  };
  // One direct action instead of a "more" menu: archive (or restore an archived one). A metric with no records can
  // still be deleted from the same confirmation.
  const remove = b?.actions.delete
    ? [{
        text: 'Eliminar métrica',
        style: 'destructive' as const,
        onPress: () =>
          Alert.alert('¿Eliminar esta métrica?', 'No tiene registros. Esto no se puede deshacer.', [
            { text: 'Volver', style: 'cancel' },
            { text: 'Eliminar', style: 'destructive', onPress: () => void controller.remove() },
          ]),
      }]
    : [];
  const archiveAction = !b
    ? null
    : b.actions.archive
      ? { label: 'Archivar métrica', run: () =>
          Alert.alert('¿Archivar esta métrica?', 'Deja de aparecer para cargar valores nuevos. Su historial queda.', [
            { text: 'Volver', style: 'cancel' },
            ...remove,
            { text: 'Archivar', onPress: () => void controller.archive() },
          ]) }
      : b.actions.restore
        ? { label: 'Restaurar métrica', run: () =>
            Alert.alert('¿Restaurar esta métrica?', 'Vuelve a aparecer para cargar valores.', [
              { text: 'Volver', style: 'cancel' },
              ...remove,
              { text: 'Restaurar', onPress: () => void controller.restore() },
            ]) }
        : remove.length
          ? { label: 'Eliminar métrica', run: () => remove[0].onPress() }
          : null;
  const field = (
    key:
      | 'name'
      | 'unit'
      | 'target'
      | 'hours'
      | 'minutes'
      | 'quickValue'
      | 'quickHours'
      | 'quickMinutes',
    label: string,
    numeric = false,
    disabled = false,
    placeholder?: string,
  ) => (
    <TextField
      label={label}
      value={d[key]}
      disabled={!editable || disabled}
      numeric={numeric}
      keyboardType={
        numeric
          ? d.valueType === 'decimal'
            ? 'decimal-pad'
            : 'number-pad'
          : 'default'
      }
      onChangeText={(v) => controller.change(key, v)}
      error={state.errors[key]}
      placeholder={placeholder}
    />
  );
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flexShrink: 1 }}
    >
      <ScrollView showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.xl }}
      >
        {/* The title is centred on the sheet: the side slots are the same width, with or without the archive action. */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <NutritionGlassButton
            label="Cerrar"
            icon="close"
            onPress={busy || state.intent ? undefined : close}
          />
          <Heading level={2} style={{ flex: 1, textAlign: 'center' }}>{b ? 'Editar métrica' : 'Nueva métrica'}</Heading>
          {archiveAction ? (
            <NutritionGlassButton
              label={archiveAction.label}
              icon={archiveAction.label === 'Eliminar métrica' ? 'trash' : 'archive'}
              onPress={editable ? archiveAction.run : undefined}
            />
          ) : <View style={{ width: sizes.touchTarget }} />}
        </View>
        {/* The real Inicio circle (same component), updated while you fill the form. */}
        <View style={{ alignItems: 'center', gap: spacing.xs }} accessible accessibilityLabel={`Vista previa en Inicio: ${d.name || 'Tu métrica'}${hasQuick ? `, un toque suma ${quickText}` : ''}`}
          testID="metric-definition-preview">
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" pointerEvents="none">
            <RegisterCircle detail="Cargar" done={false} glass={glass} icon={icon} label={d.name || 'Tu métrica'} onPress={() => undefined} quick={hasQuick} width={120} />
          </View>
          <AppText muted variant="caption">{hasQuick ? `Así se ve en Inicio · un toque suma ${quickText}` : 'Así se ve en Inicio'}</AppText>
        </View>
        {field('name', 'Nombre', false, !!b && !b.actions.editName, 'Por ejemplo, Agua')}
        <View style={{ gap: spacing.md }}>
          <AppText variant="headline">Ícono</AppText>
          <MetricIconPicker
            value={d.icon}
            fallback={fallbackIcon}
            disabled={!editable}
            onChange={(next) => controller.change('icon', next)}
          />
        </View>
        <View style={{ gap: spacing.md }}>
          <AppText variant="headline">Se registra como</AppText>
          {fixedMeaning ? (
            // Fixed: said as information, not as a dimmed control that looks broken.
            <View style={[styles.fixed, { backgroundColor: colors.surfaceRaised }]} testID="metric-definition-fixed-type">
              <AppText variant="headline">{d.valueType === 'duration' ? 'Duración · horas y minutos' : `${VALUE_TYPE_LABELS[d.valueType]}${d.unit ? ` · ${d.unit}` : ''}`}</AppText>
              <AppText muted variant="footnote">
                {b?.systemKey ? 'Fijo en las métricas del sistema. Podés elegir su ícono, objetivo y carga rápida.' : 'Fijo porque ya tiene registros, para conservarlos.'}
              </AppText>
            </View>
          ) : (
            <>
              <SettingsSegmented
                accessibilityLabel="Se registra como"
                value={d.valueType}
                disabled={!editable}
                options={Object.entries(VALUE_TYPE_LABELS).map(([value, label]) => ({ value: value as typeof d.valueType, label }))}
                onChange={(v) => controller.change('valueType', v)}
              />
              {d.valueType === 'duration'
                ? <AppText muted variant="footnote">Se carga en horas y minutos.</AppText>
                : field('unit', 'Unidad (opcional)', false, false, 'Por ejemplo, vasos, ml o pasos')}
            </>
          )}
        </View>
        <View style={{ gap: spacing.md }}>
          <AppText variant="headline">Valores</AppText>
          <View style={[styles.values, { backgroundColor: colors.surface }]}>
            <ValueRow title="Objetivo diario" hint="Una referencia: no cambia lo que ya cargaste." empty="Sin objetivo" duration={d.valueType === 'duration'}
              unit={d.unit} text={d.target} hours={d.hours} minutes={d.minutes} decimal={d.valueType === 'decimal'} disabled={!editable}
              open={openValue === 'target'} onToggle={() => setOpenValue(openValue === 'target' ? null : 'target')}
              onText={(v) => controller.change('target', v)} onDuration={(v) => { controller.change('hours', v.hours); controller.change('minutes', v.minutes); }}
              error={state.errors.target ?? state.errors.hours ?? state.errors.minutes} testID="metric-definition-target" />
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <ValueRow title="Carga rápida" hint="Un toque en Inicio suma esto. Mantené apretado para otro valor." empty="Sin carga rápida" duration={d.valueType === 'duration'}
              unit={d.unit} text={d.quickValue} hours={d.quickHours} minutes={d.quickMinutes} decimal={d.valueType === 'decimal'} disabled={!editable}
              open={openValue === 'quick'} onToggle={() => setOpenValue(openValue === 'quick' ? null : 'quick')}
              onText={(v) => controller.change('quickValue', v)} onDuration={(v) => { controller.change('quickHours', v.hours); controller.change('quickMinutes', v.minutes); }}
              error={state.errors.quickValue ?? state.errors.quickHours ?? state.errors.quickMinutes} testID="metric-definition-quick" />
          </View>
        </View>
        {state.errors.form ? (
          <AppText accessibilityLiveRegion="polite">
            {state.errors.form}
          </AppText>
        ) : null}
        {state.message ? (
          <AppText accessibilityLiveRegion="polite">{state.message}</AppText>
        ) : null}
        {state.phase === 'uncertain' ||
        (state.phase === 'confirmed' && !busy) ||
        state.phase === 'blocked' ? (
          <Button
            label="Comprobar cambio"
            onPress={() => void controller.recover()}
          />
        ) : state.phase === 'conflict' ? (
          <Button
            label="Revisar lo que cambió"
            onPress={() => controller.reviewTruth()}
          />
        ) : (
          <SaveButton
            label={b ? 'Guardar' : 'Crear métrica'}
            state={done ? 'done' : busy ? 'saving' : 'idle'}
            disabled={!editable || (!!b && !controller.dirty())}
            onPress={() => void controller.save()}
            testID="metric-definition-save"
          />
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const durationText = (hours: string, minutes: string) => {
  const h = Number(hours || 0), m = Number(minutes || 0);
  return !hours && !minutes ? null : h && m ? `${h} h ${m} min` : h ? `${h} h` : `${m} min`;
};
/**
 * One value of the metric (daily target or quick entry) as a row: what it is on the left, its value on the right. A number
 * is typed in place (with its unit); a duration opens the hours and minutes wheel under the row. Empty reads «Sin …», never «—».
 */
function ValueRow({ title, hint, empty, duration, decimal, unit, text, hours, minutes, disabled, open, onToggle, onText, onDuration, error, testID }: {
  title: string; hint: string; empty: string; duration: boolean; decimal: boolean; unit: string; text: string; hours: string; minutes: string;
  disabled: boolean; open: boolean; onToggle: () => void; onText: (value: string) => void; onDuration: (value: { hours: string; minutes: string }) => void;
  error?: string; testID: string;
}) {
  const { colors } = useOwnlevelTheme();
  const shownDuration = durationText(hours, minutes);
  return (
    <EditorialMove>
      <View style={styles.valueRow} testID={testID}>
        <View style={{ flex: 1, gap: 2 }}>
          <AppText variant="headline">{title}</AppText>
          <AppText muted variant="footnote">{hint}</AppText>
        </View>
        {duration ? (
          <Pressable accessibilityRole="button" accessibilityLabel={`${title}: ${shownDuration ?? empty}`} accessibilityState={{ expanded: open, disabled }}
            disabled={disabled} onPress={onToggle} style={[styles.pill, { backgroundColor: colors.surfaceRaised }]} testID={`${testID}-value`}>
            <AppText numeric variant="subheadline" style={shownDuration ? { fontWeight: '600' } : { color: colors.textMuted }}>{shownDuration ?? empty}</AppText>
          </Pressable>
        ) : (
          <View style={[styles.pill, { backgroundColor: colors.surfaceRaised }]}>
            <TextInput accessibilityLabel={title} value={text} editable={!disabled} onChangeText={onText} placeholder={empty} placeholderTextColor={colors.textMuted}
              keyboardType={decimal ? 'decimal-pad' : 'number-pad'} style={[styles.pillInput, { color: colors.text }]} testID={`${testID}-input`} />
            {text && unit ? <AppText muted variant="subheadline">{unit}</AppText> : null}
          </View>
        )}
      </View>
      {error ? <AppText accessibilityLiveRegion="polite" variant="footnote" style={{ paddingHorizontal: spacing.md, paddingBottom: spacing.sm }}>{error}</AppText> : null}
      {duration && open ? (
        <EditorialExpansion testID={`${testID}-wheel`}>
          <View style={{ paddingHorizontal: spacing.md, gap: spacing.md }}>
            <MetricDuration value={{ value: '', hours: hours || '0', minutes: minutes || '0' }} disabled={disabled}
              onChange={(next) => onDuration({ hours: next.hours, minutes: next.minutes })} />
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm }}>
              {shownDuration ? <Button label="Quitar" variant="quiet" onPress={() => { onDuration({ hours: '', minutes: '' }); onToggle(); }} /> : null}
              <Button label="Listo" variant="quiet" onPress={onToggle} />
            </View>
          </View>
        </EditorialExpansion>
      ) : null}
    </EditorialMove>
  );
}
const styles = StyleSheet.create({
  fixed: { borderRadius: 12, paddingHorizontal: spacing.md, paddingVertical: spacing.md, gap: 4 },
  values: { borderRadius: 14, overflow: 'hidden' },
  valueRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 64, paddingHorizontal: spacing.md, paddingVertical: spacing.md, flexWrap: 'wrap' },
  divider: { height: StyleSheet.hairlineWidth, marginHorizontal: spacing.md },
  pill: { minHeight: 44, minWidth: 120, maxWidth: 200, borderRadius: 10, paddingHorizontal: spacing.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 6 },
  pillInput: { flexShrink: 1, minWidth: 60, textAlign: 'right', fontSize: brandTokens.typeScale.subheadline.fontSize, fontWeight: '600', fontVariant: ['tabular-nums'], paddingVertical: 8 },
});
