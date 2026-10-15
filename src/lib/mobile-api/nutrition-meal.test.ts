import { describe, expect, it, vi, beforeEach } from 'vitest';
import { parseManualMealFields, parseMealMutationIntent, parseMealMutationResponse } from './nutrition-meal-contract';
import { MobileApiUnauthorizedError } from './auth';
vi.mock('server-only',()=>({}));
vi.mock('./supabase',()=>({authenticateMobileMutationAccessToken:vi.fn()}));
import { authenticateMobileMutationAccessToken } from './supabase';
import { nutritionMealMutationResponse } from './nutrition-meal-server';
const date='2026-10-03', id='41200000-0000-4000-8000-000000000001', version='2026-10-03T03:00:00.123456Z';
const fields={date,title:'  my  meal ',description:' ',calories:300,proteinG:null,carbsG:12.25,fatG:0};
const intent={operation:'create' as const,sourceDate:date,mealId:null,expectedUpdatedAt:null,idempotencyKey:'key',fields,forceDuplicate:false};
const request=(body:unknown=intent,authorization='Bearer valid')=>new Request('https://ownlevel.fit/api/mobile/v1/nutrition/days/'+date+'/meals',
  {method:'POST',headers:{authorization,'Content-Type':'application/json'},body:JSON.stringify(body)});
const rpc=vi.fn();
beforeEach(()=>{ vi.clearAllMocks(); vi.mocked(authenticateMobileMutationAccessToken).mockResolvedValue({userId:id,supabase:{rpc}} as never); });
describe('Manual meal wire contract',()=>{
  it('normalizes text while preserving null, explicit zero and timestamp precision',()=>{
    expect(parseManualMealFields(fields)).toMatchObject({title:'MY MEAL',description:null,proteinG:null,fatG:0});
    expect(parseMealMutationIntent({...intent,operation:'edit',mealId:id,expectedUpdatedAt:version})?.expectedUpdatedAt).toBe(version);
    expect(parseMealMutationIntent({...intent,user_id:id})).toBeUndefined();
  });
  it.each([{calories:0},{calories:1.5},{proteinG:-1},{carbsG:1.001},{date:'2026-02-30'},{fatG:'0'}])('rejects invalid payload %j',patch=>{
    expect(parseManualMealFields({...fields,...patch})).toBeUndefined();
  });
  it('distinguishes delete and create/edit and validates changed-date conflicts',()=>{
    expect(parseMealMutationIntent({...intent,operation:'delete',mealId:id,expectedUpdatedAt:version,fields:null})).toBeDefined();
    expect(parseMealMutationIntent({...intent,operation:'delete',mealId:id,expectedUpdatedAt:version})).toBeUndefined();
    expect(parseMealMutationResponse({error:'MEAL_CHANGED',message:'changed'})).toBeUndefined();
    expect(parseMealMutationResponse({error:'MEAL_CHANGED',message:'changed',currentDate:date})).toBeDefined();
  });
});
describe('Manual meal authenticated HTTP adapter',()=>{
  it('requires Bearer before parsing or writing',async()=>{
    const response=await nutritionMealMutationResponse(request(intent,''),'create',date);
    expect(response.status).toBe(401); expect(response.headers.get('Cache-Control')).toBe('no-store'); expect(rpc).not.toHaveBeenCalled();
    vi.mocked(authenticateMobileMutationAccessToken).mockRejectedValueOnce(new MobileApiUnauthorizedError());
    expect((await nutritionMealMutationResponse(request(),'create',date)).status).toBe(401);
  });
  it('rejects client ownership and route/body mismatch',async()=>{
    expect((await nutritionMealMutationResponse(request({...intent,user_id:id}),'create',date)).status).toBe(400);
    expect((await nutritionMealMutationResponse(request(),'create','2026-10-02')).status).toBe(400);
    expect((await nutritionMealMutationResponse(request(),'edit',date,id)).status).toBe(400); expect(rpc).not.toHaveBeenCalled();
  });
  it('sends only normalized intent to one atomic RPC and preserves stored success',async()=>{
    rpc.mockResolvedValueOnce({data:[{response_status:201,response_body:{status:'saved',mealId:id,sourceDate:date,destinationDate:date,updatedAt:version},replayed:true}],error:null});
    const response=await nutritionMealMutationResponse(request(),'create',date); expect(response.status).toBe(201);
    expect(rpc).toHaveBeenCalledTimes(1); expect(rpc).toHaveBeenCalledWith('mobile_mutate_manual_meal',{p_intent:expect.objectContaining({fields:expect.objectContaining({title:'MY MEAL',proteinG:null,fatG:0})})});
    expect(await response.json()).toEqual({status:'saved',mealId:id,sourceDate:date,destinationDate:date,updatedAt:version});
  });
  it.each(['POSSIBLE_DUPLICATE','MEAL_CHANGED','MEAL_UNAVAILABLE','DAY_HAS_HISTORICAL_SUMMARY','IDEMPOTENCY_KEY_REUSED'])('preserves explicit %s conflict',async error=>{
    const response_body={error,message:'conflict',...(error==='MEAL_CHANGED'?{currentDate:date}:{})};
    rpc.mockResolvedValueOnce({data:[{response_status:409,response_body}],error:null});
    const response=await nutritionMealMutationResponse(request(),'create',date); expect(response.status).toBe(409); expect(await response.json()).toEqual(response_body);
  });
  it('foreign/missing shares 404 and uncertain database errors stay unavailable',async()=>{
    rpc.mockResolvedValueOnce({data:[{response_status:404,response_body:{error:'NOT_FOUND'}}],error:null});
    expect((await nutritionMealMutationResponse(request(),'create',date)).status).toBe(404);
    rpc.mockResolvedValueOnce({data:null,error:{code:'57014'}});
    expect((await nutritionMealMutationResponse(request(),'create',date)).status).toBe(503);
  });
});

