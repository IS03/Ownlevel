-- Cuenta y Ajustes, step 2. EXPAND only: existing daily resolver/snapshots stay intact.
-- Calendar boundaries in Córdoba; endsOn is the next effective_from (exclusive).
begin;

create schema if not exists ownlevel_private;
revoke all on schema ownlevel_private from public, anon;
grant usage on schema ownlevel_private to authenticated;

create table public.nutrition_plan_sequences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80 and btrim(name)=name),
  after_end text not null check (after_end in ('keep_last','maintenance')),
  created_at timestamptz not null default now(),
  unique(id,user_id)
);
create index nutrition_plan_sequences_owner on public.nutrition_plan_sequences(user_id,created_at,id);
alter table public.nutrition_plan_sequences enable row level security;
revoke all on public.nutrition_plan_sequences from public,anon,authenticated;
grant select on public.nutrition_plan_sequences to authenticated;
create policy nutrition_plan_sequences_owner_select on public.nutrition_plan_sequences for select to authenticated
  using ((select auth.uid())=user_id);

alter table public.nutrition_plan_periods
  add column stage_kind text null check (stage_kind in ('maintenance','deficit','surplus','recomposition','custom')),
  add column sequence_id uuid null,
  add column sequence_position smallint null,
  -- Durations are editing metadata, never an end date or a second source for the day engine.
  add column duration_unit text null,
  add column duration_value smallint null,
  add constraint nutrition_stage_sequence_owner foreign key(sequence_id,user_id)
    references public.nutrition_plan_sequences(id,user_id) on delete restrict,
  add constraint nutrition_stage_position check (
    (sequence_id is null and sequence_position is null and duration_unit is null and duration_value is null)
    or (sequence_id is not null and sequence_position is not null and sequence_position between 1 and 25)),
  add constraint nutrition_stage_duration check (
    (duration_unit is null and duration_value is null)
    or (duration_unit is not null and duration_value is not null and
      ((duration_unit='weeks' and duration_value between 1 and 104) or (duration_unit='months' and duration_value between 1 and 24))));
create unique index nutrition_stage_sequence_position on public.nutrition_plan_periods(sequence_id,user_id,sequence_position)
  where sequence_id is not null;

create table ownlevel_private.nutrition_stage_lists (
  user_id uuid primary key references auth.users(id) on delete cascade,
  version bigint not null check (version between 1 and 9007199254740991)
);
alter table ownlevel_private.nutrition_stage_lists enable row level security;
revoke all on ownlevel_private.nutrition_stage_lists from public,anon,authenticated;

-- Existing statement guards already take lock 413 before any plan/weekday row locks.
-- This also invalidates CAS for legacy Web/Mobile saves and direct owner weekday edits.
create function ownlevel_private.nutrition_stage_list_changed()
returns trigger language plpgsql security definer set search_path='' as $$
declare u uuid;
begin
  u:=case when tg_op='DELETE' then old.user_id else new.user_id end;
  -- During auth.users ON DELETE CASCADE the owner no longer exists; do not recreate a version row.
  if not exists(select 1 from auth.users where id=u) then return null; end if;
  insert into ownlevel_private.nutrition_stage_lists(user_id,version) values(u,1)
    on conflict(user_id) do update set version=ownlevel_private.nutrition_stage_lists.version+1;
  return null;
end;
$$;
revoke all on function ownlevel_private.nutrition_stage_list_changed() from public,anon,authenticated;
create trigger nutrition_stage_period_changed after insert or update or delete on public.nutrition_plan_periods
  for each row execute function ownlevel_private.nutrition_stage_list_changed();
create trigger nutrition_stage_weekday_changed after insert or update or delete on public.nutrition_plan_weekdays
  for each row execute function ownlevel_private.nutrition_stage_list_changed();
create trigger nutrition_stage_sequence_changed after insert or update or delete on public.nutrition_plan_sequences
  for each row execute function ownlevel_private.nutrition_stage_list_changed();

