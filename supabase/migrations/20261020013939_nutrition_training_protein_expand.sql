-- Training extra on the goals the plan has (calories AND protein); water leaves the plan. EXPAND only.
-- Opt-in shape v2 for Mobile (`?targets=2`): every v1 read, write, receipt and ledger keeps its exact form.
-- See docs/mobile/nutrition-training-extra-api.md.
begin;

alter table public.nutrition_plan_periods
  add column training_protein_delta_g numeric(6,2) not null default 0,
  add constraint nutrition_plan_periods_training_protein_range check (training_protein_delta_g between 0 and 1000),
  -- null = this plan has no water goal of its own (the Agua metric keeps it). Never read as 0.
  alter column base_water_l drop not null;

-- Same resolver as 20260909180000, two changes: protein gets the training extra; a plan without water uses
-- the active Agua metric goal. Past resolved days keep returning their snapshots untouched.
create or replace function public.resolve_nutrition_context(p_log_date date)
returns table (
  day_log_id uuid,
  work_effective boolean,
  gym_effective boolean,
  work_source text,
  gym_source text,
  work_schedule_period_id uuid,
  nutrition_goal_period_id uuid,
  expenditure_rule_period_id uuid,
  nutrition_target_kcal integer,
  protein_target_g numeric,
  water_target_l numeric,
  estimated_expenditure_kcal integer,
  total_calories_consumed integer,
  total_protein_g numeric,
  total_carbs_g numeric,
  total_fat_g numeric,
  water_l numeric,
  mate_l numeric,
  steps integer,
  delta_vs_nutrition_target integer,
  energy_balance_kcal integer
)
language plpgsql
security invoker
stable
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_today date := (pg_catalog.now() at time zone 'America/Argentina/Cordoba')::date;
  v_day public.day_logs;
  v_schedule public.work_schedule_periods;
  v_goal public.nutrition_goal_periods;
  v_expenditure public.expenditure_rule_periods;
  v_plan public.nutrition_plan_periods;
  v_plan_day public.nutrition_plan_weekdays;
  v_energy public.energy_config_periods;
  v_profile public.profiles;
  v_work boolean;
  v_completed_training boolean := false;
  v_legacy_gym boolean := false;
  v_gym boolean := false;
  v_work_source text;
  v_gym_source text := 'none';
  v_target integer;
  v_protein numeric;
  v_water numeric;
  v_estimated_expenditure integer;
  v_total_calories integer := 0;
  v_total_protein numeric := 0;
  v_total_carbs numeric := 0;
  v_total_fat numeric := 0;
  v_bmr integer;
  v_automatic_base integer;
  v_base_used integer;
