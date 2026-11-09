import { useCallback } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMobileApi } from '@/api';
import type { MobileApiClient } from '@/api/client';
import { fetchSessionTemporal, validPeriodAnchor, type SessionTemporalDay } from '@/api/performance-insights';
import { AppText, Button, Heading, InlineUnavailable, SkeletonBlock, UnavailableState, brandTokens, spacing, useOwnlevelTheme } from '@/design-system';
import { useProgressResource } from '@/progress/use-progress-resource';
import { formatClockTime } from '@/home/format';
import { FactRow } from './insights-screen';
import { InsightRow } from './insight-row';
import { insightsOriginOf, nutritionDayHref, validSession } from './navigation';
import { exactPeriodDate } from './period-model';
import { hoursText, sessionRows } from './insights-model';
import { formatValue } from '@/progress/progress-format';
import { usePeriodReturn } from './use-period-return';

const NUTRIENTS = [['calories','Calorías','kcal'],['proteinG','Proteínas','g'],['carbsG','Carbohidratos','g'],['fatG','Grasas','g']] as const;
type Session = SessionTemporalDay['sessions'][number];
const clock = (at: string | null) => at ? `${new Intl.DateTimeFormat('es-AR', { timeZone: 'America/Argentina/Cordoba', day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(at))} · ${formatClockTime(at)}` : 'Sin hora registrada';

