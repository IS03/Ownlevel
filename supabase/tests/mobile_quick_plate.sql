-- Rollback-only regression for mobile_quick_plate_expand («Plato»). Synthetic user and foods only.
begin;
insert into auth.users(id,email) values ('94000000-0000-4000-8000-000000000001','nutrition-plate@example.invalid'),('94000000-0000-4000-8000-000000000002','nutrition-plate-other@example.invalid');
select set_config('request.jwt.claims','{"sub":"94000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
set local role authenticated;
do $$
declare bread public.foods; cheese public.foods; coffee public.foods; nodata public.foods; other_food uuid;
 sel jsonb; intent jsonb; r record; r2 record; m public.meal_entries; s public.saved_meals; p jsonb; legacy jsonb;
begin
 insert into public.foods(id,user_id,name,serving_quantity,serving_unit,calories,protein_g,carbs_g,fat_g)
 values('94000000-0000-4000-8000-0000000000b1',auth.uid(),'Pan lactal',1,'rebanada',65.5,2.2,12,0.8) returning * into bread;
 insert into public.foods(user_id,name,serving_quantity,serving_unit,calories,protein_g,carbs_g,fat_g)
 values(auth.uid(),'Queso crema',100,'g',220,6,4,20) returning * into cheese;
 -- Black coffee: a real 0 kcal, with unknown protein (missing, not zero).
 insert into public.foods(user_id,name,serving_quantity,serving_unit,calories,protein_g,carbs_g,fat_g)
 values(auth.uid(),'Café',1,'taza',0,null,0,0) returning * into coffee;
 insert into public.foods(user_id,name,serving_quantity,serving_unit,calories,protein_g,carbs_g,fat_g)
 values(auth.uid(),'Sin calorías cargadas',1,'unidad',null,1,1,1) returning * into nodata;

 sel:=jsonb_build_object('date','2026-11-20','mealLabel','snack','source',jsonb_build_object('kind','plate','title','  Merienda  ','saveToLibrary',false),
  'quantities',jsonb_build_array(
   jsonb_build_object('itemId',bread.id,'quantity',2,'version',public.mobile_quick_source_version(to_jsonb(bread))),
   jsonb_build_object('itemId',cheese.id,'quantity',30,'version',public.mobile_quick_source_version(to_jsonb(cheese)))));
 p:=public.mobile_resolve_quick_occurrence(sel,false);
 -- 2 × 65,5 = 131 kcal; 30 g of 220/100 g = 66 kcal. Order kept as built.
 if (p->'snapshot'->>'calories')::int<>197 or (p->'snapshot'->>'proteinG')::numeric<>6.2 or (p->'snapshot'->>'fatG')::numeric<>7.6
  or p->'snapshot'->>'title'<>'MERIENDA' or p->'snapshot'->>'contextType'<>'food_plate'
  or p->'snapshot'->>'description'<>'2 REBANADA PAN LACTAL · 30 G QUESO CREMA' or p->'items'->0->>'id'<>bread.id::text then raise exception 'plate preview %',p; end if;

 -- A 0 kcal food is admitted; its unknown protein makes the plate protein unknown (never 0).
 p:=public.mobile_resolve_quick_occurrence(jsonb_set(sel,'{quantities}',(sel->'quantities')||jsonb_build_array(jsonb_build_object('itemId',coffee.id,'quantity',1,'version',public.mobile_quick_source_version(to_jsonb(coffee))))),false);
 if (p->'snapshot'->>'calories')::int<>197 or p->'snapshot'->'proteinG'<>'null'::jsonb or (p->'snapshot'->>'carbsG')::numeric<>25.2 then raise exception 'zero kcal / missing protein %',p->'snapshot'; end if;

 -- Only 0 kcal in total, or a food with unknown calories: not registrable.
 select * into r from public.mobile_preview_quick_meal(jsonb_set(sel,'{quantities}',jsonb_build_array(jsonb_build_object('itemId',coffee.id,'quantity',1,'version',public.mobile_quick_source_version(to_jsonb(coffee))))));
 if r.response_status<>409 or r.response_body->>'error'<>'QUICK_SOURCE_UNUSABLE' then raise exception 'zero plate %',row_to_json(r); end if;
 select * into r from public.mobile_preview_quick_meal(jsonb_set(sel,'{quantities}',jsonb_build_array(jsonb_build_object('itemId',nodata.id,'quantity',1,'version',public.mobile_quick_source_version(to_jsonb(nodata))))));
 if r.response_status<>409 or r.response_body->>'error'<>'QUICK_SOURCE_UNUSABLE' then raise exception 'unknown kcal %',row_to_json(r); end if;

 -- A food edited after the person saw it: changed, nothing written.
 select * into r from public.mobile_preview_quick_meal(jsonb_set(sel,'{quantities,1,version}',to_jsonb(repeat('a',64))));
 if r.response_status<>409 or r.response_body->>'error'<>'QUICK_SOURCE_CHANGED' then raise exception 'cas %',row_to_json(r); end if;

 -- Invalid shapes: 3 decimals, duplicates, saving without a name.
 begin perform public.mobile_normalize_quick_selection(jsonb_set(sel,'{quantities,0,quantity}','0.125')); raise exception 'three decimals accepted';
 exception when sqlstate '22023' then null; end;
 begin perform public.mobile_normalize_quick_selection(jsonb_set(sel,'{quantities}',jsonb_build_array(sel->'quantities'->0,sel->'quantities'->0))); raise exception 'duplicate accepted';
 exception when sqlstate '22023' then null; end;
 begin perform public.mobile_normalize_quick_selection(jsonb_set(sel,'{source}','{"kind":"plate","title":" ","saveToLibrary":true}')); raise exception 'nameless save accepted';
 exception when sqlstate '22023' then null; end;

 -- Register: one meal with the totals; replay is the same receipt and no second row.
 intent:=sel||jsonb_build_object('operation','register','idempotencyKey','plate:1');
 select * into r from public.mobile_confirm_quick_meal(intent);
 if r.response_status<>201 then raise exception 'register %',row_to_json(r); end if;
 select * into m from public.meal_entries where id=(r.response_body->>'resourceId')::uuid;
 if m.final_calories<>197 or m.title<>'MERIENDA' or m.meal_label<>'snack' or m.context_type<>'food_plate' then raise exception 'meal row'; end if;
 select * into r2 from public.mobile_confirm_quick_meal(intent);
 if not r2.replayed or r2.response_body<>r.response_body then raise exception 'replay'; end if;
 if (select count(*) from public.saved_meals where user_id=auth.uid())<>0 then raise exception 'saved without asking'; end if;

 -- Save for later: the composite saved meal and its items come with the meal.
 intent:=jsonb_set(sel,'{source,saveToLibrary}','true')||jsonb_build_object('operation','register','idempotencyKey','plate:2');
 select * into r from public.mobile_confirm_quick_meal(intent);
 if r.response_status<>201 then raise exception 'register + save %',row_to_json(r); end if;
 select * into s from public.saved_meals where user_id=auth.uid() and name='MERIENDA';
 if s.template_type<>'composite' or s.calories<>197
  or (select count(*) from public.saved_meal_items where saved_meal_id=s.id)<>2
  or (select source_food_id from public.saved_meal_items where saved_meal_id=s.id and position=1)<>cheese.id then raise exception 'saved composite'; end if;
 -- And the saved plate is itself registrable from Rápido.
 p:=public.mobile_resolve_quick_occurrence(jsonb_build_object('date','2026-11-20','source',jsonb_build_object('kind','saved','id',s.id,'version',
  public.mobile_quick_source_version(jsonb_build_object('saved',to_jsonb(s),'items',(select jsonb_agg(to_jsonb(i) order by i.position,i.id) from public.saved_meal_items i where i.saved_meal_id=s.id)))),'quantities',null),false);
 if (p->'snapshot'->>'calories')::int<>197 then raise exception 'saved plate not registrable %',p; end if;

 -- Same name again: nothing at all is written (no meal, no saved meal).
 intent:=jsonb_set(intent,'{idempotencyKey}','"plate:3"');
 select * into r from public.mobile_confirm_quick_meal(intent);
 if r.response_status<>409 or r.response_body->>'error'<>'SAVED_NAME_EXISTS' then raise exception 'name conflict %',row_to_json(r); end if;
 if (select count(*) from public.meal_entries where user_id=auth.uid())<>2 or (select count(*) from public.saved_meals where user_id=auth.uid())<>1 then raise exception 'conflict wrote something'; end if;

 -- Other kinds normalize exactly as before (their request hash does not change).
 legacy:=jsonb_build_object('date','2026-11-20','source',jsonb_build_object('kind','food','id',bread.id,'version',repeat('b',64)),'quantities',jsonb_build_array(jsonb_build_object('itemId',bread.id,'quantity',0.125)));
 if public.mobile_normalize_quick_selection(legacy)<>jsonb_build_object('date','2026-11-20','source',jsonb_build_object('kind','food','id',bread.id,'version',repeat('b',64)),'quantities',jsonb_build_array(jsonb_build_object('itemId',bread.id,'quantity',0.125::numeric(12,3)))) then raise exception 'legacy normalization changed'; end if;
end $$;

-- Another person cannot use these foods: unavailable, nothing registered.
select set_config('request.jwt.claims','{"sub":"94000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$
declare r record;
begin
 select * into r from public.mobile_confirm_quick_meal(jsonb_build_object('date','2026-11-20','operation','register','idempotencyKey','plate:other',
  'source',jsonb_build_object('kind','plate','title','Ajeno','saveToLibrary',false),
  'quantities',jsonb_build_array(jsonb_build_object('itemId','94000000-0000-4000-8000-0000000000b1','quantity',1,'version',repeat('c',64)))));
 if r.response_status<>409 or r.response_body->>'error'<>'QUICK_SOURCE_UNAVAILABLE' then raise exception 'other user %',row_to_json(r); end if;
 if exists(select 1 from public.meal_entries where user_id=auth.uid()) then raise exception 'other user wrote'; end if;
end $$;
rollback;
