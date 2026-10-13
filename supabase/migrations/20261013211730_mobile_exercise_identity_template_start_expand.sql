-- EXPAND: additive identity CAS and opt-in Mobile start. Legacy Web/RPC behavior stays intact.
begin;

-- Every catalog writer (including Web) must advance the identity CAS token,
-- even inside one transaction or after waiting for another writer.
create or replace function public.set_training_exercise_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := greatest(pg_catalog.clock_timestamp(), old.updated_at + interval '1 microsecond');
  return new;
end;
$$;
drop trigger if exists tr_exercises_updated_at on public.exercises;
create trigger tr_exercises_updated_at before update on public.exercises
for each row execute function public.set_training_exercise_updated_at();
revoke all on function public.set_training_exercise_updated_at() from public, anon, authenticated;

create or replace function public.mobile_update_training_exercise_identity(
  p_exercise_id uuid, p_exercise jsonb, p_expected_updated_at timestamptz
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_exercise public.exercises%rowtype;
  v_routine_ids uuid[];
  v_response jsonb;
begin
  v_user_id := public.lock_training_user_mutations();
  if p_exercise_id is null or p_expected_updated_at is null
    or p_exercise is null or pg_catalog.jsonb_typeof(p_exercise) <> 'object' then
    raise exception using errcode = '22023', message = 'El ejercicio no es válido.';
  end if;
  if not (p_exercise ?& array['name','muscleGroup','muscleGroupLabel','implement','weightMode','notes'])
    or exists (select 1 from pg_catalog.jsonb_object_keys(p_exercise) as supplied(key)
      where supplied.key <> all(array['name','muscleGroup','muscleGroupLabel','implement','weightMode','notes']))
    or pg_catalog.jsonb_typeof(p_exercise->'name') <> 'string'
    or public.normalize_name(p_exercise->>'name') is null
    or char_length(p_exercise->>'name') > 120
    or exists (select 1 from (values ('muscleGroup'),('muscleGroupLabel'),('implement'),('weightMode'),('notes')) as field(key)
      where pg_catalog.jsonb_typeof(p_exercise->field.key) not in ('string','null'))
    or char_length(coalesce(p_exercise->>'muscleGroupLabel','')) > 120
    or char_length(coalesce(p_exercise->>'implement','')) > 120
    or char_length(coalesce(p_exercise->>'weightMode','')) > 120
    or char_length(coalesce(p_exercise->>'notes','')) > 1000
    or (p_exercise->>'muscleGroup' is not null and p_exercise->>'muscleGroup' not in
      ('pecho','espalda','piernas','hombros','bíceps','tríceps','abdomen','cardio')) then
    raise exception using errcode = '22023', message = 'Los datos del ejercicio no son válidos.';
  end if;

  select * into v_exercise from public.exercises
    where id = p_exercise_id and user_id = v_user_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'TRAINING_EXERCISE_NOT_FOUND';
  end if;
  if v_exercise.updated_at is distinct from p_expected_updated_at then
    raise exception using errcode = '40001', message = 'EXERCISE_CHANGED';
  end if;

  -- Identity only: defaults, status, routine memberships and snapshots are untouched.
  update public.exercises set
    nombre = public.normalize_name(p_exercise->>'name'),
    grupo_muscular = (p_exercise->>'muscleGroup')::public.muscle_group,
    muscle_group_label = nullif(pg_catalog.btrim(p_exercise->>'muscleGroupLabel'),''),
    implement = nullif(pg_catalog.btrim(p_exercise->>'implement'),''),
    weight_mode = nullif(pg_catalog.btrim(p_exercise->>'weightMode'),''),
    notes = nullif(pg_catalog.btrim(p_exercise->>'notes'),'')
    where id = p_exercise_id and user_id = v_user_id returning * into v_exercise;

  select coalesce(array_agg(re.routine_id order by re.routine_id),'{}'::uuid[])
    into v_routine_ids from public.routine_exercises re
    join public.routines r on r.id = re.routine_id
    where re.exercise_id = p_exercise_id and r.user_id = v_user_id and r.is_active;
  v_response := jsonb_build_object(
    'exercise', jsonb_build_object(
      'id', v_exercise.id,
      'name', v_exercise.nombre,
      'muscleGroup', v_exercise.grupo_muscular,
      'muscleGroupLabel', v_exercise.muscle_group_label,
      'implement', v_exercise.implement,
      'weightMode', v_exercise.weight_mode,
      'suggestedSets', v_exercise.series_sugeridas,
      'suggestedReps', v_exercise.reps_sugeridas,
      'suggestedWeight', v_exercise.peso_sugerido,
      'suggestedRir', v_exercise.rir_sugerido,
      'suggestedRestMinSeconds', v_exercise.descanso_min_sugerido_segundos,
      'suggestedRestMaxSeconds', v_exercise.descanso_max_sugerido_segundos,
      'notes', v_exercise.notes,
      'isActive', v_exercise.is_active,
      'routineIds', to_jsonb(v_routine_ids),
      'updatedAt', v_exercise.updated_at
    )
  );

  return v_response;
end;
$$;

-- Same snapshot/Training locks as legacy start, without catalog-default fallback.
create or replace function public.mobile_start_workout_from_template(
  p_day_log_id uuid,
  p_routine_id uuid default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_session_id uuid;
  v_routine_name text;
  v_previous_default_sets_setting text;
begin
  v_user_id := public.lock_training_user_mutations();

  if not exists (
    select 1 from public.day_logs where id = p_day_log_id and user_id = v_user_id
  ) then
    raise exception 'Fecha inválida o ajena';
  end if;
  if exists (
    select 1 from public.workout_sessions
    where user_id = v_user_id and status = 'in_progress'
  ) then
    raise exception using errcode = 'P0001', message = 'ACTIVE_SESSION_EXISTS';
  end if;
  if p_routine_id is not null then
    select nombre into v_routine_name
    from public.routines
    where id = p_routine_id and user_id = v_user_id and is_active
    for share;
    if v_routine_name is null then
      raise exception 'Rutina inválida o archivada';
    end if;

    if exists (
      select 1 from public.routine_exercises re
      left join public.exercises e on e.id = re.exercise_id
      where re.routine_id = p_routine_id and (e.id is null or e.user_id <> v_user_id)
    ) then
      raise exception using errcode = 'P0001', message = 'TRAINING_ROUTINE_TEMPLATE_CORRUPT';
    end if;

    perform e.id
    from public.exercises e
    join public.routine_exercises re on re.exercise_id = e.id
    where re.routine_id = p_routine_id and e.user_id = v_user_id
    order by e.id
    for share of e;
  end if;

  insert into public.workout_sessions (
    user_id, day_log_id, routine_id, routine_name_snapshot, session_name, status, started_at
  ) values (
    v_user_id, p_day_log_id, p_routine_id, v_routine_name,
    coalesce(v_routine_name, 'Sesión libre'), 'in_progress', pg_catalog.now()
  ) returning id into v_session_id;

  if p_routine_id is not null then
    v_previous_default_sets_setting := pg_catalog.current_setting(
      'ownlevel.skip_workout_default_sets', true
    );
    perform pg_catalog.set_config('ownlevel.skip_workout_default_sets', 'on', true);

    insert into public.workout_session_exercises (
      user_id, workout_session_id, routine_exercise_id, exercise_id,
      nombre_snapshot, grupo_muscular_snapshot, muscle_group_label_snapshot,
      implement_snapshot, weight_mode_snapshot,
      rest_min_seconds_snapshot, rest_max_seconds_snapshot,
      source_type, exercise_order, series_reales, planned_sets_count,
      next_adjustment_snapshot, next_adjustment_note_snapshot,
      decision, decision_note, routine_note_snapshot, notes
    )
    select
      v_user_id, v_session_id, re.id, e.id,
      e.nombre, e.grupo_muscular, e.muscle_group_label,
      e.implement, e.weight_mode,
      re.rest_min_seconds, re.rest_max_seconds,
      'routine', re.exercise_order,
      greatest(coalesce(nullif(count(res.id), 0), 1), 1)::integer,
      greatest(coalesce(nullif(count(res.id), 0), 1), 1)::integer,
      re.next_adjustment, re.next_adjustment_note,
      'maintain', null, re.notes, re.notes
    from public.routine_exercises re
    join public.exercises e on e.id = re.exercise_id
    left join public.routine_exercise_sets res on res.routine_exercise_id = re.id
    where re.routine_id = p_routine_id
    group by re.id, e.id
    order by re.exercise_order;

    insert into public.workout_sets (
      user_id, workout_session_exercise_id, set_number,
      target_reps, target_weight_kg, target_rir,
      actual_reps, actual_weight_kg
    )
    select
      v_user_id, se.id, generated.set_number,
      res.target_reps,
      res.target_weight_kg,
      res.target_rir,
      res.target_reps,
      res.target_weight_kg
    from public.workout_session_exercises se
    join public.exercises e on e.id = se.exercise_id
    cross join lateral pg_catalog.generate_series(1, se.planned_sets_count) as generated(set_number)
    left join public.routine_exercise_sets res
      on res.routine_exercise_id = se.routine_exercise_id
      and res.set_number = generated.set_number
    where se.workout_session_id = v_session_id
    on conflict (workout_session_exercise_id, set_number) do update
    set
      target_reps = excluded.target_reps,
      target_weight_kg = excluded.target_weight_kg,
      target_rir = excluded.target_rir,
      actual_reps = excluded.actual_reps,
      actual_weight_kg = excluded.actual_weight_kg;

    perform pg_catalog.set_config(
      'ownlevel.skip_workout_default_sets',
      coalesce(v_previous_default_sets_setting, 'off'),
      true
    );
  end if;

  return v_session_id;
end;
$$;

-- Shares the v1 ledger namespace; a key cannot change target policy or create two sessions.
create or replace function public.mobile_start_training_session_from_template(
  p_idempotency_key text,
  p_routine_id uuid default null
)
returns table (
  response_status smallint,
  response_body jsonb,
  replayed boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_operation constant text := 'training.session.start.v1';
  v_payload jsonb;
  v_request_hash text;
  v_ledger public.mobile_idempotency_keys%rowtype;
  v_routine public.routines%rowtype;
  v_active record;
  v_day_log public.day_logs%rowtype;
  v_session_id uuid;
  v_session record;
  v_response jsonb;
  v_error_message text;
  v_constraint_name text;
  v_today date := (pg_catalog.timezone('America/Argentina/Cordoba', pg_catalog.now()))::date;
begin
  if v_user_id is null then
    raise exception using errcode = 'P0001', message = 'UNAUTHORIZED';
  end if;
  if p_idempotency_key is null
    or char_length(p_idempotency_key) not between 1 and 128
    or p_idempotency_key !~ '^[A-Za-z0-9._:-]+$' then
    raise exception using errcode = '22023', message = 'La operación no es válida.';
  end if;

  perform public.lock_training_user_mutations();

  v_payload := jsonb_build_object('routineId', p_routine_id, 'templateTargetsOnly', true);
  v_request_hash := pg_catalog.encode(
    extensions.digest(pg_catalog.convert_to(v_payload::text, 'UTF8'), 'sha256'),
    'hex'
  );

  insert into public.mobile_idempotency_keys (
    user_id, operation, idempotency_key, request_hash, expires_at
  ) values (
    v_user_id, v_operation, p_idempotency_key, v_request_hash,
    pg_catalog.now() + interval '30 days'
  )
  on conflict (user_id, operation, idempotency_key) do nothing;

  select * into v_ledger
  from public.mobile_idempotency_keys
  where user_id = v_user_id
    and operation = v_operation
    and idempotency_key = p_idempotency_key
  for update;

  if v_ledger.request_hash <> v_request_hash then
    raise exception using errcode = 'P0001', message = 'IDEMPOTENCY_KEY_REUSED';
  end if;
  if v_ledger.state = 'completed' then
    return query select v_ledger.response_status, v_ledger.response_body, true;
    return;
  end if;

  if p_routine_id is not null then
    select * into v_routine
    from public.routines r
    where r.id = p_routine_id and r.user_id = v_user_id and r.is_active
    for share;
    if not found then
      raise exception using errcode = 'P0002', message = 'TRAINING_ROUTINE_NOT_FOUND';
    end if;
  end if;

  select
    ws.id, ws.routine_id, ws.session_name, ws.started_at, dl.log_date
  into v_active
  from public.workout_sessions ws
  join public.day_logs dl on dl.id = ws.day_log_id
  where ws.user_id = v_user_id and ws.status = 'in_progress'
  order by ws.started_at desc
  limit 1;

  if found then
    v_response := jsonb_build_object(
      'status', 'active',
      'code', 'ACTIVE_SESSION_EXISTS',
      'session', jsonb_build_object(
        'id', v_active.id,
        'routineId', v_active.routine_id,
        'name', coalesce(v_active.session_name, 'Sesión libre'),
        'logDate', v_active.log_date,
        'startedAt', v_active.started_at
      )
    );
    update public.mobile_idempotency_keys
    set state = 'completed', response_status = 409, response_body = v_response,
        resource_type = 'workout_session', resource_id = v_active.id,
        completed_at = pg_catalog.now()
    where user_id = v_user_id and operation = v_operation
      and idempotency_key = p_idempotency_key;
    return query select 409::smallint, v_response, false;
    return;
  end if;

  v_day_log := public.get_or_create_day_log(v_today);
  begin
    v_session_id := public.mobile_start_workout_from_template(v_day_log.id, p_routine_id);
  exception when unique_violation or raise_exception then
    get stacked diagnostics
      v_error_message = message_text,
      v_constraint_name = constraint_name;
    if v_error_message <> 'ACTIVE_SESSION_EXISTS'
      and coalesce(v_constraint_name, '') <> 'uniq_workout_sessions_user_in_progress' then
      raise;
    end if;

    select
      ws.id, ws.routine_id, ws.session_name, ws.started_at, dl.log_date
    into v_active
    from public.workout_sessions ws
    join public.day_logs dl on dl.id = ws.day_log_id
    where ws.user_id = v_user_id and ws.status = 'in_progress'
    order by ws.started_at desc
    limit 1;
    if not found then
      raise;
    end if;

    v_response := jsonb_build_object(
      'status', 'active',
      'code', 'ACTIVE_SESSION_EXISTS',
      'session', jsonb_build_object(
        'id', v_active.id,
        'routineId', v_active.routine_id,
        'name', coalesce(v_active.session_name, 'Sesión libre'),
        'logDate', v_active.log_date,
        'startedAt', v_active.started_at
      )
    );
    update public.mobile_idempotency_keys
    set state = 'completed', response_status = 409, response_body = v_response,
        resource_type = 'workout_session', resource_id = v_active.id,
        completed_at = pg_catalog.now()
    where user_id = v_user_id and operation = v_operation
      and idempotency_key = p_idempotency_key;
    return query select 409::smallint, v_response, false;
    return;
  end;

  select ws.id, ws.routine_id, ws.session_name, ws.started_at, dl.log_date
  into v_session
  from public.workout_sessions ws
  join public.day_logs dl on dl.id = ws.day_log_id
  where ws.id = v_session_id and ws.user_id = v_user_id;

  if not found then
    raise exception using errcode = 'P0001', message = 'TRAINING_SESSION_START_FAILED';
  end if;

  v_response := jsonb_build_object(
    'status', 'started',
    'session', jsonb_build_object(
      'id', v_session.id,
      'routineId', v_session.routine_id,
      'name', coalesce(v_session.session_name, 'Sesión libre'),
      'logDate', v_session.log_date,
      'startedAt', v_session.started_at
    )
  );

  update public.mobile_idempotency_keys
  set state = 'completed', response_status = 201, response_body = v_response,
      resource_type = 'workout_session', resource_id = v_session.id,
      completed_at = pg_catalog.now()
  where user_id = v_user_id and operation = v_operation
    and idempotency_key = p_idempotency_key;

  return query select 201::smallint, v_response, false;
end;
$$;

revoke all on function public.mobile_update_training_exercise_identity(uuid, jsonb, timestamptz) from public, anon;
grant execute on function public.mobile_update_training_exercise_identity(uuid, jsonb, timestamptz) to authenticated;
revoke all on function public.mobile_start_workout_from_template(uuid, uuid) from public, anon;
grant execute on function public.mobile_start_workout_from_template(uuid, uuid) to authenticated;
revoke all on function public.mobile_start_training_session_from_template(text, uuid) from public, anon;
grant execute on function public.mobile_start_training_session_from_template(text, uuid) to authenticated;

commit;
