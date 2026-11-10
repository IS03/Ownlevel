import { useCallback } from 'react';
import { RefreshControl } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { MobileApiClient } from '@/api/client';
import { fetchHistoryDay, historyHasActivity, shiftHistoryDate } from '@/api/history';
import { isNutritionDate } from '@/api/nutrition-day';
import { AppText, Button, Heading, InlineUnavailable, ListRow, ScrollScreen, SkeletonBlock, Surface, useOwnlevelTheme } from '@/design-system';
import { amount, displayNutritionDate, nutrientAmount, signedAmount } from '@/nutrition/day-format';
import { metricValue } from '@/nutrition/day-content';
import { formatKg, measurementBadges, measurementValues } from '@/body/body-model';
import { useHistoryResource } from './use-history-resource';
import { historyDayHref } from './navigation';

export function HistoryDayScreen() {
  const params = useLocalSearchParams(), date = typeof params.date === 'string' ? params.date : '';
  return isNutritionDate(date) ? <Day key={date} date={date} month={typeof params.historyMonth === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(params.historyMonth) ? params.historyMonth : undefined} />
    : <ScrollScreen><AppText>Fecha inválida.</AppText></ScrollScreen>;
}
function Day({ date, month }: { date: string; month?: string }) {
  const router = useRouter(), { colors } = useOwnlevelTheme();
  const read = useCallback((client: MobileApiClient, signal: AbortSignal) => fetchHistoryDay(client, date, signal), [date]);
  const { data, state, stale, refresh } = useHistoryResource(`day:${date}`, read);
  const origin = { historyDate: date, ...(month ? { historyMonth: month } : {}) };
  const fact = data?.discovery?.days[0];
  const nutrition = data?.nutrition.status === 'ok' && data.nutrition.data.dayState === 'recorded' ? data.nutrition.data : null;
  const partial = data && (!data.discovery || Object.values(data.discovery.availability).some(s => s === 'unavailable')
    || [data.training, data.activeSession, data.nutrition, data.body.weight, data.body.measurement, data.metrics].some(s => s.status === 'unavailable'));
  const active = data?.activeSession.status === 'ok' ? data.activeSession.data : null;
  const sessions = data?.training.status === 'ok' ? data.training.data.sessions : null;
  const total = fact?.completedSessionsCount;
  const countMismatch = total != null && sessions !== null && total < sessions.length;
  const contentPresent = !!active || (data?.training.status === 'ok' && data.training.data.sessions.length > 0)
    || !!nutrition?.summary.entryCount || (data?.body.weight.status === 'ok' && !!data.body.weight.data)
    || (data?.body.measurement.status === 'ok' && !!data.body.measurement.data)
    || (data?.metrics.status === 'ok' && data.metrics.data.metrics.some(m => m.value !== null));
  const unavailable = <InlineUnavailable message="No pudimos leer esta sección." actionLabel="Reintentar" onAction={() => void refresh()} />;
  return <ScrollScreen testID="global-history-day" refreshControl={<RefreshControl refreshing={state.status === 'ready' && state.refreshing} onRefresh={() => void refresh()} tintColor={colors.primary} />}>
    <Heading level={1}>{displayNutritionDate(date)}</Heading>
    {data?.today === date ? <AppText variant="label">Hoy · en curso</AppText> : null}
    <Button label="Día anterior" variant="secondary" onPress={() => router.replace(historyDayHref(shiftHistoryDate(date, -1), month))} />
    <Button label="Día siguiente" variant="secondary" disabled={!data || date >= data.today} onPress={() => router.replace(historyDayHref(shiftHistoryDate(date, 1), month))} />
    {data && date !== data.today ? <Button label="Volver a hoy" variant="quiet" onPress={() => router.replace(historyDayHref(data.today, month))} /> : null}
    {month ? <Button label="Volver al calendario" variant="quiet" onPress={() => router.navigate({ pathname: '/history/calendar', params: { month } })} /> : null}
    {!data ? state.status === 'loading' ? <SkeletonBlock height={250} /> : <InlineUnavailable message="No pudimos cargar esta fecha. Elegí una fecha hasta hoy." actionLabel="Reintentar" onAction={() => void refresh()} /> : <>
      {stale ? <InlineUnavailable message="Mostramos la última lectura de esta fecha. No pudo actualizarse." actionLabel="Reintentar" onAction={() => void refresh()} /> : null}
      {partial ? <AppText accessibilityRole="alert">Cobertura parcial. Los datos disponibles siguen visibles.</AppText> : null}
      {!partial && fact && historyHasActivity(fact) === false && !contentPresent ? <AppText testID="global-day-empty">No hay registros en esta fecha.</AppText> : null}
      <Surface><Heading level={2}>Training</Heading>
        <AppText numeric>{countMismatch ? 'Recuento por confirmar' : total == null ? 'Total de sesiones terminadas no disponible' : `${total} ${total === 1 ? 'sesión terminada' : 'sesiones terminadas'}`}</AppText>
        {sessions !== null && (countMismatch ? <AppText muted>La vista previa y el total no coinciden. Actualizá esta fecha o consultá Training del día.</AppText>
          : total == null ? <AppText muted>Vista previa de hasta 3 sesiones; el total no está disponible. Consultá Training del día.</AppText>
          : total > sessions.length ? <AppText muted numeric>Vista previa: {sessions.length} de {total} sesiones. Consultá todas en Training del día.</AppText> : null)}
        {data.training.status === 'unavailable' ? unavailable : data.training.data.sessions.map(s => <ListRow key={s.id}
          title={s.name || 'Sesión sin nombre'} subtitle="Terminada"
          accessibilityLabel={`Abrir sesión ${s.name || 'sin nombre'}, terminada. ${displayNutritionDate(date)}`}
          accessibilityHint="Muestra el detalle y las series originales."
          testID={`history-day-session-${s.id}`}
          onPress={() => router.push({ pathname: '/(tabs)/train/history/[id]', params: { id: s.id, ...origin } })} />)}
        {data.activeSession.status === 'unavailable' ? <AppText>No pudimos confirmar si hay una sesión en curso.</AppText> : active ? <AppText>{active.name} · en curso</AppText> : null}
        <Button label="Abrir Training del día" variant="secondary" onPress={() => router.navigate({ pathname: '/(tabs)/train/day/[date]', params: { date, ...origin } })} />
        {active ? <Button label="Abrir sesión en curso" variant="quiet" onPress={() => router.navigate({ pathname: '/(tabs)/train/session/[id]', params: { id: active.id, ...origin } })} /> : null}
      </Surface>
      <Surface><Heading level={2}>Nutrición</Heading>
        {data.nutrition.status === 'unavailable' ? unavailable : !nutrition ? <AppText>Sin registro nutricional.</AppText> : <>
          <AppText>Consumo: {nutrientAmount(nutrition.summary.calories, nutrition.summary.entryCount, 'kcal')}</AppText>
          <AppText>Proteína: {nutrientAmount(nutrition.summary.proteinG, nutrition.summary.entryCount, 'g')}</AppText>
          <AppText>Objetivo: {amount(nutrition.context.calorieTarget, 'kcal')}</AppText>
          <AppText>Diferencia al objetivo: {signedAmount(nutrition.summary.entryCount > 0 && nutrition.summary.calories.missingCount === nutrition.summary.entryCount ? null : nutrition.context.deltaVsTargetKcal)}{nutrition.summary.calories.missingCount > 0 ? ' · parcial' : ''}</AppText>
          <AppText>Gasto: {amount(nutrition.context.expenditureKcal, 'kcal')}</AppText>
          <AppText>Balance: {signedAmount(nutrition.summary.entryCount > 0 && nutrition.summary.calories.missingCount === nutrition.summary.entryCount ? null : nutrition.context.energyBalanceKcal)}{nutrition.summary.calories.missingCount > 0 ? ' · parcial' : ''}</AppText>
          <AppText>{nutrition.summary.mealCount} comidas · {nutrition.summary.entryCount} entradas{nutrition.summary.entryCount > nutrition.summary.mealCount ? ' · incluye resumen histórico' : ''}</AppText>
          {fact?.hasExplicitOverrides ? <AppText>Ajustes explícitos de esta fecha.</AppText> : null}
        </>}
        <Button label="Abrir Nutrición del día" variant="secondary" onPress={() => router.navigate({ pathname: '/(tabs)/nutrition', params: { date, ...origin } })} />
      </Surface>
      <Surface><Heading level={2}>Cuerpo</Heading>
        {data.body.weight.status === 'unavailable' ? unavailable : <AppText>Peso: {data.body.weight.data ? `${formatKg(data.body.weight.data.weightKg)}${data.body.weight.data.weightKg <= 0 ? ' · No válido como peso corporal' : ''}` : 'Sin registro'}</AppText>}
        {data.body.measurement.status === 'unavailable' ? unavailable : data.body.measurement.data ? <>
          {measurementValues(data.body.measurement.data).map(v => <AppText key={v.field}>{v.label}: {v.value}</AppText>)}
          {measurementBadges(data.body.measurement.data).map(b => <AppText key={b.text} muted>{b.text}</AppText>)}
        </> : <AppText>Sin medición corporal.</AppText>}
        <Button label="Abrir Cuerpo del día" variant="secondary" onPress={() => router.navigate({ pathname: '/(tabs)/progress/body', params: { date, ...origin } })} />
      </Surface>
      <Surface><Heading level={2}>Métricas</Heading>
        {data.metrics.status === 'unavailable' ? unavailable : <>
          {data.metrics.data.metrics.filter(m => m.value !== null).map(m => <AppText key={m.id}>{m.label}{m.isActive ? '' : ' · archivada'}: {metricValue(m, m.value)}</AppText>)}
          <AppText muted>{data.metrics.data.metrics.filter(m => m.isActive && m.value === null).length} métricas activas sin valor.</AppText>
        </>}
        <Button label="Abrir Métricas del día" variant="secondary" onPress={() => router.navigate({ pathname: '/(tabs)/progress/metrics', params: { date, ...origin } })} />
      </Surface>
    </>}
  </ScrollScreen>;
}