begin
  if v_user_id is null then raise exception 'not_authenticated'; end if;

  select d.* into v_day from public.day_logs d
  where d.user_id = v_user_id and d.log_date = p_log_date;

  if v_day.id is not null and p_log_date < v_today and v_day.nutrition_resolved_at is not null then
    v_target := coalesce(
      v_day.nutrition_target_override_kcal,
      v_day.nutrition_target_automatic_kcal_snapshot,
      v_day.nutrition_target_kcal_snapshot
    );
    v_estimated_expenditure := coalesce(
      v_day.expenditure_override_kcal,
      v_day.estimated_expenditure_automatic_kcal_snapshot,
      v_day.estimated_expenditure_kcal_snapshot
    );
    return query select
      v_day.id, v_day.work_effective_snapshot, coalesce(v_day.gym_effective_snapshot, false),
      v_day.work_source_snapshot, coalesce(v_day.gym_source_snapshot, 'none'),
      v_day.work_schedule_period_id, v_day.nutrition_goal_period_id, v_day.expenditure_rule_period_id,
      v_target, v_day.protein_target_g_snapshot,
      v_day.water_target_l_snapshot, v_estimated_expenditure,
      v_day.total_calories_consumed, v_day.total_protein_g, v_day.total_carbs_g, v_day.total_fat_g,
      v_day.water_l, v_day.mate_l, v_day.steps,
      case when v_target is null then null else v_day.total_calories_consumed - v_target end,
      case when v_estimated_expenditure is null then null else v_day.total_calories_consumed - v_estimated_expenditure end;
    return;
  end if;

  select p.* into v_schedule from public.work_schedule_periods p
  where p.user_id = v_user_id and p.effective_from <= p_log_date
  order by p.effective_from desc limit 1;

  if v_day.id is not null and v_day.work_override is not null then
    v_work := v_day.work_override; v_work_source := 'override';
  elsif v_schedule.id is not null then
    v_work := case pg_catalog.date_part('isodow', p_log_date)::integer
      when 1 then v_schedule.monday when 2 then v_schedule.tuesday
      when 3 then v_schedule.wednesday when 4 then v_schedule.thursday
      when 5 then v_schedule.friday when 6 then v_schedule.saturday
      when 7 then v_schedule.sunday end;
    v_work_source := 'schedule';
  end if;

  if v_day.id is not null then
    select exists (
      select 1 from public.workout_sessions s
      where s.user_id = v_user_id and s.day_log_id = v_day.id and s.status = 'completed'
    ) into v_completed_training;
  end if;
  if v_completed_training then
    v_legacy_gym := true; v_gym_source := 'workout';
  elsif v_day.id is not null and v_day.gym_override is true then
    v_legacy_gym := true; v_gym_source := 'override';
  end if;

  select p.* into v_plan from public.nutrition_plan_periods p
  where p.user_id = v_user_id and p.effective_from <= p_log_date
  order by p.effective_from desc limit 1;
  if v_plan.id is not null then
    select w.* into v_plan_day from public.nutrition_plan_weekdays w
    where w.plan_id = v_plan.id and w.user_id = v_user_id
      and w.weekday = pg_catalog.date_part('isodow', p_log_date)::integer;
    if v_plan_day.id is not null then
      v_target := v_plan_day.calorie_target_kcal
        + case when v_completed_training then v_plan.training_calorie_delta_kcal else 0 end;
      -- The training extra only raises a goal that exists: a missing protein target stays missing.
      v_protein := v_plan_day.protein_target_g
        + case when v_completed_training then v_plan.training_protein_delta_g else 0 end;
      if v_plan.base_water_l is not null then
        v_water := v_plan.base_water_l
          + case when v_completed_training then v_plan.training_water_delta_l else 0 end;
      else
        -- A stage without its own water leaves the goal to the Agua metric. Out of the snapshot's range: no goal.
        select m.target_value into v_water from public.user_metrics m
        where m.user_id = v_user_id and m.system_key = 'water' and m.is_active and m.archived_at is null;
        v_water := case when v_water between 0 and 50 then pg_catalog.round(v_water, 2) end;
      end if;
    end if;
  else
    select p.* into v_goal from public.nutrition_goal_periods p
    where p.user_id = v_user_id and p.effective_from <= p_log_date
    order by p.effective_from desc limit 1;
    if v_goal.id is not null then
      if v_legacy_gym then
        v_target := v_goal.calories_gym; v_protein := v_goal.protein_gym_g; v_water := v_goal.water_gym_l;
      else
        v_target := v_goal.calories_no_gym; v_protein := v_goal.protein_no_gym_g; v_water := v_goal.water_no_gym_l;
      end if;
    end if;
  end if;
  if v_day.id is not null and v_day.nutrition_target_override_kcal is not null then
    v_target := v_day.nutrition_target_override_kcal;
  end if;

  select p.* into v_energy from public.energy_config_periods p
  where p.user_id = v_user_id and p.effective_from <= p_log_date
  order by p.effective_from desc limit 1;
  if v_energy.id is not null then
    if v_day.id is not null then v_bmr := v_day.bmr_kcal_snapshot; end if;
    if v_bmr is null then
      select p.* into v_profile from public.profiles p where p.user_id = v_user_id;
      v_bmr := v_profile.bmr_kcal_current;
    end if;
    if v_bmr is not null then
      v_automatic_base := pg_catalog.round(v_bmr * v_energy.activity_factor);
      v_base_used := case
        when v_energy.base_expenditure_mode = 'custom' then v_energy.custom_base_expenditure_kcal
        else v_automatic_base
      end;
      v_estimated_expenditure := v_base_used
        + case when v_completed_training then v_energy.training_expenditure_delta_kcal else 0 end;
    end if;
  else
    select p.* into v_expenditure from public.expenditure_rule_periods p
    where p.user_id = v_user_id and p.effective_from <= p_log_date
    order by p.effective_from desc limit 1;
    if v_expenditure.id is not null and v_work is not null then
      v_estimated_expenditure := case
        when v_work and v_legacy_gym then v_expenditure.work_gym_kcal
        when v_work and not v_legacy_gym then v_expenditure.work_no_gym_kcal
        when not v_work and v_legacy_gym then v_expenditure.no_work_gym_kcal
        else v_expenditure.no_work_no_gym_kcal end;
    end if;
  end if;
  if v_day.id is not null and v_day.expenditure_override_kcal is not null then
    v_estimated_expenditure := v_day.expenditure_override_kcal;
  end if;

  v_gym := case when v_plan.id is not null or v_energy.id is not null
    then v_completed_training else v_legacy_gym end;
  if v_gym then v_gym_source := 'workout';
  elsif v_plan.id is not null or v_energy.id is not null then v_gym_source := 'none'; end if;

  if v_day.id is not null then
    v_total_calories := v_day.total_calories_consumed;
    v_total_protein := v_day.total_protein_g;
    v_total_carbs := v_day.total_carbs_g;
    v_total_fat := v_day.total_fat_g;
  end if;

  return query select
    v_day.id, v_work, v_gym, v_work_source, v_gym_source, v_schedule.id,
    case when v_plan.id is null then v_goal.id else null end,
    case when v_energy.id is null then v_expenditure.id else null end,
    v_target, v_protein, v_water, v_estimated_expenditure,
    v_total_calories, v_total_protein, v_total_carbs, v_total_fat,
    v_day.water_l, v_day.mate_l, v_day.steps,
    case when v_target is null then null else v_total_calories - v_target end,
    case when v_estimated_expenditure is null then null else v_total_calories - v_estimated_expenditure end;
