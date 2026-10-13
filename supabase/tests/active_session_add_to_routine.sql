-- Local runner fixture. Uses the real v1/v2 saves, finish ledger and version triggers.
insert into auth.users(id) values('35300000-0000-4000-8000-000000000001'),('35300000-0000-4000-8000-000000000002');
insert into public.day_logs(id,user_id,log_date) values('35300000-0000-4000-8000-000000000101','35300000-0000-4000-8000-000000000001','2026-10-13');
insert into public.exercises(id,user_id,nombre,series_sugeridas,reps_sugeridas,peso_sugerido,rir_sugerido,descanso_min_sugerido_segundos,descanso_max_sugerido_segundos)
values('35300000-0000-4000-8000-000000000201','35300000-0000-4000-8000-000000000001','BASE',3,10,40,2,60,90),
('35300000-0000-4000-8000-000000000202','35300000-0000-4000-8000-000000000001','EXTRA',4,12,55,3,90,120);
select set_config('request.jwt.claim.sub','35300000-0000-4000-8000-000000000001',false);
create function public.fixture_routine_session(opt_in boolean) returns table(sid uuid,rid uuid,eid uuid) language plpgsql as $$
declare v_owner uuid := '35300000-0000-4000-8000-000000000001'; v_base uuid; v_version timestamptz; v_payload jsonb;
begin
  insert into public.routines(user_id,nombre) values(v_owner,'PUSH') returning id into rid;
  insert into public.workout_sessions(user_id,day_log_id,routine_id,routine_name_snapshot) values(v_owner,'35300000-0000-4000-8000-000000000101',rid,'PUSH') returning id into sid;
  v_base := public.append_workout_exercise(sid,'35300000-0000-4000-8000-000000000201');
  eid := public.append_workout_exercise(sid,'35300000-0000-4000-8000-000000000202');
  v_payload := jsonb_build_object('is_completed',true,'decision','maintain','decision_note','','apply_to_routine',false,'notes','',
    'sets',jsonb_build_array(jsonb_build_object('set_number',1,'target_reps',null,'target_weight_kg',null,'target_rir',null,'actual_reps',1,'actual_weight_kg',null,'is_completed',true,'notes',null)));
  select updated_at into v_version from public.workout_session_exercises where id=v_base;
  perform public.mobile_save_workout_exercise_v2(sid,v_base,v_version,v_payload);
  v_payload := jsonb_build_object('is_completed',true,'decision','increase_weight','decision_note','','apply_to_routine',opt_in,'notes','today only',
    'sets',jsonb_build_array(
      jsonb_build_object('set_number',1,'target_reps',8,'target_weight_kg',50,'target_rir',2,'actual_reps',10,'actual_weight_kg',0,'is_completed',true,'notes','first'),
      jsonb_build_object('set_number',2,'target_reps',8,'target_weight_kg',50,'target_rir',1,'actual_reps',null,'actual_weight_kg',null,'is_completed',false,'notes',null),
      jsonb_build_object('set_number',3,'target_reps',null,'target_weight_kg',null,'target_rir',null,'actual_reps',0,'actual_weight_kg',null,'is_completed',true,'notes',null)));
  select updated_at into v_version from public.workout_session_exercises where id=eid;
  perform public.mobile_save_workout_exercise_v2(sid,eid,v_version,v_payload);
  return next;
end; $$;
grant execute on function public.fixture_routine_session(boolean) to authenticated;
do $$ begin
  assert not has_function_privilege('anon','public.mobile_save_workout_exercise_v2(uuid,uuid,timestamptz,jsonb)','execute');
  assert not has_function_privilege('anon','public.mobile_finish_training_session_v2(uuid,jsonb,text)','execute');
  assert has_function_privilege('authenticated','public.mobile_save_workout_exercise_v2(uuid,uuid,timestamptz,jsonb)','execute');
  assert has_function_privilege('authenticated','public.mobile_finish_training_session_v2(uuid,jsonb,text)','execute');
end; $$;
set role authenticated;
do $$
declare f record; x record; replay record; v_relation uuid; v_before bigint; v_after bigint; v_sets jsonb; v_version timestamptz; v_flag boolean; v_id uuid; v_i integer;
  v_metadata jsonb := '{"energy_level":null,"performance_level":null,"pain_level":null,"notes":null}';
