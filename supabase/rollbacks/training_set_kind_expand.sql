-- Rollback of #537 set_kind EXPAND: functions back to their previous text, then the columns go.

create function pg_temp.ownlevel_patch(p_def text, p_old text, p_new text, p_label text) returns text
language plpgsql as $helper$
declare v_count integer := (length(p_def) - length(replace(p_def, p_old, ''))) / nullif(length(p_old), 0);
begin
  if v_count is distinct from 1 then
    raise exception 'set_kind patch %: expected exactly one match, found %', p_label, coalesce(v_count, 0);
  end if;
  return replace(p_def, p_old, p_new);
end
$helper$;

do $do$
declare d text := pg_get_functiondef('public.save_workout_exercise(uuid,timestamptz,jsonb)'::regprocedure);
begin
  d := pg_temp.ownlevel_patch(d,
$patch$    actual_reps integer, actual_weight_kg numeric, is_completed boolean, notes text, set_kind text
  );$patch$,
$patch$    actual_reps integer, actual_weight_kg numeric, is_completed boolean, notes text
  );$patch$,
  'public.save_workout_exercise · recordset');
  d := pg_temp.ownlevel_patch(d,
$patch$    item.is_completed, nullif(item.notes, ''),
    coalesce(item.set_kind, v_set_kinds ->> item.set_number::text, 'work')
  from jsonb_to_recordset$patch$,
$patch$    item.is_completed, nullif(item.notes, '')
  from jsonb_to_recordset$patch$,
  'public.save_workout_exercise · values');
  d := pg_temp.ownlevel_patch(d,
$patch$    target_rir, actual_reps, actual_weight_kg, is_completed, notes, set_kind
  ) select$patch$,
$patch$    target_rir, actual_reps, actual_weight_kg, is_completed, notes
  ) select$patch$,
  'public.save_workout_exercise · columns');
  d := pg_temp.ownlevel_patch(d,
$patch$  -- #537: a client that does not send set_kind (installed apps) keeps each set's kind by its number.
  select coalesce(jsonb_object_agg(set_number::text, set_kind), '{}'::jsonb) into v_set_kinds
  from public.workout_sets where workout_session_exercise_id = p_session_exercise_id;
  delete from public.workout_sets where workout_session_exercise_id = p_session_exercise_id;
$patch$,
$patch$  delete from public.workout_sets where workout_session_exercise_id = p_session_exercise_id;
$patch$,
  'public.save_workout_exercise · keep kinds');
  d := pg_temp.ownlevel_patch(d,
$patch$      or jsonb_typeof(v_set -> 'notes') not in ('string','null')
      or (v_set ? 'set_kind' and coalesce(v_set ->> 'set_kind', '') not in ('work','warmup')) then
      raise exception using errcode = '22023', message = 'La serie no es válida.';$patch$,
$patch$      or jsonb_typeof(v_set -> 'notes') not in ('string','null') then
      raise exception using errcode = '22023', message = 'La serie no es válida.';$patch$,
  'public.save_workout_exercise · kind check');
  d := pg_temp.ownlevel_patch(d,
$patch$('set_number','target_reps','target_weight_kg','target_rir','actual_reps','actual_weight_kg','is_completed','notes','set_kind'))$patch$,
$patch$('set_number','target_reps','target_weight_kg','target_rir','actual_reps','actual_weight_kg','is_completed','notes'))$patch$,
  'public.save_workout_exercise · allowed keys');
  d := pg_temp.ownlevel_patch(d,
$patch$  v_has_completed boolean;
  v_set_kinds jsonb;
begin$patch$,
$patch$  v_has_completed boolean;
begin$patch$,
  'public.save_workout_exercise · declare');
  execute d;
end
$do$;

do $do$
declare d text := pg_get_functiondef('public.start_workout_session(uuid,uuid)'::regprocedure);
begin
  d := pg_temp.ownlevel_patch(d,
$patch$      actual_weight_kg = excluded.actual_weight_kg,
      set_kind = excluded.set_kind;

    perform$patch$,
$patch$      actual_weight_kg = excluded.actual_weight_kg;

    perform$patch$,
  'public.start_workout_session · conflict');
  d := pg_temp.ownlevel_patch(d,
$patch$      coalesce(res.target_weight_kg, e.peso_sugerido),
      coalesce(res.set_kind, 'work')
    from public.workout_session_exercises se$patch$,
$patch$      coalesce(res.target_weight_kg, e.peso_sugerido)
    from public.workout_session_exercises se$patch$,
  'public.start_workout_session · values');
  d := pg_temp.ownlevel_patch(d,
$patch$      target_reps, target_weight_kg, target_rir,
      actual_reps, actual_weight_kg, set_kind
    )$patch$,
