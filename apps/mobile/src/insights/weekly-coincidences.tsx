import { View,StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { AppText,spacing } from '@/design-system';
import { weeklyNutritionGroups,WEEKLY_NUTRIENTS,type WeeklyNutrient,type PeriodExploration } from '@/api/performance-insights';
import { formatValue } from '@/progress/progress-format';
import { InsightRow } from './insight-row';
import { FactRow } from './insights-screen';
import { bodyWeightHref,nutritionDayHref,type InsightsOrigin } from './navigation';
import { exactPeriodDate,exactPeriodRange } from './period-model';
import { nextDate } from './insights-model';
const LABEL:Record<WeeklyNutrient,string>={calories:'Calorías',proteinG:'Proteínas',carbsG:'Carbohidratos',fatG:'Grasas'};
type Selection=Pick<InsightsOrigin,'coincidence'|'coincidenceGroup'|'coincidencePage'|'coincidenceView'|'weeklyNutrient'|'weeklyOutcome'>;
function TrainingResults({value:g}:{value:ReturnType<typeof weeklyNutritionGroups>['groups'][number]['weeks'][number]['training']}) {
  return <>
          <FactRow label="Método completo" value={`${g.strict.comparable} de ${g.strict.total} ejercicios`} detail={`Mejoraron ${g.strict.improved}; registro similar ${g.strict.observedStable}; descendieron ${g.strict.declined}; ambiguos ${g.strict.ambiguous}; insuficientes ${g.strict.insufficient}. No comparables: ${g.strict.total-g.strict.comparable}. ${g.strictWeeks} semanas; ${g.strictDays} días con comparación; ${g.strictSessions===null?'sesiones comparables no disponibles en esta versión':`${g.strictSessions} sesiones comparables`}.`}/>
          <FactRow label="Método parcial" value={`${g.partial.comparable} de ${g.partial.total} ejercicios`} detail={`Registro superior ${g.partial.higher}; mismo ${g.partial.same}; inferior ${g.partial.lower}; ambiguos ${g.partial.ambiguous}; insuficientes ${g.partial.insufficient}. No comparables: ${g.partial.total-g.partial.comparable}. ${g.partialWeeks} semanas; ${g.partialDays} días con comparación; ${g.partialSessions===null?'sesiones comparables no disponibles en esta versión':`${g.partialSessions} sesiones comparables`}. No se suma al completo.`}/>
  </>;
}
/** Reuses transported days: selectors and group evidence never request another period. */
export function WeeklyCoincidences({weeks,origin,selection,onSelect}:{weeks:PeriodExploration['weeks'];origin:InsightsOrigin;selection:Selection;onSelect:(v:Selection)=>void}) {
  const router=useRouter(),nutrient=selection.weeklyNutrient??'proteinG',outcome=selection.weeklyOutcome??'weight';
  const model=weeklyNutritionGroups(weeks,nutrient),unit=nutrient==='calories'?'kcal':'g',amount=(v:number|null)=>v===null?'no calculable':formatValue(v,unit);
  const chooseGroup=(key:string)=>onSelect({...selection,coincidenceGroup:selection.coincidenceGroup===key?undefined:key});
  const coverage=(w:{completeDays:number;partialDays:number;unknownDays:number;noMealDays:number})=>`${w.completeDays} días utilizables; ${w.partialDays} parciales; ${w.unknownDays} sin dato del nutriente; ${w.noMealDays} sin comidas`;
  const records=(rows:typeof model.rows)=>rows.map(w=>{
    const reference=model.rows.find(r=>r.start===w.previousStart);
    return <View style={styles.week} key={w.start} testID={`weekly-record-${w.start}`}>
      <AppText variant="headline" numeric>{exactPeriodRange(w)}</AppText>
      <AppText numeric>{LABEL[nutrient]}: {amount(w.amountPerRecordedDay)} por día con dato completo en los registros. {coverage(w)}.</AppText>
      {!w.wholeWeek?<AppText muted>Semana recortada por el período; fuera de los grupos.</AppText>:w.amountPerRecordedDay===null?<AppText muted>No reúne 4 días utilizables; fuera de los grupos.</AppText>:null}
      {outcome==='weight'?<>
        <AppText numeric>Mediana corporal: {w.median===null?'no calculable':formatValue(w.median,'kg')}; {w.weighIns.length} pesajes. cambio: {w.change===null?'no calculable':formatValue(w.change,'kg')}.</AppText>
        <AppText muted>{w.changeReason==='week_insufficient'?'Esta semana no reúne 3 pesajes.':w.changeReason==='previous_week_insufficient'?'La semana anterior no reúne 3 pesajes; el hueco corta la cadena.':w.changeReason==='no_previous_week'?'Sin semana de referencia en el período.':'Cambio entre medianas consecutivas elegibles.'}</AppText>
        <AppText muted numeric>{w.previousStart?`Referencia: ${exactPeriodDate(w.previousStart)}, mediana ${reference?.median==null?'no disponible':formatValue(reference.median,'kg')}. `:''}{w.weighIns.map(v=>`${exactPeriodDate(v.date)}: ${formatValue(v.value,'kg')}`).join(' · ')||'Sin pesajes elegibles de esta semana.'}</AppText>
        <InsightRow label="Ver pesajes y semana de referencia" spoken={`Ver pesajes y referencia de ${exactPeriodRange(w)}`} onPress={()=>router.push(bodyWeightHref({from:reference?.start??w.start,to:w.end},origin))}/>
      </>:<>
        <AppText numeric>{w.training.sessions} sesiones en {w.training.trainingDays} días.</AppText>
        <TrainingResults value={w.training}/>
        <AppText muted>{w.trainingCoverage?`${w.trainingCoverage.routines.distinct} rutinas registradas; ${w.trainingCoverage.routines.unknownSessions} sesiones con rutina desconocida. Nombres y referencias en las sesiones del día.`:'Cobertura por sesión y rutinas no disponibles en esta versión del servidor. Los conteos de ejercicios y días siguen disponibles.'}</AppText>
      </>}
      {w.days.map(d=><View key={d.date}>
        <InsightRow label={exactPeriodDate(d.date)} detail={d.records===0?'Sin comidas registradas; no es cero.':d.state==='unknown'?`Sin dato de ${LABEL[nutrient].toLocaleLowerCase('es-AR')} en los ${d.records} registros.`:`${formatValue(d.nutrient!.recorded,unit)} registrados; ${d.nutrient!.missing} de ${d.records} registros sin ${LABEL[nutrient].toLocaleLowerCase('es-AR')}${d.state==='usable'?' · utilizable':d.state==='partial'?' · parcial':' · sin dato'}`} spoken={`Abrir Nutrición del ${exactPeriodDate(d.date)} y sus registros`} onPress={()=>router.push(nutritionDayHref(d.date,origin))}/>
        {outcome==='training'&&d.training?<InsightRow label={`Entrenamiento · ${d.training.sessions} sesiones`} detail={`Completo ${d.training.counts.comparable} de ${d.training.counts.total} ejercicios; parcial ${d.partial?.counts.comparable??0} de ${d.partial?.counts.total??0}.`} spoken={`Ver sesiones y comparaciones del ${exactPeriodDate(d.date)}`} onPress={()=>router.push({pathname:'/(tabs)/train/insights',params:{...origin,date:d.date,before:nextDate(d.date)}})}/>:null}
      </View>)}
    </View>;
  });
  return <>
    <InsightRow label="Alimentación semanal, entrenamiento y peso" detail={`${LABEL[nutrient]} · ${outcome==='training'?'Entrenamiento':'Peso corporal'} · ${model.rows.length-model.excluded.length} de ${model.rows.length} semanas con cobertura`} spoken="Abrir alimentación semanal, entrenamiento y peso corporal" expanded={selection.coincidence==='body'} onPress={()=>onSelect(selection.coincidence==='body'?{}:{coincidence:'body'})}/>
    {selection.coincidence==='body'?<View style={styles.detail} testID="weekly-coincidences">
      {WEEKLY_NUTRIENTS.map(key=><InsightRow key={key} label={LABEL[key]} spoken={`Elegir ${LABEL[key].toLocaleLowerCase('es-AR')} semanales`} expanded={nutrient===key} onPress={()=>onSelect({...selection,weeklyNutrient:key,coincidenceGroup:undefined})}/>)}
      <InsightRow label="Entrenamiento" spoken="Ver resultados de entrenamiento por alimentación semanal" expanded={outcome==='training'} onPress={()=>onSelect({...selection,weeklyOutcome:'training'})}/>
      <InsightRow label="Peso corporal" spoken="Ver peso corporal por alimentación semanal" expanded={outcome==='weight'} onPress={()=>onSelect({...selection,weeklyOutcome:'weight'})}/>
      <AppText muted>Promedio registrado por día utilizable: semana entera, al menos 4 de 7 días con comidas y todos sus registros completos en este nutriente. No confirma toda la ingesta. Igual cobertura tampoco. Los nutrientes pueden coincidir; no se ajustó por los demás.</AppText>
      <AppText numeric>{model.cut===null?'Sin cantidades para formar grupos.':`Corte: hasta ${amount(model.cut)} / más de ${amount(model.cut)} por día registrado; mediana de las semanas elegibles, sin elegir por resultados.`}</AppText>
      {model.contrast!=='available'?<AppText>Sin contraste alimentario suficiente: {model.contrast==='constant'?'los valores son iguales':model.contrast==='empty_group'?'hay un grupo vacío':'no hay semanas con cobertura'}. No significa que no haya relación.</AppText>:null}
      <AppText muted numeric>Fuera de los grupos: {model.excludedPartial} semanas recortadas; {model.excludedCoverage} enteras con menos de 4 días utilizables.</AppText>
      <InsightRow label="Ver semanas fuera de los grupos" spoken="Ver semanas con cobertura insuficiente o recortadas" expanded={selection.coincidenceGroup==='excluded'} onPress={()=>chooseGroup('excluded')}/>
      {selection.coincidenceGroup==='excluded'?records(model.excluded):null}
      {model.groups.map(g=><View key={g.key} style={styles.group}>
        <AppText variant="headline" numeric>{model.cut===null?'Grupo sin cantidades elegibles':`${g.key==='lower'?'Hasta':'Más de'} ${amount(model.cut)} por día registrado`} · {g.weeks.length} semanas</AppText>
        <AppText muted numeric>{g.completeDays} días utilizables; {g.partialFoodDays} parciales; {g.unknownDays} sin dato del nutriente; {g.noMealDays} sin comidas.</AppText>
        {outcome==='weight'?<FactRow label="Cambio de mediana corporal" value={`${g.body.eligible} de ${g.weeks.length} semanas calculables`} detail={`Subió ${g.body.increased}; igual ${g.body.same}; bajó ${g.body.decreased}. Sin diferencia calculable: ${g.weeks.length-g.body.eligible}.`}/>:<>
          <AppText numeric>{g.sessions} sesiones en {g.trainingDays} días entrenados.</AppText>
          <TrainingResults value={g}/>
        </>}
        <InsightRow label={`Ver semanas del grupo ${g.key==='lower'?'hasta la mediana':'sobre la mediana'}`} spoken={`Ver ${g.weeks.length} semanas y sus registros del grupo ${g.key==='lower'?'hasta la mediana':'sobre la mediana'}`} expanded={selection.coincidenceGroup===g.key} onPress={()=>chooseGroup(g.key)}/>
        {selection.coincidenceGroup===g.key?records(g.weeks):null}
      </View>)}
      {outcome==='weight'?<>
        {!model.bodyReady?<AppText>Sin contraste descriptivo suficiente: se necesitan 2 cambios calculables en cada grupo. No significa que no haya relación.</AppText>:null}
        <AppText muted>Alimentación de la semana W y cambio de peso que termina en W: hay solapamiento temporal; no acredita anterioridad ni causa. Medianas con 3 pesajes y cambios entre semanas consecutivas elegibles. Los huecos cortan la cadena. Es peso corporal, no carga levantada.</AppText>
      </>:<>
        {!model.strictReady?<AppText muted>Completo: sin contraste suficiente; se necesitan 2 semanas con ejercicios comparables en cada grupo.</AppText>:null}{!model.partialReady?<AppText muted>Parcial: sin contraste suficiente; se necesitan 2 semanas con ejercicios comparables en cada grupo.</AppText>:null}
        <AppText muted>Cada ejercicio usa su referencia compatible, que puede estar fuera de la semana, grupo o período; no es una comparación directa entre grupos. No mide cambio de fuerza ni suma cargas o récords. Más sesiones o series no significa mejor rendimiento. Las rutinas presentes se consultan en los registros de cada semana.</AppText>
      </>}
    </View>:null}
  </>;
}
const styles=StyleSheet.create({detail:{gap:spacing.md},group:{gap:spacing.xs,paddingVertical:spacing.sm},week:{gap:spacing.xs,paddingVertical:spacing.md}});
