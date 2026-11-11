-- #479 increment A · EXPAND: pinned saved meals for Rápido («Fijadas», 0–6 per account), synced per account.
-- A preference about saved meals, never part of them: no saved_meals / saved_meal_items row, nutrient or version changes here,
-- and no meal entry is written. Every pin is an explicit choice of the person (no auto-pin, no auto-unpin, no replacement).
--
-- Archived and deleted policy (Dirección Integral, 11/11/2026): archiving keeps the pinned id and its position (the meal is
-- simply not offered: mobile_resolve_quick_occurrence already refuses an inactive saved meal); restoring brings it back;
-- a hard delete keeps the id until the person releases the place. So there is NO foreign key to saved_meals (ON DELETE
-- would drop or block the preference). The six places count unavailable ids too.
--
-- Clients read through RLS (owner only) inside mobile_read_quick_options() (the existing GET, no new request) and write only
-- through mobile_put_quick_pins(): identity from auth.uid(), the per-user nutrition mutex (412, the saved-meal writers' own,
-- so pinning never interleaves with an archive or delete), CAS on the revision (including the first row), and idempotency by
-- key: a confirmed write replays its stored receipt; a refusal (conflict / unavailable) writes nothing and is re-evaluated.
-- Account deletion: the row cascades from auth.users, which ownlevel_private.delete_account deletes last.
--
-- Rollout: either order is safe. Before this migration the GET answers pins «unavailable» (the key is absent) and the PUT is
-- 503 (function missing); old apps ignore the extra «pins» key of the GET.
--
-- Reversal (only after the code that writes pins is reverted; reading tolerates their absence):
--   1. restore public.mobile_read_quick_options() as in 20261004041348_mobile_saved_meals_management.sql (pins → unavailable);
--   2. drop function public.mobile_put_quick_pins(uuid[], bigint, text);
--      drop function ownlevel_private.put_quick_pins(uuid[], bigint, text);
--      drop function ownlevel_private.quick_pins_json(uuid, uuid[], bigint);
--   3. drop table public.mobile_quick_pins;  -- loses only the preference; meals and saved meals are untouched;
--      drop function ownlevel_private.distinct_uuid_array(uuid[]);
begin;

create schema if not exists ownlevel_private;
revoke all on schema ownlevel_private from public, anon;
grant usage on schema ownlevel_private to authenticated;

-- True when no id repeats (immutable, so a CHECK can use it).
create function ownlevel_private.distinct_uuid_array(p_ids uuid[])
returns boolean language sql immutable strict parallel safe set search_path = '' as $$
  select pg_catalog.cardinality(p_ids) = (select count(distinct ids.id) from pg_catalog.unnest(p_ids) as ids(id))
$$;
revoke all on function ownlevel_private.distinct_uuid_array(uuid[]) from public, anon, authenticated;

create table public.mobile_quick_pins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  -- In the person's order; saved meal ids (active, archived or deleted since), never a foreign key (see above).
  saved_meal_ids uuid[] not null,
  -- Counts confirmed effective writes; a person without a row is at revision 0.
  revision bigint not null check (revision between 1 and 9007199254740991),
  updated_at timestamptz not null default now(),
  constraint mobile_quick_pins_count check (pg_catalog.cardinality(saved_meal_ids) between 0 and 6),
  constraint mobile_quick_pins_shape check (coalesce(pg_catalog.array_ndims(saved_meal_ids), 1) = 1
    and pg_catalog.array_position(saved_meal_ids, null) is null),
  constraint mobile_quick_pins_distinct check (ownlevel_private.distinct_uuid_array(saved_meal_ids))
);
alter table public.mobile_quick_pins enable row level security;
revoke all on public.mobile_quick_pins from public, anon, authenticated;
grant select on public.mobile_quick_pins to authenticated;
create policy mobile_quick_pins_owner_select on public.mobile_quick_pins
  for select to authenticated using (user_id = (select auth.uid()));

-- The pins as the API returns them: each id with what it is now for its owner. Explicitly filtered by owner (it also runs
-- inside the security definer writer, where RLS does not apply); under the reader it runs with the caller's RLS.
create function ownlevel_private.quick_pins_json(p_uid uuid, p_ids uuid[], p_revision bigint)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object('revision', p_revision, 'items', coalesce((
    select jsonb_agg(jsonb_build_object('id', o.id,
      'state', case when s.id is null then 'deleted' when s.is_active then 'active' else 'archived' end) order by o.position)
    from pg_catalog.unnest(p_ids) with ordinality as o(id, position)
    left join public.saved_meals s on s.id = o.id and s.user_id = p_uid
  ), '[]'::jsonb))