end;
$$;

create or replace function ownlevel_private.put_nutrition_stage(d date, s jsonb, seq uuid, pos smallint, duration jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); rid uuid; has_protein boolean:=s ? 'trainingProteinDeltaG';
begin
  if u is null then raise exception using errcode='PT401',message='UNAUTHORIZED'; end if;
  insert into public.nutrition_plan_periods(user_id,effective_from,name,stage_kind,base_water_l,training_calorie_delta_kcal,training_water_delta_l,
    training_protein_delta_g,sequence_id,sequence_position,duration_unit,duration_value)
  values(u,d,s->>'name',s->>'kind',(s->>'baseWaterL')::numeric,(s->>'trainingCalorieDeltaKcal')::integer,(s->>'trainingWaterDeltaL')::numeric,
    coalesce((s->>'trainingProteinDeltaG')::numeric,0),seq,pos,duration->>'unit',(duration->>'value')::smallint)
  on conflict(user_id,effective_from) do update set name=excluded.name,stage_kind=excluded.stage_kind,base_water_l=excluded.base_water_l,
    training_calorie_delta_kcal=excluded.training_calorie_delta_kcal,training_water_delta_l=excluded.training_water_delta_l,
    -- A v1 intent does not know the protein extra: it keeps the stored one instead of erasing it.
    training_protein_delta_g=case when has_protein then excluded.training_protein_delta_g else public.nutrition_plan_periods.training_protein_delta_g end,
    sequence_id=excluded.sequence_id,sequence_position=excluded.sequence_position,duration_unit=excluded.duration_unit,duration_value=excluded.duration_value
  returning id into rid;
  insert into public.nutrition_plan_weekdays(plan_id,user_id,weekday,calorie_target_kcal,protein_target_g)
    select rid,u,(w->>'weekday')::smallint,(w->>'calorieTargetKcal')::integer,(w->>'proteinTargetG')::numeric from jsonb_array_elements(s->'weekdays') w
  on conflict(plan_id,weekday) do update set calorie_target_kcal=excluded.calorie_target_kcal,protein_target_g=excluded.protein_target_g;
  return rid;
