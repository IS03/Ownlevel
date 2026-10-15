import { FoodAddPicker } from './food-add-picker';
import { FoodSearchControls } from './food-search-controls';
import { useEffect } from 'react';
import { Alert,KeyboardAvoidingView,Modal,Platform,StyleSheet,TextInput,View } from 'react-native';
import { AppText,Button,Heading,LoadingState,ScrollScreen,Surface,spacing,useOwnlevelTheme } from '@/design-system';
import type { PersonalFood } from '@/api/nutrition-food';
import { foodLabels,type FoodDraft } from './food-model';
import type { FoodController,FoodState } from './food-controller';
import type { QuickController,QuickState } from './quick-controller';
import { QuickEditor } from './quick-editor';
import { displayNutritionDate } from './day-format';
const shown=(n:number|null)=>n===null?'sin dato':new Intl.NumberFormat('es-AR',{maximumFractionDigits:3}).format(n);
function Summary({food}:{food:PersonalFood}){return <><AppText>{`${shown(food.servingQuantity)} ${food.servingUnit} · ${shown(food.calories)} kcal`}</AppText>
 <AppText muted>{`P ${shown(food.proteinG)} · C ${shown(food.carbsG)} · G ${shown(food.fatG)}`}</AppText>{!food.isActive?<AppText>Archivado</AppText>:null}</>;}
