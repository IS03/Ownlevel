import { Alert,KeyboardAvoidingView,Modal,Platform,StyleSheet,TextInput,View } from 'react-native';
import { AppText,Button,Heading,ScrollScreen,Surface,spacing,useOwnlevelTheme, brandTokens } from '@/design-system';
import type { NutritionDayContext,NutritionDayMetric } from '@/api/nutrition-day';
import type { DayWriteController,DayWriteState } from './day-write-controller';
import { displayNutritionDate,amount } from './day-format';
function metricDisplay(m:NutritionDayMetric){
  if(m.value===null)return 'Sin dato';
  return m.valueType==='duration'?`${Math.floor(m.value/60)} h ${m.value%60} min`:`${m.value}${m.unit?' '+m.unit:''}`;
}
function ContextValues({c,field}:{c:NutritionDayContext;field:'target'|'expenditure'}){
  const target=field==='target';
  const override=target?c.targetOverrideKcal:c.expenditureOverrideKcal;
  return <>
    <AppText>Automático: {amount(target?c.targetAutomaticKcal:c.expenditureAutomaticKcal,'kcal')}</AppText>
    <AppText>Override diario: {override===null?'Sin ajuste':amount(override,'kcal')}</AppText>
    <AppText>Efectivo: {amount(target?c.calorieTarget:c.expenditureKcal,'kcal')}</AppText>
  </>;
}
export function DayWriteEditor({controller,state}:{controller:DayWriteController;state:DayWriteState}){
  const {colors}=useOwnlevelTheme(),d=state.draft;if(!d)return null;
  const locked=!!state.intent||['pending','loading','blocked','confirmed'].includes(state.phase),running=state.phase==='pending';
  const close=()=>{
    if(running)return;
    if(!state.intent&&controller.dirty())Alert.alert('¿Descartar cambios?','Tu borrador no se guardará.',[
      {text:'Seguir editando',style:'cancel'},{text:'Descartar',style:'destructive',onPress:()=>controller.close()},
    ]);else controller.close();
  };
  const input=(label:string,value:string,onChangeText:(value:string)=>void,decimal=false)=><TextInput accessibilityLabel={label}
    editable={!locked} keyboardType={decimal?'decimal-pad':'number-pad'} onChangeText={onChangeText} placeholder="Sin dato" placeholderTextColor={colors.textMuted}
    style={[styles.input,{color:colors.text,borderColor:colors.border}]} value={value}/>;
  const metrics=d.baseline.activity.status==='ok'?d.baseline.activity.data.metrics:[];
  const c=d.baseline.nutrition.status==='ok'&&d.baseline.nutrition.data.dayState==='recorded'?d.baseline.nutrition.data.context:null;
  const truth=state.truth;
  const truthContext=truth?.nutrition.status==='ok'&&truth.nutrition.data.dayState==='recorded'?truth.nutrition.data.context:null;
  return <Modal animationType="slide" onRequestClose={close} presentationStyle="fullScreen" visible>
    <KeyboardAvoidingView behavior={Platform.OS==='ios'?'padding':undefined} style={styles.screen}>
      <ScrollScreen safeAreaEdges={['top','left','right','bottom']} testID="nutrition-day-write-editor">
        <Heading level={2}>{d.kind==='metrics'?'Métricas del día':'Ajustar contexto'}</Heading>
        <AppText>{displayNutritionDate(d.baseline.date)} · Sólo esta fecha</AppText>
        <AppText muted>{d.kind==='metrics'?'Vacío significa sin registro. Cero es un valor. Se guardan juntos sólo los cambios.':'Estos ajustes diarios no cambian tu plan ni la configuración general.'}</AppText>
        {d.kind==='metrics'?metrics.map(m=>{
          if(!m.isActive&&d.baseline.date>=d.baseline.today)return <Surface key={m.id}>
            <AppText variant="label">{m.label} · archivada</AppText><AppText>{metricDisplay(m)} · Sólo lectura hoy</AppText>
          </Surface>;
          const raw=d.metrics[m.id];return <Surface key={m.id}>
            <AppText variant="label">{m.label}{m.isActive?'':' · archivada'}</AppText>
            <AppText muted>{m.valueType==='duration'?'Duración en horas y minutos':`${m.valueType==='integer'?'Entero':'Decimal · coma o punto'}${m.unit?' · '+m.unit:''}`}</AppText>
            {m.target!==null?<AppText muted>Objetivo actual: {metricDisplay({...m,value:m.target})}</AppText>:null}
            {m.valueType==='duration'?<View style={styles.row}>
              <View style={styles.column}><AppText>Horas</AppText>{input(`${m.label} horas`,raw.hours,v=>controller.changeMetric(m.id,'hours',v))}</View>
              <View style={styles.column}><AppText>Minutos</AppText>{input(`${m.label} minutos`,raw.minutes,v=>controller.changeMetric(m.id,'minutes',v))}</View>
            </View>:input(m.label,raw.value,v=>controller.changeMetric(m.id,'value',v),m.valueType==='decimal')}
            {state.errors[m.id]?<AppText accessibilityRole="alert" style={{color:colors.danger}}>{state.errors[m.id]}</AppText>:null}
            <Button disabled={locked} label={`Quitar valor de ${m.label}`} variant="quiet" onPress={()=>{for(const field of ['value','hours','minutes'] as const)controller.changeMetric(m.id,field,'');}}/>
          </Surface>;
        }):c?(['target','expenditure'] as const).map(field=><Surface key={field}>
          <Heading level={2}>{field==='target'?'Objetivo nutricional':'Gasto energético'}</Heading>
          <ContextValues c={c} field={field}/>
          <AppText variant="label">Override diario (kcal) · vacío usa automático</AppText>
          {input(field==='target'?'Override objetivo':'Override gasto',d[field],v=>controller.changeContext(field,v))}
          {state.errors[field]?<AppText accessibilityRole="alert" style={{color:colors.danger}}>{state.errors[field]}</AppText>:null}
          <Button disabled={locked} label={field==='target'?'Usar objetivo automático':'Usar gasto automático'} onPress={()=>controller.changeContext(field,'')} variant="secondary"/>
        </Surface>):null}
        {state.errors.form?<AppText accessibilityRole="alert">{state.errors.form}</AppText>:null}
        {state.message?<AppText accessibilityRole="alert">{state.message}</AppText>:null}
        {state.phase==='conflict'?<Surface><Heading level={2}>Versión del servidor</Heading>
          {d.kind==='metrics'&&truth?.activity.status==='ok'?truth.activity.data.metrics.map(m=><AppText key={m.id}>{m.label}{m.isActive?'':' · archivada'}: {metricDisplay(m)}</AppText>):null}
          {d.kind==='context'&&truthContext?<><ContextValues c={truthContext} field="target"/><ContextValues c={truthContext} field="expenditure"/></>:null}
          {!truth?<AppText>No pudimos confirmar los datos actuales. Tu borrador sigue intacto.</AppText>:null}
          <Button label="Actualizar versión del servidor" onPress={()=>void controller.refreshConflict()} variant="secondary"/>
          {truth?<Button label="Revisar mi borrador sobre esta versión" onPress={()=>controller.reviewWithServerVersion()} variant="secondary"/>:null}
        </Surface>:null}
        {state.phase==='idle'?<Button label="Guardar cambios" disabled={locked} onPress={()=>void controller.save()}/>:null}
        {state.phase==='pending'?<Button disabled label="Procesando…" onPress={()=>{}}/>:null}
        {['uncertain','confirmed','blocked'].includes(state.phase)?<Button label={state.intent?.receipt?'Actualizar fecha confirmada':'Comprobar intento guardado'} onPress={()=>void controller.recover()}/>:null}
        <Button label={state.intent?'Volver al día · conservar intento':'Cancelar'} disabled={running} onPress={close} variant="quiet"/>
      </ScrollScreen>
    </KeyboardAvoidingView>
  </Modal>;
}
const styles=StyleSheet.create({screen:{flex:1},row:{flexDirection:'row',gap:spacing.md},column:{flex:1,gap:spacing.xs},input:{minHeight:48,borderWidth:1,borderRadius:12,padding:spacing.md,fontSize: brandTokens.typeScale.body.fontSize}});
