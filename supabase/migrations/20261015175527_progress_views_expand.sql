-- Progreso stage 2 · step 3 · EXPAND: saved views ("Mis vistas"). Plan: bocetos/explorar/PLAN.md.
-- A view is a saved Explorar query (measure × breakdown × days × series) with a name and a position.
-- It never stores dates: it follows the period chosen in Progreso. At most 6 per user.
-- Clients read through RLS (owner only) and write only through the functions below:
-- identity from auth.uid(), a per-user lock, CAS on the view / list version, idempotent create and reorder.
begin;

create table if not exists public.progress_views (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  position smallint not null check (position between 1 and 6),
  name text not null check (char_length(name) between 1 and 60 and btrim(name) = name and name <> ''),
  definition jsonb not null check (jsonb_typeof(definition) = 'object' and octet_length(definition::text) <= 1024
    and jsonb_typeof(definition -> 'measure') = 'string'),
  version bigint not null default 1 check (version between 1 and 9007199254740991),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint progress_views_position_key unique (user_id, position) deferrable initially deferred
);
alter table public.progress_views enable row level security;
revoke all on public.progress_views from public, anon, authenticated;
grant select on public.progress_views to authenticated;
drop policy if exists progress_views_owner_select on public.progress_views;
create policy progress_views_owner_select on public.progress_views for select to authenticated using (user_id = auth.uid());

create schema if not exists ownlevel_private;
revoke all on schema ownlevel_private from public, anon, authenticated;
grant usage on schema ownlevel_private to authenticated;
create table if not exists ownlevel_private.progress_view_lists (
  user_id uuid primary key references auth.users(id) on delete cascade,
  version bigint not null check (version between 0 and 9007199254740991)
);
alter table ownlevel_private.progress_view_lists enable row level security;
revoke all on ownlevel_private.progress_view_lists from public, anon, authenticated;

-- One writer per user at a time; returns the caller's id.
create or replace function ownlevel_private.lock_progress_views()
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception using errcode = 'P0001', message = 'UNAUTHORIZED'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('progress_views:' || v_uid::text, 0));
  return v_uid;
end;
$$;
revoke all on function ownlevel_private.lock_progress_views() from public, anon, authenticated;

create or replace function ownlevel_private.progress_view_list_version(p_uid uuid)
returns bigint language sql stable security definer set search_path = '' as $$
  select coalesce((select version from ownlevel_private.progress_view_lists where user_id = p_uid), 0)
$$;
revoke all on function ownlevel_private.progress_view_list_version(uuid) from public, anon, authenticated;

create or replace function ownlevel_private.bump_progress_view_list(p_uid uuid)
returns bigint language sql security definer set search_path = '' as $$
  insert into ownlevel_private.progress_view_lists(user_id, version) values (p_uid, 1)
  on conflict (user_id) do update set version = ownlevel_private.progress_view_lists.version + 1
  returning version
$$;
revoke all on function ownlevel_private.bump_progress_view_list(uuid) from public, anon, authenticated;

create or replace function ownlevel_private.progress_view_json(v public.progress_views)
returns jsonb language sql immutable set search_path = '' as $$
  select jsonb_build_object('id', v.id, 'name', v.name, 'position', v.position, 'version', v.version, 'definition', v.definition)
$$;
revoke all on function ownlevel_private.progress_view_json(public.progress_views) from public, anon, authenticated;

-- Read: the caller's views in order and the list version (for CAS).
create or replace function ownlevel_private.progress_views_snapshot()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception using errcode = 'P0001', message = 'UNAUTHORIZED'; end if;
  return jsonb_build_object(
    'listVersion', ownlevel_private.progress_view_list_version(v_uid),
    'views', coalesce((select jsonb_agg(ownlevel_private.progress_view_json(v) order by v.position)
      from public.progress_views v where v.user_id = v_uid), '[]'::jsonb));
