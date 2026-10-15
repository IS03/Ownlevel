import { describe, expect, it, jest } from '@jest/globals';
import type { MealMutationReceipt } from '@/api/nutrition-meal';
import { MealController, type MealApi } from './meal-controller';
import { MealIntentRepository, type MealStoragePort } from './meal-storage';
import { mealDraft, validateMealDraft } from './meal-form-model';
import { nutritionFixture } from './day-fixture.test-helper';
const date='2026-10-02', version='2026-10-02T12:00:00Z', id='41200000-0000-4000-8000-000000000003';
const meta={durationMs:1,httpStatus:200,outcome:'ok' as const};
const failure={status:'unavailable' as const,reason:'network' as const,meta:{durationMs:1,httpStatus:null,outcome:'unavailable' as const}};
const receipt: MealMutationReceipt={status:'saved',mealId:id,sourceDate:date,destinationDate:date,updatedAt:version};
function fixture() {
  const map=new Map<string,string>();
  const storage: MealStoragePort={getItem:async k=>map.get(k)??null,setItem:async(k,v)=>{map.set(k,v);},removeItem:async k=>{map.delete(k);}};
  const repository=new MealIntentRepository(storage,'owner');
  const api: MealApi={mutate:jest.fn<MealApi['mutate']>().mockResolvedValue({status:'ok',data:receipt,meta}),read:jest.fn<MealApi['read']>().mockImplementation(async d=>({status:'ok',data:nutritionFixture(d),meta}))};
  const invalidate=jest.fn<(dates:string[])=>void>(); let key=0;
  const controller=new MealController(api,repository,invalidate,()=>`intent:${++key}`);
  const meal=nutritionFixture(date).nutrition;
  if(meal.status!=='ok'||meal.data.dayState!=='recorded') throw new Error('Bad fixture');
  return {controller,api,repository,storage,map,invalidate,meal:{...meal.data.meals[0],id,updatedAt:version,sourceType:'manual' as const}};
}
describe('Reliable manual meal writes',()=>{
  it('form preserves null versus zero, comma decimals and integer calories without deriving calories',()=>{
    const d={...mealDraft(date),calories:'250',proteinG:'',carbsG:'12,25',fatG:'0'};
    expect(validateMealDraft(d).fields).toMatchObject({calories:250,proteinG:null,carbsG:12.25,fatG:0});
    for(const calories of ['','0','-1','1.2','1e3']) expect(validateMealDraft({...d,calories}).errors.calories).toBeTruthy();
    expect(validateMealDraft({...d,proteinG:'-1'}).fields).toBeUndefined();
    expect(validateMealDraft({...d,carbsG:'1,234'}).fields).toBeUndefined();
    expect(validateMealDraft({...d,date:'30/02/2026'}).errors.date).toBeTruthy();
  });
  it('persists before create, deduplicates double tap, reads confirmed truth then clears',async()=>{
    const f=fixture(); await f.controller.initialize(); f.controller.open(date); f.controller.change('calories','250');
    let resolve!: (v:Awaited<ReturnType<MealApi['mutate']>>)=>void;
    (f.api.mutate as jest.Mock<MealApi['mutate']>).mockImplementation(async()=>{
      expect(await f.repository.read()).not.toBeNull(); return new Promise(r=>{resolve=r;});
    });
    const saving=f.controller.save(); await Promise.resolve(); await Promise.resolve();
    expect(f.controller.getSnapshot().phase).toBe('pending');
    await f.controller.save();
    while(!resolve) await Promise.resolve(); resolve({status:'ok',data:receipt,meta}); await saving;
    expect(f.api.mutate).toHaveBeenCalledTimes(1); expect(f.api.read).toHaveBeenCalledWith(date);
    expect(await f.repository.read()).toBeNull(); expect(f.controller.getSnapshot().editor).toBeNull();
  });
  it('edit move rereads origin/destination and delete uses observed CAS',async()=>{
    const f=fixture(); await f.controller.initialize(); f.controller.open(date,f.meal); f.controller.change('date','01/10/2026');
    (f.api.mutate as jest.Mock<MealApi['mutate']>).mockResolvedValueOnce({status:'ok',data:{...receipt,destinationDate:'2026-10-01'},meta});
    await f.controller.save();
    expect(f.api.mutate).toHaveBeenCalledWith(expect.objectContaining({operation:'edit',expectedUpdatedAt:version,fields:expect.objectContaining({date:'2026-10-01'})}));
    expect(f.api.read).toHaveBeenCalledWith(date); expect(f.api.read).toHaveBeenCalledWith('2026-10-01');
    f.controller.open(date,f.meal); (f.api.mutate as jest.Mock<MealApi['mutate']>).mockResolvedValueOnce({status:'ok',data:{...receipt,status:'deleted'},meta});
    await f.controller.save(false,true); expect(f.api.mutate).toHaveBeenLastCalledWith(expect.objectContaining({operation:'delete',expectedUpdatedAt:version,fields:null}));
  });
  it('remount restores uncertain intent without automatically sending and explicitly replays identical payload/key',async()=>{
    const f=fixture(); await f.controller.initialize(); f.controller.open(date); f.controller.change('calories','250');
    (f.api.mutate as jest.Mock<MealApi['mutate']>).mockResolvedValueOnce(failure);
    await f.controller.save(); const original=(await f.repository.read())!;
    expect(f.controller.getSnapshot().phase).toBe('uncertain'); f.controller.change('calories','999');
    expect(f.controller.getSnapshot().editor?.draft.calories).toBe('250');
    const restored=new MealController(f.api,f.repository,f.invalidate); await restored.initialize();
    expect(f.api.mutate).toHaveBeenCalledTimes(1); expect(restored.getSnapshot().editor?.draft.calories).toBe('250');
    await restored.recover(); expect(f.api.mutate).toHaveBeenLastCalledWith(original.intent); expect(await f.repository.read()).toBeNull();
  });
  it('confirmed write with unavailable read is recovered with reads only',async()=>{
    const f=fixture(); await f.controller.initialize(); f.controller.open(date); f.controller.change('calories','250');
    (f.api.read as jest.Mock<MealApi['read']>).mockResolvedValueOnce(failure); await f.controller.save();
    expect(f.controller.getSnapshot().phase).toBe('confirmed'); expect((await f.repository.read())?.receipt).toEqual(receipt);
    const restored=new MealController(f.api,f.repository,f.invalidate); await restored.initialize(); await restored.recover();
    expect(f.api.mutate).toHaveBeenCalledTimes(1); expect(await f.repository.read()).toBeNull();
  });
  it('duplicate confirmation is explicit and creates a new key bound to forceDuplicate',async()=>{
    const f=fixture(); await f.controller.initialize(); f.controller.open(date); f.controller.change('calories','250');
    (f.api.mutate as jest.Mock<MealApi['mutate']>).mockResolvedValueOnce({status:'conflict',code:'POSSIBLE_DUPLICATE',message:'duplicate',meta:{...meta,httpStatus:409,outcome:'conflict'}});
    await f.controller.save(); expect(f.controller.getSnapshot().phase).toBe('duplicate'); expect(await f.repository.read()).toBeNull();
    await f.controller.save(true); const calls=(f.api.mutate as jest.Mock<MealApi['mutate']>).mock.calls;
    expect(calls[1][0].forceDuplicate).toBe(true); expect(calls[0][0].idempotencyKey).not.toBe(calls[1][0].idempotencyKey);
  });
  it('conflict preserves draft, reads moved server truth and requires deliberate review plus save',async()=>{
    const f=fixture(); await f.controller.initialize(); f.controller.open(date,f.meal); f.controller.change('calories','800');
    const truthDate='2026-10-01', currentVersion='2026-10-02T13:00:00Z';
    (f.api.mutate as jest.Mock<MealApi['mutate']>).mockResolvedValueOnce({status:'conflict',code:'MEAL_CHANGED',message:'changed',data:{error:'MEAL_CHANGED',message:'changed',currentDate:truthDate},meta:{...meta,httpStatus:409,outcome:'conflict'}});
    const data=nutritionFixture(truthDate); if(data.nutrition.status==='ok'&&data.nutrition.data.dayState==='recorded') data.nutrition.data.meals=[{...f.meal,calories:500,updatedAt:currentVersion}];
    (f.api.read as jest.Mock<MealApi['read']>).mockResolvedValueOnce({status:'ok',data,meta});
    await f.controller.save(); expect(f.controller.getSnapshot().phase).toBe('conflict'); expect(f.controller.getSnapshot().editor?.draft.calories).toBe('800');
    await f.controller.save(); expect(f.api.mutate).toHaveBeenCalledTimes(1);
    f.controller.reviewWithServerVersion(); expect(f.api.mutate).toHaveBeenCalledTimes(1);
    await f.controller.save(); expect(f.api.mutate).toHaveBeenLastCalledWith(expect.objectContaining({sourceDate:truthDate,expectedUpdatedAt:currentVersion,fields:expect.objectContaining({calories:800})}));
  });
  it('storage errors fence writes and separate users retain isolated intents',async()=>{
    const f=fixture(); await f.controller.initialize(); f.controller.open(date); f.controller.change('calories','250');
    f.storage.setItem=async()=>{throw new Error('full');}; await f.controller.save(); expect(f.api.mutate).not.toHaveBeenCalled(); expect(f.controller.getSnapshot().phase).toBe('blocked');
    f.map.set(f.repository.key,'invalid-json'); await f.controller.recover(); expect(f.controller.getSnapshot().phase).toBe('blocked');
    expect(await new MealIntentRepository(f.storage,'second-user').read()).toBeNull();
  });
  it('historical summaries and nonmanual meals are never opened as editable',async()=>{
    const f=fixture(); await f.controller.initialize(); f.controller.open(date,{...f.meal,entryKind:'legacy_daily_summary'});
    expect(f.controller.getSnapshot().editor).toBeNull(); f.controller.open(date,{...f.meal,sourceType:'sheet_import'}); expect(f.controller.getSnapshot().editor).toBeNull();
  });
  it('a late cleanup cannot delete or overwrite a newer intent',async()=>{
    const f=fixture(); await f.controller.initialize(); f.controller.open(date); f.controller.change('calories','250');
    (f.api.mutate as jest.Mock<MealApi['mutate']>).mockResolvedValueOnce(failure); await f.controller.save();
    const first=(await f.repository.read())!;
    await f.repository.clear(first.intent.idempotencyKey);
    const second={...first,intent:{...first.intent,idempotencyKey:'second'}};
    await f.repository.write(second); await f.repository.clear(first.intent.idempotencyKey);
    expect((await f.repository.read())?.intent.idempotencyKey).toBe('second');
    await expect(f.repository.write(first)).rejects.toThrow('Another pending nutrition intent');
  });
  it('does not send a delayed intent after the user scope is disposed',async()=>{
    const f=fixture(); await f.controller.initialize(); f.controller.open(date); f.controller.change('calories','250');
    let release!:()=>void;
    f.storage.setItem=async(k,v)=>{f.map.set(k,v); await new Promise<void>(r=>{release=r;});};
    const saving=f.controller.save(); while(!release) await Promise.resolve();
    f.controller.dispose(); release(); await saving;
    expect(f.api.mutate).not.toHaveBeenCalled(); expect(await f.repository.read()).not.toBeNull();
  });
});

