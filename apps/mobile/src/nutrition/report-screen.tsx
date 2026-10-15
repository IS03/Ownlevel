import { useState } from 'react';
import { FlatList, Modal, RefreshControl, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppText, Button, Heading, LoadingState, Surface, UnavailableState, spacing, useOwnlevelTheme } from '@/design-system';
import { useMobileApi } from '@/api';
import { REPORT_PRESETS, type NutritionReport, type ReportDailyRow, type ReportMetric, type ReportQuery, type ReportStatistic } from '@/api/nutrition-report';
import { useNutritionReportResource } from './report-resource';
import { amount, displayNutritionDate, inputNutritionDate, nutritionToday, parseInputNutritionDate, shiftNutritionDate } from './day-format';

const labels = {'7':'7 días','14':'14 días','30':'30 días','3m':'3 meses','6m':'6 meses','1y':'1 año',custom:'Personalizado'};
const metricLabels: Record<ReportMetric,string> = {calories:'Consumo',targetCalories:'Objetivo histórico',targetDeviation:'Diferencia contra objetivo',expenditure:'Gasto histórico',balance:'Balance energético',protein:'Proteína',targetProtein:'Objetivo histórico de proteína',carbs:'Carbohidratos',fat:'Grasas'};
const unit = (key:ReportMetric) => ['protein','targetProtein','carbs','fat'].includes(key)?'g':'kcal';
const value = (stat:ReportStatistic,key:ReportMetric) => amount(stat.value,unit(key));
function Statistic({label,stat,metric}: {label:string;stat:ReportStatistic;metric:ReportMetric}) {
  return <View style={styles.stat}><AppText>{label}</AppText><AppText variant="heading">{value(stat,metric)}</AppText>
    <AppText muted variant="caption">{stat.denominator} días{stat.partialDays>0?` · ${stat.partialDays} con suma parcial`:''}</AppText></View>;
}
function Evolution({report}:{report:NutritionReport}) {
  const [metric,setMetric]=useState<ReportMetric>('calories');
  const {colors}=useOwnlevelTheme();
  const max=Math.max(1,...report.evolution.map(b=>Math.abs(b.metrics[metric].value??0)));
  return <Surface style={styles.section}>
    <Heading level={2}>Evolución</Heading>
    <AppText muted>Promedios por bloque sobre días con dato. Hoy puede aparecer en curso.</AppText>
    <View style={styles.wrap}>{(['calories','targetCalories','expenditure','balance','protein','targetProtein','carbs','fat'] as ReportMetric[]).map(k=><Button key={k} label={metricLabels[k]} variant={metric===k?'primary':'secondary'} onPress={()=>setMetric(k)}/>)}</View>
    {report.evolution.map(b=>{
      const stat=b.metrics[metric];
      const caption=`${displayNutritionDate(b.start)}${b.start!==b.end?` — ${displayNutritionDate(b.end)}`:''}${b.includesToday?' · hoy en curso':''}`;
      return <View key={b.start} style={styles.stat} accessible accessibilityLabel={`${caption}. ${metricLabels[metric]}: ${value(stat,metric)}. ${stat.denominator} días. ${stat.partialDays} parciales.`}>
        <AppText variant="caption">{caption}</AppText>
        <View style={styles.barTrack} accessible={false}>
          <View style={{width:`${Math.abs(stat.value??0)/max*100}%`,height:6,backgroundColor:stat.value!==null&&stat.value<0?colors.textMuted:colors.primary}}/>
        </View>
        <AppText>{value(stat,metric)} · {stat.denominator} días{stat.partialDays?` · ${stat.partialDays} parciales`:''}</AppText>
      </View>;
    })}
  </Surface>;
}
export function NutritionReportSummary({report,onDate}:{report:NutritionReport;onDate:(date:string)=>void}) {
  const {summary,coverage}=report;
  return <View style={styles.section}>
    {report.status==='partial'?<AppText>Reporte con cobertura parcial</AppText>:null}
    {report.range.preset!==report.range.requested.period?<AppText>Mostrando {labels[report.range.preset]}.</AppText>:null}
    {report.range.notice?<AppText accessibilityRole="alert">{report.range.notice}</AppText>:null}
    <AppText>{displayNutritionDate(report.range.start)} — {displayNutritionDate(report.range.end)}</AppText>
    {report.status==='empty'?<Surface style={styles.section}><Heading level={2}>Sin registros nutricionales</Heading><AppText>No hay comidas ni resúmenes históricos en este período. Los días sin registro no se cuentan como cero.</AppText></Surface>:null}
    <Surface style={styles.section}><Heading level={2}>Resumen</Heading>
      <AppText muted>Promedios sobre días finalizados con datos. Hoy queda fuera del resumen.</AppText>
      {(['calories','targetCalories','targetDeviation','expenditure','balance'] as ReportMetric[]).map(k=><Statistic key={k} label={`${metricLabels[k]} promedio`} stat={summary.metrics[k]} metric={k}/>)}
      <Statistic label="Balance acumulado" metric="balance" stat={summary.accumulatedBalance}/>
      <AppText muted>Objetivo: {summary.belowTargetDays} por debajo · {summary.exactTargetDays} iguales · {summary.aboveTargetDays} por encima.</AppText>
      <AppText muted>Balance: {summary.deficitDays} déficit · {summary.neutralDays} neutros · {summary.surplusDays} superávit.</AppText>
      {summary.goalStages.length>0?<AppText>Etapas: {summary.goalStages.join(', ')}</AppText>:null}
    </Surface>
    <Surface style={styles.section}><Heading level={2}>Macros</Heading>
      {(['protein','targetProtein','carbs','fat'] as ReportMetric[]).map(k=><Statistic key={k} label={`${metricLabels[k]} promedio`} stat={summary.metrics[k]} metric={k}/>)}
      <AppText>Proteína alcanzada: {summary.proteinHitDays} de {summary.proteinComparableDays} días comparables.</AppText>
    </Surface>
    <Surface style={styles.section}><Heading level={2}>Cobertura</Heading>
      <AppText>{coverage.completedRegisteredDays} de {coverage.finalizedDays} días finalizados con registro.</AppText>
      <AppText>{coverage.missingDays} días sin registro. {coverage.todayRegistered?'Hoy tiene datos en curso.':'Hoy, si aparece, sigue en curso.'}</AppText>
      {(['calories','protein','carbs','fat'] as const).map(k=><AppText key={k}>{metricLabels[k]}: {coverage.nutrients[k].knownDays} días con dato · {coverage.nutrients[k].partialDays} parciales · {coverage.nutrients[k].unknownDays} desconocidos.</AppText>)}
      <AppText muted>Una suma parcial sólo incluye nutrientes conocidos; no representa necesariamente el total. Cada promedio muestra su propio denominador.</AppText>
    </Surface>
    <Evolution report={report}/>
    <Surface style={styles.section}><Heading level={2}>Días destacados</Heading>
      {report.highlights.length===0?<AppText muted>No hay días finalizados comparables.</AppText>:report.highlights.map(h=><Button key={h.kind} label={`${h.title} · ${displayNutritionDate(h.date)}`} variant="secondary" onPress={()=>onDate(h.date)}/>)}
    </Surface>
    <Heading level={2}>Detalle diario</Heading>
    <AppText muted>Tocá un día para abrir su Nutrition.</AppText>
  </View>;
}
export function NutritionReportDayRow({day,onDate}:{day:ReportDailyRow;onDate:(date:string)=>void}) {
  const nutrient=(k:'calories'|'protein'|'carbs'|'fat')=>`${amount(day.nutrients[k].value,k==='calories'?'kcal':'g')}${day.nutrients[k].status==='partial'?' (parcial)':''}`;
  return <Surface style={styles.section}>
    <Button label={`${displayNutritionDate(day.date)}${day.isToday?' · en curso':''}`} variant="quiet" onPress={()=>onDate(day.date)}/>
    {!day.hasNutrition?<AppText muted>Sin registro nutricional</AppText>:<>
      {day.imported?<AppText muted>Resumen histórico importado</AppText>:null}
      <AppText>Consumo: {nutrient('calories')}</AppText>
      <AppText>Diferencia: {amount(day.targetDeviationKcal,'kcal')}</AppText>
      <AppText>Balance: {amount(day.energyBalanceKcal,'kcal')}</AppText>
      <AppText>Proteína: {nutrient('protein')} · Objetivo: {amount(day.targetProteinG,'g')}</AppText>
      <AppText>Carbohidratos: {nutrient('carbs')} · Grasas: {nutrient('fat')}</AppText>
    </>}
    <AppText muted>Objetivo: {amount(day.targetCalories,'kcal')} · Gasto: {amount(day.expenditureKcal,'kcal')}</AppText>
  </Surface>;
}
/** Legacy Reports surface, retained for existing links until CONTRACT. New entry points use Progreso. */
export function NutritionReportsContent({onClose,onDate,initialQuery}:{onClose?:()=>void;onDate:(date:string)=>void;initialQuery?:ReportQuery}) {
  const {client}=useMobileApi();
  const {colors}=useOwnlevelTheme();
  const [query,setQuery]=useState<ReportQuery>(initialQuery??{period:'7'});
  const [custom,setCustom]=useState(initialQuery?.period==='custom');
  const [from,setFrom]=useState(()=>inputNutritionDate(initialQuery?.from??shiftNutritionDate(nutritionToday(),-6)!));
  const [to,setTo]=useState(()=>inputNutritionDate(initialQuery?.to??nutritionToday()));
  const [error,setError]=useState<string|null>(null);
  const {state,refresh}=useNutritionReportResource(client,query);
  const current=state.status==='ready'?state.current:state.status==='unavailable'?state.previous:undefined;
  const report=current?.data;
  const runRefresh=()=>void refresh();
  const selectDate=(date:string)=>{onDate(date);onClose?.();};
  const header=<View style={styles.section}>
    <Heading>Reporte nutricional</Heading>
    {onClose?<Button label="Cerrar reporte" variant="quiet" onPress={onClose}/>:null}
    <AppText>Período: {labels[query.period]}</AppText>
    <View style={styles.wrap}>{REPORT_PRESETS.map(p=><Button key={p} label={labels[p]} variant={query.period===p?'primary':'secondary'} onPress={()=>{
      setError(null);setCustom(p==='custom');if(p!=='custom')setQuery({period:p});
    }}/>)}</View>
    {custom?<Surface style={styles.section}>
      <AppText>Rango personalizado · máximo 366 días</AppText>
      <AppText>Desde</AppText><TextInput accessibilityLabel="Desde (DD/MM/AAAA)" value={from} onChangeText={setFrom} placeholder="DD/MM/AAAA" placeholderTextColor={colors.textMuted} keyboardType="numbers-and-punctuation" maxLength={10} style={[styles.input,{color:colors.text,borderColor:colors.border}]}/>
      <AppText>Hasta</AppText><TextInput accessibilityLabel="Hasta (DD/MM/AAAA)" value={to} onChangeText={setTo} placeholder="DD/MM/AAAA" placeholderTextColor={colors.textMuted} keyboardType="numbers-and-punctuation" maxLength={10} style={[styles.input,{color:colors.text,borderColor:colors.border}]}/>
      {error?<AppText accessibilityRole="alert">{error}</AppText>:null}
      <Button label="Consultar rango" onPress={()=>{
        const start=parseInputNutritionDate(from),end=parseInputNutritionDate(to);
        if(!start||!end){setError('Usá fechas válidas con formato DD/MM/AAAA.');return;}
        setError(null);setQuery({period:'custom',from:start,to:end});
      }}/>
    </Surface>:null}
    <Button label="Actualizar reporte" variant="secondary" onPress={runRefresh}/>
    {state.status==='loading'?<LoadingState label="Cargando reporte nutricional"/>:state.status!=='ready'?<UnavailableState title="No pudimos cargar el reporte" description={report?'Mostramos la última lectura de este período. Revisá la conexión.':'Revisá tu conexión o sesión e intentá nuevamente.'} action={<Button label="Reintentar reporte" onPress={runRefresh}/>}/>:null}
    {report?<NutritionReportSummary report={report} onDate={selectDate}/>:null}
  </View>;
  return <FlatList testID="nutrition-report-screen" data={report?.days??[]} keyExtractor={d=>d.date} ListHeaderComponent={header}
    renderItem={({item})=><NutritionReportDayRow day={item} onDate={selectDate}/>} initialNumToRender={7} windowSize={5}
    keyboardShouldPersistTaps="handled" contentContainerStyle={styles.list} style={{backgroundColor:colors.background}}
    refreshControl={<RefreshControl onRefresh={runRefresh} refreshing={state.status==='ready'&&state.refreshing} tintColor={colors.primary}/>}/>;
}
export function NutritionReports({onClose,onDate}:{onClose:()=>void;onDate:(date:string)=>void}) {
  const {colors}=useOwnlevelTheme();
  return <Modal animationType="slide" presentationStyle="fullScreen" visible onRequestClose={onClose}>
    <SafeAreaView style={{flex:1,backgroundColor:colors.background}} edges={['top','bottom','left','right']}>
      <NutritionReportsContent onClose={onClose} onDate={onDate}/>
    </SafeAreaView>
  </Modal>;
}
const styles=StyleSheet.create({section:{gap:spacing.md},list:{padding:spacing.lg,gap:spacing.lg},wrap:{flexDirection:'row',flexWrap:'wrap',gap:spacing.sm},stat:{gap:spacing.xs},barTrack:{height:6},input:{borderWidth:1,borderRadius:8,padding:12,minHeight:48}});
