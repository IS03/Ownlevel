-- Step 3 EXPAND: opt-in session additions at finish, with legacy clients intact.
-- Old save/read/finish RPCs keep their signatures, payloads and ledgers.
-- New Mobile explicitly adopts v2 save/finish; no historical backfill.
begin;
set local lock_timeout = '5s';

alter table public.workout_session_exercises
  add column if not exists add_to_routine_on_finish boolean not null default false,
  add column if not exists routine_addition_outcome text
    check (routine_addition_outcome in ('added','already_in_routine','routine_unavailable','no_completed_sets'));

-- A separate flag prevents older clients from silently clearing the new opt-in.
create or replace function public.mobile_save_workout_exercise_v2(
  p_session_id uuid, p_session_exercise_id uuid, p_expected_updated_at timestamptz, p_payload jsonb
)
returns timestamptz
language plpgsql
security invoker
set search_path = ''
set lock_timeout = '3s'
set statement_timeout = '8s'
as $$
declare
  v_version timestamptz;
  v_opt_in_version timestamptz;
begin
  -- Reuse exact validation, ownership, active lock, CAS and set writes.
  v_version := public.mobile_save_workout_exercise(p_session_id, p_session_exercise_id, p_expected_updated_at, p_payload);
  update public.workout_session_exercises
  set add_to_routine_on_finish = (p_payload ->> 'apply_to_routine')::boolean
  where id = p_session_exercise_id and workout_session_id = p_session_id
    and user_id = (select auth.uid()) and routine_exercise_id is null
    and add_to_routine_on_finish is distinct from (p_payload ->> 'apply_to_routine')::boolean
  returning updated_at into v_opt_in_version;
  return coalesce(v_opt_in_version, v_version);
end;
$$;

