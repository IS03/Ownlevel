-- Cuenta y Ajustes, step 6. EXPAND: in-app account deletion (App Store 5.1.1(v)).
-- Deletes every row of the caller and the Auth user in ONE transaction, in dependency order:
-- several user tables protect each other with ON DELETE RESTRICT (day_logs -> plan periods, values -> metrics),
-- so relying on the auth.users cascade order would fail. Identity comes only from auth.uid() (Bearer).
begin;

create schema if not exists ownlevel_private;
revoke all on schema ownlevel_private from public, anon;
grant usage on schema ownlevel_private to authenticated;

-- System metrics stay undeletable, except while their owner's account is being deleted inside
-- ownlevel_private.delete_account (transaction-local flag, only settable from SQL, not from PostgREST).
create or replace function public.guard_user_metric_identity()
 returns trigger
 language plpgsql
 set search_path to ''
as $function$
begin
  if tg_op = 'DELETE' then
    if old.system_key is not null
      and current_setting('ownlevel.deleting_account', true) is distinct from old.user_id::text then
      raise exception 'system_metric_cannot_be_deleted';
    end if;
    return old;
  end if;

  if new.user_id <> old.user_id or new.system_key is distinct from old.system_key then
    raise exception 'metric_identity_is_immutable';
  end if;

  if old.system_key is not null and (
    new.name is distinct from old.name
    or new.unit is distinct from old.unit
    or new.value_type is distinct from old.value_type
  ) then
    raise exception 'system_metric_identity_is_immutable';
  end if;

  if (new.unit is distinct from old.unit or new.value_type is distinct from old.value_type)
    and exists (
      select 1 from public.daily_metric_values v where v.metric_id = old.id limit 1
    ) then
    raise exception 'metric_with_history_cannot_change_meaning';
  end if;

  return new;
end;
$function$;

create function ownlevel_private.delete_account(p_confirmation text)
returns jsonb language plpgsql security definer set search_path='' set timezone='UTC'
  set lock_timeout='5s' set statement_timeout='60s' as $$
declare u uuid:=(select auth.uid());
begin
  if u is null then raise exception using errcode='PT401',message='UNAUTHORIZED'; end if;
  if p_confirmation is distinct from 'ELIMINAR' then
    raise exception using errcode='22023',message='Para confirmar, escribí ELIMINAR.'; end if;
  -- Already gone (a retry after an uncertain response): same answer, nothing to do.
  if not exists(select 1 from auth.users where id=u) then return jsonb_build_object('status','deleted'); end if;

  perform set_config('ownlevel.deleting_account', u::text, true);
  -- Same order as every product writer: ledger mutex 412 -> plan/configuration mutex 413 -> rows.
  perform pg_advisory_xact_lock(hashtextextended(u::text,412));
  perform pg_advisory_xact_lock(hashtextextended(u::text,413));

  -- Metrics: values before definitions (RESTRICT).
  delete from public.daily_metric_values where user_id=u;
  delete from public.user_metrics where user_id=u;
  -- Training: sessions, then routines, then exercises (RESTRICT from routine/session exercises).
  delete from public.workout_sets where user_id=u;
  delete from public.workout_session_exercises where user_id=u;
  delete from public.workout_sessions where user_id=u;
  delete from public.routine_exercise_sets where user_id=u;
  delete from public.routine_exercises where routine_id in (select id from public.routines where user_id=u);
  delete from public.routines where user_id=u;
  delete from public.exercises where user_id=u;
  -- Nutrition and body: entries before import runs, days before the periods they snapshot.
  delete from public.meal_entries where user_id=u;
  delete from public.body_measurements where user_id=u;
  delete from public.nutrition_events where user_id=u;
  delete from public.nutrition_import_runs where user_id=u;
  delete from public.day_logs where user_id=u;
  delete from public.nutrition_plan_periods where user_id=u;
  delete from public.nutrition_plan_sequences where user_id=u;
  delete from public.nutrition_goal_periods where user_id=u;
  delete from public.expenditure_rule_periods where user_id=u;
  delete from public.work_schedule_periods where user_id=u;
  delete from public.energy_config_periods where user_id=u;
  delete from public.saved_meals where user_id=u;
  delete from public.foods where user_id=u;
  -- Everything else (profile, tokens, receipts, views, private version rows, Auth sessions and
  -- identities) cascades from the Auth user.
  delete from auth.users where id=u;
  return jsonb_build_object('status','deleted');
end;
$$;
revoke all on function ownlevel_private.delete_account(text) from public, anon;
grant execute on function ownlevel_private.delete_account(text) to authenticated;

create function public.mobile_delete_account(p_confirmation text)
returns jsonb language sql security invoker set search_path='' as $$
  select ownlevel_private.delete_account(p_confirmation)
$$;
revoke all on function public.mobile_delete_account(text) from public, anon;
grant execute on function public.mobile_delete_account(text) to authenticated;

commit;
