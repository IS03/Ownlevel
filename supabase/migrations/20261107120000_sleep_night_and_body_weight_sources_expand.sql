-- #367 EXPAND: what night a sleep value is about, and body weight as an Insights source.
--
-- SLEEP. A sleep value is a daily metric (user_metrics.system_key = 'sleep', identified by that key, never by its name). Nothing
-- said which night its date meant, so a value on date D could be the night before D or the one after it. From now on a client
-- that shows the convention can declare it:
--   'sleep_night_ending_on_date/1'   the value on date D is the night that ended the morning of D.
-- The declaration is a separate row tied to the exact version of the value it was made for (its updated_at, value and date).
-- Any later write to that value, by any client, moves updated_at, so the declaration no longer matches and is read as absent:
-- an edit can never keep a declaration made for another meaning. Deleting the value deletes it. Nothing is backfilled: every
-- existing value keeps an unknown convention, and an installed client that does not know the convention declares nothing.
--
-- Declaring is atomic with the write that it describes. New clients write through two wrappers that run the existing writer
-- and, in the same transaction, declare the sleep values they were asked to:
--   save_daily_metric_values_v2           Web (Today and History), wraps save_daily_metric_values.
--   mobile_mutate_nutrition_day_v2        Mobile, wraps mobile_mutate_nutrition_day. A replayed answer declares nothing:
--                                         the first attempt already committed its write and its declaration together.
-- declare_sleep_night_v1 also exists on its own, with a CAS on the value's updated_at, for an explicit later confirmation.
--
-- BODY WEIGHT. Its one canonical path stays day_logs.weight_kg (one per logical date, owned by mobile_mutate_body_weight and the
-- existing writers). Nothing new stores weight. The #391 counter only moved for day_logs.log_date, so a corrected weight would
-- have left an old Insights answer cached: three more triggers on day_logs move it when a weight appears, changes or goes away.
-- A day_log without weight, and every change to its totals, still does not move it.
--
-- Installed clients are unaffected: no existing function, column or response changes.
--
-- Reversal: deploy code that no longer calls the wrappers or reads the table, then
--   drop trigger insights_source_changed on public.daily_metric_value_conventions;
--   drop trigger insights_source_weight_inserted on public.day_logs; drop trigger insights_source_weight_changed on public.day_logs;
--   drop trigger insights_source_weight_deleted on public.day_logs;
--   drop function public.mobile_mutate_nutrition_day_v2(jsonb, uuid[]); drop function public.save_daily_metric_values_v2(date, jsonb, boolean, uuid[]);
--   drop function public.declare_sleep_night_v1(date, uuid, timestamptz); drop table public.daily_metric_value_conventions;
begin;

