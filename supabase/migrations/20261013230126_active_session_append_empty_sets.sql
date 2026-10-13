-- Explicit active-session product change (step 2), shared by Web and Mobile.
-- New additions ignore catalog suggestions: one blank set, no rest range.
-- No backfill: existing sessions, routine targets and catalog defaults stay intact.
-- Existing Mobile ledger replay and the Web RPC signature are unchanged.
begin;

create or replace function public.append_workout_exercise(
  p_session_id uuid, p_exercise_id uuid, p_source_type text default 'extra'
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_exercise public.exercises;
  v_session_exercise_id uuid;
  v_order integer;
begin
  v_user_id := public.lock_active_workout_session(p_session_id);
  if p_source_type is null or p_source_type not in ('extra','manual_new') then
    raise exception using errcode = '22023', message = 'Origen inválido.';
  end if;
  if exists (select 1 from public.workout_session_exercises
    where workout_session_id = p_session_id and exercise_id = p_exercise_id and user_id = v_user_id) then
    raise exception using errcode = 'P0001', message = 'SESSION_EXERCISE_ALREADY_EXISTS';
  end if;
  select * into v_exercise from public.exercises
  where id = p_exercise_id and user_id = v_user_id and is_active for share;
  if not found then
    raise exception using errcode = 'P0002', message = 'TRAINING_EXERCISE_NOT_FOUND';
  end if;
  select coalesce(max(exercise_order), 0) + 1 into v_order
  from public.workout_session_exercises where workout_session_id = p_session_id;
  insert into public.workout_session_exercises (
    user_id, workout_session_id, exercise_id, nombre_snapshot, grupo_muscular_snapshot,
    muscle_group_label_snapshot, implement_snapshot, weight_mode_snapshot,
    rest_min_seconds_snapshot, rest_max_seconds_snapshot, source_type, exercise_order, planned_sets_count, series_reales
  ) values (
    v_user_id, p_session_id, v_exercise.id, v_exercise.nombre, v_exercise.grupo_muscular,
    v_exercise.muscle_group_label, v_exercise.implement, v_exercise.weight_mode,
    null, null, p_source_type, v_order, 1, 1
  ) returning id into v_session_exercise_id;
  -- The insert trigger fills legacy actuals from catalog suggestions. Clear
  -- those mirrors too; explicit series_reales=1 prevents its default-set fanout.
  update public.workout_session_exercises
  set reps_reales = null, peso_real = null
  where id = v_session_exercise_id and user_id = v_user_id;
  insert into public.workout_sets (
    user_id, workout_session_exercise_id, set_number, target_reps, target_weight_kg,
    target_rir, actual_reps, actual_weight_kg
  ) values (v_user_id, v_session_exercise_id, 1, null, null, null, null, null)
  on conflict (workout_session_exercise_id, set_number) do update
  set target_reps = excluded.target_reps, target_weight_kg = excluded.target_weight_kg,
    target_rir = excluded.target_rir, actual_reps = excluded.actual_reps,
    actual_weight_kg = excluded.actual_weight_kg;
  -- M3.3D session structure CAS: preserve membership invalidation for Web/Mobile.
  update public.workout_sessions
  set updated_at = updated_at
  where id = p_session_id and user_id = v_user_id;
  return v_session_exercise_id;
end;
$$;

revoke all on function public.append_workout_exercise(uuid,uuid,text) from public, anon;
grant execute on function public.append_workout_exercise(uuid,uuid,text) to authenticated;

commit;