end;
$$;
revoke all on function ownlevel_private.progress_views_snapshot() from public, anon;
grant execute on function ownlevel_private.progress_views_snapshot() to authenticated;
create or replace function public.mobile_progress_views_snapshot()
returns jsonb
language sql stable security invoker set search_path = '' as $$
  select ownlevel_private.progress_views_snapshot()
$$;
revoke all on function public.mobile_progress_views_snapshot() from public, anon;
grant execute on function public.mobile_progress_views_snapshot() to authenticated;

-- Create (idempotent by key): appended last; a seventh view is refused.
create or replace function ownlevel_private.create_progress_view(p_name text, p_definition jsonb, p_idempotency_key text)
returns table(response_status smallint, response_body jsonb, replayed boolean)
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid;
  v_operation constant text := 'progress.view.create.v1';
  v_hash text;
  v_ledger public.mobile_idempotency_keys%rowtype;
  v_count integer;
  v_view public.progress_views;
  v_response jsonb;
begin
  v_uid := ownlevel_private.lock_progress_views();
  if p_name is null or char_length(p_name) not between 1 and 60 or btrim(p_name) <> p_name or p_name = ''
    or p_definition is null or jsonb_typeof(p_definition) <> 'object' or octet_length(p_definition::text) > 1024
    or jsonb_typeof(p_definition -> 'measure') <> 'string'
    or p_idempotency_key is null or char_length(p_idempotency_key) not between 1 and 128 or p_idempotency_key !~ '^[A-Za-z0-9._:-]+$' then
    raise exception using errcode = '22023', message = 'Los datos de la vista no son válidos.';
  end if;
  v_hash := encode(extensions.digest(convert_to(jsonb_build_object('name', p_name, 'definition', p_definition)::text, 'UTF8'), 'sha256'), 'hex');
  insert into public.mobile_idempotency_keys(user_id, operation, idempotency_key, request_hash)
    values (v_uid, v_operation, p_idempotency_key, v_hash) on conflict do nothing;
  select * into v_ledger from public.mobile_idempotency_keys
    where user_id = v_uid and operation = v_operation and idempotency_key = p_idempotency_key for update;
  if v_ledger.request_hash <> v_hash then raise exception using errcode = 'P0001', message = 'IDEMPOTENCY_KEY_REUSED'; end if;
  if v_ledger.state = 'completed' then
    return query select v_ledger.response_status, v_ledger.response_body, true; return;
  end if;
  select count(*) into v_count from public.progress_views where user_id = v_uid;
  if v_count >= 6 then raise exception using errcode = '22023', message = 'Ya tenés 6 vistas. Sacá una para fijar otra.'; end if;
  insert into public.progress_views(user_id, position, name, definition)
    values (v_uid, v_count + 1, p_name, p_definition) returning * into v_view;
  v_response := jsonb_build_object('view', ownlevel_private.progress_view_json(v_view), 'listVersion', ownlevel_private.bump_progress_view_list(v_uid));
  update public.mobile_idempotency_keys set state = 'completed', response_status = 201, response_body = v_response,
    resource_type = 'progress-view', resource_id = v_view.id, completed_at = now()
    where user_id = v_uid and operation = v_operation and idempotency_key = p_idempotency_key;
  return query select 201::smallint, v_response, false;
end;
$$;
revoke all on function ownlevel_private.create_progress_view(text, jsonb, text) from public, anon;
grant execute on function ownlevel_private.create_progress_view(text, jsonb, text) to authenticated;
create or replace function public.mobile_create_progress_view(p_name text, p_definition jsonb, p_idempotency_key text)
returns table(response_status smallint, response_body jsonb, replayed boolean)
language sql security invoker set search_path = '' as $$
  select * from ownlevel_private.create_progress_view(p_name, p_definition, p_idempotency_key)
$$;
revoke all on function public.mobile_create_progress_view(text, jsonb, text) from public, anon;
grant execute on function public.mobile_create_progress_view(text, jsonb, text) to authenticated;

