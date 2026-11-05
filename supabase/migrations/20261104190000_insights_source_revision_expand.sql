-- #367 EXPAND: a revision of the Insights sources that the database moves in the same transaction as the data.
--
-- count + max(updated_at) cannot decide whether a result is still true. updated_at is the time a transaction started, so one
-- that started earlier and commits after a newer one changes a row without moving either value. Sequences have the same gap:
-- they are handed out before commit. This counter moves at commit, under a row lock, so a reader that sees the same value
-- twice knows that no transaction touching these sources committed in between.
--
-- It moves for what Insights reads: completed sessions and everything under them, feelings, metric definitions and values,
-- meals, and the logical date of a day. An in-progress session does not move it: Insights does not read that yet, and a
-- workout must not make every read fail. Its writes check the session under a share lock, so a commit that completes it
-- cannot slip between the check and this transaction's commit.
--
-- The trigger is deferred to commit so the lock comes last and is held only for the commit, without new lock orderings
-- inside existing functions. One transaction moves it once. It starts at no row, read as 0; nothing is backfilled because
-- nothing needs to be. No code reads it until ADOPT.
--
-- Reversal: deploy code that no longer reads the table, then
--   drop trigger insights_source_changed on each of the eight tables below;
--   drop function public.insights_source_changed(); drop function public.insights_bump_source_revision(uuid);
--   drop table public.insights_source_revisions;
begin;

create table public.insights_source_revisions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  revision bigint not null check (revision > 0)
);
alter table public.insights_source_revisions enable row level security;
create policy insights_source_revisions_select_own on public.insights_source_revisions
  for select to authenticated using ((select auth.uid()) = user_id);
revoke all on table public.insights_source_revisions from public, anon, authenticated;
grant select on table public.insights_source_revisions to authenticated;

create function public.insights_bump_source_revision(p_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_user is null or current_setting('ownlevel.insights_revision_moved', true) is not distinct from p_user::text then return; end if;
  -- Deleting an account also deletes its rows, and fires this: a user who no longer exists has nothing to move.
  insert into public.insights_source_revisions as r (user_id, revision)
    select p_user, 1 where exists (select 1 from auth.users u where u.id = p_user)
    on conflict (user_id) do update set revision = r.revision + 1;
  perform set_config('ownlevel.insights_revision_moved', p_user::text, true);
end;
$$;
revoke all on function public.insights_bump_source_revision(uuid) from public, anon, authenticated;

create function public.insights_source_changed()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid;
  v_status text;
  v_session uuid;
begin
  if tg_table_name = 'workout_sessions' then
    if (tg_op <> 'DELETE' and new.status = 'completed') or (tg_op <> 'INSERT' and old.status = 'completed') then
      perform public.insights_bump_source_revision(case when tg_op = 'DELETE' then old.user_id else new.user_id end);
    end if;
  elsif tg_table_name = 'workout_session_feelings' then
    select s.user_id, s.status into v_user, v_status from public.workout_sessions s
      where s.id = case when tg_op = 'DELETE' then old.session_id else new.session_id end for share;
    -- With no session left, its own deletion already moved the counter if it was completed.
    if v_status = 'completed' then perform public.insights_bump_source_revision(v_user); end if;
  elsif tg_table_name in ('workout_session_exercises', 'workout_sets') then
    v_user := case when tg_op = 'DELETE' then old.user_id else new.user_id end;
    if tg_table_name = 'workout_session_exercises' then
      v_session := case when tg_op = 'DELETE' then old.workout_session_id else new.workout_session_id end;
    else
      select x.workout_session_id into v_session from public.workout_session_exercises x
        where x.id = case when tg_op = 'DELETE' then old.workout_session_exercise_id else new.workout_session_exercise_id end;
    end if;
    select s.status into v_status from public.workout_sessions s where s.id = v_session for share;
    -- A parent that cannot be found might have been completed: moving it needlessly is safe, missing a change is not.
    if v_status is distinct from 'in_progress' and v_status is distinct from 'discarded' then
      perform public.insights_bump_source_revision(v_user);
    end if;
  else
    perform public.insights_bump_source_revision(case when tg_op = 'DELETE' then old.user_id else new.user_id end);
  end if;
  return null;
end;
$$;
revoke all on function public.insights_source_changed() from public, anon, authenticated;

create constraint trigger insights_source_changed after insert or update or delete on public.workout_sessions
  deferrable initially deferred for each row execute function public.insights_source_changed();
create constraint trigger insights_source_changed after insert or update or delete on public.workout_session_exercises
  deferrable initially deferred for each row execute function public.insights_source_changed();
create constraint trigger insights_source_changed after insert or update or delete on public.workout_sets
  deferrable initially deferred for each row execute function public.insights_source_changed();
create constraint trigger insights_source_changed after insert or update or delete on public.workout_session_feelings
  deferrable initially deferred for each row execute function public.insights_source_changed();
create constraint trigger insights_source_changed after insert or update or delete on public.user_metrics
  deferrable initially deferred for each row execute function public.insights_source_changed();
create constraint trigger insights_source_changed after insert or update or delete on public.daily_metric_values
  deferrable initially deferred for each row execute function public.insights_source_changed();
create constraint trigger insights_source_changed after insert or update or delete on public.meal_entries
  deferrable initially deferred for each row execute function public.insights_source_changed();
-- A session and a meal take their logical date from their day. Its totals change all the time and are not read from here.
create constraint trigger insights_source_changed after update of log_date on public.day_logs
  deferrable initially deferred for each row execute function public.insights_source_changed();

commit;
