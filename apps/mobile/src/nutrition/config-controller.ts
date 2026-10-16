import type {MobileApiReadResult,MobileApiRequestResult} from '@/api/results';
import type {NutritionConfig,ConfigIntent,ConfigReceipt,ConfigOperation} from '@/api/nutrition-config';
import {configurationDraft,validateConfigurationDraft,type ConfigDraft} from './config-model';
import {ConfigurationIntentRepository,type StoredConfigIntent} from './config-storage';
export type ConfigState={phase:'loading'|'idle'|'pending'|'uncertain'|'confirmed'|'conflict'|'blocked';open:boolean;presentation?:'modal'|'route';operation:ConfigOperation|null;config:NutritionConfig|null;baseline:NutritionConfig|null;draft:ConfigDraft|null;intent:StoredConfigIntent|null;loading:boolean;readError:boolean;message:string|null;errors:Record<string,string>};
export type ConfigApi={read:()=>Promise<MobileApiReadResult<NutritionConfig>>;write:(i:ConfigIntent)=>Promise<MobileApiRequestResult<ConfigReceipt>>;refreshToday:(date:string)=>Promise<boolean>};
export class ConfigurationController{
 private state:ConfigState={phase:'loading',open:false,operation:null,config:null,baseline:null,draft:null,intent:null,loading:false,readError:false,message:null,errors:{}};
 private busy=false;private disposed=false;private requested:ConfigOperation|null=null;private generation=0;private listeners=new Set<()=>void>();
 constructor(private api:ConfigApi,private repository:ConfigurationIntentRepository,private invalidate:()=>void,private key:()=>string=()=>`config:${Date.now()}:${Math.random().toString(36).slice(2)}`){}
 getSnapshot=()=>this.state;subscribe=(f:()=>void)=>{this.listeners.add(f);return()=>{this.listeners.delete(f);};};
 private update(p:Partial<ConfigState>){if(!this.disposed){this.state={...this.state,...p};this.listeners.forEach(f=>f());}}
 dispose(){this.disposed=true;this.generation++;this.listeners.clear();}
 async initialize(){try{const i=await this.repository.read();this.update(i?{phase:i.receipt?'confirmed':'uncertain',intent:i,operation:i.intent.operation,draft:i.draft,message:'Tenés un cambio pendiente. Comprobá si se guardó antes de hacer otro.'}:{phase:'idle'});}catch{this.update({phase:'blocked',message:'No pudimos recuperar tu cambio de este teléfono.'});}}
 // open() shows the index; open(op) goes straight to that operation once server truth is read (e.g. Settings → physical).
 open(op?:ConfigOperation,presentation:'modal'|'route'='modal'){if(this.state.phase!=='idle'||this.state.intent||this.busy)return;this.requested=op??null;this.update({open:true,presentation,operation:null,draft:null,baseline:null,message:null});void this.load();}
 close(){if(this.busy)return;this.requested=null;this.update({open:false,...(!this.state.intent?{phase:'idle',operation:null,draft:null,baseline:null,message:null}: {})});}
 showRecovery(presentation:'modal'|'route'='modal'){if(!this.busy&&this.state.intent){this.update({open:true,presentation});void this.load();}}
 async load():Promise<boolean>{const g=++this.generation;this.update({loading:true});
  try{const r=await this.api.read();if(this.disposed||g!==this.generation)return false;
   this.update(r.status==='ok'?{config:r.data,readError:false,loading:false}:{readError:true,loading:false});
   if(r.status==='ok'&&this.requested&&this.state.open&&!this.state.operation){const op=this.requested;this.requested=null;this.begin(op);}
   return r.status==='ok';
  }catch{if(g===this.generation)this.update({readError:true,loading:false});return false;}}
 begin(op:ConfigOperation){if(this.busy||this.state.intent||this.state.phase!=='idle'||this.state.loading||this.state.readError||!this.state.config)return;
  const draft=configurationDraft(op,this.state.config);if(draft)this.update({operation:op,draft,baseline:this.state.config,errors:{},message:null});}
 back(){if(this.busy||this.state.intent)return;this.requested=null;this.update({phase:'idle',operation:null,draft:null,baseline:null,errors:{},message:null});}
 dirty(){return !!this.state.operation&&!!this.state.draft&&JSON.stringify(this.state.draft)!==JSON.stringify(this.state.baseline?configurationDraft(this.state.operation,this.state.baseline):null);}
 change(key:string,value:string){if(this.busy||this.state.phase!=='idle'||this.state.intent||!this.state.draft||!(key in this.state.draft))return;this.update({draft:{...this.state.draft,[key]:value},errors:{},message:null});}
 async save(){if(this.disposed||this.busy||this.state.phase!=='idle'||this.state.intent||!this.state.operation||!this.state.draft||!this.state.baseline)return;
  const {operation:op,draft,baseline}=this.state,section=baseline[op];if(section.status!=='ok')return;
  const parsed=validateConfigurationDraft(op,draft);if(!parsed.fields){this.update({errors:parsed.errors});return;}
  const intent={operation:op,fields:parsed.fields,date:baseline.today,expectedVersion:section.data.version,idempotencyKey:this.key()} as ConfigIntent;
  const stored:StoredConfigIntent={version:1,intent,draft};this.busy=true;this.update({phase:'pending',message:null});
  try{await this.repository.write(stored);this.update({intent:stored});await this.send(stored);}catch{this.update({phase:'blocked',message:'No pudimos guardar el cambio en este teléfono. Comprobalo antes de seguir.'});}finally{this.busy=false;}}
 async recover(){if(this.busy||this.disposed)return;if(!this.state.intent){await this.initialize();return;}this.busy=true;this.update({phase:'pending',message:null});try{const i=this.state.intent;if(i.receipt)await this.confirmed(i);else await this.send(i);}catch{this.update({phase:'uncertain',message:'Tu cambio sigue acá. No pudimos confirmar si llegó.'});}finally{this.busy=false;}}
 private async send(i:StoredConfigIntent){let r:MobileApiRequestResult<ConfigReceipt>;try{r=await this.api.write(i.intent);}catch{this.update({phase:'uncertain',message:'No sabemos si se guardó. Comprobá el cambio antes de hacer otro.'});return;}
  if(r.status==='ok'){const stored={...i,receipt:r.data};this.update({phase:'confirmed',intent:stored});await this.repository.write(stored);await this.confirmed(stored);return;}
  if(r.status==='conflict'||r.status==='validation'||r.status==='not_found'){
   await this.repository.clear(i.intent.idempotencyKey);this.update({intent:null,phase:r.status==='validation'?'idle':'conflict',message:r.message});await this.load();return;
  }
  this.update({phase:'uncertain',message:'Tu cambio sigue acá. Comprobá si se guardó antes de hacer otro.'});
 }
 reviewTruth(){const c=this.state.config,op=this.state.operation;if(this.busy||this.state.phase!=='conflict'||this.state.loading||this.state.readError||!c||!op||c[op].status!=='ok')return;
  this.update({phase:'idle',baseline:c,message:'Revisá tu cambio junto a los datos actuales antes de guardar.'});}
 private async confirmed(i:StoredConfigIntent){const r=i.receipt!;const today=await this.api.refreshToday(r.date);if(this.disposed)return;
  const config=await this.load();if(this.disposed)return;
  if(!today||!config){this.update({phase:'confirmed',message:'Se guardó. Falta mostrar los datos actualizados.'});return;}
  await this.repository.clear(i.intent.idempotencyKey);this.invalidate();this.update({phase:'idle',intent:null,operation:null,baseline:null,draft:null,errors:{},message:r.weightRecorded?'Datos guardados. El peso quedó registrado para hoy.':'Configuración guardada desde hoy.'});
 }
}