$$;
revoke all on function ownlevel_private.quick_pins_json(uuid, uuid[], bigint) from public, anon;
grant execute on function ownlevel_private.quick_pins_json(uuid, uuid[], bigint) to authenticated;

-- Replace the whole ordered list (pin, unpin, reorder in one write) with CAS on the revision.
create function ownlevel_private.put_quick_pins(p_saved_meal_ids uuid[], p_expected_revision bigint, p_idempotency_key text)
returns table(response_status smallint, response_body jsonb, replayed boolean)
language plpgsql security definer set search_path = '' set timezone = 'UTC' set lock_timeout = '3s' set statement_timeout = '8s'
as $$
declare
  u uuid := (select auth.uid());
  op constant text := 'nutrition.quick-pins.put.v1';
  v_hash text;
  v_ledger public.mobile_idempotency_keys%rowtype;
  v_current uuid[];
  v_revision bigint;
  v_new uuid[];
  v_available integer;
  v_response jsonb;
begin
  if u is null then raise exception using errcode = 'PT401', message = 'UNAUTHORIZED'; end if;
  if p_saved_meal_ids is null or coalesce(pg_catalog.array_ndims(p_saved_meal_ids), 1) <> 1
    or pg_catalog.cardinality(p_saved_meal_ids) > 6 or pg_catalog.array_position(p_saved_meal_ids, null) is not null
    or not ownlevel_private.distinct_uuid_array(p_saved_meal_ids)
    or p_expected_revision is null or p_expected_revision not between 0 and 9007199254740991
    or p_idempotency_key is null or p_idempotency_key !~ '^[A-Za-z0-9._:-]{1,128}$' then
    raise exception using errcode = '22023', message = 'Revisá las comidas fijadas.';
  end if;
  -- Same per-user mutex as the saved-meal writers and account deletion (412 first): serializes every pin writer of this
  -- person, so the first row cannot be created twice, and an archive or delete cannot interleave with the check below.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(u::text, 412));

  v_hash := pg_catalog.encode(extensions.digest(pg_catalog.convert_to(jsonb_build_object('savedMealIds', to_jsonb(p_saved_meal_ids),
    'expectedRevision', p_expected_revision)::text, 'UTF8'), 'sha256'), 'hex');
  select * into v_ledger from public.mobile_idempotency_keys
    where user_id = u and operation = op and idempotency_key = p_idempotency_key;
  if found then
    if v_ledger.request_hash <> v_hash then
      return query select 409::smallint, jsonb_build_object('error', 'IDEMPOTENCY_KEY_REUSED',
        'message', 'Esa operación ya se usó con otras fijadas.', 'current', null), false;
      return;
    end if;
    if v_ledger.state = 'completed' then
      return query select v_ledger.response_status, v_ledger.response_body, true;
      return;
    end if;
    raise exception using errcode = '55P03', message = 'QUICK_PINS_LEDGER_PENDING';
  end if;

  select p.saved_meal_ids, p.revision into v_current, v_revision from public.mobile_quick_pins p where p.user_id = u;
  if not found then v_current := '{}'::uuid[]; v_revision := 0; end if;
  if v_revision <> p_expected_revision then
    return query select 409::smallint, jsonb_build_object('error', 'QUICK_PINS_CHANGED',
      'message', 'Tus fijadas cambiaron en otro dispositivo.', 'current', ownlevel_private.quick_pins_json(u, v_current, v_revision)), false;
    return;
  end if;

  -- Ids already pinned stay whatever they are now (archived or deleted included). A new one must be an active saved meal of
  -- the caller right now; FOR SHARE keeps it so until commit. A foreign or unknown id reads exactly like an unavailable one.
  select coalesce(array_agg(ids.id), '{}'::uuid[]) into v_new
    from pg_catalog.unnest(p_saved_meal_ids) as ids(id) where not (ids.id = any(v_current));
  if pg_catalog.cardinality(v_new) > 0 then
    select count(*) into v_available from (
      select s.id from public.saved_meals s where s.user_id = u and s.id = any(v_new) and s.is_active for share
    ) available;
    if v_available <> pg_catalog.cardinality(v_new) then
      return query select 409::smallint, jsonb_build_object('error', 'QUICK_PIN_UNAVAILABLE',
        'message', 'Una de esas comidas ya no está disponible para fijar.', 'current', ownlevel_private.quick_pins_json(u, v_current, v_revision)), false;
      return;
    end if;
  end if;

  if p_saved_meal_ids <> v_current then
    if v_revision = 0 then
      -- No row yet: a plain insert (never an upsert), so even outside the mutex a second creator fails instead of overwriting.
      begin
        insert into public.mobile_quick_pins(user_id, saved_meal_ids, revision) values (u, p_saved_meal_ids, 1);
      exception when unique_violation then
        raise exception using errcode = '40001', message = 'QUICK_PINS_CHANGED';
      end;
      v_revision := 1;
    else
      update public.mobile_quick_pins set saved_meal_ids = p_saved_meal_ids, revision = revision + 1, updated_at = now()
        where user_id = u and revision = p_expected_revision returning revision into v_revision;
      if not found then raise exception using errcode = '40001', message = 'QUICK_PINS_CHANGED'; end if;
    end if;
  end if;
  -- No effective change keeps the revision (and creates no row for an empty list).
  v_response := ownlevel_private.quick_pins_json(u, p_saved_meal_ids, v_revision);
  insert into public.mobile_idempotency_keys(user_id, operation, idempotency_key, request_hash, state, response_status, response_body,
    resource_type, completed_at)
    values (u, op, p_idempotency_key, v_hash, 'completed', 200, v_response, 'quick-pins', now());
  return query select 200::smallint, v_response, false;