end;
$$;

create or replace function ownlevel_private.update_future_stage(i jsonb) returns void
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
    insert into public.nutrition_plan_periods(id,user_id,effective_from,name,stage_kind,base_water_l,training_calorie_delta_kcal,training_water_delta_l,training_protein_delta_g,sequence_id,sequence_position,duration_unit,duration_value,created_at)
      values((s->>'id')::uuid,u,cursor_date,case when s->>'id'=target.id::text then i->'stage'->>'name' else s->>'name' end,
      case when s->>'id'=target.id::text then i->'stage'->>'kind' else s->>'stage_kind' end,
      case when s->>'id'=target.id::text then (i->'stage'->>'baseWaterL')::numeric else (s->>'base_water_l')::numeric end,
      case when s->>'id'=target.id::text then (i->'stage'->>'trainingCalorieDeltaKcal')::integer else (s->>'training_calorie_delta_kcal')::integer end,
      case when s->>'id'=target.id::text then (i->'stage'->>'trainingWaterDeltaL')::numeric else (s->>'training_water_delta_l')::numeric end,
      case when s->>'id'=target.id::text and i->'stage' ? 'trainingProteinDeltaG' then (i->'stage'->>'trainingProteinDeltaG')::numeric else (s->>'training_protein_delta_g')::numeric end,
      target.sequence_id,(s->>'sequence_position')::smallint,duration->>'unit',(duration->>'value')::smallint,(s->>'created_at')::timestamptz);
    for s in select value from jsonb_array_elements(case when s->>'id'=target.id::text then i->'stage'->'weekdays' else row_data->'weekdays' end) loop
      insert into public.nutrition_plan_weekdays(plan_id,user_id,weekday,calorie_target_kcal,protein_target_g)
        values((row_data->'row'->>'id')::uuid,u,(s->>'weekday')::smallint,(s->>'calorieTargetKcal')::integer,(s->>'proteinTargetG')::numeric);
    end loop;
    if duration<>'null'::jsonb then cursor_date:=ownlevel_private.stage_next_date(cursor_date,duration); end if;
  end loop;
end;
$$;

create function ownlevel_private.nutrition_stage_json(p public.nutrition_plan_periods, next_start date, today date, v2 boolean)
returns jsonb language sql stable set search_path='' as $$
  select jsonb_build_object('id',p.id,'name',p.name,'kind',p.stage_kind,'startsOn',p.effective_from::text,
    'endsOn',next_start::text,'baseWaterL',p.base_water_l,'trainingCalorieDeltaKcal',p.training_calorie_delta_kcal,
    'trainingWaterDeltaL',p.training_water_delta_l,'sequenceId',p.sequence_id,'position',p.sequence_position,
    'duration',case when p.duration_unit is null then null else jsonb_build_object('unit',p.duration_unit,'value',p.duration_value) end,
    'status',case when p.effective_from>today then 'upcoming' when next_start<=today then 'past' else 'current' end,
    'weekdays',(select jsonb_agg(jsonb_build_object('weekday',w.weekday,'calorieTargetKcal',w.calorie_target_kcal,
      'proteinTargetG',w.protein_target_g) order by w.weekday) from public.nutrition_plan_weekdays w where w.plan_id=p.id and w.user_id=p.user_id))
    ||case when v2 then jsonb_build_object('trainingProteinDeltaG',p.training_protein_delta_g) else '{}'::jsonb end
