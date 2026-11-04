-- Insights #367 PR 2: EXPAND only. No legacy energy backfill or response changes.
begin;
set local lock_timeout = '5s';

create function public.training_feeling_timestamp_valid(value text)
returns boolean language plpgsql stable security invoker set search_path = '' as $$
begin
  if value is null or value !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](\.[0-9]{1,6})?(Z|[+-]([01][0-9]|2[0-3]):[0-5][0-9])$' then return false; end if;
  return pg_catalog.isfinite(value::timestamptz);
exception when invalid_datetime_format or datetime_field_overflow then return false;
end;
$$;

create function public.training_feeling_fact_valid(f jsonb, phase text, stored boolean)
returns boolean language plpgsql stable security invoker set search_path = '' as $$
declare k text; required_keys text[] := array['value','instrumentVersion','declaredMoment','declaredAt','capturedAt','source'];
begin
  if stored then required_keys := required_keys || array['receivedAt','temporalQuality']; end if;
  if jsonb_typeof(f) is distinct from 'object' then return false; end if;
  if not f ?& required_keys or exists(select 1 from jsonb_object_keys(f) x where not x = any(required_keys)) then return false; end if;
  if jsonb_typeof(f->'value') is distinct from 'number' then return false; end if;
  if (f->>'value')::numeric not between 1 and 5 or (f->>'value')::numeric <> trunc((f->>'value')::numeric)
    or f->>'instrumentVersion' is distinct from 'energy-fatigue/1'
    or f->>'declaredMoment' is distinct from phase
    or coalesce(f->>'source','') not in ('mobile','web') then return false; end if;
  foreach k in array array['declaredAt','capturedAt'] loop
    if jsonb_typeof(f->k) is distinct from 'null' and
      (jsonb_typeof(f->k) is distinct from 'string' or not public.training_feeling_timestamp_valid(f->>k)) then return false; end if;
  end loop;
  if stored and (not public.training_feeling_timestamp_valid(f->>'receivedAt')
    or f->>'temporalQuality' is distinct from case when f->'capturedAt' = 'null'::jsonb then 'unknown' else 'unverified_client_clock' end) then return false; end if;
  return true;
end;
$$;

create function public.training_feelings_values_valid(f jsonb)
returns boolean language plpgsql stable security invoker set search_path = '' as $$
declare k text; v jsonb;
begin
  if jsonb_typeof(f) is distinct from 'object' then return false; end if;
  for k,v in select * from jsonb_each(f) loop
    if k not in ('energyPre','fatiguePre','energyPost','fatiguePost') or not public.training_feeling_fact_valid(v,
      case when k in ('energyPre','fatiguePre') then 'pre' else 'post' end,true) then return false; end if;
  end loop;
  return true;
end;
$$;

-- Ownership is inherited from the parent, without duplicating a user_id that could drift.
create table public.workout_session_feelings (
  session_id uuid primary key references public.workout_sessions(id) on delete cascade,
  revision bigint not null check(revision between 1 and 9007199254740991),
  facts jsonb not null check(public.training_feelings_values_valid(facts)),
  updated_at timestamptz not null
);
alter table public.workout_session_feelings enable row level security;
revoke all on public.workout_session_feelings from public, anon, authenticated;
grant select on public.workout_session_feelings to authenticated;
create policy training_feelings_owner_read on public.workout_session_feelings for select to authenticated
using (exists(select 1 from public.workout_sessions s where s.id=session_id and s.user_id=(select auth.uid())));
comment on table public.workout_session_feelings is 'Four independent optional recorded feelings. No legacy backfill. Writes require the CAS/idempotent RPC; timestamps do not prove physical pre-effort capture.';

create function public.read_training_feelings_v1(p_session_id uuid)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare result jsonb;
begin
  if (select auth.uid()) is null then raise exception using errcode='P0001',message='UNAUTHORIZED'; end if;
  select jsonb_build_object('contractVersion','training-feelings/1','sessionId',s.id,'sessionStatus',s.status,
    'sessionUpdatedAt',s.updated_at,'endedAt',s.ended_at,'revision',coalesce(f.revision,0),'values',coalesce(f.facts,'{}'::jsonb))
    into result from public.workout_sessions s left join public.workout_session_feelings f on f.session_id=s.id
    where s.id=p_session_id and s.user_id=(select auth.uid());
  if result is null then raise exception using errcode='P0002',message='TRAINING_SESSION_NOT_FOUND'; end if;
  return result;