create table public.daily_metric_value_conventions (
  value_id uuid primary key references public.daily_metric_values(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  convention text not null check (convention = 'sleep_night_ending_on_date/1'),
  -- The version of the value this declaration is about. A reader accepts it only while all three still match.
  declared_updated_at timestamptz not null,
  declared_value numeric(14,4) not null,
  declared_date date not null,
  declared_at timestamptz not null default clock_timestamp()
);
create index daily_metric_value_conventions_user_idx on public.daily_metric_value_conventions (user_id);
alter table public.daily_metric_value_conventions enable row level security;
revoke all on table public.daily_metric_value_conventions from public, anon, authenticated;
grant select on table public.daily_metric_value_conventions to authenticated;
create policy daily_metric_value_conventions_owner_read on public.daily_metric_value_conventions
  for select to authenticated using (user_id = (select auth.uid()));
comment on table public.daily_metric_value_conventions is
  'Which night a sleep value means, declared by a client that showed the convention. Valid only while it matches the value''s updated_at, value and date. Never backfilled.';

-- Declares the current version of one sleep value. A definer only to write the table, which nobody writes directly.
create function public.declare_sleep_night_v1(p_date date, p_metric_id uuid, p_expected_updated_at timestamptz)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  u uuid := (select auth.uid());
  v public.daily_metric_values;
begin
  if u is null then raise exception using errcode = 'P0001', message = 'UNAUTHORIZED'; end if;
  if p_date is null or p_metric_id is null or p_expected_updated_at is null then
    raise exception using errcode = '22023', message = 'INVALID_SLEEP_DECLARATION'; end if;
  if not exists (select 1 from public.user_metrics m where m.id = p_metric_id and m.user_id = u and m.system_key = 'sleep') then
    raise exception using errcode = '22023', message = 'NOT_A_SLEEP_METRIC'; end if;
  select * into v from public.daily_metric_values where user_id = u and metric_id = p_metric_id and metric_date = p_date for update;
  if not found then raise exception using errcode = 'P0002', message = 'SLEEP_VALUE_NOT_FOUND'; end if;
  if v.updated_at is distinct from p_expected_updated_at then
    raise exception using errcode = 'PT409', message = 'SLEEP_VALUE_CHANGED'; end if;
  insert into public.daily_metric_value_conventions as c (value_id, user_id, convention, declared_updated_at, declared_value, declared_date)
    values (v.id, u, 'sleep_night_ending_on_date/1', v.updated_at, v.value, v.metric_date)
  on conflict (value_id) do update set declared_updated_at = excluded.declared_updated_at, declared_value = excluded.declared_value,
    declared_date = excluded.declared_date, declared_at = clock_timestamp()
    where (c.declared_updated_at, c.declared_value, c.declared_date) is distinct from (excluded.declared_updated_at, excluded.declared_value, excluded.declared_date);
  return jsonb_build_object('declared', true, 'valueId', v.id, 'updatedAt', v.updated_at);
end;
$$;

-- Declares the sleep values of p_date in p_metric_ids that THIS transaction wrote: every writer sets updated_at to now(), and
-- now() is the start of the current transaction. A value another client wrote, or one this call left unchanged, is not
-- declared: a declaration is only ever made for a version written by the client that showed the convention. A metric that is
-- not the account's sleep metric is refused.
create function public.declare_sleep_nights_written(p_date date, p_metric_ids uuid[])
returns void language plpgsql security invoker set search_path = '' as $$
declare
  u uuid := (select auth.uid());
  v_metric uuid;
  stamp timestamptz;
begin
  foreach v_metric in array coalesce(p_metric_ids, '{}'::uuid[]) loop
    if not exists (select 1 from public.user_metrics m where m.id = v_metric and m.user_id = u and m.system_key = 'sleep') then
      raise exception using errcode = '22023', message = 'NOT_A_SLEEP_METRIC';
    end if;
    select v.updated_at into stamp from public.daily_metric_values v where v.user_id = u and v.metric_id = v_metric and v.metric_date = p_date;
    -- Cleared in this write: nothing to declare, and the cascade already removed any old declaration.
    if found and stamp = now() then perform public.declare_sleep_night_v1(p_date, v_metric, stamp); end if;
  end loop;
end;
$$;

-- Web: the existing writer, then the declaration, in one transaction.
create function public.save_daily_metric_values_v2(p_metric_date date, p_values jsonb, p_historical boolean, p_sleep_night_metric_ids uuid[])
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if exists (select 1 from unnest(coalesce(p_sleep_night_metric_ids, '{}'::uuid[])) as ids(metric) where not (coalesce(p_values, '{}'::jsonb) ? ids.metric::text)) then
    raise exception using errcode = '22023', message = 'INVALID_SLEEP_DECLARATION'; end if;
  perform public.save_daily_metric_values(p_metric_date, p_values, p_historical);
  perform public.declare_sleep_nights_written(p_metric_date, p_sleep_night_metric_ids);
end;
$$;

-- Mobile: the existing writer, its ledger and receipts untouched; a fresh 200 for metrics also declares.
create function public.mobile_mutate_nutrition_day_v2(p_intent jsonb, p_sleep_night_metric_ids uuid[])
returns table(response_status smallint, response_body jsonb, replayed boolean)
language plpgsql security invoker set search_path = '' as $$
declare
  r record;
begin
  if coalesce(array_length(p_sleep_night_metric_ids, 1), 0) > 0 and (p_intent->>'operation' is distinct from 'metrics'
    or exists (select 1 from unnest(p_sleep_night_metric_ids) as ids(metric)
      where not exists (select 1 from jsonb_array_elements(p_intent->'changes') as c(change) where c.change->>'metricId' = ids.metric::text))) then
    raise exception using errcode = '22023', message = 'INVALID_SLEEP_DECLARATION'; end if;
  select * into r from public.mobile_mutate_nutrition_day(p_intent);
  if r.response_status = 200 and not r.replayed and p_intent->>'operation' = 'metrics' then
    perform public.declare_sleep_nights_written((p_intent->>'date')::date, p_sleep_night_metric_ids);
  end if;
  return query select r.response_status, r.response_body, r.replayed;
end;
$$;

revoke all on function public.declare_sleep_night_v1(date, uuid, timestamptz), public.declare_sleep_nights_written(date, uuid[]),
  public.save_daily_metric_values_v2(date, jsonb, boolean, uuid[]), public.mobile_mutate_nutrition_day_v2(jsonb, uuid[]) from public, anon, authenticated;
grant execute on function public.declare_sleep_night_v1(date, uuid, timestamptz), public.declare_sleep_nights_written(date, uuid[]),
  public.save_daily_metric_values_v2(date, jsonb, boolean, uuid[]), public.mobile_mutate_nutrition_day_v2(jsonb, uuid[]) to authenticated;

-- #391 sources. The declarations are a day-level fact of their account, like a metric value: the 'direct' path, no session.
create constraint trigger insights_source_changed after insert or update or delete on public.daily_metric_value_conventions
  deferrable initially deferred for each row execute function public.insights_source_changed();
-- Body weight lives on day_logs. Only a weight that appears, changes or goes away moves the counter.
create constraint trigger insights_source_weight_inserted after insert on public.day_logs
  deferrable initially deferred for each row when (new.weight_kg is not null) execute function public.insights_source_changed();
create constraint trigger insights_source_weight_changed after update of weight_kg on public.day_logs
  deferrable initially deferred for each row when (old.weight_kg is distinct from new.weight_kg) execute function public.insights_source_changed();
create constraint trigger insights_source_weight_deleted after delete on public.day_logs
  deferrable initially deferred for each row when (old.weight_kg is not null) execute function public.insights_source_changed();

commit;
