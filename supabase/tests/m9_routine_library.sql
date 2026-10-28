-- Local regression; no production fixtures survive this transaction.
begin;
create function pg_temp.assert_true(ok boolean, label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL: %', label; end if; end;
$$;
create function pg_temp.expect_error(statement text, expected_code text, expected_message text default null)
returns void language plpgsql as $$
begin
  begin
    execute statement;
  exception when others then
    if sqlstate = expected_code and (expected_message is null or position(expected_message in sqlerrm) > 0) then return; end if;
    raise exception 'Expected % / %, got % / %', expected_code, expected_message, sqlstate, sqlerrm;
  end;
  raise exception 'Expected rejection: %', statement;
end;
$$;
insert into auth.users(id) values
 ('93000000-0000-4000-8000-000000000011'), ('93000000-0000-4000-8000-000000000012');
insert into public.routines(id,user_id,nombre,color,routine_order,is_active,notes,source_key) values
 ('93000000-0000-4000-8000-000000000111','93000000-0000-4000-8000-000000000011','PUSH','blue',1,true,'Routine note','original-seed'),
 ('93000000-0000-4000-8000-000000000112','93000000-0000-4000-8000-000000000011','ZZ NEXT',null,1,true,null,null),
 ('93000000-0000-4000-8000-000000000113','93000000-0000-4000-8000-000000000011','ARCHIVED','rose',5,false,null,null),
 ('93000000-0000-4000-8000-000000000114','93000000-0000-4000-8000-000000000012','OTHER','green',1,true,null,null);
insert into public.exercises(id,user_id,nombre,series_sugeridas,reps_sugeridas,peso_sugerido,descanso_min_sugerido_segundos,descanso_max_sugerido_segundos,is_active)
 values('93000000-0000-4000-8000-000000000211','93000000-0000-4000-8000-000000000011','PRESS',8,10,50,90,120,false),
 ('93000000-0000-4000-8000-000000000212','93000000-0000-4000-8000-000000000012','FOREIGN',1,8,20,60,90,true);
select set_config('ownlevel.skip_routine_default_sets','on',true);
insert into public.routine_exercises(id,routine_id,exercise_id,exercise_order,next_adjustment,next_adjustment_note,rest_min_seconds,rest_max_seconds,notes)
 values('93000000-0000-4000-8000-000000000311','93000000-0000-4000-8000-000000000111','93000000-0000-4000-8000-000000000211',1,'increase_reps','Next note',null,null,'Exercise note');
insert into public.routine_exercise_sets(user_id,routine_exercise_id,set_number,target_reps,target_weight_kg,target_rir,notes) values
 ('93000000-0000-4000-8000-000000000011','93000000-0000-4000-8000-000000000311',1,null,null,null,null),
 ('93000000-0000-4000-8000-000000000011','93000000-0000-4000-8000-000000000311',2,0,0,0,'Zero note');
select set_config('ownlevel.skip_routine_default_sets','',true);
insert into public.workout_sessions(id,user_id,routine_id,routine_name_snapshot,status,session_name,notes)
 values('93000000-0000-4000-8000-000000000411','93000000-0000-4000-8000-000000000011','93000000-0000-4000-8000-000000000111','OLD SNAPSHOT','completed','Past','History');

select pg_temp.assert_true(not has_function_privilege('anon','public.mobile_duplicate_training_routine(uuid,text,text,text,timestamptz,bigint)','execute'),'anonymous duplicate denied');
select pg_temp.assert_true(not has_function_privilege('anon','public.mobile_reorder_training_routines(uuid[],bigint,text)','execute'),'anonymous order denied');
select pg_temp.assert_true(not has_function_privilege('authenticated','ownlevel_private.bump_routine_list_version()','execute'),'counter trigger cannot be called');
set local role authenticated;
select set_config('request.jwt.claim.sub','93000000-0000-4000-8000-000000000011',true);
select pg_temp.expect_error('select * from public.mobile_idempotency_keys','42501');
select pg_temp.expect_error('select * from ownlevel_private.routine_list_versions','42501');
select pg_temp.expect_error('update ownlevel_private.routine_list_versions set version=0','42501');
select pg_temp.expect_error('insert into public.routines(user_id,nombre) values(''93000000-0000-4000-8000-000000000012'',''SPOOF'')','42501');

-- Exact copy, tied ranks, immutable source and history, replay before fresh CAS.
do $$
declare
 v_source public.routines%rowtype; v_before jsonb; v_history jsonb; v_catalog jsonb;
 v_copy uuid; v_first record; v_replay record; v_detail jsonb; v_snapshot jsonb; v_old_version bigint;
begin
 select * into v_source from public.routines where nombre='PUSH';
 v_before := to_jsonb(v_source);
 select jsonb_agg(to_jsonb(s)) into v_history from public.workout_sessions s;
 select jsonb_agg(to_jsonb(e)) into v_catalog from public.exercises e;
 select * into v_first from public.mobile_duplicate_training_routine(v_source.id,'PUSH copia','sand','copy-main',v_source.updated_at,v_source.template_version);
 v_copy := (v_first.response_body#>>'{routine,id}')::uuid;
 perform pg_temp.assert_true(v_first.response_status=201 and not v_first.replayed,'new duplicate');
 perform pg_temp.assert_true((select to_jsonb(r)=v_before from public.routines r where id=v_source.id),'entire original unchanged');
 perform pg_temp.assert_true((select jsonb_agg(to_jsonb(s))=v_history from public.workout_sessions s),'history unchanged');
 perform pg_temp.assert_true((select jsonb_agg(to_jsonb(e))=v_catalog from public.exercises e),'catalog unchanged');
 perform pg_temp.assert_true((select notes=v_source.notes and source_key is null and is_active from public.routines where id=v_copy),'routine metadata, active, no source key');
 v_snapshot := public.mobile_training_routines_snapshot();
 perform pg_temp.assert_true(v_snapshot#>>'{routines,0,id}'=v_source.id::text and v_snapshot#>>'{routines,1,id}'=v_copy::text,'copy directly after tied source');
 perform pg_temp.assert_true(v_first.response_body#>>'{routine,exerciseCount}'='1' and v_first.response_body#>>'{routine,setCount}'='2','no eight automatic sets');
 v_detail := public.mobile_training_routine_detail(v_copy);
 perform pg_temp.assert_true(v_detail#>'{items,0,targets}' = (public.mobile_training_routine_detail(v_source.id)#>'{items,0,targets}'),'all targets/notes and absent rest preserved');
 perform pg_temp.assert_true(v_detail#>'{items,0,targets,sets,0,targetWeightKg}'='null'::jsonb and v_detail#>'{items,0,targets,sets,1,targetWeightKg}'='0'::jsonb,'missing differs from zero');
 perform pg_temp.assert_true(v_detail#>>'{items,0,exercise,id}'='93000000-0000-4000-8000-000000000211','reuse same inactive catalog exercise');
 select * into v_replay from public.mobile_duplicate_training_routine(v_source.id,'PUSH copia','sand','copy-main',v_source.updated_at,v_source.template_version);
 perform pg_temp.assert_true(v_replay.replayed and v_replay.response_body=v_first.response_body,'same intent same copy');
 perform pg_temp.expect_error(format('select * from public.mobile_duplicate_training_routine(%L,''CHANGED'',null,''copy-main'',%L,%s)',v_source.id,v_source.updated_at,v_source.template_version),'P0001','IDEMPOTENCY_KEY_REUSED');
 perform pg_temp.expect_error(format('select * from public.mobile_duplicate_training_routine(%L,''STALE'',null,''stale-template'',%L,%s)',v_source.id,v_source.updated_at,v_source.template_version+1),'40001','ROUTINE_TEMPLATE_CHANGED');
 perform pg_temp.expect_error(format('select * from public.mobile_duplicate_training_routine(%L,''STALE'',null,''stale-identity'',%L,%s)',v_source.id,v_source.updated_at+interval '1 second',v_source.template_version),'40001','ROUTINE_CHANGED');
 perform pg_temp.expect_error(format('select * from public.mobile_duplicate_training_routine(''93000000-0000-4000-8000-000000000114'',''STOLEN'',null,''foreign-copy'',%L,1)',v_source.updated_at),'P0002','TRAINING_ROUTINE_NOT_FOUND');
 v_old_version := ownlevel_private.routine_list_version();
 perform pg_temp.expect_error(format('select * from public.mobile_duplicate_training_routine(%L,''PUSH'',null,''name-collision'',%L,%s)',v_source.id,v_source.updated_at,v_source.template_version),'23505');
 perform pg_temp.assert_true(ownlevel_private.routine_list_version()=v_old_version,'collision rolls back suffix and version');
 -- Replay remains the saved result if the original was subsequently changed.
 update public.routines set nombre='PUSH edited' where id=v_source.id;
 select * into v_replay from public.mobile_duplicate_training_routine(v_source.id,'PUSH copia','sand','copy-main',v_source.updated_at,v_source.template_version);
 perform pg_temp.assert_true(v_replay.replayed and v_replay.response_body=v_first.response_body,'replay ignores newer source revisions');
 -- Caller can deliberately select no color and a valid empty template.
 select * into v_source from public.routines where nombre='ARCHIVED';
 select * into v_first from public.mobile_duplicate_training_routine(v_source.id,'ARCHIVED copia',null,'archived-copy',v_source.updated_at,v_source.template_version);
 perform pg_temp.assert_true(v_first.response_body#>'{routine,color}'='null'::jsonb and v_first.response_body#>>'{routine,isActive}'='true' and v_first.response_body#>>'{routine,exerciseCount}'='0','archived source creates active empty copy');
 perform pg_temp.assert_true(not (select is_active from public.routines where id=v_source.id),'archived original unchanged');
end;
$$;

-- All twelve accepted by create and CAS identity; unknown still rejected.
do $$
declare v_color text; v_created record; v_id uuid; v_at timestamptz;
begin
 foreach v_color in array array['violet','indigo','blue','cyan','green','yellow','orange','rose','sand','stone','slate','graphite'] loop
   select * into v_created from public.mobile_create_training_routine('create-'||v_color,'COLOR '||v_color,v_color);
   v_id := (v_created.response_body#>>'{routine,id}')::uuid;
   select updated_at into v_at from public.routines where id=v_id;
   perform public.mobile_update_training_routine_identity(v_id,'COLOR '||v_color,v_color,v_at);
   perform pg_temp.assert_true((select color=v_color from public.routines where id=v_id),'color supported '||v_color);
 end loop;
 foreach v_color in array array['sand','stone','slate','graphite'] loop
   perform public.import_training_plan(jsonb_build_object('routines',jsonb_build_array(jsonb_build_object(
     'source_key','import-'||v_color,'name','IMPORT '||v_color,'color',v_color,'order',500,
     'exercises',jsonb_build_array(jsonb_build_object('source_key','import-exercise-'||v_color,
       'name','IMPORT EXERCISE '||v_color,'order',1,'legacy_group','pecho',
       'sets',jsonb_build_array(jsonb_build_object('set_number',1,'reps',0,'weight_kg',null))))
   ))));
   perform pg_temp.assert_true((select color=v_color from public.routines where nombre='IMPORT '||v_color),'import supports '||v_color);
 end loop;
 perform pg_temp.expect_error('select * from public.mobile_create_training_routine(''unknown'',''UNKNOWN'',''red'')','22023');
end;
$$;

-- Ordering: exact membership + version, stable replay, name tie breaker, rollback.
do $$
declare v_ids uuid[]; v_reverse uuid[]; v_version bigint; v_after bigint; v_first record; v_replay record; v_archived_order integer;
begin
 select array_agg(id order by routine_order,nombre,id) into v_ids from public.routines where is_active;
 select array_agg(id order by position desc) into v_reverse from unnest(v_ids) with ordinality as ids(id,position);
 v_version := ownlevel_private.routine_list_version();
 select routine_order into v_archived_order from public.routines where nombre='ARCHIVED';
 perform pg_temp.expect_error(format('select * from public.mobile_reorder_training_routines(%L::uuid[],%s,''missing-id'')',v_ids[2:cardinality(v_ids)],v_version),'PT409','ROUTINE_LIST_CHANGED');
 perform pg_temp.expect_error(format('select * from public.mobile_reorder_training_routines(%L::uuid[],%s,''foreign-id'')',v_ids||'93000000-0000-4000-8000-000000000114'::uuid,v_version),'PT409','ROUTINE_LIST_CHANGED');
 perform pg_temp.expect_error(format('select * from public.mobile_reorder_training_routines(%L::uuid[],%s,''duplicate-id'')',v_ids||v_ids[1],v_version),'22023');
 perform pg_temp.expect_error(format('select * from public.mobile_reorder_training_routines(%L::uuid[],%s,''stale-version'')',v_ids,v_version-1),'PT409','ROUTINE_LIST_CHANGED');
 select * into v_first from public.mobile_reorder_training_routines(v_reverse,v_version,'order-main');
 v_after := ownlevel_private.routine_list_version();
 perform pg_temp.assert_true(v_after>v_version and (v_first.response_body->>'listVersion')::bigint=v_after,'order version advances');
 perform pg_temp.assert_true((select array_agg(id order by routine_order,nombre,id)=v_reverse from public.routines where is_active),'all active rows ordered exactly');
 perform pg_temp.assert_true((select routine_order=v_archived_order from public.routines where nombre='ARCHIVED'),'archived order unchanged');
 select * into v_replay from public.mobile_reorder_training_routines(v_reverse,v_version,'order-main');
 perform pg_temp.assert_true(v_replay.replayed and v_replay.response_body=v_first.response_body and ownlevel_private.routine_list_version()=v_after,'order replay no second write');
 perform pg_temp.expect_error(format('select * from public.mobile_reorder_training_routines(%L::uuid[],%s,''order-main'')',v_ids,v_version),'P0001','IDEMPOTENCY_KEY_REUSED');
 perform public.mobile_reorder_training_routines(v_reverse,v_after,'order-noop');
 perform pg_temp.assert_true(ownlevel_private.routine_list_version()=v_after,'identical order no bump');
 update public.routines set color='graphite',notes='metadata' where id=v_reverse[1];
 perform pg_temp.assert_true(ownlevel_private.routine_list_version()=v_after,'color/notes no list bump');
 update public.routines set nombre=nombre||' renamed' where id=v_reverse[1];
 perform pg_temp.assert_true(ownlevel_private.routine_list_version()>v_after,'Web rename affects tie-break version');
 v_after := ownlevel_private.routine_list_version();
 update public.routines set is_active=false where id=v_reverse[1];
 update public.routines set is_active=true where id=v_reverse[1];
 perform pg_temp.assert_true(ownlevel_private.routine_list_version()=v_after+2,'archive+restore ABA detected');
 perform pg_temp.expect_error(format('select * from public.mobile_reorder_training_routines(%L::uuid[],%s,''aba'')',v_reverse,v_after),'PT409','ROUTINE_LIST_CHANGED');
end;
$$;

-- Boundary and corrupt-source failures undo ledger, ranks and version together.
reset role;
insert into public.routines(id,user_id,nombre,routine_order) values
 ('93000000-0000-4000-8000-000000000119','93000000-0000-4000-8000-000000000011','LAST',1000);
set local role authenticated;
do $$
declare v_source public.routines%rowtype; v_version bigint;
begin
 select * into v_source from public.routines where nombre='LAST';
 v_version:=ownlevel_private.routine_list_version();
 perform pg_temp.expect_error(format('select * from public.mobile_duplicate_training_routine(%L,''LAST COPY'',null,''capacity'',%L,%s)',v_source.id,v_source.updated_at,v_source.template_version),'22023');
 perform pg_temp.assert_true(ownlevel_private.routine_list_version()=v_version,'capacity rollback');
end;
$$;
reset role;
select pg_temp.assert_true(not exists(select 1 from public.mobile_idempotency_keys where idempotency_key in ('capacity','name-collision','stale-template','stale-identity','foreign-copy','missing-id','foreign-id','duplicate-id','stale-version','aba')),'failed intents leave no ledger entries');
-- Deliberate operator corruption: cross-owner exercise, impossible through editor.
update public.routine_exercises set exercise_id='93000000-0000-4000-8000-000000000212' where id='93000000-0000-4000-8000-000000000311';
set local role authenticated;
do $$
declare v_source public.routines%rowtype;
begin
 select * into v_source from public.routines where id='93000000-0000-4000-8000-000000000111';
 perform pg_temp.expect_error(format('select * from public.mobile_duplicate_training_routine(%L,''CORRUPT COPY'',null,''corrupt'',%L,%s)',v_source.id,v_source.updated_at,v_source.template_version),'P0001','TRAINING_ROUTINE_TEMPLATE_CORRUPT');
 perform pg_temp.expect_error('select public.mobile_training_routines_snapshot()','P0001','TRAINING_ROUTINE_TEMPLATE_CORRUPT');
end;
$$;
select set_config('request.jwt.claim.sub','93000000-0000-4000-8000-000000000012',true);
select pg_temp.assert_true((public.mobile_training_routines_snapshot()#>>'{routines,0,name}')='OTHER','other user isolated');
do $$
declare v_source public.routines%rowtype; v_result record;
begin
 select * into v_source from public.routines where nombre='OTHER';
 select * into v_result from public.mobile_duplicate_training_routine(v_source.id,'OTHER copia',null,'copy-main',v_source.updated_at,v_source.template_version);
 perform pg_temp.assert_true(not v_result.replayed and v_result.response_status=201,'same key scoped independently per user');
end;
$$;
select set_config('request.jwt.claim.sub','',true);
select pg_temp.expect_error('select public.mobile_training_routines_snapshot()','P0001','UNAUTHORIZED');
select pg_temp.expect_error('select * from public.mobile_reorder_training_routines(''{}''::uuid[],0,''no-auth'')','P0001','UNAUTHORIZED');
reset role;
insert into auth.users(id) values('93000000-0000-4000-8000-000000000013');
insert into public.routines(user_id,nombre) values('93000000-0000-4000-8000-000000000013','ACCOUNT CASCADE');
delete from auth.users where id='93000000-0000-4000-8000-000000000013';
select pg_temp.assert_true(not exists(select 1 from ownlevel_private.routine_list_versions where user_id='93000000-0000-4000-8000-000000000013'),'account cascade removes counter without recreation');
rollback;