$patch$      target_reps, target_weight_kg, target_rir,
      actual_reps, actual_weight_kg
    )$patch$,
  'public.start_workout_session · columns');
  execute d;
end
$do$;

do $do$
declare d text := pg_get_functiondef('public.mobile_start_workout_from_template(uuid,uuid)'::regprocedure);
begin
  d := pg_temp.ownlevel_patch(d,
$patch$      actual_weight_kg = excluded.actual_weight_kg,
      set_kind = excluded.set_kind;

    perform$patch$,
$patch$      actual_weight_kg = excluded.actual_weight_kg;

    perform$patch$,
  'public.mobile_start_workout_from_template · conflict');
  d := pg_temp.ownlevel_patch(d,
$patch$      res.target_weight_kg,
      coalesce(res.set_kind, 'work')
    from public.workout_session_exercises se$patch$,
$patch$      res.target_weight_kg
    from public.workout_session_exercises se$patch$,
  'public.mobile_start_workout_from_template · values');
  d := pg_temp.ownlevel_patch(d,
$patch$      target_reps, target_weight_kg, target_rir,
      actual_reps, actual_weight_kg, set_kind
    )$patch$,
$patch$      target_reps, target_weight_kg, target_rir,
      actual_reps, actual_weight_kg
    )$patch$,
  'public.mobile_start_workout_from_template · columns');
  execute d;
end
$do$;

do $do$
declare d text := pg_get_functiondef('public.finish_workout_session(uuid,jsonb)'::regprocedure);
begin
  d := pg_temp.ownlevel_patch(d,
$patch$          target_reps, target_weight_kg, target_rir, notes, set_kind)
        select v_user_id, v_relation_id, row_number() over(order by set_number)::integer,
          coalesce(actual_reps, target_reps), coalesce(actual_weight_kg, target_weight_kg), target_rir, notes, set_kind
$patch$,
$patch$          target_reps, target_weight_kg, target_rir, notes)
        select v_user_id, v_relation_id, row_number() over(order by set_number)::integer,
          coalesce(actual_reps, target_reps), coalesce(actual_weight_kg, target_weight_kg), target_rir, notes
$patch$,
  'public.finish_workout_session · addition');
  d := pg_temp.ownlevel_patch(d,
$patch$        ws.target_rir,
        ws.notes,
        ws.set_kind
      from public.workout_sets ws$patch$,
$patch$        ws.target_rir,
        ws.notes
      from public.workout_sets ws$patch$,
  'public.finish_workout_session · apply values');
  d := pg_temp.ownlevel_patch(d,
$patch$        target_reps, target_weight_kg, target_rir, notes, set_kind
      )
      select
        v_user_id, v_exercise.routine_exercise_id,$patch$,
$patch$        target_reps, target_weight_kg, target_rir, notes
      )
      select
        v_user_id, v_exercise.routine_exercise_id,$patch$,
  'public.finish_workout_session · apply columns');
  execute d;
end
$do$;

do $do$
declare d text := pg_get_functiondef('ownlevel_private.duplicate_training_routine(uuid,text,text,text,timestamptz,bigint)'::regprocedure);
begin
  d := pg_temp.ownlevel_patch(d,
$patch$target_rir, notes, set_kind)
      select v_uid, v_relation_id, set_number, target_reps, target_weight_kg, target_rir, notes, set_kind
$patch$,
$patch$target_rir, notes)
      select v_uid, v_relation_id, set_number, target_reps, target_weight_kg, target_rir, notes
$patch$,
  'ownlevel_private.duplicate_training_routine · copy');
  execute d;
end
$do$;

do $do$
declare d text := pg_get_functiondef('public.mobile_replace_training_routine_template(uuid,bigint,jsonb)'::regprocedure);
begin
  d := pg_temp.ownlevel_patch(d,
$patch$    set_item.value ->> 'notes',
    coalesce(set_item.value ->> 'setKind',
      v_set_kinds ->> (((item.value ->> 'routineExerciseId')::uuid)::text || ':' || (set_item.value ->> 'setNumber')), 'work')
  from pg_catalog.jsonb_array_elements(v_resolved) item(value)
  cross join$patch$,
$patch$    set_item.value ->> 'notes'
  from pg_catalog.jsonb_array_elements(v_resolved) item(value)
  cross join$patch$,
  'public.mobile_replace_training_routine_template · values');
  d := pg_temp.ownlevel_patch(d,
$patch$    target_reps, target_weight_kg, target_rir, notes, set_kind
  )
  select
    v_user_id,
    (item.value ->> 'routineExerciseId')::uuid,$patch$,
