-- #367 EXPAND: a revision of the Insights sources that the database moves in the same transaction as the data.
--
-- count + max(updated_at) cannot decide whether a result is still true. updated_at is the time a transaction started, so one
-- that started earlier and commits after a newer one changes a row without moving either value. Sequences have the same gap:
-- they are handed out before commit. This counter moves at commit, so a reader that sees the same value twice knows that no
-- transaction touching these sources committed in between.
--
-- It moves for what Insights reads: completed sessions and everything under them, feelings, metric definitions and values,
-- meals, and the logical date of a day. An in-progress or discarded session does not move it: Insights does not read those,
-- and a workout must not make every read fail. A row moved between sessions counts from both sides: its origin lost it and
-- its destination gained it, so either one being read is enough.
--
-- Lock order. Every event takes one lock: an advisory lock per account, at commit. Writers of an account pass through it one at
-- a time, and each reads the state of its session AFTER getting it, in a new snapshot, without locking that session. So:
--   - A commit never waits for a session or a set. It has already written, and those rows may be held by someone who is about
--     to wait for this same commit: waiting for a share lock on the session here deadlocks, reproduced with two connections.
--   - A session completed while another transaction writes under it cannot slip through: if the completion got here first, the
--     writer reads it as completed and moves the counter; if the writer got here first, it commits before the completion can
--     move the counter, so whoever sees the new counter also sees that write.
--   - The holder only waits for the counter row, which nobody writes without this lock. Deleting an account is the exception:
--     it removes that row by cascade, but only after its explicit deletes, and it takes no lock here once its user is gone.
--   - Nothing waits for another transaction while holding it. A deferred uniqueness recheck does wait for one, so taking the lock
--     before it deadlocks against that transaction: reproduced with one token, a PATCH of several rows against a larger one.
--     So there are two passes. The trigger on the sources only notes what changed. Noting it queues a second deferred trigger,
--     and Postgres fires what is queued during a commit in a later round, after every event already there, rechecks included.
--     The lock, the session state and the counter all belong to that round. SET CONSTRAINTS from the trigger cannot do this: at
--     commit every pending event is already marked as in progress, so it fires nothing.
-- This relies on READ COMMITTED, which every path of the product uses: a new snapshot per statement.
--
-- The trigger is deferred to commit, so none of this adds a lock ordering inside existing functions. One transaction moves it
-- once per account. It starts at no row, read as 0; nothing is backfilled because nothing needs to be. No code reads it until
-- ADOPT.
--
-- Reversal: deploy code that no longer reads the table, then
--   drop trigger insights_source_changed on each of the eight tables below;
--   drop table public.insights_source_pending; drop function public.insights_apply_source_change();
--   drop function public.insights_source_changed(); drop function public.insights_session_counts(uuid);
--   drop function public.insights_bump_source_revision(uuid); drop function public.insights_lock_source_revision(uuid);
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

create function public.insights_lock_source_revision(p_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  -- Deleting an account fires this after its user is gone: it has nothing left to move, and must not wait for anyone.
  if p_user is not null and exists (select 1 from auth.users u where u.id = p_user) then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user::text, 367));
  end if;
end;
$$;
revoke all on function public.insights_lock_source_revision(uuid) from public, anon, authenticated;