export function FoodEditor({controller,state,quick,onChoose}:{controller:FoodController;state:FoodState;quick:{controller:QuickController;state:QuickState};onChoose:(food:PersonalFood)=>void}){
 const {colors}=useOwnlevelTheme();const pending=state.phase==='pending'||state.phase==='loading',locked=state.phase!=='idle'||!!state.intent;
 useEffect(()=>{if(state.open&&state.mode==='register'&&!quick.state.open)controller.close();},[state.open,state.mode,quick.state.open,controller]);
 if(!state.open)return null;
 const close=()=>{if(pending||quick.state.phase==='pending')return;
   const dirty=state.mode==='register'?quick.controller.dirty():controller.dirty();
   const exit=()=>{if(state.mode==='register')quick.controller.close();controller.close();};
   if(dirty&&!state.intent&&!quick.state.intent)Alert.alert('¿Descartar cambios?','Conservá el editor abierto si querés seguir revisando.',[{text:'Seguir revisando',style:'cancel'},{text:'Descartar',style:'destructive',onPress:exit}]);else exit();};
 const back=()=>{if(controller.dirty())Alert.alert('¿Descartar cambios?','Estos cambios del alimento no están guardados.',[{text:'Cancelar',style:'cancel'},{text:'Descartar',style:'destructive',onPress:()=>controller.back()}]);else controller.back();};
 const action=(op:'archive'|'reactivate'|'delete')=>Alert.alert(op==='delete'?'¿Eliminar alimento?':op==='archive'?'¿Archivar alimento?':'¿Reactivar alimento?',
  `Las comidas registradas y los componentes guardados no cambian.${controller.dirty()?' Los cambios del formulario sin guardar se descartarán.':''}`,
  [{text:'Cancelar',style:'cancel'},{text:op==='delete'?'Eliminar':op==='archive'?'Archivar':'Reactivar',style:op==='delete'?'destructive':'default',onPress:()=>void controller.save(op)}]);
 return <Modal animationType="slide" presentationStyle={state.date ? "pageSheet" : "fullScreen"} visible onRequestClose={close}>
  {state.mode==='register'?<QuickEditor embedded controller={quick.controller} state={quick.state} onBack={()=>{quick.controller.close();controller.back();}}/>:
  state.mode==='browse'&&state.date?<FoodAddPicker controller={controller} state={state} onChoose={onChoose} onClose={close}/>:<KeyboardAvoidingView behavior={Platform.OS==='ios'?'padding':undefined} style={styles.screen}>
   <ScrollScreen safeAreaEdges={['top','left','right','bottom']} testID="food-editor">
    <Heading level={2}>{state.mode==='browse'?'Alimentos personales':state.mode==='create'?'Nuevo alimento':'Editar alimento'}</Heading>
    {state.date?<AppText variant="label">{`Destino · ${displayNutritionDate(state.date)}`}</AppText>:null}
    {state.mode==='browse'?<>
     <FoodSearchControls search={state.search} filter={state.filter} onSearch={v=>controller.query(v)} onFilter={f=>controller.setFilter(f)}/>
     <Button label="Nuevo alimento" disabled={locked} onPress={()=>controller.begin()}/>
     {state.listLoading?<LoadingState label="Cargando alimentos"/>:null}
     {state.listError?<Surface><AppText accessibilityRole="alert">No pudimos actualizar el catálogo.{state.foods?' Mostramos la última lectura.':''}</AppText><Button label="Reintentar catálogo" onPress={()=>void controller.load()}/></Surface>:null}
     {state.foods?.length===0&&!state.listError&&!state.listLoading?<AppText>{state.search.trim()?'No encontramos alimentos con esa búsqueda.':state.filter==='archived'?'No tenés alimentos archivados.':state.filter==='active'?'No tenés alimentos activos. Creá uno o revisá Archivados.':'Tu catálogo está vacío.'}</AppText>:null}
     {state.foods?.map(food=><Surface key={food.id}><AppText variant="label">{food.name}</AppText><Summary food={food}/>
      {state.date?<Button label={`Usar ${food.name}`} disabled={locked||state.listError||state.listLoading||!food.isActive||food.calories===null||food.calories<=0} onPress={()=>onChoose(food)}/>:null}
      {food.calories===null||food.calories===0?<AppText muted>Completá calorías mayores a cero para registrarlo.</AppText>:null}
      <Button label={`Editar ${food.name}`} disabled={locked||state.listError||state.listLoading} variant="secondary" onPress={()=>controller.begin(food)}/>
     </Surface>)}
     <Button label="Actualizar catálogo" disabled={state.listLoading} onPress={()=>void controller.load()} variant="secondary"/>
    </>:<>
     <AppText muted>Nutrición de la porción base. Vacío significa sin dato; 0 es un valor explícito.</AppText>
     {state.draft?(Object.keys(foodLabels) as (keyof FoodDraft)[]).map(key=><View key={key} style={styles.field}>
      <AppText variant="label">{foodLabels[key]}</AppText><TextInput accessibilityLabel={foodLabels[key]} value={state.draft![key]} editable={!locked}
       keyboardType={['servingQuantity','calories','proteinG','carbsG','fatG'].includes(key)?'decimal-pad':'default'} multiline={key==='description'}
       onChangeText={v=>controller.change(key,v)} style={[styles.input,{color:colors.text,borderColor:state.errors[key]?colors.danger:colors.border}]}/>
      {state.errors[key]?<AppText accessibilityRole="alert">{state.errors[key]}</AppText>:null}
     </View>):null}
     {!locked?<><Button label="Guardar alimento" onPress={()=>void controller.save()}/>
      {state.editing?<><Button label={state.editing.isActive?'Archivar alimento':'Reactivar alimento'} variant="secondary" onPress={()=>action(state.editing!.isActive?'archive':'reactivate')}/>
       <Button label="Eliminar alimento" variant="quiet" onPress={()=>action('delete')}/></>:null}
      <Button label="Volver al catálogo" variant="quiet" onPress={back}/></>:null}
    </>}
    {state.message?<AppText accessibilityRole="alert">{state.message}</AppText>:null}
    {state.phase==='conflict'?<Surface><Heading level={2}>Datos actuales del servidor</Heading>{state.truth?<><AppText variant="label">{state.truth.name}</AppText><Summary food={state.truth}/>
      {state.truth.description?<AppText>{state.truth.description}</AppText>:null}{state.truth.sourceNote?<AppText>{`Fuente: ${state.truth.sourceNote}`}</AppText>:null}
      <Button label="Revisar mi borrador con esta versión" onPress={()=>controller.reviewTruth()}/></>:<AppText>No hay un alimento actual confirmado. Tu borrador sigue intacto.</AppText>}
      <Button label="Actualizar alimento actual" onPress={()=>void controller.loadTruth()} variant="secondary"/>
      <Button label="Volver al catálogo" onPress={back} variant="quiet"/>
    </Surface>:null}
    {['uncertain','confirmed','blocked'].includes(state.phase)?<Button label={state.intent?.receipt?'Actualizar catálogo confirmado':'Comprobar intento de catálogo'} onPress={()=>void controller.recover()}/>:null}
    {pending?<LoadingState label="Guardando alimento"/>:null}
    <Button disabled={pending} label={state.intent?'Volver · conservar intento':'Cerrar alimentos'} onPress={close} variant="quiet"/>
   </ScrollScreen>
  </KeyboardAvoidingView>}
 </Modal>;
}
const styles=StyleSheet.create({screen:{flex:1},input:{minHeight:48,borderWidth:1,borderRadius:12,padding:spacing.md,fontSize:17},field:{gap:spacing.xs},actions:{gap:spacing.sm}});
