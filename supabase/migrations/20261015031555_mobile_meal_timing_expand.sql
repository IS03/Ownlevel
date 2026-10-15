-- M9 Nutrition step 3 EXPAND. Optional keys preserve the exact legacy v1 hash.
-- Deploy this migration, then the HTTP adapters, before releasing Mobile ADOPT.
begin;
create or replace function public.mobile_normalize_meal_timing(f jsonb, dt date)
returns jsonb language plpgsql immutable security invoker set search_path='' set timezone='UTC'
as $$
declare result jsonb := '{}'::jsonb; stamp timestamptz;
begin
 if f ? 'mealLabel' then
  if jsonb_typeof(f->'mealLabel') not in ('string','null') or (f->>'mealLabel' is not null and f->>'mealLabel' not in ('breakfast','lunch','snack','dinner','extra')) then raise exception using errcode='22023',message='INVALID_MEAL_LABEL'; end if;
  result:=result||jsonb_build_object('mealLabel',f->'mealLabel');
 end if;
 if f ? 'consumedAt' then
  if jsonb_typeof(f->'consumedAt') is distinct from 'string' or f->>'consumedAt' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](\.[0-9]{1,3})?(Z|[+-][0-9]{2}:[0-9]{2})$' then raise exception using errcode='22023',message='INVALID_MEAL_TIME'; end if;
  stamp:=(f->>'consumedAt')::timestamptz;
  if not isfinite(stamp) or (stamp at time zone 'America/Argentina/Cordoba')::date <> dt then raise exception using errcode='22023',message='INVALID_MEAL_TIME'; end if;
  result:=result||jsonb_build_object('consumedAt',to_char(stamp at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
 end if;
 return result;
end;
$$;
create or replace function public.mobile_mutate_manual_meal(p_intent jsonb)
returns table(response_status smallint, response_body jsonb, replayed boolean)
language plpgsql security definer set search_path = ''
set lock_timeout = '3s' set statement_timeout = '8s'
set timezone = 'UTC'
as $$
declare
  u uuid := (select auth.uid());
  op text; key text; src date; dst date; mid uuid; expected timestamptz;
  f jsonb; normalized jsonb; hash text; ledger public.mobile_idempotency_keys;
  meal public.meal_entries; day public.day_logs; old_date date;
  timing jsonb; library boolean; result jsonb; code smallint := 200; v_title text; v_description text;
begin
  if u is null then raise exception using errcode='PT401', message='UNAUTHORIZED'; end if;
  if p_intent is null or jsonb_typeof(p_intent) <> 'object'
    or (select count(*) from jsonb_object_keys(p_intent)) <> 7
    or not p_intent ?& array['operation','sourceDate','mealId','expectedUpdatedAt','idempotencyKey','fields','forceDuplicate']
    or p_intent->>'operation' not in ('create','edit','delete')
    or jsonb_typeof(p_intent->'forceDuplicate') <> 'boolean'
    or coalesce(p_intent->>'idempotencyKey','') !~ '^[A-Za-z0-9._:-]{1,128}$'
    or coalesce(p_intent->>'sourceDate','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    raise exception using errcode='22023', message='INVALID_MEAL';
  end if;
  op := p_intent->>'operation'; key := p_intent->>'idempotencyKey'; src := (p_intent->>'sourceDate')::date;
  if not isfinite(src) or src::text <> p_intent->>'sourceDate' then raise exception using errcode='22023', message='INVALID_DATE'; end if;
  if op = 'create' then
    if p_intent->'mealId' <> 'null'::jsonb or p_intent->'expectedUpdatedAt' <> 'null'::jsonb then
      raise exception using errcode='22023', message='INVALID_MEAL';
    end if;
  else
    mid := (p_intent->>'mealId')::uuid; expected := (p_intent->>'expectedUpdatedAt')::timestamptz;
    if mid is null or expected is null or not isfinite(expected) or (p_intent->>'forceDuplicate')::boolean then
      raise exception using errcode='22023', message='INVALID_MEAL';
    end if;
  end if;
  f := p_intent->'fields';
  if op = 'delete' then
    if f <> 'null'::jsonb then raise exception using errcode='22023', message='INVALID_MEAL'; end if;
    dst := src;
  else
    if jsonb_typeof(f) <> 'object' or f - array['date','title','description','calories','proteinG','carbsG','fatG','mealLabel','consumedAt','saveToLibrary'] <> '{}'::jsonb
      or not f ?& array['date','title','description','calories','proteinG','carbsG','fatG']
      or jsonb_typeof(f->'title') not in ('string','null') or jsonb_typeof(f->'description') not in ('string','null')
      or jsonb_typeof(f->'calories') <> 'number' or (f->>'calories')::numeric <= 0
      or (f->>'calories')::numeric <> trunc((f->>'calories')::numeric) or (f->>'calories')::numeric > 2147483647
      or exists(select 1 from unnest(array['proteinG','carbsG','fatG']) n where
        jsonb_typeof(f->n) not in ('number','null') or (f->>'calories') is null
        or (f->>n)::numeric < 0 or (f->>n)::numeric > case when n='proteinG' then 999999.99 else 99999999.99 end
        or (f->>n)::numeric <> round((f->>n)::numeric,2)) then
      raise exception using errcode='22023', message='INVALID_MEAL';
    end if;
    dst := (f->>'date')::date;
    if dst is null or not isfinite(dst) or dst::text <> f->>'date' or (op='create' and dst<>src) then
      raise exception using errcode='22023', message='INVALID_DATE';
    end if;
    timing:=public.mobile_normalize_meal_timing(f,dst);
    if f ? 'saveToLibrary' and jsonb_typeof(f->'saveToLibrary') is distinct from 'boolean' then raise exception using errcode='22023',message='INVALID_SAVE_TO_LIBRARY'; end if;
    library:=coalesce((f->>'saveToLibrary')::boolean,false);
    if library and op<>'create' then raise exception using errcode='22023',message='INVALID_SAVE_TO_LIBRARY'; end if;
    v_title := nullif(upper(regexp_replace(btrim(f->>'title'),'\s+',' ','g')),'');
    v_description := nullif(upper(regexp_replace(btrim(f->>'description'),'\s+',' ','g')),'');
    if library and coalesce(v_title,v_description) is null then raise exception using errcode='22023',message='SAVED_NAME_REQUIRED'; end if;
    timing:=timing||case when f ? 'saveToLibrary' then jsonb_build_object('saveToLibrary',library) else '{}'::jsonb end;
    f := timing||jsonb_build_object('date',dst::text,'title',v_title,'description',v_description,'calories',(f->>'calories')::integer,
      'proteinG',(f->>'proteinG')::numeric(8,2),'carbsG',(f->>'carbsG')::numeric(10,2),'fatG',(f->>'fatG')::numeric(10,2));
  end if;
  normalized := jsonb_build_object('operation',op,'sourceDate',src::text,'mealId',mid,'expectedUpdatedAt',expected,
    'fields',f,'forceDuplicate',(p_intent->>'forceDuplicate')::boolean);
  hash := encode(extensions.digest(convert_to(normalized::text,'UTF8'),'sha256'),'hex');
  op := 'nutrition.meal.' || op || '.v1';
  perform pg_advisory_xact_lock(hashtextextended(u::text, 412));
  -- Durable unresolved intents must never turn into new writes after cleanup.
  -- Nutrition receipts are retained (unlike bounded Training intents).
  insert into public.mobile_idempotency_keys(user_id,operation,idempotency_key,request_hash,expires_at)
  values(u,op,key,hash,'infinity') on conflict(user_id,operation,idempotency_key) do nothing;
  select * into ledger from public.mobile_idempotency_keys where user_id=u and operation=op and idempotency_key=key for update;
  if ledger.request_hash <> hash then
    return query select 409::smallint,jsonb_build_object('error','IDEMPOTENCY_KEY_REUSED','message','La clave ya fue usada con otros datos.'),false; return;
  end if;
  if ledger.state='completed' then return query select ledger.response_status,ledger.response_body,true; return; end if;

  if p_intent->>'operation' <> 'create' then
    select * into meal from public.meal_entries where id=mid and user_id=u for update;
    if not found then code:=404; result:=jsonb_build_object('error','NOT_FOUND','message','La comida no está disponible.');
    else
      select log_date into old_date from public.day_logs where id=meal.day_log_id and user_id=u;
      if meal.deleted_at is not null or meal.entry_kind<>'meal' or meal.source_type is distinct from 'manual' then
        code:=409; result:=jsonb_build_object('error','MEAL_UNAVAILABLE','message','Esta comida ya no se puede editar.');
      elsif meal.updated_at is distinct from expected or old_date is distinct from src then
        code:=409; result:=jsonb_build_object('error','MEAL_CHANGED','message','La comida cambió desde que la abriste.','currentDate',old_date::text);
      end if;
    end if;
  end if;
  if result is null and p_intent->>'operation'<>'delete' then
    select * into day from public.day_logs where user_id=u and log_date=dst;
    -- Match the domain composition trigger's ordering before resolving or
    -- writing a destination; moves must not pre-lock the destination first.
    perform 1 from public.day_logs where user_id=u and id in (day.id,meal.day_log_id) order by id for update;
    if exists(select 1 from public.meal_entries where user_id=u and day_log_id=day.id and deleted_at is null and entry_kind='legacy_daily_summary') then
      code:=409; result:=jsonb_build_object('error','DAY_HAS_HISTORICAL_SUMMARY','message','Ese día contiene un resumen histórico y no admite comidas detalladas.');
    elsif p_intent->>'operation'='create' and not (p_intent->>'forceDuplicate')::boolean and exists(
      select 1 from public.meal_entries m where m.user_id=u and m.day_log_id=day.id and m.deleted_at is null
      and m.created_at>=clock_timestamp()-interval '60 seconds' and trunc(m.final_calories)=(f->>'calories')::integer
      and ((m.final_protein_g is null and f->>'proteinG' is null) or abs(m.final_protein_g-(f->>'proteinG')::numeric)<=0.01)
      and ((m.final_carbs_g is null and f->>'carbsG' is null) or abs(m.final_carbs_g-(f->>'carbsG')::numeric)<=0.01)
      and ((m.final_fat_g is null and f->>'fatG' is null) or abs(m.final_fat_g-(f->>'fatG')::numeric)<=0.01)
      and ((v_title is not null and v_title=m.title) or (v_description is not null and v_description=m.description))) then
      code:=409; result:=jsonb_build_object('error','POSSIBLE_DUPLICATE','message','Hay una comida reciente con los mismos datos. ¿Guardar igual?');
    else day:=public.get_or_create_day_log(dst);
    end if;
  end if;
  if result is null then
    if p_intent->>'operation'='create' and library then
      begin
        insert into public.saved_meals(user_id,name,description,template_type,calories,protein_g,carbs_g,fat_g)
        values(u,left(coalesce(v_title,v_description),120),v_description,'manual',(f->>'calories')::integer,(f->>'proteinG')::numeric,(f->>'carbsG')::numeric,(f->>'fatG')::numeric);
      exception when unique_violation then
        code:=409; result:=jsonb_build_object('error','SAVED_NAME_EXISTS','message','Ya tenés una comida guardada con ese nombre. Cambialo o desactivá Guardar en mis comidas.');
      end;
    end if;
  end if;
  if result is null then
    if p_intent->>'operation'='create' then
      insert into public.meal_entries(user_id,day_log_id,title,description,final_calories,final_protein_g,final_carbs_g,final_fat_g,source_type,entry_kind,meal_label,consumed_at)
      values(u,day.id,v_title,v_description,(f->>'calories')::integer,(f->>'proteinG')::numeric,(f->>'carbsG')::numeric,(f->>'fatG')::numeric,'manual','meal',f->>'mealLabel',coalesce((f->>'consumedAt')::timestamptz,now())) returning * into meal;
      mid:=meal.id; code:=201;
    elsif p_intent->>'operation'='edit' then
      update public.meal_entries set meal_label=case when f ? 'mealLabel' then f->>'mealLabel' else meal.meal_label end,consumed_at=case when f ? 'consumedAt' then (f->>'consumedAt')::timestamptz else meal.consumed_at end,day_log_id=day.id,title=v_title,description=v_description,final_calories=(f->>'calories')::integer,
        final_protein_g=(f->>'proteinG')::numeric,final_carbs_g=(f->>'carbsG')::numeric,final_fat_g=(f->>'fatG')::numeric
      where id=mid and user_id=u returning * into meal;
    else
      update public.meal_entries set deleted_at=clock_timestamp() where id=mid and user_id=u returning * into meal;
    end if;
    -- Existing composition/owner/normalization/recalculation triggers preserve
    -- snapshots, soft delete, and both origin/destination aggregates atomically.
    result:=jsonb_build_object('status',case when p_intent->>'operation'='delete' then 'deleted' else 'saved' end,
      'mealId',mid,'sourceDate',src::text,'destinationDate',dst::text,'updatedAt',meal.updated_at);
  end if;
  update public.mobile_idempotency_keys set state='completed',response_status=code,response_body=result,
    resource_type='meal',resource_id=mid,completed_at=clock_timestamp() where user_id=u and operation=op and idempotency_key=key;
  return query select code,result,false;
end;
$$;
create or replace function public.mobile_normalize_quick_selection(p_selection jsonb)
returns jsonb language plpgsql immutable security invoker set search_path='' set timezone='UTC'
as $$
declare s jsonb; q jsonb; qs jsonb := 'null'::jsonb; dt date; sid uuid; n numeric;
begin
 if p_selection is null or jsonb_typeof(p_selection)<>'object' or p_selection - array['date','source','quantities','mealLabel','consumedAt'] <> '{}'::jsonb
  or not p_selection ?& array['date','source','quantities'] then raise exception using errcode='22023',message='INVALID_QUICK_SELECTION'; end if;
 if jsonb_typeof(p_selection->'date') is distinct from 'string' then raise exception using errcode='22023',message='INVALID_DATE'; end if;
 dt:=(p_selection->>'date')::date; s:=p_selection->'source';
 if dt is null or not isfinite(dt) or dt::text<>p_selection->>'date' or jsonb_typeof(s) is distinct from 'object'
  or (select count(*) from jsonb_object_keys(s))<>3 or not s ?& array['kind','id','version']
  or coalesce(s->>'kind','') not in ('suggestion','saved','food') or coalesce(s->>'version','') !~ '^[a-f0-9]{64}$'
  or jsonb_typeof(s->'id') is distinct from 'string' or jsonb_typeof(s->'kind') is distinct from 'string' or jsonb_typeof(s->'version') is distinct from 'string' then raise exception using errcode='22023',message='INVALID_QUICK_SOURCE'; end if;
 sid:=(s->>'id')::uuid;
 if sid is null then raise exception using errcode='22023',message='INVALID_QUICK_SOURCE'; end if;
 if p_selection->'quantities'<>'null'::jsonb then
  if s->>'kind' not in ('saved','food') or jsonb_typeof(p_selection->'quantities') is distinct from 'array'
   or jsonb_array_length(p_selection->'quantities') not between 1 and 50 then raise exception using errcode='22023',message='INVALID_QUANTITIES'; end if;
  qs:='[]'::jsonb;
  for q in select value from jsonb_array_elements(p_selection->'quantities') loop
   if jsonb_typeof(q)<>'object' or (select count(*) from jsonb_object_keys(q))<>2
    or not q ?& array['itemId','quantity'] or (q->>'itemId')::uuid is null
    or jsonb_typeof(q->'quantity') is distinct from 'number' then raise exception using errcode='22023',message='INVALID_QUANTITIES'; end if;
   n:=(q->>'quantity')::numeric;
   if n<=0 or n>1000000 or n<>round(n,case when s->>'kind'='food' then 3 else 2 end) then raise exception using errcode='22023',message='INVALID_QUANTITIES'; end if;
   qs:=qs||jsonb_build_array(jsonb_build_object('itemId',(q->>'itemId')::uuid,'quantity',case when s->>'kind'='food' then n::numeric(12,3) else n::numeric(12,2) end));
  end loop;
  if (select count(distinct value->>'itemId') from jsonb_array_elements(qs))<>jsonb_array_length(qs) then raise exception using errcode='22023',message='DUPLICATE_ITEM'; end if;
  select jsonb_agg(value order by value->>'itemId') into qs from jsonb_array_elements(qs);
 end if;
 if s->>'kind'='food' and (qs='null'::jsonb or jsonb_array_length(qs)<>1 or (qs->0->>'itemId')::uuid<>sid) then raise exception using errcode='22023',message='INVALID_FOOD_QUANTITY'; end if;
 return public.mobile_normalize_meal_timing(p_selection,dt)||jsonb_build_object('date',dt::text,'source',jsonb_build_object('kind',s->>'kind','id',sid,'version',s->>'version'),'quantities',qs);
end;
$$;

create or replace function public.mobile_confirm_quick_meal(p_intent jsonb)
returns table(response_status smallint,response_body jsonb,replayed boolean)
language plpgsql security definer set search_path='' set timezone='UTC'
set lock_timeout='3s' set statement_timeout='8s'
as $$
declare u uuid := (select auth.uid()); sel jsonb; normalized jsonb; op text; k text; hash text;
 ledger public.mobile_idempotency_keys; preview jsonb; snap jsonb; d public.day_logs; meal public.meal_entries;
 saved public.saved_meals; code smallint:=201; result jsonb; resource uuid; name text;
begin
 if u is null then raise exception using errcode='PT401',message='UNAUTHORIZED'; end if;
 if p_intent is null or jsonb_typeof(p_intent)<>'object' or p_intent - array['operation','date','source','quantities','idempotencyKey','mealLabel','consumedAt'] <> '{}'::jsonb
  or not p_intent ?& array['operation','date','source','quantities','idempotencyKey']
  or jsonb_typeof(p_intent->'operation') is distinct from 'string' or jsonb_typeof(p_intent->'idempotencyKey') is distinct from 'string'
  or coalesce(p_intent->>'operation','') not in ('register','saveSuggestion') or coalesce(p_intent->>'idempotencyKey','') !~ '^[A-Za-z0-9._:-]{1,128}$' then raise exception using errcode='22023',message='INVALID_QUICK_INTENT'; end if;
 sel:=public.mobile_normalize_quick_selection(p_intent-'operation'-'idempotencyKey');
 if p_intent->>'operation'='saveSuggestion' and sel->'source'->>'kind'<>'suggestion' then raise exception using errcode='22023',message='INVALID_SAVE_SUGGESTION'; end if;
 op:='nutrition.quick.'||(p_intent->>'operation')||'.v1'; k:=p_intent->>'idempotencyKey'; normalized:=sel||jsonb_build_object('operation',p_intent->>'operation');
 hash:=public.mobile_quick_source_version(normalized);
 perform pg_advisory_xact_lock(hashtextextended(u::text,412));
 insert into public.mobile_idempotency_keys(user_id,operation,idempotency_key,request_hash,expires_at)
 values(u,op,k,hash,'infinity') on conflict(user_id,operation,idempotency_key) do nothing;
 select * into ledger from public.mobile_idempotency_keys where user_id=u and operation=op and idempotency_key=k for update;
 if ledger.request_hash<>hash then return query select 409::smallint,jsonb_build_object('error','IDEMPOTENCY_KEY_REUSED','message','La clave ya fue usada con otros datos.'),false; return; end if;
 if ledger.state='completed' then return query select ledger.response_status,ledger.response_body,true; return; end if;
 begin
  preview:=public.mobile_resolve_quick_occurrence(sel,true); snap:=preview->'snapshot';
  if p_intent->>'operation'='saveSuggestion' then
   name:=left(coalesce(nullif(upper(regexp_replace(btrim(snap->>'title'),'\s+',' ','g')),''),nullif(upper(regexp_replace(btrim(snap->>'description'),'\s+',' ','g')),'')),120);
   insert into public.saved_meals(user_id,name,description,template_type,calories,protein_g,carbs_g,fat_g)
   values(u,name,snap->>'description','manual',(snap->>'calories')::integer,(snap->>'proteinG')::numeric,(snap->>'carbsG')::numeric,(snap->>'fatG')::numeric) returning * into saved;
   resource:=saved.id; result:=jsonb_build_object('status','habitual_saved','operation','saveSuggestion','date',sel->>'date','resourceId',saved.id,'updatedAt',saved.updated_at);
  else
   select * into d from public.day_logs where user_id=u and log_date=(sel->>'date')::date for update;
   if exists(select 1 from public.meal_entries where day_log_id=d.id and user_id=u and deleted_at is null and entry_kind='legacy_daily_summary') then raise exception using errcode='P0421',message='DAY_HAS_HISTORICAL_SUMMARY'; end if;
   d:=public.get_or_create_day_log((sel->>'date')::date);
   insert into public.meal_entries(user_id,day_log_id,title,description,final_calories,final_protein_g,final_carbs_g,final_fat_g,source_type,entry_kind,context_type,precision_level,source_note,meal_label,consumed_at)
   values(u,d.id,snap->>'title',snap->>'description',(snap->>'calories')::integer,(snap->>'proteinG')::numeric,(snap->>'carbsG')::numeric,(snap->>'fatG')::numeric,'manual','meal',snap->>'contextType',snap->>'precision',snap->>'sourceNote',sel->>'mealLabel',coalesce((sel->>'consumedAt')::timestamptz,now())) returning * into meal;
   resource:=meal.id; result:=jsonb_build_object('status','registered','operation','register','date',sel->>'date','resourceId',meal.id,'updatedAt',meal.updated_at);
  end if;
 exception
  when unique_violation then
   if p_intent->>'operation'<>'saveSuggestion' then raise; end if;
   code:=409; result:=jsonb_build_object('error','SAVED_NAME_EXISTS','message','Ya tenés una habitual activa con ese nombre.');
  when sqlstate 'P0421' then
   code:=409; result:=jsonb_build_object('error',sqlerrm,'message',case sqlerrm when 'QUICK_SOURCE_CHANGED' then 'La opción cambió. Conservamos tus cantidades para revisarlas.' when 'QUICK_SOURCE_UNAVAILABLE' then 'Esta opción ya no está disponible.' when 'DAY_HAS_HISTORICAL_SUMMARY' then 'Ese día contiene un resumen histórico y no admite comidas detalladas.' else 'Esta opción no tiene datos o cantidades registrables.' end);
 end;
 update public.mobile_idempotency_keys set state='completed',response_status=code,response_body=result,
  resource_type=case when p_intent->>'operation'='register' then 'meal' else 'saved_meal' end,resource_id=resource,completed_at=clock_timestamp()
 where user_id=u and operation=op and idempotency_key=k;
 return query select code,result,false;
end;
$$;
revoke all on function public.mobile_normalize_meal_timing(jsonb,date) from public,anon;
grant execute on function public.mobile_normalize_meal_timing(jsonb,date) to authenticated;
commit;
