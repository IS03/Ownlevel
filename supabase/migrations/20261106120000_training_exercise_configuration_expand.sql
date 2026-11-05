-- #367 EXPAND: the configuration (variant) a person used for an exercise in one session, kept with that session.
--
-- The strict Insights comparator needs to know that two sessions of the same exercise were done the same way: same grip,
-- bench, position or attachment. Nothing records that today, so every comparison stays on the partial method. The catalog is
-- not history: it describes the exercise now, and an exercise can keep its UUID while the person changes the variant. So the
-- configuration is stored per session exercise, written by the person, and never copied from the catalog or from another row.
--
--   no row, or kind null   unknown. Every existing session exercise, and one whose configuration was explicitly cleared.
--                          Never backfilled, never written as "none".
--   kind 'recorded'        the person named the configuration (label), for this session.
--   kind 'not_applicable'  the person said the exercise has no configuration to tell apart.
--   source 'entered'           the person wrote or chose it for this session.
--   source 'repeated_previous' the person chose "same as last time": repeated_from names that earlier row, which this
--                              function checks against the same exercise, a completed earlier session and the same value.
--
-- Writes go through mutate_training_exercise_configuration_v1 only: user lock, idempotency ledger and a revision per session
-- exercise (CAS), like training feelings. It has its own table so that a write never moves the exercise's updated_at, which
-- is the CAS token of the set autosave: answering the variant must not make a pending save conflict. Finish, correction and
-- discard do not touch this table; a discarded session takes no new writes, and its rows stay with it.
--
-- Insights revision (#391): this table joins the sources. A change counts like a set does: through its session exercise,
-- only when that session is completed. A write during a workout does not move the counter; completing the session does.
--
-- Installed clients are unaffected: no existing function, column or response changes. Nothing reads this until ADOPT.
--
-- Reversal: deploy code that no longer reads it, then
--   drop trigger insights_source_changed on public.workout_session_exercise_configurations;
--   reapply public.insights_source_changed() from 20261105211040_insights_source_revision_expand.sql;
--   drop function public.mutate_training_exercise_configuration_v1(uuid, jsonb);
--   drop function public.read_training_exercise_configurations_v1(uuid);
--   drop table public.workout_session_exercise_configurations;
--   drop function public.training_configuration_label(text);
begin;

-- One spelling per label: trimmed, single spaces, no line breaks. Case is kept as written; readers compare without it.
create function public.training_configuration_label(value text)
returns text language sql immutable set search_path = '' as $$
  select nullif(pg_catalog.btrim(pg_catalog.regexp_replace(value, '\s+', ' ', 'g')), '')
$$;
revoke all on function public.training_configuration_label(text) from public, anon, authenticated;

create table public.workout_session_exercise_configurations (
  session_exercise_id uuid primary key references public.workout_session_exercises(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  revision bigint not null check (revision between 1 and 9007199254740991),
  kind text check (kind in ('recorded', 'not_applicable')),
  label text,
  source text check (source in ('entered', 'repeated_previous')),
  repeated_from uuid,
  updated_at timestamptz not null,
  constraint workout_session_exercise_configurations_shape check (
    (kind is null and label is null and source is null and repeated_from is null)
    or (kind = 'not_applicable' and label is null and source is not null)
    or (kind = 'recorded' and label is not null and source is not null)),
  constraint workout_session_exercise_configurations_repeated check (
    source is null or (source = 'repeated_previous') = (repeated_from is not null)),
  constraint workout_session_exercise_configurations_label check (
    label is null or (char_length(label) between 1 and 80 and label = public.training_configuration_label(label) and label !~ '[[:cntrl:]]'))
);
create index workout_session_exercise_configurations_user_idx on public.workout_session_exercise_configurations (user_id);
alter table public.workout_session_exercise_configurations enable row level security;
revoke all on table public.workout_session_exercise_configurations from public, anon, authenticated;
grant select on table public.workout_session_exercise_configurations to authenticated;
create policy workout_session_exercise_configurations_owner_read on public.workout_session_exercise_configurations
  for select to authenticated using (user_id = (select auth.uid()));
comment on table public.workout_session_exercise_configurations is
  'Configuration (variant) recorded by the person for one session exercise. No row or null kind: unknown. Never backfilled or copied from the catalog. Writes only through the CAS/idempotent RPC.';

create function public.read_training_exercise_configurations_v1(p_session_id uuid)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare
  u uuid := (select auth.uid());
  s public.workout_sessions;
  items jsonb;
begin
  if u is null then raise exception using errcode = 'P0001', message = 'UNAUTHORIZED'; end if;
  select * into s from public.workout_sessions where id = p_session_id and user_id = u;
  if not found then raise exception using errcode = 'P0002', message = 'TRAINING_SESSION_NOT_FOUND'; end if;
  -- "Previous": the latest completed session that ended before this one started, with a known configuration of the same
  -- exercise. If that session holds two different ones, there is no single previous value and nothing is offered.
  select coalesce(jsonb_agg(jsonb_build_object(
      'sessionExerciseId', x.id, 'exerciseId', x.exercise_id, 'revision', coalesce(c.revision, 0),
      'value', case when c.kind is null then null else jsonb_build_object('kind', c.kind, 'label', c.label, 'source', c.source, 'repeatedFrom', c.repeated_from) end,
      'previous', case when pv.n = 1 then jsonb_build_object('sessionExerciseId', pv.id, 'sessionId', ls.id, 'endedAt', ls.ended_at,
        'value', jsonb_build_object('kind', pv.kind, 'label', pv.label)) end)
      order by x.exercise_order, x.id), '[]'::jsonb)
    into items
    from public.workout_session_exercises x
    left join public.workout_session_exercise_configurations c on c.session_exercise_id = x.id and c.user_id = u
    left join lateral (
      select ps.id, ps.ended_at
      from public.workout_session_exercise_configurations pc
      join public.workout_session_exercises px on px.id = pc.session_exercise_id and px.user_id = u
      join public.workout_sessions ps on ps.id = px.workout_session_id and ps.user_id = u
      where pc.user_id = u and pc.kind is not null and px.exercise_id = x.exercise_id and ps.id <> s.id
        and ps.status = 'completed' and ps.ended_at is not null and (s.started_at is null or ps.ended_at <= s.started_at)
      order by ps.ended_at desc, ps.id desc
      limit 1
    ) ls on true
    left join lateral (
      select (pg_catalog.array_agg(px.id order by px.id))[1] as id, min(pc.kind) as kind, min(pc.label) as label,
        count(distinct (pc.kind, lower(coalesce(pc.label, '')))) as n
      from public.workout_session_exercise_configurations pc
      join public.workout_session_exercises px on px.id = pc.session_exercise_id and px.user_id = u
      where pc.user_id = u and pc.kind is not null and px.workout_session_id = ls.id and px.exercise_id = x.exercise_id
    ) pv on ls.id is not null
    where x.workout_session_id = s.id and x.user_id = u;
  return jsonb_build_object('contractVersion', 'training-exercise-configuration/1', 'sessionId', s.id, 'sessionStatus', s.status, 'items', items);
end;
$$;

-- A definer for the private idempotency ledger and RPC-only writes. Ownership is checked against auth.uid() before any work.
create function public.mutate_training_exercise_configuration_v1(p_session_id uuid, p_input jsonb)
returns table(response_status smallint, response_body jsonb, replayed boolean)
language plpgsql security definer set search_path = '' set lock_timeout = '3s' set statement_timeout = '8s' as $$
declare
  u uuid; s public.workout_sessions; x public.workout_session_exercises; c public.workout_session_exercise_configurations;
  ledger public.mobile_idempotency_keys; v_hash text; v_value jsonb; v_kind text; v_label text; v_source text; v_from uuid;
  expected bigint; v_revision bigint; result jsonb;
  v_operation text := 'training.exercise_configuration.save.v1';
  keys text[] := array['contractVersion', 'sessionExerciseId', 'expectedRevision', 'value', 'idempotencyKey'];
  uuid_pattern text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$';
begin
  u := public.lock_training_user_mutations();
  if jsonb_typeof(p_input) is distinct from 'object' or not p_input ?& keys
    or exists (select 1 from jsonb_object_keys(p_input) k where not k = any(keys))
    or p_input->>'contractVersion' is distinct from 'training-exercise-configuration/1'
    or jsonb_typeof(p_input->'idempotencyKey') is distinct from 'string' or p_input->>'idempotencyKey' !~ '^[A-Za-z0-9._:-]{1,128}$'
    or jsonb_typeof(p_input->'sessionExerciseId') is distinct from 'string' or p_input->>'sessionExerciseId' !~ uuid_pattern
    or jsonb_typeof(p_input->'expectedRevision') is distinct from 'number'
    or jsonb_typeof(p_input->'value') not in ('null', 'object') then
    raise exception using errcode = '22023', message = 'INVALID_CONFIGURATION_INPUT';
  end if;
  if (p_input->>'expectedRevision')::numeric not between 0 and 9007199254740990
    or (p_input->>'expectedRevision')::numeric <> trunc((p_input->>'expectedRevision')::numeric) then
    raise exception using errcode = '22023', message = 'INVALID_CONFIGURATION_INPUT';
  end if;
  expected := (p_input->>'expectedRevision')::bigint;
  v_value := p_input->'value';
  if jsonb_typeof(v_value) = 'object' then
    if exists (select 1 from jsonb_object_keys(v_value) k where k not in ('kind', 'label', 'source', 'repeatedFrom'))
      or not v_value ?& array['kind', 'label', 'source', 'repeatedFrom']
      or coalesce(v_value->>'kind', '') not in ('recorded', 'not_applicable')
      or coalesce(v_value->>'source', '') not in ('entered', 'repeated_previous') then
      raise exception using errcode = '22023', message = 'INVALID_CONFIGURATION_INPUT';
    end if;
    v_kind := v_value->>'kind';
    v_source := v_value->>'source';
    if v_kind = 'recorded' then
      if jsonb_typeof(v_value->'label') is distinct from 'string' then
        raise exception using errcode = '22023', message = 'INVALID_CONFIGURATION_INPUT';
      end if;
      v_label := public.training_configuration_label(v_value->>'label');
      if v_label is null or char_length(v_label) > 80 or v_label ~ '[[:cntrl:]]' then
        raise exception using errcode = '22023', message = 'INVALID_CONFIGURATION_INPUT';
      end if;
    elsif v_value->'label' <> 'null'::jsonb then
      raise exception using errcode = '22023', message = 'INVALID_CONFIGURATION_INPUT';
    end if;
    if v_source = 'repeated_previous' then
      if jsonb_typeof(v_value->'repeatedFrom') is distinct from 'string' or v_value->>'repeatedFrom' !~ uuid_pattern then
        raise exception using errcode = '22023', message = 'INVALID_CONFIGURATION_INPUT';
      end if;
      v_from := (v_value->>'repeatedFrom')::uuid;
    elsif v_value->'repeatedFrom' <> 'null'::jsonb then
      raise exception using errcode = '22023', message = 'INVALID_CONFIGURATION_INPUT';
    end if;
  end if;

  -- The user lock above serializes this with finish, correction, discard and the structural mutations.
  select * into s from public.workout_sessions where id = p_session_id and user_id = u for update;
  if not found then raise exception using errcode = 'P0002', message = 'TRAINING_SESSION_NOT_FOUND'; end if;
  v_hash := encode(extensions.digest(convert_to(jsonb_build_object('sessionId', p_session_id, 'input', p_input - 'idempotencyKey')::text, 'UTF8'), 'sha256'), 'hex');
  insert into public.mobile_idempotency_keys(user_id, operation, idempotency_key, request_hash, expires_at)
    values (u, v_operation, p_input->>'idempotencyKey', v_hash, 'infinity') on conflict do nothing;
  select * into ledger from public.mobile_idempotency_keys l
    where l.user_id = u and l.operation = v_operation and l.idempotency_key = p_input->>'idempotencyKey' for update;
  if ledger.request_hash <> v_hash then raise exception using errcode = 'PT409', message = 'IDEMPOTENCY_KEY_REUSED'; end if;
  if ledger.state = 'completed' then return query select ledger.response_status, ledger.response_body, true; return; end if;
  if s.status = 'discarded' then raise exception using errcode = 'P0001', message = 'SESSION_DISCARDED'; end if;

  select * into x from public.workout_session_exercises
    where id = (p_input->>'sessionExerciseId')::uuid and workout_session_id = s.id and user_id = u;
  if not found then raise exception using errcode = 'P0002', message = 'SESSION_EXERCISE_NOT_FOUND'; end if;
  select * into c from public.workout_session_exercise_configurations where session_exercise_id = x.id for update;
  v_revision := coalesce(c.revision, 0);
  if v_revision <> expected then raise exception using errcode = 'PT409', message = 'CONFIGURATION_CHANGED'; end if;

  -- "Same as last time" is only true of a row it names: same exercise, an earlier completed session, same value.
  if v_from is not null and not exists (
    select 1 from public.workout_session_exercise_configurations pc
    join public.workout_session_exercises px on px.id = pc.session_exercise_id and px.user_id = u
    join public.workout_sessions ps on ps.id = px.workout_session_id and ps.user_id = u
    where pc.session_exercise_id = v_from and pc.user_id = u and px.exercise_id = x.exercise_id and ps.id <> s.id
      and ps.status = 'completed' and ps.ended_at is not null and (s.started_at is null or ps.ended_at <= s.started_at)
      and pc.kind = v_kind and lower(coalesce(pc.label, '')) = lower(coalesce(v_label, ''))) then
    raise exception using errcode = 'P0001', message = 'REPEATED_CONFIGURATION_MISMATCH';
  end if;

  -- The same value again keeps the revision: nothing changed. Clearing an unknown one writes nothing.
  if (c.kind, c.label, c.source, c.repeated_from) is distinct from (v_kind, v_label, v_source, v_from) then
    v_revision := v_revision + 1;
    insert into public.workout_session_exercise_configurations as t
      (session_exercise_id, user_id, revision, kind, label, source, repeated_from, updated_at)
      values (x.id, u, v_revision, v_kind, v_label, v_source, v_from, clock_timestamp())
    on conflict (session_exercise_id) do update set revision = excluded.revision, kind = excluded.kind, label = excluded.label,
      source = excluded.source, repeated_from = excluded.repeated_from, updated_at = excluded.updated_at;
  end if;

  result := public.read_training_exercise_configurations_v1(s.id);
  update public.mobile_idempotency_keys l set state = 'completed', response_status = 200, response_body = result,
    resource_type = 'workout_session_exercise', resource_id = x.id, completed_at = clock_timestamp()
    where l.user_id = u and l.operation = v_operation and l.idempotency_key = p_input->>'idempotencyKey';
  return query select 200::smallint, result, false;
end;
$$;

revoke all on function public.read_training_exercise_configurations_v1(uuid), public.mutate_training_exercise_configuration_v1(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.read_training_exercise_configurations_v1(uuid), public.mutate_training_exercise_configuration_v1(uuid, jsonb) to authenticated;

-- #391 sources: the same function, with this table counted like a set, through its session exercise.
create or replace function public.insights_source_changed()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'workout_sessions' then
    if old.status is distinct from 'completed' and new.status is distinct from 'completed' then
      return null;
    end if;
  end if;
  if tg_table_name = 'workout_session_feelings' then
    insert into public.insights_source_pending (source, has_old, has_new, old_parent, new_parent)
      values ('feelings', tg_op <> 'INSERT', tg_op <> 'DELETE', old.session_id, new.session_id) on conflict do nothing;
  elsif tg_table_name = 'workout_session_exercises' then
    insert into public.insights_source_pending (source, has_old, has_new, old_user, new_user, old_parent, new_parent)
      values ('session', tg_op <> 'INSERT', tg_op <> 'DELETE', old.user_id, new.user_id, old.workout_session_id, new.workout_session_id) on conflict do nothing;
  elsif tg_table_name = 'workout_sets' then
    insert into public.insights_source_pending (source, has_old, has_new, old_user, new_user, old_parent, new_parent)
      values ('exercise', tg_op <> 'INSERT', tg_op <> 'DELETE', old.user_id, new.user_id, old.workout_session_exercise_id, new.workout_session_exercise_id) on conflict do nothing;
  elsif tg_table_name = 'workout_session_exercise_configurations' then
    insert into public.insights_source_pending (source, has_old, has_new, old_user, new_user, old_parent, new_parent)
      values ('exercise', tg_op <> 'INSERT', tg_op <> 'DELETE', old.user_id, new.user_id, old.session_exercise_id, new.session_exercise_id) on conflict do nothing;
  else
    insert into public.insights_source_pending (source, has_old, has_new, old_user, new_user)
      values ('direct', tg_op <> 'INSERT', tg_op <> 'DELETE', old.user_id, new.user_id) on conflict do nothing;
  end if;
  return null;
end;
$$;
revoke all on function public.insights_source_changed() from public, anon, authenticated;

create constraint trigger insights_source_changed after insert or update or delete on public.workout_session_exercise_configurations
  deferrable initially deferred for each row execute function public.insights_source_changed();

commit;