begin
  for v_i in 0..6 loop
    select * into f from public.fixture_routine_session(v_i<>0);
    if v_i=2 then update public.routines set is_active=false where id=f.rid; end if;
    if v_i=3 then insert into public.routine_exercises(routine_id,exercise_id,exercise_order) values(f.rid,'35300000-0000-4000-8000-000000000202',1); end if;
    if v_i=4 then update public.workout_sets set is_completed=false where workout_session_exercise_id=f.eid; end if;
    if v_i=5 then delete from public.routines where id=f.rid; end if;
    if v_i=6 then
      -- An old client forces apply_to_routine=false for extras. It must not clear v2's flag.
      select updated_at into v_version from public.workout_session_exercises where id=f.eid;
      perform public.mobile_save_workout_exercise(f.sid,f.eid,v_version,
        '{"is_completed":true,"decision":"maintain","decision_note":"","apply_to_routine":false,"notes":"","sets":[{"set_number":1,"target_reps":null,"target_weight_kg":null,"target_rir":null,"actual_reps":12,"actual_weight_kg":null,"is_completed":true,"notes":null}]}');
      select add_to_routine_on_finish into v_flag from public.workout_session_exercises where id=f.eid;
      assert v_flag, 'legacy save erased opt-in';
    end if;
    -- Reset the fixture's per-transaction registry to model a fresh finish request.
    perform set_config('ownlevel.template_bumped_'||replace(f.rid::text,'-','_'),'0',true);
    select template_version into v_before from public.routines where id=f.rid;
    select * into x from public.mobile_finish_training_session_v2(f.sid,v_metadata,'finish-'||v_i);
    assert x.response_status=200 and not x.replayed, 'finish failed';
    if v_i=0 then assert x.response_body->'routineAdditions'='[]'::jsonb, 'opt-out modified routine';
    else assert x.response_body->'routineAdditions'->0->>'outcome'=case v_i when 2 then 'routine_unavailable' when 3 then 'already_in_routine' when 4 then 'no_completed_sets' when 5 then 'routine_unavailable' else 'added' end, 'wrong receipt'; end if;
    select template_version into v_after from public.routines where id=f.rid;
    assert v_after is not distinct from (case when v_i in(1,6) then v_before+1 else v_before end), 'wrong template version';
    if v_i=1 then
      select id into v_relation from public.routine_exercises where routine_id=f.rid;
      assert (select rest_min_seconds is null and rest_max_seconds is null and notes is null and next_adjustment='increase_weight' from public.routine_exercises where id=v_relation), 'catalog defaults or session note leaked';
      select jsonb_agg(jsonb_build_array(set_number,target_reps,target_weight_kg,target_rir) order by set_number) into v_sets from public.routine_exercise_sets where routine_exercise_id=v_relation;
      assert v_sets='[[1,10,0,2],[2,0,null,null]]'::jsonb, 'completed targets not copied faithfully';
      assert (select routine_exercise_id is null and source_type='extra' and notes='today only' from public.workout_session_exercises where id=f.eid), 'historical snapshot changed';
      begin perform public.mobile_replace_training_routine_template(f.rid,v_before,'[]'); raise exception 'stale editor accepted'; exception when serialization_failure then null; end;
    end if;
    select * into replay from public.mobile_finish_training_session_v2(f.sid,v_metadata,'finish-'||v_i);
    assert replay.replayed and replay.response_body=x.response_body, 'receipt replay changed';
    select * into replay from public.mobile_finish_training_session(f.sid,v_metadata,'finish-'||v_i);
    assert not(replay.response_body ? 'routineAdditions'), 'legacy finish response changed';
    begin perform public.mobile_finish_training_session_v2(f.sid,v_metadata||'{"notes":"changed"}', 'finish-'||v_i); raise exception 'key reuse accepted'; exception when sqlstate 'PT409' then null; end;
  end loop;
  -- Ownership and CAS remain authoritative for the new save and finish.
  select * into f from public.fixture_routine_session(true);
  select updated_at into v_version from public.workout_session_exercises where id=f.eid;
  begin perform public.mobile_save_workout_exercise_v2(f.sid,f.eid,v_version-interval '1 second','{"is_completed":false,"decision":"maintain","decision_note":"","apply_to_routine":false,"notes":"","sets":[{"set_number":1,"target_reps":null,"target_weight_kg":null,"target_rir":null,"actual_reps":null,"actual_weight_kg":null,"is_completed":false,"notes":null}]}'); raise exception 'stale save accepted'; exception when sqlstate 'PT409' then null; end;
  perform set_config('request.jwt.claim.sub','35300000-0000-4000-8000-000000000002',true);
  begin perform public.mobile_save_workout_exercise_v2(f.sid,f.eid,v_version,'{}'); raise exception 'foreign save accepted'; exception when sqlstate 'P0002' then null; end;
  begin perform public.mobile_finish_training_session_v2(f.sid,v_metadata,'foreign'); raise exception 'foreign finish accepted'; exception when sqlstate 'P0002' then null; end;
  perform set_config('request.jwt.claim.sub','35300000-0000-4000-8000-000000000001',true);
  perform public.mobile_finish_training_session_v2(f.sid,v_metadata,'owner-final');
  select * into f from public.fixture_routine_session(true);
  update public.workout_sets set is_completed=false where workout_session_exercise_id in(select id from public.workout_session_exercises where workout_session_id=f.sid);
  begin perform public.mobile_finish_training_session_v2(f.sid,v_metadata,'empty-failed'); raise exception 'empty finish accepted'; exception when sqlstate 'P0001' then
    assert sqlerrm='NO_COMPLETED_SETS', 'wrong failure'; end;
  assert (select status='in_progress' from public.workout_sessions where id=f.sid), 'failed finish mutated session';
  perform public.cancel_workout_session(f.sid);
end; $$;
reset role;

do $$ begin
  assert not exists(select 1 from public.mobile_idempotency_keys where idempotency_key in ('empty-failed','foreign')), 'failed finish left a ledger row';
end; $$;
