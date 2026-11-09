import {act,fireEvent,render,within} from '@testing-library/react-native';
import {beforeEach,it,expect,jest} from '@jest/globals';
import {RefreshControl} from 'react-native';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {OwnlevelThemeProvider} from '@/design-system';
import type{MobileApiClient} from '@/api/client';
import type {CoincidenceSelection} from '@/api/performance-insights';
import {clearConfirmedReads} from '@/api/confirmed-read-cache';
import {periodExploration,periodCoincidenceEvidence} from '../../../../src/lib/progress/insights-engine/week-exploration';
import {periodDetailsFixture} from '../../../../src/lib/progress/insights-engine/period-details-fixture';
import {descriptiveFixture,descriptiveBodyFixture,descriptivePreMealFixture,descriptiveWeeklyFixture,descriptiveId} from '../../../../src/lib/progress/insights-engine/descriptive-fixture.test-helper';
import {createInsightsSnapshot,insightsSummary} from '../../../../src/lib/progress/insights-engine/read-model';
import {InsightsScreen} from './insights-screen';
import {WeekExplorationScreen} from './week-exploration-screen';
import {insightsReturnHref,nutritionDayHref,metricTrendHref,bodyWeightHref,explorationHref} from './navigation';
jest.mock('@react-native-async-storage/async-storage',()=>jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('expo-symbols',()=>({SymbolView:()=>null}));
jest.mock('@/platform/haptics',()=>({haptics:{selection:jest.fn()},triggerHaptic:jest.fn()}));
let mockParams:Record<string,string>={};const mockPush=jest.fn(),mockNavigate=jest.fn(),mockSetParams=jest.fn();
jest.mock('expo-router',()=>({useRouter:()=>({push:mockPush,navigate:mockNavigate,setParams:mockSetParams}),useLocalSearchParams:()=>mockParams,useFocusEffect:()=>undefined}));
const mockRead=jest.fn<MobileApiClient['read']>();let mockClient={read:mockRead,request:jest.fn()} as unknown as MobileApiClient;
jest.mock('@/api',()=>({useMobileApi:()=>({client:mockClient})}));
const data=(weights:{date:string;value:number}[]=[])=>periodExploration(periodDetailsFixture(),weights,'2027-01-02','2026-11-07','r2',2);
const meta={durationMs:1,httpStatus:200,outcome:'ok' as const};
const wrap=()=> <SafeAreaProvider initialMetrics={{frame:{x:0,y:0,width:320,height:800},insets:{top:0,left:0,right:0,bottom:0}}}><OwnlevelThemeProvider initialMode="dark"><WeekExplorationScreen/></OwnlevelThemeProvider></SafeAreaProvider>;
beforeEach(()=>{mockClient={read:mockRead,request:jest.fn()} as unknown as MobileApiClient;mockRead.mockReset();mockPush.mockReset();mockNavigate.mockReset();mockSetParams.mockReset();mockParams={asOf:'2026-11-07',week:'2026-08-10',revision:'r1'};clearConfirmedReads(mockClient);mockRead.mockImplementation(async o=>({status:'ok',data:o.parse(data()),meta})as never);});
it('keeps seven days, independent denominators, empty/missing/zero and goes to source domains without extra reads',async()=>{
  const view=render(wrap());await view.findByText('Semanas y días');
  expect(mockRead).toHaveBeenCalledTimes(1);expect(view.getByTestId('week-revised')).toBeTruthy();
  expect(view.getByText('0 kcal')).toBeTruthy();expect(view.getAllByText('Sin comidas registradas; no es cero.').length).toBeGreaterThan(0);expect(view.getAllByText('Sin dato').length).toBeGreaterThan(0);
  for(let n=10;n<=16;n++)expect(view.getByTestId(`week-day-2026-08-${n}`)).toBeTruthy();
  fireEvent.press(view.getAllByRole('button',{name:'Abrir Nutrición del 11/08/2026'})[0]!);
  const href=mockPush.mock.calls.at(-1)![0] as ReturnType<typeof nutritionDayHref>;
  expect(href.params.date).toBe('2026-08-11');expect(insightsReturnHref(href.params)).toEqual({pathname:'/(tabs)/train/insights/weeks',params:{asOf:'2026-11-07',week:'2026-08-10',revision:'r2'}});
  fireEvent.press(view.getByRole('button',{name:'Ver sesiones y comparaciones del 10/08/2026'}));expect(mockPush).toHaveBeenLastCalledWith({pathname:'/(tabs)/train/insights',params:expect.objectContaining({date:'2026-08-10',before:'2026-08-11',asOf:'2026-11-07',week:'2026-08-10'})});
  fireEvent.press(view.getByRole('button',{name:'Semana siguiente'}));expect(mockSetParams).toHaveBeenLastCalledWith({week:'2026-08-17'});mockParams={...mockParams,week:'2026-08-17'};view.rerender(wrap());expect(mockRead).toHaveBeenCalledTimes(1);
  const origin={explore:'1' as const,asOf:'2026-11-07',week:'2026-08-10',revision:'r2'};
  const metric='93670424-0000-4000-8000-000000000001';
  expect(insightsReturnHref(metricTrendHref(metric,'2026-08-11',origin).params)?.pathname).toBe('/(tabs)/train/insights/weeks');
  expect(insightsReturnHref(bodyWeightHref({from:'2026-08-10',to:'2026-08-16'},origin).params)?.pathname).toBe('/(tabs)/train/insights/weeks');
});
it('keeps errors recoverable and invalid scopes unavailable instead of reading another period',async()=>{
  mockRead.mockResolvedValueOnce({status:'unavailable',reason:'network',meta:{durationMs:1,httpStatus:null,outcome:'unavailable'}});const view=render(wrap());await view.findByText('No pudimos leer las semanas');
  await act(async()=>{fireEvent.press(view.getByRole('button',{name:'Reintentar'}));});expect(view.getByText('Semanas y días')).toBeTruthy();
  view.unmount();clearConfirmedReads(mockClient);mockRead.mockClear();mockParams={asOf:'2026-02-30'};const invalid=render(wrap());expect(invalid.getByText('Período no válido')).toBeTruthy();expect(mockRead).not.toHaveBeenCalled();
});
it('opens fixed descriptions and their records locally, retaining selection through session evidence and temporal context',async()=>{
  const source=descriptiveFixture(),payload=periodExploration(source,[],'2026-11-09','2026-11-07','r2',2);
  mockRead.mockImplementation(async o=>{const q=new URL(`http://fixture${o.path}`).searchParams;return {status:'ok',data:o.parse(q.get('view')==='coincidence-evidence'?periodCoincidenceEvidence(source,[],'2026-11-09','2026-11-07','r2',q.get('revision')!,{kind:q.get('kind') as 'protein'|'timing',group:q.get('group') as 'lower'},Number(q.get('offset'))):payload),meta} as never;});
  const view=render(wrap());await view.findByText('Coincidencias descriptivas de tus registros');
  const select=(name:string)=>{fireEvent.press(view.getByRole('button',{name}));mockParams={...mockParams,...mockSetParams.mock.calls.at(-1)![0] as Record<string,string>};view.rerender(wrap());};
  select('Abrir proteína previa y entrenamiento, descripción de registros');
  expect(view.getAllByText('Método completo').length).toBe(2);expect(view.getAllByText('Método parcial').length).toBe(2);
  expect(mockRead).toHaveBeenCalledTimes(1);
  await act(async()=>{select('Ver 6 registros del grupo hasta la mediana');});
  expect(view.getByTestId(`coincidence-session-${descriptiveId(10)}`)).toBeTruthy();
  fireEvent.press(view.getByRole('button',{name:/Ver sesión y evidencia del 03\/08\/2026/}));
  const session=mockPush.mock.calls.at(-1)![0] as {params:Record<string,string>};
  expect(session.params).toMatchObject({session:descriptiveId(10),date:'2026-08-03',revision:'r2',coincidence:'protein',coincidenceGroup:'lower',week:'2026-08-10'});
  expect(explorationHref(session.params.asOf!,session.params.week,session.params.revision,session.params)).toEqual({pathname:'/(tabs)/train/insights/weeks',params:{asOf:'2026-11-07',week:'2026-08-10',revision:'r2',coincidence:'protein',coincidenceGroup:'lower'}});
  fireEvent.press(view.getByRole('button',{name:/Ver horarios y comidas de .*03\/08\/2026/}));
  expect(mockPush).toHaveBeenLastCalledWith({pathname:'/(tabs)/train/insights/temporal',params:expect.objectContaining({session:descriptiveId(10),date:'2026-08-03',coincidenceGroup:'lower'})});
  select('Abrir horarios y distribuciones de energía y fatiga post');
  expect(view.getAllByText('Energía post').length).toBe(4);expect(view.getAllByText('Fatiga post').length).toBe(4);
  expect(mockRead).toHaveBeenCalledTimes(2);
});
it('keeps week/date/revision/group through nutrition and body records, including a computed zero and insufficient weeks',async()=>{
  const {source,weights}=descriptiveBodyFixture(),payload=periodExploration(source,weights,'2026-11-09','2026-11-07','r3',2);
  mockRead.mockImplementation(async o=>({status:'ok',data:o.parse(payload),meta})as never);
  mockParams={...mockParams,coincidence:'body',coincidenceGroup:'lower'};
  const view=render(wrap());await view.findByText('Coincidencias descriptivas de tus registros');
  expect(view.getAllByText(/cambio: 0 kg/).length).toBeGreaterThan(0);expect(view.getAllByText(/cambio: no calculable/).length).toBeGreaterThan(0);
  fireEvent.press(view.getByRole('button',{name:'Abrir Nutrición del 03/08/2026 y sus registros'}));
  const nutrition=mockPush.mock.calls.at(-1)![0] as ReturnType<typeof nutritionDayHref>;
  expect(nutrition.params.date).toBe('2026-08-03');expect(insightsReturnHref(nutrition.params)).toEqual({pathname:'/(tabs)/train/insights/weeks',params:{asOf:'2026-11-07',week:'2026-08-10',revision:'r3',coincidence:'body',coincidenceGroup:'lower'}});
  fireEvent.press(view.getByRole('button',{name:'Ver pesajes y referencia de 10/08/2026 – 16/08/2026'}));
  const weight=mockPush.mock.calls.at(-1)![0] as ReturnType<typeof bodyWeightHref>;expect(weight.params).toMatchObject({from:'2026-08-03',to:'2026-08-16'});expect(insightsReturnHref(weight.params)).toEqual(insightsReturnHref(nutrition.params));
  expect(insightsReturnHref({...nutrition.params,insightsCoincidenceGroup:'night'})).toBeNull();
  expect(mockRead).toHaveBeenCalledTimes(1);
});
it('distinguishes insufficient observations from a compatible older response without descriptive support',async()=>{
  const payload=data();mockRead.mockImplementation(async o=>({status:'ok',data:o.parse(payload),meta})as never);mockParams={...mockParams,coincidence:'protein'};
  const view=render(wrap());await view.findByText('Sin contraste descriptivo suficiente. No significa que no haya relación.');
  const legacy=structuredClone(payload);delete legacy.coincidenceSummary;
  mockRead.mockImplementation(async o=>({status:'ok',data:o.parse(legacy),meta})as never);
  view.unmount();clearConfirmedReads(mockClient);const old=render(wrap());await old.findByText('Las coincidencias por sesión todavía no están disponibles. Podés seguir recorriendo semanas y días.');
  expect(old.queryByText('No pudimos leer las semanas')).toBeNull();
});
it('does not carry descriptions across logout/accounts or revive a late reading from the retired account',async()=>{
  const payload=periodExploration(descriptiveFixture(),[],'2026-11-09','2026-11-07','account-a',2);
  let finish=()=>{};
  mockRead.mockImplementationOnce(o=>new Promise(resolve=>{finish=()=>resolve({status:'ok',data:o.parse(payload),meta} as never);}));
  mockParams={...mockParams,coincidence:'protein',coincidenceGroup:'lower'};
  const view=render(wrap()),retired=mockClient;
  clearConfirmedReads(retired);mockClient=null as unknown as MobileApiClient;view.rerender(wrap());
  await act(async()=>{finish();});
  expect(view.queryByTestId(`coincidence-session-${descriptiveId(10)}`)).toBeNull();
  const nextSource=periodDetailsFixture();
  const nextRead=jest.fn<MobileApiClient['read']>().mockImplementation(async o=>{const q=new URL(`http://fixture${o.path}`).searchParams;return {status:'ok',data:o.parse(q.get('view')==='coincidence-evidence'?periodCoincidenceEvidence(nextSource,[],'2027-01-02','2026-11-07','r2',q.get('revision')!,{kind:'protein',group:'lower'},0):data()),meta} as never;});
  mockClient={read:nextRead,request:jest.fn()} as unknown as MobileApiClient;view.rerender(wrap());
  await view.findByText('Coincidencias descriptivas de tus registros');
  expect(view.queryByTestId(`coincidence-session-${descriptiveId(10)}`)).toBeNull();expect(nextRead).toHaveBeenCalledTimes(2);expect(nextRead.mock.calls.map(([o])=>new URL(`http://fixture${o.path}`).searchParams.get('view'))).toEqual(['period-explore','coincidence-evidence']);
});

const compareParams=()=>({asOf:'2026-11-07',week:'2026-08-10',compare:'1',weekA:'2026-08-03',weekB:'2026-08-10',revision:'r1'});
it('pages grouped evidence on demand and keeps A/B, group, page and revision on return',async()=>{
 const source=descriptiveFixture(),base=source.sessions[1]!;for(let i=0;i<55;i++)source.sessions.push({...base,id:descriptiveId(200+i)});
 mockParams={...compareParams(),coincidence:'timing',coincidenceGroup:'morning',coincidencePage:'25'};
 let fail=false;
 mockRead.mockImplementation(async o=>{const q=new URL(`http://fixture${o.path}`).searchParams;if(fail&&q.get('view')==='coincidence-evidence')return {status:'unavailable',reason:'network',meta:{...meta,httpStatus:null,outcome:'unavailable'}};return {status:'ok',data:o.parse(q.get('view')==='coincidence-evidence'?periodCoincidenceEvidence(source,[],'2026-11-09','2026-11-07','r2',q.get('revision')!,{kind:'timing',group:'morning'},Number(q.get('offset'))):periodExploration(source,[],'2026-11-09','2026-11-07','r2',2)),meta} as never;});
 const view=render(wrap());await view.findByText('Registros 26–50 de 61');expect(mockRead).toHaveBeenCalledTimes(2);
 fail=true;fireEvent.press(view.getByRole('button',{name:'Ver siguientes registros'}));mockParams={...mockParams,...mockSetParams.mock.calls.at(-1)![0] as Record<string,string>};view.rerender(wrap());
 await view.findByText('No pudimos leer la evidencia. No significa que el grupo esté vacío.');expect(view.queryByText('Registros 26–50 de 61')).toBeNull();
 fail=false;await act(async()=>{fireEvent.press(view.getByRole('button',{name:'Reintentar evidencia'}));});
 expect(view.getByText('Registros 51–61 de 61')).toBeTruthy();expect(view.queryByRole('button',{name:'Ver siguientes registros'})).toBeNull();
 fireEvent.press(view.getAllByRole('button',{name:/^Ver sesión y evidencia del/})[0]!);
 const href=mockPush.mock.calls.at(-1)![0] as {params:Record<string,string>};expect(href.params).toMatchObject({compare:'1',weekA:'2026-08-03',weekB:'2026-08-10',coincidence:'timing',coincidenceGroup:'morning',coincidencePage:'50',revision:'r2'});
 const back=explorationHref(href.params.asOf!,href.params.week,href.params.revision,href.params);
 expect(back.params).toMatchObject({compare:'1',weekA:'2026-08-03',weekB:'2026-08-10',coincidencePage:'50',coincidenceGroup:'morning'});
 const n=nutritionDayHref('2026-08-03',{...href.params,date:undefined,session:undefined});expect(insightsReturnHref(n.params)).toEqual(back);
});
it('refuses evidence from a newer revision until the complete summary is refreshed',async()=>{
 const source=descriptiveFixture();let revision='r2';mockParams={...mockParams,coincidence:'protein'};
 mockRead.mockImplementation(async o=>{const q=new URL(`http://fixture${o.path}`).searchParams;const raw=q.get('view')==='coincidence-evidence'?periodCoincidenceEvidence(source,[],'2026-11-09','2026-11-07',revision,q.get('revision')!,{kind:'protein',group:'lower'},0):periodExploration(source,[],'2026-11-09','2026-11-07',revision,2);return {status:'ok',data:o.parse(raw),meta} as never;});
 const view=render(wrap());await view.findByText('Coincidencias descriptivas de tus registros');revision='r3';
 fireEvent.press(view.getByRole('button',{name:'Ver 6 registros del grupo hasta la mediana'}));mockParams={...mockParams,...mockSetParams.mock.calls.at(-1)![0] as Record<string,string>};view.rerender(wrap());
 await view.findByText('Los registros cambiaron. Actualizá el resumen antes de abrir su evidencia.');expect(view.queryByTestId(`coincidence-session-${descriptiveId(10)}`)).toBeNull();
 await act(async()=>{fireEvent.press(view.getByRole('button',{name:'Actualizar resumen'}));});
 await view.findByTestId(`coincidence-session-${descriptiveId(10)}`);expect(mockRead).toHaveBeenCalledTimes(4);
});
it('offers a first-page return when a refreshed group shrinks below the open page, without retrying an invalid cursor',async()=>{
 const source=descriptiveFixture(),base=source.sessions[1]!;for(let i=0;i<55;i++)source.sessions.push({...base,id:descriptiveId(200+i)});
 let revision='r2';mockParams={...compareParams(),coincidence:'timing',coincidenceGroup:'morning',coincidencePage:'50'};
 mockRead.mockImplementation(async o=>{const q=new URL(`http://fixture${o.path}`).searchParams;return {status:'ok',data:o.parse(q.get('view')==='coincidence-evidence'?periodCoincidenceEvidence(source,[],'2026-11-09','2026-11-07',revision,q.get('revision')!,{kind:'timing',group:'morning'},Number(q.get('offset'))):periodExploration(source,[],'2026-11-09','2026-11-07',revision,2)),meta} as never;});
 const view=render(wrap());await view.findByText('Registros 51–61 de 61');source.sessions.splice(13);revision='r3';
 await act(async()=>{await view.UNSAFE_getByType(RefreshControl).props.onRefresh();});
 expect(view.getByText('Esta página ya no pertenece al grupo actualizado.')).toBeTruthy();expect(view.queryByText('Registros 51–61 de 61')).toBeNull();expect(mockRead).toHaveBeenCalledTimes(3);
 fireEvent.press(view.getByRole('button',{name:'Volver a la primera página'}));mockParams={...mockParams,...mockSetParams.mock.calls.at(-1)![0] as Record<string,string>};view.rerender(wrap());
 await view.findByText('Registros 1–6 de 6');expect(mockRead).toHaveBeenCalledTimes(4);expect(mockParams).toMatchObject({weekA:'2026-08-03',weekB:'2026-08-10',coincidencePage:'0'});
});
it('selects and swaps by calendar, keeps partial dates visible and changes no read on local selection or records',async()=>{
  const view=render(wrap());await view.findByText('Semanas y días');
  const apply=()=>{const update=mockSetParams.mock.calls.at(-1)![0] as Record<string,string|undefined>;mockParams=Object.fromEntries(Object.entries({...mockParams,...update}).filter(([,value])=>value!==undefined)) as Record<string,string>;view.rerender(wrap());};
  fireEvent.press(view.getByRole('button',{name:'Comparar semanas'}));apply();
  expect(within(view.getByTestId('week-selection-A')).getByText(/03\/08\/2026.*09\/08\/2026/)).toBeTruthy();
  expect(within(view.getByTestId('week-selection-B')).getByText(/10\/08\/2026.*16\/08\/2026/)).toBeTruthy();
  expect(view.getByText('Comparación de registros; no determina qué produjo el cambio.')).toBeTruthy();
  expect(within(view.getByTestId('week-nutrient-calories')).getByText('50 kcal')).toBeTruthy();
  expect(within(view.getByTestId('week-nutrient-proteinG')).getByText('0 g')).toBeTruthy();
  fireEvent.press(view.getByRole('button',{name:'Intercambiar A y B'}));apply();
  expect(within(view.getByTestId('week-selection-A')).getByText(/10\/08\/2026.*16\/08\/2026/)).toBeTruthy();
  fireEvent.press(view.getByRole('button',{name:'Semana anterior para A'}));apply();
  expect(within(view.getByTestId('week-selection-A')).getByText(/Semana recortada.*2 días/)).toBeTruthy();
  fireEvent.press(view.getByRole('button',{name:'Ver días y registros de B'}));apply();
  expect(view.getByTestId('week-records-B')).toBeTruthy();
  fireEvent.press(view.getByRole('button',{name:'Abrir Nutrición del 03/08/2026'}));
  const href=mockPush.mock.calls.at(-1)![0] as ReturnType<typeof nutritionDayHref>;
  const returned=insightsReturnHref(href.params);
  expect(returned).toEqual({pathname:'/(tabs)/train/insights/weeks',params:{asOf:'2026-11-07',week:'2026-08-03',compare:'1',weekA:'2026-08-01',weekB:'2026-08-03',weekSide:'B',revision:'r2'}});
  expect(mockRead).toHaveBeenCalledTimes(1);
  expect(insightsReturnHref({...href.params,insightsWeekA:'invalid'})).toBeNull();
  expect(insightsReturnHref({...href.params,insightsTemporal:'1',insightsWeekA:'invalid'})).toBeNull();
});
it('preserves selection on a new complete revision and never joins its figures to the old one',async()=>{
  mockParams=compareParams();let revision='r2';
  mockRead.mockImplementation(async o=>{const d=data();return {status:'ok',data:o.parse({...d,sourceRevision:revision,weeks:d.weeks.map(w=>({...w,days:w.days.map(day=>day.nutrition?{...day,nutrition:{...day.nutrition,calories:{...day.nutrition.calories,recorded:revision==='r3'?day.nutrition.calories.recorded*2:day.nutrition.calories.recorded}}}:day)}))}),meta} as never;});
  const view=render(wrap());await view.findByText('Comparar semanas');
  expect(within(view.getByTestId('week-nutrient-calories')).getByText('50 kcal')).toBeTruthy();
  revision='r3';await act(async()=>{await view.UNSAFE_getByType(RefreshControl).props.onRefresh();});
  const calories=within(view.getByTestId('week-nutrient-calories'));
  expect(calories.getByText('100 kcal')).toBeTruthy();expect(calories.queryByText('50 kcal')).toBeNull();
  expect(mockRead).toHaveBeenCalledTimes(2);expect(mockParams.weekA).toBe('2026-08-03');expect(mockParams.weekB).toBe('2026-08-10');
  fireEvent.press(view.getByRole('button',{name:'Ver días y registros de A'}));
  const update=mockSetParams.mock.calls.at(-1)![0] as Record<string,string>;mockParams={...mockParams,...update};view.rerender(wrap());
  fireEvent.press(view.getByRole('button',{name:'Ver sesiones y comparaciones del 03/08/2026'}));
  expect(mockPush).toHaveBeenLastCalledWith({pathname:'/(tabs)/train/insights',params:expect.objectContaining({date:'2026-08-03',before:'2026-08-04',compare:'1',weekA:'2026-08-03',weekB:'2026-08-10',weekSide:'A',revision:'r3'})});
});
it('does not invent prior distributions on an older server or replace invalid selected weeks silently',async()=>{
  mockParams=compareParams();mockRead.mockImplementation(async o=>{const d=data();for(const w of d.weeks)delete w.priorFeelings;return {status:'ok',data:o.parse(d),meta} as never;});
  const view=render(wrap());await view.findByText('Comparar semanas');
  expect(view.getAllByText('No disponible en esta lectura')).toHaveLength(4);expect(mockRead).toHaveBeenCalledTimes(1);
  mockParams={...mockParams,weekA:'2025-01-01'};view.rerender(wrap());
  expect(view.getByText('Semanas fuera del período')).toBeTruthy();expect(view.queryByTestId('week-comparison')).toBeNull();expect(mockRead).toHaveBeenCalledTimes(1);
});

it('opens the existing exercise evidence with a reference outside B, preserving both selected weeks',async()=>{
  const base=periodDetailsFixture();
  const source={...base,exercises:base.exercises.map(e=>({...e,implement:'barra',weightMode:'Peso total',configuration:'none'}))};
  const snapshot=createInsightsSnapshot(source,{today:'2027-01-02',revision:'r2',method:2});
  mockParams={...compareParams(),weekSide:'B'};
  mockRead.mockImplementation(async o=>{const query=new URL(`http://fixture${o.path}`).searchParams;
    const raw=query.get('view')==='period-explore'?periodExploration(source,[],'2027-01-02','2026-11-07','r2',2):insightsSummary(snapshot);
    return {status:'ok',data:o.parse(raw),meta} as never;
  });
  const view=render(wrap());await view.findByText('Comparar semanas');
  fireEvent.press(view.getByRole('button',{name:'Ver sesiones y comparaciones del 10/08/2026'}));
  const dayHref=mockPush.mock.calls.at(-1)![0] as {params:Record<string,string>};view.unmount();mockParams=dayHref.params;
  const facts=render(<SafeAreaProvider initialMetrics={{frame:{x:0,y:0,width:320,height:800},insets:{top:0,left:0,right:0,bottom:0}}}><OwnlevelThemeProvider initialMode="dark"><InsightsScreen/></OwnlevelThemeProvider></SafeAreaProvider>);
  const exercise=await facts.findByRole('button',{name:/^Ejercicio, igual.*frente a la sesión del domingo.*9 de agosto/});
  fireEvent.press(exercise);
  const evidence=mockPush.mock.calls.at(-1)![0] as {pathname:string;params:Record<string,string>};
  expect(evidence.pathname).toBe('/(tabs)/train/insights/evidence');
  expect(evidence.params).toMatchObject({reference:'93670000-0000-4000-8000-000000000006',result:'observed_stable',revision:'r2',insightsWeekA:'2026-08-03',insightsWeekB:'2026-08-10',insightsCompare:'1'});
  expect(insightsReturnHref(evidence.params)).toMatchObject({pathname:'/(tabs)/train/insights',params:{date:'2026-08-10',weekA:'2026-08-03',weekB:'2026-08-10',weekSide:'B',compare:'1'}});
  fireEvent.press(facts.getByRole('button',{name:'Volver a comparar semanas'}));
  expect(mockNavigate).toHaveBeenLastCalledWith({pathname:'/(tabs)/train/insights/weeks',params:{asOf:'2026-11-07',week:'2026-08-10',revision:'r2',weekA:'2026-08-03',weekB:'2026-08-10',weekSide:'B',compare:'1'}});
  expect(mockRead).toHaveBeenCalledTimes(2);
});

it('keeps A/B and the pinned period after a failed comparison read and an explicit retry',async()=>{
  mockParams=compareParams();mockRead.mockResolvedValueOnce({status:'unavailable',reason:'network',meta:{durationMs:1,httpStatus:null,outcome:'unavailable'}});
  const view=render(wrap());await view.findByText('No pudimos leer las semanas');
  expect(mockRead).toHaveBeenCalledTimes(1);expect(view.queryByTestId('week-comparison')).toBeNull();
  await act(async()=>{fireEvent.press(view.getByRole('button',{name:'Reintentar'}));});
  expect(view.getByTestId('week-selection-A')).toBeTruthy();expect(view.getByTestId('week-selection-B')).toBeTruthy();
  expect(mockParams).toMatchObject({asOf:'2026-11-07',weekA:'2026-08-03',weekB:'2026-08-10'});expect(mockRead).toHaveBeenCalledTimes(2);
  expect(mockRead.mock.calls.every(([o])=>String(o.path).includes('asOf=2026-11-07'))).toBe(true);
});

it('opens the fixed premeal choices locally and requests only the selected grouped evidence, with units and return identity',async()=>{
 const source=descriptivePreMealFixture();
 mockRead.mockImplementation(async o=>{const q=new URL(`http://fixture${o.path}`).searchParams;return {status:'ok',data:o.parse(q.get('view')==='coincidence-evidence'?periodCoincidenceEvidence(source,[],'2026-11-09','2026-11-07','r2',q.get('revision')!,{kind:q.get('kind'),group:q.get('group')} as CoincidenceSelection,Number(q.get('offset'))):periodExploration(source,[],'2026-11-09','2026-11-07','r2',2)),meta} as never;});
 mockParams={...compareParams()};const view=render(wrap());await view.findByText('Coincidencias descriptivas de tus registros');
 const select=async(name:string)=>{await act(async()=>{fireEvent.press(view.getByRole('button',{name}));mockParams={...mockParams,...mockSetParams.mock.calls.at(-1)![0] as Record<string,string>};view.rerender(wrap());});};
 const calories='Abrir calorías previas y entrenamiento, descripción de registros',carbs='Abrir carbohidratos previos y entrenamiento, descripción de registros',last='Abrir última comida registrada y entrenamiento, descripción de registros';
 const choices=within(view.getByTestId('descriptive-coincidences')).getAllByRole('button').map(b=>b.props.accessibilityLabel);
 expect(choices).toEqual(['Abrir proteína previa y entrenamiento, descripción de registros',calories,carbs,last,'Abrir horarios y distribuciones de energía y fatiga post','Abrir alimentación semanal, entrenamiento y peso corporal']);
 await select(calories);expect(mockRead).toHaveBeenCalledTimes(1);expect(view.getAllByText(/Hasta 300 kcal/).length).toBeGreaterThan(0);
 await select('Ver 6 registros del grupo hasta la mediana');expect(view.getByTestId(`coincidence-session-${descriptiveId(10)}`)).toBeTruthy();expect(mockRead).toHaveBeenCalledTimes(2);
 fireEvent.press(view.getAllByRole('button',{name:/^Ver sesión y evidencia del/})[0]!);
 const href=mockPush.mock.calls.at(-1)![0] as {params:Record<string,string>};expect(href.params).toMatchObject({date:'2026-08-03',session:descriptiveId(10),compare:'1',weekA:'2026-08-03',weekB:'2026-08-10',coincidence:'calories',coincidenceGroup:'lower',revision:'r2'});
 const nutrition=nutritionDayHref('2026-08-03',{...href.params,date:undefined,session:undefined});expect(insightsReturnHref(nutrition.params)).toMatchObject({pathname:'/(tabs)/train/insights/weeks',params:{coincidence:'calories',coincidenceGroup:'lower',weekA:'2026-08-03',weekB:'2026-08-10'}});
 await select(carbs);expect(view.getByRole('button',{name:calories}).props.accessibilityState.expanded).toBe(false);expect(view.getAllByText(/Hasta 50 g/).length).toBeGreaterThan(0);expect(mockRead).toHaveBeenCalledTimes(2);
 await select(last);expect(view.getByRole('button',{name:carbs}).props.accessibilityState.expanded).toBe(false);expect(view.getByRole('button',{name:'Ver 0 registros del grupo Más de 3–12 h'})).toBeTruthy();expect(mockRead).toHaveBeenCalledTimes(2);
 await select('Ver 6 registros del grupo Hasta 1 h');expect(mockRead).toHaveBeenCalledTimes(3);expect(view.getByText('Registros 1–6 de 6')).toBeTruthy();
 expect(mockRead.mock.calls.slice(1).map(([o])=>new URL(`http://fixture${o.path}`).searchParams.get('kind'))).toEqual(['calories','lastMeal']);
 expect(insightsReturnHref({...nutrition.params,insightsCoincidence:'lastMeal',insightsCoincidenceGroup:'lower'})).toBeNull();
});
it('does not invent new summaries or day coverage on an older response and never requests unsupported evidence',async()=>{
 const payload=periodExploration(descriptivePreMealFixture(),[],'2026-11-09','2026-11-07','r2',2);delete payload.coincidenceSummary!.preMeal;delete payload.coincidenceSummary!.protein.totalDays;delete payload.coincidenceSummary!.protein.eligibleDays;delete payload.coincidenceSummary!.protein.multiSessionDays;
 mockParams={...mockParams,coincidence:'calories'};mockRead.mockImplementation(async o=>({status:'ok',data:o.parse(payload),meta})as never);
 const view=render(wrap());await view.findByText('Esta descripción no está disponible en esta lectura. Podés seguir recorriendo los registros existentes.');expect(mockRead).toHaveBeenCalledTimes(1);
 mockParams={...mockParams,coincidence:'protein'};view.rerender(wrap());expect(view.getByText('Días y solapamientos no disponibles en esta lectura.')).toBeTruthy();expect(mockRead).toHaveBeenCalledTimes(1);
});

it('switches food results/ordinal feelings locally, shows different prior populations, and retains mode/group/page on return',async()=>{
 const source=descriptivePreMealFixture(),base=source.sessions[1]!,f=source.feelings[1]!;
 for(let i=0;i<50;i++){const id=descriptiveId(22000+i);source.sessions.push({...base,id});source.feelings.push({...f,sessionId:id});}
 for(let i=1;i<source.feelings.length;i++){const facts=source.feelings[i]!.facts as Record<string,Record<string,unknown>>;facts.energyPre={...facts.energyPre!,value:i<7?1:4};if(i===1)delete facts.energyPost;}
 mockParams={...compareParams(),coincidence:'calories'};
 mockRead.mockImplementation(async o=>{const q=new URL(`http://fixture${o.path}`).searchParams;return {status:'ok',data:o.parse(q.get('view')==='coincidence-evidence'?periodCoincidenceEvidence(source,[],'2026-11-09','2026-11-07','r2',q.get('revision')!,{kind:'calories',group:'lower'},Number(q.get('offset'))):periodExploration(source,[],'2026-11-09','2026-11-07','r2',2)),meta} as never;});
 const view=render(wrap());await view.findByText('Coincidencias descriptivas de tus registros');
 const press=async(name:string)=>{await act(async()=>{fireEvent.press(view.getByRole('button',{name}));const p=mockSetParams.mock.calls.at(-1)?.[0];if(p)mockParams={...mockParams,...p as Record<string,string>};view.rerender(wrap());});};
 await press('Ver energía y fatiga según alimentación previa');expect(mockRead).toHaveBeenCalledTimes(1);
 const descriptions=within(view.getByTestId('descriptive-coincidences'));expect(descriptions.queryByText('Método completo')).toBeNull();expect(descriptions.getAllByText('Energía al terminar')).toHaveLength(2);expect(descriptions.getAllByText('Fatiga al terminar')).toHaveLength(2);
 expect(view.getAllByText(/Las poblaciones previa y posterior pueden ser distintas/)).toHaveLength(4);
 expect(view.getAllByText(/Muy baja|muy baja/).length).toBeGreaterThan(0);
 await press('Ver 56 registros del grupo hasta la mediana');expect(mockRead).toHaveBeenCalledTimes(2);
 await press('Ver siguientes registros');expect(mockRead).toHaveBeenCalledTimes(3);expect(view.getByText('Registros 26–50 de 56')).toBeTruthy();
 fireEvent.press(view.getAllByRole('button',{name:/^Ver horarios y comidas de/})[0]!);
 const temporal=mockPush.mock.calls.at(-1)![0] as {params:Record<string,string>};expect(temporal.params).toMatchObject({coincidence:'calories',coincidenceView:'feelings',coincidenceGroup:'lower',coincidencePage:'25',weekA:'2026-08-03',weekB:'2026-08-10',revision:'r2'});
 const href=nutritionDayHref('2026-08-03',{...temporal.params,session:undefined,date:undefined,temporal:undefined});
 expect(insightsReturnHref(href.params)).toMatchObject({params:{coincidenceView:'feelings',coincidenceGroup:'lower',coincidencePage:'25',weekA:'2026-08-03',weekB:'2026-08-10'}});
 expect(insightsReturnHref({...href.params,insightsCoincidenceView:'invalid'})).toBeNull();
 await press('Ver resultados del entrenamiento');expect(view.getAllByText('Método completo')).toHaveLength(2);expect(mockRead).toHaveBeenCalledTimes(3);
});
it('shows unavailable feeling fields on old servers distinctly from empty groups and never rereads on a mode switch',async()=>{
 const payload=periodExploration(descriptivePreMealFixture(),[],'2026-11-09','2026-11-07','r2',2);
 for(const d of [payload.coincidenceSummary!.protein,...Object.values(payload.coincidenceSummary!.preMeal!)]){delete d.feelingReadiness;for(const g of d.groups)delete g.feelings;}
 mockParams={...mockParams,coincidence:'protein',coincidenceView:'feelings'};mockRead.mockImplementation(async o=>({status:'ok',data:o.parse(payload),meta})as never);
 const view=render(wrap());await view.findByText('Coincidencias descriptivas de tus registros');
 expect(view.getByText('Las distribuciones por alimentación no están disponibles en esta versión del servidor; no significa que falten respuestas.')).toBeTruthy();
 expect(within(view.getByTestId('descriptive-coincidences')).queryByText('Energía al terminar')).toBeNull();expect(mockRead).toHaveBeenCalledTimes(1);
});

it('switches weekly nutrients and training/body locally with coverage, separate methods and preserved return identity',async()=>{
 const f=descriptiveWeeklyFixture(),payload=periodExploration(f.source,f.weights,'2026-11-09','2026-11-07','r2',2);
 mockRead.mockImplementation(async o=>({status:'ok',data:o.parse(payload),meta})as never);mockParams={...compareParams(),coincidence:'body'};
 const view=render(wrap());await view.findByTestId('weekly-coincidences');
 const press=async(name:string)=>{await act(async()=>{fireEvent.press(view.getByRole('button',{name}));mockParams={...mockParams,...mockSetParams.mock.calls.at(-1)![0] as Record<string,string>};view.rerender(wrap());});};
 await press('Elegir calorías semanales');await press('Ver resultados de entrenamiento por alimentación semanal');
 const block=within(view.getByTestId('weekly-coincidences'));
 expect(block.getAllByText('Método completo')).toHaveLength(2);expect(block.getAllByText('Método parcial')).toHaveLength(2);expect(block.getByText(/Corte: hasta 200 kcal/)).toBeTruthy();expect(block.getAllByText(/4 sesiones en 4 días entrenados/)).toHaveLength(2);expect(mockRead).toHaveBeenCalledTimes(1);
 await press('Ver 4 semanas y sus registros del grupo hasta la mediana');
 fireEvent.press(view.getByRole('button',{name:'Abrir Nutrición del 03/08/2026 y sus registros'}));
 const meal=mockPush.mock.calls.at(-1)![0] as ReturnType<typeof nutritionDayHref>;expect(insightsReturnHref(meal.params)).toMatchObject({params:{coincidence:'body',weeklyNutrient:'calories',weeklyOutcome:'training',coincidenceGroup:'lower',weekA:'2026-08-03',weekB:'2026-08-10',revision:'r2'}});
 fireEvent.press(block.getByRole('button',{name:'Ver sesiones y comparaciones del 03/08/2026'}));const session=mockPush.mock.calls.at(-1)![0] as {params:Record<string,string>};expect(session.params).toMatchObject({date:'2026-08-03',before:'2026-08-04',weeklyNutrient:'calories',weeklyOutcome:'training',coincidenceGroup:'lower'});
 await press('Ver peso corporal por alimentación semanal');expect(mockParams.coincidenceGroup).toBe('lower');expect(block.getByText(/hay solapamiento temporal/)).toBeTruthy();expect(block.getAllByText(/cambio: 0 kg/).length).toBeGreaterThan(0);
 fireEvent.press(view.getByRole('button',{name:'Ver pesajes y referencia de 10/08/2026 – 16/08/2026'}));const weight=mockPush.mock.calls.at(-1)![0] as ReturnType<typeof bodyWeightHref>;expect(insightsReturnHref(weight.params)).toMatchObject({params:{weeklyNutrient:'calories',weeklyOutcome:'weight',coincidenceGroup:'lower'}});
 await press('Elegir grasas semanales');expect(block.getByText(/los valores son iguales/)).toBeTruthy();expect(mockParams.coincidenceGroup).toBeUndefined();expect(block.getByRole('button',{name:'Ver 0 semanas y sus registros del grupo sobre la mediana'})).toBeTruthy();
 await press('Elegir carbohidratos semanales');expect(block.getByText(/Corte: hasta 50 g/)).toBeTruthy();expect(mockRead).toHaveBeenCalledTimes(1);
 expect(insightsReturnHref({...meal.params,insightsWeeklyNutrient:'salt'})).toBeNull();expect(insightsReturnHref({...meal.params,insightsWeeklyOutcome:'causality'})).toBeNull();
});
it('computes weekly groups on older responses without inventing missing session/routine coverage',async()=>{
 const f=descriptiveWeeklyFixture(),payload=periodExploration(f.source,f.weights,'2026-11-09','2026-11-07','r2',2);delete payload.coincidenceSummary;for(const w of payload.weeks)delete w.trainingCoverage;
 mockParams={...mockParams,coincidence:'body',weeklyNutrient:'carbsG',weeklyOutcome:'training',coincidenceGroup:'upper'};mockRead.mockImplementation(async o=>({status:'ok',data:o.parse(payload),meta})as never);
 const view=render(wrap());await view.findByTestId('weekly-coincidences');const block=within(view.getByTestId('weekly-coincidences'));
 expect(within(block.getByTestId('weekly-record-2026-08-03')).getAllByText(/sesiones comparables no disponibles en esta versión/)).toHaveLength(2);expect(block.getAllByText('Cobertura por sesión y rutinas no disponibles en esta versión del servidor. Los conteos de ejercicios y días siguen disponibles.')).toHaveLength(4);expect(mockRead).toHaveBeenCalledTimes(1);
});
it('retains weekly selection across revision refresh and clears account-owned records on account change',async()=>{
 const f=descriptiveWeeklyFixture();let revision='r2';mockParams={...mockParams,coincidence:'body',weeklyNutrient:'fatG',weeklyOutcome:'training',coincidenceGroup:'lower'};
 mockRead.mockImplementation(async o=>({status:'ok',data:o.parse(periodExploration(f.source,f.weights,'2026-11-09','2026-11-07',revision,2)),meta})as never);
 const view=render(wrap());await view.findByTestId('weekly-record-2026-08-03');revision='r3';
 const refresh=view.UNSAFE_getByType(RefreshControl);await act(async()=>{refresh.props.onRefresh();});expect(mockParams).toMatchObject({weeklyNutrient:'fatG',weeklyOutcome:'training',coincidenceGroup:'lower'});
 fireEvent.press(view.getByRole('button',{name:'Abrir Nutrición del 03/08/2026 y sus registros'}));const meal=mockPush.mock.calls.at(-1)![0] as ReturnType<typeof nutritionDayHref>;expect(meal.params.insightsRevision).toBe('r3');
 const empty={...f.source,sessions:[],exercises:[],sets:[],meals:[],feelings:[]};const nextRead=jest.fn<MobileApiClient['read']>().mockImplementation(async o=>({status:'ok',data:o.parse(periodExploration(empty,[],'2026-11-09','2026-11-07','other',2)),meta})as never);
 mockClient={read:nextRead,request:jest.fn()} as unknown as MobileApiClient;await act(async()=>view.rerender(wrap()));expect(view.queryByTestId('weekly-record-2026-08-03')).toBeNull();expect(nextRead).toHaveBeenCalledTimes(1);
});