$$;
revoke all on function ownlevel_private.nutrition_stage_json(public.nutrition_plan_periods,date,date,boolean) from public,anon,authenticated;
create or replace function ownlevel_private.nutrition_stage_json(p public.nutrition_plan_periods, next_start date, today date)
returns jsonb language sql stable set search_path='' as $$ select ownlevel_private.nutrition_stage_json(p,next_start,today,false) $$;

create function ownlevel_private.nutrition_stages_snapshot(v2 boolean)
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
  ) select coalesce(jsonb_agg(ownlevel_private.nutrition_stage_json(p,next_start,today,v2) order by (p).effective_from,(p).id),'[]') into rows from selected;
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
revoke all on function ownlevel_private.nutrition_stages_snapshot(boolean) from public,anon;
grant execute on function ownlevel_private.nutrition_stages_snapshot(boolean) to authenticated;
create or replace function ownlevel_private.nutrition_stages_snapshot()
returns jsonb language sql stable security definer set search_path='' as $$ select ownlevel_private.nutrition_stages_snapshot(false) $$;
create function public.mobile_read_nutrition_stages_v2() returns jsonb language sql stable security invoker set search_path='' as $$
  select ownlevel_private.nutrition_stages_snapshot(true)
$$;
revoke all on function public.mobile_read_nutrition_stages_v2() from public,anon;
grant execute on function public.mobile_read_nutrition_stages_v2() to authenticated;

-- v1: exactly the configuration plan fields + kind (water required). v2: those + trainingProteinDeltaG;
-- baseWaterL may be null (no water goal of its own), and then the water extra must be 0.
create function ownlevel_private.normalize_stage(s jsonb, v2 boolean) returns jsonb
language plpgsql immutable set search_path='' as $$
declare plan jsonb; protein numeric; no_water boolean;
begin
  if jsonb_typeof(s) is distinct from 'object' or jsonb_typeof(s->'kind') is distinct from 'string'
    or s->>'kind' not in ('maintenance','deficit','surplus','recomposition','custom')
    or char_length(s->>'name')>80 then raise exception using errcode='22023',message='Revisá el tipo y el nombre de la etapa.'; end if;
  if not v2 then
    return public.mobile_normalize_configuration_fields('plan',s-'kind')||jsonb_build_object('kind',s->'kind');
  end if;
  if jsonb_typeof(s->'trainingProteinDeltaG') is distinct from 'number' then
    raise exception using errcode='22023',message='Revisá el extra de proteína.'; end if;
  protein:=(s->>'trainingProteinDeltaG')::numeric;
  if protein<0 or protein>1000 or protein<>round(protein,2) then
    raise exception using errcode='22023',message='Revisá el extra de proteína.'; end if;
  no_water:=jsonb_typeof(s->'baseWaterL')='null';
  plan:=public.mobile_normalize_configuration_fields('plan',
    s-'kind'-'trainingProteinDeltaG'||case when no_water then jsonb_build_object('baseWaterL',0) else '{}'::jsonb end);
  if no_water then
    if (plan->>'trainingWaterDeltaL')::numeric<>0 then
      raise exception using errcode='22023',message='Sin agua propia en el plan no hay extra de agua.'; end if;
    plan:=plan||jsonb_build_object('baseWaterL',null);
  end if;
  return plan||jsonb_build_object('kind',s->'kind','trainingProteinDeltaG',protein);
end;
$$;
revoke all on function ownlevel_private.normalize_stage(jsonb,boolean) from public,anon,authenticated;
create or replace function ownlevel_private.normalize_stage(s jsonb) returns jsonb
language sql immutable set search_path='' as $$ select ownlevel_private.normalize_stage(s,false) $$;