create function public.insights_bump_source_revision(p_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_moved text := coalesce(current_setting('ownlevel.insights_revision_moved', true), '');
begin
  if p_user is null or position(p_user::text in v_moved) > 0 then return; end if;
  perform public.insights_lock_source_revision(p_user);
  insert into public.insights_source_revisions as r (user_id, revision)
    select p_user, 1 where exists (select 1 from auth.users u where u.id = p_user)
    on conflict (user_id) do update set revision = r.revision + 1;
  perform set_config('ownlevel.insights_revision_moved', v_moved || p_user::text, true);
end;
$$;
revoke all on function public.insights_bump_source_revision(uuid) from public, anon, authenticated;

create function public.insights_session_counts(p_session uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_status text;
begin
  select s.status into v_status from public.workout_sessions s where s.id = p_session;
  -- A parent that cannot be found might have been completed: moving it needlessly is safe, missing a change is not.
  return v_status is distinct from 'in_progress' and v_status is distinct from 'discarded';
end;
$$;
revoke all on function public.insights_session_counts(uuid) from public, anon, authenticated;

-- What changed, until the second pass. Its rows exist only inside the transaction that wrote them: nothing to keep, and no WAL.
-- A rollback, a lost connection or a crash takes them with the transaction, and a commit deletes them in the second pass.
create unlogged table public.insights_source_pending (
  id bigint generated always as identity primary key,
  tx xid8 not null default pg_catalog.pg_current_xact_id(),
  source text not null check (source in ('direct', 'session', 'exercise', 'feelings')),
  has_old boolean not null,
  has_new boolean not null,
  old_user uuid,
  new_user uuid,
  old_parent uuid,
  new_parent uuid
);
-- One row per distinct change: a transaction that writes thirty sets of an exercise notes it once. The key starts with its own
-- transaction, so writing here never waits for anyone.
create unique index insights_source_pending_once on public.insights_source_pending (tx, source, has_old, has_new, old_user, new_user, old_parent, new_parent) nulls not distinct;
alter table public.insights_source_pending enable row level security;
-- Only the definer functions below touch it. The default privileges would leave it, and its sequence, open to these roles.
revoke all on table public.insights_source_pending from public, anon, authenticated, service_role;
revoke all on sequence public.insights_source_pending_id_seq from public, anon, authenticated, service_role;

create function public.insights_source_changed()
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
  else
    insert into public.insights_source_pending (source, has_old, has_new, old_user, new_user)
      values ('direct', tg_op <> 'INSERT', tg_op <> 'DELETE', old.user_id, new.user_id) on conflict do nothing;
  end if;
  return null;
end;
$$;
revoke all on function public.insights_source_changed() from public, anon, authenticated;

create function public.insights_apply_source_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_old_user uuid := new.old_user;
  v_new_user uuid := new.new_user;
  v_old_session uuid := new.old_parent;
  v_new_session uuid := new.new_parent;
begin
  delete from public.insights_source_pending p where p.id = new.id;
  -- Two accounts only when something moves between them, which no token can do. They are locked in a fixed order.
  if new.source = 'direct' then
    perform public.insights_bump_source_revision(least(v_old_user, v_new_user));
    perform public.insights_bump_source_revision(greatest(v_old_user, v_new_user));
    return null;
  end if;
  if new.source = 'feelings' then
    -- With no session left, its own deletion already moved the counter if it was completed.
    select s.user_id into v_old_user from public.workout_sessions s where s.id = new.old_parent;
    select s.user_id into v_new_user from public.workout_sessions s where s.id = new.new_parent;
  end if;

  -- First the lock, then the sessions: see the header.
  perform public.insights_lock_source_revision(least(v_old_user, v_new_user));
  perform public.insights_lock_source_revision(greatest(v_old_user, v_new_user));

  if new.source = 'exercise' then
    select x.workout_session_id into v_old_session from public.workout_session_exercises x where x.id = new.old_parent;
    select x.workout_session_id into v_new_session from public.workout_session_exercises x where x.id = new.new_parent;
  end if;

  if new.has_old and public.insights_session_counts(v_old_session) then
    perform public.insights_bump_source_revision(v_old_user);
  end if;
  if new.has_new and public.insights_session_counts(v_new_session) then
    perform public.insights_bump_source_revision(v_new_user);
  end if;
  return null;
end;
$$;
revoke all on function public.insights_apply_source_change() from public, anon, authenticated;

create constraint trigger insights_apply_source_change after insert on public.insights_source_pending
  deferrable initially deferred for each row execute function public.insights_apply_source_change();

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
