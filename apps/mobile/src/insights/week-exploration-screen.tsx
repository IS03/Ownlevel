import { useCallback } from 'react';
import { ScrollView,StyleSheet,View,RefreshControl } from 'react-native';
import { useLocalSearchParams,useRouter } from 'expo-router';
import { useMobileApi } from '@/api';
import type { MobileApiClient } from '@/api/client';
import { fetchPeriodExploration,validPeriodAnchor } from '@/api/performance-insights';
import { useProgressResource } from '@/progress/use-progress-resource';
import { AppText,Heading,Button,InlineUnavailable,UnavailableState,SkeletonBlock,brandTokens,spacing,useOwnlevelTheme } from '@/design-system';
import { formatValue } from '@/progress/progress-format';
import { postsText } from './feelings-model';
import { FactRow } from './insights-screen';
import { exactPeriodRange } from './period-model';
import { periodSummaryHref,coincidenceSelection,insightsOriginOf } from './navigation';
import { WeekRecords } from './week-records';
import { WeekComparison } from './week-comparison';
import { selectedWeeks } from './week-comparison-model';
import { Coincidences } from './coincidences';
import { usePeriodReturn } from './use-period-return';

export function WeekExplorationScreen() {
  const {client}=useMobileApi(),params=useLocalSearchParams(),router=useRouter(),{colors}=useOwnlevelTheme();
  const asOf=validPeriodAnchor(params.asOf)?params.asOf:null;
  const load=useCallback((c:MobileApiClient,signal:AbortSignal)=>fetchPeriodExploration(c,asOf!,signal),[asOf]);
  const {state,data,refresh}=useProgressResource(asOf?client:null,`performance-insights|period-explore|${asOf}`,load);usePeriodReturn(refresh);
  const requested=typeof params.week==='string'?params.week:undefined;
  const index=data?(requested?data.weeks.findIndex(w=>w.start===requested):data.weeks.length-1):-1,week=data?.weeks[index];
  const selection=coincidenceSelection(params);
  const origin={...insightsOriginOf({...params,explore:'1'}),explore:'1' as const,asOf:asOf!,week:week?.start,revision:data?.sourceRevision,...selection};
  const days=week?.days??[],trained=days.filter(d=>d.training?.sessions),sessionCount=trained.reduce((n,d)=>n+d.training!.sessions,0);
  const c=(lane:'training'|'partial',key:string)=>days.reduce((n,d)=>n+Number((d[lane]?.counts as unknown as Record<string,number>|undefined)?.[key]??0),0);
  return <ScrollView contentInsetAdjustmentBehavior="automatic" style={{backgroundColor:colors.background}} contentContainerStyle={styles.scroll} refreshControl={<RefreshControl refreshing={state.status==='ready'&&state.refreshing} onRefresh={()=>void refresh()}/>}>
    {!asOf?<UnavailableState title="Período no válido" description="Abrí las semanas desde el resumen."/>:state.status==='loading'&&!data?<SkeletonBlock height={176}/>:!data||data.integrity!=='valid'?<UnavailableState title="No pudimos leer las semanas" description="Tus registros siguen guardados." action={<Button label="Reintentar" onPress={()=>void refresh()}/>}/>:params.compare==='1'?<>
      {state.status!=='ready'?<InlineUnavailable message="No pudimos actualizar. Mostramos la última lectura completa." actionLabel="Reintentar" onAction={()=>void refresh()}/>:null}
      {typeof params.revision==='string'&&params.revision!==data.sourceRevision?<AppText testID="week-revised">Los registros cambiaron desde el origen. Esta lectura completa está actualizada.</AppText>:null}
      <WeekComparison data={data} currentWeek={requested}/>
      <Coincidences data={data.coincidenceSummary} weeks={data.weeks} origin={origin} selection={selection} onRefresh={()=>void refresh()} onSelect={value=>router.setParams({coincidence:value.coincidence,coincidenceGroup:value.coincidenceGroup,coincidencePage:value.coincidencePage})}/>
    </>:!week?<UnavailableState title="Semana fuera del período" description="Volvé a abrir desde el resumen."/>:<>
      {state.status!=='ready'?<InlineUnavailable message="No pudimos actualizar. Mostramos la última lectura completa." actionLabel="Reintentar" onAction={()=>void refresh()}/>:null}
      <Heading level={2}>Semanas y días</Heading><AppText numeric>{exactPeriodRange(data.period)}</AppText>
      {typeof params.revision==='string'&&params.revision!==data.sourceRevision?<AppText testID="week-revised">Los registros cambiaron desde el origen. Esta lectura completa está actualizada.</AppText>:null}
      <Coincidences data={data.coincidenceSummary} weeks={data.weeks} origin={origin} selection={selection} onRefresh={()=>void refresh()} onSelect={value=>router.setParams({coincidence:value.coincidence,coincidenceGroup:value.coincidenceGroup,coincidencePage:value.coincidencePage})}/>
      <Button label="Comparar semanas" variant="secondary" onPress={()=>{
        const selection=selectedWeeks(data,week.start);
        if(selection)router.setParams({compare:'1',weekA:data.weeks[selection.a]!.start,weekB:data.weeks[selection.b]!.start,weekSide:undefined});
      }}/>
      <View style={styles.controls}><Button label="Semana anterior" disabled={index===0} onPress={()=>router.setParams({week:data.weeks[index-1]!.start})}/><Button label="Semana siguiente" disabled={index===data.weeks.length-1} onPress={()=>router.setParams({week:data.weeks[index+1]!.start})}/></View>
      <Heading level={2}>{exactPeriodRange(week)}</Heading>{!week.wholeWeek?<AppText muted>Semana recortada por los límites del período.</AppText>:null}
      <FactRow label="Entrenamiento" value={`${sessionCount} sesiones · ${trained.length} de ${days.length} días`}/>
      <FactRow label="Comparación completa" value={`${c('training','comparable')} de ${c('training','total')} comparables`} detail={`↑ ${c('training','improved')} · = ${c('training','observedStable')} · ↓ ${c('training','declined')}`}/>
      <FactRow label="Con contexto parcial" value={`${c('partial','comparable')} de ${c('partial','total')} comparables`} detail={`↑ ${c('partial','higher')} · = ${c('partial','same')} · ↓ ${c('partial','lower')}. No se suma al método completo.`}/>
      {week.feelings.map(o=>{const posts=[...o.priorNotComparable.posts];for(const r of o.byPrior)r.posts.forEach((n,i)=>{posts[i]!+=n;});return <FactRow key={o.kind} label={o.kind==='energy'?'Energía al terminar':'Fatiga al terminar'} value={`${o.capture.atFinish} de ${o.sessions.completed} sesiones`} detail={`${postsText(o.kind,posts)||'Sin respuestas válidas'}; ${o.capture.late} tardías, ${o.capture.captureUnknown} sin hora, ${o.sessions.notRecorded} ausentes, ${o.sessions.unreadable} ilegibles, ${o.sessions.otherInstrument} con otra escala, ${o.capture.beforeStart} con hora anterior al inicio.`}/>;})}
      <FactRow label="Mediana de peso corporal" value={week.weight?.median==null?'Sin mediana':formatValue(week.weight.median,'kg')} detail={week.wholeWeek?`${week.weight?.weighIns.length??0} pesajes; método semanal existente, mínimo 3.`:'No se calcula mediana en una semana recortada.'}/>
      <FactRow label="Cambio de mediana" value={week.weightChange?.change==null?'No se puede calcular':formatValue(week.weightChange.change,'kg')} detail="Solo entre semanas consecutivas elegibles; sin interpolación."/>
      <AppText muted>Alimentación registrada en {days.filter(d=>d.nutrition).length} de {days.length} días. No es ingesta completa; no se calcula un promedio sobre días desconocidos.</AppText>
      <WeekRecords week={week} metrics={data.metrics} origin={origin}/>
      <AppText muted>Hechos para explorar, no asociaciones validadas. No se combinan cargas de ejercicios ni escalas ordinales en un puntaje.</AppText>
    </>}
    <Button label="Volver al resumen" variant="secondary" onPress={()=>router.navigate(periodSummaryHref(asOf??undefined))}/>
  </ScrollView>;
}
const styles=StyleSheet.create({scroll:{padding:brandTokens.layout.screenPadding,paddingBottom:brandTokens.layout.tabBarHeight+spacing.xxl,gap:spacing.lg},controls:{gap:spacing.xs}});