create function ownlevel_private.normalize_stages_intent(i jsonb, v2 boolean) returns jsonb
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
    return i||jsonb_build_object('stage',ownlevel_private.normalize_stage(i->'stage',v2));
  elsif op='schedule_sequence' and ownlevel_private.stage_keys(i,base||array['name','after_end','start_date','stages','maintenanceStage']) then
    perform ownlevel_private.stage_date(i->'start_date');
    if jsonb_typeof(i->'name') is distinct from 'string' or char_length(btrim(i->>'name')) not between 1 and 80
      or jsonb_typeof(i->'after_end') is distinct from 'string' or i->>'after_end' not in ('keep_last','maintenance')
      or jsonb_typeof(i->'stages') is distinct from 'array' then raise exception using errcode='22023',message='Revisá el nombre y las etapas de la secuencia.'; end if;
    if jsonb_array_length(i->'stages') not between 1 and 24 then raise exception using errcode='22023',message='Agregá entre una y 24 etapas.'; end if;
    for s in select value from jsonb_array_elements(i->'stages') loop
      perform ownlevel_private.stage_next_date(date '2000-01-01',s->'duration');
      stages:=stages||jsonb_build_array(ownlevel_private.normalize_stage(s-'duration',v2)||jsonb_build_object('duration',s->'duration'));
    end loop;
    if i->>'after_end'='maintenance' then
      s:=ownlevel_private.normalize_stage(i->'maintenanceStage',v2);
      if s->>'kind'<>'maintenance' then raise exception using errcode='22023',message='Elegí los objetivos del mantenimiento final.'; end if;
    elsif i->'maintenanceStage'<>'null'::jsonb then raise exception using errcode='22023',message='Revisá qué pasa al terminar la secuencia.';
    else s:='null'; end if;
    return i||jsonb_build_object('name',btrim(i->>'name'),'stages',stages,'maintenanceStage',s);
  elsif op='update_future' and ownlevel_private.stage_keys(i,base||array['stageId','stage','startsOn','duration']) then
    perform ownlevel_private.stage_date(i->'startsOn');
    if i->'duration'<>'null'::jsonb then perform ownlevel_private.stage_next_date(date '2000-01-01',i->'duration'); end if;
    result:=i||jsonb_build_object('stage',ownlevel_private.normalize_stage(i->'stage',v2));
  elsif op='delete_future' and ownlevel_private.stage_keys(i,base||array['stageId']) then null;
  elsif op='cancel_sequence' and ownlevel_private.stage_keys(i,base||array['sequenceId']) then null;
  else raise exception using errcode='22023',message='Revisá los datos antes de guardar.'; end if;
  s:=case when op='cancel_sequence' then i->'sequenceId' else i->'stageId' end;
  if jsonb_typeof(s) is distinct from 'string' or s#>>'{}' !~* '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' then
    raise exception using errcode='22023',message='La etapa o secuencia no está disponible.'; end if;
  return result;
end;
$$;
revoke all on function ownlevel_private.normalize_stages_intent(jsonb,boolean) from public,anon,authenticated;
create or replace function ownlevel_private.normalize_stages_intent(i jsonb) returns jsonb
language sql immutable set search_path='' as $$ select ownlevel_private.normalize_stages_intent(i,false) $$;

create function ownlevel_private.mutate_nutrition_stages(p_intent jsonb, v2 boolean)
returns table(response_status smallint,response_body jsonb,replayed boolean)
language plpgsql security definer set search_path='' set timezone='UTC' set lock_timeout='3s' set statement_timeout='8s' as $$
declare u uuid:=auth.uid(); today date:=(statement_timestamp() at time zone 'America/Argentina/Cordoba')::date;
  ledger_operation text:=case when v2 then 'nutrition.stages.v2' else 'nutrition.stages.v1' end;
  i jsonb; request_hash text; ledger public.mobile_idempotency_keys; result jsonb; code smallint; conflict_code text; message text;
