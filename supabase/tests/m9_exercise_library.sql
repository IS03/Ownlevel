-- Local, disposable schema only. Production functions are loaded by the runner.
begin;
insert into auth.users(id) values('94100000-0000-4000-8000-000000000001'),('94100000-0000-4000-8000-000000000002');
insert into public.day_logs(user_id,log_date) values('94100000-0000-4000-8000-000000000001',(timezone('America/Argentina/Cordoba',now()))::date);
insert into public.exercises(id,user_id,nombre,series_sugeridas,reps_sugeridas,peso_sugerido,rir_sugerido,descanso_min_sugerido_segundos,descanso_max_sugerido_segundos,updated_at)
values('94100000-0000-4000-8000-000000000201','94100000-0000-4000-8000-000000000001','PRESS',3,12,55,2,90,120,'2020-01-01'),
('94100000-0000-4000-8000-000000000202','94100000-0000-4000-8000-000000000002','FOREIGN',3,12,55,2,90,120,'2020-01-01');
insert into public.routines(id,user_id,nombre,is_active) values
('94100000-0000-4000-8000-000000000101','94100000-0000-4000-8000-000000000001','PUSH',true),
('94100000-0000-4000-8000-000000000102','94100000-0000-4000-8000-000000000001','OLD',false);
insert into public.routine_exercises(id,routine_id,exercise_id,exercise_order) values
('94100000-0000-4000-8000-000000000301','94100000-0000-4000-8000-000000000101','94100000-0000-4000-8000-000000000201',1),
('94100000-0000-4000-8000-000000000302','94100000-0000-4000-8000-000000000102','94100000-0000-4000-8000-000000000201',1);
insert into public.routine_exercise_sets(user_id,routine_exercise_id,set_number,target_reps,target_weight_kg,target_rir) values
('94100000-0000-4000-8000-000000000001','94100000-0000-4000-8000-000000000301',1,null,null,null),
('94100000-0000-4000-8000-000000000001','94100000-0000-4000-8000-000000000301',2,0,0,0);
set local role authenticated;
select set_config('request.jwt.claim.sub','94100000-0000-4000-8000-000000000001',true);
do $$
declare
  e uuid := '94100000-0000-4000-8000-000000000201';
  r uuid := '94100000-0000-4000-8000-000000000101';
  payload jsonb := '{"name":"RENAMED","muscleGroup":"pecho","muscleGroupLabel":null,"implement":"Barra","weightMode":"Total con barra","notes":"Técnica"}';
  result jsonb; v_session uuid; v_legacy uuid; v_day uuid; v_version timestamptz; replay boolean; n integer; row record;