describe('M9 additive meal timing', () => {
  it('keeps legacy fields byte-for-byte and normalizes explicit local time', () => {
    expect(parseManualMealFields(fields)).toEqual({ ...fields, title: 'MY MEAL', description: null });
    expect(parseManualMealFields({ ...fields, mealLabel: 'lunch', consumedAt: '2026-10-03T13:40:00-03:00', saveToLibrary: true })).toMatchObject({ mealLabel: 'lunch', consumedAt: '2026-10-03T16:40:00.000Z', saveToLibrary: true, proteinG: null, fatG: 0 });
    expect(parseMealMutationIntent({ ...intent, fields: { ...fields, saveToLibrary: true, title: '', description: null } })).toBeUndefined();
    expect(parseMealMutationIntent({ ...intent, operation: 'edit', mealId: id, expectedUpdatedAt: version, fields: { ...fields, saveToLibrary: true } })).toBeUndefined();
  });
  it.each([{ mealLabel: 'brunch' }, { consumedAt: null }, { consumedAt: '2026-10-04T12:00:00Z' }, { consumedAt: '2026-10-03T01:00:00Z' }, { consumedAt: '2026-10-03T24:00:00Z' }, { consumedAt: '2026-02-30T15:00:00Z' }, { saveToLibrary: 'true' }, { userId: id }])('rejects invalid timing/ownership %j', patch => {
    expect(parseManualMealFields({ ...fields, ...patch })).toBeUndefined();
  });
  it('passes the optional fields into the SAME atomic RPC', async () => {
    rpc.mockResolvedValueOnce({ data: [{ response_status: 201, response_body: { status: 'saved', mealId: id, sourceDate: date, destinationDate: date, updatedAt: version } }], error: null });
    expect((await nutritionMealMutationResponse(request({ ...intent, fields: { ...fields, mealLabel: null, consumedAt: '2026-10-03T12:00:00-03:00', saveToLibrary: true } }), 'create', date)).status).toBe(201);
    expect(rpc).toHaveBeenCalledWith('mobile_mutate_manual_meal', { p_intent: expect.objectContaining({ fields: expect.objectContaining({ mealLabel: null, consumedAt: '2026-10-03T15:00:00.000Z', saveToLibrary: true }) }) });
  });
});