create function ownlevel_private.nutrition_stage_json(p public.nutrition_plan_periods, next_start date, today date)
returns jsonb language sql stable set search_path='' as $$
  select jsonb_build_object('id',p.id,'name',p.name,'kind',p.stage_kind,'startsOn',p.effective_from::text,
    'endsOn',next_start::text,'baseWaterL',p.base_water_l,'trainingCalorieDeltaKcal',p.training_calorie_delta_kcal,
    'trainingWaterDeltaL',p.training_water_delta_l,'sequenceId',p.sequence_id,'position',p.sequence_position,
    'duration',case when p.duration_unit is null then null else jsonb_build_object('unit',p.duration_unit,'value',p.duration_value) end,
    'status',case when p.effective_from>today then 'upcoming' when next_start<=today then 'past' else 'current' end,
    'weekdays',(select jsonb_agg(jsonb_build_object('weekday',w.weekday,'calorieTargetKcal',w.calorie_target_kcal,
      'proteinTargetG',w.protein_target_g) order by w.weekday) from public.nutrition_plan_weekdays w where w.plan_id=p.id and w.user_id=p.user_id))
$$;
revoke all on function ownlevel_private.nutrition_stage_json(public.nutrition_plan_periods,date,date) from public,anon,authenticated;

create function ownlevel_private.nutrition_stages_snapshot()
returns jsonb language plpgsql stable security definer set search_path='' set timezone='UTC' as $$
declare u uuid:=auth.uid(); today date:=(statement_timestamp() at time zone 'America/Argentina/Cordoba')::date;
  rows jsonb; expense integer; suggestions jsonb;
begin
  if u is null then raise exception using errcode='PT401',message='UNAUTHORIZED'; end if;
  -- LEAD runs over the whole history BEFORE limiting past stages.
  with periods as (
    select p,lead(p.effective_from) over(order by p.effective_from,p.id) next_start
    from public.nutrition_plan_periods p where p.user_id=u
  ), selected as (
    select * from periods where (p).effective_from>today or next_start>today or next_start is null
    union all
    (select * from periods where next_start<=today order by (p).effective_from desc,(p).id desc limit 24)
  ) select coalesce(jsonb_agg(ownlevel_private.nutrition_stage_json(p,next_start,today) order by (p).effective_from,(p).id),'[]') into rows from selected;
  select estimated_expenditure_kcal into expense from public.resolve_nutrition_context(today);
  if expense>0 then
    suggestions:=jsonb_build_object('expenditureKcal',expense,'maintenance',expense,'deficit',round(expense*0.90),
      'surplus',round(expense*1.05),'recomposition',null,'custom',null);
  end if;
  return jsonb_build_object('today',today::text,
    'listVersion',coalesce((select version from ownlevel_private.nutrition_stage_lists where user_id=u),0),
    'current',(select value from jsonb_array_elements(rows) where value->>'status'='current'),
    'upcoming',(select coalesce(jsonb_agg(value order by value->>'startsOn',value->>'id'),'[]') from jsonb_array_elements(rows) where value->>'status'='upcoming'),
    'past',(select coalesce(jsonb_agg(value order by value->>'startsOn' desc,value->>'id' desc),'[]') from jsonb_array_elements(rows) where value->>'status'='past'),
    'sequences',(select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'afterEnd',s.after_end,'createdAt',s.created_at) order by s.created_at,s.id),'[]')
      from public.nutrition_plan_sequences s where s.user_id=u and exists(select 1 from jsonb_array_elements(rows) r where r->>'sequenceId'=s.id::text)),
    'suggestions',suggestions);
end;
$$;
revoke all on function ownlevel_private.nutrition_stages_snapshot() from public,anon;
grant execute on function ownlevel_private.nutrition_stages_snapshot() to authenticated;
create function public.mobile_read_nutrition_stages() returns jsonb language sql stable security invoker set search_path='' as $$
  select ownlevel_private.nutrition_stages_snapshot()
$$;
revoke all on function public.mobile_read_nutrition_stages() from public,anon;
grant execute on function public.mobile_read_nutrition_stages() to authenticated;

create function ownlevel_private.normalize_stage(s jsonb) returns jsonb
language plpgsql immutable set search_path='' as $$
begin
  if jsonb_typeof(s) is distinct from 'object' or jsonb_typeof(s->'kind') is distinct from 'string'
    or s->>'kind' not in ('maintenance','deficit','surplus','recomposition','custom')
    or char_length(s->>'name')>80 then raise exception using errcode='22023',message='Revisá el tipo y el nombre de la etapa.'; end if;
  return public.mobile_normalize_configuration_fields('plan',s-'kind')||jsonb_build_object('kind',s->'kind');
end;
$$;
revoke all on function ownlevel_private.normalize_stage(jsonb) from public,anon,authenticated;

