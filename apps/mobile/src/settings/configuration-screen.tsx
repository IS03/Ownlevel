import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useNavigation, useRouter, useIsFocused, useFocusEffect } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { AppText, Button, ChipGroup, Heading, TextField, brandTokens, useOwnlevelTheme } from '@/design-system';
import { useNutritionConfiguration } from '@/nutrition/config-provider';
import { configurationDraft } from '@/nutrition/config-model';
import type { ConfigState, ConfigurationController } from '@/nutrition/config-controller';
import { SaveButton } from '@/nutrition/save-button';
import { NutritionToast } from '@/nutrition/nutrition-toast';
import { useTweenedNumber } from '@/nutrition/use-tweened-number';
import { SettingsSegmented } from './native-segmented';
import { BirthPicker, HeightWheel } from './physical-controls';
import {
  CountingNumber,
  EditorialRow,
  EditorialScreen,
  EditorialSkeleton,
  formatNumber,
} from './editorial';
import { activities, estimatedEnergy, sexes, shortDate } from './settings-model';

type Operation = 'energy' | 'physical';
export function ConfigurationStatus({
  state,
  controller,
}: {
  state: ConfigState;
  controller: ConfigurationController;
}) {
  const recovery = ['uncertain', 'confirmed', 'blocked'].includes(state.phase);
  if (state.phase === 'pending' || (state.phase === 'confirmed' && !state.message)) return null;
  const energy = state.config?.energy.status === 'ok' ? state.config.energy.data : null;
  const physical = state.config?.physical.status === 'ok' ? state.config.physical.data : null;
  const needsRefresh =
    state.readError ||
    !state.config ||
    !state.operation ||
    state.config[state.operation].status !== 'ok';
  if (state.phase === 'conflict')
    return (
      <View accessibilityLiveRegion="polite" style={{ gap: 12 }}>
        <AppText>
          Estos datos cambiaron en otro lado. Revisá cómo quedaron antes de guardar.
        </AppText>
        {state.operation === 'energy' && energy ? (
          <AppText numeric>
            Ahora:{' '}
            {energy.baseExpenditureMode === 'custom'
              ? 'Manual'
              : activities.find((a) => a.value === energy.activityLevel)?.label}{' '}
            ·{' '}
            {energy.usedBaseKcal === null
              ? 'gasto sin dato'
              : `${formatNumber(energy.usedBaseKcal)} kcal por día`}{' '}
            · +{formatNumber(energy.trainingExpenditureDeltaKcal)} kcal si entrenás.
          </AppText>
        ) : state.operation === 'physical' && physical ? (
          <AppText numeric>
            Ahora:{' '}
            {physical.birthDate
              ? `${shortDate(physical.birthDate)} ${physical.birthDate.slice(0, 4)}`
              : 'nacimiento sin dato'}{' '}
            · {sexes.find((s) => s.value === physical.sex)?.label ?? 'sexo sin dato'} ·{' '}
            {physical.heightCm === null ? 'altura sin dato' : `${physical.heightCm} cm`} ·{' '}
            {physical.weightKg === null ? 'peso sin dato' : `${formatNumber(physical.weightKg)} kg`}
            .
          </AppText>
        ) : null}
        <Button
          label={needsRefresh ? 'Actualizar datos' : 'Revisar mi cambio'}
          onPress={() => (needsRefresh ? void controller.load() : controller.reviewTruth())}
          disabled={state.loading}
        />
      </View>
    );
  if (recovery)
    return (
      <View accessibilityLiveRegion="polite" style={{ gap: 12 }}>
        <AppText>
          {state.phase === 'confirmed'
            ? 'Se guardó. Falta mostrar los datos actualizados.'
            : state.phase === 'blocked'
              ? 'No pudimos guardar el cambio en este teléfono.'
              : 'Tu cambio sigue acá. Comprobá si llegó antes de hacer otro.'}
        </AppText>
        <Button label="Comprobar cambio" onPress={() => void controller.recover()} />
      </View>
    );
  if (state.readError)
    return (
      <View accessibilityLiveRegion="polite" style={{ gap: 12 }}>
        <AppText>No pudimos actualizar. Lo que escribiste sigue acá.</AppText>
        <Button label="Reintentar" onPress={() => void controller.load()} />
      </View>
    );
  if (state.phase === 'idle' && state.message && state.draft)
    return <AppText accessibilityLiveRegion="polite">{state.message}</AppText>;
  return null;
}
export function ConfigurationScreen({ operation }: { operation: Operation }) {
  const shared = useNutritionConfiguration();
  const router = useRouter();
  const navigation = useNavigation();
  const { colors } = useOwnlevelTheme();
  const controller = shared?.controller;
  const state = shared?.state;
  const focused = useIsFocused();
  const initialized = useRef<ConfigurationController | null>(null);
  const [control, setControl] = useState<'birthDate' | 'heightCm' | 'sex' | 'training' | null>(
    null,
  );
  const [notice, setNotice] = useState(false);
  const previous = useRef(state?.phase);
  useEffect(() => {
    if (!focused) {
      initialized.current = null;
      return;
    }
    if (!controller || !state || state.phase === 'loading') return;
    if (initialized.current === controller) {
      if (state.phase === 'idle' && !state.open) controller.open(operation, 'route');
      return;
    }
    initialized.current = controller;
    if (state.intent) controller.showRecovery('route');
    else controller.open(operation, 'route');
  }, [controller, state, operation, focused]);
  // Release on blur, not on a later unmount: a covered route must never close the next route's editor.
  useFocusEffect(
    useCallback(
      () => () => {
        if (controller) {
          initialized.current = null;
          controller.close();
        }
      },
      [controller],
    ),
  );
  useEffect(() => {
    if (
      state?.phase === 'idle' &&
      (previous.current === 'pending' || previous.current === 'confirmed') &&
      !state.intent
    )
      setNotice(true);
    previous.current = state?.phase;
  }, [state?.phase, state?.intent]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(false), 2200);
    return () => clearTimeout(timer);
  }, [notice]);
  const pending = state?.phase === 'pending' || (state?.phase === 'confirmed' && !state.message);
  usePreventRemove(
    !!controller && (pending || (controller.dirty() && !state?.intent)),
    ({ data }) => {
      if (pending) return;
      Alert.alert('¿Descartar cambios?', 'Estos cambios todavía no están guardados.', [
        { text: 'Seguir editando', style: 'cancel' },
        {
          text: 'Descartar',
          style: 'destructive',
          onPress: () => {
            controller?.close();
            navigation.dispatch(data.action);
          },
        },
      ]);
    },
  );
  const config = state?.config;
  const locked =
    !state || state.phase !== 'idle' || !!state.intent || state.loading || state.readError;
  const draft =
    state?.operation === operation
      ? state.draft
      : config
        ? configurationDraft(operation, config)
        : null;
  const change = (key: string, value: string) => {
    if (locked || !controller) return;
    if (!state?.draft) controller.begin(operation);
    controller.change(key, value);
    setNotice(false);
  };
  const energy = config?.energy.status === 'ok' ? config.energy.data : null;
  const physical = config?.physical.status === 'ok' ? config.physical.data : null;
  const value = estimatedEnergy(
    energy,
    operation === 'energy' && state?.operation === 'energy' ? state.draft : null,
  );
  const bmr = energy?.bmrKcal ?? null;
  const field = (key: string, label: string) => (
    <TextField
      label={label}
      value={draft?.[key] ?? ''}
      disabled={locked}
      numeric
      keyboardType="decimal-pad"
      error={state?.errors[key]}
      onChangeText={(v) => change(key, v)}
    />
  );
  const openControl = (key: typeof control) => {
    if (locked) return;
    if (!state?.draft) controller?.begin(operation);
    setControl(control === key ? null : key);
  };
  const navigate = (path: '/settings/physical' | '/(tabs)/progress/body') => {
    const go = () => {
      controller?.close();
      router.push(path);
    };
    if (controller?.dirty() && !state?.intent)
      Alert.alert('¿Descartar cambios?', 'Estos cambios todavía no están guardados.', [
        { text: 'Seguir editando', style: 'cancel' },
        { text: 'Descartar', style: 'destructive', onPress: go },
      ]);
    else go();
  };
  const otherIntent = !!state?.intent && state.intent.intent.operation !== operation;
  return (
    <View style={{ flex: 1 }}>
      <EditorialScreen>
        <Heading>{operation === 'energy' ? 'Energía' : 'Datos físicos'}</Heading>
        {otherIntent ? (
          <>
            <AppText>Primero terminá de confirmar el cambio que tenés pendiente.</AppText>
            <Button
              label="Ver cambio pendiente"
              onPress={() => {
                const op = state.intent!.intent.operation;
                if (op === 'plan') controller?.showRecovery();
                else router.replace(`/settings/${op}`);
              }}
            />
          </>
        ) : !draft ? (
          state?.readError ? null : config && config[operation].status === 'unavailable' ? (
            <View style={{ gap: 12 }}>
              <AppText>No pudimos traer estos datos.</AppText>
              <Button label="Reintentar" onPress={() => void controller?.load()} />
            </View>
          ) : (
            <EditorialSkeleton />
          )
        ) : operation === 'energy' ? (
          <>
            <SettingsSegmented
              disabled={locked}
              accessibilityLabel="Cómo calculás tu gasto"
              value={draft.baseExpenditureMode}
              options={[
                { value: 'automatic', label: 'Automática' },
                { value: 'custom', label: 'Manual' },
              ]}
              onChange={(v) => change('baseExpenditureMode', v)}
            />
            <View style={{ gap: 12 }}>
              <AppText muted>Gastás por día</AppText>
              {draft.baseExpenditureMode === 'custom' ? (
                <ManualExpenditure
                  value={draft.customBaseExpenditureKcal ?? ''}
                  error={state?.errors.customBaseExpenditureKcal}
                  disabled={locked}
                  onChange={(v) => change('customBaseExpenditureKcal', v)}
                />
              ) : value !== null ? (
                <View style={expenditureStyles.row}>
                  <AnimatedKcal value={value} />
                  <AppText variant="title2" muted>kcal</AppText>
                </View>
              ) : (
                <>
                  <AppText>Para calcularlo necesitamos tu altura, peso y nacimiento.</AppText>
                  <Button
                    label="Completar datos físicos"
                    variant="quiet"
                    onPress={() => navigate('/settings/physical')}
                  />
                </>
              )}
              {value !== null && draft.baseExpenditureMode === 'automatic' ? (
                <AppText muted variant="footnote">
                  {state?.draft && controller?.dirty()
                    ? 'Estimación mientras guardás. Al confirmar usamos el cálculo actualizado.'
                    : 'Calculado con tus datos físicos.'}
                </AppText>
              ) : null}
            </View>
            {draft.baseExpenditureMode === 'automatic' ? (
              <View>
                <EditorialRow title="En reposo">
                  <CountingNumber value={bmr} />
                  {bmr === null ? null : <AppText style={{ color: colors.primary }}> kcal</AppText>}
                </EditorialRow>
                <EditorialRow title="Actividad cotidiana">
                  <AppText style={{ color: colors.primary }}>
                    {value !== null && bmr !== null ? '+' : ''}
                  </AppText>
                  <CountingNumber value={value !== null && bmr !== null ? value - bmr : null} />
                  {value === null || bmr === null ? null : (
                    <AppText style={{ color: colors.primary }}> kcal</AppText>
                  )}
                </EditorialRow>
              </View>
            ) : null}
            {/* Your day to day only feeds the automatic estimate; a manual number already includes it. */}
            {draft.baseExpenditureMode === 'automatic' ? (
            <>
            <AppText muted variant="caption">
              TU DÍA A DÍA
            </AppText>
            <View accessibilityRole="radiogroup" accessibilityLabel="Actividad cotidiana">
              {activities.map((activity) => (
                <Pressable
                  key={activity.value}
                  accessibilityRole="radio"
                  accessibilityLabel={activity.label}
                  accessibilityState={{
                    checked: draft.activityLevel === activity.value,
                    disabled: locked,
                  }}
                  disabled={locked}
                  onPress={() => change('activityLevel', activity.value)}
                  style={{
                    paddingVertical: 20,
                    borderBottomWidth: 0.5,
                    borderColor: colors.border,
                    gap: 8,
                  }}
                >
                  <AppText
                    variant="headline"
                    style={
                      draft.activityLevel === activity.value ? { color: colors.primary } : undefined
                    }
                  >
                    {activity.label}
                    {draft.activityLevel === activity.value ? ' ✓' : ''}
                  </AppText>
                  <AppText muted variant="subheadline">
                    {activity.detail}
                  </AppText>
                </Pressable>
              ))}
            </View>
            </>
            ) : null}
            <EditorialRow
              title="Si entrenás, gastás"
              onPress={() => openControl('training')}
              disabled={locked}
            >
              {draft.trainingExpenditureDeltaKcal.trim() &&
              /^\d+$/.test(draft.trainingExpenditureDeltaKcal)
                ? `+${formatNumber(Number(draft.trainingExpenditureDeltaKcal))} kcal`
                : 'Sin dato'}
            </EditorialRow>
            {control === 'training'
              ? field('trainingExpenditureDeltaKcal', 'Extra si entrenás (kcal)')
              : null}
          </>
        ) : (
          <>
            <View>
              <EditorialRow
                title="Nacimiento"
                onPress={() => openControl('birthDate')}
                disabled={locked}
              >
                {draft.birthDate
                  ? `${shortDate(draft.birthDate)} ${draft.birthDate.slice(0, 4)}`
                  : 'Sin dato'}
              </EditorialRow>
              {control === 'birthDate' ? (
                <BirthPicker
                  value={draft.birthDate}
                  today={config!.today}
                  onChange={(v) => change('birthDate', v)}
                />
              ) : null}
              <EditorialRow title="Sexo" onPress={() => openControl('sex')} disabled={locked}>
                {sexes.find((s) => s.value === draft.sex)?.label ?? 'Sin dato'}
              </EditorialRow>
              {control === 'sex' ? (
                <ChipGroup
                  accessibilityLabel="Sexo"
                  options={sexes}
                  value={draft.sex || null}
                  disabled={locked}
                  onChange={(v) => change('sex', v)}
                />
              ) : null}
              <EditorialRow
                title="Altura"
                onPress={() => openControl('heightCm')}
                disabled={locked}
              >
                {draft.heightCm ? `${draft.heightCm} cm` : 'Sin dato'}
              </EditorialRow>
              {control === 'heightCm' ? (
                <HeightWheel value={draft.heightCm} onChange={(v) => change('heightCm', v)} />
              ) : null}
              {physical?.hasWeightHistory ? (
                <EditorialRow
                  title="Peso"
                  hint={
                    physical.latestWeightDate
                      ? `Último registro: ${shortDate(physical.latestWeightDate)} · Se cambia en Cuerpo`
                      : undefined
                  }
                  disabled={locked}
                  onPress={() => navigate('/(tabs)/progress/body')}
                >
                  {physical.weightKg === null
                    ? 'Sin dato'
                    : `${formatNumber(physical.weightKg)} kg`}
                </EditorialRow>
              ) : (
                <View style={{ paddingVertical: 20 }}>{field('weightKg', 'Peso (kg)')}</View>
              )}
            </View>
            <AppText muted variant="footnote">
              Se usan para estimar cuánto gastás en reposo (Energía). No se muestran a nadie.
            </AppText>
          </>
        )}
        {state && controller && !otherIntent ? (
          <>
            <ConfigurationStatus state={state} controller={controller} />
            {Object.entries(state.errors).map(([key, message]) => (
              <AppText key={key} accessibilityLiveRegion="polite">
                {message}
              </AppText>
            ))}
            {state.phase === 'idle' || pending ? (
              <SaveButton
                label="Guardar cambios"
                state={pending ? 'saving' : notice ? 'done' : 'idle'}
                disabled={locked || !controller.dirty() || !draft}
                onPress={() => void controller.save()}
              />
            ) : null}
          </>
        ) : null}
      </EditorialScreen>
      {notice ? <NutritionToast message="Cambios guardados." state="done" /> : null}
    </View>
  );
}
/** Manual and automatic daily expenditure share one look: a large plain number with a muted "kcal". */
const expenditureStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'baseline', gap: 8, minHeight: brandTokens.layout.minTouch },
});
function AnimatedKcal({ value }: { value: number }) {
  const { colors } = useOwnlevelTheme();
  const shown = useTweenedNumber(value, 300);
  return (
    <AppText numeric variant="largeTitle" style={{ color: colors.text }}>
      {shown === null ? '' : formatNumber(shown)}
    </AppText>
  );
}
/** Manual daily expenditure: the whole row (number, kcal and the space to its right) focuses the number. */
function ManualExpenditure({ value, error, disabled, onChange }: {
  value: string; error?: string; disabled: boolean; onChange: (value: string) => void;
}) {
  const { colors } = useOwnlevelTheme();
  const input = useRef<TextInput>(null);
  return (
    <View style={{ gap: 8 }}>
      <Pressable
        accessible={false}
        disabled={disabled}
        onPress={() => input.current?.focus()}
        style={expenditureStyles.row}
        testID="manual-expenditure-row"
      >
        <TextInput
          ref={input}
          accessibilityLabel="Tu gasto por día (kcal)"
          value={value}
          editable={!disabled}
          keyboardType="number-pad"
          placeholder="0"
          placeholderTextColor={colors.textMuted}
          onChangeText={onChange}
          style={{ ...brandTokens.typeScale.largeTitle, fontVariant: ['tabular-nums'], color: colors.text, padding: 0, minWidth: 48 }}
        />
        <AppText variant="title2" muted style={{ flex: 1 }}>kcal</AppText>
      </Pressable>
      {error ? (
        <AppText accessibilityRole="alert" variant="footnote" style={{ color: colors.danger }}>{error}</AppText>
      ) : null}
    </View>
  );
}
