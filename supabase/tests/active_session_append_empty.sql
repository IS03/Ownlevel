-- Step 2: run after the Training migrations; synthetic fixtures always roll back.
begin;
insert into auth.users(id,aud,role,email) values
('94200000-0000-4000-8000-000000000001','authenticated','authenticated','append-owner@example.invalid'),
('94200000-0000-4000-8000-000000000002','authenticated','authenticated','append-other@example.invalid');
insert into public.day_logs(id,user_id,log_date) values
('94200000-0000-4000-8000-000000000101','94200000-0000-4000-8000-000000000001','2026-10-13'),
('94200000-0000-4000-8000-000000000102','94200000-0000-4000-8000-000000000002','2026-10-13');
insert into public.exercises(id,user_id,nombre,grupo_muscular,implement,weight_mode,
 series_sugeridas,reps_sugeridas,peso_sugerido,rir_sugerido,descanso_min_sugerido_segundos,descanso_max_sugerido_segundos,is_active) values
('94200000-0000-4000-8000-000000000201','94200000-0000-4000-8000-000000000001','APPEND DEFAULTS','pecho','Barra','Total con barra',4,12,55,2,120,180,true),
('94200000-0000-4000-8000-000000000202','94200000-0000-4000-8000-000000000001','APPEND ZERO','pecho',null,null,3,0,0,0,0,0,true),
('94200000-0000-4000-8000-000000000203','94200000-0000-4000-8000-000000000001','APPEND NULL',null,null,null,null,null,null,null,null,null,true),
('94200000-0000-4000-8000-000000000204','94200000-0000-4000-8000-000000000002','APPEND FOREIGN',null,null,null,3,8,40,2,90,120,true),
('94200000-0000-4000-8000-000000000205','94200000-0000-4000-8000-000000000001','APPEND ARCHIVED',null,null,null,3,8,40,2,90,120,false);
insert into public.workout_sessions(id,user_id,day_log_id,status) values
('94200000-0000-4000-8000-000000000301','94200000-0000-4000-8000-000000000001','94200000-0000-4000-8000-000000000101','in_progress'),
('94200000-0000-4000-8000-000000000302','94200000-0000-4000-8000-000000000002','94200000-0000-4000-8000-000000000102','in_progress'),
('94200000-0000-4000-8000-000000000303','94200000-0000-4000-8000-000000000001','94200000-0000-4000-8000-000000000101','completed');
create function pg_temp.assert_blank(p_id uuid, p_source text) returns void language plpgsql as $$
begin
  if not exists(select 1 from public.workout_session_exercises where id=p_id
    and source_type=p_source and routine_exercise_id is null and planned_sets_count=1 and series_reales=1
    and reps_reales is null and peso_real is null and rest_min_seconds_snapshot is null and rest_max_seconds_snapshot is null
    and decision='maintain' and not apply_to_routine and not is_completed and completed_at is null)
    or (select count(*) from public.workout_sets where workout_session_exercise_id=p_id) <> 1
    or not exists(select 1 from public.workout_sets where workout_session_exercise_id=p_id and set_number=1
      and target_reps is null and target_weight_kg is null and target_rir is null
      and actual_reps is null and actual_weight_kg is null and not is_completed and completed_at is null) then
    raise exception 'Addition must have one blank set, no rest, maintain, and empty legacy actuals';
  end if;
end;
$$;
set local role authenticated;
select set_config('request.jwt.claim.sub','94200000-0000-4000-8000-000000000001',true);
do $$
declare
  sid constant uuid := '94200000-0000-4000-8000-000000000301';
  eid constant uuid := '94200000-0000-4000-8000-000000000201';
  added record; replay record; created record; row_id uuid; before_version timestamptz; saved jsonb;