end;
$$;
revoke all on function ownlevel_private.put_quick_pins(uuid[], bigint, text) from public, anon;
grant execute on function ownlevel_private.put_quick_pins(uuid[], bigint, text) to authenticated;

create function public.mobile_put_quick_pins(p_saved_meal_ids uuid[], p_expected_revision bigint, p_idempotency_key text)
returns table(response_status smallint, response_body jsonb, replayed boolean)
language sql security invoker set search_path = '' as $$
  select * from ownlevel_private.put_quick_pins(p_saved_meal_ids, p_expected_revision, p_idempotency_key)
$$;
revoke all on function public.mobile_put_quick_pins(uuid[], bigint, text) from public, anon;
grant execute on function public.mobile_put_quick_pins(uuid[], bigint, text) to authenticated;

-- The existing read, unchanged except for an independent «pins» section. Its failure never hides saved or suggested.
create or replace function public.mobile_read_quick_options()
returns jsonb language plpgsql stable security invoker set search_path='' set timezone='UTC'
as $$
declare u uuid := (select auth.uid()); today date := (statement_timestamp() at time zone 'America/Argentina/Cordoba')::date;
 saved jsonb; suggested jsonb; pins jsonb;
begin
 if u is null then raise exception using errcode='PT401',message='UNAUTHORIZED'; end if;
 begin
  select jsonb_build_object('status','ok','rows',coalesce(jsonb_agg(value order by value->>'name',value->>'id'),'[]'::jsonb)) into saved from jsonb_array_elements(public.mobile_read_saved_meals()) where (value->>'is_active')::boolean;
 exception when others then saved:=jsonb_build_object('status','unavailable'); end;
 begin
  select jsonb_build_object('status','ok','rows',coalesce(jsonb_agg(fact order by created_at desc,id),'[]'::jsonb)) into suggested from (
   select m.id,m.created_at,to_jsonb(m)||jsonb_build_object('log_date',d.log_date,
    'version',public.mobile_quick_source_version(jsonb_build_object('meal',to_jsonb(m),'logDate',d.log_date))) fact
   from public.meal_entries m join public.day_logs d on d.id=m.day_log_id and d.user_id=u
   where m.user_id=u and m.deleted_at is null and m.entry_kind='meal' and m.source_type='manual'
    and d.log_date between today-60 and today-1 order by m.created_at desc,m.id limit 200
  ) facts;
 exception when others then suggested:=jsonb_build_object('status','unavailable'); end;
 -- #479: no row is a valid «no pins yet» (revision 0, no ids); a failure is «unavailable», never an empty list.
 begin
  select ownlevel_private.quick_pins_json(u, p.saved_meal_ids, p.revision) into pins from public.mobile_quick_pins p where p.user_id=u;
  pins:=jsonb_build_object('status','ok')||coalesce(pins, ownlevel_private.quick_pins_json(u, '{}'::uuid[], 0));
 exception when others then pins:=jsonb_build_object('status','unavailable'); end;
 return jsonb_build_object('today',today::text,'saved',saved,'suggested',suggested,'pins',pins);
end;
$$;

commit;
