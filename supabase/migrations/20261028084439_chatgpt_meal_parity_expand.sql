-- QA #307/#308 (EXPAND, additive, no data changes).
-- * Meals that came from ChatGPT are edited and deleted with the same Mobile RPC, CAS, idempotency and soft delete as
--   manual ones. Their origin stays 'chatgpt' internally; nothing else changes for other origins.
-- * ChatGPT can send an explicit time and meal type. Without a time, the registration moment keeps ordering the day
--   but is flagged as not reported (originalTimeKnown=false), exactly like imported meals; setting a time from the
--   app clears that flag. Existing rows are not rewritten.
-- * The current RPCs keep their signatures (deployed servers keep working) and delegate to the new _v2 versions.
begin;

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
      if meal.deleted_at is not null or meal.entry_kind<>'meal' or coalesce(meal.source_type,'') not in ('manual','chatgpt') then
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
      update public.meal_entries set meal_label=case when f ? 'mealLabel' then f->>'mealLabel' else meal.meal_label end,consumed_at=case when f ? 'consumedAt' then (f->>'consumedAt')::timestamptz else meal.consumed_at end,
        raw_input=case when f ? 'consumedAt' and meal.source_type='chatgpt' and meal.raw_input is not null then nullif((meal.raw_input::jsonb-'originalTimeKnown')::text,'{}') else meal.raw_input end,day_log_id=day.id,title=v_title,description=v_description,final_calories=(f->>'calories')::integer,
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

