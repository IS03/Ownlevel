import { beforeEach,describe,expect,it,vi } from 'vitest';
import { NextRequest } from 'next/server';
import { parseDayWriteIntent,parseDayWriteResponse } from './nutrition-day-write-contract';
import { MobileApiUnauthorizedError } from './auth';
import { buildMobileNutritionDayResponse } from './nutrition-day';
vi.mock('server-only',()=>({}));
vi.mock('./supabase',()=>({authenticateMobileMutationAccessToken:vi.fn()}));
import { authenticateMobileMutationAccessToken } from './supabase';
import { PATCH as metrics,OPTIONS } from '@/app/api/mobile/v1/nutrition/days/[date]/metrics/route';
import { PATCH as context } from '@/app/api/mobile/v1/nutrition/days/[date]/context/route';
const date='2026-10-03',id='41300000-0000-4000-8000-000000000001',version='2026-10-03T12:00:00.123456Z';
const intent={operation:'metrics',date,idempotencyKey:'key',changes:[{metricId:id,definitionUpdatedAt:version,expectedUpdatedAt:null,value:0}]};
const ci={operation:'context',date,idempotencyKey:'ctx',expectedUpdatedAt:version,changes:{target:{action:'clear'},expenditure:{action:'set',value:2500}}};
const request=(body:unknown=intent,auth='Bearer token')=>new NextRequest(`https://ownlevel.fit/api/mobile/v1/nutrition/days/${date}/metrics`,{method:'PATCH',headers:{authorization:auth,'Content-Type':'application/json'},body:JSON.stringify(body)});
const rpc=vi.fn();beforeEach(()=>{vi.clearAllMocks();vi.mocked(authenticateMobileMutationAccessToken).mockResolvedValue({userId:id,supabase:{rpc}} as never);});
describe('Day writes contract',()=>{
 it('preserves missing, zero, 4 decimal digits and exact CAS timestamps',()=>{
  expect(parseDayWriteIntent(intent)).toEqual(intent);
  expect(parseDayWriteIntent({...intent,changes:[{...intent.changes[0],value:null}]})).toBeDefined();
  expect(parseDayWriteIntent({...intent,changes:[{...intent.changes[0],value:1.1234,expectedUpdatedAt:version}]})).toMatchObject({changes:[{expectedUpdatedAt:version,value:1.1234}]});
  expect(parseDayWriteIntent(ci)).toEqual(ci);
 });
 it.each([{value:-1},{value:1.12345},{value:'0'},{definitionUpdatedAt:null},{expectedUpdatedAt:'invalid'}])('rejects invalid metric change %j',patch=>{
  expect(parseDayWriteIntent({...intent,changes:[{...intent.changes[0],...patch}]})).toBeUndefined();
 });
 it('rejects foreign client identity, duplicate fields, ambiguous context null and empty batch',()=>{
  expect(parseDayWriteIntent({...intent,user_id:id})).toBeUndefined();
  expect(parseDayWriteIntent({...intent,changes:[...intent.changes,...intent.changes]})).toBeUndefined();
  expect(parseDayWriteIntent({...intent,changes:[]})).toBeUndefined();
  for(const changes of [{target:null},{target:{action:'set',value:0}},{target:{action:'set',value:20001}},{expenditure:{action:'set',value:50001}},{target:{action:'clear',value:null}},{globalPlan:1}])expect(parseDayWriteIntent({...ci,changes})).toBeUndefined();
 });
 it('allows partial availability and old read contracts; validates additive versions',()=>{
  const activity={status:'ok',data:{metrics:[{id,systemKey:null,label:'Personal',unit:null,valueType:'decimal',target:null,value:null,isActive:true,updatedAt:null,definitionUpdatedAt:version}]}};
  expect(buildMobileNutritionDayResponse(date,{date,today:date,nutrition:{status:'unavailable'},activity}).activity).toMatchObject({data:{metrics:[{definitionUpdatedAt:version}]}});
  expect(buildMobileNutritionDayResponse(date,{date,today:date,nutrition:{status:'ok',data:{dayLog:null,meals:[]}},activity:{...activity,data:{metrics:[{...activity.data.metrics[0],definitionUpdatedAt:'bad'}]}}}).activity.status).toBe('unavailable');
  expect(parseDayWriteResponse({status:'saved',date:'bad',operation:'context'})).toBeUndefined();
 });
});
describe('Date-scoped authenticated routes',()=>{
 it('authenticates before parsing, requires no-store, and supports OPTIONS',async()=>{
  expect((await metrics(request(intent,''),{params:Promise.resolve({date})})).status).toBe(401);expect(rpc).not.toHaveBeenCalled();
  vi.mocked(authenticateMobileMutationAccessToken).mockRejectedValueOnce(new MobileApiUnauthorizedError());
  const r=await context(request(ci),{params:Promise.resolve({date})});expect(r.status).toBe(401);expect(r.headers.get('Cache-Control')).toBe('no-store');
  expect((await OPTIONS(request())).status).toBe(204);
 });
 it('rejects ownership, wrong date and operation before the RPC',async()=>{
  expect((await metrics(request({...intent,user_id:id}),{params:Promise.resolve({date})})).status).toBe(400);
  expect((await metrics(request(),{params:Promise.resolve({date:'2026-10-02'})})).status).toBe(400);
  expect((await context(request(),{params:Promise.resolve({date})})).status).toBe(400);expect(rpc).not.toHaveBeenCalled();
 });
 it.each(['metrics','context'])('uses one transaction and returns stored %s receipt',async op=>{
  const receipt={status:'saved',date,operation:op};rpc.mockResolvedValueOnce({data:[{response_status:200,response_body:receipt,replayed:true}],error:null});
  const fn=op==='metrics'?metrics:context;const r=await fn(request(op==='metrics'?intent:ci),{params:Promise.resolve({date})});expect(r.status).toBe(200);expect(await r.json()).toEqual(receipt);expect(rpc).toHaveBeenCalledTimes(1);expect(rpc.mock.calls[0][0]).toBe('mobile_mutate_nutrition_day');
 });
 it.each(['METRICS_CHANGED','METRIC_UNAVAILABLE','METRIC_FUTURE_DATE','CONTEXT_CHANGED','CONTEXT_UNAVAILABLE','IDEMPOTENCY_KEY_REUSED'])('preserves %s',async error=>{
  const body={error,message:'changed'};rpc.mockResolvedValueOnce({data:[{response_status:409,response_body:body}],error:null});
  const r=await metrics(request(),{params:Promise.resolve({date})});expect(r.status).toBe(409);expect(await r.json()).toEqual(body);
 });
 it('invalid DB values return validation; interruptions and mismatched receipts remain ambiguous',async()=>{
  rpc.mockResolvedValueOnce({data:null,error:{code:'22023'}});expect((await metrics(request(),{params:Promise.resolve({date})})).status).toBe(400);
  rpc.mockResolvedValueOnce({data:null,error:{code:'57014'}});expect((await metrics(request(),{params:Promise.resolve({date})})).status).toBe(503);
  rpc.mockResolvedValueOnce({data:[{response_status:200,response_body:{status:'saved',date:'2026-10-02',operation:'metrics'}}],error:null});expect((await metrics(request(),{params:Promise.resolve({date})})).status).toBe(503);
 });
});
describe('#367 sleep night in a day write',()=>{
 const sleep={...intent.changes[0],value:420,sleepNight:'sleep_night_ending_on_date/1'};
 it('accepts the declaration only with a value and the exact convention, and keeps it out of what the writer hashes',async()=>{
  const { splitSleepNights }=await import('./nutrition-day-write-contract');
  const parsed=parseDayWriteIntent({...intent,changes:[sleep]})!;
  expect(parsed).toMatchObject({changes:[{sleepNight:'sleep_night_ending_on_date/1'}]});
  expect(splitSleepNights(parsed)).toEqual({intent:{...intent,changes:[{...intent.changes[0],value:420}]},sleepNightMetricIds:[id]});
  for(const change of [{...sleep,value:null},{...sleep,sleepNight:'yes'},{...sleep,sleepNight:true}])expect(parseDayWriteIntent({...intent,changes:[change]})).toBeUndefined();
 });
 it('routes a declaring write to the v2 wrapper and every other write to the unchanged v1',async()=>{
  const receipt={status:'saved',date,operation:'metrics'};
  rpc.mockResolvedValueOnce({data:[{response_status:200,response_body:receipt,replayed:false}],error:null});
  expect((await metrics(request({...intent,changes:[sleep]}),{params:Promise.resolve({date})})).status).toBe(200);
  expect(rpc).toHaveBeenLastCalledWith('mobile_mutate_nutrition_day_v2',{p_intent:{...intent,changes:[{...intent.changes[0],value:420}]},p_sleep_night_metric_ids:[id]});
  rpc.mockResolvedValueOnce({data:[{response_status:200,response_body:receipt,replayed:false}],error:null});
  await metrics(request(),{params:Promise.resolve({date})});
  expect(rpc).toHaveBeenLastCalledWith('mobile_mutate_nutrition_day',{p_intent:intent});
 });
});
