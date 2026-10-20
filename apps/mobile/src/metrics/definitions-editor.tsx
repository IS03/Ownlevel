import { useEffect } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  View,
} from 'react-native';
import {
  AppIcon,
  AppSheet,
  AppText,
  Button,
  Heading,
  TextField,
  pressedStyle,
  useAppSheetDismiss,
  useOwnlevelTheme,
  useReduceMotion,
} from '@/design-system';
import { SettingsSegmented } from '@/settings/native-segmented';
import { EditorialSpread, useEditorialLayout } from '@/settings/editorial';
import { SaveButton } from '@/nutrition/save-button';
import { NutritionGlassButton } from '@/nutrition/day-controls';
import { homeMetricIcon, metricIcons } from '@/home/home-metric-icons';
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
  const { largeText } = useEditorialLayout();
  const dismiss = useAppSheetDismiss(),
    { colors } = useOwnlevelTheme(),
    reduced = useReduceMotion();
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
      placeholder="—"
    />
  );
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flexShrink: 1 }}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: 16, paddingBottom: 32, gap: 24 }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <NutritionGlassButton
            label="Cerrar"
            icon="close"
            onPress={busy || state.intent ? undefined : close}
          />
          <Heading level={2} style={{ flex: 1 }}>{b ? 'Editar métrica' : 'Nueva métrica'}</Heading>
          {archiveAction ? (
            <NutritionGlassButton
              label={archiveAction.label}
              icon={archiveAction.label === 'Eliminar métrica' ? 'trash' : 'archive'}
              onPress={editable ? archiveAction.run : undefined}
            />
          ) : null}
        </View>
        <View
          style={{ alignItems: 'center', gap: 8 }}
          accessibilityLabel="Vista previa en Inicio"
        >
          <View
            style={{
              width: 48,
              height: 48,
              borderRadius: 24,
              borderWidth: 1,
              borderColor: colors.border,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <AppIcon name={icon} size={20} color={colors.textMuted} />
          </View>
          <AppText variant="headline">{d.name || 'Tu métrica'}</AppText>
          <AppText muted numeric>
            {quick != null && quick > 0
              ? '+ ' +
                quickAmount(
                  { valueType: d.valueType, unit: d.unit || null },
                  quick,
                )
              : 'Cargar'}
          </AppText>
        </View>
        {field('name', 'Nombre', false, !!b && !b.actions.editName)}
        <View style={{ gap: 12 }}>
          <AppText variant="headline">Ícono</AppText>
          <View
            accessibilityRole="radiogroup"
            accessibilityLabel="Ícono de la métrica"
            style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}
          >
            {metricIcons.map((i) => (
              <Pressable
                key={i.key}
                accessibilityRole="radio"
                accessibilityLabel={'Ícono: ' + i.label}
                accessibilityState={{
                  checked: d.icon === i.key,
                  disabled: !editable,
                }}
                disabled={!editable}
                // Only a chosen icon is marked; tapping it again goes back to the default one.
                onPress={() => controller.change('icon', d.icon === i.key ? null : i.key)}
                style={({ pressed }) => [
                  {
                    width: 44,
                    height: 44,
                    borderRadius: 12,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor:
                      d.icon === i.key
                        ? colors.brandSubtle
                        : colors.surfaceRaised,
                  },
                  pressedStyle(pressed, reduced),
                ]}
              >
                <AppIcon
                  name={i.key}
                  size={20}
                  color={d.icon === i.key ? colors.primary : colors.textMuted}
                />
              </Pressable>
            ))}
          </View>
        </View>
        <View style={{ gap: 12 }}>
          <AppText variant="headline">Se registra como</AppText>
          <SettingsSegmented
            accessibilityLabel="Se registra como"
            value={d.valueType}
            disabled={!editable || (!!b && !b.actions.editMeaning)}
            options={Object.entries(VALUE_TYPE_LABELS).map(
              ([value, label]) => ({
                value: value as typeof d.valueType,
                label,
              }),
            )}
            onChange={(v) => controller.change('valueType', v)}
          />
          {b && !b.actions.editMeaning ? (
            <AppText muted variant="footnote">
              {b.systemKey
                ? 'El nombre, tipo y unidad de esta métrica son fijos. Podés elegir su ícono, objetivo y carga rápida.'
                : 'Ya tiene registros: el tipo y la unidad quedan como estaban para conservarlos.'}
            </AppText>
          ) : null}
        </View>
        {d.valueType === 'duration' ? (
          <AppText muted>Unidad · horas y minutos</AppText>
        ) : (
          field('unit', 'Unidad', false, !!b && !b.actions.editMeaning)
        )}
        <View style={{ gap: 12 }}>
          <AppText variant="headline">Objetivo diario</AppText>
          {d.valueType === 'duration' ? (
            <EditorialSpread style={{ alignItems: 'stretch' }}>
              <View style={largeText ? { width: '100%' } : { flex: 1 }}>
                {field('hours', 'Objetivo horas', true)}
              </View>
              <View style={largeText ? { width: '100%' } : { flex: 1 }}>
                {field('minutes', 'Objetivo minutos', true)}
              </View>
            </EditorialSpread>
          ) : (
            field('target', 'Objetivo (opcional)', true)
          )}
          <AppText muted variant="footnote">
            Es una referencia. No cambia tus registros anteriores.
          </AppText>
        </View>
        <View style={{ gap: 12 }}>
          <AppText variant="headline">Carga rápida</AppText>
          {d.valueType === 'duration' ? (
            <EditorialSpread style={{ alignItems: 'stretch' }}>
              <View style={largeText ? { width: '100%' } : { flex: 1 }}>
                {field('quickHours', 'Porción horas', true)}
              </View>
              <View style={largeText ? { width: '100%' } : { flex: 1 }}>
                {field('quickMinutes', 'Porción minutos', true)}
              </View>
            </EditorialSpread>
          ) : (
            field(
              'quickValue',
              d.unit ? 'Porción (' + d.unit + ')' : 'Porción',
              true,
            )
          )}
          <AppText muted variant="footnote">
            Un toque en Inicio suma esto. Mantené apretado para cargar otro
            valor. Dejalo vacío para abrir siempre la carga completa.
          </AppText>
          {state.errors.quickValue ? (
            <AppText accessibilityLiveRegion="polite">
              {state.errors.quickValue}
            </AppText>
          ) : null}
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