begin
  result := public.mobile_update_training_exercise_identity(e,payload,'2020-01-01');
  if result->'exercise'->>'suggestedReps' <> '12' or result->'exercise'->>'suggestedWeight' <> '55.00'
    or result->'exercise'->>'suggestedSets' <> '3' or result->'exercise'->>'suggestedRir' <> '2'
    or result->'exercise'->>'suggestedRestMinSeconds' <> '90' or result->'exercise'->>'suggestedRestMaxSeconds' <> '120' then raise exception 'DEFAULTS_LOST'; end if;
  select count(*) into n from public.routine_exercises where exercise_id=e;
  if n <> 2 or jsonb_array_length(result->'exercise'->'routineIds') <> 1 then raise exception 'MEMBERSHIPS_CHANGED'; end if;
  v_version := (result->'exercise'->>'updatedAt')::timestamptz;
  perform public.mobile_update_training_exercise_identity(e,payload,v_version);
  begin
    perform public.mobile_update_training_exercise_identity(e,payload,v_version); raise exception 'REPEATED_TOKEN';
  exception when serialization_failure then null; end;
  begin
    perform public.mobile_update_training_exercise_identity(e,payload,'2020-01-01'); raise exception 'STALE_ACCEPTED';
  exception when serialization_failure then if sqlerrm <> 'EXERCISE_CHANGED' then raise; end if; end;
  begin
    perform public.mobile_update_training_exercise_identity('94100000-0000-4000-8000-000000000202',payload,'2020-01-01'); raise exception 'FOREIGN_ACCEPTED';
  exception when no_data_found then null; end;
  begin
    perform public.mobile_update_training_exercise_identity(e,payload||'{"suggestedWeight":0}',now()); raise exception 'EXTRA_KEYS_ACCEPTED';
  exception when invalid_parameter_value then null; end;

  select response_body into result from public.mobile_start_training_session_from_template('empty-start',r);
  v_session := (result->'session'->>'id')::uuid;
  select ws.* into row from public.workout_sets ws join public.workout_session_exercises se on se.id=ws.workout_session_exercise_id where se.workout_session_id=v_session and ws.set_number=1;
  if row.target_reps is not null or row.target_weight_kg is not null or row.actual_reps is not null or row.actual_weight_kg is not null or row.target_rir is not null then raise exception 'MISSING_BECAME_DEFAULT'; end if;
  select ws.* into row from public.workout_sets ws join public.workout_session_exercises se on se.id=ws.workout_session_exercise_id where se.workout_session_id=v_session and ws.set_number=2;
  if row.target_reps <> 0 or row.target_weight_kg <> 0 or row.actual_reps <> 0 or row.actual_weight_kg <> 0 or row.target_rir <> 0 then raise exception 'ZERO_LOST'; end if;
  select replayed,response_body into replay,result from public.mobile_start_training_session_from_template('empty-start',r);
  if not replay or (result->'session'->>'id')::uuid <> v_session then raise exception 'BAD_REPLAY'; end if;
  select response_status into n from public.mobile_start_training_session_from_template('second-start',r);
  if n <> 409 then raise exception 'ACTIVE_GUARD_LOST'; end if;
  begin
    perform public.mobile_start_training_session('empty-start',r); raise exception 'POLICY_CHANGE_ACCEPTED';
  exception when raise_exception then if sqlerrm <> 'IDEMPOTENCY_KEY_REUSED' then raise; end if; end;
  update public.workout_sessions set status='completed' where id=v_session;
  select response_body into result from public.mobile_start_training_session('legacy-start',r);
  v_legacy := (result->'session'->>'id')::uuid;
  select ws.* into row from public.workout_sets ws join public.workout_session_exercises se on se.id=ws.workout_session_exercise_id where se.workout_session_id=v_legacy and ws.set_number=1;
  if row.target_reps <> 12 or row.target_weight_kg <> 55 then raise exception 'LEGACY_CHANGED'; end if;
  update public.workout_sessions set status='completed' where id=v_legacy;
  select id into v_day from public.day_logs limit 1;
  v_legacy := public.start_workout_session(v_day,r);
  select ws.* into row from public.workout_sets ws join public.workout_session_exercises se on se.id=ws.workout_session_exercise_id where se.workout_session_id=v_legacy and ws.set_number=1;
  if row.target_reps <> 12 or row.target_weight_kg <> 55 then raise exception 'WEB_CHANGED'; end if;
  -- Subsequent identity changes cannot touch completed snapshots or targets.
  perform public.mobile_update_training_exercise_identity(e,payload||'{"name":"NEW NAME"}',(select updated_at from public.exercises where id=e));
  if exists(select 1 from public.workout_session_exercises where workout_session_id=v_session and nombre_snapshot <> 'RENAMED') then raise exception 'HISTORY_CHANGED'; end if;
end;
$$;
reset role;
do $$ begin
  if has_function_privilege('anon','public.mobile_update_training_exercise_identity(uuid,jsonb,timestamptz)','execute')
    or has_function_privilege('anon','public.mobile_start_training_session_from_template(text,uuid)','execute')
    or not has_function_privilege('authenticated','public.mobile_update_training_exercise_identity(uuid,jsonb,timestamptz)','execute') then raise exception 'BAD_GRANTS'; end if;
end; $$;
rollback;