end;
$$;

-- A definer is required solely for the existing private idempotency ledger and RPC-only fact writes.
-- All ownership is checked explicitly, using auth.uid(), before replay or domain work.
create function public.mutate_training_feelings_v1(p_session_id uuid, p_input jsonb)
returns table(response_status smallint, response_body jsonb, replayed boolean)
language plpgsql security definer set search_path = '' set lock_timeout = '3s' set statement_timeout = '8s' as $$
declare
  u uuid; op text; v_operation text; k text; v jsonb; fact jsonb; v_revision bigint; expected bigint;
  s public.workout_sessions; f public.workout_session_feelings; ledger public.mobile_idempotency_keys;
  v_hash text; result jsonb; next_values jsonb; metadata jsonb; receipt_time timestamptz := clock_timestamp();
  keys text[] := array['contractVersion','operation','expectedRevision','patch','idempotencyKey'];
begin
  u := public.lock_training_user_mutations();
  if jsonb_typeof(p_input) is distinct from 'object' then raise exception using errcode='22023',message='INVALID_FEELINGS_INPUT'; end if;
  op := p_input->>'operation';
  if op='finish' then keys := keys || array['expectedSessionUpdatedAt','metadata']; end if;
  if not p_input ?& keys or exists(select 1 from jsonb_object_keys(p_input) x where not x=any(keys))
    or p_input->>'contractVersion' is distinct from 'training-feelings/1' or coalesce(op,'') not in ('save','finish')
    or jsonb_typeof(p_input->'idempotencyKey') is distinct from 'string'
    or p_input->>'idempotencyKey' !~ '^[A-Za-z0-9._:-]{1,128}$'
    or jsonb_typeof(p_input->'expectedRevision') is distinct from 'number'
    or jsonb_typeof(p_input->'patch') is distinct from 'object' then
    raise exception using errcode='22023',message='INVALID_FEELINGS_INPUT';
  end if;
  if (p_input->>'expectedRevision')::numeric not between 0 and 9007199254740990
    or (p_input->>'expectedRevision')::numeric <> trunc((p_input->>'expectedRevision')::numeric) then
    raise exception using errcode='22023',message='INVALID_FEELINGS_INPUT'; end if;
  expected := (p_input->>'expectedRevision')::bigint;
  for k,v in select * from jsonb_each(p_input->'patch') loop
    if k not in ('energyPre','fatiguePre','energyPost','fatiguePost') or jsonb_typeof(v) is distinct from 'object' then
      raise exception using errcode='22023',message='INVALID_FEELINGS_INPUT'; end if;
    if v->>'op'='clear' then
      if v <> '{"op":"clear"}'::jsonb then raise exception using errcode='22023',message='INVALID_FEELINGS_INPUT'; end if;
    elsif v->>'op'='set' then
      if not public.training_feeling_fact_valid(v-'op',case when k in ('energyPre','fatiguePre') then 'pre' else 'post' end,false) then
        raise exception using errcode='22023',message='INVALID_FEELINGS_INPUT'; end if;
    else raise exception using errcode='22023',message='INVALID_FEELINGS_INPUT'; end if;
  end loop;
  if op='finish' then
    if not public.training_feeling_timestamp_valid(p_input->>'expectedSessionUpdatedAt')
      or jsonb_typeof(p_input->'metadata') is distinct from 'object'
      or exists(select 1 from jsonb_object_keys(p_input->'metadata') x where x not in ('energyLevel','performanceLevel','painLevel','notes')) then
      raise exception using errcode='22023',message='INVALID_FEELINGS_INPUT'; end if;
    for k,v in select * from jsonb_each(p_input->'metadata') loop
      if k='notes' then
        if jsonb_typeof(v) not in ('null','string') or char_length(v#>>'{}')>10000 then raise exception using errcode='22023',message='INVALID_FEELINGS_INPUT'; end if;
      elsif v <> 'null'::jsonb then
        if jsonb_typeof(v) <> 'number' then raise exception using errcode='22023',message='INVALID_FEELINGS_INPUT'; end if;
        if (v#>>'{}')::numeric <> trunc((v#>>'{}')::numeric) or (v#>>'{}')::numeric not between (case when k='painLevel' then 0 else 1 end) and (case when k='painLevel' then 10 else 5 end) then
          raise exception using errcode='22023',message='INVALID_FEELINGS_INPUT'; end if;
      end if;
    end loop;
  end if;

  -- User lock serializes legacy finish/correction/discard and both new operations.
  select * into s from public.workout_sessions where id=p_session_id and user_id=u for update;
  if not found then raise exception using errcode='P0002',message='TRAINING_SESSION_NOT_FOUND'; end if;
  v_operation := 'training.feelings.'||op||'.v1';
  v_hash := encode(extensions.digest(convert_to(jsonb_build_object('sessionId',p_session_id,'input',p_input-'idempotencyKey')::text,'UTF8'),'sha256'),'hex');
  insert into public.mobile_idempotency_keys(user_id,operation,idempotency_key,request_hash,expires_at)
    values(u,v_operation,p_input->>'idempotencyKey',v_hash,'infinity') on conflict do nothing;
  select * into ledger from public.mobile_idempotency_keys l where l.user_id=u and l.operation=v_operation and l.idempotency_key=p_input->>'idempotencyKey' for update;
  if ledger.request_hash <> v_hash then raise exception using errcode='PT409',message='IDEMPOTENCY_KEY_REUSED'; end if;
  if ledger.state='completed' then return query select ledger.response_status,ledger.response_body,true; return; end if;
  if s.status='discarded' then raise exception using errcode='P0001',message='SESSION_DISCARDED'; end if;
  if op='finish' and s.status<>'in_progress' then raise exception using errcode='P0001',message='SESSION_CLOSED'; end if;
  select * into f from public.workout_session_feelings where session_id=s.id for update;
  v_revision := coalesce(f.revision,0);
  if v_revision<>expected then raise exception using errcode='PT409',message='FEELINGS_CHANGED'; end if;
  if op='finish' and s.updated_at is distinct from (p_input->>'expectedSessionUpdatedAt')::timestamptz then
    raise exception using errcode='PT409',message='SESSION_CHANGED'; end if;

  next_values := coalesce(f.facts,'{}'::jsonb);
  for k,v in select * from jsonb_each(p_input->'patch') loop
    if v->>'op'='clear' then next_values := next_values-k;
    else
      fact := (v-'op') || jsonb_build_object('receivedAt',to_char(receipt_time at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
        'temporalQuality',case when v->'capturedAt'='null'::jsonb then 'unknown' else 'unverified_client_clock' end);
      next_values := next_values || jsonb_build_object(k,fact);
    end if;
  end loop;
  if p_input->'patch' <> '{}'::jsonb then
    v_revision := v_revision+1;
    insert into public.workout_session_feelings(session_id,revision,facts,updated_at) values(s.id,v_revision,next_values,receipt_time)
    on conflict(session_id) do update set revision=excluded.revision,facts=excluded.facts,updated_at=excluded.updated_at;
  end if;

  if op='finish' then
    if not exists(select 1 from public.workout_session_exercises x join public.workout_sets t on t.workout_session_exercise_id=x.id
      where x.workout_session_id=s.id and x.user_id=u and x.is_completed and t.is_completed) then
      raise exception using errcode='P0001',message='NO_COMPLETED_SETS'; end if;
    -- Preserve ALL omitted legacy metadata. No alias between legacy energy and energyPost.
    metadata := to_jsonb(s);
    for k,v in select * from jsonb_each(p_input->'metadata') loop
      metadata := jsonb_set(metadata,array[case k when 'energyLevel' then 'energy_level' when 'performanceLevel' then 'performance_level'
        when 'painLevel' then 'pain_level' else 'notes' end],v);
    end loop;
    perform public.finish_workout_session(s.id,metadata);
  end if;
  result := public.read_training_feelings_v1(s.id);
  update public.mobile_idempotency_keys l set state='completed',response_status=200,response_body=result,
    resource_type='workout_session',resource_id=s.id,completed_at=clock_timestamp()
    where l.user_id=u and l.operation=v_operation and l.idempotency_key=p_input->>'idempotencyKey';
  return query select 200::smallint,result,false;
end;
$$;

revoke all on function public.training_feeling_timestamp_valid(text), public.training_feeling_fact_valid(jsonb,text,boolean), public.training_feelings_values_valid(jsonb) from public,anon,authenticated;
revoke all on function public.read_training_feelings_v1(uuid), public.mutate_training_feelings_v1(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.read_training_feelings_v1(uuid), public.mutate_training_feelings_v1(uuid,jsonb) to authenticated;
commit;
