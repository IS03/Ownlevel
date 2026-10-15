-- Rollback-only M9 EXPAND regression: run after mobile_meal_timing_expand.
begin;
insert into auth.users(id,email) values ('93000000-0000-4000-8000-000000000001','nutrition-m9@example.invalid'),('93000000-0000-4000-8000-000000000002','nutrition-m9-other@example.invalid');
select set_config('request.jwt.claims','{"sub":"93000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
set local role authenticated;
do $$
declare f jsonb; i jsonb; r record; r2 record; m public.meal_entries; s public.saved_meals; sel jsonb; preview record; expected_hash text; count_before int;
begin
 f:=jsonb_build_object('date','2026-10-14','title','QA M9','description',null,'calories',123,'proteinG',null,'carbsG',0.00::numeric(10,2),'fatG',null);
 i:=jsonb_build_object('operation','create','sourceDate','2026-10-14','mealId',null,'expectedUpdatedAt',null,'idempotencyKey','m9:legacy','fields',f,'forceDuplicate',false);
 -- The absent optional keys produce exactly the pre-EXPAND request hash.
 expected_hash:=encode(extensions.digest(convert_to(jsonb_build_object('operation','create','sourceDate','2026-10-14','mealId',null,'expectedUpdatedAt',null,'fields',f,'forceDuplicate',false)::text,'UTF8'),'sha256'),'hex');
 select * into r from public.mobile_mutate_manual_meal(i);
 if r.response_status<>201 then raise exception 'legacy create %',row_to_json(r); end if;
 -- Access to the private ledger is tested below under the owner role.
 select * into r2 from public.mobile_mutate_manual_meal(i);
 if not r2.replayed or r2.response_body<>r.response_body then raise exception 'legacy replay'; end if;
 select * into m from public.meal_entries where id=(r.response_body->>'mealId')::uuid;
 if m.final_protein_g is not null or m.final_carbs_g<>0 then raise exception 'null vs zero'; end if;

 f:=f||jsonb_build_object('title','QA ATOMIC','mealLabel','lunch','consumedAt','2026-10-14T13:40:00-03:00','saveToLibrary',true);
 i:=i||jsonb_build_object('idempotencyKey','m9:timed','fields',f);
 select * into r from public.mobile_mutate_manual_meal(i);
 if r.response_status<>201 then raise exception 'timed create %',row_to_json(r); end if;
 select * into m from public.meal_entries where id=(r.response_body->>'mealId')::uuid;
 if m.meal_label<>'lunch' or m.consumed_at<>'2026-10-14T16:40:00Z'::timestamptz then raise exception 'timing lost'; end if;
 select * into s from public.saved_meals where user_id=auth.uid() and name='QA ATOMIC';
 if s.id is null or s.protein_g is not null or s.carbs_g<>0 then raise exception 'atomic saved missing'; end if;
 select * into r2 from public.mobile_mutate_manual_meal(i);
 if not r2.replayed or r2.response_body<>r.response_body or (select count(*) from public.saved_meals where user_id=auth.uid() and name='QA ATOMIC')<>1 then raise exception 'atomic replay duplicated'; end if;
 select * into r2 from public.mobile_mutate_manual_meal(i||jsonb_build_object('fields',f||jsonb_build_object('mealLabel','dinner')));
 if r2.response_body->>'error'<>'IDEMPOTENCY_KEY_REUSED' then raise exception 'timing absent from hash'; end if;

 -- Duplicate and library-name conflicts are explicit; neither creates another occurrence.
 select count(*) into count_before from public.meal_entries where user_id=auth.uid();
 select * into r2 from public.mobile_mutate_manual_meal(i||jsonb_build_object('idempotencyKey','m9:duplicate'));
 if r2.response_body->>'error'<>'POSSIBLE_DUPLICATE' then raise exception 'duplicate lost'; end if;
 select * into r2 from public.mobile_mutate_manual_meal(i||jsonb_build_object('idempotencyKey','m9:name','forceDuplicate',true));
 if r2.response_body->>'error'<>'SAVED_NAME_EXISTS' or (select count(*) from public.meal_entries where user_id=auth.uid())<>count_before then raise exception 'partial atomic write'; end if;

 -- Old editors omit timing and preserve it; CAS remains authoritative for Undo.
 select * into r2 from public.mobile_mutate_manual_meal(jsonb_build_object('operation','edit','sourceDate','2026-10-14','mealId',m.id,'expectedUpdatedAt',m.updated_at,'idempotencyKey','m9:old-edit','fields',(f-'mealLabel'-'consumedAt'-'saveToLibrary')||jsonb_build_object('calories',124),'forceDuplicate',false));
 if r2.response_status<>200 then raise exception 'old edit %',row_to_json(r2); end if;
 if (select meal_label from public.meal_entries where id=m.id)<>'lunch' then raise exception 'old edit reset timing'; end if;
 select * into r2 from public.mobile_mutate_manual_meal(jsonb_build_object('operation','delete','sourceDate','2026-10-14','mealId',m.id,'expectedUpdatedAt',m.updated_at,'idempotencyKey','m9:undo-stale','fields',null,'forceDuplicate',false));
 if r2.response_body->>'error'<>'MEAL_CHANGED' then raise exception 'undo overwrote newer edit'; end if;

 -- Canonical quick selection carries timing through preview and the durable registration.
 sel:=jsonb_build_object('date','2026-10-14','source',jsonb_build_object('kind','saved','id',s.id,'version',public.mobile_quick_source_version(jsonb_build_object('saved',to_jsonb(s),'items','[]'::jsonb))),'quantities',null,'mealLabel','snack','consumedAt','2026-10-14T18:00:00-03:00');
 select * into preview from public.mobile_preview_quick_meal(sel);
 if preview.response_status<>200 or preview.response_body->'selection'->>'consumedAt'<>'2026-10-14T21:00:00.000Z' then raise exception 'quick preview %',row_to_json(preview); end if;
 i:=sel||jsonb_build_object('operation','register','idempotencyKey','m9:quick');
 select * into r from public.mobile_confirm_quick_meal(i);
 if r.response_status<>201 then raise exception 'quick create %',row_to_json(r); end if;
 if not exists(select 1 from public.meal_entries where id=(r.response_body->>'resourceId')::uuid and meal_label='snack' and consumed_at='2026-10-14T21:00:00Z') then raise exception 'quick timing lost'; end if;
 select * into r2 from public.mobile_confirm_quick_meal(i);
 if not r2.replayed or r2.response_body<>r.response_body then raise exception 'quick replay'; end if;
 select * into r2 from public.mobile_confirm_quick_meal(i||jsonb_build_object('consumedAt','2026-10-14T19:00:00-03:00'));
 if r2.response_body->>'error'<>'IDEMPOTENCY_KEY_REUSED' then raise exception 'quick hash ignores timing'; end if;
 -- Old selection normalization has no extra null/default keys.
 if public.mobile_normalize_quick_selection(sel-'mealLabel'-'consumedAt') <> sel-'mealLabel'-'consumedAt' then raise exception 'legacy quick hash changed'; end if;
 begin perform public.mobile_normalize_meal_timing(jsonb_build_object('consumedAt','2026-10-15T01:00:00Z'),'2026-10-15'); raise exception 'wrong local day accepted'; exception when sqlstate '22023' then null; end;
 begin perform public.mobile_normalize_meal_timing(jsonb_build_object('mealLabel','brunch'),'2026-10-14'); raise exception 'label accepted'; exception when sqlstate '22023' then null; end;
 begin perform public.mobile_mutate_manual_meal(jsonb_build_object('operation','create','sourceDate','2026-10-14','mealId',null,'expectedUpdatedAt',null,'idempotencyKey','m9:foreign','fields',f||jsonb_build_object('userId','93000000-0000-4000-8000-000000000002'),'forceDuplicate',false)); raise exception 'foreign key accepted'; exception when sqlstate '22023' then null; end;
end;
$$;
reset role;
do $$
declare actual text; expected text;
begin
 select request_hash into actual from public.mobile_idempotency_keys where user_id='93000000-0000-4000-8000-000000000001' and idempotency_key='m9:legacy';
 expected:=encode(extensions.digest(convert_to(jsonb_build_object('operation','create','sourceDate','2026-10-14','mealId',null,'expectedUpdatedAt',null,'fields',jsonb_build_object('date','2026-10-14','title','QA M9','description',null,'calories',123,'proteinG',null,'carbsG',0.00::numeric(10,2),'fatG',null),'forceDuplicate',false)::text,'UTF8'),'sha256'),'hex');
 if actual<>expected then raise exception 'legacy hash mismatch'; end if;
 if exists(select 1 from public.meal_entries where user_id='93000000-0000-4000-8000-000000000002') then raise exception 'foreign write'; end if;
 if has_function_privilege('anon','public.mobile_normalize_meal_timing(jsonb,date)','execute') then raise exception 'anon grant'; end if;
end;
$$;
rollback;
