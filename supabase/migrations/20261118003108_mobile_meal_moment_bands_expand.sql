-- EXPAND · Personal meal moment bands: when a meal loaded now is suggested as Desayuno, Almuerzo, Merienda or Cena.
-- A preference of the person, never part of a meal: no meal_entries / day_logs row is read or written here. The moment a
-- meal ends up with is still the one stored on that meal (declared by the person, or suggested by the app and kept); these
-- bands only change the suggestion for new loads. Historical meals and the server's automatic label for ChatGPT meals
-- (nutritionAutomaticMealLabel) keep the fixed bands, so nothing already recorded moves when the person edits these.
--
-- Shape: five clock limits in minutes since midnight (Córdoba), strictly increasing, on a 15-minute grid:
--   breakfast_from < lunch_from < snack_from < dinner_from < dinner_until, within 0..1440.
-- Outside [breakfast_from, dinner_until) a load has no suggested moment (late night), as today.
-- No row = never written = the fixed defaults (05:00, 11:00, 15:00, 19:00, 23:00), revision 0.
--
-- Clients read through RLS (owner only) with mobile_read_meal_moment_bands() and write only through
-- mobile_put_meal_moment_bands(): identity from auth.uid(), CAS on the revision (including the first row), and idempotency by
-- key in mobile_idempotency_keys: a confirmed write replays its stored receipt; a CAS refusal writes nothing.
-- Account deletion: the row cascades from auth.users.
--
-- Rollout: either order is safe. Before this migration the GET answers «unavailable» (function missing) and the app keeps
-- the fixed bands; the PUT is 503. Old apps never call either.
--
-- Reversal (only after the code that writes bands is reverted; reading tolerates their absence):
--   drop function public.mobile_put_meal_moment_bands(smallint, smallint, smallint, smallint, smallint, bigint, text);
--   drop function ownlevel_private.put_meal_moment_bands(smallint, smallint, smallint, smallint, smallint, bigint, text);
--   drop function public.mobile_read_meal_moment_bands();
--   drop function ownlevel_private.meal_moment_bands_json(public.mobile_meal_moment_bands);
--   drop table public.mobile_meal_moment_bands;  -- loses only the preference; meals are untouched.
begin;

create schema if not exists ownlevel_private;
revoke all on schema ownlevel_private from public, anon;
grant usage on schema ownlevel_private to authenticated;

create table public.mobile_meal_moment_bands (
  user_id uuid primary key references auth.users(id) on delete cascade,
  breakfast_from smallint not null,
  lunch_from smallint not null,
  snack_from smallint not null,
  dinner_from smallint not null,
  dinner_until smallint not null,
  -- Counts confirmed effective writes; a person without a row is at revision 0.
  revision bigint not null check (revision between 1 and 9007199254740991),
  updated_at timestamptz not null default now(),
  constraint mobile_meal_moment_bands_order check (
    breakfast_from >= 0 and breakfast_from < lunch_from and lunch_from < snack_from and snack_from < dinner_from
    and dinner_from < dinner_until and dinner_until <= 1440),
  constraint mobile_meal_moment_bands_grid check (
    breakfast_from % 15 = 0 and lunch_from % 15 = 0 and snack_from % 15 = 0 and dinner_from % 15 = 0 and dinner_until % 15 = 0)
);
alter table public.mobile_meal_moment_bands enable row level security;
revoke all on public.mobile_meal_moment_bands from public, anon, authenticated;
grant select on public.mobile_meal_moment_bands to authenticated;
create policy mobile_meal_moment_bands_owner_select on public.mobile_meal_moment_bands
  for select to authenticated using (user_id = (select auth.uid()));

-- The bands as the API returns them; null bands with revision 0 = never written (the app uses the fixed defaults).
create function ownlevel_private.meal_moment_bands_json(p_row public.mobile_meal_moment_bands)
returns jsonb language sql immutable set search_path = '' as $$
  select case when p_row.user_id is null then jsonb_build_object('revision', 0, 'bands', null)
    else jsonb_build_object('revision', p_row.revision, 'bands', jsonb_build_object(
      'breakfastFrom', p_row.breakfast_from, 'lunchFrom', p_row.lunch_from, 'snackFrom', p_row.snack_from,
      'dinnerFrom', p_row.dinner_from, 'dinnerUntil', p_row.dinner_until)) end
$$;
revoke all on function ownlevel_private.meal_moment_bands_json(public.mobile_meal_moment_bands) from public, anon;
grant execute on function ownlevel_private.meal_moment_bands_json(public.mobile_meal_moment_bands) to authenticated;

-- Read: the caller's row through RLS (security invoker).
create function public.mobile_read_meal_moment_bands()
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare u uuid := (select auth.uid()); r public.mobile_meal_moment_bands;
begin
  if u is null then raise exception using errcode = 'PT401', message = 'UNAUTHORIZED'; end if;
  select * into r from public.mobile_meal_moment_bands b where b.user_id = u;
  return ownlevel_private.meal_moment_bands_json(r);
end;
$$;
revoke all on function public.mobile_read_meal_moment_bands() from public, anon;
grant execute on function public.mobile_read_meal_moment_bands() to authenticated;

-- Replace the five limits with CAS on the revision. Writing the defaults is a normal write (it keeps a row).
create function ownlevel_private.put_meal_moment_bands(p_breakfast_from smallint, p_lunch_from smallint, p_snack_from smallint,
  p_dinner_from smallint, p_dinner_until smallint, p_expected_revision bigint, p_idempotency_key text)