begin
  select updated_at into before_version from public.workout_sessions where id=sid;
  -- Mobile existing exercise and old Web direct RPC share exactly the same defaults policy.
  select * into added from public.mobile_mutate_workout_session(sid,'add_existing','empty:add',p_exercise_id=>eid);
  row_id := (added.response_body->>'sessionExerciseId')::uuid;
  perform pg_temp.assert_blank(row_id,'extra');
  if added.response_status <> 201 or added.replayed or not exists(select 1 from public.workout_session_exercises
    where id=row_id and nombre_snapshot='APPEND DEFAULTS' and grupo_muscular_snapshot='pecho'
      and implement_snapshot='Barra' and weight_mode_snapshot='Total con barra' and exercise_order=1)
    or (select updated_at from public.workout_sessions where id=sid) <= before_version then
    raise exception 'Identity/order/source or structure CAS was lost';
  end if;
  select updated_at into before_version from public.workout_sessions where id=sid;
  perform public.mobile_save_workout_exercise(sid,row_id,(select updated_at from public.workout_session_exercises where id=row_id),
    '{"is_completed":false,"decision":"maintain","decision_note":"","apply_to_routine":false,"notes":"today","sets":[{"set_number":1,"target_reps":null,"target_weight_kg":null,"target_rir":null,"actual_reps":0,"actual_weight_kg":0,"is_completed":false,"notes":null}]}');
  select to_jsonb(s) into saved from public.workout_sets s where workout_session_exercise_id=row_id;
  select * into replay from public.mobile_mutate_workout_session(sid,'add_existing','empty:add',p_exercise_id=>eid);
  if not replay.replayed or replay.response_body <> added.response_body
    or saved is distinct from (select to_jsonb(s) from public.workout_sets s where workout_session_exercise_id=row_id)
    or (select updated_at from public.workout_sessions where id=sid) <> before_version then
    raise exception 'Replay cleared real zero values, duplicated sets, or changed structure version';
  end if;
  perform pg_temp.assert_blank(public.append_workout_exercise(sid,'94200000-0000-4000-8000-000000000202'),'extra');
  perform pg_temp.assert_blank(public.append_workout_exercise(sid,'94200000-0000-4000-8000-000000000203','manual_new'),'manual_new');
  -- Even suggestions exceeding the session's 50-set limit are ignored, not erased.
  select * into created from public.mobile_mutate_workout_session(sid,'create_and_add','empty:create',
    p_exercise=>'{"name":"APPEND CREATED","suggestedSets":100,"suggestedReps":15,"suggestedWeight":45.5,"suggestedRir":0,"suggestedRestMinSeconds":60,"suggestedRestMaxSeconds":90}');
  perform pg_temp.assert_blank((created.response_body->>'sessionExerciseId')::uuid,'manual_new');
  select * into replay from public.mobile_mutate_workout_session(sid,'create_and_add','empty:create',
    p_exercise=>'{"name":"APPEND CREATED","suggestedSets":100,"suggestedReps":15,"suggestedWeight":45.5,"suggestedRir":0,"suggestedRestMinSeconds":60,"suggestedRestMaxSeconds":90}');
  if not replay.replayed or replay.response_body <> created.response_body
    or not exists(select 1 from public.exercises where id=(created.response_body->>'exerciseId')::uuid
      and series_sugeridas=100 and reps_sugeridas=15 and peso_sugerido=45.5 and rir_sugerido=0
      and descanso_min_sugerido_segundos=60 and descanso_max_sugerido_segundos=90)
    or not exists(select 1 from public.exercises where id=eid and series_sugeridas=4 and reps_sugeridas=12
      and peso_sugerido=55 and rir_sugerido=2 and descanso_min_sugerido_segundos=120 and descanso_max_sugerido_segundos=180)
    or (select count(*) from public.workout_session_exercises where workout_session_id=sid) <> 4 then
    raise exception 'Creation replay or preservation of catalog defaults failed';
  end if;
  begin
    perform public.append_workout_exercise(sid,eid);
    raise exception 'Duplicate accepted';
  exception when raise_exception then if sqlerrm <> 'SESSION_EXERCISE_ALREADY_EXISTS' then raise; end if; end;
  begin
    perform public.append_workout_exercise(sid,'94200000-0000-4000-8000-000000000204');
    raise exception 'Foreign exercise accepted';
  exception when no_data_found then if sqlerrm <> 'TRAINING_EXERCISE_NOT_FOUND' then raise; end if; end;
  begin
    perform public.append_workout_exercise(sid,'94200000-0000-4000-8000-000000000205');
    raise exception 'Archived exercise accepted';
  exception when no_data_found then if sqlerrm <> 'TRAINING_EXERCISE_NOT_FOUND' then raise; end if; end;
  begin
    perform public.append_workout_exercise('94200000-0000-4000-8000-000000000302',eid);
    raise exception 'Foreign session accepted';
  exception when no_data_found then if sqlerrm <> 'TRAINING_SESSION_NOT_FOUND' then raise; end if; end;
  begin
    perform public.append_workout_exercise('94200000-0000-4000-8000-000000000303',eid);
    raise exception 'Completed session accepted';
  exception when raise_exception then if sqlerrm <> 'SESSION_CLOSED' then raise; end if; end;
  begin
    perform public.append_workout_exercise(sid,eid,'routine');
    raise exception 'Invalid source accepted';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.append_workout_exercise(sid,eid,null);
    raise exception 'Null source accepted';
  exception when invalid_parameter_value then null; end;
  if has_function_privilege('anon','public.append_workout_exercise(uuid,uuid,text)','execute')
    or not has_function_privilege('authenticated','public.append_workout_exercise(uuid,uuid,text)','execute')
    or (select prosecdef from pg_proc where oid='public.append_workout_exercise(uuid,uuid,text)'::regprocedure) then
    raise exception 'Append privileges or security invoker changed';
  end if;
end;
$$;
select set_config('request.jwt.claim.sub','',true);
do $$
begin
  perform public.append_workout_exercise('94200000-0000-4000-8000-000000000301','94200000-0000-4000-8000-000000000201');
  raise exception 'Missing identity accepted';
exception when raise_exception then if sqlerrm <> 'UNAUTHORIZED' then raise; end if;
end;
$$;
rollback;
