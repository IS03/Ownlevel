-- Rollback-only regression for #537 training_set_kind_expand. Synthetic user, routine and exercise only.
begin;
insert into auth.users(id,email) values ('95370000-0000-4000-8000-000000000001','training-set-kind@example.invalid');
select set_config('request.jwt.claims','{"sub":"95370000-0000-4000-8000-000000000001","role":"authenticated"}',true);
set local role authenticated;
do $$
declare
  v_day uuid; v_ex uuid; v_routine uuid; v_re uuid; v_session uuid; v_se public.workout_session_exercises;
  v_at timestamptz; v_kinds text[]; v_payload jsonb; v_template jsonb;
  set_row jsonb := jsonb_build_object('target_rir', null, 'is_completed', true, 'notes', null);
begin
  insert into public.day_logs(user_id, log_date) values (auth.uid(), '2026-11-24') returning id into v_day;
  insert into public.exercises(user_id, nombre, weight_mode) values (auth.uid(), 'PRESS TEST', 'Peso total') returning id into v_ex;
  insert into public.routines(user_id, nombre) values (auth.uid(), 'RUTINA TEST') returning id into v_routine;
  insert into public.routine_exercises(routine_id, exercise_id, exercise_order) values (v_routine, v_ex, 1) returning id into v_re;
  delete from public.routine_exercise_sets where routine_exercise_id = v_re;
  insert into public.routine_exercise_sets(user_id, routine_exercise_id, set_number, target_reps, target_weight_kg, set_kind)
  values (auth.uid(), v_re, 1, 10, 20, 'warmup'), (auth.uid(), v_re, 2, 10, 60, 'work');

  -- Starting from the routine carries each set's kind.
  v_session := public.start_workout_session(v_day, v_routine);
  select * into v_se from public.workout_session_exercises where workout_session_id = v_session;
  select array_agg(set_kind order by set_number) into v_kinds from public.workout_sets where workout_session_exercise_id = v_se.id;
  if v_kinds is distinct from array['warmup','work'] then raise exception 'start copies kinds: %', v_kinds; end if;

  -- An installed app saves without set_kind: every set keeps its kind.
  v_payload := jsonb_build_object('is_completed', true, 'decision', 'maintain', 'decision_note', '', 'apply_to_routine', true, 'notes', '',
    'sets', jsonb_build_array(
      set_row || jsonb_build_object('set_number', 1, 'target_reps', 10, 'target_weight_kg', 20, 'actual_reps', 10, 'actual_weight_kg', 20),
      set_row || jsonb_build_object('set_number', 2, 'target_reps', 10, 'target_weight_kg', 60, 'actual_reps', 9, 'actual_weight_kg', 60)));
  v_at := public.save_workout_exercise(v_se.id, v_se.updated_at, v_payload);
  select array_agg(set_kind order by set_number) into v_kinds from public.workout_sets where workout_session_exercise_id = v_se.id;
  if v_kinds is distinct from array['warmup','work'] then raise exception 'save without kind keeps kinds: %', v_kinds; end if;

  -- A new client sends it: it is what is stored.
  v_payload := jsonb_set(jsonb_set(v_payload, '{sets,0,set_kind}', '"work"'), '{sets,1,set_kind}', '"warmup"');
  v_at := public.save_workout_exercise(v_se.id, v_at, v_payload);
  select array_agg(set_kind order by set_number) into v_kinds from public.workout_sets where workout_session_exercise_id = v_se.id;
  if v_kinds is distinct from array['work','warmup'] then raise exception 'save with kind: %', v_kinds; end if;

  -- An unknown kind is rejected, nothing written.
  begin
    perform public.save_workout_exercise(v_se.id, v_at, jsonb_set(v_payload, '{sets,0,set_kind}', '"cooldown"'));
    raise exception 'accepted an unknown kind';
  exception when sqlstate '22023' then null;
  end;

  -- Finishing with «Aplicar a la rutina» copies the kinds to the routine.
  perform public.finish_workout_session(v_session, '{}'::jsonb);
  select array_agg(set_kind order by set_number) into v_kinds from public.routine_exercise_sets where routine_exercise_id = v_re;
  if v_kinds is distinct from array['work','warmup'] then raise exception 'finish applies kinds: %', v_kinds; end if;

  -- The Web editor never sends kinds: they stay.
  perform public.save_routine_exercise(v_re, jsonb_build_object('next_adjustment', 'maintain', 'sets', jsonb_build_array(
    jsonb_build_object('set_number', 1, 'target_reps', 8, 'target_weight_kg', 25, 'target_rir', null, 'notes', null),
    jsonb_build_object('set_number', 2, 'target_reps', 8, 'target_weight_kg', 65, 'target_rir', null, 'notes', null))));
  select array_agg(set_kind order by set_number) into v_kinds from public.routine_exercise_sets where routine_exercise_id = v_re;
  if v_kinds is distinct from array['work','warmup'] then raise exception 'web editor keeps kinds: %', v_kinds; end if;

  -- The Mobile routine editor: without setKind (installed apps) kinds stay; with it, it is stored; unknown is rejected.
  v_template := jsonb_build_array(jsonb_build_object('routineExerciseId', v_re, 'exerciseId', v_ex, 'targets', jsonb_build_object(
    'nextAdjustment', 'maintain', 'nextAdjustmentNote', null, 'restMinSeconds', null, 'restMaxSeconds', null, 'notes', null,
    'sets', jsonb_build_array(
      jsonb_build_object('setNumber', 1, 'targetReps', 8, 'targetWeightKg', 25, 'targetRir', null, 'notes', null),
      jsonb_build_object('setNumber', 2, 'targetReps', 8, 'targetWeightKg', 65, 'targetRir', null, 'notes', null)))));
  perform public.mobile_replace_training_routine_template(v_routine, (select template_version from public.routines where id = v_routine), v_template);
  select array_agg(set_kind order by set_number) into v_kinds from public.routine_exercise_sets where routine_exercise_id = v_re;
  if v_kinds is distinct from array['work','warmup'] then raise exception 'mobile editor without kind keeps kinds: %', v_kinds; end if;
  v_template := jsonb_set(jsonb_set(v_template, '{0,targets,sets,0,setKind}', '"warmup"'), '{0,targets,sets,1,setKind}', '"work"');
  perform public.mobile_replace_training_routine_template(v_routine, (select template_version from public.routines where id = v_routine), v_template);
  select array_agg(set_kind order by set_number) into v_kinds from public.routine_exercise_sets where routine_exercise_id = v_re;
  if v_kinds is distinct from array['warmup','work'] then raise exception 'mobile editor with kind: %', v_kinds; end if;
  begin
    perform public.mobile_replace_training_routine_template(v_routine, (select template_version from public.routines where id = v_routine),
      jsonb_set(v_template, '{0,targets,sets,0,setKind}', '"cooldown"'));
    raise exception 'editor accepted an unknown kind';
  exception when sqlstate '22023' then null;
  end;

  -- Duplicating the routine copies the kinds.
  perform public.mobile_duplicate_training_routine(v_routine, 'RUTINA TEST COPIA', null, 'set-kind-copy',
    (select updated_at from public.routines where id = v_routine), (select template_version from public.routines where id = v_routine));
  select array_agg(rs.set_kind order by rs.set_number) into v_kinds from public.routine_exercise_sets rs
  join public.routine_exercises re on re.id = rs.routine_exercise_id join public.routines r on r.id = re.routine_id where r.nombre = 'RUTINA TEST COPIA';
  if v_kinds is distinct from array['warmup','work'] then raise exception 'duplicate copies kinds: %', v_kinds; end if;

  -- Starting from the template (Mobile) carries them too.
  v_session := public.mobile_start_workout_from_template(v_day, v_routine);
  select array_agg(ws.set_kind order by ws.set_number) into v_kinds from public.workout_sets ws
  join public.workout_session_exercises se on se.id = ws.workout_session_exercise_id where se.workout_session_id = v_session;
  if v_kinds is distinct from array['warmup','work'] then raise exception 'template start copies kinds: %', v_kinds; end if;

  -- Defaults: a set written without a kind is a working set.
  if exists (select 1 from public.workout_sets where set_kind is null) then raise exception 'null kind'; end if;
end $$;
rollback;
