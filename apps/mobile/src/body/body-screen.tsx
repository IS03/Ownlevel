import { useEffect, useRef } from 'react';
import { Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { selectedRouteDate } from '@/history/navigation';
import { ReturnToHistoryDay } from '@/history/return-to-day';
import { useMobileApi } from '@/api';
import { useMobileAuth } from '@/auth';
import type { BodyMeasurement, BodyWeightEntry } from '@/api/body';
import { AppIcon, AppText, Button, Heading, InlineUnavailable, ScrollScreen, SkeletonBlock, Surface, UnavailableState, spacing, useOwnlevelTheme, brandTokens } from '@/design-system';
import type { BodyController, BodyState } from './body-controller';
import { MeasurementEditorSheet, WeightEditorSheet } from './body-editor';
import { formatBodyDate, formatKg, measurementBadges, measurementValues } from './body-model';
import { useBodyController } from './use-body-controller';

function Row({ title, detail, badges, onPress, label, divided }: { title: string; detail: string; badges?: string[]; onPress?: () => void; label: string; divided: boolean }) {
  const { colors } = useOwnlevelTheme();
  return <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={!onPress} onPress={onPress}
    style={({ pressed }) => [styles.row, divided ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border } : null, pressed ? { backgroundColor: colors.surfaceRaised } : null]}>
    <View style={styles.flex}>
      <AppText variant="label">{title}</AppText>
      <AppText muted numberOfLines={2} variant="caption">{detail}</AppText>
      {badges?.map(b => <AppText key={b} style={{ color: colors.text }} variant="caption">{b}</AppText>)}
    </View>
    {onPress ? <AppIcon color={colors.textMuted} name="chevronRight" size={14} /> : null}
  </Pressable>;
}

function WeightSection({ state, controller, editable }: { state: BodyState; controller: BodyController; editable: boolean }) {
  const { read } = state, overview = read.overview!;
  const current = overview.current;
  return <View style={styles.section} testID="body-weight-section">
    <Heading level={2}>Peso</Heading>
    <Surface style={styles.card}>
      <AppText muted variant="caption">Peso actual</AppText>
      {current ? <>
        <AppText style={styles.big} variant="label">{formatKg(current.weightKg)}</AppText>
        <AppText muted variant="caption">Último registro: {formatBodyDate(current.date)}</AppText>
      </> : overview.profileWeightKg !== null ? <>
        <AppText style={styles.big} variant="label">{formatKg(overview.profileWeightKg)}</AppText>
        <AppText muted variant="caption">Peso de perfil sin registro con fecha.</AppText>
      </> : <AppText muted>Todavía no registraste peso.</AppText>}
      <Button label="Registrar peso" disabled={!editable} onPress={() => controller.openWeight()} />
    </Surface>
    {read.weights.length ? <Surface style={styles.list}>
      {read.weights.map((entry: BodyWeightEntry, index) => <Row key={entry.date} divided={index > 0} title={formatBodyDate(entry.date)} detail={formatKg(entry.weightKg)}
        label={`Peso del ${formatBodyDate(entry.date)}: ${formatKg(entry.weightKg)}`} onPress={editable ? () => controller.openWeight(entry) : undefined} />)}
    </Surface> : null}
    {read.weightsCursor ? <Button label={read.loadingMore === 'weights' ? 'Cargando…' : 'Ver más pesos'} variant="secondary"
      disabled={read.loadingMore !== null} onPress={() => void controller.loadMore('weights')} /> : null}
  </View>;
}