create function ownlevel_private.stage_next_date(d date, duration jsonb) returns date
language plpgsql immutable set search_path='' as $$
declare n numeric; unit text;
begin
  if jsonb_typeof(duration) is distinct from 'object' or (select count(*) from jsonb_object_keys(duration))<>2
    or not duration ?& array['unit','value'] or jsonb_typeof(duration->'unit') is distinct from 'string'
    or jsonb_typeof(duration->'value') is distinct from 'number' then raise exception using errcode='22023',message='Elegí la duración en semanas o meses.'; end if;
  n:=(duration->>'value')::numeric; unit:=duration->>'unit';
  if n<>trunc(n) or n<1 or unit not in ('weeks','months') or n>(case when unit='weeks' then 104 else 24 end) then
    raise exception using errcode='22023',message='Revisá la duración de la etapa.'; end if;
  return case when unit='weeks' then d+7*n::integer else (d+make_interval(months=>n::integer))::date end;
end;
$$;
revoke all on function ownlevel_private.stage_next_date(date,jsonb) from public,anon,authenticated;

-- Internal write helper. Public entry points validate CAS/idempotency BEFORE reaching it.
create function ownlevel_private.put_nutrition_stage(d date, s jsonb, seq uuid, pos smallint, duration jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); rid uuid;
begin
  if u is null then raise exception using errcode='PT401',message='UNAUTHORIZED'; end if;
  insert into public.nutrition_plan_periods(user_id,effective_from,name,stage_kind,base_water_l,training_calorie_delta_kcal,training_water_delta_l,
    sequence_id,sequence_position,duration_unit,duration_value)
  values(u,d,s->>'name',s->>'kind',(s->>'baseWaterL')::numeric,(s->>'trainingCalorieDeltaKcal')::integer,(s->>'trainingWaterDeltaL')::numeric,
    seq,pos,duration->>'unit',(duration->>'value')::smallint)
  on conflict(user_id,effective_from) do update set name=excluded.name,stage_kind=excluded.stage_kind,base_water_l=excluded.base_water_l,
    training_calorie_delta_kcal=excluded.training_calorie_delta_kcal,training_water_delta_l=excluded.training_water_delta_l,
    sequence_id=excluded.sequence_id,sequence_position=excluded.sequence_position,duration_unit=excluded.duration_unit,duration_value=excluded.duration_value
  returning id into rid;
  insert into public.nutrition_plan_weekdays(plan_id,user_id,weekday,calorie_target_kcal,protein_target_g)
    select rid,u,(w->>'weekday')::smallint,(w->>'calorieTargetKcal')::integer,(w->>'proteinTargetG')::numeric from jsonb_array_elements(s->'weekdays') w
  on conflict(plan_id,weekday) do update set calorie_target_kcal=excluded.calorie_target_kcal,protein_target_g=excluded.protein_target_g;
  return rid;
end;
$$;
revoke all on function ownlevel_private.put_nutrition_stage(date,jsonb,uuid,smallint,jsonb) from public,anon,authenticated;

create function ownlevel_private.replace_plan_from_today(i jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); today date:=(statement_timestamp() at time zone 'America/Argentina/Cordoba')::date; rid uuid;
begin
  if i->>'future_stages'='cancel' then delete from public.nutrition_plan_periods where user_id=u and effective_from>today; end if;
  perform ownlevel_private.put_nutrition_stage(today,i->'stage',null,null,null);
  select id into rid from public.day_logs where user_id=u and log_date=today;
  if rid is not null then perform public.refresh_nutrition_day(rid); end if;
end;
$$;
revoke all on function ownlevel_private.replace_plan_from_today(jsonb) from public,anon,authenticated;

create function ownlevel_private.schedule_plan_sequence(i jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); today date:=(statement_timestamp() at time zone 'America/Argentina/Cordoba')::date;
  cursor_date date:=(i->>'start_date')::date; seq uuid; s jsonb; pos smallint:=0; rid uuid;
