-- EXPAND · «Plato» con comidas guardadas: a plate item may also be one of the person's saved meals, by portions
-- ({kind:'saved', itemId, quantity, version}; the saved meal's version is the same CAS Rápido uses). Its nutrients are the
-- saved meal's own (a composite's at its own quantities), times the portions; unknown stays unknown. A food item keeps
-- its exact shape and request hash. Saving the plate keeps food provenance only for foods.
begin;

create or replace function public.mobile_normalize_quick_selection(p_selection jsonb)
 returns jsonb
 language plpgsql
 immutable
 set search_path to ''
 set "TimeZone" to 'UTC'
as $function$
declare s jsonb; q jsonb; qs jsonb := 'null'::jsonb; dt date; sid uuid; n numeric; title text;
begin
 if p_selection is null or jsonb_typeof(p_selection)<>'object' or p_selection - array['date','source','quantities','mealLabel','consumedAt','consumedAtSource'] <> '{}'::jsonb
  or not p_selection ?& array['date','source','quantities'] then raise exception using errcode='22023',message='INVALID_QUICK_SELECTION'; end if;
 if jsonb_typeof(p_selection->'date') is distinct from 'string' then raise exception using errcode='22023',message='INVALID_DATE'; end if;
 dt:=(p_selection->>'date')::date; s:=p_selection->'source';
 if dt is null or not isfinite(dt) or dt::text<>p_selection->>'date' or jsonb_typeof(s) is distinct from 'object' then raise exception using errcode='22023',message='INVALID_QUICK_SOURCE'; end if;
 -- «Plato»: foods by quantity, in the order they were added.
 if s->>'kind'='plate' then
  if (select count(*) from jsonb_object_keys(s))<>3 or not s ?& array['kind','title','saveToLibrary']
   or jsonb_typeof(s->'title') not in ('string','null') or jsonb_typeof(s->'saveToLibrary') is distinct from 'boolean' then raise exception using errcode='22023',message='INVALID_QUICK_SOURCE'; end if;
  title:=nullif(regexp_replace(btrim(s->>'title'),'\s+',' ','g'),'');
  if char_length(title)>120 or ((s->>'saveToLibrary')::boolean and title is null) then raise exception using errcode='22023',message='INVALID_PLATE_TITLE'; end if;
  if jsonb_typeof(p_selection->'quantities') is distinct from 'array' or jsonb_array_length(p_selection->'quantities') not between 1 and 50 then raise exception using errcode='22023',message='INVALID_QUANTITIES'; end if;
  qs:='[]'::jsonb;
  for q in select value from jsonb_array_elements(p_selection->'quantities') loop
   -- A food is {itemId, quantity, version}; a saved meal adds kind 'saved' (its quantity is portions).
   if jsonb_typeof(q)<>'object' or (select count(*) from jsonb_object_keys(q))<>(case when q ? 'kind' then 4 else 3 end) or not q ?& array['itemId','quantity','version']
    or (q ? 'kind' and q->'kind' is distinct from '"saved"'::jsonb)
    or jsonb_typeof(q->'itemId') is distinct from 'string' or (q->>'itemId')::uuid is null
    or jsonb_typeof(q->'version') is distinct from 'string' or coalesce(q->>'version','') !~ '^[a-f0-9]{64}$'
    or jsonb_typeof(q->'quantity') is distinct from 'number' then raise exception using errcode='22023',message='INVALID_QUANTITIES'; end if;
   n:=(q->>'quantity')::numeric;
   if n<=0 or n>1000000 or n<>round(n,2) then raise exception using errcode='22023',message='INVALID_QUANTITIES'; end if;
   qs:=qs||jsonb_build_array(jsonb_build_object('itemId',(q->>'itemId')::uuid,'quantity',n::numeric(12,2),'version',q->>'version')||case when q ? 'kind' then jsonb_build_object('kind','saved') else '{}'::jsonb end);
  end loop;
  if (select count(distinct value->>'itemId') from jsonb_array_elements(qs))<>jsonb_array_length(qs) then raise exception using errcode='22023',message='DUPLICATE_ITEM'; end if;
  return public.mobile_normalize_meal_timing(p_selection,dt)||jsonb_build_object('date',dt::text,
   'source',jsonb_build_object('kind','plate','title',title,'saveToLibrary',(s->>'saveToLibrary')::boolean),'quantities',qs);
 end if;
 if (select count(*) from jsonb_object_keys(s))<>3 or not s ?& array['kind','id','version']
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
$function$;

