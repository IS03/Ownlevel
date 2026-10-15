import type { MobileApiReadResult,MobileApiRequestResult } from '@/api/results';
import type { FoodDetail,FoodsResponse,FoodFilter,PersonalFood,FoodIntent,FoodReceipt,FoodOperation } from '@/api/nutrition-food';
import { foodDraft,validateFoodDraft,type FoodDraft } from './food-model';
import { FoodIntentRepository,type StoredFoodIntent } from './food-storage';
export type FoodApi={list:(filter:FoodFilter,q:string)=>Promise<MobileApiReadResult<FoodsResponse>>;detail:(id:string)=>Promise<MobileApiReadResult<FoodDetail>>;write:(intent:FoodIntent)=>Promise<MobileApiRequestResult<FoodReceipt>>};
export type FoodState={phase:'loading'|'idle'|'pending'|'uncertain'|'confirmed'|'conflict'|'blocked';open:boolean;mode:'browse'|'create'|'edit'|'register';date:string|null;
  search:string;filter:FoodFilter;foods:PersonalFood[]|null;listLoading:boolean;listError:boolean;draft:FoodDraft|null;editing:PersonalFood|null;truth:PersonalFood|null;
  intent:StoredFoodIntent|null;message:string|null;errors:Partial<Record<keyof FoodDraft,string>>};
