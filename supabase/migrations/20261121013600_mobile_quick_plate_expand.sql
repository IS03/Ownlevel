-- EXPAND · «Plato»: several personal foods, each with its quantity, registered as ONE meal through the existing quick
-- registration (same normalization, preview, idempotency ledger and atomic confirm). Additive only:
--   * source kind 'plate' = {kind, title, saveToLibrary}; quantities = [{itemId (food id), quantity, version (food version)}],
--     1–50 foods, kept in the order the person built the plate (it is the order of the description), 2 decimals
--     (the same rule as composite saved meals, so a saved plate stays registrable);
--   * a food with 0 kcal is admitted inside a plate (black coffee); unknown calories stay unknown and are refused, never 0;
--     unknown macros make the plate's macro unknown (missing != zero); the plate total must still be > 0 kcal;
--   * saveToLibrary also creates a composite saved meal in the same transaction, or nothing at all.
-- Every other kind keeps its exact normalization (and so its request hash).
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
   if jsonb_typeof(q)<>'object' or (select count(*) from jsonb_object_keys(q))<>3 or not q ?& array['itemId','quantity','version']
    or jsonb_typeof(q->'itemId') is distinct from 'string' or (q->>'itemId')::uuid is null
    or jsonb_typeof(q->'version') is distinct from 'string' or coalesce(q->>'version','') !~ '^[a-f0-9]{64}$'
    or jsonb_typeof(q->'quantity') is distinct from 'number' then raise exception using errcode='22023',message='INVALID_QUANTITIES'; end if;
   n:=(q->>'quantity')::numeric;
   if n<=0 or n>1000000 or n<>round(n,2) then raise exception using errcode='22023',message='INVALID_QUANTITIES'; end if;
   qs:=qs||jsonb_build_array(jsonb_build_object('itemId',(q->>'itemId')::uuid,'quantity',n::numeric(12,2),'version',q->>'version'));
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

-- One plate, resolved against the current foods: each food must still be the version the person saw (CAS per food).
create or replace function public.mobile_resolve_plate_occurrence(p_selection jsonb, p_lock boolean default false)
 returns jsonb
 language plpgsql
 set search_path to ''
 set "TimeZone" to 'UTC'
 set lock_timeout to '3s'
 set statement_timeout to '8s'
as $function$
declare u uuid:=(select auth.uid()); sel jsonb; q jsonb; f public.foods; n numeric; factor double precision; scaled jsonb:='[]'::jsonb;
 totals jsonb; calories numeric; protein numeric; carbs numeric; fat numeric; title text; description text;
begin
 if u is null then raise exception using errcode='PT401',message='UNAUTHORIZED'; end if;
 sel:=public.mobile_normalize_quick_selection(p_selection);
 if sel->'source'->>'kind'<>'plate' then raise exception using errcode='22023',message='INVALID_PLATE_SOURCE'; end if;
 -- Locked in id order, so two plates sharing foods never wait on each other in opposite orders.
 if p_lock then
  perform 1 from public.foods where user_id=u and id in (select (value->>'itemId')::uuid from jsonb_array_elements(sel->'quantities')) order by id for share;
 end if;
 for q in select value from jsonb_array_elements(sel->'quantities') loop
  select * into f from public.foods where id=(q->>'itemId')::uuid and user_id=u;
  if f.id is null or not f.is_active then raise exception using errcode='P0421',message='QUICK_SOURCE_UNAVAILABLE'; end if;
  if public.mobile_quick_source_version(to_jsonb(f))<>q->>'version' then raise exception using errcode='P0421',message='QUICK_SOURCE_CHANGED'; end if;
  if f.calories is null or f.calories<0 or f.serving_quantity<=0 then raise exception using errcode='P0421',message='QUICK_SOURCE_UNUSABLE'; end if;
  n:=(q->>'quantity')::numeric; factor:=n::double precision/f.serving_quantity::double precision;
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