describe('M9 manual entry and Undo', () => {
  it('persists atomic library/timing fields before sending and replays unchanged after restart', async () => {
    const f = fixture(); await f.controller.initialize(); f.controller.open(date); f.controller.change('title', 'QA'); f.controller.change('calories', '123');
    f.controller.timing('lunch', `${date}T13:40:00-03:00`); f.controller.saveToLibrary(true);
    (f.api.mutate as jest.Mock<MealApi['mutate']>).mockResolvedValueOnce(failure);
    await f.controller.save(); const stored = (await f.repository.read())!;
    expect(stored.intent.fields).toMatchObject({ mealLabel: 'lunch', consumedAt: `${date}T16:40:00.000Z`, saveToLibrary: true, proteinG: null });
    const next = new MealController(f.api, f.repository, f.invalidate); await next.initialize();
    expect(f.api.mutate).toHaveBeenCalledTimes(1); await next.recover(); expect(f.api.mutate).toHaveBeenLastCalledWith(stored.intent);
  });
  it('Undo uses the created receipt version; conflict does not adopt a newer version or retry', async () => {
    const f = fixture(); await f.controller.initialize();
    (f.api.mutate as jest.Mock<MealApi['mutate']>).mockResolvedValueOnce({ status: 'conflict', code: 'MEAL_CHANGED', message: 'changed', data: { error: 'MEAL_CHANGED', message: 'changed', currentDate: date }, meta: { ...meta, outcome: 'conflict' } });
    await f.controller.undo(f.meal, date);
    expect(f.api.mutate).toHaveBeenCalledWith(expect.objectContaining({ operation: 'delete', mealId: id, expectedUpdatedAt: version }));
    expect(f.controller.getSnapshot().phase).toBe('conflict'); expect(f.api.mutate).toHaveBeenCalledTimes(1);
  });
});
