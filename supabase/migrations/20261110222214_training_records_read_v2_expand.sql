-- Home records EXPAND v2 (#402 P1-C2): the same bounded read as mobile_read_training_records, plus what the comparison
-- now needs to tell one way of doing an exercise from another: the implement snapshot and the recorded variant (#367,
-- workout_session_exercise_configurations) of each session exercise in the window, and both in the older-history
-- aggregates. A record only counts against earlier sessions with the same mode, implement and known variant, so older
-- history keeps only aggregates where both are known: rows without them could never feed a record. The v1 function is
-- left untouched (code that still calls it keeps working); read only, security invoker (RLS applies), owner-filtered;
-- no table, index or policy changes.
--
-- Reversal: deploy the code without this read first (its loader also falls back to the narrow paged read when the
-- function does not exist), then:
--   drop function if exists public.mobile_read_training_records_v2(date);
begin;
create function public.mobile_read_training_records_v2(p_from date)
returns json language plpgsql stable security invoker set search_path='' as $$
declare
 u uuid := (select auth.uid());
 result json;
begin
 if u is null then raise exception using errcode='PT401',message='UNAUTHORIZED'; end if;
 if p_from is null or not isfinite(p_from) then raise exception using errcode='22023',message='INVALID_RECORDS_FROM'; end if;
 with sessions as (
  -- Same rows as the paged read (status completed; the app applies its own ended_at and date rules), from p_from.
  select s.id, s.day_log_id, s.status, s.started_at, s.ended_at, s.routine_id, s.routine_name_snapshot, s.session_name, d.log_date
  from public.workout_sessions s
  join public.day_logs d on d.id = s.day_log_id and d.user_id = u
  where s.user_id = u and s.status = 'completed' and d.log_date >= p_from
 ), exercises as (
  -- The variant as stored (kind, label): the app derives its identity with the same function as the strict comparator.
  select x.id, x.workout_session_id, x.exercise_id, x.is_completed, x.nombre_snapshot, x.grupo_muscular_snapshot,
   x.muscle_group_label_snapshot, x.weight_mode_snapshot, x.implement_snapshot,
   c.kind as configuration_kind, c.label as configuration_label
  from public.workout_session_exercises x
  join sessions s on s.id = x.workout_session_id
  left join public.workout_session_exercise_configurations c on c.session_exercise_id = x.id and c.user_id = u
  where x.user_id = u
 ), sets as (
  select t.id, t.workout_session_exercise_id, t.is_completed, t.actual_reps, t.actual_weight_kg
  from public.workout_sets t
  join exercises x on x.id = t.workout_session_exercise_id
  where t.user_id = u and t.is_completed
 ), history as (
  -- The record rule's own filters: completed session with an end and a date, completed exercise with a known implement
  -- and variant, completed set with reps > 0 and a finite load > 0 ('NaN' sorts above 'Infinity', so one bound
  -- excludes both).
  select x.exercise_id, x.weight_mode_snapshot, x.implement_snapshot, c.kind as configuration_kind,
   c.label as configuration_label, t.actual_weight_kg as load, max(t.actual_reps) as reps
  from public.workout_sets t
  join public.workout_session_exercises x on x.id = t.workout_session_exercise_id and x.user_id = u and x.is_completed
  join public.workout_sessions s on s.id = x.workout_session_id and s.user_id = u and s.status = 'completed' and s.ended_at is not null
  join public.day_logs d on d.id = s.day_log_id and d.user_id = u and d.log_date < p_from
  join public.workout_session_exercise_configurations c on c.session_exercise_id = x.id and c.user_id = u and c.kind is not null
  where t.user_id = u and t.is_completed and t.actual_reps > 0
   and t.actual_weight_kg > 0 and t.actual_weight_kg < 'Infinity'::numeric
   and nullif(btrim(x.implement_snapshot), '') is not null
  group by x.exercise_id, x.weight_mode_snapshot, x.implement_snapshot, c.kind, c.label, t.actual_weight_kg
 )
 -- json (not jsonb): the same text, built in about half the time.
 select json_build_object(
  'sessions', coalesce((select json_agg(json_build_object('id', id, 'day_log_id', day_log_id, 'status', status,
   'started_at', started_at, 'ended_at', ended_at, 'routine_id', routine_id, 'routine_name_snapshot', routine_name_snapshot,
   'session_name', session_name, 'day', json_build_object('log_date', log_date)) order by id) from sessions), '[]'::json),
  'exercises', coalesce((select json_agg(e order by e.id) from exercises e), '[]'::json),
  'sets', coalesce((select json_agg(t order by t.id) from sets t), '[]'::json),
  'history', coalesce((select json_agg(h order by h.exercise_id, h.weight_mode_snapshot, h.implement_snapshot,
   h.configuration_kind, h.configuration_label, h.load) from history h), '[]'::json))
 into result;
 return result;
end;
$$;
revoke all on function public.mobile_read_training_records_v2(date) from public, anon;
grant execute on function public.mobile_read_training_records_v2(date) to authenticated;
commit;