function measurementSummary(m: BodyMeasurement) {
  const values = measurementValues(m).map(v => `${v.label} ${v.value}`);
  return values.join(' · ') || 'Sin valores';
}
function MeasurementSection({ state, controller, editable }: { state: BodyState; controller: BodyController; editable: boolean }) {
  const { colors } = useOwnlevelTheme();
  const { read } = state, latest = read.measurements[0];
  return <View style={styles.section} testID="body-measurement-section">
    <Heading level={2}>Medidas</Heading>
    <Surface style={styles.card}>
      <AppText muted variant="caption">Última medición</AppText>
      {latest ? <>
        <AppText variant="label">{formatBodyDate(latest.measuredOn)}</AppText>
        {measurementValues(latest).map(v => <View key={v.field} style={styles.value}><AppText muted variant="caption">{v.label}</AppText><AppText variant="caption">{v.value}</AppText></View>)}
        {measurementBadges(latest).map(b => <AppText key={b.text} style={{ color: b.tone === 'warning' ? colors.text : colors.textMuted }} variant="caption">{b.text}</AppText>)}
      </> : <AppText muted>Todavía no registraste medidas.</AppText>}
      <Button label="Registrar medidas" disabled={!editable} onPress={() => controller.openMeasurement()} />
    </Surface>
    {read.measurements.length ? <Surface style={styles.list}>
      {read.measurements.map((m, index) => <Row key={m.id} divided={index > 0} title={formatBodyDate(m.measuredOn)} detail={measurementSummary(m)}
        badges={measurementBadges(m).map(b => b.text)} label={`Medición del ${formatBodyDate(m.measuredOn)}`}
        onPress={editable ? () => controller.openMeasurement(m) : undefined} />)}
    </Surface> : null}
    {read.measurementsCursor ? <Button label={read.loadingMore === 'measurements' ? 'Cargando…' : 'Ver más mediciones'} variant="secondary"
      disabled={read.loadingMore !== null} onPress={() => void controller.loadMore('measurements')} /> : null}
  </View>;
}

export function BodyView({ state, controller, date }: { state: BodyState; controller: BodyController; date?: string | null }) {
  const { colors } = useOwnlevelTheme();
  const { read, editor } = state;
  if (!read.overview) {
    return <ScrollScreen testID={read.status === 'loading' ? 'body-loading' : 'body-unavailable'}>
      <ReturnToHistoryDay />
      {read.status === 'loading' ? <><SkeletonBlock height={140} /><SkeletonBlock height={140} /></>
        : <UnavailableState title="No pudimos cargar Cuerpo" description="Tus datos siguen seguros. Revisá la conexión e intentá nuevamente."
          action={<Button label="Reintentar" onPress={() => void controller.load()} />} />}
    </ScrollScreen>;
  }
  const editable = state.phase === 'idle' && !state.intent && !editor;
  return <>
    <ScrollScreen testID="body-screen" refreshControl={<RefreshControl refreshing={read.refreshing} onRefresh={() => void controller.load()} tintColor={colors.primary} />}>
      <ReturnToHistoryDay />
      {read.stale ? <Surface><InlineUnavailable actionLabel="Reintentar" message="No se pudo actualizar. Mostramos la última lectura confirmada." onAction={() => void controller.load()} /></Surface> : null}
      {state.notice ? <Surface accessibilityRole="alert"><AppText variant="caption">{state.notice}</AppText>
        <Button label="Entendido" variant="quiet" onPress={() => controller.dismissNotice()} /></Surface> : null}
      {state.intent && !editor ? <Surface><AppText variant="caption">{state.message ?? 'Hay un cambio pendiente de confirmar.'}</AppText>
        <Button label="Comprobar" onPress={() => void controller.recover()} /></Surface> : null}
      {state.phase === 'blocked' && !editor ? <Surface><AppText style={{ color: colors.danger }} variant="caption">{state.message}</AppText></Surface> : null}
      {read.moreError ? <AppText style={{ color: colors.danger }} variant="caption">No pudimos cargar más registros. Probá de nuevo.</AppText> : null}
      {date ? <BodyDate state={state} controller={controller} date={date} editable={editable} /> : <>
        <WeightSection state={state} controller={controller} editable={editable} />
        <MeasurementSection state={state} controller={controller} editable={editable} />
      </>}
    </ScrollScreen>
    {editor?.kind === 'weight' ? <WeightEditorSheet editor={editor} state={state} controller={controller} /> : null}
    {editor?.kind === 'measurement' ? <MeasurementEditorSheet editor={editor} state={state} controller={controller} /> : null}
  </>;
}

