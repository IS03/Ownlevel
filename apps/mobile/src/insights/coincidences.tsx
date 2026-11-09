import { useCallback } from 'react';
import { useMobileApi } from '@/api';
import type { MobileApiClient } from '@/api/client';
import { useProgressResource } from '@/progress/use-progress-resource';
import { fetchCoincidenceEvidence,coincidenceWeeks,type CoincidenceEvidence,type PeriodExploration } from '@/api/performance-insights';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { AppText, Heading, Button, SkeletonBlock, spacing } from '@/design-system';
import { FEELING_LABELS } from '@/api/training-feelings';
import { formatValue } from '@/progress/progress-format';
import { FactRow } from './insights-screen';
import { InsightRow } from './insight-row';
import { postsText } from './feelings-model';
import { bodyWeightHref, nutritionDayHref, type InsightsOrigin } from './navigation';
import { exactPeriodDate, exactPeriodRange } from './period-model';
import { nextDate } from './insights-model';

type Model=NonNullable<PeriodExploration['coincidenceSummary']>;
type Selection=Pick<InsightsOrigin,'coincidence'|'coincidenceGroup'|'coincidencePage'>;
const BANDS={morning:'Mañana · 05–11',midday:'Mediodía · 11–15',afternoon:'Tarde · 15–20',night:'Noche · 20–05'};
const REASONS:Record<string,string>={no_registered_meal:'sin registro elegible en la ventana',partial_macro:'proteína incompleta',untimed_meal_in_scope:'comida sin hora en el alcance',unverified_meal_time_in_scope:'hora sin verificar',no_start_time:'sin hora de inicio',invalid:'cantidad no válida',unavailable:'dato no disponible',
  before_end:'antes de finalizar',late:'tardía',unknown_time:'sin momento legible',not_recorded:'sin respuesta',unreadable:'respuesta ilegible',other_instrument:'otra escala'};
const exclusions=(values:Record<string,number>)=>Object.entries(values).map(([key,n])=>`${n} ${REASONS[key]??key}`).join(' · ')||'Ninguno';
const noContrast='Sin contraste descriptivo suficiente. No significa que no haya relación.';
const routines=(r:{distinct:number;unknownSessions:number})=>`${r.distinct} rutinas registradas; ${r.unknownSessions} sesiones con rutina desconocida. Los nombres están en la evidencia.`;
const gram=(v:number|null)=>v===null?'Sin dato':formatValue(v,'g');

