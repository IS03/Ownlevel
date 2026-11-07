import { describe,expect,it,jest } from '@jest/globals';
import { act,fireEvent,render } from '@testing-library/react-native';
import { useSyncExternalStore } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Alert } from 'react-native';
import { OwnlevelThemeProvider } from '@/design-system';
import { DayWriteEditor } from './day-write-editor';
import { DayWriteController,type DayWriteApi } from './day-write-controller';
import { DayWriteRepository } from './day-write-storage';
import { nutritionFixture } from './day-fixture.test-helper';
jest.mock('expo-symbols',()=>({SymbolView:()=>null}));
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
function Editor({f,mode='light'}:{f:Awaited<ReturnType<typeof fixture>>;mode?:'light'|'dark'}){
 const state=useSyncExternalStore(f.controller.subscribe,f.controller.getSnapshot,f.controller.getSnapshot);
 return <SafeAreaProvider initialMetrics={{frame:{x:0,y:0,width:320,height:700},insets:{top:44,bottom:34,left:0,right:0}}}><OwnlevelThemeProvider initialMode={mode}><DayWriteEditor controller={f.controller} state={state}/></OwnlevelThemeProvider></SafeAreaProvider>;
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
 it('requests native confirmation before abandoning edited fields',async()=>{
  const f=await fixture();f.controller.open('context',f.data);f.controller.changeContext('target','1900');const alert=jest.spyOn(Alert,'alert');
  const view=render(<Editor f={f}/>);
  fireEvent.press(view.getByRole('button',{name:'Cancelar'}));expect(alert).toHaveBeenCalledWith('¿Descartar cambios?',expect.any(String),expect.any(Array));expect(f.controller.getSnapshot().draft).not.toBeNull();alert.mockRestore();
 });
 it.each(['light','dark'] as const)('keeps scope, automatic/manual and explicit clear distinct (%s)',async mode=>{
  const f=await fixture();f.controller.open('context',f.data);const view=render(<Editor f={f} mode={mode}/>);
  expect(view.getByText('Solo cambia esta fecha. Tu plan general no se modifica.')).toBeTruthy();
  expect(view.getByText('jueves, 1 de octubre de 2026')).toBeTruthy();expect(view.queryByText(/Override/)).toBeNull();
  fireEvent.changeText(view.getByLabelText('Objetivo de calorías (kcal)'),'1900');
  expect(view.getByText('Ajuste manual para esta fecha')).toBeTruthy();
  fireEvent.press(view.getByText('Usar objetivo automático'));
  expect(f.controller.getSnapshot().draft!.target).toBe('');expect(f.controller.getSnapshot().draft!.expenditure).toBe('');
  fireEvent.changeText(view.getByLabelText('Gasto estimado (kcal)'),'0');
  await act(async()=>{fireEvent.press(view.getByText('Guardar cambios'));});
  expect(view.getByText('Usá calorías enteras entre 1 y 50000.')).toBeTruthy();expect(f.api.mutate).not.toHaveBeenCalled();
 });
 it.each([false,true])('holds confirmed readback without recovery flash; read failure %s',async fails=>{
  const f=await fixture();f.controller.open('context',f.data);f.controller.changeContext('target','1900');
  const meta={durationMs:1,httpStatus:200,outcome:'ok' as const};
  jest.mocked(f.api.mutate).mockResolvedValue({status:'ok',data:{status:'saved',date:f.data.date,operation:'context'},meta});
  let release!:(r:Awaited<ReturnType<DayWriteApi['read']>>)=>void;
  jest.mocked(f.api.read).mockReturnValueOnce(new Promise(done=>{release=done;}));
  const view=render(<Editor f={f}/>);
  await act(async()=>{fireEvent.press(view.getByText('Guardar cambios'));});
  expect(view.getByText('Actualizando fecha…')).toBeTruthy();expect(view.queryByText('Actualizar fecha confirmada')).toBeNull();
  expect(view.getByRole('button',{name:'Cancelar'})).toBeDisabled();
  await act(async()=>{release(fails?{status:'unavailable',reason:'network',meta:{...meta,outcome:'unavailable'}}:{status:'ok',data:f.data,meta});});
  if(fails){expect(view.getByText('Actualizar fecha confirmada')).toBeTruthy();expect(f.controller.getSnapshot().draft!.target).toBe('1900');await act(async()=>{fireEvent.press(view.getByText('Actualizar fecha confirmada'));});}
  expect(f.api.mutate).toHaveBeenCalledTimes(1);expect(f.controller.getSnapshot().draft).toBeNull();
 });
 it('preserves a conflicting daily draft and requires explicit review before another save',async()=>{
  const f=await fixture();f.controller.open('context',f.data);f.controller.changeContext('target','1900');
  jest.mocked(f.api.mutate).mockResolvedValueOnce({status:'conflict',code:'CONTEXT_CHANGED',message:'Cambió esta fecha.',meta:{durationMs:1,httpStatus:409,outcome:'conflict'}});
  const view=render(<Editor f={f}/>);await act(async()=>{fireEvent.press(view.getByText('Guardar cambios'));});
  expect(view.getByLabelText('Objetivo de calorías (kcal)').props.value).toBe('1900');
  expect(view.getByText('Valores actuales de esa fecha')).toBeTruthy();expect(view.queryByText('Guardar cambios')).toBeNull();
  fireEvent.press(view.getByText('Revisar mi borrador sobre esta versión'));
  expect(view.getByText('Guardar cambios')).toBeTruthy();expect(f.api.mutate).toHaveBeenCalledTimes(1);
 });
});
