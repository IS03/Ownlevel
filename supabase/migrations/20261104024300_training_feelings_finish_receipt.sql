-- Negotiated immutable receipt only. Installed v1 functions/responses are unchanged.
begin;
set local lock_timeout = '5s';
create function public.finish_training_feelings_v2(p_session_id uuid, p_input jsonb)
returns table(response_status smallint, response_body jsonb, replayed boolean)
language plpgsql security definer set search_path = '' set lock_timeout = '3s' set statement_timeout = '8s' as $$
declare
  u uuid; ledger public.mobile_idempotency_keys; previous public.mobile_idempotency_keys;
  h text; key text; receipt record; finished jsonb; result jsonb;
begin
  u := public.lock_training_user_mutations();
  if p_session_id is null or jsonb_typeof(p_input) is distinct from 'object'
    or p_input->>'operation' is distinct from 'finish'
    or jsonb_typeof(p_input->'idempotencyKey') is distinct from 'string'
    or p_input->>'idempotencyKey' !~ '^[A-Za-z0-9._:-]{1,128}$' then
    raise exception using errcode='22023',message='INVALID_FEELINGS_INPUT';
  end if;
  key := p_input->>'idempotencyKey';
  -- Same ownership, including replay: never expose a receipt for a foreign session.
  perform 1 from public.workout_sessions where id=p_session_id and user_id=u for update;
  if not found then raise exception using errcode='P0002',message='TRAINING_SESSION_NOT_FOUND'; end if;
  h := encode(extensions.digest(convert_to(jsonb_build_object('sessionId',p_session_id,'input',p_input-'idempotencyKey')::text,'UTF8'),'sha256'),'hex');
  insert into public.mobile_idempotency_keys(user_id,operation,idempotency_key,request_hash,expires_at)
    values(u,'training.feelings.finish.v2',key,h,'infinity') on conflict do nothing;
  select * into ledger from public.mobile_idempotency_keys l where l.user_id=u and l.operation='training.feelings.finish.v2' and l.idempotency_key=key for update;
  if ledger.request_hash <> h then raise exception using errcode='PT409',message='IDEMPOTENCY_KEY_REUSED'; end if;
  if ledger.state='completed' then return query select ledger.response_status,ledger.response_body,true; return; end if;
  -- An older receipt lacks the original richer result. Never upgrade it from mutable present-day state.
  select * into previous from public.mobile_idempotency_keys l where l.user_id=u and l.operation='training.feelings.finish.v1' and l.idempotency_key=key;
  if found then
    if previous.request_hash <> h then raise exception using errcode='PT409',message='IDEMPOTENCY_KEY_REUSED'; end if;
    raise exception using errcode='PT409',message='FEELINGS_RECEIPT_VERSION_UNAVAILABLE';
  end if;
  -- Exactly one domain finish; this existing RPC also validates the complete input/CAS and preserves legacy metadata.
  select * into receipt from public.mutate_training_feelings_v1(p_session_id,p_input);
  if receipt.replayed then raise exception 'Unexpected older feelings replay'; end if;
  select jsonb_build_object(
    'status','finished','sessionId',s.id,'sessionStatus',s.status,
    'name',coalesce(s.session_name,s.routine_name_snapshot,'Sesión libre'),'routineId',s.routine_id,
    'logDate',d.log_date,'startedAt',s.started_at,'endedAt',s.ended_at,'sessionUpdatedAt',s.updated_at,
    'metadata',jsonb_build_object('energyLevel',s.energy_level,'performanceLevel',s.performance_level,'painLevel',s.pain_level,'notes',s.notes),
    'exerciseCount',(select count(*) from public.workout_session_exercises x where x.workout_session_id=s.id and x.user_id=u),
    'completedExerciseCount',(select count(*) from public.workout_session_exercises x where x.workout_session_id=s.id and x.user_id=u and x.is_completed),
    'completedSetCount',(select count(*) from public.workout_session_exercises x join public.workout_sets t on t.workout_session_exercise_id=x.id where x.workout_session_id=s.id and x.user_id=u and t.is_completed),
    'routineAdditions',(select coalesce(jsonb_agg(jsonb_build_object('sessionExerciseId',x.id,'exerciseId',x.exercise_id,'name',x.nombre_snapshot,'outcome',x.routine_addition_outcome) order by x.exercise_order,x.id),'[]'::jsonb)
      from public.workout_session_exercises x where x.workout_session_id=s.id and x.user_id=u and x.routine_addition_outcome is not null)
  ) into finished from public.workout_sessions s join public.day_logs d on d.id=s.day_log_id
    where s.id=p_session_id and s.user_id=u and s.status='completed';
  if finished is null then raise exception 'Finished session snapshot failed'; end if;
  result := jsonb_build_object('contractVersion','training-feelings-finish/2','feelings',receipt.response_body,'finished',finished);
  update public.mobile_idempotency_keys l set state='completed',response_status=200,response_body=result,
    resource_type='workout_session',resource_id=p_session_id,completed_at=clock_timestamp()
    where l.user_id=u and l.operation='training.feelings.finish.v2' and l.idempotency_key=key;
  return query select 200::smallint,result,false;
end;
$$;
revoke all on function public.finish_training_feelings_v2(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.finish_training_feelings_v2(uuid,jsonb) to authenticated;
comment on function public.finish_training_feelings_v2(uuid,jsonb) is 'Opt-in immutable finish+feelings receipt. Replay uses original metadata and recorded routine outcomes; never upgrades an older receipt or finishes twice.';
commit;
