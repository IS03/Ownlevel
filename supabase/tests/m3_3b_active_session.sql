-- Run after the Training migrations in a disposable database. Synthetic data;
-- always rolled back. Multi-connection races are in the companion Node runner.
begin;
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
('33300000-0000-4000-8000-000000000001','authenticated','authenticated','m3-3b-owner@example.invalid','',now(),'{}','{}',now(),now()),
('33300000-0000-4000-8000-000000000002','authenticated','authenticated','m3-3b-other@example.invalid','',now(),'{}','{}',now(),now());
insert into public.day_logs (id, user_id, log_date) values
('33300000-0000-4000-8000-000000000101','33300000-0000-4000-8000-000000000001','2026-09-29'),
('33300000-0000-4000-8000-000000000102','33300000-0000-4000-8000-000000000002','2026-09-29');
insert into public.exercises (id, user_id, nombre, series_sugeridas, reps_sugeridas, peso_sugerido,
  rir_sugerido, descanso_min_sugerido_segundos, descanso_max_sugerido_segundos, is_active) values
('33300000-0000-4000-8000-000000000201','33300000-0000-4000-8000-000000000001','M3.3B PRESS',2,8,40,2,90,120,true),
('33300000-0000-4000-8000-000000000202','33300000-0000-4000-8000-000000000001','M3.3B ROW',1,8,0,0,null,null,true),
('33300000-0000-4000-8000-000000000203','33300000-0000-4000-8000-000000000002','M3.3B FOREIGN',1,8,40,2,90,120,true),
('33300000-0000-4000-8000-000000000204','33300000-0000-4000-8000-000000000001','M3.3B ARCHIVED',1,8,40,2,90,120,false);
insert into public.workout_sessions (id, user_id, day_log_id, session_name, status) values
('33300000-0000-4000-8000-000000000301','33300000-0000-4000-8000-000000000001','33300000-0000-4000-8000-000000000101','M3.3B ACTIVE','in_progress'),
('33300000-0000-4000-8000-000000000302','33300000-0000-4000-8000-000000000002','33300000-0000-4000-8000-000000000102','M3.3B FOREIGN','in_progress'),
('33300000-0000-4000-8000-000000000303','33300000-0000-4000-8000-000000000001','33300000-0000-4000-8000-000000000101','M3.3B HISTORY','completed');
set local role authenticated;
select set_config('request.jwt.claim.sub','33300000-0000-4000-8000-000000000001',true);

do $$
declare
  v_session constant uuid := '33300000-0000-4000-8000-000000000301';
  v_added record;
  v_replay record;
  v_created record;
  v_version timestamptz;
  v_new_version timestamptz;
  v_id uuid;
  v_payload jsonb := '{"is_completed":true,"decision":"increase_reps","decision_note":"","apply_to_routine":false,"notes":"recorded","sets":[{"set_number":1,"target_reps":8,"target_weight_kg":40,"target_rir":2,"actual_reps":0,"actual_weight_kg":null,"is_completed":true,"notes":null}]}';