begin
  if u is null then raise exception using errcode='PT401',message='UNAUTHORIZED'; end if;
  i:=ownlevel_private.normalize_stages_intent(p_intent,v2);
  request_hash:=public.mobile_quick_source_version(i-'idempotencyKey');
  -- Same order as mobile_mutate_nutrition_configuration: ledger mutex 412 -> plan mutex 413 -> rows.
  perform pg_advisory_xact_lock(hashtextextended(u::text,412));
  perform pg_advisory_xact_lock(hashtextextended(u::text,413));
  insert into public.mobile_idempotency_keys(user_id,operation,idempotency_key,request_hash,expires_at)
    values(u,ledger_operation,i->>'idempotencyKey',request_hash,'infinity') on conflict(user_id,operation,idempotency_key) do nothing;
  select * into ledger from public.mobile_idempotency_keys where user_id=u and operation=ledger_operation and idempotency_key=i->>'idempotencyKey' for update;
  if ledger.request_hash<>request_hash then
    return query select 409::smallint,jsonb_build_object('status','conflict','error','IDEMPOTENCY_KEY_REUSED',
      'message','Este guardado ya se usó con otros datos. Revisá tus etapas.','list',ownlevel_private.nutrition_stages_snapshot(v2)),false; return;
  end if;
  -- Receipt replay precedes date/CAS, including after midnight or a later source edit.
  if ledger.state='completed' then return query select ledger.response_status,ledger.response_body,true; return; end if;
  if i->>'date'<>today::text then conflict_code:='STAGES_DAY_CHANGED';
  elsif (i->>'expectedListVersion')::bigint<>coalesce((select version from ownlevel_private.nutrition_stage_lists where user_id=u),0) then conflict_code:='STAGES_CHANGED'; end if;
  if conflict_code is not null then
    code:=409; result:=jsonb_build_object('status','conflict','error',conflict_code,'message',
      case when conflict_code='STAGES_DAY_CHANGED' then 'Cambió el día. Revisá desde cuándo empieza el plan.' else 'Tus etapas cambiaron. Revisá la lista antes de guardar.' end,
      'list',ownlevel_private.nutrition_stages_snapshot(v2));
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
      code:=200; result:=jsonb_build_object('status','confirmed','operation',i->>'operation','date',today::text,'list',ownlevel_private.nutrition_stages_snapshot(v2));
    exception when sqlstate '22023' or foreign_key_violation then
      get stacked diagnostics message=message_text;
      code:=400; result:=jsonb_build_object('status','validation','message',case when sqlstate='23503' then 'Esta etapa tiene días guardados. Lo que registraste se conserva.' else message end);
    end;
  end if;
  update public.mobile_idempotency_keys set state='completed',response_status=code,response_body=result,
    resource_type='nutrition-stages',completed_at=clock_timestamp()
    where user_id=u and operation=ledger_operation and idempotency_key=i->>'idempotencyKey';
  return query select code,result,false;
end;
$$;
revoke all on function ownlevel_private.mutate_nutrition_stages(jsonb,boolean) from public,anon;
grant execute on function ownlevel_private.mutate_nutrition_stages(jsonb,boolean) to authenticated;
create or replace function ownlevel_private.mutate_nutrition_stages(p_intent jsonb)
returns table(response_status smallint,response_body jsonb,replayed boolean)
language sql security definer set search_path='' as $$ select * from ownlevel_private.mutate_nutrition_stages(p_intent,false) $$;
create function public.mobile_mutate_nutrition_stages_v2(p_intent jsonb)
returns table(response_status smallint,response_body jsonb,replayed boolean)
language sql security invoker set search_path='' as $$ select * from ownlevel_private.mutate_nutrition_stages(p_intent,true) $$;
revoke all on function public.mobile_mutate_nutrition_stages_v2(jsonb) from public,anon;
grant execute on function public.mobile_mutate_nutrition_stages_v2(jsonb) to authenticated;

commit;