returns table(response_status smallint, response_body jsonb, replayed boolean)
language plpgsql security definer set search_path = '' set timezone = 'UTC' set lock_timeout = '3s' set statement_timeout = '8s'
as $$
declare
  u uuid := (select auth.uid());
  op constant text := 'nutrition.meal-moment-bands.put.v1';
  v_hash text;
  v_ledger public.mobile_idempotency_keys%rowtype;
  v_row public.mobile_meal_moment_bands;
  v_revision bigint;
  v_response jsonb;
begin
  if u is null then raise exception using errcode = 'PT401', message = 'UNAUTHORIZED'; end if;
  if p_breakfast_from is null or p_lunch_from is null or p_snack_from is null or p_dinner_from is null or p_dinner_until is null
    or not (p_breakfast_from >= 0 and p_breakfast_from < p_lunch_from and p_lunch_from < p_snack_from and p_snack_from < p_dinner_from
      and p_dinner_from < p_dinner_until and p_dinner_until <= 1440)
    or p_breakfast_from % 15 <> 0 or p_lunch_from % 15 <> 0 or p_snack_from % 15 <> 0 or p_dinner_from % 15 <> 0 or p_dinner_until % 15 <> 0
    or p_expected_revision is null or p_expected_revision not between 0 and 9007199254740991
    or p_idempotency_key is null or p_idempotency_key !~ '^[A-Za-z0-9._:-]{1,128}$' then
    raise exception using errcode = '22023', message = 'Revisá los horarios de las comidas.';
  end if;
  -- One writer of this person's bands at a time (its own lock key), so the first row cannot be created twice.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(u::text, 533));

  v_hash := pg_catalog.encode(extensions.digest(pg_catalog.convert_to(jsonb_build_object(
    'bands', jsonb_build_array(p_breakfast_from, p_lunch_from, p_snack_from, p_dinner_from, p_dinner_until),
    'expectedRevision', p_expected_revision)::text, 'UTF8'), 'sha256'), 'hex');
  select * into v_ledger from public.mobile_idempotency_keys
    where user_id = u and operation = op and idempotency_key = p_idempotency_key;
  if found then
    if v_ledger.request_hash <> v_hash then
      return query select 409::smallint, jsonb_build_object('error', 'IDEMPOTENCY_KEY_REUSED',
        'message', 'Esa operación ya se usó con otros horarios.', 'current', null), false;
      return;
    end if;
    if v_ledger.state = 'completed' then
      return query select v_ledger.response_status, v_ledger.response_body, true;
      return;
    end if;
    raise exception using errcode = '55P03', message = 'MEAL_MOMENT_BANDS_LEDGER_PENDING';
  end if;

  select * into v_row from public.mobile_meal_moment_bands b where b.user_id = u;
  v_revision := coalesce(v_row.revision, 0);
  if v_revision <> p_expected_revision then
    return query select 409::smallint, jsonb_build_object('error', 'MEAL_MOMENT_BANDS_CHANGED',
      'message', 'Tus horarios cambiaron en otro dispositivo.', 'current', ownlevel_private.meal_moment_bands_json(v_row)), false;
    return;
  end if;

  if v_row.user_id is null then
    -- No row yet: a plain insert (never an upsert), so a second creator fails instead of overwriting.
    begin
      insert into public.mobile_meal_moment_bands(user_id, breakfast_from, lunch_from, snack_from, dinner_from, dinner_until, revision)
        values (u, p_breakfast_from, p_lunch_from, p_snack_from, p_dinner_from, p_dinner_until, 1) returning * into v_row;
    exception when unique_violation then
      raise exception using errcode = '40001', message = 'MEAL_MOMENT_BANDS_CHANGED';
    end;
  elsif (v_row.breakfast_from, v_row.lunch_from, v_row.snack_from, v_row.dinner_from, v_row.dinner_until)
    is distinct from (p_breakfast_from, p_lunch_from, p_snack_from, p_dinner_from, p_dinner_until) then
    update public.mobile_meal_moment_bands set breakfast_from = p_breakfast_from, lunch_from = p_lunch_from, snack_from = p_snack_from,
      dinner_from = p_dinner_from, dinner_until = p_dinner_until, revision = revision + 1, updated_at = now()
      where user_id = u and revision = p_expected_revision returning * into v_row;
    if not found then raise exception using errcode = '40001', message = 'MEAL_MOMENT_BANDS_CHANGED'; end if;
  end if;
  -- No effective change keeps the revision.
  v_response := ownlevel_private.meal_moment_bands_json(v_row);
  insert into public.mobile_idempotency_keys(user_id, operation, idempotency_key, request_hash, state, response_status, response_body,
    resource_type, completed_at)
    values (u, op, p_idempotency_key, v_hash, 'completed', 200, v_response, 'meal-moment-bands', now());
  return query select 200::smallint, v_response, false;
end;
$$;
revoke all on function ownlevel_private.put_meal_moment_bands(smallint, smallint, smallint, smallint, smallint, bigint, text) from public, anon;
grant execute on function ownlevel_private.put_meal_moment_bands(smallint, smallint, smallint, smallint, smallint, bigint, text) to authenticated;

create function public.mobile_put_meal_moment_bands(p_breakfast_from smallint, p_lunch_from smallint, p_snack_from smallint,
  p_dinner_from smallint, p_dinner_until smallint, p_expected_revision bigint, p_idempotency_key text)
returns table(response_status smallint, response_body jsonb, replayed boolean)
language sql security invoker set search_path = '' as $$
  select * from ownlevel_private.put_meal_moment_bands(p_breakfast_from, p_lunch_from, p_snack_from, p_dinner_from, p_dinner_until,
    p_expected_revision, p_idempotency_key)
$$;
revoke all on function public.mobile_put_meal_moment_bands(smallint, smallint, smallint, smallint, smallint, bigint, text) from public, anon;
grant execute on function public.mobile_put_meal_moment_bands(smallint, smallint, smallint, smallint, smallint, bigint, text) to authenticated;

commit;