-- Rename with CAS on the view's version (a retry with the old version is a conflict, never a lost update).
create or replace function ownlevel_private.rename_progress_view(p_view_id uuid, p_name text, p_expected_version bigint)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid; v_view public.progress_views;
begin
  v_uid := ownlevel_private.lock_progress_views();
  if p_view_id is null or p_name is null or char_length(p_name) not between 1 and 60 or btrim(p_name) <> p_name or p_name = ''
    or p_expected_version is null or p_expected_version not between 1 and 9007199254740991 then
    raise exception using errcode = '22023', message = 'El nombre de la vista no es válido.';
  end if;
  select * into v_view from public.progress_views where id = p_view_id and user_id = v_uid for update;
  if not found then raise exception using errcode = 'P0002', message = 'PROGRESS_VIEW_NOT_FOUND'; end if;
  if v_view.version <> p_expected_version then raise exception using errcode = '40001', message = 'PROGRESS_VIEW_CHANGED'; end if;
  if v_view.name <> p_name then
    update public.progress_views set name = p_name, version = version + 1, updated_at = now() where id = p_view_id returning * into v_view;
    return jsonb_build_object('view', ownlevel_private.progress_view_json(v_view), 'listVersion', ownlevel_private.bump_progress_view_list(v_uid));
  end if;
  return jsonb_build_object('view', ownlevel_private.progress_view_json(v_view), 'listVersion', ownlevel_private.progress_view_list_version(v_uid));
end;
$$;
revoke all on function ownlevel_private.rename_progress_view(uuid, text, bigint) from public, anon;
grant execute on function ownlevel_private.rename_progress_view(uuid, text, bigint) to authenticated;
create or replace function public.mobile_rename_progress_view(p_view_id uuid, p_name text, p_expected_version bigint)
returns jsonb
language sql security invoker set search_path = '' as $$
  select ownlevel_private.rename_progress_view(p_view_id, p_name, p_expected_version)
$$;
revoke all on function public.mobile_rename_progress_view(uuid, text, bigint) from public, anon;
grant execute on function public.mobile_rename_progress_view(uuid, text, bigint) to authenticated;

-- Remove with CAS; the remaining views close the gap.
create or replace function ownlevel_private.delete_progress_view(p_view_id uuid, p_expected_version bigint)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid; v_view public.progress_views;
begin
  v_uid := ownlevel_private.lock_progress_views();
  if p_view_id is null or p_expected_version is null or p_expected_version not between 1 and 9007199254740991 then
    raise exception using errcode = '22023', message = 'La vista no es válida.';
  end if;
  select * into v_view from public.progress_views where id = p_view_id and user_id = v_uid for update;
  if not found then raise exception using errcode = 'P0002', message = 'PROGRESS_VIEW_NOT_FOUND'; end if;
  if v_view.version <> p_expected_version then raise exception using errcode = '40001', message = 'PROGRESS_VIEW_CHANGED'; end if;
  delete from public.progress_views where id = p_view_id;
  update public.progress_views set position = position - 1, updated_at = now() where user_id = v_uid and position > v_view.position;
  return jsonb_build_object('listVersion', ownlevel_private.bump_progress_view_list(v_uid));
end;
$$;
revoke all on function ownlevel_private.delete_progress_view(uuid, bigint) from public, anon;
grant execute on function ownlevel_private.delete_progress_view(uuid, bigint) to authenticated;
create or replace function public.mobile_delete_progress_view(p_view_id uuid, p_expected_version bigint)
returns jsonb
language sql security invoker set search_path = '' as $$
  select ownlevel_private.delete_progress_view(p_view_id, p_expected_version)
$$;
revoke all on function public.mobile_delete_progress_view(uuid, bigint) from public, anon;
grant execute on function public.mobile_delete_progress_view(uuid, bigint) to authenticated;