export class FoodController {
  private state:FoodState={phase:'loading',open:false,mode:'browse',date:null,search:'',filter:'active',foods:null,listLoading:false,listError:false,
    draft:null,editing:null,truth:null,intent:null,message:null,errors:{}};
  private disposed=false;private busy=false;private generation=0;private truthGeneration=0;private listeners=new Set<()=>void>();
  constructor(private api:FoodApi,private repository:FoodIntentRepository,private key:()=>string=()=>`food:${Date.now()}:${Math.random().toString(36).slice(2)}`){}
  getSnapshot=()=>this.state;
  subscribe=(f:()=>void)=>{this.listeners.add(f);return()=>{this.listeners.delete(f);};};
  private update(p:Partial<FoodState>){if(!this.disposed){this.state={...this.state,...p};this.listeners.forEach(f=>f());}}
  dispose(){this.disposed=true;this.generation++;this.truthGeneration++;this.listeners.clear();}
  async initialize(){try{const intent=await this.repository.read();this.update(intent?{phase:intent.receipt?'confirmed':'uncertain',intent,draft:intent.draft,editing:intent.editing,
    mode:intent.intent.operation==='create'?'create':'edit',message:'Hay un intento de catálogo guardado. Comprobalo antes de otra operación.'}:{phase:'idle'});}
    catch{this.update({phase:'blocked',message:'No pudimos leer el intento del catálogo. Comprobá el almacenamiento.'});}}
  open(date:string|null){if(this.state.phase!=='idle'||this.busy||this.state.intent)return;this.truthGeneration++;this.update({open:true,mode:'browse',date,search:'',filter:'active',draft:null,editing:null,truth:null,message:null,foods:null});void this.load();}
  close(){if(this.busy)return;this.truthGeneration++;this.update({open:false,...(this.state.phase==='conflict'&&!this.state.intent?{phase:'idle',draft:null,editing:null,truth:null,message:null}: {})});}
  showRecovery(){if(this.state.intent&&!this.busy)this.update({open:true,mode:this.state.intent.intent.operation==='create'?'create':'edit'});}
  query(search:string,filter=this.state.filter){if(this.busy||this.state.intent)return;this.update({search:search.slice(0,200),filter,foods:null});void this.load();}
  setFilter(filter:FoodFilter){this.query(this.state.search,filter);}
  async load(){const generation=++this.generation,{search,filter}=this.state;this.update({listLoading:true,listError:false});
    try{const result=await this.api.list(filter,search);if(this.disposed||generation!==this.generation)return;
      this.update(result.status==='ok'?{foods:result.data.foods,listLoading:false,listError:false}:{listLoading:false,listError:true});}
    catch{if(generation===this.generation)this.update({listLoading:false,listError:true});}}
  begin(food?:PersonalFood){if(this.state.phase!=='idle'||this.busy||this.state.intent)return;this.truthGeneration++;this.update({mode:food?'edit':'create',editing:food??null,draft:foodDraft(food),errors:{},truth:null,message:null});}
  registration(){if(this.state.phase==='idle'&&!this.state.intent)this.update({mode:'register'});}
  back(){if(this.busy||this.state.intent||this.state.phase==='blocked')return;this.truthGeneration++;this.update({phase:'idle',mode:'browse',draft:null,editing:null,truth:null,message:null,errors:{}});}
  dirty(){return !!this.state.draft&&JSON.stringify(this.state.draft)!==JSON.stringify(foodDraft(this.state.editing));}
  changeDate(date:string){if(this.state.phase==='idle'&&!this.busy&&!this.state.intent)this.update({date});}
  change(key:keyof FoodDraft,value:string){if(this.state.phase==='idle'&&!this.busy&&!this.state.intent&&this.state.draft)this.update({draft:{...this.state.draft,[key]:value},errors:{},message:null});}
  async save(operation?:FoodOperation){if(this.disposed||this.busy||this.state.phase!=='idle'||this.state.intent)return;
    const op=operation??(this.state.editing?'update':'create'), editing=this.state.editing;
    if(op!=='create'&&!editing)return;
    const parsed=op==='create'||op==='update'?this.state.draft?validateFoodDraft(this.state.draft):null:null;
    if((op==='create'||op==='update')&&!parsed?.fields){this.update({errors:parsed?.errors??{}});return;}
    const intent:FoodIntent={operation:op,id:op==='create'?null:editing!.id,expectedVersion:op==='create'?null:editing!.version,fields:parsed?.fields??null,idempotencyKey:this.key()};
    const stored:StoredFoodIntent={version:1,intent,draft:parsed?.fields?this.state.draft:null,editing};
    this.busy=true;this.update({phase:'pending',message:null});
    try{await this.repository.write(stored);this.update({intent:stored});await this.send(stored);}
    catch{this.update({phase:'blocked',message:'No pudimos conservar el intento local. Comprobá el almacenamiento.'});}finally{this.busy=false;}}
  async recover(){if(this.disposed||this.busy)return;if(!this.state.intent){await this.initialize();return;}this.busy=true;this.update({phase:'pending',message:null});
    try{const intent=this.state.intent;if(intent.receipt)await this.confirmed(intent);else await this.send(intent);}
    catch{this.update({phase:'uncertain',message:'El intento sigue guardado. No pudimos comprobar el resultado.'});}finally{this.busy=false;}}
  private async send(stored:StoredFoodIntent){if(this.disposed)return;let result:MobileApiRequestResult<FoodReceipt>;
    try{result=await this.api.write(stored.intent);}catch{this.update({phase:'uncertain',message:'No sabemos si se guardó. Comprobar usa el mismo intento.'});return;}
    if(result.status==='ok'){const confirmed={...stored,receipt:result.data};this.update({phase:'confirmed',intent:confirmed});await this.repository.write(confirmed);await this.confirmed(confirmed);return;}
    if(['conflict','validation','not_found'].includes(result.status)){await this.repository.clear(stored.intent.idempotencyKey);
      this.update({intent:null,phase:result.status==='validation'||result.status==='conflict'&&result.code==='FOOD_NAME_EXISTS'?'idle':'conflict',message:'message' in result?result.message:'El alimento ya no está disponible.',truth:null});
      if(stored.intent.id)await this.loadTruth(stored.intent.id);await this.load();return;}
    this.update({phase:'uncertain',message:'El resultado es incierto. Conservamos el intento; comprobalo explícitamente.'});}
  async loadTruth(id=this.state.editing?.id){if(!id)return;const generation=++this.truthGeneration;
    try{const result=await this.api.detail(id);if(!this.disposed&&generation===this.truthGeneration)this.update({truth:result.status==='ok'?result.data.food:null});}
    catch{if(generation===this.truthGeneration)this.update({truth:null});}}
  reviewTruth(){if(this.state.phase!=='conflict'||!this.state.truth||this.busy)return;
    this.update({phase:'idle',editing:this.state.truth,draft:this.state.draft??foodDraft(this.state.truth),truth:null,message:'Revisá tu borrador frente a los datos actuales antes de guardar otra vez.'});}
  private async confirmed(stored:StoredFoodIntent){const receipt=stored.receipt!;const detail=await this.api.detail(receipt.id);if(this.disposed)return;
    if(detail.status!=='ok'){this.update({phase:'confirmed',message:'Operación confirmada. Falta actualizar el catálogo; no vuelvas a enviarla.'});return;}
    await this.load();if(this.disposed)return;if(this.state.listError){this.update({phase:'confirmed',message:'Operación confirmada. Falta actualizar la lista.'});return;}
    await this.repository.clear(stored.intent.idempotencyKey);this.update({phase:'idle',intent:null,mode:'browse',draft:null,editing:null,truth:null,errors:{},message:receipt.operation==='delete'?'Alimento eliminado. El histórico no cambia.':detail.data.food?'Catálogo actualizado.':'Operación confirmada. El alimento ya no está en el catálogo.'});}
}
