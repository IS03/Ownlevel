-- #334: a stale list CAS is permanent for this request, not a retryable
-- serialization failure. PostgREST 14.5 retries 40001 transactions indefinitely.
-- Deploy the API mapping (PT409 + legacy 40001) before applying this migration.
-- Only the exception code changes; identity, locks, CAS, ledger and writes stay intact.
begin;

create or replace function ownlevel_private.reorder_training_routines(
  p_routine_ids uuid[], p_expected_list_version bigint, p_idempotency_key text
)
returns table(response_status smallint, response_body jsonb, replayed boolean)
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid;
  v_operation constant text := 'training.routine.reorder.v1';
  v_hash text;
  v_ledger public.mobile_idempotency_keys%rowtype;
  v_current uuid[];
  v_response jsonb;
begin
  v_uid := public.lock_training_user_mutations();
  if p_routine_ids is null or array_ndims(p_routine_ids) > 1 or cardinality(p_routine_ids) > 1000
    or array_position(p_routine_ids, null) is not null
    or cardinality(p_routine_ids) <> (select count(distinct id) from unnest(p_routine_ids) as ids(id))
    or p_expected_list_version is null or p_expected_list_version not between 0 and 9007199254740991
    or p_idempotency_key is null or char_length(p_idempotency_key) not between 1 and 128
    or p_idempotency_key !~ '^[A-Za-z0-9._:-]+$' then
    raise exception using errcode = '22023', message = 'El orden de las rutinas no es válido.';
  end if;
  v_hash := encode(extensions.digest(convert_to(jsonb_build_object(
    'routineIds', p_routine_ids, 'expectedListVersion', p_expected_list_version
  )::text, 'UTF8'), 'sha256'), 'hex');
  insert into public.mobile_idempotency_keys(user_id, operation, idempotency_key, request_hash)
    values(v_uid, v_operation, p_idempotency_key, v_hash) on conflict do nothing;
  select * into v_ledger from public.mobile_idempotency_keys
    where user_id = v_uid and operation = v_operation and idempotency_key = p_idempotency_key for update;
  if v_ledger.request_hash <> v_hash then raise exception using errcode = 'P0001', message = 'IDEMPOTENCY_KEY_REUSED'; end if;
  if v_ledger.state = 'completed' then
    return query select v_ledger.response_status, v_ledger.response_body, true; return;
  end if;
  select coalesce(array_agg(id order by routine_order, nombre, id), '{}'::uuid[]) into v_current
    from public.routines where user_id = v_uid and is_active;
  if ownlevel_private.routine_list_version() <> p_expected_list_version
    or cardinality(v_current) <> cardinality(p_routine_ids) or not v_current @> p_routine_ids then
    raise exception using errcode = 'PT409', message = 'ROUTINE_LIST_CHANGED';
  end if;
  if v_current <> p_routine_ids then
    update public.routines r set routine_order = ordered.position::integer
      from unnest(p_routine_ids) with ordinality as ordered(id, position)
      where r.id = ordered.id and r.user_id = v_uid and r.is_active and r.routine_order <> ordered.position;
  end if;
  v_response := jsonb_build_object('routineIds', p_routine_ids, 'listVersion', ownlevel_private.routine_list_version());
  update public.mobile_idempotency_keys set state = 'completed', response_status = 200, response_body = v_response,
    resource_type = 'routine-list', completed_at = now()
    where user_id = v_uid and operation = v_operation and idempotency_key = p_idempotency_key;
  return query select 200::smallint, v_response, false;
end;
$$;
revoke all on function ownlevel_private.reorder_training_routines(uuid[],bigint,text) from public, anon;
grant execute on function ownlevel_private.reorder_training_routines(uuid[],bigint,text) to authenticated;
commit;