create or replace function public.mobile_resolve_quick_occurrence(p_selection jsonb, p_lock boolean DEFAULT false)
 returns jsonb
 language plpgsql
 set search_path to ''
 set "TimeZone" to 'UTC'
 set lock_timeout to '3s'
 set statement_timeout to '8s'
as $function$
declare u uuid := (select auth.uid()); sel jsonb; src jsonb; m public.meal_entries; s public.saved_meals;
 raw_items jsonb; scaled jsonb := '[]'::jsonb; item jsonb; qs jsonb; n numeric; factor numeric; dt date;
 version text; source_date date; saved_json jsonb; meal_json jsonb; today date := (statement_timestamp() at time zone 'America/Argentina/Cordoba')::date;
 title text; description text; calories numeric; protein numeric; carbs numeric; fat numeric; context_type text;
begin
 if u is null then raise exception using errcode='PT401',message='UNAUTHORIZED'; end if;
 sel:=public.mobile_normalize_quick_selection(p_selection); src:=sel->'source'; dt:=(sel->>'date')::date; qs:=sel->'quantities';
 if src->>'kind'='food' then return public.mobile_resolve_food_occurrence(sel,p_lock); end if;
 if src->>'kind'='plate' then return public.mobile_resolve_plate_occurrence(sel,p_lock); end if;
 if src->>'kind'='suggestion' then
  if p_lock then select * into m from public.meal_entries where id=(src->>'id')::uuid and user_id=u for share;
  end if;
  select to_jsonb(mm),d.log_date into meal_json,source_date from public.meal_entries mm join public.day_logs d on d.id=mm.day_log_id and d.user_id=u where mm.id=(src->>'id')::uuid and mm.user_id=u;
  m:=jsonb_populate_record(null::public.meal_entries,meal_json);
  if m.id is null or m.deleted_at is not null or m.entry_kind<>'meal' or m.source_type is distinct from 'manual' then raise exception using errcode='P0421',message='QUICK_SOURCE_UNAVAILABLE'; end if;
  if source_date is null or source_date not between today-60 and today-1 then raise exception using errcode='P0421',message='QUICK_SOURCE_UNAVAILABLE'; end if;
  version:=public.mobile_quick_source_version(jsonb_build_object('meal',to_jsonb(m),'logDate',source_date));
  if version<>src->>'version' then raise exception using errcode='P0421',message='QUICK_SOURCE_CHANGED'; end if;
  title:=m.title; description:=m.description; calories:=m.final_calories; protein:=m.final_protein_g; carbs:=m.final_carbs_g; fat:=m.final_fat_g;
  if coalesce(nullif(btrim(title),''),nullif(btrim(description),'')) is null then raise exception using errcode='P0421',message='QUICK_SOURCE_UNUSABLE'; end if;
 else
  if p_lock then
   select * into s from public.saved_meals where id=(src->>'id')::uuid and user_id=u for share;
   if found then perform 1 from public.saved_meal_items where saved_meal_id=s.id and user_id=u order by position,id for share; end if;
  end if;
  select to_jsonb(ss),c.items into saved_json,raw_items from public.saved_meals ss cross join lateral (
   select coalesce(jsonb_agg(to_jsonb(i) order by i.position,i.id),'[]'::jsonb) items from public.saved_meal_items i where i.saved_meal_id=ss.id and i.user_id=u
  ) c where ss.id=(src->>'id')::uuid and ss.user_id=u;
  s:=jsonb_populate_record(null::public.saved_meals,saved_json);
  if s.id is null or not s.is_active then raise exception using errcode='P0421',message='QUICK_SOURCE_UNAVAILABLE'; end if;
  version:=public.mobile_quick_source_version(jsonb_build_object('saved',to_jsonb(s),'items',raw_items));
  if version<>src->>'version' then raise exception using errcode='P0421',message='QUICK_SOURCE_CHANGED'; end if;
  title:=s.name; description:=s.description; calories:=s.calories; protein:=s.protein_g; carbs:=s.carbs_g; fat:=s.fat_g; context_type:='saved_meal';
  if s.template_type='manual' then
   if qs<>'null'::jsonb or jsonb_array_length(raw_items)<>0 then raise exception using errcode='P0421',message='QUICK_SOURCE_CHANGED'; end if;
  else
   if jsonb_array_length(raw_items) not between 1 and 50 then raise exception using errcode='P0421',message='QUICK_SOURCE_UNUSABLE'; end if;
   if qs<>'null'::jsonb and (jsonb_array_length(qs)<>jsonb_array_length(raw_items)
    or exists(select 1 from jsonb_array_elements(qs) q where not exists(select 1 from jsonb_array_elements(raw_items) i where i->>'id'=q->>'itemId'))) then
    raise exception using errcode='P0421',message='QUICK_SOURCE_CHANGED'; end if;
   for item in select value from jsonb_array_elements(raw_items) loop
    if qs='null'::jsonb then n:=(item->>'quantity')::numeric;
    else select (value->>'quantity')::numeric into n from jsonb_array_elements(qs) where value->>'itemId'=item->>'id'; end if;
    -- Preserve current quantity parser's two-decimal rule; do not silently round
    -- existing higher-precision quantities into another occurrence.
    if n is null or n<=0 or n>1000000 or n<>round(n,2) or (item->>'base_quantity')::numeric<=0 then raise exception using errcode='P0421',message='QUICK_SOURCE_UNUSABLE'; end if;
    factor:=n/(item->>'base_quantity')::numeric;
    scaled:=scaled||jsonb_build_array(jsonb_build_object('id',item->>'id','label',item->>'label','quantity',n,'unit',item->>'unit')||public.saved_meal_scaled_nutrients(item,n));
   end loop;
   select (t->>'calories')::numeric,(t->>'proteinG')::numeric,(t->>'carbsG')::numeric,(t->>'fatG')::numeric
   into calories,protein,carbs,fat from (select public.saved_meal_scaled_totals(scaled) t) totals;
   -- Same first-five ingredient description as savedMealOccurrenceDescription.
   select string_agg(replace(replace(replace(rtrim(rtrim(to_char((value->>'quantity')::numeric,'FM999,999,990.00'),'0'),'.'),',','#'),'.',','),'#','.')||' '||(value->>'unit')||' '||lower(value->>'label'),' · ' order by ordinality)
   into description from jsonb_array_elements(scaled) with ordinality where ordinality<=5;
   if jsonb_array_length(scaled)>5 then description:=description||' · +'||(jsonb_array_length(scaled)-5)::text||' ingredientes'; end if;
  end if;
 end if;
 if calories is null or calories<=0 or calories<>trunc(calories) or calories>2147483647
  or protein<0 or protein>999999.99 or carbs<0 or carbs>99999999.99 or fat<0 or fat>99999999.99 then raise exception using errcode='P0421',message='QUICK_SOURCE_UNUSABLE'; end if;
 -- Match the final meal normalization trigger already used by Web/Mobile.
 title:=nullif(upper(regexp_replace(btrim(title),'\s+',' ','g')),'');
 description:=nullif(upper(regexp_replace(btrim(description),'\s+',' ','g')),'');
 return jsonb_build_object('status','preview','selection',sel,'snapshot',jsonb_build_object('title',title,'description',description,
  'calories',calories::integer,'proteinG',protein,'carbsG',carbs,'fatG',fat,'precision',null,'contextType',context_type,'sourceNote',null),'items',scaled);
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
     (value->>'proteinG')::numeric,(value->>'carbsG')::numeric,(value->>'fatG')::numeric,(value->>'id')::uuid,(ordinality-1)::smallint
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

revoke all on function public.mobile_resolve_plate_occurrence(jsonb,boolean) from public,anon;
grant execute on function public.mobile_resolve_plate_occurrence(jsonb,boolean) to authenticated, service_role;

commit;