create or replace function public.mobile_resolve_plate_occurrence(p_selection jsonb, p_lock boolean default false)
 returns jsonb
 language plpgsql
 set search_path to ''
 set "TimeZone" to 'UTC'
 set lock_timeout to '3s'
 set statement_timeout to '8s'
as $function$
declare u uuid:=(select auth.uid()); sel jsonb; q jsonb; f public.foods; s public.saved_meals; raw_items jsonb; base jsonb; n numeric; factor double precision; scaled jsonb:='[]'::jsonb;
 totals jsonb; calories numeric; protein numeric; carbs numeric; fat numeric; title text; description text;
begin
 if u is null then raise exception using errcode='PT401',message='UNAUTHORIZED'; end if;
 sel:=public.mobile_normalize_quick_selection(p_selection);
 if sel->'source'->>'kind'<>'plate' then raise exception using errcode='22023',message='INVALID_PLATE_SOURCE'; end if;
 -- Locked in id order, so two plates sharing foods never wait on each other in opposite orders.
 if p_lock then
  perform 1 from public.foods where user_id=u and id in (select (value->>'itemId')::uuid from jsonb_array_elements(sel->'quantities') where not value ? 'kind') order by id for share;
  perform 1 from public.saved_meals where user_id=u and id in (select (value->>'itemId')::uuid from jsonb_array_elements(sel->'quantities') where value ? 'kind') order by id for share;
  perform 1 from public.saved_meal_items where user_id=u and saved_meal_id in (select (value->>'itemId')::uuid from jsonb_array_elements(sel->'quantities') where value ? 'kind') order by saved_meal_id,position,id for share;
 end if;
 for q in select value from jsonb_array_elements(sel->'quantities') loop
  n:=(q->>'quantity')::numeric;
  -- A saved meal by portions: its own totals (a composite's at its own quantities, as Rápido registers it), times the portions.
  if q ? 'kind' then
   select to_jsonb(ss),c.items into base,raw_items from public.saved_meals ss cross join lateral (
    select coalesce(jsonb_agg(to_jsonb(i) order by i.position,i.id),'[]'::jsonb) items from public.saved_meal_items i where i.saved_meal_id=ss.id and i.user_id=u
   ) c where ss.id=(q->>'itemId')::uuid and ss.user_id=u;
   s:=jsonb_populate_record(null::public.saved_meals,base);
   if s.id is null or not s.is_active then raise exception using errcode='P0421',message='QUICK_SOURCE_UNAVAILABLE'; end if;
   if public.mobile_quick_source_version(jsonb_build_object('saved',to_jsonb(s),'items',raw_items))<>q->>'version' then raise exception using errcode='P0421',message='QUICK_SOURCE_CHANGED'; end if;
   if s.template_type='composite' then
    if jsonb_array_length(raw_items) not between 1 and 50 then raise exception using errcode='P0421',message='QUICK_SOURCE_UNUSABLE'; end if;
    select public.saved_meal_scaled_totals(coalesce(jsonb_agg(public.saved_meal_scaled_nutrients(value,(value->>'quantity')::numeric)),'[]'::jsonb)) into base from jsonb_array_elements(raw_items);
   else base:=jsonb_build_object('calories',s.calories,'proteinG',s.protein_g,'carbsG',s.carbs_g,'fatG',s.fat_g);
   end if;
   if base->>'calories' is null or (base->>'calories')::numeric<0 then raise exception using errcode='P0421',message='QUICK_SOURCE_UNUSABLE'; end if;
   scaled:=scaled||jsonb_build_array(jsonb_build_object('id',s.id,'kind','saved','label',s.name,'quantity',n,'unit','porción',
    'calories',floor((base->>'calories')::double precision*n::double precision+0.5)::numeric,
    'proteinG',floor(((base->>'proteinG')::double precision*n::double precision+2.220446049250313e-16)*100+0.5)::numeric/100,
    'carbsG',floor(((base->>'carbsG')::double precision*n::double precision+2.220446049250313e-16)*100+0.5)::numeric/100,
    'fatG',floor(((base->>'fatG')::double precision*n::double precision+2.220446049250313e-16)*100+0.5)::numeric/100));
   continue;
  end if;
  select * into f from public.foods where id=(q->>'itemId')::uuid and user_id=u;
  if f.id is null or not f.is_active then raise exception using errcode='P0421',message='QUICK_SOURCE_UNAVAILABLE'; end if;
  if public.mobile_quick_source_version(to_jsonb(f))<>q->>'version' then raise exception using errcode='P0421',message='QUICK_SOURCE_CHANGED'; end if;
  if f.calories is null or f.calories<0 or f.serving_quantity<=0 then raise exception using errcode='P0421',message='QUICK_SOURCE_UNUSABLE'; end if;
  factor:=n::double precision/f.serving_quantity::double precision;
  -- Same rounding as one food by quantity (mobile_resolve_food_occurrence).
  scaled:=scaled||jsonb_build_array(jsonb_build_object('id',f.id,'label',f.name,'quantity',n,'unit',f.serving_unit,
   'calories',floor(f.calories::double precision*factor+0.5)::numeric,
   'proteinG',floor((f.protein_g::double precision*factor+2.220446049250313e-16)*100+0.5)::numeric/100,
   'carbsG',floor((f.carbs_g::double precision*factor+2.220446049250313e-16)*100+0.5)::numeric/100,
   'fatG',floor((f.fat_g::double precision*factor+2.220446049250313e-16)*100+0.5)::numeric/100));
 end loop;
 totals:=public.saved_meal_scaled_totals(scaled);
 calories:=(totals->>'calories')::numeric; protein:=(totals->>'proteinG')::numeric; carbs:=(totals->>'carbsG')::numeric; fat:=(totals->>'fatG')::numeric;
 if calories is null or calories<=0 or calories<>trunc(calories) or calories>2147483647
  or protein>999999.99 or carbs>99999999.99 or fat>99999999.99 then raise exception using errcode='P0421',message='QUICK_SOURCE_UNUSABLE'; end if;
 -- Same first-five ingredient description as a composite saved meal.
 select string_agg(replace(replace(replace(rtrim(rtrim(to_char((value->>'quantity')::numeric,'FM999,999,990.00'),'0'),'.'),',','#'),'.',','),'#','.')||' '||(value->>'unit')||' '||lower(value->>'label'),' · ' order by ordinality)
 into description from jsonb_array_elements(scaled) with ordinality where ordinality<=5;
 if jsonb_array_length(scaled)>5 then description:=description||' · +'||(jsonb_array_length(scaled)-5)::text||' ingredientes'; end if;
 title:=nullif(upper(regexp_replace(btrim(coalesce(sel->'source'->>'title','Plato')),'\s+',' ','g')),'');
 description:=nullif(upper(regexp_replace(btrim(description),'\s+',' ','g')),'');
 return jsonb_build_object('status','preview','selection',sel,'snapshot',jsonb_build_object('title',title,'description',description,
  'calories',calories::integer,'proteinG',protein,'carbsG',carbs,'fatG',fat,'precision',null,'contextType','food_plate','sourceNote',null),'items',scaled);
end;
$function$;

create or replace function public.mobile_confirm_quick_meal(p_intent jsonb)
 returns table(response_status smallint, response_body jsonb, replayed boolean)
 language plpgsql
 security definer
 set search_path to ''
 set "TimeZone" to 'UTC'
 set lock_timeout to '3s'
 set statement_timeout to '8s'
as $function$
declare u uuid := (select auth.uid()); sel jsonb; normalized jsonb; op text; k text; hash text;
 ledger public.mobile_idempotency_keys; preview jsonb; snap jsonb; d public.day_logs; meal public.meal_entries;
 saved public.saved_meals; code smallint:=201; result jsonb; resource uuid; name text;
begin
 if u is null then raise exception using errcode='PT401',message='UNAUTHORIZED'; end if;
 if p_intent is null or jsonb_typeof(p_intent)<>'object' or p_intent - array['operation','date','source','quantities','idempotencyKey','mealLabel','consumedAt','consumedAtSource'] <> '{}'::jsonb
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
   -- «Plato» + «Guardar para repetir»: the composite saved meal is written with the meal, or neither is.
   if sel->'source'->>'kind'='plate' and (sel->'source'->>'saveToLibrary')::boolean then
    begin
     insert into public.saved_meals(user_id,name,description,template_type,calories,protein_g,carbs_g,fat_g)
     values(u,left(snap->>'title',120),null,'composite',(snap->>'calories')::integer,(snap->>'proteinG')::numeric,(snap->>'carbsG')::numeric,(snap->>'fatG')::numeric) returning * into saved;
    exception when unique_violation then raise exception using errcode='P0421',message='SAVED_NAME_EXISTS';
    end;
    insert into public.saved_meal_items(saved_meal_id,user_id,label,quantity,unit,base_quantity,base_calories,base_protein_g,base_carbs_g,base_fat_g,source_food_id,position)
    select saved.id,u,value->>'label',(value->>'quantity')::numeric,value->>'unit',(value->>'quantity')::numeric,(value->>'calories')::integer,
     (value->>'proteinG')::numeric,(value->>'carbsG')::numeric,(value->>'fatG')::numeric,case when value ? 'kind' then null else (value->>'id')::uuid end,(ordinality-1)::smallint
    from jsonb_array_elements(preview->'items') with ordinality;
   end if;
   d:=public.get_or_create_day_log((sel->>'date')::date);
   insert into public.meal_entries(user_id,day_log_id,title,description,final_calories,final_protein_g,final_carbs_g,final_fat_g,source_type,entry_kind,context_type,precision_level,source_note,meal_label,consumed_at,consumed_at_source)
   values(u,d.id,snap->>'title',snap->>'description',(snap->>'calories')::integer,(snap->>'proteinG')::numeric,(snap->>'carbsG')::numeric,(snap->>'fatG')::numeric,'manual','meal',snap->>'contextType',snap->>'precision',snap->>'sourceNote',sel->>'mealLabel',coalesce((sel->>'consumedAt')::timestamptz,now()),case when sel ? 'consumedAtSource' then sel->>'consumedAtSource' when not sel ? 'consumedAt' then 'default_clock' end) returning * into meal;
   resource:=meal.id; result:=jsonb_build_object('status','registered','operation','register','date',sel->>'date','resourceId',meal.id,'updatedAt',meal.updated_at);
  end if;
 exception
  when unique_violation then
   if p_intent->>'operation'<>'saveSuggestion' then raise; end if;
   code:=409; result:=jsonb_build_object('error','SAVED_NAME_EXISTS','message','Ya tenés una habitual activa con ese nombre.');
  when sqlstate 'P0421' then
   code:=409; result:=jsonb_build_object('error',sqlerrm,'message',case sqlerrm when 'QUICK_SOURCE_CHANGED' then 'La opción cambió. Conservamos tus cantidades para revisarlas.' when 'QUICK_SOURCE_UNAVAILABLE' then 'Esta opción ya no está disponible.' when 'DAY_HAS_HISTORICAL_SUMMARY' then 'Ese día contiene un resumen histórico y no admite comidas detalladas.'
    when 'SAVED_NAME_EXISTS' then 'Ya tenés una comida guardada con ese nombre. Cambialo o desactivá Guardar para repetir.' else 'Esta opción no tiene datos o cantidades registrables.' end);
 end;
 update public.mobile_idempotency_keys set state='completed',response_status=code,response_body=result,
  resource_type=case when p_intent->>'operation'='register' then 'meal' else 'saved_meal' end,resource_id=resource,completed_at=clock_timestamp()
 where user_id=u and operation=op and idempotency_key=k;
 return query select code,result,false;
end;
$function$;

commit;