begin
  select * into v_added from public.mobile_mutate_workout_session(v_session,'add_existing','m3-3b:add',
    p_exercise_id => '33300000-0000-4000-8000-000000000201');
  select * into v_replay from public.mobile_mutate_workout_session(v_session,'add_existing','m3-3b:add',
    p_exercise_id => '33300000-0000-4000-8000-000000000201');
  if v_added.response_status <> 201 or v_added.replayed or not v_replay.replayed
    or v_replay.response_body <> v_added.response_body then raise exception 'add replay failed'; end if;
  v_id := (v_added.response_body ->> 'sessionExerciseId')::uuid;
  if not exists (select 1 from public.workout_session_exercises where id = v_id
    and nombre_snapshot = 'M3.3B PRESS' and rest_max_seconds_snapshot is null and exercise_order = 1)
    or (select count(*) from public.workout_sets where workout_session_exercise_id = v_id) <> 1 then
    raise exception 'append snapshots/blank set/order failed';
  end if;
  begin
    perform public.mobile_mutate_workout_session(v_session,'add_existing','m3-3b:add',
      p_exercise_id => '33300000-0000-4000-8000-000000000202');
    raise exception 'key mismatch accepted';
  exception when raise_exception then if sqlerrm <> 'IDEMPOTENCY_KEY_REUSED' then raise; end if; end;
  begin
    perform public.mobile_mutate_workout_session(v_session,'add_existing','m3-3b:duplicate',
      p_exercise_id => '33300000-0000-4000-8000-000000000201');
    raise exception 'duplicate accepted';
  exception when raise_exception then if sqlerrm <> 'SESSION_EXERCISE_ALREADY_EXISTS' then raise; end if; end;
  begin
    perform public.mobile_mutate_workout_session(v_session,'add_existing','m3-3b:foreign-exercise',
      p_exercise_id => '33300000-0000-4000-8000-000000000203');
    raise exception 'foreign exercise accepted';
  exception when no_data_found then if sqlerrm <> 'TRAINING_EXERCISE_NOT_FOUND' then raise; end if; end;
  begin
    perform public.append_workout_exercise(v_session,'33300000-0000-4000-8000-000000000204');
    raise exception 'archived exercise accepted';
  exception when no_data_found then if sqlerrm <> 'TRAINING_EXERCISE_NOT_FOUND' then raise; end if; end;

  select updated_at into v_version from public.workout_session_exercises where id = v_id;
  v_new_version := public.mobile_save_workout_exercise(v_session,v_id,v_version,v_payload);
  if v_new_version <= v_version or not exists (select 1 from public.workout_sets
    where workout_session_exercise_id = v_id and actual_reps = 0 and actual_weight_kg is null and is_completed)
    or (select count(*) from public.workout_sets where workout_session_exercise_id = v_id) <> 1 then
    raise exception 'save payload/version/missing-vs-zero failed';
  end if;
  -- Lost-response recovery observes the committed payload and the SAME token.
  if (select updated_at from public.workout_session_exercises where id = v_id) <> v_new_version
    or (select notes from public.workout_session_exercises where id = v_id) <> 'recorded' then
    raise exception 'read-back differs from committed save';
  end if;
  begin
    perform public.save_workout_exercise(v_id,v_version,v_payload);
    raise exception 'stale Web save accepted';
  exception when serialization_failure then if sqlerrm <> 'SESSION_EXERCISE_CHANGED' then raise; end if; end;
  begin
    perform public.mobile_save_workout_exercise(v_session,'33300000-0000-4000-8000-000000000999',v_version,v_payload);
    raise exception 'removed exercise accepted';
  exception when raise_exception then if sqlerrm <> 'SESSION_EXERCISE_REMOVED' then raise; end if; end;
  begin
    perform public.mobile_save_workout_exercise('33300000-0000-4000-8000-000000000303',v_id,v_version,v_payload);
    raise exception 'closed save accepted';
  exception when raise_exception then if sqlerrm <> 'SESSION_CLOSED' then raise; end if; end;
  begin
    perform public.mobile_save_workout_exercise('33300000-0000-4000-8000-000000000999',v_id,v_version,v_payload);
    raise exception 'missing session accepted';
  exception when no_data_found then if sqlerrm <> 'TRAINING_SESSION_NOT_FOUND' then raise; end if; end;
  begin
    perform public.save_workout_exercise(v_id,v_new_version,jsonb_set(v_payload,'{sets,0,actual_reps}','null'));
    raise exception 'completed missing reps accepted';
  exception when invalid_parameter_value then null; end;

  -- Exhaust order to force failure AFTER creation, without depending on ignored
  -- catalog defaults. Proves atomic rollback of catalog and both ledgers.
  update public.workout_session_exercises set exercise_order = 10000 where id = v_id;
  begin
    perform public.mobile_mutate_workout_session(v_session,'create_and_add','m3-3b:create-fail',
      p_exercise => '{"name":"M3.3B ROLLBACK","suggestedSets":100}');
    raise exception 'invalid append succeeded';
  exception when check_violation then null; end;
  if exists (select 1 from public.exercises where nombre = 'M3.3B ROLLBACK') then
    raise exception 'atomic create leaked catalog row';
  end if;
  update public.workout_session_exercises set exercise_order = 1 where id = v_id;
  select * into v_created from public.mobile_mutate_workout_session(v_session,'create_and_add','m3-3b:create',
    p_exercise => '{"name":"M3.3B CREATED","suggestedSets":1,"suggestedReps":null,"suggestedWeight":null}');
  select * into v_replay from public.mobile_mutate_workout_session(v_session,'create_and_add','m3-3b:create',
    p_exercise => '{"name":"M3.3B CREATED","suggestedSets":1,"suggestedReps":null,"suggestedWeight":null}');
  if not v_replay.replayed or v_created.response_body <> v_replay.response_body
    or not exists (select 1 from public.workout_session_exercises
      where id = (v_created.response_body ->> 'sessionExerciseId')::uuid and source_type = 'manual_new' and exercise_order = 2) then
    raise exception 'atomic create/replay/order failed';
  end if;

  begin
    perform public.mobile_mutate_workout_session(v_session,'remove','m3-3b:remove-stale',v_id,v_version);
    raise exception 'unobserved version removed';
  exception when sqlstate 'PT409' then if sqlerrm <> 'SESSION_EXERCISE_CHANGED' then raise; end if; end;
  begin
    perform public.mobile_save_workout_exercise(v_session,v_id,v_version,v_payload);
    raise exception 'stale Mobile save accepted';
  exception when sqlstate 'PT409' then if sqlerrm <> 'SESSION_EXERCISE_CHANGED' then raise; end if; end;
  select * into v_added from public.mobile_mutate_workout_session(v_session,'remove','m3-3b:remove',v_id,v_new_version);
  select * into v_replay from public.mobile_mutate_workout_session(v_session,'remove','m3-3b:remove',v_id,v_new_version);
  if not v_replay.replayed or v_added.response_body <> v_replay.response_body
    or exists (select 1 from public.workout_session_exercises where id = v_id)
    or exists (select 1 from public.workout_sets where workout_session_exercise_id = v_id) then
    raise exception 'remove/replay/cascade failed';
  end if;
  perform public.append_workout_exercise(v_session,'33300000-0000-4000-8000-000000000201');
  perform public.mobile_mutate_workout_session(v_session,'remove','m3-3b:remove',v_id,v_new_version);
  if not exists (select 1 from public.workout_session_exercises where workout_session_id = v_session
    and exercise_id = '33300000-0000-4000-8000-000000000201' and id <> v_id) then
    raise exception 'replay deleted the re-added exercise';
  end if;
