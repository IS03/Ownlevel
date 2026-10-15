import type { FoodOperation, PersonalFood, FoodsResponse } from '@/api/nutrition-food';
import {draftFoodId,savedDraft,validateSavedDraft,type SavedDraft} from './saved-model';
import type {MobileApiReadResult,MobileApiRequestResult} from '@/api/results';
import type {SavedDetail,SavedList,PersonalSavedMeal,SavedIntent,SavedReceipt} from '@/api/nutrition-saved';
import {SavedIntentRepository,type StoredSavedIntent} from './saved-storage';
type Filter='active'|'archived'|'all';
export type SavedApi={foods:()=>Promise<MobileApiReadResult<FoodsResponse>>;list:(filter:Filter,q:string)=>Promise<MobileApiReadResult<SavedList>>;detail:(id:string)=>Promise<MobileApiReadResult<SavedDetail>>;write:(intent:SavedIntent)=>Promise<MobileApiRequestResult<SavedReceipt>>};
export type SavedState={phase:'loading'|'idle'|'pending'|'uncertain'|'confirmed'|'conflict'|'blocked';open:boolean;mode:'browse'|'create'|'edit';
 search:string;filter:Filter;meals:PersonalSavedMeal[]|null;listLoading:boolean;listError:boolean;draft:SavedDraft|null;editing:PersonalSavedMeal|null;truth:PersonalSavedMeal|null;
 pickerFoods:PersonalFood[]|null;pickerLoading:boolean;pickerError:boolean;intent:StoredSavedIntent|null;message:string|null;errors:Record<string,string>};
