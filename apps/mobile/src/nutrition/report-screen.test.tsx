import {act,fireEvent,render,waitFor} from '@testing-library/react-native';
import {beforeEach,describe,expect,it,jest} from '@jest/globals';
import { clearConfirmedReads } from '@/api/confirmed-read-cache';
import {AppState,type AppStateStatus} from 'react-native';
import { OwnlevelThemeProvider } from '@/design-system';
import type {MobileApiClient} from '@/api/client';
import {parseNutritionReport,fetchNutritionReport,type ReportQuery} from '@/api/nutrition-report';
import {NutritionReports} from './report-screen';
import {reportFixture} from './report-fixture.test-helper';
const mockRead=jest.fn<MobileApiClient['read']>();const mockClient={read:mockRead,request:jest.fn<MobileApiClient["request"]>()};
jest.mock('@/api',()=>({useMobileApi:()=>({client:mockClient})}));jest.mock('expo-router',()=>({useFocusEffect:()=>{}}));jest.mock('expo-symbols',()=>({SymbolView:()=>null}));
const listeners:((s:AppStateStatus)=>void)[]=[];
const query=(path:string):ReportQuery=>{const p=new URLSearchParams(path.split('?')[1]);return {period:p.get('period') as ReportQuery['period'],...(p.has('from')?{from:p.get('from')!,to:p.get('to')!}:{})};};
const ok=(q:ReportQuery)=>({status:'ok',data:reportFixture(q),meta:{durationMs:1,httpStatus:200,outcome:'ok'}} as const);
const failure={status:'unavailable',reason:'network',meta:{durationMs:1,httpStatus:null,outcome:'unavailable'}} as const;
const element=(onDate=jest.fn(),onClose=jest.fn())=><OwnlevelThemeProvider initialMode="light"><NutritionReports onClose={onClose} onDate={onDate}/></OwnlevelThemeProvider>;
describe('Native Nutrition Reports',()=>{
 beforeEach(()=>{clearConfirmedReads(mockClient as never);mockRead.mockReset();listeners.length=0;mockRead.mockImplementation(async o=>ok(query(o.path)) as never);jest.spyOn(AppState,'addEventListener').mockImplementation((_e,l)=>{listeners.push(l);return {remove:()=>{const i=listeners.indexOf(l);if(i>=0)listeners.splice(i,1);}};});});
 it('runtime validation preserves zero and rejects wrong scope/malformed coverage',async()=>{
  const r=reportFixture();expect(parseNutritionReport(r)).toEqual(r);expect(r.days[0]!.nutrients.fat.value).toBe(0);expect(parseNutritionReport({...r,summary:{...r.summary,metrics:{...r.summary.metrics,protein:{value:0,denominator:0,partialDays:0}}}})).toBeUndefined();
  await fetchNutritionReport(mockClient as MobileApiClient,{period:'14'});const parse=mockRead.mock.calls[0]![0].parse;expect(parse(r)).toBeUndefined();expect(parse(reportFixture({period:'14'}))).toBeDefined();
 });
 it('default 7, summary, coverage, evolution, highlights and date navigation',async()=>{
  const onDate=jest.fn(),onClose=jest.fn(),v=render(element(onDate,onClose));await v.findByText('Resumen');expect(v.getByText('Período: 7 días')).toBeTruthy();expect(v.getByText('Cobertura')).toBeTruthy();expect(v.getByText('Evolución')).toBeTruthy();expect(v.getByText('Macros')).toBeTruthy();fireEvent.press(v.getByText(/Más cerca del objetivo/));expect(onDate).toHaveBeenCalledWith('2026-10-03');expect(onClose).toHaveBeenCalled();
 });
 it('periods and custom inputs survive foreground/manual refresh',async()=>{
  const v=render(element());await v.findByText('Resumen');fireEvent.press(v.getByText('14 días'));await waitFor(()=>expect(mockRead.mock.calls.at(-1)![0].path).toContain('period=14'));fireEvent.press(v.getByText('Personalizado'));fireEvent.changeText(v.getByLabelText('Desde (DD/MM/AAAA)'),'01/10/2026');fireEvent.changeText(v.getByLabelText('Hasta (DD/MM/AAAA)'),'04/10/2026');
  await act(async()=>{listeners.forEach(l=>l('background'));listeners.forEach(l=>l('active'));});expect(v.getByLabelText('Desde (DD/MM/AAAA)').props.value).toBe('01/10/2026');fireEvent.press(v.getByText('Consultar rango'));await waitFor(()=>expect(mockRead.mock.calls.at(-1)![0].path).toContain('from=2026-10-01'));await act(async()=>fireEvent.press(v.getByText('Actualizar reporte')));expect(v.getByLabelText('Desde (DD/MM/AAAA)').props.value).toBe('01/10/2026');
 });
 it('invalid date, unavailable distinct from empty, manual retry',async()=>{
  mockRead.mockResolvedValue(failure as never);const v=render(element());await v.findByText('No pudimos cargar el reporte');expect(v.queryByText('Sin registros nutricionales')).toBeNull();mockRead.mockImplementation(async o=>ok(query(o.path)) as never);fireEvent.press(v.getByText('Reintentar reporte'));await v.findByText('Resumen');fireEvent.press(v.getByText('Personalizado'));fireEvent.changeText(v.getByLabelText('Desde (DD/MM/AAAA)'),'31/02/2026');fireEvent.press(v.getByText('Consultar rango'));expect(v.getByText(/Usá fechas válidas/)).toBeTruthy();
 });
 it('empty and partial render explicitly',async()=>{
  const r=reportFixture();r.status='empty';mockRead.mockResolvedValue({...ok({period:'7'}),data:r} as never);const v=render(element());await v.findByText('Sin registros nutricionales');r.status='partial';r.summary.metrics.protein={value:100,denominator:1,partialDays:1};await act(async()=>fireEvent.press(v.getByText('Actualizar reporte')));expect(v.getByText('1 días · 1 con suma parcial')).toBeTruthy();
 });
 it('stale period cannot replace newer period; failure keeps only same-scope truth',async()=>{
  let resolveOld:(value:unknown)=>void=()=>{};mockRead.mockImplementationOnce(()=>new Promise(resolve=>{resolveOld=resolve as typeof resolveOld;}));const v=render(element());fireEvent.press(v.getByText('14 días'));await v.findByText('Resumen');await act(async()=>resolveOld(ok({period:'7'})));expect(v.getByText('Período: 14 días')).toBeTruthy();mockRead.mockResolvedValue(failure as never);await act(async()=>fireEvent.press(v.getByText('Actualizar reporte')));await v.findByText('No pudimos cargar el reporte');expect(v.getByText('Resumen')).toBeTruthy();fireEvent.press(v.getByText('30 días'));await waitFor(()=>expect(v.queryByText('Resumen')).toBeNull());
 });
});