begin
  if cursor_date<today then raise exception using errcode='22023',message='La secuencia puede empezar desde hoy.'; end if;
  if cursor_date>(today+interval '10 years')::date then raise exception using errcode='22023',message='Programá hasta diez años por vez.'; end if;
  if exists(select 1 from public.nutrition_plan_periods where user_id=u and effective_from>=cursor_date and effective_from>today) then
    raise exception using errcode='22023',message='Ya tenés etapas programadas desde esa fecha. Revisalas o cortá esa secuencia primero.'; end if;
  insert into public.nutrition_plan_sequences(user_id,name,after_end) values(u,i->>'name',i->>'after_end') returning id into seq;
  for s in select value from jsonb_array_elements(i->'stages') loop
    pos:=pos+1;
    perform ownlevel_private.put_nutrition_stage(cursor_date,s-'duration',seq,pos,s->'duration');
    cursor_date:=ownlevel_private.stage_next_date(cursor_date,s->'duration');
  end loop;
  if cursor_date>(today+interval '10 years')::date then raise exception using errcode='22023',message='Programá hasta diez años por vez.'; end if;
  if i->>'after_end'='maintenance' then
    perform ownlevel_private.put_nutrition_stage(cursor_date,i->'maintenanceStage',seq,(pos+1)::smallint,null);
  end if;
  if (i->>'start_date')::date=today then
    select id into rid from public.day_logs where user_id=u and log_date=today;
    if rid is not null then perform public.refresh_nutrition_day(rid); end if;
  end if;
end;
$$;
revoke all on function ownlevel_private.schedule_plan_sequence(jsonb) from public,anon,authenticated;

-- A duration/start edit reflows only the unstarted tail of its own sequence.
-- Every old tail row is removed before reinsert, avoiding transient date collisions.
-- Any existing day reference or other sequence in the affected interval rejects the whole edit.
create function ownlevel_private.update_future_stage(i jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); today date:=(statement_timestamp() at time zone 'America/Argentina/Cordoba')::date;
  target public.nutrition_plan_periods; row_data jsonb; tail jsonb; cursor_date date:=(i->>'startsOn')::date;
  duration jsonb; s jsonb; new_end date; new_last_start date; previous_start date;
