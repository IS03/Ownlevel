import {Alert,KeyboardAvoidingView,Modal,Platform,StyleSheet} from 'react-native';
import {AppText,Button,ChipGroup,Heading,LoadingState,ScrollScreen,Surface,TextField} from '@/design-system';
import {useRouter} from 'expo-router';
import {activities,sexes} from '@/settings/settings-model';
import type {ConfigOperation,NutritionConfig} from '@/api/nutrition-config';
import type {ConfigurationController,ConfigState} from './config-controller';
import type {ConfigDraft} from './config-model';
const WEEKDAYS=['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'].map((label,i)=>({label,value:i+1}));
const shown=(n:number|null)=>n===null?'Sin dato':`${n} kcal`;
const titles:Record<ConfigOperation,string>={plan:'Plan nutricional',energy:'Energía',physical:'Datos físicos'};
function Field({label,value,onChange,disabled,error,numeric=true}:{label:string;value:string;onChange:(v:string)=>void;disabled:boolean;error?:string;numeric?:boolean}){
 return <TextField label={label} value={value} disabled={disabled} error={error} onChangeText={onChange} numeric={numeric} keyboardType={numeric?'decimal-pad':'default'} autoCapitalize={numeric?'none':'sentences'}/>;
}
const SEX_OPTIONS=[{value:'',label:'Sin dato'},{value:'male',label:'Hombre'},{value:'female',label:'Mujer'},{value:'other',label:'Otro'}] as const;
const ACTIVITY_OPTIONS=[{value:'low',label:'Baja'},{value:'moderate',label:'Moderada'},{value:'high',label:'Alta'}] as const;
const BASE_MODE_OPTIONS=[{value:'automatic',label:'Automático'},{value:'custom',label:'Personalizado'}] as const;
// Shared physical editor: M8 can use this surface and the profile/physical API.
export function PhysicalProfileFields({draft,change,locked,errors,hasHistory}:{draft:ConfigDraft;change:(k:string,v:string)=>void;locked:boolean;errors:Record<string,string>;hasHistory:boolean}){
 return <><AppText muted>Si cambiás el peso, se registra para hoy. Los valores históricos permanecen.</AppText>
  <Field label="Nacimiento (AAAA-MM-DD)" numeric={false} value={draft.birthDate} disabled={locked} error={errors.birthDate} onChange={v=>change('birthDate',v)}/>
  <AppText variant="subheadline">Sexo</AppText><ChipGroup accessibilityLabel="Sexo" options={SEX_OPTIONS} value={draft.sex} disabled={locked} onChange={v=>change('sex',v)}/>
  <Field label="Altura (cm)" value={draft.heightCm} disabled={locked} error={errors.heightCm} onChange={v=>change('heightCm',v)}/>
  <Field label="Peso (kg)" value={draft.weightKg} disabled={locked} error={errors.weightKg} onChange={v=>change('weightKg',v)}/>
  {hasHistory?<AppText muted>El peso con historial no puede quitarse desde este formulario.</AppText>:null}
 </>;
}
function Truth({config,op}:{config:NutritionConfig;op:ConfigOperation}){
 const s=config[op];if(s.status!=='ok')return <AppText>No pudimos obtener la configuración actual.</AppText>;
 if(op==='plan'&&config.plan.status==='ok'){const d=config.plan.data;return <><AppText>{d.name}</AppText>{d.weekdays.map(w=><AppText key={w.weekday}>{`${WEEKDAYS[w.weekday-1].label}: ${w.calorieTargetKcal??'sin dato'} kcal · ${w.proteinTargetG??'sin dato'} g proteína`}</AppText>)}<AppText>{`Agua ${d.baseWaterL??'sin dato'} L · Extra entrenamiento ${d.trainingCalorieDeltaKcal} kcal / ${d.trainingWaterDeltaL} L`}</AppText></>;}
 if(op==='energy'&&config.energy.status==='ok'){const d=config.energy.data;return <><AppText>{`Actividad ${activities.find(a=>a.value===d.activityLevel)?.label??'Sin dato'} · ${d.baseExpenditureMode==='custom'?'Personalizado':'Automático'}`}</AppText><AppText>{`En reposo ${shown(d.bmrKcal)} · Gasto calculado ${shown(d.automaticBaseKcal)} · Tu gasto ${shown(d.usedBaseKcal)}`}</AppText><AppText>{`Personalizado ${shown(d.customBaseExpenditureKcal)} · Extra ${shown(d.trainingExpenditureDeltaKcal)}`}</AppText></>;}
 if(config.physical.status!=='ok')return null;const d=config.physical.data;return <><AppText>{`Nacimiento ${d.birthDate??'sin dato'} · Sexo ${sexes.find(s=>s.value===d.sex)?.label??'sin dato'}`}</AppText><AppText>{`Altura ${d.heightCm??'sin dato'} cm · Peso ${d.weightKg??'sin dato'} kg · En reposo ${shown(d.bmrKcal)}`}</AppText></>;
}
export function ConfigurationEditor({controller,state}:{controller:ConfigurationController;state:ConfigState}){
 const router=useRouter();
 if(!state.open||state.presentation==='route')return null;
 const pending=state.phase==='pending',locked=state.phase!=='idle'||!!state.intent;
 const leave=(action:()=>void)=>{if(pending)return;if(controller.dirty()&&!state.intent)Alert.alert('¿Descartar cambios?','Estos cambios todavía no están guardados.',[{text:'Seguir revisando',style:'cancel'},{text:'Descartar',style:'destructive',onPress:action}]);else action();};
 const field=(key:string,label:string,numeric=true)=><Field key={key} label={label} value={state.draft![key]} disabled={locked} error={state.errors[key]} numeric={numeric} onChange={v=>controller.change(key,v)}/>;
 const op=state.operation,draft=state.draft,config=state.config;
 return <Modal visible animationType="slide" presentationStyle="fullScreen" onRequestClose={()=>leave(()=>controller.close())}><KeyboardAvoidingView style={styles.screen} behavior={Platform.OS==='ios'?'padding':undefined}><ScrollScreen safeAreaEdges={['top','left','right','bottom']} testID="nutrition-config-editor">
 <Heading level={2}>{op?titles[op]:'Configurar nutrición'}</Heading><AppText variant="label">Desde hoy{config?` · ${config.today}`:''}</AppText>
 <AppText muted>Configuración general. Los ajustes de un día y el historial permanecen independientes.</AppText>
 {state.loading?<LoadingState label="Actualizando configuración"/>:null}
 {state.readError?<Surface><AppText accessibilityRole="alert">No pudimos actualizar la configuración. Lo que escribiste sigue acá.</AppText><Button label="Reintentar" onPress={()=>void controller.load()}/></Surface>:null}
 {!op&&config?(['plan','energy','physical'] as const).map(key=><Surface key={key}><Heading level={2}>{titles[key]}</Heading>{config[key].status==='ok'?<>
  {key!=='physical'?<AppText muted>{config[key].data.source==='v2'?'Tu plan actual':config[key].data.source==='legacy'?'Al guardar, estos valores rigen desde hoy. Tus días anteriores no cambian.':'Todavía no hay configuración guardada.'}</AppText>:null}
  {key!=='physical'&&config[key].data.effectiveFrom?<AppText muted>{`Vigente desde ${config[key].data.effectiveFrom}`}</AppText>:null}<Truth config={config} op={key}/><Button label={`Editar ${titles[key].toLowerCase()}`} disabled={locked||state.loading||state.readError} onPress={()=>{controller.close();router.push(key==='plan'?'/settings/stages':`/settings/${key}`);}}/>
 </>:<AppText>No disponible ahora. Volvé a probar.</AppText>}</Surface>):null}
 {op&&draft?<>
  {op==='plan'?<>{field('name','Nombre de etapa',false)}{WEEKDAYS.map(w=><Surface key={w.value}><AppText variant="label">{w.label}</AppText>{field(`calories${w.value}`,`${w.label} · Calorías (kcal)`)}{field(`protein${w.value}`,`${w.label} · Proteína (g)`)}</Surface>)}
   {field('baseWaterL','Agua base (L)')}{field('trainingCalorieDeltaKcal','Extra de objetivo por entrenamiento (kcal)')}{field('trainingWaterDeltaL','Extra de agua por entrenamiento (L)')}
   <AppText muted>Los extras se aplican cuando hay entrenamiento finalizado. El agua del plan no cambia el objetivo de la métrica Agua.</AppText></>:null}
  {op==='energy'?<>
   <AppText variant="subheadline">Actividad cotidiana</AppText><ChipGroup accessibilityLabel="Actividad cotidiana" options={ACTIVITY_OPTIONS} value={draft.activityLevel} disabled={locked} onChange={v=>controller.change('activityLevel',v)}/>
   <AppText variant="subheadline">Gasto base</AppText><ChipGroup accessibilityLabel="Gasto base" options={BASE_MODE_OPTIONS} value={draft.baseExpenditureMode} disabled={locked} onChange={v=>controller.change('baseExpenditureMode',v)}/>
   <AppText muted>Automático usa tu gasto en reposo y tu actividad. La opción propia usa el número que ponés. Completá tus datos físicos para calcularlo.</AppText>
   {config?.energy.status==='ok'?<Surface><AppText>{`En reposo: ${shown(config.energy.data.bmrKcal)}`}</AppText><AppText>{`Gasto calculado: ${shown(config.energy.data.automaticBaseKcal)}`}</AppText><AppText>{`Tu gasto por día: ${shown(config.energy.data.usedBaseKcal)}`}</AppText></Surface>:null}
   {draft.baseExpenditureMode==='custom'?field('customBaseExpenditureKcal','Gasto base personalizado (kcal)'):null}{field('trainingExpenditureDeltaKcal','Extra de gasto por entrenamiento (kcal)')}
   <Button label="Editar datos físicos" disabled={locked} variant="secondary" onPress={()=>leave(()=>controller.begin('physical'))}/>
  </>:null}
  {op==='physical'?<PhysicalProfileFields draft={draft} change={(k,v)=>controller.change(k,v)} locked={locked} errors={state.errors} hasHistory={config?.physical.status==='ok'&&config.physical.data.hasWeightHistory}/>:null}
  {state.errors.form?<AppText accessibilityRole="alert">{state.errors.form}</AppText>:null}
  {!locked?<Button label={`Guardar ${titles[op].toLowerCase()}`} onPress={()=>void controller.save()}/>:null}
 </>:null}
 {state.message?<AppText accessibilityRole="alert">{state.message}</AppText>:null}
 {state.phase==='conflict'&&op?<Surface><Heading level={2}>Así quedaron tus datos</Heading>{config?<Truth config={config} op={op}/>:null}<Button label="Actualizar valores actuales" onPress={()=>void controller.load()} variant="secondary"/><Button label="Revisar mi cambio" disabled={state.loading||state.readError||!config||config[op].status!=='ok'} onPress={()=>controller.reviewTruth()}/></Surface>:null}
 {['uncertain','confirmed','blocked'].includes(state.phase)?<Button label={state.intent?.receipt?'Mostrar datos actualizados':'Comprobar cambio'} onPress={()=>void controller.recover()}/>:null}
 {pending?<LoadingState label="Guardando configuración"/>:null}
 {op&&!state.intent?<Button label="Volver a configuración" disabled={pending} variant="quiet" onPress={()=>leave(()=>controller.back())}/>:null}
 <Button label={state.intent?'Cerrar · retomar después':'Cerrar configuración'} disabled={pending} variant="quiet" onPress={()=>leave(()=>controller.close())}/>
 </ScrollScreen></KeyboardAvoidingView></Modal>;
}
const styles=StyleSheet.create({screen:{flex:1}});
