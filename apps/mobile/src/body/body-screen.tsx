import { useEffect, useRef } from 'react';
import { Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { selectedRouteDate } from '@/history/navigation';
import { ReturnToHistoryDay } from '@/history/return-to-day';
import { useMobileApi } from '@/api';
import { useMobileAuth } from '@/auth';
import type { BodyMeasurement, BodyMeasurementField, BodyWeightEntry } from '@/api/body';
import { AppIcon, AppText, Button, Heading, InlineUnavailable, ScrollScreen, SkeletonBlock, UnavailableState, spacing, useOwnlevelTheme } from '@/design-system';
import type { BodyController, BodyState } from './body-controller';
import { MeasurementEditorSheet, WeightEditorSheet } from './body-editor';
import { formatBodyDate, formatCm, formatKg, measurementBadges, measurementValues } from './body-model';
import { useBodyController } from './use-body-controller';

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
/** "3 oct", with the year only when it is not this year's. */
function shortDate(date: string, today: string) {
  const [y, m, d] = date.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]}${date.slice(0, 4) === today.slice(0, 4) ? '' : ` ${y}`}`;
}
const decimals = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 });
/** A change as a neutral arrow and its size, never a color (IDENTIDAD.md: no good/bad on personal data). */
function change(delta: number, unit: string) {
  return Math.abs(delta) < 1e-9 ? '=' : `${delta > 0 ? '↗' : '↘'} ${decimals.format(Math.abs(delta))} ${unit}`;
}

function Row({ title, detail, value, onPress, label, divided, testID }: {
  title: string; detail?: string; value?: string; onPress?: () => void; label: string; divided: boolean; testID?: string;
}) {
  const { colors } = useOwnlevelTheme();
  return <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={!onPress} onPress={onPress} testID={testID}
    style={({ pressed }) => [styles.row, divided && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }, pressed && { opacity: 0.6 }]}>
    <View style={styles.flex}>
      <AppText numeric variant="body">{title}</AppText>
      {detail ? <AppText muted numeric numberOfLines={2} variant="footnote">{detail}</AppText> : null}
    </View>
    {value ? <AppText numeric variant="headline">{value}</AppText> : null}
    {onPress ? <AppIcon color={colors.textMuted} name="chevronRight" size={15} /> : null}
  </Pressable>;
}

/** Weight entries, newest first, each against the one before it; tapping one edits it. */
export function WeightRecords({ state, controller, editable, limit }: { state: BodyState; controller: BodyController; editable: boolean; limit?: number }) {
  const { read } = state, today = read.overview!.today, weights = read.weights;
  const shown = limit ? weights.slice(0, limit) : weights;
  return <View style={styles.section} testID="body-weight-records">
    {shown.length ? <View>
      {shown.map((entry: BodyWeightEntry, index) => {
        const before = weights[index + 1] ?? null;
        return <Row key={entry.date} divided={index > 0} title={shortDate(entry.date, today)} detail={before ? change(entry.weightKg - before.weightKg, 'kg') : undefined}
          value={formatKg(entry.weightKg)} label={`Peso del ${formatBodyDate(entry.date)}: ${formatKg(entry.weightKg)}`}
          onPress={editable ? () => controller.openWeight(entry) : undefined} />;
      })}
    </View> : <AppText muted>Todavía no registraste peso.</AppText>}
    {limit && weights.length > limit ? null : read.weightsCursor ? <Button label={read.loadingMore === 'weights' ? 'Cargando…' : 'Ver más pesajes'} variant="quiet"
      disabled={read.loadingMore !== null} onPress={() => void controller.loadMore('weights')} /> : null}
  </View>;
}

function measurementSummary(m: BodyMeasurement) {
  const n = measurementValues(m).length;
  const badges = measurementBadges(m).map(b => b.short);
  return [n === 1 ? '1 medida' : `${n} medidas`, ...badges].join(' · ');
}
/**
 * Measurement records, newest first; with `field`, only those that include it, showing its value and change.
 * Tapping one edits the whole measurement (one record holds every measure of that day).
 */
export function MeasurementRecords({ state, controller, editable, field }: { state: BodyState; controller: BodyController; editable: boolean; field?: BodyMeasurementField }) {
  const { read } = state, today = read.overview!.today;
  const items = field ? read.measurements.filter(m => m[field] !== null) : read.measurements;
  return <View style={styles.section} testID="body-measurement-records">
    {items.length ? <View>
      {items.map((m, index) => {
        const value = field ? m[field] : null, before = field ? items[index + 1]?.[field] ?? null : null;
        const badges = measurementBadges(m).map(b => b.short).join(' · ');
        return <Row key={m.id} divided={index > 0} title={shortDate(m.measuredOn, today)}
          detail={field ? [value !== null && before !== null ? change(value - before, 'cm') : null, badges || null].filter(Boolean).join(' · ') || undefined : measurementSummary(m)}
          value={field ? formatCm(value) : undefined} label={`Medición del ${formatBodyDate(m.measuredOn)}`} onPress={editable ? () => controller.openMeasurement(m) : undefined} />;
      })}
    </View> : <AppText muted>Todavía no registraste medidas.</AppText>}
    {read.measurementsCursor ? <Button label={read.loadingMore === 'measurements' ? 'Cargando…' : 'Ver más mediciones'} variant="quiet"
      disabled={read.loadingMore !== null} onPress={() => void controller.loadMore('measurements')} /> : null}
  </View>;
}

/** Save confirmations, pending changes and blocked writes, above the content of any Body screen. */
export function BodyStatus({ state, controller }: { state: BodyState; controller: BodyController }) {
  const { colors } = useOwnlevelTheme();
  const { read, editor } = state;
  return <>
    {read.stale ? <InlineUnavailable actionLabel="Reintentar" message="No se pudo actualizar. Mostramos la última lectura confirmada." onAction={() => void controller.load()} /> : null}
    {state.notice ? <View accessibilityRole="alert" style={styles.notice}>
      <AppIcon name="check" color={colors.primary} size={17} />
      <AppText numeric variant="footnote" style={styles.flex}>{state.notice}</AppText>
      <Pressable accessibilityRole="button" accessibilityLabel="Entendido" hitSlop={8} onPress={() => controller.dismissNotice()}>
        <AppText variant="footnote" style={{ color: colors.primary, fontWeight: '600' }}>Entendido</AppText>
      </Pressable>
    </View> : null}
    {state.intent && !editor ? <View style={styles.section}><AppText variant="footnote">{state.message ?? 'Hay un cambio pendiente de confirmar.'}</AppText>
      <Button label="Comprobar" onPress={() => void controller.recover()} /></View> : null}
    {state.phase === 'blocked' && !editor ? <AppText style={{ color: colors.danger }} variant="footnote">{state.message}</AppText> : null}
    {read.moreError ? <AppText style={{ color: colors.danger }} variant="footnote">No pudimos cargar más registros. Probá de nuevo.</AppText> : null}
  </>;
}
/** The open weight or measurement sheet, if any. */
export function BodyEditors({ state, controller }: { state: BodyState; controller: BodyController }) {
  const editor = state.editor;
  return <>
    {editor?.kind === 'weight' ? <WeightEditorSheet editor={editor} state={state} controller={controller} /> : null}
    {editor?.kind === 'measurement' ? <MeasurementEditorSheet editor={editor} state={state} controller={controller} /> : null}
  </>;
}
/** Today's weight opens in edit mode, so a second entry for the same day is never created. */
export const openTodayWeight = (state: BodyState, controller: BodyController) =>
  controller.openWeight(state.read.weights.find(e => e.date === state.read.overview?.today));

/** A single day of Body (from Historial): its weight and its measurement, each one tap from its sheet. */
export function BodyView({ state, controller, date }: { state: BodyState; controller: BodyController; date: string }) {
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
      <BodyStatus state={state} controller={controller} />
      <BodyDate state={state} controller={controller} date={date} editable={editable} />
    </ScrollScreen>
    <BodyEditors state={state} controller={controller} />
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
  // Cuerpo is one screen, Progreso › Cuerpo; this route stays for a single day (Historial) and for old links.
  if (!date) {
    const registrar = params.registrar === 'peso' || params.registrar === 'medidas' ? params.registrar : undefined;
    return <Redirect href={{ pathname: '/(tabs)/progress/trends/body', params: registrar ? { registrar } : {} }} />;
  }
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
/** Progreso › Cuerpo › "+" › Registrar medidas: opens a new measurement once, like useWeightEntry. */
export function useMeasurementEntry(requested: boolean, body: { state: BodyState; controller: BodyController } | null) {
  const router = useRouter();
  const used = useRef(false);
  const ready = requested && !!body && body.state.read.status === 'ready' && body.state.phase === 'idle' && !body.state.intent && !body.state.editor;
  useEffect(() => {
    if (!ready || !body || used.current) return;
    used.current = true;
    router.setParams({ registrar: undefined });
    body.controller.openMeasurement();
  }, [body, ready, router]);
}
function BodyDate({ state, controller, date, editable }: { state: BodyState; controller: BodyController; date: string; editable: boolean }) {
  const day = state.read.day?.date === date ? state.read.day : null;
  if (!day && state.read.refreshing) return <SkeletonBlock height={160} />;
  if (!day) return <View style={styles.section}><Heading level={2}>{formatBodyDate(date)}</Heading><InlineUnavailable message="No hay una lectura confirmada de esta fecha." actionLabel="Reintentar" onAction={() => void controller.load()} /></View>;
  const can = editable && !state.read.stale;
  const m = day.measurement.status === 'ok' ? day.measurement.data : null;
  return <View style={styles.section}>
    <Heading level={2}>{formatBodyDate(date)}</Heading>
    {day.weight.status === 'unavailable' ? <AppText muted>No pudimos cargar el peso de esta fecha.</AppText>
      : <Row divided={false} title="Peso" value={day.weight.data ? formatKg(day.weight.data.weightKg) : undefined} detail={day.weight.data ? undefined : 'Sin registro · tocá para cargar'}
        label={day.weight.data ? `Editar peso: ${formatKg(day.weight.data.weightKg)}` : 'Registrar peso'}
        onPress={can ? () => { if (day.weight.status === 'ok') controller.openWeight(day.weight.data ?? undefined, date); } : undefined} />}
    {day.measurement.status === 'unavailable' ? <AppText muted>No pudimos cargar la medición de esta fecha.</AppText>
      : <Row divided title="Medidas" detail={m ? measurementValues(m).map(v => `${v.label} ${v.value}`).join(' · ') : 'Sin medición · tocá para cargar'}
        label={m ? 'Editar medición' : 'Registrar medidas'}
        onPress={can ? () => { if (day.measurement.status === 'ok') controller.openMeasurement(m ?? undefined, date); } : undefined} />}
    {m ? measurementBadges(m).map(b => <AppText key={b.text} muted variant="footnote">{b.text}</AppText>) : null}
  </View>;
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm },
  hero: { gap: 2, paddingBottom: spacing.xs },
  list: { paddingTop: spacing.sm },
  row: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
  flex: { flex: 1, gap: 2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: spacing.md },
  cell: { width: '50%', gap: 2, paddingRight: spacing.md },
  cellValue: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.xs, flexWrap: 'wrap' },
  notice: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 44 },
  fabRoom: { height: 72 },
});