begin
  select * into target from public.nutrition_plan_periods where user_id=u and id=(i->>'stageId')::uuid;
  if not found or target.effective_from<=today or cursor_date<=today then raise exception using errcode='22023',message='Solo podés editar una etapa que todavía no empezó.'; end if;
  if (target.duration_unit is null)<>(i->'duration'='null'::jsonb) then raise exception using errcode='22023',message='Conservá el tipo de duración de esta etapa.'; end if;
  if target.sequence_id is not null and target.duration_unit is null and i->'stage'->>'kind'<>'maintenance' then
    raise exception using errcode='22023',message='Conservá el tipo mantenimiento para el final de la secuencia.'; end if;
  select max(effective_from) into previous_start from public.nutrition_plan_periods where user_id=u and effective_from<target.effective_from;
  if cursor_date<=previous_start then raise exception using errcode='22023',message='La etapa debe empezar después de la anterior.'; end if;
  select jsonb_agg(jsonb_build_object('row',to_jsonb(p),'weekdays',(select jsonb_agg(jsonb_build_object('weekday',w.weekday,'calorieTargetKcal',w.calorie_target_kcal,'proteinTargetG',w.protein_target_g) order by weekday)
    from public.nutrition_plan_weekdays w where w.plan_id=p.id and w.user_id=u)) order by p.effective_from,p.id) into tail
  from public.nutrition_plan_periods p where p.user_id=u and (p.id=target.id or (target.sequence_id is not null and p.sequence_id=target.sequence_id and p.sequence_position>target.sequence_position));
  if exists(select 1 from jsonb_array_elements(tail) t where (t->'row'->>'effective_from')::date<=today)
    or exists(select 1 from public.day_logs d join jsonb_array_elements(tail) t on d.nutrition_plan_period_id=(t->'row'->>'id')::uuid where d.user_id=u) then
    raise exception using errcode='22023',message='Esta etapa ya tiene días guardados. Lo que registraste se conserva.'; end if;
  -- Work out the new last boundary before touching rows.
  new_end:=cursor_date;
  for row_data in select value from jsonb_array_elements(tail) loop
    new_last_start:=new_end;
    duration:=case when row_data->'row'->>'id'=target.id::text then i->'duration' else
      case when row_data->'row'->>'duration_unit' is null then 'null'::jsonb else jsonb_build_object('unit',row_data->'row'->'duration_unit','value',row_data->'row'->'duration_value') end end;
    if duration<>'null'::jsonb then new_end:=ownlevel_private.stage_next_date(new_end,duration); end if;
  end loop;
  if new_end>(today+interval '10 years')::date then raise exception using errcode='22023',message='Programá hasta diez años por vez.'; end if;
  if exists(select 1 from public.nutrition_plan_periods p where p.user_id=u
    and p.effective_from>=least(cursor_date,target.effective_from)
    and p.effective_from<=greatest(new_last_start,(select max((t->'row'->>'effective_from')::date) from jsonb_array_elements(tail) t))
    and not exists(select 1 from jsonb_array_elements(tail) t where t->'row'->>'id'=p.id::text)) then
    raise exception using errcode='22023',message='El cambio se cruza con otras etapas. Revisá la secuencia primero.'; end if;
  delete from public.nutrition_plan_periods p where p.user_id=u and exists(select 1 from jsonb_array_elements(tail) t where t->'row'->>'id'=p.id::text);
  for row_data in select value from jsonb_array_elements(tail) loop
    s:=row_data->'row';
    duration:=case when s->>'id'=target.id::text then i->'duration' else
      case when s->>'duration_unit' is null then 'null'::jsonb else jsonb_build_object('unit',s->'duration_unit','value',s->'duration_value') end end;
    -- Keep ids stable across edits; put helper is used only for creation/upsert of today.
    insert into public.nutrition_plan_periods(id,user_id,effective_from,name,stage_kind,base_water_l,training_calorie_delta_kcal,training_water_delta_l,sequence_id,sequence_position,duration_unit,duration_value,created_at)
      values((s->>'id')::uuid,u,cursor_date,case when s->>'id'=target.id::text then i->'stage'->>'name' else s->>'name' end,
      case when s->>'id'=target.id::text then i->'stage'->>'kind' else s->>'stage_kind' end,
      case when s->>'id'=target.id::text then (i->'stage'->>'baseWaterL')::numeric else (s->>'base_water_l')::numeric end,
      case when s->>'id'=target.id::text then (i->'stage'->>'trainingCalorieDeltaKcal')::integer else (s->>'training_calorie_delta_kcal')::integer end,
      case when s->>'id'=target.id::text then (i->'stage'->>'trainingWaterDeltaL')::numeric else (s->>'training_water_delta_l')::numeric end,
      target.sequence_id,(s->>'sequence_position')::smallint,duration->>'unit',(duration->>'value')::smallint,(s->>'created_at')::timestamptz);
    for s in select value from jsonb_array_elements(case when s->>'id'=target.id::text then i->'stage'->'weekdays' else row_data->'weekdays' end) loop
      insert into public.nutrition_plan_weekdays(plan_id,user_id,weekday,calorie_target_kcal,protein_target_g)
        values((row_data->'row'->>'id')::uuid,u,(s->>'weekday')::smallint,(s->>'calorieTargetKcal')::integer,(s->>'proteinTargetG')::numeric);
    end loop;
    if duration<>'null'::jsonb then cursor_date:=ownlevel_private.stage_next_date(cursor_date,duration); end if;
  end loop;
end;
$$;
revoke all on function ownlevel_private.update_future_stage(jsonb) from public,anon,authenticated;

create function ownlevel_private.delete_future_stage(i jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); target public.nutrition_plan_periods;
begin
  select * into target from public.nutrition_plan_periods where user_id=u and id=(i->>'stageId')::uuid;
  if not found or target.effective_from<=(statement_timestamp() at time zone 'America/Argentina/Cordoba')::date then
    raise exception using errcode='22023',message='Solo podés borrar una etapa que todavía no empezó.'; end if;
  if target.sequence_id is not null and exists(select 1 from public.nutrition_plan_periods where user_id=u and sequence_id=target.sequence_id and sequence_position>target.sequence_position) then
    raise exception using errcode='22023',message='Esta etapa tiene otras después. Borrá desde la última o cortá la secuencia.'; end if;
  delete from public.nutrition_plan_periods where user_id=u and id=target.id;
end;
$$;
revoke all on function ownlevel_private.delete_future_stage(jsonb) from public,anon,authenticated;