/** Summaries and weekly evidence reuse the period reading. Session evidence is a single explicit grouped page. */
export function Coincidences({data,weeks,origin,selection,onSelect,onRefresh}:{data:Model|undefined;weeks:PeriodExploration['weeks'];origin:InsightsOrigin;selection:Selection;onSelect:(value:Selection)=>void;onRefresh:()=>void}) {
  const router=useRouter();
  const choose=(kind:NonNullable<Selection['coincidence']>)=>onSelect(selection.coincidence===kind?{}:{coincidence:kind});
  const group=(key:string)=>onSelect({...selection,coincidencePage:undefined,coincidenceGroup:selection.coincidenceGroup===key?undefined:key});
  const selected=selection.coincidence;
  const cut=(value:number|null)=>value===null?'sin cantidad para formar grupos':`hasta ${gram(value)} / más de ${gram(value)}`;
  const post=(p:CoincidenceEvidence['sessionRows'][number]['post']['energy'],kind:'energy'|'fatigue')=>p.state==='recorded'?FEELING_LABELS[kind][p.value!-1]:REASONS[p.state];
  const allWeeks=coincidenceWeeks(weeks);
  const weekRows=(starts:string[])=>allWeeks.filter(w=>starts.includes(w.start)).map(w=>{
    const reference=allWeeks.find(r=>r.start===w.previousStart);
    return <View key={w.start} style={styles.record}>
      <AppText variant="headline" numeric>{exactPeriodRange(w)}</AppText>
      {!w.wholeWeek?<AppText muted>Semana recortada por los límites del período; no se usa como semana completa.</AppText>:null}
      <AppText numeric>Proteína: {gram(w.proteinPerRecordedDay)} por día; {w.completeDays} días completos. Mediana corporal: {w.median===null?'sin mediana':formatValue(w.median,'kg')}; cambio: {w.change===null?'no calculable':formatValue(w.change,'kg')}.</AppText>
      <AppText muted>{w.changeReason==='week_insufficient'?'Esta semana no reúne 3 pesajes.':w.changeReason==='previous_week_insufficient'?'La semana de referencia no reúne 3 pesajes.':w.changeReason==='no_previous_week'?'Sin semana de referencia en el período.':'Cambio entre medianas consecutivas elegibles.'}</AppText>
      <AppText muted numeric>{w.previousStart?`Referencia: ${exactPeriodDate(w.previousStart)}, mediana ${reference?.median==null?'no disponible':formatValue(reference.median,'kg')}. `:''}{w.weighIns.map(v=>`${exactPeriodDate(v.date)}: ${formatValue(v.value,'kg')}`).join(' · ')||'Sin pesajes elegibles de esta semana.'}</AppText>
      <InsightRow label="Ver pesajes y semana de referencia" spoken={`Ver pesajes y referencia de ${exactPeriodRange(w)}`} onPress={()=>router.push(bodyWeightHref({from:reference?.start??w.start,to:w.end},origin))}/>
      {w.days.map(d=><InsightRow key={d.date} label={exactPeriodDate(d.date)} detail={d.protein?`${gram(d.protein.recorded)} registrados; ${d.protein.missing} de ${d.records} registros sin proteína`:'Sin alimentación registrada; no es cero'} spoken={`Abrir Nutrición del ${exactPeriodDate(d.date)} y sus registros`} onPress={()=>router.push(nutritionDayHref(d.date,origin))}/>)}
    </View>;
  });
  const sessionRows=(rows:CoincidenceEvidence['sessionRows'])=>rows.map(row=><View key={row.id} style={styles.record} testID={`coincidence-session-${row.id}`}>
    <AppText variant="headline">{exactPeriodDate(row.date)} · {row.name}</AppText>
    <AppText muted numeric>Proteína previa registrada: {row.protein.value===null?REASONS[row.protein.state]:gram(row.protein.value)}.</AppText>
    <AppText muted>Energía post: {post(row.post.energy,'energy')}. Fatiga post: {post(row.post.fatigue,'fatigue')}.</AppText>
    <AppText muted variant="caption">{row.routineName??(row.routineId?'Rutina sin nombre':'Rutina desconocida')}. Completo: {row.strict.comparable} de {row.strict.total} ejercicios comparables. Parcial: {row.partial?.comparable??0} de {row.partial?.total??0}.</AppText>
    <InsightRow label="Ver sesión y evidencia por ejercicio" spoken={`Ver sesión y evidencia del ${exactPeriodDate(row.date)}, ${row.name}`} onPress={()=>router.push({pathname:'/(tabs)/train/insights',params:{...origin,date:row.date,session:row.id,before:nextDate(row.date)}})}/>
    <InsightRow label="Ver horarios y comidas" spoken={`Ver horarios y comidas de ${row.name}, ${exactPeriodDate(row.date)}`} onPress={()=>router.push({pathname:'/(tabs)/train/insights/temporal',params:{...origin,date:row.date,session:row.id}})}/>
  </View>);
  const evidence=(group:string)=>{
    if(!data||(selected!=='protein'&&selected!=='timing'))return null;
    const total=selected==='protein'?(group==='excluded'?data.protein.total-data.protein.eligible:data.protein.groups.find(g=>g.key===group)?.sessions??0):(group==='excluded'?data.timing.unknownStart:data.timing.groups.find(g=>g.key===group)?.sessions??0);
    return <SessionEvidence key={`${origin.revision}|${selected}|${group}`} origin={origin} kind={selected} group={group} total={total} offset={Number(selection.coincidencePage??0)} renderRows={sessionRows} onPage={offset=>onSelect({...selection,coincidencePage:String(offset)})} onRefresh={onRefresh}/>;
  };
  return <View style={styles.section} testID="descriptive-coincidences">
    <Heading level={2}>Coincidencias descriptivas de tus registros</Heading>
    <AppText muted>No acreditan una relación ni su causa. Los grupos pueden tener distinta cobertura y rutinas.</AppText>
    {!data?<AppText>Estas coincidencias todavía no están disponibles. Podés seguir recorriendo semanas y días.</AppText>:<>
      <InsightRow label="Proteína previa y resultados por ejercicio" detail={`${data.protein.eligible} de ${data.protein.total} sesiones con cantidad elegible · ${cut(data.protein.cut)}`} spoken="Abrir proteína previa y resultados por ejercicio, descripción de registros" expanded={selected==='protein'} onPress={()=>choose('protein')}/>
      {selected==='protein'?<View style={styles.detail}>
        <AppText muted>Proteína registrada con hora explícita en las 3 h previas. Grupos por la mediana de cantidades, sin elegir según el resultado.</AppText>
        {data.protein.status==='insufficient'?<AppText>{noContrast}</AppText>:null}
        <AppText muted numeric>Excluidas: {exclusions(data.protein.exclusions)}. Sin registro no es cero ni significa que no comiste.</AppText>
        <InsightRow label="Ver sesiones fuera de los grupos de proteína" spoken="Ver fechas, faltantes y exclusiones de proteína previa" expanded={selection.coincidenceGroup==='excluded'} onPress={()=>group('excluded')}/>
        {selection.coincidenceGroup==='excluded'?evidence('excluded'):null}
        {data.protein.groups.map(g=><View key={g.key} style={styles.group}>
          <AppText variant="headline">{data.protein.cut===null?'Grupo sin cantidades elegibles':`${g.key==='lower'?'Hasta':'Más de'} ${gram(data.protein.cut)}`} · {g.sessions} sesiones</AppText>
          <FactRow label="Método completo" value={`${g.strict.comparable} de ${g.strict.total} ejercicios`} detail={`Mejoraron ${g.strict.improved}; registro similar ${g.strict.observedStable}; descendieron ${g.strict.declined}; ambiguos ${g.strict.ambiguous}; insuficientes ${g.strict.insufficient}. ${g.strictSessions} sesiones comparables.`}/>
          <FactRow label="Método parcial" value={`${g.partial.comparable} de ${g.partial.total} ejercicios`} detail={`Registro superior ${g.partial.higher}; mismo ${g.partial.same}; inferior ${g.partial.lower}; ambiguos ${g.partial.ambiguous}; insuficientes ${g.partial.insufficient}. ${g.partialSessions} sesiones comparables; no se suma al completo.`}/>
          <AppText muted variant="caption">{routines(g.routines)}</AppText>
          <InsightRow label={`Ver registros del grupo ${g.key==='lower'?'hasta la mediana':'sobre la mediana'}`} spoken={`Ver ${g.sessions} registros del grupo ${g.key==='lower'?'hasta la mediana':'sobre la mediana'}`} expanded={selection.coincidenceGroup===g.key} onPress={()=>group(g.key)}/>
          {selection.coincidenceGroup===g.key?evidence(g.key):null}
        </View>)}
        <AppText muted variant="caption">Cada ejercicio usa su referencia compatible, que puede estar fuera del período. Récords y cargas no se suman como progreso.</AppText>
      </View>:null}
      <InsightRow label="Horarios y respuestas post" detail={`${data.timing.total-data.timing.unknownStart} de ${data.timing.total} sesiones con hora de inicio`} spoken="Abrir horarios y distribuciones de energía y fatiga post" expanded={selected==='timing'} onPress={()=>choose('timing')}/>
      {selected==='timing'?<View style={styles.detail}>
        <AppText muted>Horas de Córdoba. Respuestas declaradas post desde el final hasta 2 h después, según el reloj registrado; no mide una causa ni verifica ese reloj.</AppText>
        {!data.timing.energyReady?<AppText>Energía: {noContrast}</AppText>:null}{!data.timing.fatigueReady?<AppText>Fatiga: {noContrast}</AppText>:null}
        <AppText muted numeric>{data.timing.unknownStart} sesiones sin hora legible no entran en una banda.</AppText>
        <InsightRow label="Ver sesiones sin horario" spoken="Ver sesiones fuera de las bandas por falta de horario" expanded={selection.coincidenceGroup==='excluded'} onPress={()=>group('excluded')}/>
        {selection.coincidenceGroup==='excluded'?evidence('excluded'):null}
        {data.timing.groups.map(g=><View key={g.key} style={styles.group}>
          <AppText variant="headline">{BANDS[g.key]} · {g.sessions} sesiones</AppText>
          {(['energy','fatigue'] as const).map(kind=><FactRow key={kind} label={kind==='energy'?'Energía post':'Fatiga post'} value={`${g[kind].eligible} de ${g[kind].total} respuestas`} detail={`${postsText(kind,g[kind].posts)||'Sin respuestas elegibles'}. Fuera del conteo: ${exclusions(g[kind].exclusions)}.`}/>)}
          <AppText muted variant="caption">{routines(g.routines)}</AppText>
          <InsightRow label={`Ver sesiones de ${BANDS[g.key]}`} spoken={`Ver ${g.sessions} sesiones de ${BANDS[g.key]}`} expanded={selection.coincidenceGroup===g.key} onPress={()=>group(g.key)}/>
          {selection.coincidenceGroup===g.key?evidence(g.key):null}
        </View>)}
      </View>:null}
      <InsightRow label="Proteína semanal y peso corporal" detail={`${data.body.total-data.body.excludedNutrition} de ${data.body.total} semanas con cobertura de proteína · ${cut(data.body.cut)}`} spoken="Abrir proteína registrada semanal y cambios de mediana de peso corporal" expanded={selected==='body'} onPress={()=>choose('body')}/>
      {selected==='body'?<View style={styles.detail}>
        <AppText muted>Proteína registrada por día con dato completo en los registros; mínimo 4 de 7 días. Igual cobertura no demuestra ingesta completa. Coincidencia de la misma semana, sin atribuir un cambio del peso a la alimentación.</AppText>
        {data.body.status==='insufficient'?<AppText>{noContrast}</AppText>:null}
        <AppText muted numeric>{data.body.excludedNutrition} semanas sin esa cobertura; los días parciales o desconocidos no se dividen como cero.</AppText>
        <InsightRow label="Ver semanas fuera de los grupos" spoken="Ver semanas con cobertura insuficiente o recortadas" expanded={selection.coincidenceGroup==='excluded'} onPress={()=>group('excluded')}/>
        {selection.coincidenceGroup==='excluded'?weekRows(allWeeks.filter(w=>w.proteinPerRecordedDay===null).map(w=>w.start)):null}
        {data.body.groups.map(g=><View key={g.key} style={styles.group}>
          <AppText variant="headline">{data.body.cut===null?'Grupo sin cantidades elegibles':`${g.key==='lower'?'Hasta':'Más de'} ${gram(data.body.cut)} por día registrado`}</AppText>
          <FactRow label="Cambio de mediana corporal" value={`${g.eligible} de ${g.weeks} semanas calculables`} detail={`Subió ${g.increased}; igual ${g.same}; bajó ${g.decreased}. Sin diferencia calculable: ${g.weeks-g.eligible}.`}/>
          <AppText muted numeric>{g.completeDays} días completos en proteína, {g.partialDays} parciales, {g.unknownDays} desconocidos.</AppText>
          <InsightRow label={`Ver semanas del grupo ${g.key==='lower'?'hasta la mediana':'sobre la mediana'}`} spoken={`Ver ${g.weeks} semanas y sus registros`} expanded={selection.coincidenceGroup===g.key} onPress={()=>group(g.key)}/>
          {selection.coincidenceGroup===g.key?weekRows(allWeeks.filter(w=>w.proteinPerRecordedDay!==null&&data.body.cut!==null&&(g.key==='lower'?w.proteinPerRecordedDay<=data.body.cut:w.proteinPerRecordedDay>data.body.cut)).map(w=>w.start)):null}
        </View>)}
        <AppText muted variant="caption">Semanas enteras y al menos 3 pesajes por semana; cambios solo entre consecutivas elegibles, sin interpolar. Es peso corporal, no carga levantada.</AppText>
      </View>:null}
    </>}
  </View>;
}
const styles=StyleSheet.create({section:{gap:spacing.sm},detail:{gap:spacing.md},group:{gap:spacing.xs,paddingVertical:spacing.sm},record:{gap:spacing.xs,paddingVertical:spacing.md}});

