import { Fragment,useCallback } from 'react';
import { useMobileApi } from '@/api';
import type { MobileApiClient } from '@/api/client';
import { useProgressResource } from '@/progress/use-progress-resource';
import { fetchCoincidenceEvidence,coincidenceWeeks,isFoodKind,type FoodKind,type CoincidenceSelection,type CoincidenceEvidence,type PeriodExploration } from '@/api/performance-insights';
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
const REASONS:Record<string,string>={no_registered_meal:'sin registro elegible en la ventana',partial_macro:'nutriente incompleto',untimed_meal_in_scope:'comida sin hora de consumo explícita en el alcance',unverified_meal_time_in_scope:'hora sin verificar',no_start_time:'sin hora de inicio',invalid:'cantidad no válida',unavailable:'dato no disponible',
  no_explicit_meal_in_12h:'sin última comida explícita conocida en 12 h (dato censurado)',before_end:'antes de finalizar',late:'tardía',unknown_time:'sin momento legible',not_recorded:'sin respuesta',unreadable:'respuesta ilegible',other_instrument:'otra escala'};
const exclusions=(values:Record<string,number>)=>Object.entries(values).map(([key,n])=>`${n} ${REASONS[key]??key}`).join(' · ')||'Ninguno';
const noContrast='Sin contraste descriptivo suficiente. No significa que no haya relación.';
const routines=(r:{distinct:number;unknownSessions:number})=>`${r.distinct} rutinas registradas; ${r.unknownSessions} sesiones con rutina desconocida. Los nombres están en la evidencia.`;
const gram=(v:number|null)=>v===null?'Sin dato':formatValue(v,'g');
const FOOD_ORDER:FoodKind[]=['protein','calories','carbs','lastMeal'];
const FOOD_TITLE:Record<FoodKind,string>={protein:'Proteína previa y resultados por ejercicio',calories:'Calorías previas y resultados por ejercicio',carbs:'Carbohidratos previos y resultados por ejercicio',lastMeal:'Última comida registrada y resultados'};
const LAST_GROUP:Record<string,string>={within1h:'Hasta 1 h',oneTo3h:'Más de 1–3 h',over3h:'Más de 3–12 h'};
const foodValue=(value:{value:number|null;state:string}|undefined,kind:FoodKind)=>!value?'Dato no disponible':value.value===null?REASONS[value.state]??'Dato no disponible':kind==='lastMeal'?(value.value*60<1?'Menos de 1 min':formatValue(value.value*60,'min')):formatValue(value.value,kind==='calories'?'kcal':'g');