create function ownlevel_private.cancel_sequence(i jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();
begin
  if not exists(select 1 from public.nutrition_plan_sequences where user_id=u and id=(i->>'sequenceId')::uuid) then
    raise exception using errcode='22023',message='La secuencia ya no está disponible.'; end if;
  delete from public.nutrition_plan_periods where user_id=u and sequence_id=(i->>'sequenceId')::uuid
    and effective_from>(statement_timestamp() at time zone 'America/Argentina/Cordoba')::date;
end;
$$;
revoke all on function ownlevel_private.cancel_sequence(jsonb) from public,anon,authenticated;

create function ownlevel_private.stage_keys(o jsonb, keys text[]) returns boolean
language sql immutable set search_path='' as $$
  select case when jsonb_typeof(o)='object' then o ?& keys and (select count(*) from jsonb_object_keys(o))=cardinality(keys) else false end
$$;
revoke all on function ownlevel_private.stage_keys(jsonb,text[]) from public,anon,authenticated;
create function ownlevel_private.stage_date(v jsonb) returns date
language plpgsql immutable set search_path='' as $$
declare d date;
begin
  if jsonb_typeof(v) is distinct from 'string' or v#>>'{}' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    raise exception using errcode='22023',message='Revisá la fecha de la etapa.'; end if;
  d:=(v#>>'{}')::date;
  if not isfinite(d) or d::text<>v#>>'{}' then raise exception using errcode='22023',message='Revisá la fecha de la etapa.'; end if;
  return d;
end;
$$;
revoke all on function ownlevel_private.stage_date(jsonb) from public,anon,authenticated;

create function ownlevel_private.normalize_stages_intent(i jsonb) returns jsonb
language plpgsql immutable set search_path='' as $$
declare base text[]:=array['operation','date','expectedListVersion','idempotencyKey']; op text; s jsonb; result jsonb; stages jsonb:='[]';
begin
  if jsonb_typeof(i) is distinct from 'object' or jsonb_typeof(i->'operation') is distinct from 'string'
    or jsonb_typeof(i->'expectedListVersion') is distinct from 'number'
    or (i->>'expectedListVersion')::numeric<>trunc((i->>'expectedListVersion')::numeric)
    or (i->>'expectedListVersion')::numeric not between 0 and 9007199254740991
    or jsonb_typeof(i->'idempotencyKey') is distinct from 'string' or i->>'idempotencyKey' !~ '^[A-Za-z0-9._:-]{1,128}$' then
    raise exception using errcode='22023',message='Revisá los datos antes de guardar.'; end if;
  perform ownlevel_private.stage_date(i->'date');
  op:=i->>'operation'; result:=i;
  if op='replace_from_today' and ownlevel_private.stage_keys(i,base||array['stage','future_stages'])
    and jsonb_typeof(i->'future_stages')='string' and i->>'future_stages' in ('keep','cancel') then
    return i||jsonb_build_object('stage',ownlevel_private.normalize_stage(i->'stage'));
  elsif op='schedule_sequence' and ownlevel_private.stage_keys(i,base||array['name','after_end','start_date','stages','maintenanceStage']) then
    perform ownlevel_private.stage_date(i->'start_date');
    if jsonb_typeof(i->'name') is distinct from 'string' or char_length(btrim(i->>'name')) not between 1 and 80
      or jsonb_typeof(i->'after_end') is distinct from 'string' or i->>'after_end' not in ('keep_last','maintenance')
      or jsonb_typeof(i->'stages') is distinct from 'array' then raise exception using errcode='22023',message='Revisá el nombre y las etapas de la secuencia.'; end if;
    if jsonb_array_length(i->'stages') not between 1 and 24 then raise exception using errcode='22023',message='Agregá entre una y 24 etapas.'; end if;
    for s in select value from jsonb_array_elements(i->'stages') loop
      perform ownlevel_private.stage_next_date(date '2000-01-01',s->'duration');
      stages:=stages||jsonb_build_array(ownlevel_private.normalize_stage(s-'duration')||jsonb_build_object('duration',s->'duration'));
    end loop;
    if i->>'after_end'='maintenance' then
      s:=ownlevel_private.normalize_stage(i->'maintenanceStage');
      if s->>'kind'<>'maintenance' then raise exception using errcode='22023',message='Elegí los objetivos del mantenimiento final.'; end if;
    elsif i->'maintenanceStage'<>'null'::jsonb then raise exception using errcode='22023',message='Revisá qué pasa al terminar la secuencia.';
    else s:='null'; end if;
    return i||jsonb_build_object('name',btrim(i->>'name'),'stages',stages,'maintenanceStage',s);
  elsif op='update_future' and ownlevel_private.stage_keys(i,base||array['stageId','stage','startsOn','duration']) then
    perform ownlevel_private.stage_date(i->'startsOn');
    if i->'duration'<>'null'::jsonb then perform ownlevel_private.stage_next_date(date '2000-01-01',i->'duration'); end if;
    result:=i||jsonb_build_object('stage',ownlevel_private.normalize_stage(i->'stage'));
  elsif op='delete_future' and ownlevel_private.stage_keys(i,base||array['stageId']) then null;
  elsif op='cancel_sequence' and ownlevel_private.stage_keys(i,base||array['sequenceId']) then null;
  else raise exception using errcode='22023',message='Revisá los datos antes de guardar.'; end if;
  s:=case when op='cancel_sequence' then i->'sequenceId' else i->'stageId' end;
  if jsonb_typeof(s) is distinct from 'string' or s#>>'{}' !~* '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' then
    raise exception using errcode='22023',message='La etapa o secuencia no está disponible.'; end if;
  return result;
end;
$$;
revoke all on function ownlevel_private.normalize_stages_intent(jsonb) from public,anon,authenticated;

create function ownlevel_private.mutate_nutrition_stages(p_intent jsonb)
returns table(response_status smallint,response_body jsonb,replayed boolean)
language plpgsql security definer set search_path='' set timezone='UTC' set lock_timeout='3s' set statement_timeout='8s' as $$
declare u uuid:=auth.uid(); today date:=(statement_timestamp() at time zone 'America/Argentina/Cordoba')::date;
  i jsonb; request_hash text; ledger public.mobile_idempotency_keys; result jsonb; code smallint; conflict_code text; message text;
begin
  if u is null then raise exception using errcode='PT401',message='UNAUTHORIZED'; end if;
  i:=ownlevel_private.normalize_stages_intent(p_intent);
  request_hash:=public.mobile_quick_source_version(i-'idempotencyKey');
  -- Same order as mobile_mutate_nutrition_configuration: ledger mutex 412 -> plan mutex 413 -> rows.
  perform pg_advisory_xact_lock(hashtextextended(u::text,412));
  perform pg_advisory_xact_lock(hashtextextended(u::text,413));
  insert into public.mobile_idempotency_keys(user_id,operation,idempotency_key,request_hash,expires_at)
    values(u,'nutrition.stages.v1',i->>'idempotencyKey',request_hash,'infinity') on conflict(user_id,operation,idempotency_key) do nothing;
  select * into ledger from public.mobile_idempotency_keys where user_id=u and operation='nutrition.stages.v1' and idempotency_key=i->>'idempotencyKey' for update;
  if ledger.request_hash<>request_hash then
    return query select 409::smallint,jsonb_build_object('status','conflict','error','IDEMPOTENCY_KEY_REUSED',
      'message','Este guardado ya se usó con otros datos. Revisá tus etapas.','list',ownlevel_private.nutrition_stages_snapshot()),false; return;
  end if;
  -- Receipt replay precedes date/CAS, including after midnight or a later source edit.
  if ledger.state='completed' then return query select ledger.response_status,ledger.response_body,true; return; end if;
  if i->>'date'<>today::text then conflict_code:='STAGES_DAY_CHANGED';
  elsif (i->>'expectedListVersion')::bigint<>coalesce((select version from ownlevel_private.nutrition_stage_lists where user_id=u),0) then conflict_code:='STAGES_CHANGED'; end if;
  if conflict_code is not null then
    code:=409; result:=jsonb_build_object('status','conflict','error',conflict_code,'message',
      case when conflict_code='STAGES_DAY_CHANGED' then 'Cambió el día. Revisá desde cuándo empieza el plan.' else 'Tus etapas cambiaron. Revisá la lista antes de guardar.' end,
      'list',ownlevel_private.nutrition_stages_snapshot());
  else
    begin
      case i->>'operation'
        when 'replace_from_today' then perform ownlevel_private.replace_plan_from_today(i);
        when 'schedule_sequence' then perform ownlevel_private.schedule_plan_sequence(i);
        when 'update_future' then perform ownlevel_private.update_future_stage(i);
        when 'delete_future' then perform ownlevel_private.delete_future_stage(i);
        when 'cancel_sequence' then perform ownlevel_private.cancel_sequence(i);
      end case;
      if (select count(*) from public.nutrition_plan_periods where user_id=u and effective_from>today)>120 then
        raise exception using errcode='22023',message='Podés tener hasta 120 etapas programadas. Revisá las que ya tenés.'; end if;
      code:=200; result:=jsonb_build_object('status','confirmed','operation',i->>'operation','date',today::text,'list',ownlevel_private.nutrition_stages_snapshot());
    exception when sqlstate '22023' or foreign_key_violation then
      get stacked diagnostics message=message_text;
      code:=400; result:=jsonb_build_object('status','validation','message',case when sqlstate='23503' then 'Esta etapa tiene días guardados. Lo que registraste se conserva.' else message end);
    end;
  end if;
  update public.mobile_idempotency_keys set state='completed',response_status=code,response_body=result,
    resource_type='nutrition-stages',completed_at=clock_timestamp()
    where user_id=u and operation='nutrition.stages.v1' and idempotency_key=i->>'idempotencyKey';
  return query select code,result,false;
end;
$$;
revoke all on function ownlevel_private.mutate_nutrition_stages(jsonb) from public,anon;
grant execute on function ownlevel_private.mutate_nutrition_stages(jsonb) to authenticated;
create function public.mobile_mutate_nutrition_stages(p_intent jsonb)
returns table(response_status smallint,response_body jsonb,replayed boolean)
language sql security invoker set search_path='' as $$ select * from ownlevel_private.mutate_nutrition_stages(p_intent) $$;
revoke all on function public.mobile_mutate_nutrition_stages(jsonb) from public,anon;
grant execute on function public.mobile_mutate_nutrition_stages(jsonb) to authenticated;

-- LEGACY COMPATIBILITY: same save signature/body, only clears the new metadata on today's upsert.
create or replace function public.save_nutrition_plan_v2(
  p_name text,
  p_base_water_l numeric,
  p_training_calorie_delta_kcal integer,
  p_training_water_delta_l numeric,
  p_weekdays jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_today date := (pg_catalog.now() at time zone 'America/Argentina/Cordoba')::date;
  v_plan_id uuid;
  v_day_log_id uuid;
begin
  if v_user_id is null then raise exception 'not_authenticated'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text,413));
  if nullif(pg_catalog.btrim(p_name), '') is null then raise exception 'invalid_plan_name'; end if;
  if pg_catalog.jsonb_typeof(p_weekdays) <> 'array'
    or pg_catalog.jsonb_array_length(p_weekdays) <> 7 then
    raise exception 'invalid_weekdays';
  end if;
  if (
    select pg_catalog.count(distinct x.weekday)
    from pg_catalog.jsonb_to_recordset(p_weekdays) as x(weekday smallint, calorie_target_kcal integer, protein_target_g numeric)
    where x.weekday between 1 and 7
  ) <> 7 then
    raise exception 'invalid_weekdays';
  end if;

  insert into public.nutrition_plan_periods (
    user_id, effective_from, name, base_water_l,
    training_calorie_delta_kcal, training_water_delta_l
  ) values (
    v_user_id, v_today, pg_catalog.btrim(p_name), p_base_water_l,
    p_training_calorie_delta_kcal, p_training_water_delta_l
  )
  on conflict (user_id, effective_from) do update set
    name = excluded.name,
    base_water_l = excluded.base_water_l,
    training_calorie_delta_kcal = excluded.training_calorie_delta_kcal,
    training_water_delta_l = excluded.training_water_delta_l,
    stage_kind = null, sequence_id = null, sequence_position = null,
    duration_unit = null, duration_value = null
  returning id into v_plan_id;

  insert into public.nutrition_plan_weekdays (
    plan_id, user_id, weekday, calorie_target_kcal, protein_target_g
  )
  select v_plan_id, v_user_id, x.weekday, x.calorie_target_kcal, x.protein_target_g
  from pg_catalog.jsonb_to_recordset(p_weekdays) as x(
    weekday smallint, calorie_target_kcal integer, protein_target_g numeric
  )
  on conflict (plan_id, weekday) do update set
    calorie_target_kcal = excluded.calorie_target_kcal,
    protein_target_g = excluded.protein_target_g;

  select d.id into v_day_log_id from public.day_logs d
  where d.user_id = v_user_id and d.log_date = v_today;
  if v_day_log_id is not null then perform public.refresh_nutrition_day(v_day_log_id); end if;
  return v_plan_id;
end;
$$;

commit;
