-- Fixtures sintéticos de PR 7.1. No dejan filas porque toda la prueba revierte.
begin;

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '27100000-0000-4000-8000-000000000001', 'authenticated',
  'authenticated', 'pr7-1@example.invalid', '', now(),
  '{}'::jsonb, '{}'::jsonb, now(), now()
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '27100000-0000-4000-8000-000000000001', true);

insert into public.day_logs (id, user_id, log_date) values
  ('27100000-0000-4000-8000-000000000101', '27100000-0000-4000-8000-000000000001', '2026-08-19'),
  ('27100000-0000-4000-8000-000000000102', '27100000-0000-4000-8000-000000000001', '2026-08-20');

insert into public.meal_entries (
  id, user_id, day_log_id, title, final_calories, final_protein_g,
  source_type, entry_kind, legacy_import_source, legacy_import_id, raw_input
) values (
  '27100000-0000-4000-8000-000000000201',
  '27100000-0000-4000-8000-000000000001',
  '27100000-0000-4000-8000-000000000102',
  'COMIDA SINTÉTICA', 500, 30, 'sheet_import', 'meal',
  'fixture', 'meal-1', '{"originalTimeKnown":false}'
);

update public.meal_entries
set day_log_id = '27100000-0000-4000-8000-000000000101'
where id = '27100000-0000-4000-8000-000000000201';

do $$
begin
  if not exists (
    select 1 from public.day_logs
    where id = '27100000-0000-4000-8000-000000000102'
      and total_calories_consumed = 0
  ) or not exists (
    select 1 from public.day_logs
    where id = '27100000-0000-4000-8000-000000000101'
      and total_calories_consumed = 500 and total_protein_g = 30
  ) then
    raise exception 'mover comida no recalculó origen y destino';
  end if;
  if not exists (
    select 1 from public.meal_entries
    where id = '27100000-0000-4000-8000-000000000201'
      and legacy_import_source = 'fixture'
      and legacy_import_id = 'meal-1'
      and raw_input::jsonb = '{"originalTimeKnown":false}'::jsonb
  ) then
    raise exception 'mover comida alteró identidad o metadata';
  end if;
end;
$$;

update public.meal_entries
set day_log_id = '27100000-0000-4000-8000-000000000102'
where id = '27100000-0000-4000-8000-000000000201';

insert into public.routines (id, user_id, nombre)
values ('27100000-0000-4000-8000-000000000301', '27100000-0000-4000-8000-000000000001', 'RUTINA SINTÉTICA');

insert into public.exercises (
  id, user_id, nombre, series_sugeridas, reps_sugeridas, peso_sugerido,
  rir_sugerido, descanso_min_sugerido_segundos,
  descanso_max_sugerido_segundos, is_active
) values (
  '27100000-0000-4000-8000-000000000302',
  '27100000-0000-4000-8000-000000000001', 'PRESS SINTÉTICO',
  3, 10, 40, 2, 120, 180, true
);

insert into public.routine_exercises (id, routine_id, exercise_id)
values (
  '27100000-0000-4000-8000-000000000303',
  '27100000-0000-4000-8000-000000000301',
  '27100000-0000-4000-8000-000000000302'
);

update public.exercises
set series_sugeridas = 4, reps_sugeridas = 8, peso_sugerido = 50,
    rir_sugerido = 1, descanso_min_sugerido_segundos = 180,
    descanso_max_sugerido_segundos = 240
where id = '27100000-0000-4000-8000-000000000302';

do $$
begin
  if not exists (
    select 1 from public.routine_exercises
    where id = '27100000-0000-4000-8000-000000000303'
      and rest_min_seconds = 120 and rest_max_seconds = 180
  ) or (select count(*) from public.routine_exercise_sets
        where routine_exercise_id = '27100000-0000-4000-8000-000000000303'
          and target_reps = 10 and target_weight_kg = 40 and target_rir = 2) <> 3 then
    raise exception 'rutina no copió defaults o cambió después de editar catálogo';
  end if;
end;
$$;

insert into public.workout_sessions (
  id, user_id, day_log_id, session_name, status
) values (
  '27100000-0000-4000-8000-000000000401',
  '27100000-0000-4000-8000-000000000001',
  '27100000-0000-4000-8000-000000000102', 'SESIÓN SINTÉTICA', 'in_progress'
);

select public.append_workout_exercise(
  '27100000-0000-4000-8000-000000000401',
  '27100000-0000-4000-8000-000000000302',
  'manual_new'
);

do $$
declare v_session_exercise uuid;
begin
  select id into v_session_exercise
  from public.workout_session_exercises
  where workout_session_id = '27100000-0000-4000-8000-000000000401';
  if not exists (
    select 1 from public.workout_session_exercises
    where id = v_session_exercise and source_type = 'manual_new'
      and planned_sets_count = 1 and series_reales = 1
      and reps_reales is null and peso_real is null
      and rest_min_seconds_snapshot is null
      and rest_max_seconds_snapshot is null
  ) or (select count(*) from public.workout_sets
        where workout_session_exercise_id = v_session_exercise
          and target_reps is null and target_weight_kg is null and target_rir is null
          and actual_reps is null and actual_weight_kg is null and not is_completed) <> 1 then
    raise exception 'sesión no agregó una serie vacía sin descanso';
  end if;
end;
$$;

rollback;