export class SavedController {
 private state:SavedState={phase:'loading',open:false,mode:'browse',search:'',filter:'active',meals:null,listLoading:false,listError:false,
 draft:null,editing:null,truth:null,pickerFoods:null,pickerLoading:false,pickerError:false,intent:null,message:null,errors:{}};
 private disposed=false;private busy=false;private generation=0;private truthGeneration=0;private pickerGeneration=0;private listeners=new Set<()=>void>();
 constructor(private api:SavedApi,private repository:SavedIntentRepository,private onConfirmed:()=>void=()=>{},private key:()=>string=()=>`saved:${Date.now()}:${Math.random().toString(36).slice(2)}`){}
 getSnapshot=()=>this.state;
 subscribe=(f:()=>void)=>{this.listeners.add(f);return()=>{this.listeners.delete(f);};};
 private update(p:Partial<SavedState>){if(!this.disposed){this.state={...this.state,...p};this.listeners.forEach(f=>f());}}
 dispose(){this.disposed=true;this.generation++;this.truthGeneration++;this.pickerGeneration++;this.listeners.clear();}
 async initialize(){try{const intent=await this.repository.read();this.update(intent?{phase:intent.receipt?'confirmed':'uncertain',intent,draft:intent.draft,editing:intent.editing,
 mode:intent.intent.operation==='create'?'create':'edit',message:'Hay un intento de guardadas pendiente. Comprobalo antes de otra operación.'}:{phase:'idle'});}
 catch{this.update({phase:'blocked',message:'No pudimos leer el intento de guardadas. Comprobá el almacenamiento.'});}}
 open(){if(this.state.phase!=='idle'||this.busy||this.state.intent)return;this.truthGeneration++;this.update({open:true,mode:'browse',search:'',filter:'active',draft:null,editing:null,truth:null,message:null,meals:null});void this.load();}
 close(){if(this.busy)return;this.truthGeneration++;this.update({open:false,...(this.state.phase==='conflict'&&!this.state.intent?{phase:'idle',draft:null,editing:null,truth:null,message:null}:{})});}
 showRecovery(){if(this.state.intent&&!this.busy)this.update({open:true,mode:this.state.intent.intent.operation==='create'?'create':'edit'});}
 query(search:string,filter=this.state.filter){if(this.busy||this.state.intent)return;this.update({search:search.slice(0,200),filter,meals:null});void this.load();}
 setFilter(filter:Filter){this.query(this.state.search,filter);}
 async load(){const generation=++this.generation,{search,filter}=this.state;this.update({listLoading:true,listError:false});try{const result=await this.api.list(filter,search);if(this.disposed||generation!==this.generation)return;
 this.update(result.status==='ok'?{meals:result.data.meals,listLoading:false,listError:false}:{listLoading:false,listError:true});}catch{if(generation===this.generation)this.update({listLoading:false,listError:true});}}
 begin(saved?:PersonalSavedMeal,type:SavedDraft['templateType']='manual'){if(this.state.phase!=='idle'||this.busy||this.state.intent)return;this.truthGeneration++;this.update({mode:saved?'edit':'create',editing:saved??null,draft:savedDraft(saved,type),errors:{},truth:null,message:null});}
 /** "Guardar como comida" from a day meal: the normal create form, prefilled; the user confirms the name. */
 prefill(values:Pick<SavedDraft,'name'|'description'|'calories'|'proteinG'|'carbsG'|'fatG'>){if(this.state.phase!=='idle'||this.busy||this.state.intent)return;this.truthGeneration++;this.update({open:true,mode:'create',editing:null,draft:{...savedDraft(null,'manual'),...values},errors:{},truth:null,message:null});}
 back(){if(this.busy||this.state.intent||this.state.phase==='blocked')return;this.truthGeneration++;this.update({phase:'idle',mode:'browse',draft:null,editing:null,truth:null,message:null,errors:{}});}
 dirty(){return !!this.state.draft&&JSON.stringify(this.state.draft)!==JSON.stringify(savedDraft(this.state.editing,this.state.draft.templateType));}
 change(key:keyof SavedDraft,value:string){if(key==='items'||key==='templateType')return;if(this.state.phase==='idle'&&!this.busy&&!this.state.intent&&this.state.draft)this.update({draft:{...this.state.draft,[key]:value},errors:{},message:null});}
  async loadFoods(){const generation=++this.pickerGeneration;this.update({pickerLoading:true,pickerError:false});try{const result=await this.api.foods();if(this.disposed||generation!==this.pickerGeneration)return;this.update(result.status==='ok'?{pickerFoods:result.data.foods,pickerLoading:false,pickerError:false}:{pickerLoading:false,pickerError:true});}catch{if(generation===this.pickerGeneration)this.update({pickerLoading:false,pickerError:true});}}
  addIngredient(food:PersonalFood){if(this.state.phase!=='idle'||this.busy||!this.state.draft||!food.isActive)return;
    const d=this.state.draft;if(d.items.length>=50||d.items.some(i=>draftFoodId(i)===food.id)){this.update({message:'No repitas alimentos. Máximo 50 ingredientes.'});return;}
    const quantity=food.servingQuantity===Number(food.servingQuantity.toFixed(2))?String(food.servingQuantity).replace('.',','):'';
    this.update({draft:{...d,items:[...d.items,{food,snapshot:null,quantity}]},message:quantity?null:'Este Food tiene base de 3 decimales. Indicá una cantidad de hasta 2 decimales para esta plantilla.',errors:{}});}
  quantity(index:number,value:string){if(this.state.phase!=='idle'||this.busy||!this.state.draft)return;this.update({draft:{...this.state.draft,items:this.state.draft.items.map((i,n)=>n===index?{...i,quantity:value}:i)},errors:{}});}
  removeIngredient(index:number){if(this.state.phase!=='idle'||this.busy||!this.state.draft)return;this.update({draft:{...this.state.draft,items:this.state.draft.items.filter((_,n)=>n!==index)},errors:{}});}
  moveIngredient(index:number,direction:-1|1){if(this.state.phase!=='idle'||this.busy||!this.state.draft)return;const items=[...this.state.draft.items],next=index+direction;if(index<0||index>=items.length||next<0||next>=items.length)return;[items[index],items[next]]=[items[next],items[index]];this.update({draft:{...this.state.draft,items},errors:{}});}
  reviewFoods(){if(this.state.phase==='conflict'&&!this.busy)this.update({phase:'idle',message:'Quitá y agregá nuevamente el alimento que cambió para revisar su snapshot actual.'});}
  adoptServerIngredients(){if(this.state.phase==='conflict'&&this.state.truth&&this.state.draft&&!this.busy)this.update({phase:'idle',editing:this.state.truth,draft:{...this.state.draft,items:savedDraft(this.state.truth).items},truth:null,message:'Ingredientes actuales cargados. Revisá cantidades antes de guardar.'});}
  async save(operation?:FoodOperation){if(this.disposed||this.busy||this.state.phase!=='idle'||this.state.intent)return;
    const op=operation??(this.state.editing?'update':'create'), editing=this.state.editing;
    if(op!=='create'&&!editing)return;
    const parsed=op==='create'||op==='update'?this.state.draft?validateSavedDraft(this.state.draft):null:null;
    if((op==='create'||op==='update')&&!parsed?.fields){this.update({errors:parsed?.errors??{}});return;}
    const intent:SavedIntent={operation:op,id:op==='create'?null:editing!.id,expectedVersion:op==='create'?null:editing!.version,fields:parsed?.fields??null,idempotencyKey:this.key()};
    const stored:StoredSavedIntent={version:1,intent,draft:parsed?.fields?this.state.draft:null,editing};
    this.busy=true;this.update({phase:'pending',message:null});
    try{await this.repository.write(stored);this.update({intent:stored});await this.send(stored);}
    catch{this.update({phase:'blocked',message:'No pudimos conservar el intento local. Comprobá el almacenamiento.'});}finally{this.busy=false;}}
  async recover(){if(this.disposed||this.busy)return;if(!this.state.intent){await this.initialize();return;}this.busy=true;this.update({phase:'pending',message:null});
    try{const intent=this.state.intent;if(intent.receipt)await this.confirmed(intent);else await this.send(intent);}
    catch{this.update({phase:'uncertain',message:'El intento sigue guardado. No pudimos comprobar el resultado.'});}finally{this.busy=false;}}
  private async send(stored:StoredSavedIntent){if(this.disposed)return;let result:MobileApiRequestResult<SavedReceipt>;
    try{result=await this.api.write(stored.intent);}catch{this.update({phase:'uncertain',message:'No sabemos si se guardó. Comprobar usa el mismo intento.'});return;}
    if(result.status==='ok'){const confirmed={...stored,receipt:result.data};this.update({phase:'confirmed',intent:confirmed});await this.repository.write(confirmed);await this.confirmed(confirmed);return;}
    if(['conflict','validation','not_found'].includes(result.status)){await this.repository.clear(stored.intent.idempotencyKey);
      this.update({intent:null,phase:result.status==='validation'||result.status==='conflict'&&result.code==='SAVED_NAME_EXISTS'?'idle':'conflict',message:'message' in result?result.message:'La comida guardada ya no está disponible.',truth:null});
      if(stored.intent.id)await this.loadTruth(stored.intent.id);await this.load();return;}
    this.update({phase:'uncertain',message:'El resultado es incierto. Conservamos el intento; comprobalo explícitamente.'});}
  async loadTruth(id=this.state.editing?.id){if(!id)return;const generation=++this.truthGeneration;
    try{const result=await this.api.detail(id);if(!this.disposed&&generation===this.truthGeneration)this.update({truth:result.status==='ok'?result.data.meal:null});}
    catch{if(generation===this.truthGeneration)this.update({truth:null});}}
  reviewTruth(){if(this.state.phase!=='conflict'||!this.state.truth||this.busy)return;
    const truth=this.state.truth,draft=this.state.draft??savedDraft(truth);
    const items=draft.items.map(i=>{if(!i.snapshot)return i;const old=i.snapshot;
      const match=truth.items.find(t=>t.id===old.id||(t.sourceFoodId===old.sourceFoodId&&t.label===old.label&&JSON.stringify([t.unit,t.baseQuantity,t.baseCalories,t.baseProteinG,t.baseCarbsG,t.baseFatG])===JSON.stringify([old.unit,old.baseQuantity,old.baseCalories,old.baseProteinG,old.baseCarbsG,old.baseFatG])));
      return match?{...i,snapshot:match}:i;});
    if(items.some(i=>i.snapshot&&!truth.items.some(t=>t.id===i.snapshot!.id))){this.update({message:'Los componentes cambiaron. Podés adoptar los ingredientes actuales conservando nombre y descripción.'});return;}
    this.update({phase:'idle',editing:truth,draft:{...draft,items},truth:null,message:'Revisá tu borrador frente a los datos actuales antes de guardar otra vez.'});}
  private async confirmed(stored:StoredSavedIntent){const receipt=stored.receipt!;const detail=await this.api.detail(receipt.id);if(this.disposed)return;
    if(detail.status!=='ok'){this.update({phase:'confirmed',message:'Operación confirmada. Falta actualizar el catálogo de guardadas; no vuelvas a enviarla.'});return;}
    await this.load();if(this.disposed)return;if(this.state.listError){this.update({phase:'confirmed',message:'Operación confirmada. Falta actualizar la lista.'});return;}
    await this.repository.clear(stored.intent.idempotencyKey);this.onConfirmed();this.update({phase:'idle',intent:null,mode:'browse',draft:null,editing:null,truth:null,errors:{},message:receipt.operation==='delete'?'Comida guardada eliminada. El histórico no cambia.':detail.data.meal?'Catálogo actualizado.':'Operación confirmada. La comida guardada ya no está en el catálogo de guardadas.'});}
}
