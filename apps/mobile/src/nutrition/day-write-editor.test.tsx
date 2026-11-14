import { describe,expect,it,jest } from '@jest/globals';
import { act,fireEvent,render } from '@testing-library/react-native';
import { useSyncExternalStore } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Alert } from 'react-native';
import { OwnlevelThemeProvider } from '@/design-system';
import { DayWriteEditor } from './day-write-editor';
import { contextInputText,contextRawInput } from './day-context-editor';
import { DayWriteController,type DayWriteApi } from './day-write-controller';
import { DayWriteRepository } from './day-write-storage';
import { nutritionFixture } from './day-fixture.test-helper';
jest.mock('expo-symbols',()=>({SymbolView:()=>null}));
jest.mock('@/training/exercise-segmented',()=>({
 ExerciseSegmented:(props:import('@/training/exercise-segmented').ExerciseSegmentedProps<string>)=>{
  const {SegmentedControl}=jest.requireActual<typeof import('@/design-system')>('@/design-system');
  return <SegmentedControl {...props}/>;
 },
}));
async function fixture(){
 const data=nutritionFixture('2026-10-01');
 if(data.activity.status==='ok') data.activity.data.metrics.push(
  {...data.activity.data.metrics[0],id:'41300000-0000-4000-8000-000000000001',systemKey:'sleep',label:'Sueño',unit:'min',valueType:'duration',value:485,target:480,isActive:false},
  {...data.activity.data.metrics[0],id:'41300000-0000-4000-8000-000000000002',systemKey:null,label:'Personal',unit:'u',valueType:'integer',value:null,updatedAt:null});
 const api:DayWriteApi={mutate:jest.fn<DayWriteApi['mutate']>().mockRejectedValue(new Error('not sent')),read:jest.fn<DayWriteApi['read']>().mockResolvedValue({status:'ok',data,meta:{durationMs:1,httpStatus:200,outcome:'ok'}})};
 const controller=new DayWriteController(api,
  new DayWriteRepository({getItem:async()=>null,setItem:async()=>{},removeItem:async()=>{}},'editor'),()=>{});
 await controller.initialize();return {controller,data,api};
}
function Editor({f,mode='light',field}:{f:Awaited<ReturnType<typeof fixture>>;mode?:'light'|'dark';field?:'target'|'expenditure'}){
 const state=useSyncExternalStore(f.controller.subscribe,f.controller.getSnapshot,f.controller.getSnapshot);
 return <SafeAreaProvider initialMetrics={{frame:{x:0,y:0,width:320,height:700},insets:{top:44,bottom:34,left:0,right:0}}}><OwnlevelThemeProvider initialMode={mode}><DayWriteEditor controller={f.controller} state={state} contextField={field}/></OwnlevelThemeProvider></SafeAreaProvider>;
}
describe('Native activity/context editor',()=>{
 it('renders configurable integer/decimal/duration inputs and archived history',async()=>{
  const f=await fixture();f.controller.open('metrics',f.data);
  const view=render(<OwnlevelThemeProvider initialMode="light"><DayWriteEditor controller={f.controller} state={f.controller.getSnapshot()}/></OwnlevelThemeProvider>);
  expect(view.getByLabelText('Agua').props.keyboardType).toBe('decimal-pad');expect(view.getByLabelText('Personal').props.keyboardType).toBe('number-pad');
  expect(view.getByText('Sueño · archivada')).toBeTruthy();expect(view.getByLabelText('Sueño horas').props.value).toBe('8');expect(view.getByLabelText('Sueño minutos').props.value).toBe('5');
  fireEvent.press(view.getByText('Quitar valor de Sueño'));
  expect(f.controller.getSnapshot().draft!.metrics['41300000-0000-4000-8000-000000000001']).toEqual({value:'',hours:'',minutes:''});
 });
 const close='Cerrar el ajuste del día';
 const input=(view:ReturnType<typeof render>)=>view.getByTestId('nutrition-context-input');
 const draft=(f:Awaited<ReturnType<typeof fixture>>)=>f.controller.getSnapshot().draft!;
 it('requests native confirmation before abandoning edited fields',async()=>{
  const f=await fixture();f.controller.open('context',f.data);f.controller.changeContext('target','1900');const alert=jest.spyOn(Alert,'alert');
  const view=render(<Editor f={f}/>);
  fireEvent.press(view.getByRole('button',{name:close}));expect(alert).toHaveBeenCalledWith('¿Descartar cambios?',expect.any(String),expect.any(Array));expect(f.controller.getSnapshot().draft).not.toBeNull();alert.mockRestore();
 });
 it.each(['light','dark'] as const)('one number at a time: raw drafts, origin from the draft, shared Guardar (%s)',async mode=>{
  const f=await fixture();f.controller.open('context',f.data);const view=render(<Editor f={f} mode={mode}/>);
  expect(view.getByText('Jueves 1 de octubre · solo este día')).toBeTruthy();
  // Automatic: empty field with the automatic value as placeholder, no reset action, nothing to save yet.
  expect(input(view).props.value).toBe('');expect(view.getByTestId('nutrition-context-ghost',{includeHiddenElements:true})).toHaveTextContent('1.800');
  expect(view.getByText('Automático · según tu plan')).toBeTruthy();expect(view.queryByText('Volver al automático')).toBeNull();
  expect(view.getByTestId('nutrition-context-save')).toBeDisabled();
  for(const gone of ['Guardado','Usar objetivo automático','Se usará el valor automático','Solo cambia esta fecha. Tu plan general no se modifica.'])expect(view.queryByText(new RegExp(gone))).toBeNull();
  // Shown grouped, kept raw: "1.900" on screen is "1900" in the draft.
  fireEvent.changeText(input(view),'1.900');
  expect(draft(f).target).toBe('1900');expect(input(view).props.value).toBe('1.900');
  expect(view.getByText(/^Personalizado/)).toBeTruthy();expect(view.getByText('Volver al automático')).toBeTruthy();
  expect(view.getByTestId('nutrition-context-save')).not.toBeDisabled();expect(view.getByText('Guardar')).toBeTruthy();
  // Switching keeps the other draft; both changes share one Guardar.
  fireEvent.press(view.getByText('Gasto 2.200'));
  expect(input(view).props.accessibilityLabel).toBe('Gasto estimado de este día, en kilocalorías');expect(input(view).props.value).toBe('');expect(draft(f).target).toBe('1900');
  fireEvent.changeText(input(view),'0');expect(view.getByText('Guardar los dos')).toBeTruthy();
  await act(async()=>{fireEvent.press(view.getByText('Guardar los dos'));});
  expect(view.getByText('Usá calorías enteras entre 1 y 50000.')).toBeTruthy();expect(f.api.mutate).not.toHaveBeenCalled();
  // An error on the value not in view brings it into view.
  fireEvent.changeText(input(view),'2.500');fireEvent.press(view.getByText('Objetivo 1.900'));fireEvent.changeText(input(view),'25.000');
  fireEvent.press(view.getByText('Gasto 2.500'));
  await act(async()=>{fireEvent.press(view.getByText('Guardar los dos'));});
  expect(input(view).props.accessibilityLabel).toBe('Objetivo de este día, en kilocalorías');expect(view.getByText('Usá calorías enteras entre 1 y 20000.')).toBeTruthy();
  // Back to automatic empties only this value: never zero, the other value is untouched.
  fireEvent.press(view.getByText('Volver al automático'));
  expect(draft(f).target).toBe('');expect(draft(f).expenditure).toBe('2500');expect(view.getByText('Guardar')).toBeTruthy();
  expect(f.api.mutate).not.toHaveBeenCalled();
 });
 it('normalizes only es-AR thousands separators and the field\'s own grouping; malformed text is never another number',()=>{
  // Digits and well-placed separators (typed, or pasted into any draft).
  for(const [text,raw] of [['','']  ,['2100','2100'],['2.100','2100'],['12.345','12345'],['1.000.000','1000000'],[' 2.100 ','2100']] as const)expect(contextRawInput(text,'')).toBe(raw);
  // Malformed or ambiguous: kept as written so the model rejects it.
  for(const text of ['2.5','1..200','21.00','.100','2.','2,100','2 100','2.1000','2.100.5'])expect(contextRawInput(text,'')).toBe(text.trim());
  // Editing the grouped text on screen: digits typed or deleted anywhere, the shown dots never change the number.
  expect(contextRawInput('2.10','2100')).toBe('210');
  expect(contextRawInput('2.1005','2100')).toBe('21005');
  expect(contextRawInput('2.1500','2100')).toBe('21500');
  expect(contextRawInput('2100','2100')).toBe('2100');
  expect(contextRawInput('12.100','2100')).toBe('12100');
  expect(contextRawInput('','2100')).toBe('');
  // A paste that adds a dot, or an edit of malformed text, is not reinterpreted.
  expect(contextRawInput('2.1002.5','2100')).toBe('2.1002.5');
  expect(contextRawInput('2..100','2100')).toBe('2..100');
  expect(contextRawInput('2.','2.5')).toBe('2.');
  // Round trip of the display.
  for(const raw of ['1','21','210','2100','21005'])expect(contextRawInput(contextInputText(raw),raw)).toBe(raw);
 });
 it('typing, deleting and pasting keep the raw draft; malformed paste shows the error without saving',async()=>{
  const f=await fixture();f.controller.open('context',f.data);const view=render(<Editor f={f}/>);
  // Typing digit by digit: the field shows the grouping, the draft stays raw.
  for(const text of ['2','21','210','2100'])fireEvent.changeText(input(view),text);
  expect(draft(f).target).toBe('2100');expect(input(view).props.value).toBe('2.100');
  fireEvent.changeText(input(view),'2.10');expect(draft(f).target).toBe('210');expect(input(view).props.value).toBe('210');
  fireEvent.changeText(input(view),'');expect(draft(f).target).toBe('');expect(view.getByText('Automático · según tu plan')).toBeTruthy();
  fireEvent.changeText(input(view),'1.950');expect(draft(f).target).toBe('1950');expect(input(view).props.value).toBe('1.950');
  fireEvent.changeText(input(view),'2.5');expect(draft(f).target).toBe('2.5');expect(input(view).props.value).toBe('2.5');
  await act(async()=>{fireEvent.press(view.getByText('Guardar'));});
  expect(view.getByText('Usá calorías enteras entre 1 y 20000.')).toBeTruthy();expect(f.api.mutate).not.toHaveBeenCalled();
  fireEvent.changeText(input(view),'1..200');expect(draft(f).target).toBe('1..200');
  await act(async()=>{fireEvent.press(view.getByText('Guardar'));});
  expect(view.getByText('Usá calorías enteras entre 1 y 20000.')).toBeTruthy();expect(f.api.mutate).not.toHaveBeenCalled();
 });
 it('a manual value equal to the automatic one stays personal and opens on the chosen field',async()=>{
  const f=await fixture();
  if(f.data.nutrition.status==='ok'&&f.data.nutrition.data.dayState==='recorded')Object.assign(f.data.nutrition.data.context,{expenditureOverrideKcal:2200});
  f.controller.open('context',f.data);const view=render(<Editor f={f} field="expenditure"/>);
  expect(input(view).props.accessibilityLabel).toBe('Gasto estimado de este día, en kilocalorías');expect(input(view).props.value).toBe('2.200');
  expect(view.getByText(/^Personalizado/)).toBeTruthy();expect(view.getByText('Volver al automático')).toBeTruthy();
  expect(view.getByTestId('nutrition-context-save')).toBeDisabled();
  fireEvent.press(view.getByText('Volver al automático'));
  await act(async()=>{fireEvent.press(view.getByText('Guardar'));});
  expect(jest.mocked(f.api.mutate).mock.calls[0][0]).toMatchObject({operation:'context',changes:{expenditure:{action:'clear'}}});
  expect((jest.mocked(f.api.mutate).mock.calls[0][0] as {changes:object}).changes).toEqual({expenditure:{action:'clear'}});
 });
 it('saving one value sends only that change; pending locks, uncertain keeps the intent to check',async()=>{
  const f=await fixture();f.controller.open('context',f.data);
  let fail!:(e:Error)=>void;jest.mocked(f.api.mutate).mockReturnValueOnce(new Promise((_,reject)=>{fail=reject;}));
  const view=render(<Editor f={f}/>);
  fireEvent.changeText(input(view),'1950');
  await act(async()=>{fireEvent.press(view.getByText('Guardar'));});
  expect((jest.mocked(f.api.mutate).mock.calls[0][0] as {changes:object}).changes).toEqual({target:{action:'set',value:1950}});
  expect(view.getByText('Guardando…')).toBeTruthy();expect(input(view).props.editable).toBe(false);expect(view.getByRole('button',{name:close})).toBeDisabled();
  await act(async()=>{fail(new Error('network'));});
  expect(view.getByText('No sabemos si se guardó. Comprobar usa el mismo intento.')).toBeTruthy();
  expect(view.getByText('Comprobar intento guardado')).toBeTruthy();expect(view.getByText('Volver al día · conservar intento')).toBeTruthy();
  expect(view.queryByTestId('nutrition-context-save')).toBeNull();expect(input(view).props.value).toBe('1.950');expect(view.queryByText('Volver al automático')).toBeNull();
 });
 it.each([false,true])('holds confirmed readback without recovery flash; read failure %s',async fails=>{
  const f=await fixture();f.controller.open('context',f.data);f.controller.changeContext('target','1900');
  const meta={durationMs:1,httpStatus:200,outcome:'ok' as const};
  jest.mocked(f.api.mutate).mockResolvedValue({status:'ok',data:{status:'saved',date:f.data.date,operation:'context'},meta});
  let release!:(r:Awaited<ReturnType<DayWriteApi['read']>>)=>void;
  jest.mocked(f.api.read).mockReturnValueOnce(new Promise(done=>{release=done;}));
  const view=render(<Editor f={f}/>);
  await act(async()=>{fireEvent.press(view.getByText('Guardar'));});
  expect(view.getByText('Actualizando fecha…')).toBeTruthy();expect(view.queryByText('Actualizar fecha confirmada')).toBeNull();
  expect(view.getByRole('button',{name:close})).toBeDisabled();
  await act(async()=>{release(fails?{status:'unavailable',reason:'network',meta:{...meta,outcome:'unavailable'}}:{status:'ok',data:f.data,meta});});
  if(fails){expect(view.getByText('Actualizar fecha confirmada')).toBeTruthy();expect(f.controller.getSnapshot().draft!.target).toBe('1900');await act(async()=>{fireEvent.press(view.getByText('Actualizar fecha confirmada'));});}
  expect(f.api.mutate).toHaveBeenCalledTimes(1);expect(f.controller.getSnapshot().draft).toBeNull();
 });
 it('preserves a conflicting daily draft and requires explicit review before another save',async()=>{
  const f=await fixture();f.controller.open('context',f.data);f.controller.changeContext('target','1900');
  jest.mocked(f.api.mutate).mockResolvedValueOnce({status:'conflict',code:'CONTEXT_CHANGED',message:'Cambió esta fecha.',meta:{durationMs:1,httpStatus:409,outcome:'conflict'}});
  const view=render(<Editor f={f}/>);await act(async()=>{fireEvent.press(view.getByText('Guardar'));});
  expect(input(view).props.value).toBe('1.900');
  expect(view.getByText('Este día cambió')).toBeTruthy();expect(view.getByText('Ahora: objetivo 1.800 kcal · gasto 2.200 kcal')).toBeTruthy();expect(view.queryByTestId('nutrition-context-save')).toBeNull();
  fireEvent.press(view.getByText('Revisar mi borrador sobre esta versión'));
  expect(view.getByTestId('nutrition-context-save')).toBeTruthy();expect(f.api.mutate).toHaveBeenCalledTimes(1);
 });
});
