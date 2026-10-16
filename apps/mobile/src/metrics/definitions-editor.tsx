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
import { SaveButton } from '@/nutrition/save-button';
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
  const menu = () => {
    if (!editable || !b) return;
    const confirm = (title: string, detail: string, run: () => void) =>
      Alert.alert(title, detail, [
        { text: 'Volver', style: 'cancel' },
        { text: 'Confirmar', style: 'destructive', onPress: run },
      ]);
    Alert.alert(b.name, 'Elegí qué querés hacer.', [
      ...(b.actions.archive
        ? [
            {
              text: 'Archivar',
              onPress: () =>
                confirm(
                  '¿Archivar esta métrica?',
                  'Deja de aparecer para cargar valores nuevos. Su historial queda.',
                  () => void controller.archive(),
                ),
            },
          ]
        : []),
      ...(b.actions.restore
        ? [{ text: 'Restaurar', onPress: () => void controller.restore() }]
        : []),
      ...(b.actions.delete
        ? [
            {
              text: 'Eliminar métrica',
              style: 'destructive' as const,
              onPress: () =>
                confirm(
                  '¿Eliminar esta métrica?',
                  'No tiene registros. Esto no se puede deshacer.',
                  () => void controller.remove(),
                ),
            },
          ]
        : []),
      { text: 'Volver', style: 'cancel' },
    ]);
  };
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
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: 16, paddingBottom: 32, gap: 24 }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <Button
            label="Cerrar"
            variant="quiet"
            icon="close"
            disabled={busy || !!state.intent}
            onPress={close}
          />
          <Heading level={2}>{b ? 'Editar métrica' : 'Nueva métrica'}</Heading>
          {b ? (
            <Button
              label="Más opciones de métrica"
              variant="quiet"
              icon="more"
              disabled={!editable}
              onPress={menu}
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
                  checked: icon === i.key,
                  disabled: !editable,
                }}
                disabled={!editable}
                onPress={() => controller.change('icon', i.key)}
                style={({ pressed }) => [
                  {
                    width: 44,
                    height: 44,
                    borderRadius: 12,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor:
                      icon === i.key
                        ? colors.brandSubtle
                        : colors.surfaceRaised,
                  },
                  pressedStyle(pressed, reduced),
                ]}
              >
                <AppIcon
                  name={i.key}
                  size={20}
                  color={icon === i.key ? colors.primary : colors.textMuted}
                />
              </Pressable>
            ))}
          </View>
          <Button
            label="Usar ícono predeterminado"
            variant="quiet"
            disabled={!editable}
            onPress={() => controller.change('icon', null)}
          />
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
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ flex: 1 }}>
                {field('hours', 'Objetivo horas', true)}
              </View>
              <View style={{ flex: 1 }}>
                {field('minutes', 'Objetivo minutos', true)}
              </View>
            </View>
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
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ flex: 1 }}>
                {field('quickHours', 'Porción horas', true)}
              </View>
              <View style={{ flex: 1 }}>
                {field('quickMinutes', 'Porción minutos', true)}
              </View>
            </View>
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