function SessionEvidence({origin,kind,group,total,offset,renderRows,onPage,onRefresh}:{origin:InsightsOrigin;kind:'protein'|'timing';group:string;total:number;offset:number;renderRows:(rows:CoincidenceEvidence['sessionRows'])=>React.ReactNode;onPage:(offset:number)=>void;onRefresh:()=>void}) {
  const {client}=useMobileApi(),asOf=origin.asOf!,revision=origin.revision!;
  const load=useCallback((c:MobileApiClient,signal:AbortSignal)=>fetchCoincidenceEvidence(c,asOf,revision,kind,group,offset,signal),[asOf,revision,kind,group,offset]);
  const validPage=offset===0||offset<total;
  const {data,state,refresh}=useProgressResource(validPage?client:null,`coincidence-evidence|${asOf}|${revision}|${kind}|${group}|${offset}`,load);
  if(!validPage)return <View><AppText>Esta página ya no pertenece al grupo actualizado.</AppText><Button label="Volver a la primera página" onPress={()=>onPage(0)}/></View>;
  if(!data)return state.status==='loading'?<SkeletonBlock height={96}/>:<View><AppText>No pudimos leer la evidencia. No significa que el grupo esté vacío.</AppText><Button label="Reintentar evidencia" onPress={()=>void refresh()}/></View>;
  if(data.status==='revision_changed'||data.sourceRevision!==revision)return <View><AppText>Los registros cambiaron. Actualizá el resumen antes de abrir su evidencia.</AppText><Button label="Actualizar resumen" onPress={onRefresh}/></View>;
  return <View style={styles.detail}>
    {state.status!=='ready'?<View><AppText>No pudimos actualizar esta página. Mostramos su lectura anterior.</AppText><Button label="Reintentar evidencia" onPress={()=>void refresh()}/></View>:null}
    <AppText numeric>{data.total===0?'Sin registros en este grupo.':`Registros ${offset+1}–${offset+data.sessionRows.length} de ${data.total}`}</AppText>
    {renderRows(data.sessionRows)}
    {offset>0?<Button label="Página anterior de evidencia" variant="secondary" onPress={()=>onPage(Math.max(0,offset-25))}/>:null}
    {data.nextOffset!==null?<Button label="Ver siguientes registros" variant="secondary" onPress={()=>onPage(data.nextOffset!)}/>:null}
  </View>;
}