create or replace function public.finish_workout_session(
  p_session_id uuid,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_session public.workout_sessions;
  v_exercise record;
  v_routine_id uuid;
  v_relation_id uuid;
  v_order integer;
  v_outcome text;
  v_previous_defaults text;
begin
  v_user_id := public.lock_training_user_mutations();

  select * into v_session
  from public.workout_sessions
  where id = p_session_id and user_id = v_user_id and status = 'in_progress'
  for update;
  if v_session.id is null then
    raise exception 'La sesión no existe o ya finalizó';
  end if;
  if not exists (
    select 1
    from public.workout_session_exercises se
    join public.workout_sets ws on ws.workout_session_exercise_id = se.id
    where se.workout_session_id = p_session_id and se.is_completed and ws.is_completed
  ) then
    raise exception 'Marcá y guardá al menos una serie antes de finalizar';
  end if;

  update public.routine_exercises re
  set
    next_adjustment = se.decision,
    next_adjustment_note = case
      when se.decision = 'custom' then nullif(pg_catalog.btrim(se.decision_note), '')
      else null
    end
  from public.workout_session_exercises se
  where se.workout_session_id = p_session_id
    and se.routine_exercise_id = re.id;

  update public.routine_exercises re
  set notes = se.notes
  from public.workout_session_exercises se
  where se.workout_session_id = p_session_id
    and se.routine_exercise_id = re.id
    and se.routine_note_snapshot is not null
    and se.notes is distinct from se.routine_note_snapshot;

  for v_exercise in
    select * from public.workout_session_exercises
    where workout_session_id = p_session_id
      and apply_to_routine
      and routine_exercise_id is not null
  loop
    if exists (
      select 1 from public.workout_sets ws
      where ws.workout_session_exercise_id = v_exercise.id and ws.is_completed
    ) then
      delete from public.routine_exercise_sets
      where routine_exercise_id = v_exercise.routine_exercise_id;
      insert into public.routine_exercise_sets (
        user_id, routine_exercise_id, set_number,
        target_reps, target_weight_kg, target_rir, notes
      )
      select
        v_user_id, v_exercise.routine_exercise_id,
        row_number() over (order by ws.set_number)::integer,
        coalesce(ws.actual_reps, ws.target_reps),
        coalesce(ws.actual_weight_kg, ws.target_weight_kg),
        ws.target_rir,
        ws.notes
      from public.workout_sets ws
      where ws.workout_session_exercise_id = v_exercise.id and ws.is_completed;
    end if;
  end loop;

  -- Only this explicit per-session opt-in may append a template exercise.
  -- Leave routine_exercise_id/source snapshots untouched in completed history.
  for v_exercise in
    select * from public.workout_session_exercises
    where workout_session_id = p_session_id and user_id = v_user_id
      and routine_exercise_id is null and add_to_routine_on_finish
    order by exercise_order
  loop
    v_outcome := null;
    if not exists (select 1 from public.workout_sets
      where workout_session_exercise_id = v_exercise.id and is_completed) then
      v_outcome := 'no_completed_sets';
    else
      select id into v_routine_id from public.routines
      where id = v_session.routine_id and user_id = v_user_id and is_active for update;
      if not found then
        v_outcome := 'routine_unavailable';
      elsif exists (select 1 from public.routine_exercises
        where routine_id = v_routine_id and exercise_id = v_exercise.exercise_id) then
        v_outcome := 'already_in_routine';
      else
        select coalesce(max(exercise_order), 0) + 1 into v_order
        from public.routine_exercises where routine_id = v_routine_id;
        -- Reuse the template writer's suppression of legacy catalog defaults.
        v_previous_defaults := pg_catalog.current_setting('ownlevel.skip_routine_default_sets', true);
        perform pg_catalog.set_config('ownlevel.skip_routine_default_sets', 'on', true);
        insert into public.routine_exercises(routine_id, exercise_id, exercise_order,
          rest_min_seconds, rest_max_seconds, next_adjustment, next_adjustment_note)
        values(v_routine_id, v_exercise.exercise_id, v_order,
          v_exercise.rest_min_seconds_snapshot, v_exercise.rest_max_seconds_snapshot,
          v_exercise.decision, case when v_exercise.decision = 'custom' then nullif(pg_catalog.btrim(v_exercise.decision_note),'') else null end)
        returning id into v_relation_id;
        perform pg_catalog.set_config('ownlevel.skip_routine_default_sets', coalesce(v_previous_defaults, 'off'), true);
        insert into public.routine_exercise_sets(user_id, routine_exercise_id, set_number,
          target_reps, target_weight_kg, target_rir, notes)
        select v_user_id, v_relation_id, row_number() over(order by set_number)::integer,
          coalesce(actual_reps, target_reps), coalesce(actual_weight_kg, target_weight_kg), target_rir, notes
        from public.workout_sets where workout_session_exercise_id = v_exercise.id and is_completed;
        perform public.bump_training_routine_template_once(v_routine_id);
        v_outcome := 'added';
      end if;
    end if;
    update public.workout_session_exercises set routine_addition_outcome = v_outcome
    where id = v_exercise.id and user_id = v_user_id;
  end loop;

  update public.workout_sessions
  set
    session_name = coalesce(nullif(p_metadata ->> 'session_name', ''), session_name),
    energy_level = nullif(p_metadata ->> 'energy_level', '')::smallint,
    performance_level = nullif(p_metadata ->> 'performance_level', '')::smallint,
    pain_level = nullif(p_metadata ->> 'pain_level', '')::smallint,
    pain_note = nullif(p_metadata ->> 'pain_note', ''),
    abs_completed = coalesce((p_metadata ->> 'abs_completed')::boolean, false),
    treadmill_minutes = nullif(p_metadata ->> 'treadmill_minutes', '')::numeric,
    treadmill_distance_km = nullif(p_metadata ->> 'treadmill_distance_km', '')::numeric,
    treadmill_speed_kmh = nullif(p_metadata ->> 'treadmill_speed_kmh', '')::numeric,
    treadmill_incline_percent = nullif(p_metadata ->> 'treadmill_incline_percent', '')::numeric,
    notes = nullif(p_metadata ->> 'notes', ''),
    status = 'completed',
    ended_at = pg_catalog.now()
  where id = p_session_id;
  return p_session_id;
end;
$$;

-- Additive receipt ledger: the old finish ledger remains byte-for-byte legacy.
-- Same user lock serializes both ledgers; old finish still performs domain
-- effects once. This outer ledger freezes the richer v2 receipt for exact replay.
create or replace function public.mobile_finish_training_session_v2(
  p_session_id uuid, p_metadata jsonb, p_idempotency_key text
)
returns table(response_status smallint, response_body jsonb, replayed boolean)
language plpgsql
security definer
set search_path = ''
set lock_timeout = '3s'
set statement_timeout = '8s'
as $$
declare
  v_user_id uuid;
  v_operation constant text := 'training.session.finish-with-additions.v1';
  v_hash text;
  v_ledger public.mobile_idempotency_keys%rowtype;
  v_legacy record;
  v_additions jsonb;
  v_response jsonb;
begin
  v_user_id := public.lock_training_user_mutations();
  if p_session_id is null or p_metadata is null or p_idempotency_key is null
    or char_length(p_idempotency_key) not between 1 and 128
    or p_idempotency_key !~ '^[A-Za-z0-9._:-]+$' then
    raise exception using errcode = '22023', message = 'El resumen enviado no es válido.';
  end if;
  v_hash := pg_catalog.encode(extensions.digest(pg_catalog.convert_to(jsonb_build_object(
    'sessionId',p_session_id,'metadata',p_metadata)::text,'UTF8'),'sha256'),'hex');
  insert into public.mobile_idempotency_keys(user_id,operation,idempotency_key,request_hash,expires_at)
  values(v_user_id,v_operation,p_idempotency_key,v_hash,now()+interval '30 days')
  on conflict(user_id,operation,idempotency_key) do nothing;
  select * into v_ledger from public.mobile_idempotency_keys
  where user_id=v_user_id and operation=v_operation and idempotency_key=p_idempotency_key for update;
  if v_ledger.request_hash <> v_hash then
    raise exception using errcode = 'PT409', message = 'IDEMPOTENCY_KEY_REUSED';
  end if;
  if v_ledger.state='completed' then
    return query select v_ledger.response_status,v_ledger.response_body,true;
    return;
  end if;
  select * into v_legacy from public.mobile_finish_training_session(p_session_id,p_metadata,p_idempotency_key);
  select coalesce(jsonb_agg(jsonb_build_object('sessionExerciseId',id,'exerciseId',exercise_id,
    'name',nombre_snapshot,'outcome',routine_addition_outcome) order by exercise_order),'[]'::jsonb)
  into v_additions from public.workout_session_exercises
  where workout_session_id=p_session_id and user_id=v_user_id and routine_addition_outcome is not null;
  v_response := v_legacy.response_body || jsonb_build_object('routineAdditions',v_additions);
  update public.mobile_idempotency_keys
  set state='completed', response_status=200, response_body=v_response,
    resource_type='workout_session',resource_id=p_session_id,completed_at=now()
  where user_id=v_user_id and operation=v_operation and idempotency_key=p_idempotency_key;
  return query select 200::smallint,v_response,false;
end;
$$;

revoke all on function public.mobile_save_workout_exercise_v2(uuid,uuid,timestamptz,jsonb) from public,anon;
revoke all on function public.mobile_finish_training_session_v2(uuid,jsonb,text) from public,anon;
grant execute on function public.mobile_save_workout_exercise_v2(uuid,uuid,timestamptz,jsonb) to authenticated;
grant execute on function public.mobile_finish_training_session_v2(uuid,jsonb,text) to authenticated;
commit;