end;
$$;

-- RLS and definer ownership checks: another user's SAME key cannot replay data.
select set_config('request.jwt.claim.sub','33300000-0000-4000-8000-000000000002',true);
do $$
begin
  if exists (select 1 from public.workout_sessions where id = '33300000-0000-4000-8000-000000000301') then
    raise exception 'RLS exposed another owner';
  end if;
  begin
    perform public.mobile_mutate_workout_session('33300000-0000-4000-8000-000000000301','add_existing','m3-3b:add',
      p_exercise_id => '33300000-0000-4000-8000-000000000201');
    raise exception 'foreign session/ledger accessible';
  exception when no_data_found then if sqlerrm <> 'TRAINING_SESSION_NOT_FOUND' then raise; end if; end;
  if has_table_privilege('authenticated','public.mobile_idempotency_keys','select') then
    raise exception 'private ledger granted to client';
  end if;
end;
$$;
select set_config('request.jwt.claim.sub','33300000-0000-4000-8000-000000000001',true);
do $$
declare v_first record; v_replay record;
begin
  select * into v_first from public.mobile_mutate_workout_session('33300000-0000-4000-8000-000000000301','cancel','m3-3b:cancel');
  select * into v_replay from public.mobile_mutate_workout_session('33300000-0000-4000-8000-000000000301','cancel','m3-3b:cancel');
  if not v_replay.replayed or v_first.response_body <> v_replay.response_body
    or exists (select 1 from public.workout_sessions where id = '33300000-0000-4000-8000-000000000301')
    or not exists (select 1 from public.workout_sessions where id = '33300000-0000-4000-8000-000000000303') then
    raise exception 'cancel/replay damaged prior history';
  end if;
  begin
    perform public.mobile_mutate_workout_session('33300000-0000-4000-8000-000000000303','cancel','m3-3b:cancel-closed');
    raise exception 'cancel deleted history';
  exception when raise_exception then if sqlerrm <> 'SESSION_CLOSED' then raise; end if; end;
end;
$$;
reset role;
do $$
begin
  if exists (select 1 from public.mobile_idempotency_keys
    where idempotency_key = 'm3-3b:create-fail' or (operation = 'training.exercise.create.v1'
      and response_body #>> '{exercise,name}' = 'M3.3B ROLLBACK')) then
    raise exception 'atomic rollback leaked ledger rows';
  end if;
end;
$$;
rollback;