$patch$    target_reps, target_weight_kg, target_rir, notes
  )
  select
    v_user_id,
    (item.value ->> 'routineExerciseId')::uuid,$patch$,
  'public.mobile_replace_training_routine_template · columns');
  d := pg_temp.ownlevel_patch(d,
$patch$  -- #537: a client that does not send setKind (installed apps) keeps each set's kind by exercise and number.
  select coalesce(jsonb_object_agg(rs.routine_exercise_id::text || ':' || rs.set_number::text, rs.set_kind), '{}'::jsonb) into v_set_kinds
  from public.routine_exercise_sets rs
  where exists (
    select 1 from pg_catalog.jsonb_array_elements(v_resolved) item(value)
    where (item.value ->> 'routineExerciseId')::uuid = rs.routine_exercise_id
  );

  delete from public.routine_exercise_sets rs
  where exists ($patch$,
$patch$  delete from public.routine_exercise_sets rs
  where exists ($patch$,
  'public.mobile_replace_training_routine_template · keep kinds');
  d := pg_temp.ownlevel_patch(d,
$patch$        or pg_catalog.jsonb_typeof(v_set -> 'notes') not in ('string','null')
        or (v_set ? 'setKind' and coalesce(v_set ->> 'setKind', '') not in ('work','warmup')) then
        raise exception using errcode = '22023', message = 'Las series no son válidas.';$patch$,
$patch$        or pg_catalog.jsonb_typeof(v_set -> 'notes') not in ('string','null') then
        raise exception using errcode = '22023', message = 'Las series no son válidas.';$patch$,
  'public.mobile_replace_training_routine_template · kind check');
  d := pg_temp.ownlevel_patch(d,
$patch$'setNumber','targetReps','targetWeightKg','targetRir','notes','setKind'
        ]::text[]$patch$,
$patch$'setNumber','targetReps','targetWeightKg','targetRir','notes'
        ]::text[]$patch$,
  'public.mobile_replace_training_routine_template · allowed keys');
  d := pg_temp.ownlevel_patch(d,
$patch$AS $function$
declare
  v_set_kinds jsonb;
$patch$,
$patch$AS $function$
declare
$patch$,
  'public.mobile_replace_training_routine_template · declare');
  execute d;
end
$do$;

do $do$
declare d text := pg_get_functiondef('public.save_routine_exercise(uuid,jsonb)'::regprocedure);
begin
  d := pg_temp.ownlevel_patch(d,
$patch$    nullif(item.notes, ''),
    coalesce(v_set_kinds ->> item.set_number::text, 'work')
  from pg_catalog.jsonb_to_recordset$patch$,
$patch$    nullif(item.notes, '')
  from pg_catalog.jsonb_to_recordset$patch$,
  'public.save_routine_exercise · values');
  d := pg_temp.ownlevel_patch(d,
$patch$    target_reps, target_weight_kg, target_rir, notes, set_kind
  )
  select
    v_user_id, p_routine_exercise_id, item.set_number,$patch$,
$patch$    target_reps, target_weight_kg, target_rir, notes
  )
  select
    v_user_id, p_routine_exercise_id, item.set_number,$patch$,
  'public.save_routine_exercise · columns');
  d := pg_temp.ownlevel_patch(d,
$patch$  -- #537: the Web editor does not send set kinds; each set keeps its kind by number.
  select coalesce(jsonb_object_agg(set_number::text, set_kind), '{}'::jsonb) into v_set_kinds
  from public.routine_exercise_sets where routine_exercise_id = p_routine_exercise_id;
  delete from public.routine_exercise_sets
  where routine_exercise_id = p_routine_exercise_id;
$patch$,
$patch$  delete from public.routine_exercise_sets
  where routine_exercise_id = p_routine_exercise_id;
$patch$,
  'public.save_routine_exercise · keep kinds');
  d := pg_temp.ownlevel_patch(d,
$patch$  v_updated_at timestamptz;
  v_set_kinds jsonb;
begin$patch$,
$patch$  v_updated_at timestamptz;
begin$patch$,
  'public.save_routine_exercise · declare');
  execute d;
end
$do$;

drop function pg_temp.ownlevel_patch(text, text, text, text);

alter table public.workout_sets drop constraint if exists workout_sets_set_kind_check;
alter table public.workout_sets drop column if exists set_kind;
alter table public.routine_exercise_sets drop constraint if exists routine_exercise_sets_set_kind_check;
alter table public.routine_exercise_sets drop column if exists set_kind;