/** Summaries and weekly evidence reuse the period reading. Session evidence is a single explicit grouped page. */
export function Coincidences({data,weeks,origin,selection,onSelect,onRefresh}:{data:Model|undefined;weeks:PeriodExploration['weeks'];origin:InsightsOrigin;selection:Selection;onSelect:(value:Selection)=>void;onRefresh:()=>void}) {
  const router=useRouter();
  const choose=(kind:NonNullable<Selection['coincidence']>)=>onSelect(selection.coincidence===kind?{}:{coincidence:kind});
  const group=(key:string)=>onSelect({...selection,coincidencePage:undefined,coincidenceGroup:selection.coincidenceGroup===key?undefined:key});
  const selected=selection.coincidence;
  const cut=(value:number|null,unit='g')=>value===null?'sin cantidad para formar grupos':`hasta ${formatValue(value,unit)} / más de ${formatValue(value,unit)}`;
  const food=(kind:FoodKind)=>kind==='protein'?data?.protein:data?.preMeal?.[kind];
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
    {row.preMeal?<AppText muted numeric>Calorías previas: {foodValue(row.preMeal.calories,'calories')}. Carbohidratos previos: {foodValue(row.preMeal.carbs,'carbs')}. Última comida explícita registrada: {foodValue(row.preMeal.lastMeal,'lastMeal')}.</AppText>:null}
    {row.concurrency?<AppText muted numeric>{row.concurrency.sameDaySessions} sesiones en esa fecha; {(selected==='lastMeal'?row.concurrency.overlap12h:row.concurrency.overlap3h)===null?'solapamiento desconocido':`${selected==='lastMeal'?row.concurrency.overlap12h:row.concurrency.overlap3h} ventanas previas solapadas`}. No son ensayos independientes.</AppText>:null}
    <AppText muted>Energía post: {post(row.post.energy,'energy')}. Fatiga post: {post(row.post.fatigue,'fatigue')}.</AppText>
    <AppText muted variant="caption">{row.routineName??(row.routineId?'Rutina sin nombre':'Rutina desconocida')}. Completo: {row.strict.comparable} de {row.strict.total} ejercicios comparables. Parcial: {row.partial?.comparable??0} de {row.partial?.total??0}.</AppText>
    <InsightRow label="Ver sesión y evidencia por ejercicio" spoken={`Ver sesión y evidencia del ${exactPeriodDate(row.date)}, ${row.name}`} onPress={()=>router.push({pathname:'/(tabs)/train/insights',params:{...origin,date:row.date,session:row.id,before:nextDate(row.date)}})}/>
    <InsightRow label="Ver horarios y comidas" spoken={`Ver horarios y comidas de ${row.name}, ${exactPeriodDate(row.date)}`} onPress={()=>router.push({pathname:'/(tabs)/train/insights/temporal',params:{...origin,date:row.date,session:row.id}})}/>
  </View>);
  const evidence=(group:string)=>{
    if(!data||(!isFoodKind(selected)&&selected!=='timing'))return null;
    const description=isFoodKind(selected)?food(selected):null;
    if(isFoodKind(selected)&&!description)return null;
    const total=description?(group==='excluded'?description.total-description.eligible:description.groups.find(g=>g.key===group)?.sessions??0):(group==='excluded'?data.timing.unknownStart:data.timing.groups.find(g=>g.key===group)?.sessions??0);
    return <SessionEvidence key={`${origin.revision}|${selected}|${group}`} origin={origin} kind={selected} group={group} total={total} offset={Number(selection.coincidencePage??0)} renderRows={sessionRows} onPage={offset=>onSelect({...selection,coincidencePage:String(offset)})} onRefresh={onRefresh}/>;
  };
  return <View style={styles.section} testID="descriptive-coincidences">
    <Heading level={2}>Coincidencias descriptivas de tus registros</Heading>
    <AppText muted>No acreditan una relación ni su causa. Los grupos pueden tener distinta cobertura y rutinas.</AppText>
    {!data?<AppText>Estas coincidencias todavía no están disponibles. Podés seguir recorriendo semanas y días.</AppText>:<>
      {FOOD_ORDER.map(kind=>{const f=food(kind),title=FOOD_TITLE[kind],unit=kind==='calories'?'kcal':'g';return <Fragment key={kind}>
        <InsightRow label={title} detail={f?`${f.eligible} de ${f.total} sesiones con dato${f.eligibleDays===undefined?'':` · ${f.eligibleDays} de ${f.totalDays} días`} · ${kind==='lastMeal'?'Franjas fijas hasta 1 h / más de 1–3 h / más de 3–12 h':cut(f.cut,unit)}`:'No disponible en esta lectura'} spoken={`Abrir ${title[0]!.toLowerCase()+title.slice(1)}, descripción de registros`} expanded={selected===kind} onPress={()=>choose(kind)}/>
        {selected===kind?!f?<AppText>Esta descripción no está disponible en esta lectura. Podés seguir recorriendo los registros existentes.</AppText>:<View style={styles.detail}>
          <AppText muted>{kind==='lastMeal'?'Tiempo desde la última comida registrada con hora explícita dentro de 12 h. Franjas de lectura fijadas antes de mirar resultados; no son horarios recomendados.':`${kind==='protein'?'Proteína':kind==='calories'?'Calorías':'Carbohidratos'} registrados con hora explícita en las 3 h previas. Grupos por la mediana de cantidades, sin elegir según el resultado.`}</AppText>
          {kind==='carbs'?<AppText muted variant="caption">Las comidas sin hora en cualquiera de los días de Córdoba que toca la ventana impiden calcular esta cantidad. El contexto histórico conserva su regla por fecha de sesión y puede diferir al cruzar medianoche.</AppText>:null}
          {f.status==='insufficient'?<AppText>{noContrast}</AppText>:null}
          {f.contrast==='constant'?<AppText>Los valores registrados son iguales; no forman un contraste entre grupos.</AppText>:f.contrast==='empty_group'?<AppText>Hay menos de dos grupos con registros. Los grupos vacíos no se comparan.</AppText>:null}
          <AppText muted numeric>Excluidas: {exclusions(f.exclusions)}. {kind==='lastMeal'?'Última registrada no significa última consumida. Sin hora conocida no se inventa una distancia ni se interpreta ayuno.':'Sin registro no es cero ni significa que no comiste.'}</AppText>
          {f.multiSessionDays!==undefined?<AppText muted numeric>En todas las sesiones del período: {f.multiSessionDays} días con varias sesiones; {f.overlappingSessions} sesiones con ventanas de {kind==='lastMeal'?'12':'3'} h solapadas; {f.unknownOverlapSessions} sin inicio para ubicarlas. No son ensayos independientes.</AppText>:<AppText muted>Días y solapamientos no disponibles en esta lectura.</AppText>}
          <InsightRow label={`Ver sesiones fuera de los grupos de ${kind==='protein'?'proteína':kind==='calories'?'calorías':kind==='carbs'?'carbohidratos':'última comida'}`} spoken={`Ver fechas, faltantes y exclusiones de ${kind==='protein'?'proteína previa':kind==='calories'?'calorías previas':kind==='carbs'?'carbohidratos previos':'última comida registrada'}`} expanded={selection.coincidenceGroup==='excluded'} onPress={()=>group('excluded')}/>
          {selection.coincidenceGroup==='excluded'?evidence('excluded'):null}
          {f.groups.map(g=><View key={g.key} style={styles.group}>
            <AppText variant="headline">{kind==='lastMeal'?LAST_GROUP[g.key]:f.cut===null?'Grupo sin cantidades elegibles':`${g.key==='lower'?'Hasta':'Más de'} ${formatValue(f.cut,unit)}`} · {g.sessions} sesiones{g.days===undefined?'':` · ${g.days} días`}</AppText>
            {g.sessions===0?<AppText muted>Sin sesiones en este grupo; no se compara con los otros grupos.</AppText>:null}
            <FactRow label="Método completo" value={`${g.strict.comparable} de ${g.strict.total} ejercicios`} detail={`Mejoraron ${g.strict.improved}; registro similar ${g.strict.observedStable}; descendieron ${g.strict.declined}; ambiguos ${g.strict.ambiguous}; insuficientes ${g.strict.insufficient}. ${g.strictSessions} sesiones comparables${g.strictDays===undefined?'':` en ${g.strictDays} días`}.`}/>
            <FactRow label="Método parcial" value={`${g.partial.comparable} de ${g.partial.total} ejercicios`} detail={`Registro superior ${g.partial.higher}; mismo ${g.partial.same}; inferior ${g.partial.lower}; ambiguos ${g.partial.ambiguous}; insuficientes ${g.partial.insufficient}. ${g.partialSessions} sesiones comparables${g.partialDays===undefined?'':` en ${g.partialDays} días`}; no se suma al completo.`}/>
            <AppText muted variant="caption">{routines(g.routines)}</AppText>
            <InsightRow label={`Ver registros del grupo ${kind==='lastMeal'?LAST_GROUP[g.key]:g.key==='lower'?'hasta la mediana':'sobre la mediana'}`} spoken={`Ver ${g.sessions} registros del grupo ${kind==='lastMeal'?LAST_GROUP[g.key]:g.key==='lower'?'hasta la mediana':'sobre la mediana'}`} expanded={selection.coincidenceGroup===g.key} onPress={()=>group(g.key)}/>
            {selection.coincidenceGroup===g.key?evidence(g.key):null}
          </View>)}
          <AppText muted variant="caption">{kind==='lastMeal'?'Se necesitan dos franjas con al menos 3 sesiones comparables cada una, en el mismo método.':'Se necesitan al menos 3 sesiones comparables en cada grupo, en el mismo método.'}</AppText>
          <AppText muted variant="caption">Cada ejercicio usa su referencia compatible, que puede estar fuera del grupo o período. No se comparan directamente estos grupos ni se suman récords o cargas como progreso.</AppText>
        </View>:null}
      </Fragment>;})}
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

function SessionEvidence({origin,kind,group,total,offset,renderRows,onPage,onRefresh}:{origin:InsightsOrigin;kind:CoincidenceSelection['kind'];group:string;total:number;offset:number;renderRows:(rows:CoincidenceEvidence['sessionRows'])=>React.ReactNode;onPage:(offset:number)=>void;onRefresh:()=>void}) {
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
