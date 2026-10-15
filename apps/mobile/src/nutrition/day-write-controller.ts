import type { MobileApiRequestResult, MobileApiReadResult } from '@/api/results';
import type { MobileNutritionDayResponse } from '@/api/nutrition-day';
import type { DayWriteIntent, DayWriteResponse } from '@/api/nutrition-day-write';
import { buildDayWriteIntent, canWriteDay, dayWriteDraft, draftDirty, rebaseDayDraft, type DayWriteDraft, type MetricInput } from './day-write-model';
import { DayWriteRepository, type StoredDayWrite } from './day-write-storage';
export type DayWriteState = { phase:'loading'|'idle'|'pending'|'uncertain'|'confirmed'|'conflict'|'blocked';
  draft:DayWriteDraft|null; intent:StoredDayWrite|null; truth:MobileNutritionDayResponse|null; message:string|null; errors:Record<string,string> };
export type DayWriteApi = { mutate:(intent:DayWriteIntent)=>Promise<MobileApiRequestResult<DayWriteResponse>>; read:(date:string)=>Promise<MobileApiReadResult<MobileNutritionDayResponse>> };
export type DayWriteConfirmation = { intent: DayWriteIntent; baseline: MobileNutritionDayResponse; current: MobileNutritionDayResponse };
export class DayWriteController {
  private state:DayWriteState={phase:'loading',draft:null,intent:null,truth:null,message:null,errors:{}};
  private confirmations=new Set<(confirmation:DayWriteConfirmation)=>void>();
  private listeners=new Set<()=>void>(); private busy=false; private disposed=false;
  constructor(private api:DayWriteApi,private repository:DayWriteRepository,private invalidate:()=>void,
    private newKey=()=>`day:${Date.now()}:${Math.random().toString(36).slice(2)}`) {}
  getSnapshot=()=>this.state;
  subscribe=(f:()=>void)=>{this.listeners.add(f);return()=>{this.listeners.delete(f);};};
  private update(patch:Partial<DayWriteState>) { if(!this.disposed) {this.state={...this.state,...patch};this.listeners.forEach(f=>f());} }
  /** Presentation observers run only after the existing receipt, reread and storage cleanup succeed. */
  subscribeConfirmed=(listener:(confirmation:DayWriteConfirmation)=>void)=>{this.confirmations.add(listener);return()=>{this.confirmations.delete(listener);};};
  dispose(){this.disposed=true;this.listeners.clear();this.confirmations.clear();}
  async initialize(){
    try{const intent=await this.repository.read();this.update({intent,phase:intent ? intent.receipt ? 'confirmed':'uncertain':'idle',
      draft:intent?.draft??null,message:intent ? 'Hay un intento guardado. Comprobalo explícitamente antes de enviar otro.':null});}
    catch{this.update({phase:'blocked',message:'No pudimos leer el intento local. Comprobá el almacenamiento.'});}
  }
  /**
   * Nutrition and Daily Metrics share ONE persisted intent per user. On entering a
   * surface, re-read it so neither keeps a stale in-memory copy. An open draft
   * without an intent change is never touched.
   */
  async resync(){
    if(this.disposed||this.busy)return;
    let stored:StoredDayWrite|null;
    try{stored=await this.repository.read();}catch{this.update({phase:'blocked',message:'No pudimos leer el intento local. Comprobá el almacenamiento.'});return;}
    if(this.disposed||this.busy)return;
    const current=this.state.intent;
    if(stored&&(current?.intent.idempotencyKey!==stored.intent.idempotencyKey||!!current?.receipt!==!!stored.receipt)){
      this.update({intent:stored,phase:stored.receipt?'confirmed':'uncertain',draft:stored.draft,errors:{},
        message:'Hay un intento guardado. Comprobalo explícitamente antes de enviar otro.'});
    }else if(!stored&&current){
      // Resolved on the other surface: release the stale copy; server truth is re-read.
      this.update({intent:null,phase:'idle',draft:null,truth:null,errors:{},message:null});this.invalidate();
    }else if(!stored&&this.state.phase==='blocked'){this.update({phase:'idle',message:null});}
  }
  open(kind:DayWriteDraft['kind'],data:MobileNutritionDayResponse){
    if(this.state.phase!=='idle'||this.state.intent||!canWriteDay(kind,data))return;
    this.update({draft:dayWriteDraft(kind,data),message:null,errors:{},truth:null});
  }
  changeMetric(id:string,field:keyof MetricInput,value:string){
    const d=this.state.draft;if(!d||!d.metrics[id]||this.state.intent||this.busy||!['idle','conflict'].includes(this.state.phase))return;
    const metric=d.baseline.activity.status==='ok'?d.baseline.activity.data.metrics.find(m=>m.id===id):undefined;
    if(metric&&!metric.isActive&&d.baseline.date>=d.baseline.today)return;
    this.update({draft:{...d,metrics:{...d.metrics,[id]:{...d.metrics[id],[field]:value}}},errors:{}});
  }
  changeContext(field:'target'|'expenditure',value:string){
    const d=this.state.draft;if(!d||this.state.intent||this.busy||!['idle','conflict'].includes(this.state.phase))return;
    this.update({draft:{...d,[field]:value},errors:{}});
  }
  dirty(){return !!this.state.draft&&draftDirty(this.state.draft);}
  close(){if(!this.busy)this.update({draft:null,...(this.state.intent||this.state.phase==='blocked'?{}:{phase:'idle',truth:null,errors:{},message:null})});}
  showRecovery(){if(this.state.intent&&!this.busy)this.update({draft:this.state.intent.draft});}
  async save(){
    const d=this.state.draft;if(this.disposed||!d||this.busy||this.state.intent||this.state.phase!=='idle')return;
    const built=buildDayWriteIntent(d,this.newKey());
    if(!built.intent){this.update({errors:built.errors,message:built.empty?'No hay cambios para guardar.':null});return;}
    const stored:StoredDayWrite={version:1,intent:built.intent,draft:d};
    this.busy=true;this.update({phase:'pending',errors:{},message:null});
    try{
      // Mutual exclusion across surfaces: adopt another surface's pending intent, never send a second one.
      const pending=await this.repository.read();
      if(pending){this.update({intent:pending,phase:pending.receipt?'confirmed':'uncertain',draft:pending.draft,
        message:'Ya hay otro intento guardado. Comprobalo antes de enviar uno nuevo.'});return;}
      await this.repository.write(stored);this.update({intent:stored});await this.send(stored);}
    catch{this.update({phase:'blocked',message:'No pudimos completar el almacenamiento del intento. Comprobalo antes de enviar otro.'});}
    finally{this.busy=false;}
  }
  async recover(){
    if(this.disposed||this.busy)return;
    if(!this.state.intent){await this.initialize();return;}
    const stored=this.state.intent;this.busy=true;this.update({phase:'pending',message:null});
    try{if(stored.receipt)await this.confirmed(stored);else await this.send(stored);}
    catch{this.update({phase:'uncertain',message:'El intento sigue guardado. No pudimos confirmar su resultado.'});}
    finally{this.busy=false;}
  }
  private async send(stored:StoredDayWrite){
    if(this.disposed)return;
    let r:MobileApiRequestResult<DayWriteResponse>;
    try{r=await this.api.mutate(stored.intent);}catch{this.update({phase:'uncertain',message:'No sabemos si se guardó. Comprobar usa el mismo intento.'});return;}
    if(r.status==='ok'&&'status' in r.data){
      const confirmed={...stored,receipt:r.data};this.update({intent:confirmed,phase:'confirmed'});await this.repository.write(confirmed);await this.confirmed(confirmed);return;
    }
    if(['unavailable','unauthorized','auth_required'].includes(r.status)){
      this.update({phase:'uncertain',message:'No hay un resultado confirmado. Conservamos el intento; comprobalo al recuperar conexión y sesión.'});return;
    }
    if(r.status==='conflict'||r.status==='validation'||r.status==='not_found'){
      await this.repository.clear(stored.intent.idempotencyKey);this.invalidate();
      this.update({intent:null,phase:r.status==='validation'?'idle':'conflict',message:r.message,truth:null});
      if(r.status!=='validation')await this.readTruth(stored.intent.date);
      return;
    }
    this.update({phase:'uncertain',message:'La respuesta no confirma el resultado. Comprobá el intento guardado.'});
  }
  private async confirmed(stored:StoredDayWrite){
    this.invalidate();
    const r=await this.api.read(stored.intent.date);
    if(r.status!=='ok'||r.data.date!==stored.intent.date||(stored.intent.operation==='metrics'?r.data.activity.status!=='ok':r.data.nutrition.status!=='ok')){
      this.update({phase:'confirmed',message:'Guardado confirmado. Falta actualizar la fecha; no vuelvas a guardar.'});return;
    }
    await this.repository.clear(stored.intent.idempotencyKey);
    this.update({phase:'idle',intent:null,draft:null,truth:null,errors:{},message:'Cambios guardados.'});
    if(!this.disposed)this.confirmations.forEach(listener=>{
      // Presentation feedback must never change the outcome of a completed write.
      try{listener({intent:stored.intent,baseline:stored.draft.baseline,current:r.data});}catch{/* Non-critical observer. */}
    });
  }
  private async readTruth(date:string){
    try{const r=await this.api.read(date);if(r.status==='ok'&&r.data.date===date)this.update({truth:r.data});}catch{/* Failed reads cannot authorize a new CAS. */}
  }
  async refreshConflict(){
    if(this.busy||this.state.phase!=='conflict'||!this.state.draft)return;
    this.busy=true;this.update({phase:'pending',truth:null});await this.readTruth(this.state.draft.baseline.date);this.update({phase:'conflict'});this.busy=false;
  }
  reviewWithServerVersion(){
    if(this.state.phase!=='conflict'||!this.state.draft||!this.state.truth)return;
    const draft=rebaseDayDraft(this.state.draft,this.state.truth);
    if(!draft){this.update({message:'Un dato dejó de ser editable o cambió de significado. Conservamos el borrador; revisá el servidor o cancelá.'});return;}
    this.update({draft,phase:'idle',message:'Revisá tus cambios sobre esta versión. Guardar requiere otra acción explícita.'});
  }
}
