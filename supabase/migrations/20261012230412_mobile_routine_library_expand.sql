-- M9.3 B · EXPAND. No historical/session writes, data-color backfill or remote rollout.
begin;

alter table public.routines drop constraint if exists routines_color_preset_key;
alter table public.routines add constraint routines_color_preset_key check (
  color is null or color in (
    'violet', 'indigo', 'blue', 'cyan', 'green', 'yellow', 'orange', 'rose',
    'sand', 'stone', 'slate', 'graphite'
  )
);

-- Preserve the installed definitions, including repairs from later migrations.
-- The routine creator also needs the user lock BEFORE its closed-ledger lock.
do $expand$
declare
  v_signature text;
  v_definition text;
  v_old constant text := '''violet'', ''indigo'', ''blue'', ''cyan'', ''green'', ''yellow'', ''orange'', ''rose''';
  v_new constant text := v_old || ', ''sand'', ''stone'', ''slate'', ''graphite''';
begin
  foreach v_signature in array array[
    'public.mobile_create_training_routine(text,text,text)',
    'public.mobile_update_training_routine_identity(uuid,text,text,timestamptz)',
    'public.import_training_plan(jsonb)'
  ] loop
    v_definition := pg_catalog.pg_get_functiondef(v_signature::regprocedure);
    if position(v_new in v_definition) = 0 then
      if position(v_old in v_definition) = 0 then
        raise exception 'Expected routine color validation not found in %', v_signature;
      end if;
      v_definition := replace(v_definition, v_old, v_new);
    end if;
    if v_signature = 'public.mobile_create_training_routine(text,text,text)' then
      v_definition := replace(v_definition, 'public.digest(', 'extensions.digest(');
      if position(E'  perform public.lock_training_user_mutations();\n\n  insert into public.mobile_idempotency_keys (' in v_definition) = 0 then
        if position('  insert into public.mobile_idempotency_keys (' in v_definition) = 0 then
          raise exception 'Expected routine creation ledger primitive not found';
        end if;
        v_definition := replace(v_definition, '  insert into public.mobile_idempotency_keys (',
          E'  perform public.lock_training_user_mutations();\n\n  insert into public.mobile_idempotency_keys (');
      end if;
    end if;
    execute v_definition;
  end loop;
end;
$expand$;

create schema if not exists ownlevel_private;
revoke all on schema ownlevel_private from public, anon, authenticated;
grant usage on schema ownlevel_private to authenticated;

-- Clients cannot read or write the counter/ledger directly. Definer functions
-- below have fixed SQL, empty search_path and identity exclusively from auth.uid().
create table if not exists ownlevel_private.routine_list_versions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  version bigint not null check (version between 1 and 9007199254740991)
);
alter table ownlevel_private.routine_list_versions enable row level security;
revoke all on ownlevel_private.routine_list_versions from public, anon, authenticated;

create or replace function ownlevel_private.bump_routine_list_version()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_owner uuid;
begin
  if tg_op = 'UPDATE' and
    (old.user_id, old.nombre, old.is_active, old.routine_order) is not distinct from
    (new.user_id, new.nombre, new.is_active, new.routine_order) then
    return null;
  end if;
  for v_owner in
    select distinct owner_id from unnest(case tg_op
      when 'INSERT' then array[new.user_id]
      when 'DELETE' then array[old.user_id]
      else array[old.user_id, new.user_id] end) as owners(owner_id)
    order by owner_id
  loop
    -- An Auth account cascade may already have removed the parent/counter.
    -- Never recreate its state while deleting its final routine rows.
    if tg_op = 'DELETE' and not exists (select 1 from auth.users where id = v_owner) then
      continue;
    end if;
    -- Maintenance has no JWT. Product statements already hold this same lock.
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_owner::text, 771923));
    insert into ownlevel_private.routine_list_versions(user_id, version) values(v_owner, 1)
      on conflict (user_id) do update set version = routine_list_versions.version + 1;
  end loop;
  return null;
end;
$$;
revoke all on function ownlevel_private.bump_routine_list_version() from public, anon, authenticated;
drop trigger if exists tr_routine_list_version on public.routines;
create trigger tr_routine_list_version after insert or update or delete on public.routines
  for each row execute function ownlevel_private.bump_routine_list_version();

create or replace function ownlevel_private.routine_list_version()
returns bigint language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception using errcode = 'P0001', message = 'UNAUTHORIZED'; end if;
  return coalesce((select version from ownlevel_private.routine_list_versions where user_id = v_uid), 0);
end;
$$;
revoke all on function ownlevel_private.routine_list_version() from public, anon;
grant execute on function ownlevel_private.routine_list_version() to authenticated;