-- Reorder (idempotent by key) with CAS on the list version; the ids must be exactly the caller's views.
create or replace function ownlevel_private.reorder_progress_views(p_view_ids uuid[], p_expected_list_version bigint, p_idempotency_key text)
returns table(response_status smallint, response_body jsonb, replayed boolean)
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid;
  v_operation constant text := 'progress.view.reorder.v1';
  v_hash text;
  v_ledger public.mobile_idempotency_keys%rowtype;
  v_current uuid[];
  v_response jsonb;
begin
  v_uid := ownlevel_private.lock_progress_views();
  if p_view_ids is null or array_ndims(p_view_ids) > 1 or cardinality(p_view_ids) > 6 or array_position(p_view_ids, null) is not null
    or cardinality(p_view_ids) <> (select count(distinct id) from unnest(p_view_ids) as ids(id))
    or p_expected_list_version is null or p_expected_list_version not between 0 and 9007199254740991
    or p_idempotency_key is null or char_length(p_idempotency_key) not between 1 and 128 or p_idempotency_key !~ '^[A-Za-z0-9._:-]+$' then
    raise exception using errcode = '22023', message = 'El orden de las vistas no es válido.';
  end if;
  v_hash := encode(extensions.digest(convert_to(jsonb_build_object('viewIds', p_view_ids, 'expectedListVersion', p_expected_list_version)::text, 'UTF8'), 'sha256'), 'hex');
  insert into public.mobile_idempotency_keys(user_id, operation, idempotency_key, request_hash)
    values (v_uid, v_operation, p_idempotency_key, v_hash) on conflict do nothing;
  select * into v_ledger from public.mobile_idempotency_keys
    where user_id = v_uid and operation = v_operation and idempotency_key = p_idempotency_key for update;
  if v_ledger.request_hash <> v_hash then raise exception using errcode = 'P0001', message = 'IDEMPOTENCY_KEY_REUSED'; end if;
  if v_ledger.state = 'completed' then
    return query select v_ledger.response_status, v_ledger.response_body, true; return;
  end if;
  select coalesce(array_agg(id order by position), '{}'::uuid[]) into v_current from public.progress_views where user_id = v_uid;
  if ownlevel_private.progress_view_list_version(v_uid) <> p_expected_list_version
    or cardinality(v_current) <> cardinality(p_view_ids) or not v_current @> p_view_ids then
    raise exception using errcode = '40001', message = 'PROGRESS_VIEW_LIST_CHANGED';
  end if;
  if v_current <> p_view_ids then
    update public.progress_views v set position = ordered.position::smallint, updated_at = now()
      from unnest(p_view_ids) with ordinality as ordered(id, position)
      where v.id = ordered.id and v.user_id = v_uid;
    v_response := jsonb_build_object('viewIds', p_view_ids, 'listVersion', ownlevel_private.bump_progress_view_list(v_uid));
  else
    v_response := jsonb_build_object('viewIds', p_view_ids, 'listVersion', p_expected_list_version);
  end if;
  update public.mobile_idempotency_keys set state = 'completed', response_status = 200, response_body = v_response,
    resource_type = 'progress-view-list', completed_at = now()
    where user_id = v_uid and operation = v_operation and idempotency_key = p_idempotency_key;
  return query select 200::smallint, v_response, false;
end;
$$;
revoke all on function ownlevel_private.reorder_progress_views(uuid[], bigint, text) from public, anon;
grant execute on function ownlevel_private.reorder_progress_views(uuid[], bigint, text) to authenticated;
create or replace function public.mobile_reorder_progress_views(p_view_ids uuid[], p_expected_list_version bigint, p_idempotency_key text)
returns table(response_status smallint, response_body jsonb, replayed boolean)
language sql security invoker set search_path = '' as $$
  select * from ownlevel_private.reorder_progress_views(p_view_ids, p_expected_list_version, p_idempotency_key)
$$;
revoke all on function public.mobile_reorder_progress_views(uuid[], bigint, text) from public, anon;
grant execute on function public.mobile_reorder_progress_views(uuid[], bigint, text) to authenticated;

commit;
