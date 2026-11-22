import type { PersonalFood } from '@/api/nutrition-food';
import { describe,expect,it,jest } from '@jest/globals';
import { FoodController,type FoodApi } from './food-controller';
import { FoodIntentRepository } from './food-storage';
import { foodDraft,foodUnitOptions,scaleFoodDraftTo,tooPrecise,validateFoodDraft } from './food-model';
import { personalFood,foodId,foodReceipt } from './food-fixture.test-helper';
const meta={durationMs:1,httpStatus:200,outcome:'ok' as const};
const failure={status:'unavailable' as const,reason:'network' as const,meta:{...meta,httpStatus:null,outcome:'unavailable' as const}};
const settle=async()=>{for(let n=0;n<20;n++)await Promise.resolve();};
function fixture(){
 const map=new Map<string,string>(),storage={getItem:async(k:string)=>map.get(k)??null,setItem:async(k:string,v:string)=>{map.set(k,v);},removeItem:async(k:string)=>{map.delete(k);}};
 const repository=new FoodIntentRepository(storage,'owner');
 const api:FoodApi={list:jest.fn<FoodApi['list']>().mockResolvedValue({status:'ok',data:{status:'ok',foods:[personalFood]},meta}),
  detail:jest.fn<FoodApi['detail']>().mockResolvedValue({status:'ok',data:{status:'ok',food:personalFood},meta}),
  write:jest.fn<FoodApi['write']>().mockImplementation(async i=>({status:'ok',data:{...foodReceipt,operation:i.operation,...(i.operation==='delete'?{version:null,updatedAt:null}:{})},meta}))};
 let key=0;const controller=new FoodController(api,repository,()=>`food:${++key}`);
 const open=async()=>{await controller.initialize();controller.open(null);await settle();};
 return {controller,repository,api,map,storage,open};
}
describe('Personal Food controller and durable catalog intents',()=>{
 it('form preserves decimal base/calories, comma, zero versus empty and limits',()=>{
  const draft=foodDraft(personalFood);expect(validateFoodDraft(draft).fields).toMatchObject({servingQuantity:0.125,calories:22.5,proteinG:null,fatG:0});
  expect(validateFoodDraft({...draft,proteinG:'0'}).fields?.proteinG).toBe(0);
  for(const patch of [{servingQuantity:'1,2345'},{calories:'1,234'},{fatG:'-1'},{name:''},{servingUnit:''},{calories:'',proteinG:'',carbsG:'',fatG:''}])expect(validateFoodDraft({...draft,...patch}).fields).toBeUndefined();
 });
 it('reads the catalog once and searches it locally (no request per letter); a stale answer never replaces a newer one; unavailable is never empty',async()=>{
  const tea:PersonalFood={...personalFood,id:'42200000-0000-4000-8000-000000000009',name:'TÉ VERDE',isActive:false,version:'b'.repeat(64)};
  const f=fixture();(f.api.list as jest.Mock<FoodApi['list']>).mockResolvedValue({status:'ok',data:{status:'ok',foods:[personalFood,tea]},meta});await f.open();
  expect(f.api.list).toHaveBeenCalledTimes(1);expect(f.api.list).toHaveBeenCalledWith('all','');expect(f.controller.getSnapshot().foods).toEqual([personalFood]);
  f.controller.query('te','archived');expect(f.controller.getSnapshot().foods).toEqual([tea]);
  f.controller.query('cafe','all');expect(f.controller.getSnapshot().foods).toEqual([personalFood]);
  f.controller.query('','all');expect(f.controller.getSnapshot().foods).toEqual([personalFood,tea]);
  expect(f.api.list).toHaveBeenCalledTimes(1);
  let resolve!:(v:Awaited<ReturnType<FoodApi['list']>>)=>void;
  (f.api.list as jest.Mock<FoodApi['list']>).mockImplementationOnce(()=>new Promise(r=>{resolve=r;}));
  const stale=f.controller.load();await f.controller.load();resolve({status:'ok',data:{status:'ok',foods:[]},meta});await stale;await settle();
  expect(f.controller.getSnapshot().foods).toEqual([personalFood,tea]);
  (f.api.list as jest.Mock<FoodApi['list']>).mockResolvedValueOnce(failure);await f.controller.load();expect(f.controller.getSnapshot().listError).toBe(true);expect(f.controller.getSnapshot().foods).toEqual([personalFood,tea]);
 });
 it('create persists before send, gates double taps, and rereads detail/catalog before clearing',async()=>{
  const f=fixture();await f.open();f.controller.begin();for(const [k,v] of Object.entries(foodDraft(personalFood)))f.controller.change(k as keyof ReturnType<typeof foodDraft>,v);
  (f.api.write as jest.Mock<FoodApi['write']>).mockImplementation(async i=>{expect((await f.repository.read())?.intent).toEqual(i);return {status:'ok',data:foodReceipt,meta};});
  await Promise.all([f.controller.save(),f.controller.save()]);expect(f.api.write).toHaveBeenCalledTimes(1);expect(f.api.detail).toHaveBeenCalledWith(foodId);expect(await f.repository.read()).toBeNull();expect(f.controller.getSnapshot().mode).toBe('browse');
 });
 it.each(['update','archive','reactivate','delete'] as const)('%s sends captured source version; no client user or precision overwrite',async operation=>{
  const f=fixture();await f.open();f.controller.begin(personalFood);if(operation==='update')f.controller.change('calories','25,75');
  await f.controller.save(operation);expect(f.api.write).toHaveBeenCalledWith(expect.objectContaining({operation,id:foodId,expectedVersion:personalFood.version,fields:operation==='update'?expect.objectContaining({calories:25.75}):null}));
  expect(await f.repository.read()).toBeNull();
 });
 it.each(['update','archive','reactivate'] as const)('a confirmed %s reloads the visible catalog by itself, with no manual refresh (#359)',async operation=>{
  const f=fixture();await f.open();const before=jest.mocked(f.api.list).mock.calls.length;f.controller.begin(personalFood);if(operation==='update')f.controller.change('calories','25,75');
  await f.controller.save(operation);await settle();expect(jest.mocked(f.api.list).mock.calls.length).toBe(before+1);expect(f.controller.getSnapshot().listError).toBe(false);
 });
 it('foreground list refresh cannot replace an open draft; conflict requires explicit source review',async()=>{
  const f=fixture();await f.open();f.controller.begin(personalFood);f.controller.change('calories','75');await f.controller.load();expect(f.controller.getSnapshot().draft?.calories).toBe('75');
  const truth={...personalFood,calories:30,version:'b'.repeat(64)};
  (f.api.detail as jest.Mock<FoodApi['detail']>).mockResolvedValue({status:'ok',data:{status:'ok',food:truth},meta});
  (f.api.write as jest.Mock<FoodApi['write']>).mockResolvedValueOnce({status:'conflict',code:'FOOD_CHANGED',message:'changed',meta:{...meta,outcome:'conflict'}});
  await f.controller.save();expect(f.controller.getSnapshot().phase).toBe('conflict');expect(f.controller.getSnapshot().draft?.calories).toBe('75');await f.controller.save();expect(f.api.write).toHaveBeenCalledTimes(1);
  f.controller.reviewTruth();expect(f.controller.getSnapshot().editing?.version).toBe(truth.version);expect(f.controller.getSnapshot().draft?.calories).toBe('75');await f.controller.save();expect(f.api.write).toHaveBeenLastCalledWith(expect.objectContaining({expectedVersion:truth.version}));
 });
 it('ambiguous catalog edit survives remount with captured version; recovery never sends automatically',async()=>{
  const f=fixture();await f.open();f.controller.begin(personalFood);f.controller.change('calories','75');(f.api.write as jest.Mock<FoodApi['write']>).mockResolvedValueOnce(failure);
  await f.controller.save();const stored=(await f.repository.read())!;
  const restored=new FoodController(f.api,f.repository);await restored.initialize();expect(f.api.write).toHaveBeenCalledTimes(1);expect(restored.getSnapshot().editing?.version).toBe(personalFood.version);
  restored.showRecovery();await restored.recover();expect(f.api.write).toHaveBeenLastCalledWith(stored.intent);expect(await f.repository.read()).toBeNull();
 });
 it('active-name conflict retains an editable draft and lets the user deliberately rename',async()=>{
  const f=fixture();await f.open();f.controller.begin();for(const [k,v] of Object.entries(foodDraft(personalFood)))f.controller.change(k as keyof ReturnType<typeof foodDraft>,v);
  (f.api.write as jest.Mock<FoodApi['write']>).mockResolvedValueOnce({status:'conflict',code:'FOOD_NAME_EXISTS',message:'name exists',meta:{...meta,outcome:'conflict'}});
  await f.controller.save();expect(f.controller.getSnapshot().phase).toBe('idle');expect(f.controller.getSnapshot().draft?.name).toBe(personalFood.name);expect(await f.repository.read()).toBeNull();
  f.controller.change('name','Otra referencia');await f.controller.save();expect(f.api.write).toHaveBeenLastCalledWith(expect.objectContaining({fields:expect.objectContaining({name:'OTRA REFERENCIA'})}));
 });
 it('corrupt or foreign receipt/source cannot authorize recovery',async()=>{
  const f=fixture();await f.open();f.controller.begin(personalFood);(f.api.write as jest.Mock<FoodApi['write']>).mockResolvedValueOnce(failure);await f.controller.save();const stored=(await f.repository.read())!;
  f.map.set(f.repository.key,JSON.stringify({...stored,receipt:{...foodReceipt,operation:'update',id:'42200000-0000-4000-8000-000000000002'}}));await expect(f.repository.read()).rejects.toThrow('Invalid food intent');
  f.map.set(f.repository.key,JSON.stringify({...stored,editing:{...personalFood,version:'b'.repeat(64)}}));await expect(f.repository.read()).rejects.toThrow('Invalid food intent');
 });
 it('receipt recovery only reads and completes even if a later operation removed the definition',async()=>{
  const f=fixture();await f.open();f.controller.begin(personalFood);(f.api.detail as jest.Mock<FoodApi['detail']>).mockResolvedValueOnce(failure);
  await f.controller.save();expect(f.controller.getSnapshot().phase).toBe('confirmed');
  (f.api.detail as jest.Mock<FoodApi['detail']>).mockResolvedValue({status:'ok',data:{status:'ok',food:null},meta});await f.controller.recover();expect(f.api.write).toHaveBeenCalledTimes(1);expect(await f.repository.read()).toBeNull();expect(f.controller.getSnapshot().message).toContain('ya no está');
 });
 it('storage failure/disposal before send fences mutation; accounts and damaged receipts stay isolated',async()=>{
  const f=fixture();await f.open();f.controller.begin(personalFood);f.storage.setItem=async()=>{throw new Error('disk');};await f.controller.save();expect(f.api.write).not.toHaveBeenCalled();
  const g=fixture();await g.open();g.controller.begin(personalFood);let finish!:()=>void;g.storage.setItem=async()=>{await new Promise<void>(r=>{finish=r;});};const pending=g.controller.save();await settle();g.controller.dispose();finish();await pending;expect(g.api.write).not.toHaveBeenCalled();
  expect(await new FoodIntentRepository(f.storage,'other').read()).toBeNull();
 });
 it('cancel conflict returns to safe idle; unknown result stays fenced when closed',async()=>{
  const f=fixture();await f.open();f.controller.begin(personalFood);(f.api.write as jest.Mock<FoodApi['write']>).mockResolvedValueOnce({status:'conflict',code:'FOOD_UNAVAILABLE',message:'gone',meta:{...meta,outcome:'conflict'}});
  await f.controller.save();f.controller.close();expect(f.controller.getSnapshot().phase).toBe('idle');
  f.controller.open(null);f.controller.begin(personalFood);(f.api.write as jest.Mock<FoodApi['write']>).mockResolvedValueOnce(failure);await f.controller.save();f.controller.close();f.controller.open(null);expect(f.controller.getSnapshot().phase).toBe('uncertain');expect(f.controller.getSnapshot().open).toBe(false);
 });

 it('per-gram values below two decimals move exactly to 100 g, and only when that helps',()=>{
  const draft={...foodDraft(),name:'Frutillas',servingQuantity:'1',servingUnit:'g',calories:'0,32',proteinG:'0,007',carbsG:'0,77',fatG:'0,003'};
  expect(tooPrecise(draft)).toBe(true);expect(validateFoodDraft(draft).fields).toBeUndefined();
  const scaled=scaleFoodDraftTo(draft)!;
  expect(scaled).toMatchObject({servingQuantity:'100',calories:'32',proteinG:'0,7',carbsG:'77',fatG:'0,3'});
  expect(validateFoodDraft(scaled).fields).toMatchObject({servingQuantity:100,calories:32,proteinG:0.7,carbsG:77,fatG:0.3});
  // Empty stays empty (no data), never 0; a portion of 100 or more is left alone.
  expect(scaleFoodDraftTo({...draft,fatG:''})!.fatG).toBe('');
  expect(scaleFoodDraftTo({...draft,servingQuantity:'100'})).toBeNull();
  expect(tooPrecise({...draft,proteinG:'0,7',fatG:'0,3'})).toBe(false);
 });
 it('offers the common units and keeps a saved custom one',()=>{
  expect(foodUnitOptions('g').slice(0,4)).toEqual(['g','kg','ml','l']);
  expect(foodUnitOptions('sobre')).toContain('sobre');expect(foodUnitOptions('g')).not.toContain('sobre');
 });
 it('a draft swiped away comes back for the same food, and a deliberate discard drops it',async()=>{
  const f=fixture();await f.open();
  f.controller.begin();f.controller.change('name','Frutillas');f.controller.shelve();
  expect(f.controller.getSnapshot().open).toBe(false);
  f.controller.open(null);await settle();f.controller.begin();
  expect(f.controller.getSnapshot().draft?.name).toBe('Frutillas');
  // Another food never receives it.
  f.controller.back();f.controller.begin(personalFood);expect(f.controller.getSnapshot().draft?.name).toBe(personalFood.name);
  f.controller.back();f.controller.begin();f.controller.change('name','Otra');f.controller.shelve();
  f.controller.open(null);await settle();f.controller.discard();f.controller.begin();
  expect(f.controller.getSnapshot().draft?.name).toBe('');
 });
});