export function BodyScreen() {
  const { session } = useMobileAuth();
  const userId = session?.user.id ?? 'anonymous';
  return <BodyUserScreen key={userId} userId={userId} />;
}
function BodyUserScreen({ userId }: { userId: string }) {
  const { client } = useMobileApi();
  const params = useLocalSearchParams();
  const date = selectedRouteDate(params);
  const body = useBodyController(client, userId, date);
  useWeightEntry(params.registrar === 'peso' && !date, body);
  if (!body) return <ScrollScreen testID="body-loading"><SkeletonBlock height={140} /></ScrollScreen>;
  return <BodyView state={body.state} controller={body.controller} date={date} />;
}
/**
 * Home → Registrar → Peso (M9.3A): opens the existing weight editor for today once the
 * screen can edit; today's entry opens in edit mode so it is never duplicated.
 */
export function useWeightEntry(requested: boolean, body: { state: BodyState; controller: BodyController } | null) {
  const router = useRouter();
  // Consumed once per screen: closing the editor must never reopen it.
  const used = useRef(false);
  const today = body?.state.read.overview?.today;
  const ready = requested && !!body && !!today && body.state.read.status === 'ready' && body.state.phase === 'idle'
    && !body.state.intent && !body.state.editor;
  useEffect(() => {
    if (!ready || !body || !today || used.current) return;
    used.current = true;
    router.setParams({ registrar: undefined });
    body.controller.openWeight(body.state.read.weights.find(entry => entry.date === today));
  }, [body, ready, router, today]);
}
function BodyDate({ state, controller, date, editable }: { state: BodyState; controller: BodyController; date: string; editable: boolean }) {
  const day = state.read.day?.date === date ? state.read.day : null;
  if (!day && state.read.refreshing) return <SkeletonBlock height={160} />;
  if (!day) return <Surface><Heading level={2}>{formatBodyDate(date)}</Heading><InlineUnavailable message="No hay una lectura confirmada de esta fecha." actionLabel="Reintentar" onAction={() => void controller.load()} /></Surface>;
  return <>
    <Heading level={2}>{formatBodyDate(date)}</Heading>
    <Surface><Heading level={2}>Peso</Heading>
      {day.weight.status === 'unavailable' ? <AppText>No pudimos cargar el peso de esta fecha.</AppText> : <>
        <AppText>{day.weight.data ? formatKg(day.weight.data.weightKg) : 'Sin registro de peso.'}</AppText>
        <Button label={day.weight.data ? 'Editar peso' : 'Registrar peso'} disabled={!editable || state.read.stale} onPress={() => { if (day.weight.status === 'ok') controller.openWeight(day.weight.data ?? undefined, date); }} />
      </>}
    </Surface>
    <Surface><Heading level={2}>Medidas</Heading>
      {day.measurement.status === 'unavailable' ? <AppText>No pudimos cargar la medición de esta fecha.</AppText> : <>
        {day.measurement.data ? <>
          {measurementValues(day.measurement.data).map(v => <AppText key={v.field}>{v.label}: {v.value}</AppText>)}
          {measurementBadges(day.measurement.data).map(b => <AppText key={b.text} muted>{b.text}</AppText>)}
        </> : <AppText>Sin medición corporal.</AppText>}
        <Button label={day.measurement.data ? 'Editar medición' : 'Registrar medidas'} disabled={!editable || state.read.stale} onPress={() => { if (day.measurement.status === 'ok') controller.openMeasurement(day.measurement.data ?? undefined, date); }} />
      </>}
    </Surface>
  </>;
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm },
  card: { gap: spacing.xs },
  big: { fontSize: brandTokens.typeScale.title1.fontSize, lineHeight: brandTokens.typeScale.title1.lineHeight },
  list: { padding: 0, gap: 0, overflow: 'hidden' },
  row: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  flex: { flex: 1, gap: 2 },
  value: { flexDirection: 'row', justifyContent: 'space-between' },
});