create or replace function public.create_chatgpt_meal_for_integration_v2(
  p_user_id uuid,
  p_log_date date,
  p_title text,
  p_description text,
  p_calories integer,
  p_protein_g numeric,
  p_carbs_g numeric,
  p_fat_g numeric,
  p_idempotency_key text,
  p_force_duplicate boolean default false,
  p_consumed_at timestamptz default null,
  p_meal_label text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_previous_sub text := current_setting('request.jwt.claim.sub', true);
  v_day public.day_logs;
  v_meal public.meal_entries;
  v_created boolean := false;
  v_title_normalized text;
  v_description_normalized text;
begin
  if p_user_id is null or p_log_date is null then
    raise exception 'invalid_request';
  end if;
  -- An explicit time belongs to the logged local day (Córdoba), midnight included; a type is one of the app's.
  if p_consumed_at is not null and (not isfinite(p_consumed_at)
      or (p_consumed_at at time zone 'America/Argentina/Cordoba')::date <> p_log_date) then
    raise exception 'invalid_request';
  end if;
  if p_meal_label is not null and p_meal_label not in ('breakfast', 'lunch', 'snack', 'dinner', 'extra') then
    raise exception 'invalid_request';
  end if;

  -- El rol service_role es el único caller autorizado. El claim sólo vive en
  -- esta transacción y permite reutilizar las funciones canónicas auth.uid().
  perform set_config('request.jwt.claim.sub', p_user_id::text, true);

  select m.* into v_meal
  from public.meal_entries m
  where m.user_id = p_user_id
    and m.idempotency_key = p_idempotency_key;

  if found then
    select d.* into v_day
    from public.day_logs d
    where d.id = v_meal.day_log_id
      and d.user_id = p_user_id;
  else
    v_day := public.get_or_create_day_log(p_log_date);
    v_title_normalized := upper(regexp_replace(btrim(p_title), '\s+', ' ', 'g'));
    v_description_normalized := case
      when nullif(btrim(p_description), '') is null then null
      else upper(regexp_replace(btrim(p_description), '\s+', ' ', 'g'))
    end;

    if not p_force_duplicate and exists (
      select 1
      from public.meal_entries m
      where m.user_id = p_user_id
        and m.day_log_id = v_day.id
        and m.deleted_at is null
        and m.created_at >= now() - interval '60 seconds'
        and m.final_calories = p_calories
        and (
          (m.final_protein_g is null and p_protein_g is null)
          or (m.final_protein_g is not null and p_protein_g is not null
              and abs(m.final_protein_g - p_protein_g) <= 0.01)
        )
        and (
          (m.final_carbs_g is null and p_carbs_g is null)
          or (m.final_carbs_g is not null and p_carbs_g is not null
              and abs(m.final_carbs_g - p_carbs_g) <= 0.01)
        )
        and (
          (m.final_fat_g is null and p_fat_g is null)
          or (m.final_fat_g is not null and p_fat_g is not null
              and abs(m.final_fat_g - p_fat_g) <= 0.01)
        )
        and (
          (
            v_title_normalized is not null
            and upper(regexp_replace(btrim(m.title), '\s+', ' ', 'g')) = v_title_normalized
          )
          or (
            v_description_normalized is not null
            and upper(regexp_replace(btrim(m.description), '\s+', ' ', 'g')) = v_description_normalized
          )
        )
    ) then
      raise exception 'possible_duplicate';
    end if;

    begin
      insert into public.meal_entries (
        user_id,
        day_log_id,
        consumed_at,
        title,
        description,
        final_calories,
        final_protein_g,
        final_carbs_g,
        final_fat_g,
        source_type,
        entry_kind,
        idempotency_key,
        meal_label,
        raw_input
      ) values (
        p_user_id,
        v_day.id,
        coalesce(p_consumed_at, now()),
        p_title,
        p_description,
        p_calories,
        p_protein_g,
        p_carbs_g,
        p_fat_g,
        'chatgpt',
        'meal',
        p_idempotency_key,
        p_meal_label,
        -- Without a time the registration moment only orders the day: it is never shown as a confirmed time.
        case when p_consumed_at is null then '{"originalTimeKnown":false}' end
      )
      returning * into v_meal;
      v_created := true;
    exception when unique_violation then
      select m.* into v_meal
      from public.meal_entries m
      where m.user_id = p_user_id
        and m.idempotency_key = p_idempotency_key;
      if not found then raise; end if;
    end;

    select d.* into v_day
    from public.day_logs d
    where d.id = v_meal.day_log_id;
  end if;

  perform set_config('request.jwt.claim.sub', coalesce(v_previous_sub, ''), true);

  return jsonb_build_object(
    'ok', true,
    'created', v_created,
    'idempotent_replay', not v_created,
    'meal', jsonb_build_object(
      'id', v_meal.id,
      'date', v_day.log_date,
      'title', v_meal.title,
      'calories', v_meal.final_calories,
      'protein_g', v_meal.final_protein_g,
      'carbs_g', v_meal.final_carbs_g,
      'fat_g', v_meal.final_fat_g
    ),
    'day', jsonb_build_object(
      'total_calories', v_day.total_calories_consumed,
      'total_protein_g', v_day.total_protein_g,
      'total_carbs_g', v_day.total_carbs_g,
      'total_fat_g', v_day.total_fat_g,
      'target_calories', v_day.nutrition_target_kcal_snapshot,
      'target_protein_g', v_day.protein_target_g_snapshot
    )
  );
end;
$$;

revoke all on function public.create_chatgpt_meal_for_integration_v2(uuid, date, text, text, integer, numeric, numeric, numeric, text, boolean, timestamptz, text) from public, anon, authenticated;
grant execute on function public.create_chatgpt_meal_for_integration_v2(uuid, date, text, text, integer, numeric, numeric, numeric, text, boolean, timestamptz, text) to service_role;

create or replace function public.create_chatgpt_meal_for_integration(
  p_user_id uuid, p_log_date date, p_title text, p_description text, p_calories integer,
  p_protein_g numeric, p_carbs_g numeric, p_fat_g numeric, p_idempotency_key text, p_force_duplicate boolean default false
) returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  return public.create_chatgpt_meal_for_integration_v2(
    p_user_id, p_log_date, p_title, p_description, p_calories, p_protein_g, p_carbs_g, p_fat_g,
    p_idempotency_key, p_force_duplicate, null, null
  );
end;
$$;

create or replace function public.create_chatgpt_meal_for_oauth_v2(
  p_user_id uuid, p_client_id uuid, p_session_id uuid, p_grant_id uuid, p_resource text,
  p_log_date date, p_title text, p_description text, p_calories integer,
  p_protein_g numeric, p_carbs_g numeric, p_fat_g numeric,
  p_idempotency_key text, p_force_duplicate boolean default false,
  p_consumed_at timestamptz default null, p_meal_label text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  -- Same checks and lock order as create_chatgpt_meal_for_oauth.
  perform 1 from ownlevel_integrations.oauth_clients
    where client_id = p_client_id for share;
  perform 1 from ownlevel_integrations.oauth_grants
    where user_id = p_user_id and client_id = p_client_id for share;
  if not public.ownlevel_oauth_access_allowed(
    p_user_id, p_client_id, p_session_id, p_grant_id, p_resource
  ) then raise exception 'oauth_permission_denied' using errcode = '42501'; end if;
  return public.create_chatgpt_meal_for_integration_v2(
    p_user_id, p_log_date, p_title, p_description, p_calories,
    p_protein_g, p_carbs_g, p_fat_g, p_idempotency_key, p_force_duplicate, p_consumed_at, p_meal_label
  );
end;
$$;

revoke all on function public.create_chatgpt_meal_for_oauth_v2(uuid,uuid,uuid,uuid,text,date,text,text,integer,numeric,numeric,numeric,text,boolean,timestamptz,text) from public, anon, authenticated;
grant execute on function public.create_chatgpt_meal_for_oauth_v2(uuid,uuid,uuid,uuid,text,date,text,text,integer,numeric,numeric,numeric,text,boolean,timestamptz,text) to service_role;

commit;