-- One statement/snapshot for order, membership, counts and version. Routine rows
-- retain their RLS; missing ownership in template children invalidates the read.
create or replace function public.mobile_training_routines_snapshot()
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); v_response jsonb;
begin
  if v_uid is null then raise exception using errcode = 'P0001', message = 'UNAUTHORIZED'; end if;
  if exists (
    select 1 from public.routines r
    join public.routine_exercises re on re.routine_id = r.id
    left join public.exercises e on e.id = re.exercise_id and e.user_id = v_uid
    where r.user_id = v_uid and (e.id is null or exists (
      select 1 from public.routine_exercise_sets rs
      where rs.routine_exercise_id = re.id and rs.user_id is distinct from v_uid
    ))
  ) then raise exception using errcode = 'P0001', message = 'TRAINING_ROUTINE_TEMPLATE_CORRUPT'; end if;
  select jsonb_build_object(
    'listVersion', ownlevel_private.routine_list_version(),
    'routines', coalesce(jsonb_agg(jsonb_build_object(
      'id', r.id, 'name', r.nombre, 'color', r.color, 'order', r.routine_order,
      'isActive', r.is_active,
      'exerciseCount', (select count(*) from public.routine_exercises re where re.routine_id = r.id),
      'setCount', (select count(*) from public.routine_exercises re
        join public.routine_exercise_sets rs on rs.routine_exercise_id = re.id where re.routine_id = r.id)
    ) order by r.routine_order, r.nombre, r.id), '[]'::jsonb)
  ) into v_response from public.routines r where r.user_id = v_uid;
  return v_response;
end;
$$;
revoke all on function public.mobile_training_routines_snapshot() from public, anon;
grant execute on function public.mobile_training_routines_snapshot() to authenticated;

-- The operation core is private because it alone must access the closed ledger.
-- No generic client-callable ledger finalizer (which could forge responses).
-- Every domain select/update is scoped to auth.uid(); foreign sources are 404.
create or replace function ownlevel_private.duplicate_training_routine(
  p_routine_id uuid, p_name text, p_color text, p_idempotency_key text,
  p_expected_updated_at timestamptz, p_expected_template_version bigint
)
returns table(response_status smallint, response_body jsonb, replayed boolean)
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid;
  v_operation constant text := 'training.routine.duplicate.v1';
  v_name text := public.normalize_name(p_name);
  v_hash text;
  v_ledger public.mobile_idempotency_keys%rowtype;
  v_source public.routines%rowtype;
  v_copy public.routines%rowtype;
  v_next record;
  v_relation record;
  v_relation_id uuid;
  v_rank integer;
  v_skip text;
  v_response jsonb;