export function SessionTemporalScreen() {
  const { client } = useMobileApi(), router = useRouter(), params = useLocalSearchParams(), { colors } = useOwnlevelTheme();
  const date = validPeriodAnchor(params.date) ? params.date : null;
  const load = useCallback((c: MobileApiClient, signal: AbortSignal) => fetchSessionTemporal(c, date!, signal), [date]);
  const { state, data, refresh } = useProgressResource(date ? client : null, `performance-insights|session-temporal|${date}`, load);
  usePeriodReturn(refresh);
  const session = validSession(params.session) ? params.session : null;
  const origin=insightsOriginOf(params);
  const {revision:_revision,temporal:_temporal,...returnOrigin}=origin;
  const returnHref = { pathname: '/(tabs)/train/insights' as const, params: { ...returnOrigin,...((origin.explore||origin.fromSession)&&origin.revision?{revision:origin.revision}:{}),date: date ?? '', ...(session ? { session } : {}) } };
  const openDay = (day: string) => router.push(nutritionDayHref(day, { ...origin,temporal: '1', date: date!, revision: data!.sourceRevision, ...(session ? { session } : {}) }));
  const evidence = (ref: NonNullable<Session['before']['evidence']>, label: string) => <View style={styles.block}>
    <AppText variant="headline">{label} · {ref.total} registros</AppText>
    {ref.rows.map(m => <InsightRow key={m.id} label={m.entryKind === 'legacy_daily_summary' ? `${exactPeriodDate(m.date)} · Resumen diario heredado` : m.timeEvidence === 'explicit' && m.at ? clock(m.at) : `${exactPeriodDate(m.date)} · Hora no comprobada`}
      spoken={`Registro del ${exactPeriodDate(m.date)}. ${m.timeEvidence === 'explicit' && m.at ? formatClockTime(m.at) : 'Hora no comprobada'}. ${NUTRIENTS.map(([k,name,unit]) => `${name}: ${m[k] === null ? 'sin dato' : formatValue(m[k],unit)}`).join('. ')}. Abrir Nutrición`}
      detail={NUTRIENTS.map(([k, name, unit]) => `${name}: ${m[k] === null ? 'sin dato' : formatValue(m[k],unit)}`).join(' · ')} onPress={() => openDay(m.date)} />)}
    {ref.omitted ? <AppText muted>Se muestran {ref.rows.length} de {ref.total}; consultá todos en Nutrición.</AppText> : null}
    {ref.dates.map(day => <InsightRow key={day} label={`Ver Nutrición del ${exactPeriodDate(day)}`} spoken={`Ver Nutrición del ${exactPeriodDate(day)}`} onPress={() => openDay(day)} />)}
  </View>;
  return <ScrollView testID="session-temporal-screen" contentInsetAdjustmentBehavior="automatic" style={{ backgroundColor: colors.background }} contentContainerStyle={styles.scroll}
    refreshControl={<RefreshControl refreshing={state.status === 'ready' && state.refreshing} onRefresh={() => void refresh()} tintColor={colors.primary} />}>
    {!date ? <UnavailableState title="No pudimos identificar el día" description="Abrí el contexto desde Insights." />
      : state.status === 'loading' && !data ? <SkeletonBlock height={176} />
      : !data ? <UnavailableState title="No pudimos leer el contexto" description="Tus registros siguen guardados." action={<Button label="Reintentar" onPress={() => void refresh()} />} />
      : <>
        {state.status !== 'ready' ? <InlineUnavailable message="No pudimos actualizar. Mostramos la última lectura completa." actionLabel="Reintentar" onAction={() => void refresh()} /> : null}
        <Heading level={2}>Horarios y comidas</Heading><AppText numeric>{exactPeriodDate(date)}</AppText>
        <AppText muted>Horas de Córdoba. Lectura del {clock(data.calculatedAt)}.</AppText>
        {typeof params.revision === 'string' && params.revision !== data.sourceRevision ? <AppText testID="temporal-revised">Los registros cambiaron desde el día de origen. Esta lectura está actualizada.</AppText> : null}
        {!data.sessions.length ? <AppText>Sin sesiones finalizadas ese día.</AppText> : null}
        {data.sessions.map(s => <View key={s.sessionId} testID={`temporal-${s.sessionId}`} style={styles.block}>
          <Heading level={2}>{s.name}</Heading>
          <FactRow label="Inicio" value={clock(s.startedAt)} /><FactRow label="Final" value={clock(s.endedAt)} />
          <FactRow label="Duración entre inicio y final" value={s.durationMinutes === null ? 'No se puede calcular' : s.durationMinutes < 1 ? `${Math.round(s.durationMinutes * 60)} s` : `≈ ${hoursText(s.durationMinutes / 60)}`} detail="No mide tiempo de trabajo activo." />
          <AppText variant="headline">Antes de empezar</AppText>
          {sessionRows({ context: { feelings: {}, legacy: { energyLevel: null, performanceLevel: null, painLevel: null }, ...s.before } }).filter(r => ['carbs','protein','calories','last-meal'].includes(r.key)).map(r => <FactRow key={r.key} label={r.label} value={r.value} detail={r.detail} />)}
          <AppText muted>Las cantidades usan 3 h; la última comida busca hasta 12 h. Carbohidratos conserva la regla histórica; las comidas sin hora pueden afectar cada cuenta de forma distinta.</AppText>
          {s.before.coverage3h ? <AppText numeric>En las 3 h previas: {s.before.coverage3h.knownMeals} registros con hora explícita; {s.before.coverage3h.uncertainMeals} con hora incierta que podrían pertenecer.</AppText> : null}
          {s.before.lastMeal.total ? evidence(s.before.lastMeal, 'Última hora de comida registrada explícitamente') : null}
          {s.before.evidence ? evidence(s.before.evidence, 'Registros para consultar en las 12 h previas') : null}
          <AppText variant="headline">Después de terminar · 3 h</AppText>
          {!s.post ? <AppText>{s.timingState === 'no_end_time' ? 'Sin hora de final: no se puede ubicar la ventana.' : 'Horarios inconsistentes: no se puede calcular esta ventana.'}</AppText> : <>
            <AppText numeric>{clock(s.post.from)} → {clock(s.post.to)}</AppText>
            {s.post.provisional ? <AppText testID="post-provisional">Provisional: la ventana seguía abierta al corte de esta lectura.</AppText> : null}
            <AppText numeric>{s.post.knownMeals} comidas con hora explícita · {s.post.uncertainMeals} registros con hora incierta que podrían pertenecer.</AppText>
            {NUTRIENTS.map(([key,label,unit]) => { const n = s.post!.nutrients[key], known = s.post!.knownMeals - n.missing; return <FactRow key={key} label={label} value={!known ? 'Sin dato' : `${formatValue(n.recorded, unit)}${n.missing ? ' · parcial' : ''}`} detail={`${known} de ${s.post!.knownMeals} registros con este dato; no es ingesta completa.`} />; })}
            {s.post.overlaps.length ? <AppText>Se solapa con otras {s.post.overlaps.length} ventanas. Una comida puede aparecer en más de una sesión.</AppText> : null}
            {evidence(s.post.evidence, 'Registros posteriores y con hora incierta')}
          </>}
          <InsightRow label="Abrir la sesión original" spoken={`Abrir sesión original ${s.name}`} onPress={() => router.push({ pathname: '/(tabs)/train/history/[id]', params: { id: s.sessionId } })} />
        </View>)}
        <AppText muted>Lo registrado no prueba todo lo que comiste. La comida posterior es contexto posterior: no explica el rendimiento de una sesión ya terminada. No se buscaron asociaciones.</AppText>
      </>}
    <Button label="Volver al día en Insights" variant="secondary" onPress={() => router.navigate(returnHref)} />
  </ScrollView>;
}
const styles = StyleSheet.create({ scroll: { padding: brandTokens.layout.screenPadding, paddingBottom: brandTokens.layout.tabBarHeight + brandTokens.layout.tabBarInset + spacing.xl, gap: spacing.xl }, block: { gap: spacing.sm } });
