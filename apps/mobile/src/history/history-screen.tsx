import { useCallback } from 'react';
import { RefreshControl, View } from 'react-native';
import { useRouter } from 'expo-router';
import { fetchHistoryRange, historyHasActivity } from '@/api/history';
import type { MobileApiClient } from '@/api/client';
import { AppText, Button, EmptyState, Heading, InlineUnavailable, ListRow, ScrollScreen, Separator, SkeletonBlock, useOwnlevelTheme } from '@/design-system';
import { formatBodyDate } from '@/body/body-model';
import { useHistoryResource } from './use-history-resource';
import { historyDayHref } from './navigation';
import { displayNutritionDate } from '@/nutrition/day-format';
import { historyAreaLabels, historyStyles } from './history-presentation';

export function HistoryScreen() {
  const router = useRouter(), { colors } = useOwnlevelTheme();
  const read = useCallback((client: MobileApiClient, signal: AbortSignal) => fetchHistoryRange(client, undefined, signal), []);
  const { data, state, stale, refresh } = useHistoryResource('recent', read);
  const days = data?.days.filter(d => historyHasActivity(d) === true).reverse() ?? [];
  const partial = data && Object.values(data.availability).some(s => s === 'unavailable');
  return <ScrollScreen testID="global-history" refreshControl={<RefreshControl refreshing={state.status === 'ready' && state.refreshing}
    onRefresh={() => void refresh()} tintColor={colors.primary} />}>
    <View style={historyStyles.caption}>
      <AppText muted variant="caption">RECORRIDO POR FECHA</AppText>
      <Heading level={1}>Historial</Heading>
      <AppText muted>Los registros de cada día, juntos.</AppText>
      <AppText muted variant="footnote">Últimos 30 días{data ? ` · ${formatBodyDate(data.effectiveRange.from)} — ${formatBodyDate(data.effectiveRange.to)}` : ''}</AppText>
    </View>
    <View style={historyStyles.controls}>
      <Button icon="calendar" label="Calendario" onPress={() => router.push('/history/calendar')} variant="secondary" />
      {data ? <Button label="Abrir hoy" onPress={() => router.push(historyDayHref(data.today))} variant="quiet" /> : null}
    </View>
    {!data ? state.status === 'loading' ? <SkeletonBlock height={180} /> : <InlineUnavailable message="No pudimos cargar el historial." actionLabel="Reintentar" onAction={() => void refresh()} /> : <>
      {stale ? <InlineUnavailable message="Mostramos la última lectura confirmada. No se pudo actualizar." actionLabel="Reintentar" onAction={() => void refresh()} /> : null}
      {partial ? <InlineUnavailable message="Cobertura parcial: algunos dominios no están disponibles." actionLabel="Reintentar" onAction={() => void refresh()} /> : null}
      {!days.length ? partial ? <AppText muted>No hay actividad confirmada en las fuentes disponibles.</AppText>
        : <EmptyState title="Sin actividad reciente" description="Podés explorar fechas anteriores en el calendario." /> : <View>{days.map(d =>
        <View key={d.date}>
          <Separator />
          <ListRow title={d.date === data.today ? 'Hoy · en curso' : displayNutritionDate(d.date)}
            subtitle={historyAreaLabels(d).join(' · ')}
            accessibilityLabel={`${formatBodyDate(d.date)}. ${historyAreaLabels(d).join(', ')}`}
            accessibilityHint="Abre los registros de esta fecha exacta."
            onPress={() => router.push(historyDayHref(d.date))} />
        </View>)}</View>}
    </>}
  </ScrollScreen>;
}