begin
  v_uid := public.lock_training_user_mutations();
  if p_idempotency_key is null or char_length(p_idempotency_key) not between 1 and 128
    or p_idempotency_key !~ '^[A-Za-z0-9._:-]+$' or v_name is null
    or p_expected_updated_at is null or p_expected_template_version is null
    or p_expected_template_version < 1 then
    raise exception using errcode = '22023', message = 'Los datos de la copia no son válidos.';
  end if;
  if p_color is not null and p_color not in (
    'violet', 'indigo', 'blue', 'cyan', 'green', 'yellow', 'orange', 'rose',
    'sand', 'stone', 'slate', 'graphite'
  ) then raise exception using errcode = '22023', message = 'Elegí un color de rutina válido.'; end if;
  v_hash := encode(extensions.digest(convert_to(jsonb_build_object(
    'sourceId', p_routine_id, 'name', v_name, 'color', p_color,
    'expectedUpdatedAt', p_expected_updated_at, 'expectedTemplateVersion', p_expected_template_version
  )::text, 'UTF8'), 'sha256'), 'hex');
  insert into public.mobile_idempotency_keys(user_id, operation, idempotency_key, request_hash)
    values(v_uid, v_operation, p_idempotency_key, v_hash) on conflict do nothing;
  select * into v_ledger from public.mobile_idempotency_keys
    where user_id = v_uid and operation = v_operation and idempotency_key = p_idempotency_key for update;
  if v_ledger.request_hash <> v_hash then
    raise exception using errcode = 'P0001', message = 'IDEMPOTENCY_KEY_REUSED';
  end if;
  if v_ledger.state = 'completed' then
    return query select v_ledger.response_status, v_ledger.response_body, true; return;
  end if;
  select * into v_source from public.routines where id = p_routine_id and user_id = v_uid for update;
  if not found then raise exception using errcode = 'P0002', message = 'TRAINING_ROUTINE_NOT_FOUND'; end if;
  if v_source.updated_at <> p_expected_updated_at then
    raise exception using errcode = '40001', message = 'ROUTINE_CHANGED';
  end if;
  if v_source.template_version <> p_expected_template_version then
    raise exception using errcode = '40001', message = 'ROUTINE_TEMPLATE_CHANGED';
  end if;
  -- Reuse the editor's structural validation, then additionally check set owner.
  perform public.mobile_training_routine_detail(p_routine_id);
  if exists (select 1 from public.routine_exercises re join public.routine_exercise_sets rs
    on rs.routine_exercise_id = re.id where re.routine_id = p_routine_id and rs.user_id is distinct from v_uid) then
    raise exception using errcode = 'P0001', message = 'TRAINING_ROUTINE_TEMPLATE_CORRUPT';
  end if;

  -- Preserve the original row, even with legacy tied ranks. Make room only in
  -- its canonical suffix, including archived rows, without changing constraints.
  v_rank := v_source.routine_order + 1;
  if v_rank > 1000 then raise exception using errcode = '22023', message = 'No hay lugar para insertar otra rutina en ese orden.'; end if;
  for v_next in select id, routine_order from public.routines
    where user_id = v_uid and (routine_order, nombre, id) > (v_source.routine_order, v_source.nombre, v_source.id)
    order by routine_order, nombre, id
  loop
    v_rank := greatest(v_next.routine_order, v_rank + 1);
    if v_rank > 1000 then raise exception using errcode = '22023', message = 'No hay lugar para insertar otra rutina en ese orden.'; end if;
    update public.routines set routine_order = v_rank where id = v_next.id and user_id = v_uid and routine_order <> v_rank;
  end loop;
  insert into public.routines(user_id, nombre, color, is_active, routine_order, notes)
    values(v_uid, v_name, p_color, true, v_source.routine_order + 1, v_source.notes) returning * into v_copy;

  v_skip := pg_catalog.current_setting('ownlevel.skip_routine_default_sets', true);
  perform pg_catalog.set_config('ownlevel.skip_routine_default_sets', 'on', true);
  for v_relation in select * from public.routine_exercises where routine_id = p_routine_id order by exercise_order
  loop
    insert into public.routine_exercises(routine_id, exercise_id, exercise_order, next_adjustment,
      next_adjustment_note, rest_min_seconds, rest_max_seconds, notes)
      values(v_copy.id, v_relation.exercise_id, v_relation.exercise_order, v_relation.next_adjustment,
        v_relation.next_adjustment_note, v_relation.rest_min_seconds, v_relation.rest_max_seconds, v_relation.notes)
      returning id into v_relation_id;
    insert into public.routine_exercise_sets(user_id, routine_exercise_id, set_number, target_reps, target_weight_kg, target_rir, notes)
      select v_uid, v_relation_id, set_number, target_reps, target_weight_kg, target_rir, notes
      from public.routine_exercise_sets where routine_exercise_id = v_relation.id and user_id = v_uid order by set_number;
  end loop;
  perform pg_catalog.set_config('ownlevel.skip_routine_default_sets', coalesce(v_skip, ''), true);
  v_response := jsonb_build_object('routine', jsonb_build_object(
    'id', v_copy.id, 'name', v_copy.nombre, 'color', v_copy.color, 'order', v_copy.routine_order, 'isActive', true,
    'exerciseCount', (select count(*) from public.routine_exercises where routine_id = v_copy.id),
    'setCount', (select count(*) from public.routine_exercise_sets rs join public.routine_exercises re
      on re.id = rs.routine_exercise_id where re.routine_id = v_copy.id)
  ));
  update public.mobile_idempotency_keys set state = 'completed', response_status = 201, response_body = v_response,
    resource_type = 'routine', resource_id = v_copy.id, completed_at = now()
    where user_id = v_uid and operation = v_operation and idempotency_key = p_idempotency_key;
  return query select 201::smallint, v_response, false;
end;
$$;
revoke all on function ownlevel_private.duplicate_training_routine(uuid,text,text,text,timestamptz,bigint) from public, anon;
grant execute on function ownlevel_private.duplicate_training_routine(uuid,text,text,text,timestamptz,bigint) to authenticated;

create or replace function public.mobile_duplicate_training_routine(
  p_routine_id uuid, p_name text, p_color text, p_idempotency_key text,
  p_expected_updated_at timestamptz, p_expected_template_version bigint
)
returns table(response_status smallint, response_body jsonb, replayed boolean)
language sql security invoker set search_path = '' as $$
  select * from ownlevel_private.duplicate_training_routine(
    p_routine_id, p_name, p_color, p_idempotency_key, p_expected_updated_at, p_expected_template_version
  )
$$;
revoke all on function public.mobile_duplicate_training_routine(uuid,text,text,text,timestamptz,bigint) from public, anon;
grant execute on function public.mobile_duplicate_training_routine(uuid,text,text,text,timestamptz,bigint) to authenticated;

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
    raise exception using errcode = '40001', message = 'ROUTINE_LIST_CHANGED';
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
create or replace function public.mobile_reorder_training_routines(
  p_routine_ids uuid[], p_expected_list_version bigint, p_idempotency_key text
)
returns table(response_status smallint, response_body jsonb, replayed boolean)
language sql security invoker set search_path = '' as $$
  select * from ownlevel_private.reorder_training_routines(p_routine_ids, p_expected_list_version, p_idempotency_key)
$$;
revoke all on function public.mobile_reorder_training_routines(uuid[],bigint,text) from public, anon;
grant execute on function public.mobile_reorder_training_routines(uuid[],bigint,text) to authenticated;

commit;
